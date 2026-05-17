/**
 * Technical indicator computation — pure functions, no side effects.
 * All functions return null for positions where the indicator is not yet computable
 * (insufficient lookback data).
 */

/** Simple Moving Average over `period` bars. */
export function computeMA(closes: number[], period: number): (number | null)[] {
  return closes.map((_, i) => {
    if (i < period - 1) return null;
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += closes[j];
    return sum / period;
  });
}

/** Exponential Moving Average using standard multiplier = 2/(period+1). */
export function computeEMA(closes: number[], period: number): (number | null)[] {
  if (closes.length === 0) return [];
  const k = 2 / (period + 1);
  const result: (number | null)[] = new Array(closes.length).fill(null);
  // Seed with SMA of first `period` values
  if (closes.length < period) return result;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += closes[i];
  result[period - 1] = sum / period;
  for (let i = period; i < closes.length; i++) {
    result[i] = closes[i] * k + (result[i - 1] as number) * (1 - k);
  }
  return result;
}

/** Bollinger Bands: SMA(period) ± multiplier * stddev. */
export function computeBB(
  closes: number[],
  period = 20,
  multiplier = 2,
): { upper: number | null; mid: number | null; lower: number | null }[] {
  return closes.map((_, i) => {
    if (i < period - 1) return { upper: null, mid: null, lower: null };
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = slice.reduce((s, v) => s + v, 0) / period;
    const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
    const std = Math.sqrt(variance);
    return {
      upper: mean + multiplier * std,
      mid: mean,
      lower: mean - multiplier * std,
    };
  });
}

/** Wilder's RSI(period). Returns null until enough data for the seed SMA. */
export function computeRSI(closes: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return result;

  let avgGain = 0;
  let avgLoss = 0;

  // Seed: SMA of first `period` gains/losses
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) avgGain += diff;
    else avgLoss += -diff;
  }
  avgGain /= period;
  avgLoss /= period;

  const rs0 = avgLoss === 0 ? Infinity : avgGain / avgLoss;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs0);

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
  }
  return result;
}

/** MACD(fast, slow, signal). Returns nulls until slow EMA + signal EMA are ready. */
export function computeMACD(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): { line: number | null; signal: number | null; histogram: number | null }[] {
  const emaFast = computeEMA(closes, fast);
  const emaSlow = computeEMA(closes, slow);

  const macdLine: (number | null)[] = closes.map((_, i) => {
    if (emaFast[i] === null || emaSlow[i] === null) return null;
    return (emaFast[i] as number) - (emaSlow[i] as number);
  });

  // Signal = EMA(macdLine, signalPeriod) — seed from first non-null macdLine
  const signalLine: (number | null)[] = new Array(closes.length).fill(null);
  const firstIdx = macdLine.findIndex((v) => v !== null);
  if (firstIdx === -1 || closes.length - firstIdx < signalPeriod) {
    return closes.map((_, i) => ({ line: macdLine[i], signal: null, histogram: null }));
  }

  const k = 2 / (signalPeriod + 1);
  let seedSum = 0;
  for (let i = firstIdx; i < firstIdx + signalPeriod; i++) seedSum += macdLine[i] as number;
  signalLine[firstIdx + signalPeriod - 1] = seedSum / signalPeriod;

  for (let i = firstIdx + signalPeriod; i < closes.length; i++) {
    signalLine[i] =
      (macdLine[i] as number) * k +
      (signalLine[i - 1] as number) * (1 - k);
  }

  return closes.map((_, i) => {
    const line = macdLine[i];
    const sig = signalLine[i];
    const hist = line !== null && sig !== null ? line - sig : null;
    return { line, signal: sig, histogram: hist };
  });
}
