/**
 * Interface — OHLCV backfill VPS lifecycle routes (Stage 3 of server.ts staged extraction)
 *
 * Extracted from server.ts (~lines 1231–1552 pre-extraction)
 * (docs/architecture-briefs/2026-07-04-server-ts-staged-extraction.md §4 Stage 3).
 *
 * Routes:
 *   POST /api/push-ohlcv-history    — VPS one-time OHLCV history backfill push
 *   GET  /api/ohlcv-backfill-queue  — VPS polls for pending backfill (Task 1361)
 *   POST /api/ohlcv-backfill-done   — VPS signals backfill complete (Task 1361 / SUBTASK-B)
 *   GET  /api/ohlcv-codes           — full daily_ohlcv traded-code universe (FIX-FOREIGN-FLOW-COVERAGE)
 *
 * FIX-FOREIGN-FLOW-COVERAGE (2026-07-10): handleOhlcvCodes implements the endpoint that
 * vps-scripts/fetch-ohlcv-backfill.sh's R-2 fallback chain already expected ("Try
 * /api/ohlcv-codes first ... fall back to /api/watchlist") but which had never actually been
 * wired server-side — confirmed dormant 404 in docs/vps-sources/ohlcv-backfill-pipeline-stall/
 * recon.md ("/api/ohlcv-codes not available (HTTP 000000), falling back to /api/watchlist").
 * Now also consumed by vps-scripts/fetch-foreign-flow.sh so foreign-flow coverage tracks the
 * full daily_ohlcv traded universe (~1459 codes live) instead of the fixed 111-code
 * watchlist+referenceStocks subset served by /api/watchlist (docs/handoffs/
 * AUDIT-FC-FOREIGN-FLOW-recon.md). Generic — SELECT DISTINCT code FROM daily_ohlcv, no
 * per-ticker allowlisting, no hardcoded code list.
 *
 * CONTAM-10-WRITER-H (2026-07-08): handlePushOhlcvHistory now routes through
 * writeOhlcvBatch (application/usecases/ohlcvWriteService.ts, conflictStrategy:
 * "backfill") instead of a raw INSERT...ON CONFLICT DO UPDATE. The raw INSERT used
 * to call validateOhlcvUnit directly on un-normalized values — a naive per-row range
 * check that whole-row thousand-scale bars (e.g. open=131/close=130 for a stock that
 * trades near 130,000 VND) pass undetected. writeOhlcvBatch additionally runs
 * normalizeOhlcvToVnd + detectAndNormalizeScaleFromPrevClose (cross-day + cleanRef
 * scale guard) ahead of validateOhlcvUnit, closing that leak. See
 * docs/handoffs/CONTAM-10-WRITER-H.md.
 *
 * R-5 retry-storm cap semantics (dedup/cooldown/threshold) inside handleOhlcvBackfillDone
 * are preserved verbatim: retry_count read from the last done row, escalate to
 * `sendTelegramBug` only when currentRetryCount >= 5, otherwise re-queue with an
 * incremented retry_count.
 *
 * ALPHA-S1-OHLCV-BACKFILL-DONE-BUG (2026-07-13): handleOhlcvBackfillDone used to mark
 * ohlcv_backfill_queue rows done=1 REGARDLESS of bars_pushed_total, so a crashed/zero-insert
 * universe backfill run was silently recorded identically to a healthy one (457+ historical
 * rows done-with-zero-bars per docs/architecture-briefs/2026-07-11-data-strategy-selection.md
 * gap #6 — degrades ALPHA-S3 cross-sectional z-scores, corroborated by BUG id3564). Fix: added
 * nullable ohlcv_backfill_queue.bars_inserted column (schema-market-data.ts) + an inserted-count
 * verification step that fires BEFORE the existing depth probe — barsPushedTotal===null (no
 * authoritative report ever landed) or ===0 (script ran, inserted nothing) both re-queue via a
 * NEW row (reusing the R-5 retry/escalate ladder) instead of silently accepting the close. The
 * two checks are mutually exclusive per call (depth-probe skipped when insert-verification
 * already fired) to avoid a double re-queue/double Telegram alert for the same underlying
 * event. `done` still flips unconditionally on every call — preserves vn-ohlcv-backfill.timer's
 * poller's documented "regardless of exit code" unblock contract; the fix re-queues via a new
 * row rather than gating the original row's `done`. Design: docs/handoffs/ALPHA-S1-architect-design.md §3.
 *
 * FIX-OHLCV-DEPTH-ALERT-HONEST-GAP-SUPPRESS (2026-07-17): the R-5 retry ladder above was
 * re-firing a false "no completion / manual VPS investigation" BUG roughly every cron cycle.
 * Two compounding root causes, both fixed here:
 *   (1) step-2 null-accounting misread an empty-body idempotent ack (the poll script's own
 *       unconditional "regardless of exit code" trailing POST — vps-scripts/ohlcv-backfill-poll.sh
 *       lines ~71-77) as a crash, even when the serving-plane depth was actually healthy. Fixed:
 *       the null case now cross-checks the same honest-gap-aware shallow-code list computed for
 *       step 3 before escalating/re-queuing — a benign trailing ack while real (non-honest-gap)
 *       coverage is >= the floor is logged and ignored, not treated as "no completion report."
 *   (2) step-3's depth-shortfall re-queue (and the scheduler's own gapTickers depth-gap trigger in
 *       ohlcvHistoryBackfillJob.ts) never excluded permanently-empty/long-delisted "honest gap"
 *       codes (RAW-verified: BDI, DLC, JSH, SIS, VDC — 0 bars ever or years-stale), which can NEVER
 *       reach the depth floor and so re-triggered the queue forever. Fixed via the data-driven
 *       isHonestGapCode predicate (domain/services/market-data/ohlcvGapClassifier.ts) — NEVER a
 *       hardcoded ticker list, and NEVER applied to VNINDEX (always-traded benchmark; a stalled
 *       VNINDEX is a real failure, not an honest gap).
 * This is a SUPPRESS-ONLY fix (stop the false alarm + the forever-requeue) — the underlying OHLCV
 * data is healthy; no VPS-side change is required or made.
 *
 * DI contract: db + log are injected by the caller (server.ts handleRequest).
 * No getDb() calls here.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import type { createLogger } from "../../../infrastructure/logger.js";
import { requireVpsApiKey } from "./_shared/requireVpsApiKey.js";
import { sendTelegramBug } from "../../../infrastructure/notifiers/telegram.js";
import {
  writeOhlcvBatch,
  type OhlcvWriteRow,
} from "../../../application/usecases/ohlcvWriteService.js";
import { isHonestGapCode } from "../../../domain/services/market-data/ohlcvGapClassifier.js";

type Logger = ReturnType<typeof createLogger>;

// ── POST /api/push-ohlcv-history ────────────────────────────────────────────
// Push OHLCV history from VPS one-time backfill script

export async function handlePushOhlcvHistory(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  log: Logger,
): Promise<void> {
  if (!requireVpsApiKey(req, res)) return;

  let body = "";
  for await (const chunk of req) body += chunk;
  try {
    const parsed: unknown = JSON.parse(body);
    const payload = parsed as Record<string, unknown>;

    if (typeof payload.code !== "string" || !payload.code) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing required field: code (string)" }));
      return;
    }

    if (!Array.isArray(payload.bars)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing required field: bars (array)" }));
      return;
    }

    const code = payload.code;
    const bars = payload.bars as Record<string, unknown>[];
    // FR-B1: extract type from payload (default "stock" for backward compat).
    // Zone A pushes VNINDEX with type:"index"; "index" exempts from stock range guard.
    const type: "stock" | "index" =
      (typeof payload.type === "string" && payload.type === "index") ? "index" : "stock";

    if (bars.length === 0) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, inserted: 0, code }));
      return;
    }

    // TASK-OHLCV-WIC-2: parse-and-reject pre-pass for all OHLCV fields (preserved
    // verbatim by CONTAM-10-WRITER-H). Accept number or numeric string; reject row
    // if NaN or ≤ 0. Never default high/low to open — that silently bypasses
    // validateOhlcvUnit Rule 5. Builds the OhlcvWriteRow[] input for writeOhlcvBatch.
    const rows: OhlcvWriteRow[] = [];
    let skipped = 0;
    for (const bar of bars) {
      const open  = typeof bar.open  === "number" ? bar.open  : (typeof bar.open  === "string" ? parseFloat(bar.open)  : NaN);
      const close = typeof bar.close === "number" ? bar.close : (typeof bar.close === "string" ? parseFloat(bar.close) : NaN);
      if (Number.isNaN(open) || open <= 0 || Number.isNaN(close) || close <= 0) { skipped++; continue; }

      const date = typeof bar.date === "string" ? bar.date : "";

      // Parse high, low with validation — REJECT ROW if NaN or ≤ 0 (do NOT default to open).
      const high_parsed = typeof bar.high === "number" ? bar.high : (typeof bar.high === "string" ? parseFloat(bar.high) : NaN);
      const low_parsed  = typeof bar.low  === "number" ? bar.low  : (typeof bar.low  === "string" ? parseFloat(bar.low)  : NaN);
      if (Number.isNaN(high_parsed) || high_parsed <= 0 || Number.isNaN(low_parsed) || low_parsed <= 0) { skipped++; continue; }

      const high   = high_parsed;
      const low    = low_parsed;
      const volume = typeof bar.volume === "number" ? bar.volume : 0;

      rows.push({ code, date, open, high, low, close, volume, type });
    }

    // CONTAM-10-WRITER-H: route through the SSOT writer choke-point (writeOhlcvBatch)
    // instead of a raw INSERT...ON CONFLICT DO UPDATE. The old raw INSERT bypassed
    // the CONTAM-10-WRITER cross-day scale guard: whole-row thousand-scale bars
    // (e.g. open=131/close=130 for a stock that trades near 130,000 VND) pass a
    // naive per-row range check (>=100) yet are wrong-scale versus history. This
    // route (the VPS backfill queue poller, ~15–30 min cadence) was the actively
    // reproducing leak (6,533 rows / 27 tickers as of 2026-07-07 — see
    // docs/handoffs/CONTAM-10-WRITER-H.md). conflictStrategy:"backfill" preserves
    // the prior overwrite semantics exactly: unconditional overwrite of
    // open/high/low/close/volume/updated_at; foreign-flow columns untouched.
    const writeResult = await writeOhlcvBatch(rows, db, { conflictStrategy: "backfill" });
    const inserted = writeResult.written;
    skipped += writeResult.skipped + writeResult.rejected.length;

    if (writeResult.rejected.length > 0) {
      log.error("[push-ohlcv-history] rows rejected by writer guard", {
        code,
        count: writeResult.rejected.length,
        samples: writeResult.rejected.slice(0, 3),
      });
    }

    log.info("[push-ohlcv-history] inserted bars", { code, count: inserted, skipped });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, inserted, skipped, code }));
  } catch (err) {
    log.error("[push-ohlcv-history] parse error", { error: err instanceof Error ? err.message : String(err) });
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON" }));
  }
  return;
}

// ── GET /api/ohlcv-backfill-queue ───────────────────────────────────────────
// Task 1361: VPS polls for pending backfill

export async function handleOhlcvBackfillQueue(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  log: Logger,
): Promise<void> {
  if (!requireVpsApiKey(req, res)) return;

  try {
    const row = db.prepare<{ id: number }, []>(
      "SELECT id FROM ohlcv_backfill_queue WHERE done = 0 LIMIT 1"
    ).get();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ pending: row !== null }));
  } catch (err) {
    log.error("[ohlcv-backfill-queue] error", { error: err instanceof Error ? err.message : String(err) });
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Server error" }));
  }
  return;
}

// ── POST /api/ohlcv-backfill-done ───────────────────────────────────────────
// Task 1361 / SUBTASK-B: VPS signals backfill complete.
// Accepts optional body: {"bars_pushed_total": N}
// Poll script secondary call sends empty body — idempotent (marks done=1 again, depth probe
// runs again; if already ≥252 bars no re-queue). R-5 retry-storm cap: retry_count ≥ 5 → BUG.

export async function handleOhlcvBackfillDone(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  log: Logger,
): Promise<void> {
  if (!requireVpsApiKey(req, res)) return;

  // Parse optional body — empty body / missing field → null (idempotent path)
  let bodyStr = "";
  for await (const chunk of req) bodyStr += chunk;
  let barsPushedTotal: number | null = null;
  try {
    if (bodyStr.trim()) {
      const parsed = JSON.parse(bodyStr) as { bars_pushed_total?: unknown };
      if (typeof parsed?.bars_pushed_total === "number") {
        barsPushedTotal = parsed.bars_pushed_total;
      }
    }
  } catch { /* empty body or non-JSON — treat as null (idempotent secondary poll) */ }

  try {
    // 1. Mark all pending queue rows done, recording the authoritative bars_inserted
    //    value (NULL for a blind/empty-body poller ack — never conflated with a real 0).
    //    done=1 still flips unconditionally: vn-ohlcv-backfill.timer's poller call is
    //    documented "regardless of exit code" so the systemd oneshot never blocks — the
    //    ALPHA-S1-OHLCV-BACKFILL-DONE-BUG fix re-queues via a NEW row (step 2 below)
    //    instead of gating this flip, preserving that unblock contract exactly.
    //    FIX-OHLCV-DEPTH-ALERT-HONEST-GAP-SUPPRESS: COALESCE so a real non-null count
    //    already recorded on this row can never be clobbered back to NULL.
    const closeResult = db
      .prepare("UPDATE ohlcv_backfill_queue SET done = 1, bars_inserted = COALESCE(?, bars_inserted) WHERE done = 0")
      .run(barsPushedTotal);
    log.info("[ohlcv-backfill-done] marked done", { barsPushedTotal, rowsClosed: closeResult.changes });

    // FIX-OHLCV-DEPTH-ALERT-HONEST-GAP-SUPPRESS: compute the honest-gap-aware shallow
    // code list ONCE, up front — shared by the step-2 null cross-check below AND the
    // step-3 depth-shortfall re-queue further below, so the two can never disagree about
    // what counts as a real (recoverable) shortfall vs. a permanently-empty/long-delisted
    // "honest gap" code (RAW-verified example set: BDI, DLC, JSH, SIS, VDC). VNINDEX is
    // NEVER honest-gap-excluded — it is a mandatory always-traded benchmark.
    const DEPTH_FLOOR = 252;
    const shallowCodes: { code: string; cnt: number }[] = [];
    let watchlistCount = 0;
    let vnindexDepth = 0;
    let honestGapExcludedCount = 0;
    let depthProbeOk = true;
    try {
      const todayIso = new Date().toISOString().slice(0, 10);
      const depthRows = db.prepare<{ code: string; cnt: number; maxDate: string | null }, []>(`
        SELECT w.code, COUNT(d.code) AS cnt, MAX(d.date) AS maxDate
        FROM watchlist w
        LEFT JOIN daily_ohlcv d ON d.code = w.code
        GROUP BY w.code
      `).all();
      watchlistCount = depthRows.length;

      // FR-B2: check VNINDEX depth separately (not in watchlist; required by TA svc for RS)
      const vnidxRow = db.prepare<{ cnt: number }, []>(
        "SELECT COUNT(*) AS cnt FROM daily_ohlcv WHERE code = 'VNINDEX'"
      ).get();
      vnindexDepth = vnidxRow?.cnt ?? 0;

      for (const r of depthRows) {
        if (r.cnt >= DEPTH_FLOOR) continue;
        if (isHonestGapCode({ count: r.cnt, maxDate: r.maxDate }, todayIso)) {
          honestGapExcludedCount++;
          continue;
        }
        shallowCodes.push({ code: r.code, cnt: r.cnt });
      }
      if (vnindexDepth < DEPTH_FLOOR) {
        shallowCodes.push({ code: "VNINDEX", cnt: vnindexDepth });
      }
    } catch (depthErr) {
      // Depth probe is advisory — being unable to verify serving-plane health means we
      // also cannot rule out a real crash, so the null-case check below falls back to
      // the conservative (pre-fix) behavior rather than silently assuming health.
      depthProbeOk = false;
      log.warn("[ohlcv-backfill-done] depth probe failed (non-fatal)", {
        error: depthErr instanceof Error ? depthErr.message : String(depthErr),
      });
    }

    // 2. ALPHA-S1-OHLCV-BACKFILL-DONE-BUG — inserted-count verification (fail-loud, not a
    //    silent success). closeResult.changes > 0 means THIS call is the one that actually
    //    closed a pending row (not a redundant idempotent ack finding nothing pending).
    //    barsPushedTotal===0 (script ran but the universe fetch genuinely inserted nothing)
    //    is always a real failure state.
    //    FIX-OHLCV-DEPTH-ALERT-HONEST-GAP-SUPPRESS: barsPushedTotal===null used to be
    //    treated identically to a genuine crash unconditionally — but an empty-body ack is
    //    exactly what ohlcv-backfill-poll.sh's own unconditional "regardless of exit code"
    //    trailing POST sends, which can fire right after fetch-ohlcv-backfill.sh's own
    //    completion POST already recorded a real bars_pushed_total on a different
    //    (re-queued) row. Cross-check the serving plane (shallowCodes, honest-gap-excluded)
    //    before crying crash: only escalate the null case when a REAL (non-honest-gap)
    //    shortfall exists or the probe itself failed.
    let insertVerificationFailed = false;
    if (
      closeResult.changes > 0 &&
      (barsPushedTotal === 0 || (barsPushedTotal === null && (!depthProbeOk || shallowCodes.length > 0)))
    ) {
      insertVerificationFailed = true;
      const lastRow = db
        .prepare<{ retry_count: number }, []>(
          "SELECT retry_count FROM ohlcv_backfill_queue WHERE done = 1 ORDER BY id DESC LIMIT 1",
        )
        .get();
      const currentRetryCount = lastRow?.retry_count ?? 0;
      const reason =
        barsPushedTotal === null
          ? "no completion report received (fetch-ohlcv-backfill.sh likely crashed/DNS-failed before reporting — poller force-closed the queue row)"
          : "fetch-ohlcv-backfill.sh reported 0 bars inserted across all tickers";

      if (currentRetryCount >= 5) {
        // R-5 cap: too many retries — escalate to BUG, do NOT re-queue
        log.error("[ohlcv-backfill-done] insert-count retry cap reached (>=5), escalating to BUG", {
          retry_count: currentRetryCount,
          reason,
        });
        void sendTelegramBug(
          `[OHLCV-BACKFILL] ${reason}, after ${currentRetryCount} retries. Manual VPS investigation required.`,
        );
      } else {
        // Re-queue with incremented retry_count for next VPS poll cycle (30-min systemd timer)
        const nextRetryCount = currentRetryCount + 1;
        db.prepare(
          "INSERT INTO ohlcv_backfill_queue (queued_at, done, retry_count) VALUES (datetime('now'), 0, ?)",
        ).run(nextRetryCount);
        log.warn("[ohlcv-backfill-done] insert-count verification failed — re-queued", {
          retry_count: nextRetryCount,
          reason,
        });
      }
    } else if (closeResult.changes > 0 && barsPushedTotal === null) {
      log.info(
        "[ohlcv-backfill-done] empty-body ack ignored — serving-plane depth healthy (non-honest-gap coverage >= floor), not treated as a crash",
        { watchlist_count: watchlistCount, vnindex_depth: vnindexDepth, honest_gap_excluded: honestGapExcludedCount },
      );
    }

    // 3. Depth probe — verify watchlist+VNINDEX code coverage against the 252-bar floor,
    //    excluding honest-gap codes (shallowCodes computed once above, before step 2).
    //    Skipped when step 2 already re-queued/escalated this cycle — a depth-shortfall
    //    diagnostic is meaningless when the underlying run couldn't be verified to have
    //    inserted anything, and running both would double-fire (duplicate re-queue row +
    //    duplicate Telegram alert for the same underlying event).
    if (!insertVerificationFailed && depthProbeOk) try {
      if (shallowCodes.length === 0) {
        log.info("[ohlcv-backfill-done] depth verified: all non-honest-gap watchlist/VNINDEX codes >=252 bars", {
          watchlist_count: watchlistCount,
          vnindex_depth: vnindexDepth,
          honest_gap_excluded: honestGapExcludedCount,
        });
      } else {
        const shallowList = shallowCodes.map((r) => `${r.code}:${r.cnt}`).join(", ");
        log.warn("[ohlcv-backfill-done] depth shortfall detected", {
          shallow_count: shallowCodes.length,
          codes: shallowList,
          depth_floor: DEPTH_FLOOR,
          honest_gap_excluded: honestGapExcludedCount,
        });

        // Retry-storm cap check (R-5): read retry_count of last done row
        const lastRow = db.prepare<{ retry_count: number }, []>(
          "SELECT retry_count FROM ohlcv_backfill_queue WHERE done = 1 ORDER BY id DESC LIMIT 1"
        ).get();
        const currentRetryCount = lastRow?.retry_count ?? 0;

        if (currentRetryCount >= 5) {
          // R-5 cap: too many retries — escalate to BUG, do NOT re-queue
          log.error("[ohlcv-backfill-done] retry cap reached (>=5), escalating to BUG", {
            retry_count: currentRetryCount,
            shallow_codes: shallowList,
          });
          void sendTelegramBug(
            `[OHLCV-DEPTH] VPS backfill stalled after ${currentRetryCount} retries.\n` +
            `Shallow codes (< ${DEPTH_FLOOR} bars): ${shallowList}.\n` +
            `Manual VPS investigation required.`
          );
        } else {
          // Re-queue with incremented retry_count for next VPS poll cycle
          const nextRetryCount = currentRetryCount + 1;
          db.prepare(
            "INSERT INTO ohlcv_backfill_queue (queued_at, done, retry_count) VALUES (datetime('now'), 0, ?)"
          ).run(nextRetryCount);
          log.info("[ohlcv-backfill-done] re-queued backfill due to depth shortfall", {
            retry_count: nextRetryCount,
            shallow_codes: shallowList,
          });
        }
      }
    } catch (depthActionErr) {
      // Depth-based re-queue/escalate is advisory — do not fail the HTTP response if it errors
      log.warn("[ohlcv-backfill-done] depth-based re-queue/escalate failed (non-fatal)", {
        error: depthActionErr instanceof Error ? depthActionErr.message : String(depthActionErr),
      });
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  } catch (err) {
    log.error("[ohlcv-backfill-done] error", { error: err instanceof Error ? err.message : String(err) });
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Server error" }));
  }
  return;
}

// ── GET /api/ohlcv-codes ────────────────────────────────────────────────────
// FIX-FOREIGN-FLOW-COVERAGE: returns the full daily_ohlcv traded-code universe
// (SELECT DISTINCT code, sorted). Generic — tracks whatever daily_ohlcv actually
// contains, no per-ticker allowlisting, no hardcoded code list. Consumed by
// vps-scripts/fetch-foreign-flow.sh (CODES source, replacing the 111-code
// watchlist+referenceStocks subset) and vps-scripts/fetch-ohlcv-backfill.sh
// (R-2 fallback chain — this was the endpoint that chain already expected).

export async function handleOhlcvCodes(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  log: Logger,
): Promise<void> {
  if (!requireVpsApiKey(req, res)) return;

  try {
    const rows = db
      .prepare<{ code: string }, []>("SELECT DISTINCT code FROM daily_ohlcv ORDER BY code")
      .all();
    const codes = rows.map((r) => r.code);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ codes, count: codes.length }));
  } catch (err) {
    log.error("[ohlcv-codes] query error", { error: err instanceof Error ? err.message : String(err) });
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Server error" }));
  }
  return;
}
