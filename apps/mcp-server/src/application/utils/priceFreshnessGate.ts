/**
 * Price Freshness Gate — isPriceFresh()
 *
 * Checks whether market-price data (daily_ohlcv.updated_at) is fresh enough to
 * send a briefing / evening-summary. Shared by assembleBriefing.ts and
 * assembleEveningSummary.ts (FACTORY-APP-dedup-date-freshness-helpers —
 * previously duplicated verbatim in both files, differing only in the
 * stale-suppression log label).
 *
 * DDD LAYER: application/utils
 *   - May import infrastructure/ (logger) and domain/ (constants) — application
 *     layer is allowed to import both (same pattern as windowPartitioner.ts
 *     in this directory, which also imports infrastructure/logger.js).
 *
 * @module application/utils/priceFreshnessGate
 */

import type { Database } from "bun:sqlite";
import { logger } from "../../infrastructure/logger.js";
import { MS_PER_HOUR, PRICE_FRESHNESS_MS } from "../../domain/services/timeConstants.js";

/**
 * Check if market_prices data is fresh enough (≤ PRICE_FRESHNESS_MS old).
 * Returns true if MAX(daily_ohlcv.updated_at) is within the freshness window,
 * false otherwise (including when there is no data at all, or on DB error).
 *
 * @param db       SQLite Database connection
 * @param logLabel Caller-specific label substituted into the stale-suppression
 *                 warn log (e.g. "briefing" or "evening summary") — preserves
 *                 the pre-dedup per-caller log text ("suppressing <label> send").
 */
export async function isPriceFresh(db: Database, logLabel: string): Promise<boolean> {
  try {
    const row = db
      .prepare<{ latest: string | null }, []>("SELECT MAX(updated_at) as latest FROM daily_ohlcv")
      .get();

    if (!row?.latest) {
      // No data at all — consider stale
      return false;
    }

    const ageMs = Date.now() - new Date(row.latest).getTime();
    const ageHours = Math.round(ageMs / MS_PER_HOUR);

    // PRICE_FRESHNESS_MS / MS_PER_HOUR === 24 — same rounded-hour comparison as
    // the pre-dedup bare `ageHours <= 24` literal (behavior-preserving).
    const isFresh = ageHours <= PRICE_FRESHNESS_MS / MS_PER_HOUR;

    if (!isFresh) {
      logger.warn(`[freshness-gate] prices stale ${ageHours}h, suppressing ${logLabel} send`);
    }

    return isFresh;
  } catch (err) {
    logger.error("[freshness-gate] check failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    // On error, conservatively assume not fresh
    return false;
  }
}
