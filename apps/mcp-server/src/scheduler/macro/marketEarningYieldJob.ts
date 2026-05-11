/**
 * Scheduler Job — Market Earning Yield
 *
 * Daily cron at 09:30 UTC (16:30 VN, ICT = UTC+7), weekdays only.
 * Fires after market close so intraday prices are fully settled.
 *
 * Calls the computeAndStoreMarketEarningYield() use-case which:
 *   - Reads watchlist tickers from the DB
 *   - Fetches latest PE from vnstock_financials per ticker
 *   - Computes market-wide median PE and earnings yield
 *   - Writes two rows to tracked_indicators (market_earning_yield, market_median_pe)
 *
 * Logs result at INFO level. No Telegram alert on completion.
 * If coverage < 70%, the use-case logs a WARN and skips the DB write.
 *
 * Sprint: 1426 — Báu Phase 2 (Dinh Gia)
 * Task: TASK-1426a
 * Schedule: 30 9 * * 1-5 UTC (= 16:30 VN weekdays)
 *
 * @module scheduler/macro/marketEarningYieldJob
 */

import { computeAndStoreMarketEarningYield } from "../../application/usecases/computeMarketEarningYield.js";
import { logger } from "../../infrastructure/logger.js";

/**
 * Runs the market earning yield computation and storage.
 *
 * Designed to be called by startScheduler() inside a recordJobRun() wrapper.
 */
export async function runMarketEarningYieldJob(): Promise<void> {
  const start = Date.now();

  try {
    const result = await computeAndStoreMarketEarningYield();

    const durationMs = Date.now() - start;

    if (result.stored && result.result) {
      logger.info(
        `[market-earning-yield-job] OK — ` +
        `medianPE=${result.result.medianPE.toFixed(2)} ` +
        `earningYield=${result.result.earningYield.toFixed(4)}% ` +
        `coverage=${result.validCount}/${result.totalCount} ` +
        `dataAsOf=${result.result.dataAsOf} [${durationMs}ms]`,
      );
    } else if (result.refused) {
      logger.warn(
        `[market-earning-yield-job] refused — ` +
        `coverage=${result.validCount}/${result.totalCount} = ` +
        `${(result.refused.coverageRatio * 100).toFixed(1)}% < 70% — no DB write [${durationMs}ms]`,
      );
    } else {
      logger.warn(`[market-earning-yield-job] no result — watchlist empty? [${durationMs}ms]`);
    }
  } catch (err) {
    const durationMs = Date.now() - start;
    logger.error(
      `[market-earning-yield-job] uncaught error [${durationMs}ms]: ` +
      `${err instanceof Error ? err.message : String(err)}`,
    );
    // Re-throw so recordJobRun() marks the job as failed in cron_job_runs
    throw err;
  }
}
