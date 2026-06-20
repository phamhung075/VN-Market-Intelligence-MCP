/**
 * Macro Thresholds — Domain Service
 *
 * Replaces hardcoded absolute thresholds ($100/bbl, $4000/oz, 25500 VND)
 * with **relative thresholds** based on rolling mean ± N×σ (standard deviation).
 *
 * This makes the cascade engine resilient to market regime changes:
 *   - If gold averages $4500 for 3 months, $4600 is NOT extreme
 *   - If oil averaged $60 last quarter, $90 IS extreme (>2σ)
 *
 * Threshold levels:
 *   - ELEVATED:  > mean + 1σ  or  < mean - 1σ
 *   - HIGH:      > mean + 2σ  or  < mean - 2σ
 *   - EXTREME:   > mean + 3σ  or  < mean - 3σ
 *
 * Layer: domain/services — pure logic, receives pre-computed stats.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Rolling statistics for a single macro indicator. */
export interface MacroStats {
  /** Indicator name (e.g. "brentCrudeUSD", "goldUSDPerOz", "usdVndRate") */
  name: string;
  /** Current value */
  current: number;
  /** Rolling mean over the lookback window */
  mean: number;
  /** Standard deviation over the lookback window */
  stdDev: number;
  /** Number of data points used to compute stats */
  sampleCount: number;
}

/** How far the current value deviates from the rolling mean. */
export type DeviationLevel = "normal" | "elevated" | "high" | "extreme";

/** Direction of deviation from mean. */
export type DeviationDirection = "above" | "below" | "at_mean";

/** Result of classifying a macro indicator's current position. */
export interface MacroDeviation {
  name: string;
  current: number;
  mean: number;
  stdDev: number;
  /** How many σ away from mean (signed: positive = above, negative = below) */
  zScore: number;
  level: DeviationLevel;
  direction: DeviationDirection;
  /** Human-readable summary, e.g. "Dầu Brent ở mức cao (+2.3σ trên TB 30 ngày)" */
  summary: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Vietnamese display names
// ─────────────────────────────────────────────────────────────────────────────

const INDICATOR_NAME_VI: Record<string, string> = {
  brentCrudeUSD: "Dầu Brent",
  goldUSDPerOz: "Vàng",
  usdVndRate: "USD/VND",
  usdVndOfficial: "USD/VND (SBV)",
  refinancingRatePct: "Lãi suất tái cấp vốn",
  overnightRatePct: "Lãi suất qua đêm",
};

const LEVEL_VI: Record<DeviationLevel, string> = {
  normal: "bình thường",
  elevated: "cao hơn TB",
  high: "cao bất thường",
  extreme: "cực cao",
};

const LEVEL_VI_BELOW: Record<DeviationLevel, string> = {
  normal: "bình thường",
  elevated: "thấp hơn TB",
  high: "thấp bất thường",
  extreme: "cực thấp",
};

// ─────────────────────────────────────────────────────────────────────────────
// FX slow-mover classification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * FX slow-mover indicators — exchange rates whose stdDev window can be
 * pathologically tight relative to the price level, causing phantom σ-spikes.
 *
 * These indicators require BOTH a σ-test AND an absolute %-move floor before
 * escalating to high/extreme. The set is intentionally generic (covers any
 * SBV-fixed or market FX rate), NOT a single-indicator hardcode.
 *
 * Excluded: interest rates (refinancingRatePct, overnightRatePct) — those are
 * expressed as percentage-points already; a %-of-% floor is not meaningful.
 */
const FX_SLOW_MOVER_INDICATORS = new Set([
  "usdVndRate",
  "usdVndOfficial",
  "cnyVndRate",
  "eurVndRate",
  "jpyVndRate",
]);

/**
 * Minimum %-move floor for FX slow-mover indicators before high/extreme fires.
 *
 * 0.5% is derived from the SBV daily fix band: typical valid moves are
 * ±0.3–0.4%; genuine macro events (devaluation, policy shock) exceed 0.5%.
 * A normal 66 VND drift on a 26,269 base = 0.25% → should be INFO/WARN only.
 */
const FX_PERCENT_FLOOR = 0.5; // percent (0.5 = 0.5%)

// ─────────────────────────────────────────────────────────────────────────────
// Core functions
// ─────────────────────────────────────────────────────────────────────────────

/** Minimum sample size to compute meaningful statistics. */
const MIN_SAMPLE_SIZE = 5;

/**
 * Computes rolling mean and standard deviation from an array of values.
 *
 * @param values - Historical values (most recent first or any order)
 * @returns { mean, stdDev } or null if insufficient data
 */
export function computeRollingStats(
  values: number[],
): { mean: number; stdDev: number } | null {
  if (values.length < MIN_SAMPLE_SIZE) return null;

  const n = values.length;
  const mean = values.reduce((sum, v) => sum + v, 0) / n;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);

  return { mean: Math.round(mean * 100) / 100, stdDev: Math.round(stdDev * 100) / 100 };
}

/**
 * Classifies how far the current value deviates from the rolling mean.
 *
 * @param stats - Pre-computed rolling statistics for the indicator
 * @returns MacroDeviation with z-score, level, and Vietnamese summary
 */
export function classifyDeviation(stats: MacroStats): MacroDeviation {
  const { name, current, mean, stdDev, sampleCount } = stats;

  // Not enough data → treat as normal
  if (sampleCount < MIN_SAMPLE_SIZE || stdDev < 0.001) {
    return {
      name, current, mean, stdDev,
      zScore: 0,
      level: "normal",
      direction: "at_mean",
      summary: `${INDICATOR_NAME_VI[name] ?? name}: chưa đủ dữ liệu lịch sử`,
    };
  }

  const zScore = Math.round(((current - mean) / stdDev) * 100) / 100;
  const absZ = Math.abs(zScore);

  // Minimum absolute deviation guards for indicators with inherent micro-fluctuations
  // (e.g., SBV FX rates oscillate ±2-3 VND daily)
  // This prevents false-positive CRITICAL alerts on economically meaningless moves.
  const absDeviation = Math.abs(current - mean);
  // Task 1270: raised from 10 → 50 VND (≈0.2% of 26,100 base).
  // 50 VND is the minimum economically observable move in the USD/VND SBV fix rate.
  const minAbsDeviation = name.toLowerCase().includes("vnd") ? 50 : 0;

  // Base level from σ-test alone
  let level: DeviationLevel =
    absZ >= 3 ? "extreme" :
    absZ >= 2 ? "high" :
    absZ >= 1 ? "elevated" :
    "normal";

  // Guard 1 (existing): absolute VND deviation floor.
  // If absolute deviation is below the threshold, downgrade to cap at "elevated".
  if (minAbsDeviation > 0 && absDeviation < minAbsDeviation) {
    // For VND indicators with small moves: cap at "elevated"
    level = level === "extreme" || level === "high" ? "elevated" : level;
  }

  // Guard 2 (FX-SIGMA-PHANTOM-EXTREME): %-move floor for FX slow-movers.
  // When the rolling stdDev window is pathologically tight (e.g., ~12 VND on USD/VND),
  // a trivial 0.25% daily drift reads as 5σ+ CRITICAL. Require BOTH a σ-test AND
  // an absolute %-move above FX_PERCENT_FLOOR before escalating to high/extreme.
  // The σ value (zScore) is preserved in full for transparency; only the level is gated.
  if (FX_SLOW_MOVER_INDICATORS.has(name) && mean > 0) {
    const absPercentMove = (absDeviation / mean) * 100;
    if (absPercentMove < FX_PERCENT_FLOOR) {
      // %-floor not met — cap severity: extreme→elevated, high→elevated
      if (level === "extreme" || level === "high") {
        level = "elevated";
      }
    }
  }

  const direction: DeviationDirection =
    zScore > 0.1 ? "above" :
    zScore < -0.1 ? "below" :
    "at_mean";

  const nameVi = INDICATOR_NAME_VI[name] ?? name;
  const levelVi = direction === "below" ? LEVEL_VI_BELOW[level] : LEVEL_VI[level];
  const dirVi = direction === "above" ? "trên" : direction === "below" ? "dưới" : "quanh";
  const sign = zScore >= 0 ? "+" : "";

  const summary = level === "normal"
    ? `${nameVi}: ${current} — bình thường (${sign}${zScore}σ)`
    : `${nameVi}: ${current} — ${levelVi} (${sign}${zScore}σ ${dirVi} TB ${mean})`;

  return { name, current, mean, stdDev, zScore, level, direction, summary };
}

/**
 * Converts a DeviationLevel to a confidence delta for the cascade engine.
 *
 * Replaces the old fixed thresholds like "brent > $90 → +0.10".
 * Now: "brent elevated above mean → +0.06", "brent extreme above → +0.15".
 *
 * @param level     - The deviation classification
 * @param direction - Above or below mean
 * @returns Signed delta to apply (positive = strengthen, negative = weaken)
 */
export function deviationToDelta(
  level: DeviationLevel,
  direction: DeviationDirection,
): number {
  if (level === "normal" || direction === "at_mean") return 0;

  const sign = direction === "above" ? 1 : -1;

  switch (level) {
    case "elevated": return sign * 0.06;
    case "high":     return sign * 0.10;
    case "extreme":  return sign * 0.15;
    default:         return 0;
  }
}
