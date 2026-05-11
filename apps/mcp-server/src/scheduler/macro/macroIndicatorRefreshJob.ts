/**
 * Scheduler — Macro Indicator Daily Refresh Job
 *
 * Runs daily at 06:00 GMT+7 (before market open) to refresh macro data.
 * Uses multi-source fetcher with fallback chain.
 * Validates freshness SLA post-refresh and escalates on breach.
 * Detects stale data on startup and alerts.
 *
 * Task 239: Daily refresh enforcement + SLA validation
 *
 * @module scheduler/macro/macroIndicatorRefreshJob
 */

import { getDb } from "../../infrastructure/db/schema.js";
import { getMacroSnapshot } from "../../infrastructure/microservices/clients.js";
import { freshnessSlaChecker, detectStartupStaleData } from "../../domain/services/macroIndicatorSla.js";
import { sendTelegramWork } from "../../infrastructure/notifiers/telegram.js";
import type { Database } from "bun:sqlite";
import { logger } from "../../infrastructure/logger.js";
import { recordJobMetrics } from "../../infrastructure/observability/jobMetrics.js";
import { fetchFedFundsRate } from "../../infrastructure/fetchers/fredApi.js";


/**
 * Wraps sendTelegramWork to match the expected callback signature.
 * The domain service expects: (channel: string, message: string) => Promise<void>
 * But sendTelegramWork is: (text: string, options?: SendTelegramOptions) => Promise<boolean>
 */
async function telegramCallback(
  channel: string,
  message: string,
  options?: { tag?: string },
): Promise<void> {
  if (channel === "work") {
    const textWithTag = options?.tag ? `[${options.tag}] ${message}` : message;
    await sendTelegramWork(textWithTag);
  }
}

/**
 * Main job: fetch macro indicators from microservice, validate SLA.
 *
 * Calls getMacroSnapshot() from macro-service and logs results to WORK channel.
 * If SLA is breached (data > 24h old), sends escalation alert.
 */
export async function macroIndicatorRefreshJob(): Promise<void> {
  const db = getDb();
  const startTime = Date.now();
  let jobErrorCount = 0;
  let jobSuccessCount = 0;

  try {
    // Call macro-service microservice
    const snapshot = await getMacroSnapshot();
    const durationMs = Date.now() - startTime;

    jobSuccessCount = 1;

    // Log result to WORK channel
    const msg = `Macro refresh OK — VN-Index: ${snapshot.vnIndex.toFixed(0)}, Brent: $${snapshot.brentPrice.toFixed(2)}, Gold: $${snapshot.goldPrice.toFixed(0)} [${durationMs}ms]`;
    await sendTelegramWork(msg);

    // Fetch Fed Funds Rate from FRED (Task 1423b)
    const fedRate = await fetchFedFundsRate(undefined, db);
    if (fedRate !== null) {
      logger.info(`[macroRefresh] fed_funds_rate = ${fedRate}%`);
    } else {
      logger.warn("[macroRefresh] fed_funds_rate fetch returned null — FRED unavailable");
    }

    // Check SLA after refresh
    const slaOk = await freshnessSlaChecker(db, telegramCallback);
    if (!slaOk) {
      // freshnessSlaChecker already sent the alert to WORK channel
      logger.warn("[macro-refresh-job] SLA check failed — alert sent to WORK");
    }
  } catch (err) {
    const durationMs = Date.now() - startTime;
    jobErrorCount = 1;
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error(`[macro-refresh-job] fatal error: ${errorMsg}`);
    await sendTelegramWork(
      `Macro refresh FAILED [${durationMs}ms] — ${errorMsg}`,
    );
  } finally {
    recordJobMetrics("macroRefresh", Date.now() - startTime, jobErrorCount, jobSuccessCount);
  }
}

/**
 * Startup validation: check if macro_indicators data is stale.
 *
 * On scheduler startup, validates that macro_indicators table has data
 * and that data is not older than 24 hours. If stale, sends WORK alert
 * but does NOT auto-correct.
 */
export async function validateMacroFreshnessOnStartup(): Promise<void> {
  const db = getDb();

  try {
    await detectStartupStaleData(db, telegramCallback);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[macro-startup-validation] error: ${errorMsg}`);
    // Don't alert on validation errors — just log them
  }
}
