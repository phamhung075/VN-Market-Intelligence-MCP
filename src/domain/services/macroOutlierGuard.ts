/**
 * Macro Indicator Outlier Guard — Tasks 1203 & 1217
 *
 * Validates that daily percentage changes reported for macro indicators are
 * within statistically plausible bounds before they are allowed to influence
 * cascade rules.
 *
 * Thresholds (based on historical maximum single-day moves):
 *   EQUITY_INDEX — ±25%  (Black Monday 1987 was ~-22%; anything beyond that is data error)
 *   COMMODITY    — ±50%  (extreme supply shocks; beyond this indicates a feed error)
 *
 * A value AT or BEYOND the threshold (|change| >= threshold) is flagged as a
 * `data_anomaly` and must be discarded by callers — no cascade rules should fire.
 *
 * Design:
 *   - Pure function — no I/O, no side effects, no async.
 *   - Layer: domain/services — zero infrastructure imports.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Asset class determines which outlier threshold is applied.
 */
export enum MacroAssetClass {
  /** Equity indices: S&P 500, Dow Jones, VN-Index, Nikkei, etc. */
  EQUITY_INDEX = "EQUITY_INDEX",
  /** Energy and industrial commodities: Brent, WTI, Natural Gas, Copper, etc. */
  COMMODITY = "COMMODITY",
  /** Precious metals: Gold, Silver, Platinum. Tighter threshold than generic commodities. */
  PRECIOUS_METAL = "PRECIOUS_METAL",
}

/**
 * Result returned by validateMacroChangePercent.
 *
 * When isAnomaly is true, the caller MUST discard the indicator value and
 * skip any cascade rules that depend on it.
 */
export interface MacroOutlierResult {
  /** Name of the indicator being validated (passed through unchanged). */
  indicatorName: string;
  /** The raw percentage change being validated. */
  changePercent: number;
  /** Asset class used for threshold selection. */
  assetClass: MacroAssetClass;
  /** True if the value is statistically impossible and should be discarded. */
  isAnomaly: boolean;
  /**
   * Human-readable reason when isAnomaly is true; null when valid.
   * Format: "<indicatorName>: |changePercent|% exceeds <threshold>% threshold for <assetClass>"
   */
  reason: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Thresholds
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maximum plausible absolute daily percentage change per asset class.
 * Changes at or beyond this value are classified as data anomalies.
 */
const OUTLIER_THRESHOLDS: Record<MacroAssetClass, number> = {
  [MacroAssetClass.EQUITY_INDEX]: 25,  // ±25%: beyond Black Monday levels
  [MacroAssetClass.COMMODITY]: 50,     // ±50%: extreme supply shock ceiling (oil, gas, copper)
  [MacroAssetClass.PRECIOUS_METAL]: 40, // ±40%: tighter bound for gold/silver (historically max ~30%)
};

// ─────────────────────────────────────────────────────────────────────────────
// Core function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate a daily percentage change for a macro indicator.
 *
 * Returns a MacroOutlierResult with isAnomaly=true if the absolute value of
 * changePercent meets or exceeds the threshold for the given asset class.
 *
 * Callers MUST check isAnomaly and skip cascade processing when true.
 *
 * @param indicatorName - Human-readable name (e.g. "Dow Jones", "Brent Crude")
 * @param changePercent - Daily percentage change (e.g. 59 for +59%, -69 for -69%)
 * @param assetClass    - Asset class determining which threshold to apply
 * @returns MacroOutlierResult
 */
export function validateMacroChangePercent(
  indicatorName: string,
  changePercent: number,
  assetClass: MacroAssetClass,
): MacroOutlierResult {
  const threshold = OUTLIER_THRESHOLDS[assetClass];
  const absChange = Math.abs(changePercent);
  const isAnomaly = absChange >= threshold;

  return {
    indicatorName,
    changePercent,
    assetClass,
    isAnomaly,
    reason: isAnomaly
      ? `${indicatorName}: |${changePercent}%| exceeds ±${threshold}% threshold for ${assetClass} — marked data_anomaly, cascade skipped`
      : null,
  };
}
