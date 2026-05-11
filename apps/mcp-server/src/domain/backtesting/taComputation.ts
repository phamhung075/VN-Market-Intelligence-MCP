/**
 * taComputation.ts — Task 1843a
 *
 * Pure domain TA computation utilities for backtesting.
 * Zero imports from infrastructure. Zero I/O.
 *
 * Exports:
 *   - computeEMA  — SMA-seeded EMA over a close series
 *   - computeRSI  — Wilder-smoothed RSI (final value only)
 *   - deriveTADirection — BULLISH / BEARISH / NEUTRAL from a DailyCandle series
 *
 * Layer: domain/backtesting — pure calculations only.
 */

import type { DailyCandle } from "../repositories/IBacktestPriceRepository.js";

/**
 * Compute an Exponential Moving Average over a close series.
 *
 * Seeding: the first EMA value is the Simple Moving Average of the first
 * `period` bars (NOT close[0] as seed — that produces a biased warm-up).
 *
 * @param closes  Array of close prices, ordered oldest → newest.
 * @param period  EMA period (e.g. 12, 26).
 * @returns Array of length (closes.length - period + 1).
 *          Returns [] when closes.length < period.
 */
export function computeEMA(closes: number[], period: number): number[] {
  if (closes.length < period) return [];

  const k = 2 / (period + 1);

  // SMA seed from first `period` bars
  const seed =
    closes.slice(0, period).reduce((sum, v) => sum + v, 0) / period;

  const result: number[] = [seed];

  for (let i = period; i < closes.length; i++) {
    const prev = result[result.length - 1]!;
    result.push(prev * (1 - k) + closes[i]! * k);
  }

  return result;
}

/**
 * Compute the RSI (Relative Strength Index) for the final bar of a series.
 *
 * Uses the standard Wilder smoothing (initial average gain/loss = SMA of
 * first `period` differences, then Wilder's exponential smoothing thereafter).
 *
 * @param closes  Array of close prices, ordered oldest → newest.
 *                Must have at least period + 1 values.
 * @param period  RSI period (default 14).
 * @returns Final RSI value (0–100), or null if insufficient data.
 */
export function computeRSI(closes: number[], period: number): number | null {
  if (closes.length < period + 1) return null;

  // Compute differences
  const diffs: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    diffs.push(closes[i]! - closes[i - 1]!);
  }

  // Seed: SMA of first `period` gains and losses
  const firstDiffs = diffs.slice(0, period);
  let avgGain = firstDiffs.reduce((s, d) => s + Math.max(d, 0), 0) / period;
  let avgLoss = firstDiffs.reduce((s, d) => s + Math.max(-d, 0), 0) / period;

  // Wilder smoothing for remaining diffs
  for (let i = period; i < diffs.length; i++) {
    const gain = Math.max(diffs[i]!, 0);
    const loss = Math.max(-diffs[i]!, 0);
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * Derive a TA direction from a series of daily candles.
 *
 * Logic:
 *   - Requires >= 26 candles (minimum for EMA-26 seed). Returns NEUTRAL if fewer.
 *   - Computes EMA-12 and EMA-26 over the close series.
 *   - Computes RSI-14 over the close series.
 *   - BULLISH  when EMA12.last > EMA26.last AND RSI > 50
 *   - BEARISH  when EMA12.last < EMA26.last AND RSI < 50
 *   - NEUTRAL  in all other cases (EMA cross disagrees with RSI, or RSI = 50)
 *
 * @param candles  Daily OHLCV candles, sorted oldest → newest.
 * @returns "BULLISH" | "BEARISH" | "NEUTRAL"
 */
export function deriveTADirection(candles: DailyCandle[]): "BULLISH" | "BEARISH" | "NEUTRAL" {
  if (candles.length < 26) return "NEUTRAL";

  const closes = candles.map((c) => c.close);

  const ema12 = computeEMA(closes, 12);
  const ema26 = computeEMA(closes, 26);

  // Both must have produced values
  if (ema12.length === 0 || ema26.length === 0) return "NEUTRAL";

  const lastEma12 = ema12[ema12.length - 1]!;
  const lastEma26 = ema26[ema26.length - 1]!;

  const rsi = computeRSI(closes, 14);

  // RSI null means insufficient data → NEUTRAL
  if (rsi === null) return "NEUTRAL";

  const emaBullish = lastEma12 > lastEma26;
  const emaBearish = lastEma12 < lastEma26;
  const rsiBullish = rsi > 50;
  const rsiBearish = rsi < 50;

  if (emaBullish && rsiBullish) return "BULLISH";
  if (emaBearish && rsiBearish) return "BEARISH";
  return "NEUTRAL";
}
