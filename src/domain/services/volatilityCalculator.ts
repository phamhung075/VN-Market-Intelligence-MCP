/**
 * Volatility Calculator — Task 133
 *
 * Pure domain function that computes per-stock historical volatility
 * and derives adaptive signal detection thresholds.
 *
 * Adaptive thresholds replace fixed ±5% with stock-specific bands:
 *   - Stable stocks (e.g. VCB, stdDev ≈ 1.5%): threshold ≈ ±3%
 *   - Volatile stocks (e.g. HPG, stdDev ≈ 4%):  threshold ≈ ±8%
 *
 * All calculations are pure (no I/O, no infrastructure imports).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants — mirrors mcp.config.json > adaptiveThresholds
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_WINDOW_DAYS = 20;
const DEFAULT_DROP_SIGMA = 2.0;
const DEFAULT_RISE_SIGMA = 2.0;
const DEFAULT_VOLUME_SIGMA = 2.0;

/** Minimum history entries (price points) required to compute stdDev reliably. */
const MIN_HISTORY_FOR_COMPUTATION = 5;

/** Fallback thresholds used when history is too short to compute stdDev. */
const FALLBACK_DROP_PCT = -5;
const FALLBACK_RISE_PCT = 5;
const FALLBACK_VOLUME_MULT = 2;

/** Clamp bounds for adaptive thresholds. */
const MIN_DROP_PCT = -1;
const MAX_DROP_PCT = -15;
const MIN_RISE_PCT = 1;
const MAX_RISE_PCT = 15;
const MIN_VOLUME_MULT = 1.5;
const MAX_VOLUME_MULT = 5.0;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** One day of price + volume data for a stock. */
export interface PricePoint {
  /** Closing price in VND */
  price: number;
  /** Daily traded volume in shares */
  volume: number;
  /** ISO date string, e.g. "2026-01-15" */
  date: string;
}

/**
 * Result of volatility computation for a single stock.
 * All threshold values are ready to pass directly to `detectSignals()`.
 */
export interface StockVolatility {
  /** Stock ticker code (may be empty string if not provided to compute fn) */
  actionCode: string;
  /** N-day population standard deviation of daily log returns (decimal, e.g. 0.015) */
  dailyStdDev: number;
  /** Annualized volatility = dailyStdDev × √252 */
  annualizedVol: number;
  /**
   * Adaptive drop threshold in percent (negative number).
   * E.g. -3.0 means trigger when price falls ≥ 3%.
   * Clamped to [MAX_DROP_PCT, MIN_DROP_PCT] = [-15%, -1%].
   */
  adaptiveDropPct: number;
  /**
   * Adaptive rise threshold in percent (positive number).
   * E.g. 3.0 means trigger when price rises ≥ 3%.
   * Clamped to [MIN_RISE_PCT, MAX_RISE_PCT] = [1%, 15%].
   */
  adaptiveRisePct: number;
  /**
   * Adaptive volume spike multiplier.
   * E.g. 2.5 means trigger when volume ≥ 2.5× average.
   * Clamped to [MIN_VOLUME_MULT, MAX_VOLUME_MULT] = [1.5×, 5×].
   */
  adaptiveVolumeMult: number;
  /** Actual number of trading days of history used in computation. */
  windowDays: number;
}

/** Optional configuration overrides for computeStockVolatility(). */
export interface VolatilityConfig {
  /** Number of recent trading days to include (default: 20) */
  windowDays?: number;
  /** Sigma multiplier for drop threshold (default: 2.0) */
  dropSigma?: number;
  /** Sigma multiplier for rise threshold (default: 2.0) */
  riseSigma?: number;
  /** Sigma multiplier for volume spike threshold (default: 2.0) */
  volumeSigma?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Population standard deviation of an array of numbers.
 * Returns 0 for arrays with fewer than 2 elements.
 */
function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** Clamp a value to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute stock-specific volatility and derive adaptive signal thresholds.
 *
 * @param priceHistory - Chronological price/volume history (oldest first).
 *                       At least 5 entries are required for meaningful computation.
 * @param config       - Optional configuration for window size and sigma multipliers.
 * @returns            - StockVolatility with adaptive thresholds ready for detectSignals().
 *
 * @example
 * ```typescript
 * const history = await fetchPriceHistory("VCB", 20);
 * const vol = computeStockVolatility(history);
 * // vol.adaptiveDropPct ≈ -3.0 for stable banking stocks
 * // vol.adaptiveRisePct ≈ +3.0
 * const signals = detectSignals(snapshot, { volatility: vol });
 * ```
 */
export function computeStockVolatility(
  priceHistory: PricePoint[],
  config: VolatilityConfig = {},
): StockVolatility {
  const windowDays = config.windowDays ?? DEFAULT_WINDOW_DAYS;
  const dropSigma = config.dropSigma ?? DEFAULT_DROP_SIGMA;
  const riseSigma = config.riseSigma ?? DEFAULT_RISE_SIGMA;
  const volumeSigma = config.volumeSigma ?? DEFAULT_VOLUME_SIGMA;

  // Use the last `windowDays` entries (or all if fewer)
  const window = priceHistory.slice(-windowDays);
  const actualWindow = window.length;

  // ── Fallback: insufficient history ──────────────────────────────────────
  // Need at least MIN_HISTORY_FOR_COMPUTATION price points to compute a daily
  // return series (N-1 returns for N points), and the return series needs ≥2
  // values for a meaningful stdDev.
  if (actualWindow < MIN_HISTORY_FOR_COMPUTATION) {
    return {
      actionCode: "",
      dailyStdDev: 0,
      annualizedVol: 0,
      adaptiveDropPct: FALLBACK_DROP_PCT,
      adaptiveRisePct: FALLBACK_RISE_PCT,
      adaptiveVolumeMult: FALLBACK_VOLUME_MULT,
      windowDays: actualWindow,
    };
  }

  // ── Daily returns: (price[i] - price[i-1]) / price[i-1] ─────────────────
  const returns: number[] = [];
  for (let i = 1; i < window.length; i++) {
    const prev = window[i - 1]!.price;
    const curr = window[i]!.price;
    if (prev > 0) {
      returns.push((curr - prev) / prev);
    }
  }

  const dailyStdDevValue = stdDev(returns);
  const annualizedVol = dailyStdDevValue * Math.sqrt(252);

  // ── Adaptive price thresholds ────────────────────────────────────────────
  const rawDropPct = -(dropSigma * dailyStdDevValue * 100);
  const rawRisePct = riseSigma * dailyStdDevValue * 100;

  const adaptiveDropPct =
    dailyStdDevValue === 0
      ? MIN_DROP_PCT
      : clamp(rawDropPct, MAX_DROP_PCT, MIN_DROP_PCT);

  const adaptiveRisePct =
    dailyStdDevValue === 0
      ? MIN_RISE_PCT
      : clamp(rawRisePct, MIN_RISE_PCT, MAX_RISE_PCT);

  // ── Adaptive volume multiplier ───────────────────────────────────────────
  const volumes = window.map((p) => p.volume);
  const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  const volumeStdDevValue = stdDev(volumes);

  const rawVolumeMult =
    avgVolume > 0
      ? 1 + (volumeSigma * volumeStdDevValue) / avgVolume
      : FALLBACK_VOLUME_MULT;

  const adaptiveVolumeMult = clamp(rawVolumeMult, MIN_VOLUME_MULT, MAX_VOLUME_MULT);

  return {
    actionCode: "",
    dailyStdDev: dailyStdDevValue,
    annualizedVol,
    adaptiveDropPct,
    adaptiveRisePct,
    adaptiveVolumeMult,
    windowDays: actualWindow,
  };
}
