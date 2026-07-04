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
 *
 * `validateOhlcvUnit` (CONTAM-3 unit guard) is a pre-existing shared domain module
 * (`domain/services/market-data/ohlcvUnitGuard.ts`) already imported by several other
 * call sites (ohlcvWriteService, ohlcvSanityCheckJob, priceBackfillService, ohlcvBackfill,
 * pushPricesHandler) — it is NOT defined in server.ts, so this file just re-imports it
 * from the same domain module rather than duplicating or relocating it.
 *
 * R-5 retry-storm cap semantics (dedup/cooldown/threshold) inside handleOhlcvBackfillDone
 * are preserved verbatim: retry_count read from the last done row, escalate to
 * `sendTelegramBug` only when currentRetryCount >= 5, otherwise re-queue with an
 * incremented retry_count.
 *
 * DI contract: db + log are injected by the caller (server.ts handleRequest).
 * No getDb() calls here.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import type { createLogger } from "../../../infrastructure/logger.js";
import { requireVpsApiKey } from "./_shared/requireVpsApiKey.js";
import { validateOhlcvUnit } from "../../../domain/services/market-data/ohlcvUnitGuard.js";
import { sendTelegramBug } from "../../../infrastructure/notifiers/telegram.js";

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

    const now = new Date().toISOString();
    // DPI-4 R-1 race fix: replaced INSERT OR REPLACE (row-destructive DELETE+INSERT)
    // with ON CONFLICT DO UPDATE SET to preserve foreign flow columns written by
    // ohlcvForeignFlowStore (stub rows from DPI-4 UPSERT must survive real OHLCV push).
    const stmt = db.prepare(`
      INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(code, date) DO UPDATE SET
        open       = excluded.open,
        high       = excluded.high,
        low        = excluded.low,
        close      = excluded.close,
        volume     = excluded.volume,
        updated_at = excluded.updated_at
    `);

    let inserted = 0;
    let skipped = 0;
    const upsertAll = db.transaction(() => {
      for (const bar of bars) {
        // TASK-OHLCV-WIC-2: parse-and-reject for all OHLCV fields.
        // Accept number or numeric string; reject row if NaN or ≤ 0.
        // Never default high/low to open — that silently bypasses validateOhlcvUnit Rule 5.
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

        // CONTAM-3: unit guard — reject bars that are not full-VND scale.
        // FR-B1: type from payload ("stock" default, "index" for VNINDEX); index exempt from
        // stock range guard. Guard fails loud (log.error + skip) but never throws (HTTP 200).
        try {
          const guardResult = validateOhlcvUnit(code, type, open, high, low, close);
          if (!guardResult.valid) {
            log.error("[push-ohlcv-history] unit guard rejected", { code, date, reason: guardResult.reason });
            skipped++;
            continue;
          }
        } catch (guardErr) {
          log.error("[push-ohlcv-history] unit guard threw", { code, date, error: guardErr instanceof Error ? guardErr.message : String(guardErr) });
          skipped++;
          continue;
        }

        stmt.run(code, date, open, high, low, close, volume, now);
        inserted++;
      }
    });
    upsertAll();

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
    // 1. Mark all pending queue rows done
    db.prepare("UPDATE ohlcv_backfill_queue SET done = 1 WHERE done = 0").run();
    log.info("[ohlcv-backfill-done] marked done", { barsPushedTotal });

    // 2. Depth probe — verify watchlist code coverage against 252-bar floor
    //    FR-B2: also verify VNINDEX depth (benchmark ticker — not in watchlist table)
    const DEPTH_FLOOR = 252;
    try {
      const depthRows = db.prepare<{ code: string; cnt: number }, []>(`
        SELECT w.code, COUNT(d.code) AS cnt
        FROM watchlist w
        LEFT JOIN daily_ohlcv d ON d.code = w.code
        GROUP BY w.code
      `).all();

      // FR-B2: check VNINDEX depth separately (not in watchlist; required by TA svc for RS)
      const vnidxRow = db.prepare<{ cnt: number }, []>(
        "SELECT COUNT(*) AS cnt FROM daily_ohlcv WHERE code = 'VNINDEX'"
      ).get();
      const vnindexDepth = vnidxRow?.cnt ?? 0;

      const shallowCodes: { code: string; cnt: number }[] = depthRows.filter(
        (r) => r.cnt < DEPTH_FLOOR,
      );
      if (vnindexDepth < DEPTH_FLOOR) {
        shallowCodes.push({ code: "VNINDEX", cnt: vnindexDepth });
      }

      if (shallowCodes.length === 0) {
        log.info("[ohlcv-backfill-done] depth verified: all watchlist tickers >=252 bars", {
          watchlist_count: depthRows.length,
          vnindex_depth: vnindexDepth,
        });
      } else {
        const shallowList = shallowCodes.map((r) => `${r.code}:${r.cnt}`).join(", ");
        log.warn("[ohlcv-backfill-done] depth shortfall detected", {
          shallow_count: shallowCodes.length,
          codes: shallowList,
          depth_floor: DEPTH_FLOOR,
        });

        // 3. Retry-storm cap check (R-5): read retry_count of last done row
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
    } catch (depthErr) {
      // Depth probe is advisory — do not fail the HTTP response if probe fails
      log.warn("[ohlcv-backfill-done] depth probe failed (non-fatal)", {
        error: depthErr instanceof Error ? depthErr.message : String(depthErr),
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
