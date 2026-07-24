/**
 * Infrastructure — Generic macro-indicator plausibility gate
 *
 * FIX-DOWJONES-STALE-WRONG-VALUE: single source of truth for "is this value
 * even physically/market plausible for this indicator" — shared by EVERY
 * writer of `tracked_indicators` (news-mined regex extraction in
 * commodityTracker.ts, live-API mirrors in yahooFinance.ts, and any future
 * writer). Previously each writer either had no band at all, or an inline
 * one-off band (commodityTracker.ts's local MIN_VALUES/MAX_VALUES), so a
 * writer that forgot to check it (or a band that was too loose — dow_jones
 * had a floor of 10000 with NO ceiling) could silently persist a garbage
 * magnitude that later gets served to agents as "current".
 *
 * Root-cause case: dow_jones was observed serving 23750 (real DJIA ~42k,
 * ~44% wrong) via the "Auto-tracked Indicators" section of get_system_status
 * — sourced from a news-mined RSS regex match that had oscillated between
 * 10604, 23750, 23807, 48221 and 76848 within the same week (report 3237).
 * The regex extraction for dow_jones has been retired (see commodityTracker.ts
 * EXTRACTION_PATTERNS comment); the live Yahoo Finance ^DJI mirror
 * (yahooFinance.ts fetchDowJonesIndex/storeDowJonesIndex) is now the single
 * source of truth, and BOTH paths run every value through this gate before
 * a row is ever written — an out-of-band value is rejected (fail CLOSED),
 * never served silently.
 *
 * Layer: infrastructure/db — no I/O, pure data + a pure function.
 */

/** A plausibility band for one indicator. Either bound may be omitted (no floor/ceiling). */
export interface PlausibleRange {
  min?: number;
  max?: number;
}

/**
 * Known-plausible value bands, keyed by `tracked_indicators.indicator`.
 * Indicators absent from this map have NO gate (any finite positive number
 * is accepted) — bands are added deliberately as each indicator's failure
 * mode is discovered, matching the existing commodityTracker.ts precedent
 * (gold/brent/wti/sp500/etc.) rather than gating everything up front.
 *
 * Bounds are coarse magnitude sanity checks, not precision validators — wide
 * enough to tolerate normal volatility, tight enough to reject a wrong-order-
 * of-magnitude / wrong-field extraction.
 */
export const INDICATOR_PLAUSIBLE_RANGES: Record<string, PlausibleRange> = {
  gold_usd_oz:        { min: 500,   max: 10000 },  // Gold never below $500; never above $10000
  brent_crude_usd:    { min: 20,    max: 300 },     // Brent never below $20; never above $300
  wti_crude_usd:       { min: 20,    max: 300 },
  sp500:               { min: 1000 },               // S&P never below 1000 (no ceiling — unchanged from prior gate)
  // FIX-DOWJONES-STALE-WRONG-VALUE: floor raised 10000→25000, ceiling added
  // (was unbounded above). DJIA current regime ~40k-45k (2026); band rejects
  // the observed phantom magnitudes (10604, 23750, 23807, 76848) while still
  // tolerating a severe crash or a strong bull run.
  dow_jones:            { min: 25000, max: 60000 },
  nasdaq:               { min: 5000 },               // unchanged from prior gate (no ceiling)
  vnindex:              { min: 500 },                // unchanged from prior gate (no ceiling)
  wheat_usd_bushel:     { min: 3,    max: 20 },
  copper_usd:           { min: 1,    max: 20 },
  interest_rate_pct:    { min: 0.1,  max: 15 },
  inflation_pct:        { min: 0,    max: 30 },
  gdp_growth_pct:       { min: -20,  max: 20 },
  natgas_usd_mmbtu:     { min: 0.5,  max: 30 },
  soybean_usd_bushel:   { min: 5,    max: 30 },
  coffee_usd:           { min: 0.5,  max: 500 },
};

/**
 * Returns true if `value` falls within the known-plausible band for
 * `indicator`. Indicators with no configured band always pass (no gate).
 *
 * @param indicator - `tracked_indicators.indicator` value (e.g. "dow_jones").
 * @param value     - Candidate value to check before writing.
 */
export function isPlausibleIndicatorValue(indicator: string, value: number): boolean {
  if (!Number.isFinite(value)) return false;
  const range = INDICATOR_PLAUSIBLE_RANGES[indicator];
  if (!range) return true;
  if (range.min !== undefined && value < range.min) return false;
  if (range.max !== undefined && value > range.max) return false;
  return true;
}
