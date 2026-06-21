/**
 * alertThresholds — Domain Service: Alert emission thresholds (tunable constants)
 *
 * Centralises configurable gate values used by alert scan jobs so they are
 * easy to tune without hunting through scheduler code.
 *
 * DDD layer: domain/services — pure constants, no I/O, no imports.
 *
 * @module domain/services/alertThresholds
 */

/**
 * Minimum single-day volume (shares) required before a BB or TA alert is emitted.
 *
 * Rationale: bbAlertScanJob and taAlertScanJob already reject stub-bars
 * (volume <= 0).  This positive floor adds a liquidity quality gate:
 * a technically valid band-break or RSI extreme on a thinly-traded ticker
 * (e.g. D2D at 6.4K daily volume) is low-conviction noise that pollutes the
 * evening digest.  100K shares/day is a conservative lower bound for HOSE/HNX
 * tickers to be considered "liquid enough to act on".
 *
 * Tuning: raise this value if the digest still carries too many illiquid alerts;
 * lower it only after confirming no valid liquid tickers are suppressed.
 */
export const MIN_DAILY_VOLUME_FOR_ALERTS = 100_000;

/**
 * Neutral-band threshold for prediction claim resolution (PRED-RESOLVER-GAP-FIX).
 *
 * A neutral prediction claim is scored as a HIT when the absolute price move
 * from creation_price to actual_price is strictly less than this percentage.
 * At or above this threshold, the claim is scored as a MISS.
 *
 * Unit: percentage points (2.0 = 2.0%)
 * Formula: |actual - creation| / creation * 100 < NEUTRAL_BAND_PCT → HIT (1)
 *
 * Tuning: lower this value to make neutral calls harder to hit; raise it to
 * be more lenient about flat-market calls. Default 2.0% is a conservative
 * lower bound matching typical VN market intraday noise.
 */
export const NEUTRAL_BAND_PCT = 2.0;
