/**
 * Scheduler — IMF Indicator Poller Job (Task 1296b)
 *
 * Runs every 6 hours to refresh IMF economic indicators.
 * Fetches latest data, stores in DB, and classifies sentiment.
 *
 * Cron: "0 * /6 * * *" (every 6 hours: 00:00, 06:00, 12:00, 18:00 UTC)
 * Timeout: 30 seconds
 *
 * On HTTP failure: circuit breaker handles retry logic; job returns
 * { success: false } without crashing the scheduler.
 *
 * @module scheduler/market-data/imfIndicatorPollerJob
 */

import {
  fetchLatestImfIndicators,
  storeImfIndicators,
} from "../../application/services/imfDataFetcher.js";
import { classifyImfIndicators } from "../../domain/services/imfDataClassifier.js";
import type { ImfClassificationOutput } from "../../domain/models/imfIndicators.js";

// ── Job result type ───────────────────────────────────────────────────────────

export interface ImfPollerJobResult {
  success: boolean;
  indicator_count: number;
  sentiment?: ImfClassificationOutput;
  error?: string;
}

// ── Job implementation ────────────────────────────────────────────────────────

/**
 * Run the IMF indicator poller job.
 *
 * 1. Fetch latest indicators from IMF API (circuit-breaker protected)
 * 2. Store results in imf_indicators table
 * 3. Classify overall market sentiment
 * 4. Return structured result for cron-registry observability
 *
 * @returns ImfPollerJobResult — success flag + indicator count + classification
 */
export async function runImfIndicatorPollerJob(): Promise<ImfPollerJobResult> {
  try {
    // Step 1: Fetch
    const indicators = await fetchLatestImfIndicators();

    if (!indicators || indicators.length === 0) {
      throw new Error("IMF circuit breaker open or API unreachable");
    }

    // Step 2: Store
    await storeImfIndicators(indicators);

    // Step 3: Classify
    const sentiment = classifyImfIndicators({
      indicators,
      historicalBaseline: 3.0, // ~3% global baseline growth rate
    });

    console.info(
      `[IMF Poller] Success: ${indicators.length} indicators stored, ` +
      `sentiment=${sentiment.sentiment.toFixed(2)} (${sentiment.classification}), ` +
      `confidence=${sentiment.confidence.toFixed(2)}`,
    );

    return {
      success: true,
      indicator_count: indicators.length,
      sentiment,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[IMF Poller] Failed: ${message}`);
    return {
      success: false,
      indicator_count: 0,
      error: message,
    };
  }
}
