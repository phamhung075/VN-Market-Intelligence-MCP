/**
 * Market Scan Job — Task 103 (interface/scheduler layer)
 *
 * Thin wrapper around the `scanMarket` application use case.
 * Registered in `jobs.ts` for two daily cron slots:
 *   - 09:00 Asia/Ho_Chi_Minh (market open)   → `runMarketScan("open")`
 *   - 15:30 Asia/Ho_Chi_Minh (market close)  → `runMarketScan("close")`
 *
 * A concurrency guard prevents a second invocation from starting while the
 * previous scan is still running (e.g. if a cron fires during a long fetch).
 */

import { scanMarket } from "../../application/usecases/scanMarket.js";
import { logger } from "../../infrastructure/logger.js";
import { isTradingSession } from "../../infrastructure/fetchers/hose.js";
import { getDb } from "../../infrastructure/db/schema.js";
import { recordJobRun } from "../../infrastructure/db/cronJobRunStore.js";
import { SqliteWatchlistRepository } from "../../infrastructure/db/repositories/SqliteWatchlistRepository.js";
import { SqliteMarketPriceRepository } from "../../infrastructure/db/repositories/SqliteMarketPriceRepository.js";
import { shouldSkipRecoveryReplay } from "../startupHelpers.js";

// ─────────────────────────────────────────────────────────────────────────────
// Concurrency guard
// ─────────────────────────────────────────────────────────────────────────────

let isRunning = false;

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute one market price scan cycle.
 *
 * Calls `scanMarket()` with the production HOSE price fetcher.
 * Logs a summary line when the scan completes.
 * Skips the scan if a previous invocation is still running.
 *
 * @param label - "open" | "close" — used for log tagging only
 */
export async function runMarketScan(label: "open" | "close"): Promise<void> {
  if (isRunning) {
    logger.warn(`[market-scan:${label}] previous scan still running — skipped`);
    return;
  }

  // Skip on non-trading days/hours (safety net beyond cron expression)
  if (!isTradingSession()) {
    logger.debug(`[market-scan:${label}] market closed — skipping scan`);
    return;
  }

  isRunning = true;

  try {
    const db = getDb();

    // T4 dedup guard: skip if already ran within daily cadence window
    // @idempotency T4 — cron_job_runs recency guard; replay skipped if last success < 90% of daily cadence (21.6h window)
    const DAILY_CADENCE_MS = 86_400_000;
    if (shouldSkipRecoveryReplay(db, `marketScanJob:${label}`, DAILY_CADENCE_MS)) { isRunning = false; return; }

    // recordJobRun never re-throws — errors are captured in cron_job_runs.error_msg
    await recordJobRun(db, `marketScanJob:${label}`, async () => {
      const result = await scanMarket({
        watchlistRepo: new SqliteWatchlistRepository(db),
        marketPriceRepo: new SqliteMarketPriceRepository(db),
      });
      logger.info(
        `[market-scan:${label}] complete — ` +
          `scanned: ${result.scanned}, ` +
          `signals: ${result.signals}, ` +
          `alerts: ${result.alerts}`,
      );
      return { rowsWritten: result.signals };
    });
  } catch (err) {
    logger.error(`[market-scan:${label}] unhandled error`, {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    isRunning = false;
  }
}
