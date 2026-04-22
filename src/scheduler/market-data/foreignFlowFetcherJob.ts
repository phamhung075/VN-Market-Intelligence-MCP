/**
 * Task 1290 — Foreign Flow Fallback Fetcher Job
 *
 * Fetches foreign flow data every 60 seconds using fallback strategy:
 * 1. Primary: VPS endpoint (CB-wrapped, 5s timeout)
 * 2. Cache: In-memory cache from last successful run (<2h old)
 * 3. SSE: Recent broadcast messages (if available)
 * 4. None: Return empty with warning
 *
 * Resilience for VPS outages — when endpoint is down, cache/SSE keeps
 * daily_ohlcv updated. Alert Commander can use stale data with low
 * confidence until primary recovers.
 *
 * @module scheduler/market-data/foreignFlowFetcherJob
 */

import { logger } from "../../infrastructure/logger.js";
import { recordJobRun } from "../../infrastructure/db/cronJobRunStore.js";
import { fetchForeignFlowWithFallback } from "../../infrastructure/fetchers/foreignFlowFetcher.js";
import { getDb } from "../../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ForeignFlowFetcherJobResult {
  /** Which source provided the data: primary|cache|sse|none */
  source: 'primary' | 'cache' | 'sse' | 'none';
  /** Number of rows written to daily_ohlcv */
  changes: number;
  /** ISO 8601 timestamp when fetch completed */
  timestamp: string;
  /** True if fallback was activated (primary unavailable) */
  fallbackActivated: boolean;
  /** Warning if relevant (e.g., stale cache, all fallbacks exhausted) */
  warning?: string;
  /** Circuit breaker state for observability */
  cbState?: 'closed' | 'open' | 'half-open';
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch foreign flow data with fallback strategy.
 * Handles all four sources: primary → cache → SSE → none.
 *
 * Returns a ForeignFlowFetcherJobResult that includes:
 * - source (where data came from)
 * - changes (rows written to daily_ohlcv)
 * - timestamp (ISO 8601)
 * - fallbackActivated (boolean)
 * - warning (optional, if SLA/diagnostics needed)
 * - cbState (circuit breaker state)
 */
export async function runForeignFlowFetcherJob(
  overrides?: {
    now?: () => Date;
    fetchFn?: (url: string, opts?: any) => Promise<Response>;
  },
): Promise<ForeignFlowFetcherJobResult> {
  const now = overrides?.now ?? (() => new Date());
  const timestamp = now().toISOString();

  try {
    // Get circuit breaker state for logging
    const { breakers } = await import("../../infrastructure/circuitBreakerRegistry.js");
    const cbState = breakers.foreignFlow.stats.state as 'closed' | 'open' | 'half-open';

    // Call fallback fetcher (handles primary → cache → SSE → none)
    const fetchResult = await fetchForeignFlowWithFallback(overrides);

    // If source is 'primary' and CB was open, we recovered
    if (fetchResult.source === 'primary') {
      logger.info('[foreign-flow-job] primary endpoint success', {
        changes: fetchResult.changes,
        timestamp,
        cbState,
      });
    } else {
      // Fallback was activated
      logger.warn('[foreign-flow-job] fallback activated', {
        source: fetchResult.source,
        changes: fetchResult.changes,
        warning: fetchResult.warning,
        cbState,
      });
    }

    // Return result with circuit breaker state
    return {
      source: fetchResult.source,
      changes: fetchResult.changes,
      timestamp: fetchResult.timestamp,
      fallbackActivated: fetchResult.source !== 'primary',
      warning: fetchResult.warning,
      cbState,
    };
  } catch (err) {
    // Unexpected error — should not happen with fetchForeignFlowWithFallback,
    // but log it and return empty result with diagnostic
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error('[foreign-flow-job] unexpected error', {
      error: errMsg,
      timestamp,
    });

    const { breakers } = await import("../../infrastructure/circuitBreakerRegistry.js");
    const cbState = breakers.foreignFlow.stats.state as 'closed' | 'open' | 'half-open';

    return {
      source: 'none',
      changes: 0,
      timestamp,
      fallbackActivated: true,
      warning: `unexpected error: ${errMsg}`,
      cbState,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cron-callable wrapper with recordJobRun observability
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cron-callable wrapper for the foreign flow fetcher job.
 *
 * Called every 60 seconds (*/1 * * * * in UTC).
 * Wraps runForeignFlowFetcherJob in recordJobRun for observability.
 * Used by jobs.ts at every minute (CRON_FOREIGN_FLOW_FETCH).
 *
 * @returns void (result logged internally)
 */
export async function runForeignFlowFetcherJobCron(): Promise<void> {
  const database = getDb();

  await recordJobRun(database, 'foreignFlowFetcherJob', async () => {
    const result = await runForeignFlowFetcherJob();

    // Log summary for diagnostics
    if (result.source !== 'primary' && result.source !== 'none') {
      logger.info('[foreign-flow-job] fallback success', {
        source: result.source,
        changes: result.changes,
      });
    } else if (result.source === 'none') {
      logger.warn('[foreign-flow-job] all fallbacks exhausted', {
        warning: result.warning,
      });
    }

    return { rowsWritten: result.changes };
  });
}
