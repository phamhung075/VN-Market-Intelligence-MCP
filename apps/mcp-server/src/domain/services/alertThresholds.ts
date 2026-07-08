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

/**
 * Confidence range for foreignFlowAlertJob HIGH-severity signals
 * (FACTORY-SCHEDULER-alert-confidence-literals).
 *
 * Replaces the frozen `confidence = 0.75` literal previously persisted on both
 * the alert signal and the evidence fragment. Confidence is now derived from the
 * job's own already-computed magnitude — `min(1, |totalNetVolume3d| / 500_000)`
 * (see foreignFlowAlertJob.ts) — via deriveConfidenceFromStrength():
 *
 *   strength=0 (barely qualifies for HIGH, ~100k shares/3d) → base    = 0.55
 *   strength=1 (>=500k shares/3d net flow, capped)          → ceiling = 0.95
 *
 * Tuning: raise CEILING to make a maxed-out 3-day net flow more decisive;
 * raise BASE to make even a borderline HIGH signal more trusted.
 */
export const FOREIGN_FLOW_CONFIDENCE_BASE = 0.55;
export const FOREIGN_FLOW_CONFIDENCE_CEILING = 0.95;

/**
 * Confidence range for insiderCheckJob accumulation-streak signals
 * (FACTORY-SCHEDULER-alert-confidence-literals).
 *
 * Replaces the frozen `confidence = 0.85` literal previously persisted on both
 * the streak evidence fragment and the streak alert row. Confidence is now
 * derived from the job's own already-computed streak-length magnitude —
 * `min(1, streak.buyDays / 10)` (see insiderCheckJob.ts) — via
 * deriveConfidenceFromStrength():
 *
 *   strength=0 (minimum qualifying streak, 3 distinct buy days) → base    = 0.60
 *   strength=1 (10+ distinct buy days within the 30d window)    → ceiling = 0.95
 *
 * Concrete examples: buyDays=3 → confidence≈0.705; buyDays=8 → confidence≈0.88.
 * Note: the single-transaction buy alert path (classifyInsiderTransaction) was
 * already dynamic before this task and is untouched here.
 */
export const INSIDER_STREAK_CONFIDENCE_BASE = 0.6;
export const INSIDER_STREAK_CONFIDENCE_CEILING = 0.95;

/**
 * Confidence range for bbAlertScanJob Bollinger-Band breakout signals
 * (FACTORY-SCHEDULER-alert-confidence-literals).
 *
 * Replaces the frozen `confidence = 0.65` literal. Confidence is now derived
 * from how far the close price penetrated past the BB20 band, relative to the
 * band's own width — see computeBbBreakoutStrength() in
 * domain/services/bbBreakoutStrength.ts — via deriveConfidenceFromStrength():
 *
 *   strength=0 (close just barely outside the band)         → base    = 0.55
 *   strength=1 (close penetrated >= 1 full band-width past)  → ceiling = 0.85
 *
 * Capped lower than the HIGH-severity jobs above (0.95) because a BB breakout
 * is a "warning"-severity, noisier intraday signal (Alert.severity="warning").
 */
export const BB_BREAKOUT_CONFIDENCE_BASE = 0.55;
export const BB_BREAKOUT_CONFIDENCE_CEILING = 0.85;

/**
 * Confidence range for taAlertScanJob RSI overbought/oversold signals
 * (FACTORY-SCHEDULER-alert-confidence-literals).
 *
 * Replaces the frozen `confidence = 0.7` literal. Confidence is now derived
 * from how far RSI(14) sits past its own 70/30 threshold, normalised against
 * the remaining distance to the RSI scale boundary (100 or 0) — see
 * computeRsiExtremityStrength() in domain/services/rsiExtremityStrength.ts —
 * via deriveConfidenceFromStrength():
 *
 *   strength=0 (RSI just crossed 70 or 30)  → base    = 0.55
 *   strength=1 (RSI saturated at 100 or 0)  → ceiling = 0.85
 *
 * Same warning-tier range as BB_BREAKOUT_CONFIDENCE_* for consistency between
 * the two intraday TA scan jobs (both emit Alert.severity="warning").
 */
export const RSI_EXTREME_CONFIDENCE_BASE = 0.55;
export const RSI_EXTREME_CONFIDENCE_CEILING = 0.85;
