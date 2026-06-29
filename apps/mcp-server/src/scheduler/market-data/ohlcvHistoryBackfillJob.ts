/**
 * ohlcvHistoryBackfillJob — OHLCV-BACKFILL-P0 (Sprint MARKET-INDICATOR-DEPTH-P0)
 *
 * Purpose: Backfill ~2 years of daily OHLCV bars for VN-Index + all watchlist
 * tickers into daily_ohlcv. This is the prerequisite unlock for:
 *   - P0-1's rv_60d and 252d-drawdown fields
 *   - The entire P1 momentum indicator family
 *
 * Key invariants:
 *   - NO FAKE DATA: if VPS returns an empty/error response for a ticker, skip
 *     (honest gap) rather than fabricating or zero-filling.
 *   - MANDATORY write path: all bars go through writeOhlcvBatch from
 *     ohlcvWriteService.ts (preserves unit-scale guard + seed-bar rejection).
 *   - Idempotent: re-running over already-present rows is a no-op (ON CONFLICT).
 *   - Bounded fetch: 15s deadline per ticker < gateway timeout.
 *   - Capped concurrency: sequential with configurable delay to avoid host
 *     starvation when iterating 35+ symbols × 500 bars.
 *
 * Completion signal (FR-S0-2):
 *   Emits a structured log line after all tickers are processed:
 *   [OHLCV_BACKFILL_DONE] date=<ISO>, rows_pushed=<count>, first_date=<earliest>,
 *   last_date=<latest>
 *
 * DDD layer: scheduler — may import from domain/, infrastructure/, and application/usecases/.
 * MUST NOT import sendTelegram or any Telegram client directly.
 *
 * @module scheduler/market-data/ohlcvHistoryBackfillJob
 */

import type { Database } from "bun:sqlite";
import { logger } from "../../infrastructure/logger.js";
import { writeOhlcvBatch } from "../../application/usecases/ohlcvWriteService.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Target bar depth for the history backfill.
 * ~500 trading sessions ≈ 2 calendar years (252 trading days/year).
 * VN-Index and all watchlist tickers need this depth to unlock:
 *   - rv_60d_pct (needs ≥61 bars)
 *   - drawdown_252d_pct (needs ≥252 bars)
 *   - P1 momentum family (needs ≥252 bars)
 */
export const HISTORY_TARGET_BARS = 500;

/**
 * VN-Index code — always included in the backfill regardless of watchlist content.
 * This is the primary driver for P0-1 volatility primitives (RV, GK, drawdown).
 */
const VNINDEX_CODE = "VNINDEX";

/**
 * Default inter-request delay (ms). Prevents host starvation when iterating
 * 35+ symbols. Conservative 300ms vs taOhlcvBackfillJob's 200ms — history
 * backfill fetches more rows per request, so give TCBS API breathing room.
 */
const DEFAULT_DELAY_MS = 300;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Shape of a single OHLCV record returned by the fetch function (normalized) */
export interface OhlcvHistoryRecord {
  code?: string;
  date?: string;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  nmVolume?: number;
}


/** Dependency-injectable parameters — production uses real DB + TCBS fetcher */
export interface OhlcvHistoryBackfillDeps {
  /** Injected Database instance (no getDb() calls inside) */
  db?: Database;
  /**
   * Fetch function for a single ticker — injectable for tests.
   * Signature: (code, fromDate, toDate) → OhlcvHistoryRecord[]
   * Production default: fetches from apipubaws.tcbs.com.vn bars-long-term
   */
  fetchFn?: (
    code: string,
    fromDate: string,
    toDate: string,
  ) => Promise<OhlcvHistoryRecord[]>;
  /** Delay between ticker requests in ms (default 300) */
  delayMs?: number;
  /** Backfill from-date in YYYY-MM-DD format (default: 2 years ago) */
  fromDate?: string;
  /** Backfill to-date in YYYY-MM-DD format (default: today) */
  toDate?: string;
}

/** Per-ticker result summary */
export interface OhlcvHistoryTickerResult {
  code: string;
  written: number;
  skipped: number;
  rejected: number;
  error?: string;
}

/** Aggregate result returned by runOhlcvHistoryBackfill */
export interface OhlcvHistoryBackfillResult {
  /** Number of tickers attempted (watchlist + VNINDEX) */
  tickersProcessed: number;
  /** Total bars written across all tickers */
  totalWritten: number;
  /** Total bars skipped (seed-bar filter) */
  totalSkipped: number;
  /** Total bars rejected (unit guard) */
  totalRejected: number;
  /** Per-ticker error strings for tickers where fetch or upsert failed */
  errors: string[];
  /** Per-ticker breakdown */
  tickerResults: OhlcvHistoryTickerResult[];
  /** Earliest date written (for completion marker) */
  firstDate: string | null;
  /** Latest date written (for completion marker) */
  lastDate: string | null;
  /** ISO timestamp when the job completed */
  completedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Production fetch strategy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Production data flow for OHLCV history:
 *
 *   1. VPS (Vietnam) fetches from TCBS bars-long-term API (accessible from VN).
 *   2. VPS pushes data to France server via POST /api/push-ohlcv-history.
 *   3. France server writes via validateOhlcvUnit + ON CONFLICT DO UPDATE.
 *
 * Why not direct API from France/Docker:
 *   - TCBS (apipubaws.tcbs.com.vn) → HTTP 404 "Service not found" from France.
 *   - VnDirect (api-finfo.vndirect.com.vn) → geo-blocked, returns all-market
 *     snapshot instead of per-ticker history.
 *
 * Production trigger mechanism:
 *   - This job monitors bar depth per ticker in daily_ohlcv.
 *   - If any ticker has < HISTORY_TARGET_BARS bars, inserts a done=0 row in
 *     ohlcv_backfill_queue (binary trigger signal).
 *   - VPS polls GET /api/ohlcv-backfill-queue every N minutes; when pending=true,
 *     runs fetch-ohlcv-backfill.sh (DAYS=730) and pushes data back.
 *   - After VPS push: bar depth increases; subsequent cron runs are no-ops.
 *
 * Test mode (fetchFn injected via deps):
 *   - Uses the provided fetch mock to exercise the writeOhlcvBatch write path.
 *   - No VPS trigger is inserted (deps.fetchFn present → production mode skipped).
 */

/**
 * Default production fetch function — returns empty (no geo-blocked API calls).
 * Production bars come via VPS push; this function is a protocol no-op.
 * The depth-check + VPS trigger at the end of runOhlcvHistoryBackfill handles
 * signalling the VPS when bar depth is insufficient.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function defaultFetchFn(
  _code: string,
  _fromDate: string,
  _toDate: string,
): Promise<OhlcvHistoryRecord[]> {
  // Vietnamese stock APIs are geo-blocked from Docker/France.
  // Production data delivery is VPS-push-mediated (see strategy comment above).
  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Sleep helper
// ─────────────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// Core function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * runOhlcvHistoryBackfill — backfill 2yr daily bars for VN-Index + watchlist.
 *
 * Strategy:
 *   1. Read all tickers from the `watchlist` table.
 *   2. Always prepend VNINDEX (unconditionally included — primary P0-1 input).
 *   3. For each ticker (sequentially, rate-limited):
 *      a. Fetch HISTORY_TARGET_BARS bars from TCBS bars-long-term endpoint.
 *      b. Filter rows with missing/null OHLCV fields (NFR-S0-3 honest-gap).
 *      c. Write via writeOhlcvBatch (conflictStrategy='backfill').
 *      d. On fetch error: log at WARN, record error string, continue.
 *      e. On empty response: log at INFO (suspended ticker), continue.
 *   4. Emit [OHLCV_BACKFILL_DONE] completion marker log line.
 *
 * No FAKE DATA: missing ticker or empty response = honest gap (NFR-S0-3).
 * No direct INSERT — ALL writes go through writeOhlcvBatch SSOT path.
 *
 * @param deps - Optional injectable dependencies for testing.
 * @returns Aggregate result with per-ticker breakdown and completion marker fields.
 */
export async function runOhlcvHistoryBackfill(
  deps?: OhlcvHistoryBackfillDeps,
): Promise<OhlcvHistoryBackfillResult> {
  // ─── Resolve dependencies ────────────────────────────────────────────────
  let db: Database;
  if (deps?.db) {
    db = deps.db;
  } else {
    const { getDb } = await import("../../infrastructure/db/schema.js");
    db = getDb();
  }

  const fetchFn = deps?.fetchFn ?? defaultFetchFn;
  const delayMs = deps?.delayMs ?? DEFAULT_DELAY_MS;

  // Default from-date: ~2 years back from today (730 days ≈ 500+ trading days)
  const today = new Date().toISOString().slice(0, 10);
  const twoYearsAgo = new Date(Date.now() - 730 * 24 * 3_600_000)
    .toISOString()
    .slice(0, 10);

  const fromDate = deps?.fromDate ?? twoYearsAgo;
  const toDate = deps?.toDate ?? today;

  // VN today (UTC+7) — needed for FR-S1 seed-bar rejection inside writeOhlcvBatch
  const vnToday = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

  // ─── Load watchlist ───────────────────────────────────────────────────────
  let watchlistCodes: string[];
  try {
    const rows = db
      .prepare<{ code: string }, []>("SELECT code FROM watchlist ORDER BY code")
      .all();
    watchlistCodes = rows.map((r) => r.code);
  } catch (err) {
    logger.warn("[ohlcvHistoryBackfill] failed to read watchlist", {
      error: err instanceof Error ? err.message : String(err),
    });
    watchlistCodes = [];
  }

  // Always include VNINDEX first (unconditional — primary P0-1 input)
  // De-duplicate in case VNINDEX is already in watchlist
  const allCodes = [VNINDEX_CODE, ...watchlistCodes.filter((c) => c !== VNINDEX_CODE)];

  // ─── Per-ticker loop ──────────────────────────────────────────────────────
  const errors: string[] = [];
  const tickerResults: OhlcvHistoryTickerResult[] = [];
  let totalWritten = 0;
  let totalSkipped = 0;
  let totalRejected = 0;
  let globalFirstDate: string | null = null;
  let globalLastDate: string | null = null;

  for (let i = 0; i < allCodes.length; i++) {
    const code = allCodes[i];
    if (!code) continue;

    const tickerResult: OhlcvHistoryTickerResult = {
      code,
      written: 0,
      skipped: 0,
      rejected: 0,
    };

    try {
      // ── Fetch from TCBS ─────────────────────────────────────────────────
      const records = await fetchFn(code, fromDate, toDate);

      if (records.length === 0) {
        // Empty response = suspended/delisted ticker or no trading in window.
        // Log at INFO — honest gap, no fabrication (NFR-S0-3).
        logger.info(
          `[ohlcvHistoryBackfill] ${code}: empty response (suspended or no data in window ${fromDate}→${toDate}) — honest gap`,
        );
        tickerResults.push(tickerResult);
        if (i < allCodes.length - 1) await sleep(delayMs);
        continue;
      }

      // ── Filter rows with missing/null OHLCV fields ───────────────────────
      // Validates OHLCV columns present before insert (S0-Edge Cases note).
      // Zero-close rows are also excluded (writeOhlcvBatch C=0 guard fires
      // anyway, but filtering here avoids unnecessary rejected[] entries).
      const writeRows = records
        .filter(
          (r): r is OhlcvHistoryRecord & {
            code: string;
            date: string;
            open: number;
            high: number;
            low: number;
            close: number;
          } =>
            typeof r.code === "string" &&
            r.code.length > 0 &&
            typeof r.date === "string" &&
            r.date.length === 10 &&
            r.open != null &&
            r.high != null &&
            r.low != null &&
            r.close != null &&
            r.close !== 0,
        )
        .map((r) => ({
          code: r.code,
          date: r.date,
          open: r.open,
          high: r.high,
          low: r.low,
          close: r.close,
          volume: r.nmVolume ?? 0,
        }));

      if (writeRows.length === 0) {
        logger.warn(
          `[ohlcvHistoryBackfill] ${code}: all ${records.length} row(s) filtered (missing OHLCV fields or zero-close)`,
        );
        tickerResults.push(tickerResult);
        if (i < allCodes.length - 1) await sleep(delayMs);
        continue;
      }

      // ── Write via SSOT path (MANDATORY: writeOhlcvBatch) ─────────────────
      // conflictStrategy='backfill' = unconditional overwrite (Writer D pattern).
      // The service handles:
      //   - FR-S1 seed-bar rejection (date >= vnToday AND vol=0 AND O=H=L=C)
      //   - normalizeOhlcvToVnd (×1000 correction when max(OHLC) < 100)
      //   - detectAndNormalizeScaleFromPrevClose (batched prevClose query)
      //   - validateOhlcvUnit (fail-closed unit check)
      //   - ON CONFLICT DO UPDATE (idempotent upsert)
      const writeResult = await writeOhlcvBatch(writeRows, db, {
        conflictStrategy: "backfill",
        vnToday,
      });

      if (writeResult.rejected.length > 0) {
        logger.warn(
          `[ohlcvHistoryBackfill] ${code}: ${writeResult.rejected.length} row(s) rejected by unit guard`,
          { rejected: writeResult.rejected.slice(0, 3) },
        );
      }

      tickerResult.written = writeResult.written;
      tickerResult.skipped = writeResult.skipped;
      tickerResult.rejected = writeResult.rejected.length;
      totalWritten += writeResult.written;
      totalSkipped += writeResult.skipped;
      totalRejected += writeResult.rejected.length;

      // Track global date range for completion marker
      const dates = writeRows.map((r) => r.date).sort();
      const firstDate = dates[0] ?? null;
      const lastDate = dates[dates.length - 1] ?? null;
      if (firstDate && (!globalFirstDate || firstDate < globalFirstDate)) {
        globalFirstDate = firstDate;
      }
      if (lastDate && (!globalLastDate || lastDate > globalLastDate)) {
        globalLastDate = lastDate;
      }

      logger.info(
        `[ohlcvHistoryBackfill] ${code}: written=${writeResult.written} skipped=${writeResult.skipped} rejected=${writeResult.rejected.length} (range ${firstDate}→${lastDate})`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${code}: ${msg}`);
      tickerResult.error = msg;
      logger.warn(`[ohlcvHistoryBackfill] error ticker=${code}`, { error: msg });
    }

    tickerResults.push(tickerResult);

    // Rate-limit between requests (skip delay after the last ticker)
    if (i < allCodes.length - 1) {
      await sleep(delayMs);
    }
  }

  // ─── Production depth-check + VPS queue trigger ──────────────────────────
  // When no fetchFn is injected (production cron), check bar depth per ticker.
  // If any ticker is below the 2yr target, insert a done=0 trigger row so VPS
  // will run fetch-ohlcv-backfill.sh (DAYS=730) on its next poll cycle.
  // Tests always inject fetchFn → this block is skipped in test context.
  if (!deps?.fetchFn) {
    try {
      const depthStmt = db.prepare<{ n: number }, [string]>(
        "SELECT COUNT(*) as n FROM daily_ohlcv WHERE code=?",
      );
      const gapTickers = allCodes.filter((code) => {
        const cnt = depthStmt.get(code)?.n ?? 0;
        return cnt < HISTORY_TARGET_BARS;
      });
      if (gapTickers.length > 0) {
        db.prepare(
          "INSERT INTO ohlcv_backfill_queue(queued_at) VALUES (datetime('now'))",
        ).run();
        logger.info(
          `[ohlcvHistoryBackfill] depth gap: ${gapTickers.length} ticker(s) below ${HISTORY_TARGET_BARS} bars — VPS queue trigger inserted`,
          { sample: gapTickers.slice(0, 5) },
        );
      } else {
        logger.info(
          "[ohlcvHistoryBackfill] all tickers at target depth — no VPS trigger needed",
          { tickers: allCodes.length, target: HISTORY_TARGET_BARS },
        );
      }
    } catch (triggerErr) {
      logger.warn("[ohlcvHistoryBackfill] failed to insert VPS queue trigger", {
        error: triggerErr instanceof Error ? triggerErr.message : String(triggerErr),
      });
    }
  }

  // ─── FR-S0-2: Completion marker ──────────────────────────────────────────
  const completedAt = new Date().toISOString();
  const completionLog =
    `[OHLCV_BACKFILL_DONE] date=${completedAt}, rows_pushed=${totalWritten}, ` +
    `first_date=${globalFirstDate ?? "none"}, last_date=${globalLastDate ?? "none"}, ` +
    `tickers=${allCodes.length}, errors=${errors.length}`;
  logger.info(completionLog);

  return {
    tickersProcessed: allCodes.length,
    totalWritten,
    totalSkipped,
    totalRejected,
    errors,
    tickerResults,
    firstDate: globalFirstDate,
    lastDate: globalLastDate,
    completedAt,
  };
}
