/**
 * Scheduler — vnstock Fundamentals + Trading Stats Jobs (Task 1920a)
 *
 * Two cron entries in one file:
 *
 *   vnstockFundamentalsRefresh — Mon 01:00 UTC
 *     Iterates the 30-ticker watchlist, calls syncVnstockData per ticker.
 *     Populates: vnstock_financials, vnstock_balance_sheet, vnstock_cash_flow,
 *                vnstock_events, vnstock_officers, vnstock_shareholders.
 *
 *   vnstockTradingStatsRefresh — weekdays 08:30 UTC
 *     Iterates the watchlist, calls syncVnstockData per ticker (trading_stats).
 *     Populates: vnstock_trading_stats.
 *     Fires ~30 min after HOSE close (15:00 VN = 08:00 UTC).
 *
 * Design:
 *   - isRunning concurrency guard (module-level) — 30-ticker sweep = 7-10 min;
 *     prevents double-stack if cron fires again mid-sweep.
 *   - Per-ticker try/catch — one failure must NOT abort the remaining tickers.
 *   - Calls syncVnstockData sequentially (preserves 2500ms inter-call delay).
 *   - Fail-loud on WORK channel when any tickers fail at sweep completion.
 *   - recordJobRun observability via cronJobRunStore.
 *
 * Watchlist: read from docs/data/stock-classification.json (same source used
 * by bctcBatchSweepJob.ts — NOT hardcoded in the job body).
 *
 * @module scheduler/financial-reports/vnstockFundamentalsJob
 */

import { logger } from "../../infrastructure/logger.js";
import { recordJobRun } from "../../infrastructure/db/cronJobRunStore.js";
import { getDb } from "../../infrastructure/db/schema.js";
import { syncVnstockData } from "../../application/usecases/syncVnstockData.js";
import { sendTelegramWork } from "../../infrastructure/notifiers/telegram.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Job name constants
// ─────────────────────────────────────────────────────────────────────────────

export const JOB_NAME_FUNDAMENTALS = "vnstockFundamentalsRefresh";
export const JOB_NAME_TRADING_STATS = "vnstockTradingStatsRefresh";

// ─────────────────────────────────────────────────────────────────────────────
// Concurrency guards (module-level, separate per job)
// ─────────────────────────────────────────────────────────────────────────────

let _isFundamentalsRunning = false;
let _isTradingStatsRunning = false;

// ─────────────────────────────────────────────────────────────────────────────
// Result type
// ─────────────────────────────────────────────────────────────────────────────

export interface VnstockJobResult {
  succeeded: number;
  failed: string[];
  /**
   * Fix 2/6 (FIX-VNSTOCK-FUNDAMENTALS-CRASH-SPIKE): actual DB rows written across all
   * financial tables (vnstock_financials + vnstock_balance_sheet + vnstock_cash_flow).
   * Measured as a row-count delta before/after the sweep — 0 means no data landed.
   * Previously this field did not exist; cron entry used `succeeded` (ticker count) which
   * gives false-positive success even when Python times out for all tickers.
   */
  rowsWritten: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Injectable deps (test seam)
// ─────────────────────────────────────────────────────────────────────────────

export interface VnstockJobOptions {
  /** Override ticker list — defaults to stock-classification.json watchlist */
  tickers?: string[];
  /**
   * Injectable sync function — defaults to production syncVnstockData.
   * Signature: (ticker: string) => Promise<void>
   */
  syncFn?: (ticker: string) => Promise<void>;
  /** Injectable WORK telegram sender — defaults to sendTelegramWork */
  sendWorkFn?: (msg: string) => Promise<unknown>;
  /**
   * Injectable DB getter for row-count delta measurement (Fix 2).
   * Defaults to production getDb().
   * Tests that do not supply this receive rowsWritten=0 (safe default).
   */
  getDbFn?: () => Database;
  /**
   * Test-only flag: when true, resets the isRunning guard before executing.
   * This allows tests to control concurrency state explicitly.
   * MUST NOT be used in production callers (startScheduler.ts).
   */
  _resetRunningState?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Watchlist reader
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read all watchlist tickers from docs/data/stock-classification.json.
 * Same source used by bctcBatchSweepJob.ts.
 * @throws when the file cannot be read or parsed
 */
function readWatchlistTickers(): string[] {
  const raw = readFileSync(
    resolve(process.cwd(), "docs/data/stock-classification.json"),
    "utf-8",
  );
  const parsed = JSON.parse(raw) as { watchlist?: Array<{ ticker: string }> };
  return (parsed.watchlist ?? []).map((e) => e.ticker);
}

// ─────────────────────────────────────────────────────────────────────────────
// Core sweep loop (shared by both jobs)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Iterate tickers sequentially, calling syncFn per ticker.
 * Per-ticker errors are isolated: one failure continues the sweep.
 * Returns { succeeded, failed } summary.
 */
async function runSweep(
  jobName: string,
  tickers: string[],
  syncFn: (ticker: string) => Promise<void>,
): Promise<VnstockJobResult> {
  const failed: string[] = [];
  let succeeded = 0;

  for (const ticker of tickers) {
    try {
      await syncFn(ticker);
      succeeded++;
      logger.debug(`[${jobName}] synced ticker`, { ticker });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`[${jobName}] ticker failed — continuing sweep`, { ticker, error: msg });
      failed.push(ticker);
    }
  }

  // rowsWritten is computed by the caller via DB delta — runSweep itself has no DB access.
  return { succeeded, failed, rowsWritten: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Row-count helper (Fix 2 — accurate rowsWritten measurement)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Count total rows across the three financial data tables.
 * Used for a before/after delta to measure actual rows written in a sweep.
 * Returns -1 if the DB is unavailable (write-wedge / missing tables) — callers
 * treat -1 as "measurement unavailable" and skip the 0-rows guard.
 */
function countFinancialRows(db: Database): number {
  try {
    const row = db
      .prepare<{ total: number }, []>(
        `SELECT (
           SELECT COUNT(*) FROM vnstock_financials
         ) + (
           SELECT COUNT(*) FROM vnstock_balance_sheet
         ) + (
           SELECT COUNT(*) FROM vnstock_cash_flow
         ) AS total`,
      )
      .get();
    return row?.total ?? 0;
  } catch {
    return -1; // DB unavailable — skip delta measurement
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Production default syncFn (calls syncVnstockData with a single-ticker array)
// ─────────────────────────────────────────────────────────────────────────────

async function defaultSyncFn(ticker: string): Promise<void> {
  // syncVnstockData accepts an array; pass a single ticker to respect
  // its sequential loop + 2500ms inter-call delay internally.
  await syncVnstockData([ticker]);
}

// ─────────────────────────────────────────────────────────────────────────────
// vnstockFundamentalsRefresh — Mon 01:00 UTC
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Weekly fundamentals batch sweep.
 *
 * Iterates the full 30-ticker watchlist and calls syncVnstockData per ticker.
 * Covers: vnstock_financials, vnstock_balance_sheet, vnstock_cash_flow,
 *         vnstock_events, vnstock_officers, vnstock_shareholders.
 *
 * isRunning concurrency guard prevents double-stack if sweep exceeds 7-10 min.
 *
 * @param options - Optional DI overrides (tickers, syncFn, sendWorkFn, _resetRunningState)
 * @returns VnstockJobResult with succeeded count and failed ticker list
 */
export async function runVnstockFundamentalsJob(
  options?: VnstockJobOptions,
): Promise<VnstockJobResult> {
  // Test seam: reset module-level isRunning flag when explicitly requested
  if (options?._resetRunningState === true) {
    _isFundamentalsRunning = false;
  }

  // Concurrency guard (FR-4)
  if (_isFundamentalsRunning) {
    logger.warn(`[${JOB_NAME_FUNDAMENTALS}] already running — skipping duplicate invocation`);
    return { succeeded: 0, failed: [], rowsWritten: 0 };
  }

  _isFundamentalsRunning = true;

  const sendWorkFn = options?.sendWorkFn ?? sendTelegramWork;
  let result: VnstockJobResult = { succeeded: 0, failed: [], rowsWritten: 0 };

  try {
    const tickers = options?.tickers ?? readWatchlistTickers();
    const syncFn = options?.syncFn ?? defaultSyncFn;

    // Fix 2 (FIX-VNSTOCK-FUNDAMENTALS-CRASH-SPIKE): measure actual rows written via
    // DB row-count delta before/after the sweep.
    // Uses getDbFn if injected (test seam); falls back to production getDb().
    // countFinancialRows returns -1 when the DB is unavailable — skip measurement.
    const _getDb = options?.getDbFn ?? getDb;
    let rowsBefore = -1;
    try {
      rowsBefore = countFinancialRows(_getDb());
    } catch {
      // DB unavailable at sweep start — proceed without measurement
    }

    logger.info(`[${JOB_NAME_FUNDAMENTALS}] starting sweep`, { tickerCount: tickers.length });

    result = await runSweep(JOB_NAME_FUNDAMENTALS, tickers, syncFn);

    // Fix 6 (FIX-VNSTOCK-FUNDAMENTALS-CRASH-SPIKE): compute accurate rowsWritten.
    // Delta = rows after sweep minus rows before. If DB was unavailable (rowsBefore=-1),
    // rowsWritten stays 0 (conservative — does not over-claim success).
    let rowsWritten = 0;
    if (rowsBefore >= 0) {
      try {
        const rowsAfter = countFinancialRows(_getDb());
        rowsWritten = rowsAfter >= 0 ? Math.max(0, rowsAfter - rowsBefore) : 0;
      } catch {
        // DB unavailable at sweep end — rowsWritten stays 0
      }
    }
    result = { ...result, rowsWritten };

    logger.info(`[${JOB_NAME_FUNDAMENTALS}] sweep complete`, {
      succeeded: result.succeeded,
      failedCount: result.failed.length,
      failed: result.failed,
      rowsWritten,
    });

    // FR-5: fail-loud on WORK channel when any tickers failed
    if (result.failed.length > 0) {
      const failList = result.failed.join(", ");
      await sendWorkFn(
        `[${JOB_NAME_FUNDAMENTALS}] Sweep incomplete — ${result.failed.length} ticker(s) failed: ${failList}. ` +
        `Succeeded: ${result.succeeded}/${tickers.length}. Check logs for per-ticker errors.`,
      );
    }

    // Fix 2C (FIX-VNSTOCK-FUNDAMENTALS-CRASH-SPIKE): fail-loud 0-rows guard.
    // If the sweep ran (tickers present, rowsBefore measurement available) but zero
    // rows landed in the financial tables, alert on WORK channel immediately.
    // Covers the Mode A silent-drop: Python times out / RATE_LIMITED → all tickers return
    // null → markFetched() is called (fetch_log shows activity) but storeFinancials() was
    // never called → data tables remain frozen.
    if (rowsBefore >= 0 && rowsWritten === 0 && tickers.length > 0) {
      await sendWorkFn(
        `[${JOB_NAME_FUNDAMENTALS}] WARNING: sweep complete but 0 rows written to ` +
        `vnstock_financials/balance_sheet/cash_flow. All ${tickers.length} tickers returned null. ` +
        `Check VCI API availability and Python subprocess logs.`,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[${JOB_NAME_FUNDAMENTALS}] batch-level error`, { error: msg });
    await sendWorkFn(`[${JOB_NAME_FUNDAMENTALS}] Batch error: ${msg}`);
  } finally {
    _isFundamentalsRunning = false;
  }

  return result;
}

/**
 * Entry point for the cron scheduler — vnstockFundamentalsRefresh.
 * Called by startScheduler on CRONS.vnstockFundamentalsRefresh (Mon 01:00 UTC).
 * Wraps runVnstockFundamentalsJob in recordJobRun for cron_job_runs observability.
 */
export async function runVnstockFundamentalsJobCron(): Promise<void> {
  const db = getDb();
  await recordJobRun(db, JOB_NAME_FUNDAMENTALS, async () => {
    // Fix 6 (FIX-VNSTOCK-FUNDAMENTALS-CRASH-SPIKE): use result.rowsWritten (actual DB row
    // delta) instead of result.succeeded (ticker count). Previously succeeded=30 while
    // zero rows landed gave a false-positive success signal in cron_job_runs.
    const result = await runVnstockFundamentalsJob({ getDbFn: () => db });
    return { rowsWritten: result.rowsWritten };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// vnstockTradingStatsRefresh — weekdays 08:30 UTC
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Daily trading stats batch sweep (weekdays).
 *
 * Iterates the full 30-ticker watchlist and calls syncVnstockData per ticker.
 * Covers: vnstock_trading_stats (UNIQUE(code, date) — upsert idempotent).
 *
 * Fires ~30 min after HOSE close (15:00 VN = 08:00 UTC) so daily stats
 * are post-settlement. isRunning guard prevents double-stack.
 *
 * @param options - Optional DI overrides (tickers, syncFn, sendWorkFn, _resetRunningState)
 * @returns VnstockJobResult with succeeded count and failed ticker list
 */
export async function runVnstockTradingStatsJob(
  options?: VnstockJobOptions,
): Promise<VnstockJobResult> {
  // Test seam: reset module-level isRunning flag when explicitly requested
  if (options?._resetRunningState === true) {
    _isTradingStatsRunning = false;
  }

  // Concurrency guard (FR-4)
  if (_isTradingStatsRunning) {
    logger.warn(`[${JOB_NAME_TRADING_STATS}] already running — skipping duplicate invocation`);
    return { succeeded: 0, failed: [], rowsWritten: 0 };
  }

  _isTradingStatsRunning = true;

  const sendWorkFn = options?.sendWorkFn ?? sendTelegramWork;
  let result: VnstockJobResult = { succeeded: 0, failed: [], rowsWritten: 0 };

  try {
    const tickers = options?.tickers ?? readWatchlistTickers();
    const syncFn = options?.syncFn ?? defaultSyncFn;

    // FIX-VNSTOCK-TRADINGSTATS-CRASH: measure actual rows written via DB row-count
    // delta before/after the sweep — same pattern as runVnstockFundamentalsJob Fix 2/6.
    // Without this, rowsWritten = result.succeeded (ticker count) which reports
    // success even when all tickers return null and 0 rows land in the table.
    const _getDb = options?.getDbFn ?? getDb;
    let rowsBefore = -1;
    try {
      const db = _getDb();
      const row = db
        .prepare<{ total: number }, []>(
          `SELECT COUNT(*) AS total FROM vnstock_trading_stats`,
        )
        .get();
      rowsBefore = row?.total ?? 0;
    } catch {
      // DB unavailable at sweep start — proceed without measurement
    }

    logger.info(`[${JOB_NAME_TRADING_STATS}] starting sweep`, { tickerCount: tickers.length });

    result = await runSweep(JOB_NAME_TRADING_STATS, tickers, syncFn);

    // Compute accurate rowsWritten from DB delta
    let rowsWritten = 0;
    if (rowsBefore >= 0) {
      try {
        const db = _getDb();
        const row = db
          .prepare<{ total: number }, []>(
            `SELECT COUNT(*) AS total FROM vnstock_trading_stats`,
          )
          .get();
        const rowsAfter = row?.total ?? 0;
        rowsWritten = Math.max(0, rowsAfter - rowsBefore);
      } catch {
        // DB unavailable at sweep end — rowsWritten stays 0 (conservative)
      }
    }
    result = { ...result, rowsWritten };

    logger.info(`[${JOB_NAME_TRADING_STATS}] sweep complete`, {
      succeeded: result.succeeded,
      failedCount: result.failed.length,
      failed: result.failed,
      rowsWritten,
    });

    // FR-5: fail-loud on WORK channel when any tickers failed
    if (result.failed.length > 0) {
      const failList = result.failed.join(", ");
      await sendWorkFn(
        `[${JOB_NAME_TRADING_STATS}] Sweep incomplete — ${result.failed.length} ticker(s) failed: ${failList}. ` +
        `Succeeded: ${result.succeeded}/${tickers.length}. Check logs for per-ticker errors.`,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[${JOB_NAME_TRADING_STATS}] batch-level error`, { error: msg });
    await sendWorkFn(`[${JOB_NAME_TRADING_STATS}] Batch error: ${msg}`);
  } finally {
    _isTradingStatsRunning = false;
  }

  return result;
}

/**
 * Entry point for the cron scheduler — vnstockTradingStatsRefresh.
 * Called by startScheduler on CRONS.vnstockTradingStatsRefresh (weekdays 08:30 UTC).
 * Wraps runVnstockTradingStatsJob in recordJobRun for cron_job_runs observability.
 *
 * FIX-VNSTOCK-TRADINGSTATS-CRASH: pass getDbFn so rowsWritten reflects actual DB
 * row delta (not result.succeeded which counted tickers, not rows).
 */
export async function runVnstockTradingStatsJobCron(): Promise<void> {
  const db = getDb();
  await recordJobRun(db, JOB_NAME_TRADING_STATS, async () => {
    const result = await runVnstockTradingStatsJob({ getDbFn: () => db });
    return { rowsWritten: result.rowsWritten };
  });
}
