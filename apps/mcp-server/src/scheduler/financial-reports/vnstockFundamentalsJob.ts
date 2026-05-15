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

  return { succeeded, failed };
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
    return { succeeded: 0, failed: [] };
  }

  _isFundamentalsRunning = true;

  const sendWorkFn = options?.sendWorkFn ?? sendTelegramWork;
  let result: VnstockJobResult = { succeeded: 0, failed: [] };

  try {
    const tickers = options?.tickers ?? readWatchlistTickers();
    const syncFn = options?.syncFn ?? defaultSyncFn;

    logger.info(`[${JOB_NAME_FUNDAMENTALS}] starting sweep`, { tickerCount: tickers.length });

    result = await runSweep(JOB_NAME_FUNDAMENTALS, tickers, syncFn);

    logger.info(`[${JOB_NAME_FUNDAMENTALS}] sweep complete`, {
      succeeded: result.succeeded,
      failedCount: result.failed.length,
      failed: result.failed,
    });

    // FR-5: fail-loud on WORK channel when any tickers failed
    if (result.failed.length > 0) {
      const failList = result.failed.join(", ");
      await sendWorkFn(
        `[${JOB_NAME_FUNDAMENTALS}] Sweep incomplete — ${result.failed.length} ticker(s) failed: ${failList}. ` +
        `Succeeded: ${result.succeeded}/${tickers.length}. Check logs for per-ticker errors.`,
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
    const result = await runVnstockFundamentalsJob();
    return { rowsWritten: result.succeeded };
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
    return { succeeded: 0, failed: [] };
  }

  _isTradingStatsRunning = true;

  const sendWorkFn = options?.sendWorkFn ?? sendTelegramWork;
  let result: VnstockJobResult = { succeeded: 0, failed: [] };

  try {
    const tickers = options?.tickers ?? readWatchlistTickers();
    const syncFn = options?.syncFn ?? defaultSyncFn;

    logger.info(`[${JOB_NAME_TRADING_STATS}] starting sweep`, { tickerCount: tickers.length });

    result = await runSweep(JOB_NAME_TRADING_STATS, tickers, syncFn);

    logger.info(`[${JOB_NAME_TRADING_STATS}] sweep complete`, {
      succeeded: result.succeeded,
      failedCount: result.failed.length,
      failed: result.failed,
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
 */
export async function runVnstockTradingStatsJobCron(): Promise<void> {
  const db = getDb();
  await recordJobRun(db, JOB_NAME_TRADING_STATS, async () => {
    const result = await runVnstockTradingStatsJob();
    return { rowsWritten: result.succeeded };
  });
}
