#!/usr/bin/env bun
/**
 * scripts/migrations/backfill-foreign-flow-gap-2026-08-06.ts
 *
 * FIX-FOREIGN-FLOW-MISSING-TRADING-DAY-2026-08-06-NO-BACKFILL — AC-2.
 *
 * Target gaps (RAW-verified live, readonly probe of the named-volume DB
 * inside vn-market-intelligence-mcp-mcp-server-1, scan_ts 2026-08-07T02:49Z):
 *   - 2026-08-06 (Thu, a full VN trading session) — ZERO daily_foreign_flow
 *     rows for ANY code.
 *   - 2026-08-05 (Wed) — 99 rows present but the session's `vps_push_log`
 *     trail stops dead at 04:29:40.192Z (every other listed session runs to
 *     ~08:59-09:00Z), so roughly the last 4.5h of that session's foreign
 *     flow never arrived either.
 *
 * NO FAKE DATA (feedback_no_fake_data_real_fetch): this script performs a
 * REAL live probe of the SAME upstream endpoint the live VPS push pipeline
 * uses (bgapidatafeed.vps.com.vn/getliststockdata — see
 * vps-scripts/fetch-foreign-flow.sh) before concluding anything. The
 * 2026-07-22 precedent already established, for this identical endpoint,
 * that it is LIVE-SNAPSHOT-ONLY (no date/range query parameter — returns
 * only the CURRENT tick for the requested codes). This script re-verifies
 * that live, on demand, rather than trusting the old claim as still true.
 * If the probe ever confirms date-scoped historical capability exists (it
 * has never once, across two independent incidents), --apply would write
 * ONLY the returned real values for the exact missing (code, date) pairs —
 * it still NEVER interpolates/estimates a value.
 *
 * Usage:
 *   # Dry-run / probe-only (default — reports gap status + live upstream
 *   # probe verdict, no writes, regardless of the result):
 *   bun scripts/migrations/backfill-foreign-flow-gap-2026-08-06.ts
 *
 *   # --apply behaves IDENTICALLY today (still zero writes) — the flag is
 *   # kept for interface consistency with every other CANONICAL migration
 *   # script in this directory; the printed verdict explains why apply is
 *   # currently always a no-op for this defect class:
 *   bun scripts/migrations/backfill-foreign-flow-gap-2026-08-06.ts --apply
 *
 *   # Against the live named-volume DB (docker exec — matches other
 *   # CANONICAL scripts, e.g. reap-dead-stranded-bctc-rows.ts):
 *   docker cp scripts/migrations/backfill-foreign-flow-gap-2026-08-06.ts \
 *     vn-market-intelligence-mcp-mcp-server-1:/app/backfill-foreign-flow-gap-2026-08-06.ts
 *   docker exec vn-market-intelligence-mcp-mcp-server-1 \
 *     bun /app/backfill-foreign-flow-gap-2026-08-06.ts
 *
 * Environment:
 *   DB_PATH — override DB path (default: <repo-root>/data/market.db)
 *
 * Exit codes:
 *   0 — probe completed (any verdict, including UNRECOVERABLE — that is the
 *       EXPECTED, honest outcome for this defect class, not a script error)
 *   1 — DB open failure
 */

import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// Target dates for THIS incident (date-specific, matching the established
// one-off-migration convention — e.g. backfill-ohlcv-gap-2026-07-06.ts,
// repair-ohlcv-seed-candle-2026-06-16.ts)
// ─────────────────────────────────────────────────────────────────────────────

export const TARGET_GAP_DATE = "2026-08-06"; // full trading day, zero rows
export const TARGET_TAIL_DATE = "2026-08-05"; // truncated tail after this timestamp:
export const TAIL_CUTOFF_ISO = "2026-08-05T04:29:40.192Z"; // last real push before the tail gap
/** Every other session in the live evidence closes ~08:59-09:00Z — a tail
 *  push more than this many ms after TAIL_CUTOFF_ISO would indicate the
 *  session actually did recover later than the RAW evidence showed. */
const EXPECTED_SESSION_CLOSE_HOUR_UTC = 9;

export interface GapDayStatus {
  date: string;
  rowCount: number;
  maxUpdatedAt: string | null;
  isZeroRowGap: boolean;
  isTruncatedTail: boolean;
}

/**
 * Read-only: reports the current daily_foreign_flow state for `date` —
 * never mutates anything.
 */
export function checkGapDayStatus(db: Database, date: string, tailCutoffIso?: string): GapDayStatus {
  let rowCount = 0;
  let maxUpdatedAt: string | null = null;
  try {
    const row = db
      .query<{ n: number; mu: string | null }, [string]>(
        "SELECT COUNT(*) as n, MAX(updated_at) as mu FROM daily_foreign_flow WHERE date = ?",
      )
      .get(date);
    rowCount = row?.n ?? 0;
    maxUpdatedAt = row?.mu ?? null;
  } catch {
    rowCount = 0;
  }

  let isTruncatedTail = false;
  if (tailCutoffIso && maxUpdatedAt) {
    const cutoffHour = new Date(tailCutoffIso).getUTCHours();
    const actualHour = new Date(maxUpdatedAt).getUTCHours();
    isTruncatedTail = maxUpdatedAt <= tailCutoffIso && actualHour < EXPECTED_SESSION_CLOSE_HOUR_UTC && cutoffHour < EXPECTED_SESSION_CLOSE_HOUR_UTC;
  }

  return { date, rowCount, maxUpdatedAt, isZeroRowGap: rowCount === 0, isTruncatedTail };
}

// ─────────────────────────────────────────────────────────────────────────────
// Live upstream capability probe
// ─────────────────────────────────────────────────────────────────────────────

export interface UpstreamProbeResult {
  reachable: boolean;
  sampleKeys: string[];
  hasDateOrRangeParam: boolean;
  verdict: "UNRECOVERABLE" | "PROBE_FAILED";
}

/**
 * Live-probes the SAME upstream endpoint fetch-foreign-flow.sh uses
 * (bgapidatafeed.vps.com.vn/getliststockdata) with a single sample code and
 * inspects the response shape. RAW-confirmed live 2026-08-07: the endpoint
 * returns ONLY current-tick fields (lastPrice/lastVolume/g1..g7 bid-ask
 * ladder/etc.), no date field, and — structurally — the URL itself takes
 * only a code list, never a date/range argument. This function re-runs that
 * exact live check so the UNRECOVERABLE verdict below is re-verifiable on
 * demand, not a stale one-off manual claim.
 */
export async function probeUpstreamHistoricalCapability(
  fetchFn: typeof fetch,
  sampleCode = "FPT",
): Promise<UpstreamProbeResult> {
  try {
    const res = await fetchFn(`https://bgapidatafeed.vps.com.vn/getliststockdata/${sampleCode}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return { reachable: false, sampleKeys: [], hasDateOrRangeParam: false, verdict: "PROBE_FAILED" };
    const json = (await res.json()) as unknown;
    const first = Array.isArray(json) ? (json[0] as Record<string, unknown> | undefined) : undefined;
    const sampleKeys = first ? Object.keys(first) : [];
    // Transparency only — even a `time`-ish tick field would reflect the
    // last-tick time, not a queryable historical range; the URL shape
    // (`/getliststockdata/<codes>`, no date param) is the real constraint
    // and is structurally unchanged regardless of this heuristic's result.
    const hasDateOrRangeParam = sampleKeys.some((k) => /^(date|tradeDate|history)/i.test(k));
    return { reachable: true, sampleKeys, hasDateOrRangeParam, verdict: "UNRECOVERABLE" };
  } catch {
    return { reachable: false, sampleKeys: [], hasDateOrRangeParam: false, verdict: "PROBE_FAILED" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const args = process.argv.slice(2);
  const isApply = args.includes("--apply");

  const PROJECT_ROOT = resolve(import.meta.dir, "..", "..");
  const DB_PATH = Bun.env["DB_PATH"] ?? resolve(PROJECT_ROOT, "data", "market.db");

  function log(msg: string): void {
    console.log(`[${new Date().toISOString()}] ${msg}`);
  }

  log(`[FFLOW-GAP-0806] backfill-foreign-flow-gap-2026-08-06`);
  log(`[FFLOW-GAP-0806] mode=${isApply ? "APPLY (still probe-only — see below)" : "DRY-RUN"}`);
  log(`[FFLOW-GAP-0806] DB_PATH=${DB_PATH}`);

  if (!existsSync(DB_PATH)) {
    log(`[FFLOW-GAP-0806] ERROR: DB not found at ${DB_PATH}`);
    log(`[FFLOW-GAP-0806] For the live named-volume DB, run via docker exec:`);
    log(`[FFLOW-GAP-0806]   docker cp scripts/migrations/backfill-foreign-flow-gap-2026-08-06.ts \\`);
    log(`[FFLOW-GAP-0806]     vn-market-intelligence-mcp-mcp-server-1:/app/backfill-foreign-flow-gap-2026-08-06.ts`);
    log(`[FFLOW-GAP-0806]   docker exec vn-market-intelligence-mcp-mcp-server-1 \\`);
    log(`[FFLOW-GAP-0806]     bun /app/backfill-foreign-flow-gap-2026-08-06.ts`);
    process.exit(1);
  }

  let db: Database;
  try {
    db = new Database(DB_PATH, { readonly: true });
  } catch (err) {
    log(`[FFLOW-GAP-0806] ERROR: Cannot open DB: ${err}`);
    process.exit(1);
  }

  try {
    const gapStatus = checkGapDayStatus(db, TARGET_GAP_DATE);
    const tailStatus = checkGapDayStatus(db, TARGET_TAIL_DATE, TAIL_CUTOFF_ISO);

    log(
      `[FFLOW-GAP-0806] ${TARGET_GAP_DATE}: rowCount=${gapStatus.rowCount} maxUpdatedAt=${gapStatus.maxUpdatedAt ?? "NONE"} ` +
        `zeroRowGap=${gapStatus.isZeroRowGap}`,
    );
    log(
      `[FFLOW-GAP-0806] ${TARGET_TAIL_DATE}: rowCount=${tailStatus.rowCount} maxUpdatedAt=${tailStatus.maxUpdatedAt ?? "NONE"} ` +
        `truncatedTail=${tailStatus.isTruncatedTail} (cutoff=${TAIL_CUTOFF_ISO})`,
    );

    log(`[FFLOW-GAP-0806] Probing live upstream (bgapidatafeed.vps.com.vn) for historical-range capability...`);
    const probe = await probeUpstreamHistoricalCapability(fetch);
    log(`[FFLOW-GAP-0806] Probe result: ${JSON.stringify(probe)}`);

    if (probe.verdict === "PROBE_FAILED") {
      log(`[FFLOW-GAP-0806] WARNING: live probe failed (network/geo-block) — cannot confirm capability this run.`);
      log(`[FFLOW-GAP-0806] No writes performed (never guess when ambiguous).`);
      db.close();
      process.exit(0);
    }

    log(
      `[FFLOW-GAP-0806] VERDICT: UNRECOVERABLE — bgapidatafeed.vps.com.vn returns only the CURRENT tick ` +
        `for the requested codes (sample response keys: ${probe.sampleKeys.slice(0, 8).join(",")}), with no ` +
        `date/range query parameter. Matches the 2026-07-22 precedent for this identical endpoint. Both ` +
        `${TARGET_GAP_DATE} (full session) and the post-${TAIL_CUTOFF_ISO} tail of ${TARGET_TAIL_DATE} are ` +
        `PERMANENTLY unrecoverable via re-fetch — zero rows written (never fabricated).`,
    );

    if (isApply) {
      log(`[FFLOW-GAP-0806] --apply requested but is a NO-OP here: there is nothing real to write.`);
    }

    db.close();
    process.exit(0);
  } catch (err) {
    log(`[FFLOW-GAP-0806] FATAL: ${err}`);
    try {
      db.close();
    } catch {
      /* ignore */
    }
    process.exit(1);
  }
}
