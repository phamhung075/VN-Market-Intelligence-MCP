/**
 * Technical Analysis Infrastructure — TA Calculator Implementation
 *
 * Concrete implementation of TAIndicatorCalculator port.
 * Pure math — no I/O.
 *
 * Algorithm sources: same as apps/mcp-server/src/domain/services/technicalIndicators.ts
 * (RSI Wilder smoothing, MACD standard EMA, BB population std dev).
 */

import type { TAIndicatorCalculator } from '../domain/repositories.js';

// ─── Private helpers ────────────────────────────────────────────────────────

function ema(prices: number[], period: number): number[] {
  if (prices.length === 0) return [];
  const k = 2 / (period + 1);
  const result: number[] = [prices[0]!];
  for (let i = 1; i < prices.length; i++) {
    result.push(prices[i]! * k + result[i - 1]! * (1 - k));
  }
  return result;
}

function wilderEma(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const k = 1 / period;
  const seedSum = values.slice(0, period).reduce((a, b) => a + b, 0);
  const result: number[] = [seedSum / period];
  for (let i = period; i < values.length; i++) {
    result.push(values[i]! * k + result[result.length - 1]! * (1 - k));
  }
  return result;
}

function populationStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// ─── Implementation ─────────────────────────────────────────────────────────

export class TACalculatorImpl implements TAIndicatorCalculator {
  calculateRSI(prices: number[], period = 14): number | null {
    if (prices.length < period + 1) return null;
    const deltas: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      deltas.push(prices[i]! - prices[i - 1]!);
    }
    const gains = deltas.map((d) => (d > 0 ? d : 0));
    const losses = deltas.map((d) => (d < 0 ? -d : 0));
    const sg = wilderEma(gains, period);
    const sl = wilderEma(losses, period);
    if (sg.length === 0 || sl.length === 0) return null;
    const avgGain = sg[sg.length - 1]!;
    const avgLoss = sl[sl.length - 1]!;
    if (avgLoss === 0) return 100;
    if (avgGain === 0) return 0;
    return 100 - 100 / (1 + avgGain / avgLoss);
  }

  calculateMACD(
    prices: number[],
    fast = 12,
    slow = 26,
    signal = 9,
  ): { line: number; signal: number; histogram: number } | null {
    const minPrices = slow + signal - 1;
    if (prices.length < minPrices) return null;
    const fastEma = ema(prices, fast);
    const slowEma = ema(prices, slow);
    const macdLine: number[] = [];
    for (let i = 0; i < prices.length; i++) {
      macdLine.push(fastEma[i]! - slowEma[i]!);
    }
    const signalLine = ema(macdLine, signal);
    const macdValue = macdLine[macdLine.length - 1]!;
    const signalValue = signalLine[signalLine.length - 1]!;
    return { line: macdValue, signal: signalValue, histogram: macdValue - signalValue };
  }

  calculateMA(prices: number[], period: number): number | null {
    if (prices.length < period) return null;
    const window = prices.slice(-period);
    return window.reduce((a, b) => a + b, 0) / period;
  }

  calculateBB(
    prices: number[],
    period = 20,
    stdDev = 2,
  ): { upper: number; mid: number; lower: number } | null {
    if (prices.length < period) return null;
    const window = prices.slice(-period);
    const mid = window.reduce((a, b) => a + b, 0) / period;
    const sigma = populationStdDev(window);
    return { upper: mid + stdDev * sigma, mid, lower: mid - stdDev * sigma };
  }
}
