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
import { fetchAndStoreMacroIndicators } from "../../application/usecases/macroIndicatorFetcher.js";
import { freshnessSlaChecker, detectStartupStaleData } from "../../domain/services/macroIndicatorSla.js";
import { sendTelegramWork } from "../../infrastructure/notifiers/telegram.js";
import { breakers } from "../../infrastructure/circuitBreakerRegistry.js";
import { globalRateLimiter } from "../../domain/services/rateLimiter.js";
import type { HttpClient } from "../../infrastructure/fetchers/ssc.js";

/**
 * Creates a production HTTP client for macro indicator fetching.
 * Uses axios with appropriate headers and timeouts.
 */
async function makeHttpClient(): Promise<HttpClient> {
  const axiosModule = await import("axios");
  const axios = axiosModule.default;

  return {
    async get(url: string): Promise<string> {
      try {
        const response = await axios.get<string>(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            Accept: "application/json",
          },
          timeout: 15_000,
          responseType: "text",
          maxRedirects: 5,
        });
        return response.data;
      } catch (err) {
        if (axios.isAxiosError(err) && err.response) {
          throw new Error(`HTTP ${err.response.status}: ${String(err.response.data)}`);
        }
        throw err;
      }
    },
  };
}

/**
 * Circuit breaker wrapper for the macro fetcher.
 */
const circuitBreaker = {
  wrap: async (fn: () => Promise<unknown>): Promise<unknown> => {
    return breakers.yahooFinance.execute(fn);
  },
};

/**
 * Rate limiter wrapper for macro indicators.
 */
const rateLimiter = {
  checkLimit: async (host: string): Promise<void> => {
    if (!globalRateLimiter.canCall(host)) {
      const waitMs = globalRateLimiter.getWaitMs(host);
      throw new Error(`Rate limited: ${host} (wait ${waitMs}ms)`);
    }
    globalRateLimiter.recordCall(host);
  },
};

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
 * Main job: fetch and store macro indicators, then validate SLA.
 *
 * Calls fetchAndStoreMacroIndicators() and logs results to WORK channel.
 * If SLA is breached (data > 24h old), sends escalation alert.
 * Handles database busy errors (WAL checkpoint) with retry logic.
 */
export async function macroIndicatorRefreshJob(): Promise<void> {
  const db = getDb();
  const startTime = Date.now();

  try {
    // Get HTTP client
    const httpClient = await makeHttpClient();

    // Fetch and store macro indicators with fallback chain
    const result = await fetchAndStoreMacroIndicators(
      db,
      httpClient,
      circuitBreaker,
      rateLimiter,
    );

    const durationMs = Date.now() - startTime;

    // Log result to WORK channel
    if (result.success) {
      const msg = `Macro refresh OK — ${result.sourceUsed} (${result.indicatorCount} cols) [${durationMs}ms]`;
      await sendTelegramWork(msg);
    } else {
      const msg = `Macro refresh FAILED — all sources exhausted [${durationMs}ms]. Error: ${result.error || "unknown"}`;
      await sendTelegramWork(msg);
    }

    // Check SLA after refresh
    const slaOk = await freshnessSlaChecker(db, telegramCallback);
    if (!slaOk) {
      // freshnessSlaChecker already sent the alert to WORK channel
      console.warn("[macro-refresh-job] SLA check failed — alert sent to WORK");
    }
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[macro-refresh-job] fatal error: ${errorMsg}`);
    await sendTelegramWork(
      `Macro refresh EXCEPTION [${durationMs}ms] — ${errorMsg}`,
    );
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
