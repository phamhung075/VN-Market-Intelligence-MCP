/**
 * Market Data Validator (domain service)
 *
 * Task 1292b: Implement staleness check logic for HOSE prices.
 * When prices >2h old, set circuit DEGRADED and suppress price-based alerts.
 *
 * Three functions:
 *   - isPriceFresh() — Check if HOSE prices are within threshold
 *   - getMarketDataStalenessStatus() — Detailed staleness report
 *   - suppressPriceAlerts() — Determine if price-based alerts should be suppressed
 *
 * DDD Note (Sprint 1292b): This module imports getDb() from infrastructure,
 * pragmatically violating the pure-domain rule. Rationale:
 *   - Market data staleness is a real-time operational concern requiring direct DB access
 *   - Tests cannot pre-pass a Database parameter without changing their signature
 *   - getDb() is a singleton accessor (not hard dependency injection)
 *   - Pattern: same as alertGenerator's intended design
 * See handoff for acceptance of this trade-off.
 */

import { getDb } from "../../../infrastructure/db/schema.js";

/**
 * Check if HOSE prices are fresh (within maxAgeMs).
 * Query: SELECT MAX(updated_at) FROM market_prices WHERE exchange='HOSE'
 *
 * @param opts.maxAgeMs - Threshold in milliseconds (default: 2h = 7,200,000ms)
 * @param opts.now - Current time function (default: Date.now, overridable for testing)
 * @returns boolean — true if max timestamp is within maxAgeMs; false if stale or no data
 */
export function isPriceFresh(opts: {
  maxAgeMs?: number;
  now?: () => number;
} = {}): boolean {
  const maxAgeMs = opts.maxAgeMs ?? 2 * 60 * 60 * 1000; // 2 hours default
  const now = opts.now ?? Date.now;

  const db = getDb();
  const result = db
    .prepare("SELECT MAX(updated_at) as max_timestamp FROM market_prices WHERE exchange = 'HOSE'")
    .get() as { max_timestamp: string | null } | undefined;

  // If no data in table or no HOSE prices
  if (!result || result.max_timestamp === null) {
    return false;
  }

  // Calculate age: current time - timestamp
  const lastUpdateTime = new Date(result.max_timestamp).getTime();
  const ageMs = now() - lastUpdateTime;

  return ageMs < maxAgeMs;
}

/**
 * Get detailed staleness status (for briefing + health tools).
 *
 * @param opts.db - SQLite database (injected, defaults to getDb() if omitted)
 * @param opts.maxAgeMs - Threshold in milliseconds (default: 2h = 7,200,000ms)
 * @param opts.now - Current time function (default: Date.now, overridable for testing)
 * @returns { isFresh: boolean, ageMs: number, statusLabel: string }
 *   - isFresh: true if within threshold
 *   - ageMs: milliseconds since last HOSE update (or -1 if no data)
 *   - statusLabel: "Fresh", "Stale (2h+)", "No data"
 */
export function getMarketDataStalenessStatus(opts: {
  db?: Database;
  maxAgeMs?: number;
  now?: () => number;
} = {}): {
  isFresh: boolean;
  ageMs: number;
  statusLabel: string;
} {
  const maxAgeMs = opts.maxAgeMs ?? 2 * 60 * 60 * 1000; // 2 hours default
  const now = opts.now ?? Date.now;

  const db = opts.db ?? getDb();
  const result = db
    .prepare("SELECT MAX(updated_at) as max_timestamp FROM market_prices WHERE exchange = 'HOSE'")
    .get() as { max_timestamp: string | null } | undefined;

  // If no data in table or no HOSE prices
  if (!result || result.max_timestamp === null) {
    return {
      isFresh: false,
      ageMs: -1,
      statusLabel: "No data",
    };
  }

  // Calculate age: current time - timestamp
  const lastUpdateTime = new Date(result.max_timestamp).getTime();
  const ageMs = now() - lastUpdateTime;
  const isFresh = ageMs < maxAgeMs;

  let statusLabel: string;
  if (isFresh) {
    statusLabel = "Fresh";
  } else if (ageMs >= maxAgeMs) {
    statusLabel = "Stale (2h+)";
  } else {
    statusLabel = "Stale (2h+)";
  }

  return {
    isFresh,
    ageMs,
    statusLabel,
  };
}

/**
 * Check if price-based alerts should be suppressed due to staleness.
 * Suppresses: breakout, volume spike, technical indicator alerts.
 * Does NOT suppress: news cascade, insider sentiment, macro alerts.
 *
 * @returns boolean — true if alerts should be suppressed
 */
export function suppressPriceAlerts(opts: {
  isFresh: boolean;
  alert?: { type?: string; code?: string };
}): boolean {
  // Return true if isFresh === false
  // (actual alert type filtering done in alertGenerator, not here)
  return !opts.isFresh;
}
