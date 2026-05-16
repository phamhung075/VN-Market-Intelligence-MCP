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
import { fetchFredEffrIorb } from "../../infrastructure/fetchers/fredEffrIorb.js";
import { fetchFredIsmSubcomponents } from "../../infrastructure/fetchers/fredIsmSubcomponents.js";


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

    // Upsert key Vietnam macro indicators into macro_indicators table.
    // This is the write path that populates the local SQLite copy from the
    // macro-service snapshot. UNIQUE(country) constraint → ON CONFLICT UPDATE.
    //
    // The /macro/snapshot endpoint returns oilUsd, goldUsd, usdVnd from Yahoo Finance.
    // sbvRefinancingRate is not exposed by this endpoint (reads from macro_indicators
    // itself in the macro-service container) — left null here.
    // commodity_prices table (separate) receives oil/gold via commodityTrackerRefresh.
    try {
      db.prepare(
        `INSERT INTO macro_indicators
           (country, interest_rate, fetched_at, last_refresh_job)
         VALUES (?, ?, datetime('now'), datetime('now'))
         ON CONFLICT(country) DO UPDATE SET
           interest_rate    = excluded.interest_rate,
           fetched_at       = excluded.fetched_at,
           last_refresh_job = excluded.last_refresh_job`
      ).run("Vietnam", snapshot.sbvRefinancingRate ?? null);
      logger.info("[macro-refresh-job] macro_indicators upserted for Vietnam");
    } catch (upsertErr) {
      // Non-fatal: log and continue — the Telegram notification still goes out
      logger.warn(
        `[macro-refresh-job] macro_indicators upsert skipped: ${upsertErr instanceof Error ? upsertErr.message : String(upsertErr)}`
      );
    }

    // Also persist commodity snapshot to commodity_prices table (source-keyed) so
    // MCP tools that read commodity_prices get fresh oil/gold/FX data.
    // Only write if at least one value is non-null to avoid empty noise rows.
    // commodity_prices schema: PRIMARY KEY = source, named cols per commodity.
    if (snapshot.oilUsd != null || snapshot.goldUsd != null || snapshot.usdVnd != null) {
      try {
        const now = new Date().toISOString();
        db.prepare(
          `INSERT INTO commodity_prices
             (source, brent_crude_usd, gold_usd_per_oz, usd_vnd_rate, fetched_at)
           VALUES ('macro-snapshot', ?, ?, ?, ?)
           ON CONFLICT(source) DO UPDATE SET
             brent_crude_usd = excluded.brent_crude_usd,
             gold_usd_per_oz = excluded.gold_usd_per_oz,
             usd_vnd_rate    = excluded.usd_vnd_rate,
             fetched_at      = excluded.fetched_at`
        ).run(
          snapshot.oilUsd  ?? 0,
          snapshot.goldUsd ?? 0,
          snapshot.usdVnd  ?? 0,
          now,
        );
        logger.info("[macro-refresh-job] commodity_prices upserted from macro snapshot");
      } catch (commErr) {
        // Non-fatal — log and continue
        logger.warn(
          `[macro-refresh-job] commodity_prices upsert skipped: ${commErr instanceof Error ? commErr.message : String(commErr)}`
        );
      }
    }

    // Log result to WORK channel.
    // snapshot.vnIndex is nullable (macro-service may lack DB access at startup).
    // Use canonical oilUsd/goldUsd fields; legacy brentPrice/goldPrice aliases are equal.
    const vnIndexStr = snapshot.vnIndex != null ? snapshot.vnIndex.toFixed(0) : "N/A";
    const msg = `Macro refresh OK — VN-Index: ${vnIndexStr}, Brent: $${snapshot.brentPrice.toFixed(2)}, Gold: $${snapshot.goldPrice.toFixed(0)} [${durationMs}ms]`;
    await sendTelegramWork(msg);

    // Fetch Fed Funds Rate from FRED (Task 1423b)
    const fedRate = await fetchFedFundsRate(undefined, db);
    if (fedRate !== null) {
      logger.info(`[macroRefresh] fed_funds_rate = ${fedRate}%`);
    } else {
      logger.warn("[macroRefresh] fed_funds_rate fetch returned null — FRED unavailable");
    }

    // Fetch EFFR + IORB daily series from FRED (Task 1879a)
    const effrIorbResult = await fetchFredEffrIorb(undefined, db);
    if (effrIorbResult !== null) {
      logger.info(
        `[macroRefresh] EFFR/IORB persisted — EFFR: ${effrIorbResult.effrRows} new rows, IORB: ${effrIorbResult.iorbRows} new rows`,
        { effrRows: effrIorbResult.effrRows, iorbRows: effrIorbResult.iorbRows },
      );
    } else {
      logger.warn("[macroRefresh] EFFR/IORB fetch returned null — FRED unavailable");
    }

    // Fetch ISM Manufacturing sub-component series from FRED (Task 1910a)
    const ismResult = await fetchFredIsmSubcomponents(undefined, db);
    if (ismResult !== null) {
      const totalInserted = Object.values(ismResult.inserted).reduce((a, b) => a + b, 0);
      logger.info(
        `[macroRefresh] ISM sub-components persisted — ${totalInserted} new rows, failed: [${ismResult.failed.join(",")}]`,
        { inserted: ismResult.inserted, failed: ismResult.failed },
      );
    } else {
      logger.warn("[macroRefresh] ISM sub-components fetch returned null — FRED_API_KEY absent or unavailable");
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
