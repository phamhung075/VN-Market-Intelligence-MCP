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
  extreme: "cực đoan",
};

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

  const level: DeviationLevel =
    absZ >= 3 ? "extreme" :
    absZ >= 2 ? "high" :
    absZ >= 1 ? "elevated" :
    "normal";

  const direction: DeviationDirection =
    zScore > 0.1 ? "above" :
    zScore < -0.1 ? "below" :
    "at_mean";

  const nameVi = INDICATOR_NAME_VI[name] ?? name;
  const levelVi = LEVEL_VI[level];
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
