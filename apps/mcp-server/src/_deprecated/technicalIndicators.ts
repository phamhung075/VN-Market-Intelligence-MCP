// DEPRECATED: G5 Phase 2. Moved from domain/services/. Delete after G5 verification passes.
/**
 * Technical Indicators Domain Service — Task 1302
 *
 * Pure TypeScript math functions for classical technical analysis indicators:
 *   - Simple Moving Average (SMA / MA)
 *   - RSI(14) with Wilder smoothing (k = 1/period, not 2/(period+1))
 *   - MACD(12,26,9) using standard EMA (k = 2/(period+1))
 *   - Bollinger Bands(20, 2σ) using population std dev (divide by N)
 *
 * DDD compliance: zero imports from `infrastructure/`. No I/O. All pure.
 *
 * EMA formula (standard, used for MACD fast/slow/signal lines):
 *   k = 2 / (period + 1)
 *   EMA[0] = prices[0]  (seed = first price)
 *   EMA[i] = prices[i] * k + EMA[i-1] * (1 - k)
 *
 * Wilder EMA formula (used for RSI avg_gain / avg_loss smoothing):
 *   k = 1 / period
 *   WilderEMA[0] = simple mean of first `period` values
 *   WilderEMA[i] = values[i] * k + WilderEMA[i-1] * (1 - k)
 *
 * @module domain/services/technicalIndicators
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** One daily price candle (output of the DB GROUP BY query). */
export interface DailyCandle {
  /** "YYYY-MM-DD" */
  day: string;
  /** AVG(price) for that date — proxy for closing price */
  close: number;
}

/** Full indicator result returned to the MCP handler. */
export interface TechnicalIndicatorResult {
  ma5:   number | null;
  ma20:  number | null;
  ma50:  number | null;
  rsi14: number | null;
  macd: {
    line:      number;
    signal:    number;
    histogram: number;
  } | null;
  bb20: {
    upper: number;
    mid:   number;
    lower: number;
  } | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Standard EMA using k = 2 / (period + 1).
 * Seed: EMA[0] = prices[0].
 * Used for MACD fast, slow, and signal lines.
 *
 * @internal
 */
function ema(prices: number[], period: number): number[] {
  if (prices.length === 0) return [];
  const k = 2 / (period + 1);
  const result: number[] = [prices[0]!];
  for (let i = 1; i < prices.length; i++) {
    result.push(prices[i]! * k + result[i - 1]! * (1 - k));
  }
  return result;
}

/**
 * Wilder EMA using k = 1 / period.
 * Seed: WilderEMA[0] = simple mean of first `period` values.
 * Used for RSI average gain / average loss smoothing.
 *
 * @param values - Array of gains or losses (non-negative).
 * @param period - Smoothing period (default 14 for RSI).
 * @internal
 */
function wilderEma(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const k = 1 / period;

  // Seed: simple mean of first `period` values
  const seedSum = values.slice(0, period).reduce((a, b) => a + b, 0);
  const result: number[] = [seedSum / period];

  for (let i = period; i < values.length; i++) {
    result.push(values[i]! * k + result[result.length - 1]! * (1 - k));
  }
  return result;
}

/**
 * Population standard deviation (divide by N, not N-1).
 * Returns 0 for arrays with fewer than 2 elements.
 *
 * @internal
 */
function populationStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Simple Moving Average over the last `period` values in `prices`.
 * Returns null when prices.length < period.
 *
 * @param prices - Array of closing prices (oldest → newest).
 * @param period - Number of periods to average.
 * @returns SMA of last `period` prices, or null if insufficient data.
 *
 * @example
 * computeMA([10, 20, 30, 40, 50], 3) // → 40.0  (mean of [30,40,50])
 */
export function computeMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const window = prices.slice(-period);
  return window.reduce((a, b) => a + b, 0) / period;
}

/**
 * RSI(period) using Wilder smoothing.
 *
 * Algorithm:
 *   1. Compute price deltas: delta[i] = price[i] - price[i-1]
 *   2. Separate into gains (delta > 0) and losses (|delta| when delta < 0)
 *   3. Smooth gains and losses using Wilder EMA (k = 1/period)
 *   4. RS = smoothed_gain / smoothed_loss  (last values)
 *   5. RSI = 100 - (100 / (1 + RS))
 *   Special: smoothed_loss == 0 → RSI = 100 (no losses = fully overbought)
 *
 * Requires period + 1 prices minimum (to produce period deltas).
 * Returns null when insufficient data. Return range: [0, 100].
 *
 * @param prices - Array of closing prices (oldest → newest).
 * @param period - RSI period (default 14).
 */
export function computeRSI(prices: number[], period = 14): number | null {
  if (prices.length < period + 1) return null;

  // Compute deltas
  const deltas: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    deltas.push(prices[i]! - prices[i - 1]!);
  }

  // Separate gains and losses
  const gains = deltas.map((d) => (d > 0 ? d : 0));
  const losses = deltas.map((d) => (d < 0 ? -d : 0));

  // Apply Wilder smoothing — need at least `period` deltas
  const smoothedGains = wilderEma(gains, period);
  const smoothedLosses = wilderEma(losses, period);

  if (smoothedGains.length === 0 || smoothedLosses.length === 0) return null;

  const avgGain = smoothedGains[smoothedGains.length - 1]!;
  const avgLoss = smoothedLosses[smoothedLosses.length - 1]!;

  if (avgLoss === 0) return 100; // no losses → fully overbought
  if (avgGain === 0) return 0;  // no gains → fully oversold

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * MACD(fast, slow, signal) using standard EMA (k = 2/(period+1)).
 *
 * Algorithm:
 *   1. Compute EMA(fast) and EMA(slow) over all prices
 *   2. MACD line = EMA(fast) - EMA(slow)   (element-wise, aligned to slow EMA length)
 *   3. Signal line = EMA(signal) of MACD line
 *   4. Histogram = MACD line[last] - Signal line[last]
 *
 * Minimum prices required: slow + signal - 1 = 26 + 9 - 1 = 34 (for defaults).
 * Returns null when insufficient data.
 * Histogram > 0 = bullish momentum; < 0 = bearish.
 *
 * @param prices  - Array of closing prices (oldest → newest).
 * @param fast    - Fast EMA period (default 12).
 * @param slow    - Slow EMA period (default 26).
 * @param signal  - Signal EMA period (default 9).
 */
export function computeMACD(
  prices: number[],
  fast = 12,
  slow = 26,
  signal = 9,
): { macd: number; signal: number; histogram: number } | null {
  // Need at least slow+signal-1 prices so the signal EMA has one seed value
  const minPrices = slow + signal - 1;
  if (prices.length < minPrices) return null;

  // Full EMA arrays over all prices
  const fastEma = ema(prices, fast);
  const slowEma = ema(prices, slow);

  // Align: both arrays have the same length (= prices.length).
  // MACD line value at each index: fast - slow
  const macdLine: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    macdLine.push(fastEma[i]! - slowEma[i]!);
  }

  // Signal line = EMA(signal) of the MACD line
  const signalLine = ema(macdLine, signal);

  // Take the last values
  const macdValue = macdLine[macdLine.length - 1]!;
  const signalValue = signalLine[signalLine.length - 1]!;
  const histogram = macdValue - signalValue;

  return {
    macd: macdValue,
    signal: signalValue,
    histogram,
  };
}

/**
 * Bollinger Bands(period, stdDevMultiplier) using population std dev.
 *
 * Algorithm:
 *   mid   = SMA of last `period` prices
 *   sigma = population std dev of last `period` prices (divide by N)
 *   upper = mid + stdDevMultiplier * sigma
 *   lower = mid - stdDevMultiplier * sigma
 *
 * Returns null when prices.length < period.
 * Invariant: upper > mid > lower (unless all prices equal → sigma=0, upper=mid=lower).
 *
 * @param prices           - Array of closing prices (oldest → newest).
 * @param period           - SMA and std dev window (default 20).
 * @param stdDevMultiplier - Band width multiplier (default 2).
 */
export function computeBollingerBands(
  prices: number[],
  period = 20,
  stdDevMultiplier = 2,
): { upper: number; mid: number; lower: number } | null {
  if (prices.length < period) return null;

  const window = prices.slice(-period);
  const mid = window.reduce((a, b) => a + b, 0) / period;
  const sigma = populationStdDev(window);

  return {
    upper: mid + stdDevMultiplier * sigma,
    mid,
    lower: mid - stdDevMultiplier * sigma,
  };
}

/**
 * Aggregate DailyCandle array and run all four indicators.
 *
 * Extracts close prices (oldest → newest) from candles then delegates
 * to each pure function. Returns nulls gracefully for any indicator
 * that lacks sufficient candles.
 *
 * @param candles - Array of daily candles ordered oldest → newest.
 * @returns TechnicalIndicatorResult with computed or null values per indicator.
 */
export function computeAllIndicators(candles: DailyCandle[]): TechnicalIndicatorResult {
  const prices = candles.map((c) => c.close);

  const macdRaw = computeMACD(prices);

  return {
    ma5:   computeMA(prices, 5),
    ma20:  computeMA(prices, 20),
    ma50:  computeMA(prices, 50),
    rsi14: computeRSI(prices, 14),
    macd: macdRaw
      ? {
          line:      macdRaw.macd,
          signal:    macdRaw.signal,
          histogram: macdRaw.histogram,
        }
      : null,
    bb20: computeBollingerBands(prices, 20, 2),
  };
}
