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

import { scanMarket } from "../application/usecases/scanMarket.js";
import { logger } from "../infrastructure/logger.js";

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

  isRunning = true;

  try {
    const result = await scanMarket();
    logger.info(
      `[market-scan:${label}] complete — ` +
        `scanned: ${result.scanned}, ` +
        `signals: ${result.signals}, ` +
        `alerts: ${result.alerts}`,
    );
  } catch (err) {
    logger.error(`[market-scan:${label}] unhandled error`, {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    isRunning = false;
  }
}
