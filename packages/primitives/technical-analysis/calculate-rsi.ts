/**
 * Primitive: calculateRSI
 *
 * Pure function — zero imports from domain, application, or infrastructure layers.
 * Zero external dependencies.
 *
 * Algorithm: Wilder's Relative Strength Index (RSI)
 * Source: J. Welles Wilder Jr., "New Concepts in Technical Trading Systems", 1978.
 *
 * Method:
 *   1. Compute price deltas: Δ[i] = price[i] - price[i-1]  (i = 1..n-1)
 *   2. Seed average gain/loss using simple average of first `period` deltas:
 *        avgGain_seed = sum(max(Δ,0) for Δ in deltas[0..period-1]) / period
 *        avgLoss_seed = sum(max(-Δ,0) for Δ in deltas[0..period-1]) / period
 *   3. For each subsequent delta (i = period..n-1), apply Wilder smoothing:
 *        avgGain = (prevAvgGain * (period - 1) + max(Δ, 0)) / period
 *        avgLoss = (prevAvgLoss * (period - 1) + max(-Δ, 0)) / period
 *   4. RSI = 100 - 100 / (1 + avgGain / avgLoss)
 *        Special cases: avgLoss === 0 → RSI = 100; avgGain === 0 → RSI = 0
 *
 * Output array length = prices.length - period
 *   (first RSI value corresponds to prices[period], last to prices[n-1])
 */

/**
 * Calculate the full RSI series for a price array using Wilder's smoothing.
 *
 * @param prices - Array of closing prices, oldest first.
 * @param period - Lookback period. Default 14 (Wilder's original).
 * @returns Array of RSI values (length = prices.length - period), or empty array
 *          if prices.length <= period (insufficient data). Returns empty array if
 *          any price is NaN, non-finite, or negative.
 */
export function calculateRSI(prices: number[], period: number = 14): number[] {
  // Validate: insufficient data
  if (prices.length <= period) return [];

  // Validate: any invalid price (NaN, Infinity, negative)
  for (const p of prices) {
    if (!isFinite(p) || isNaN(p) || p < 0) return [];
  }

  // Validate: period must be a positive integer
  if (!Number.isInteger(period) || period < 1) return [];

  // Step 1: compute deltas
  const deltas: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    deltas.push((prices[i] as number) - (prices[i - 1] as number));
  }

  // Step 2: seed using simple average of first `period` deltas
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    const d = deltas[i] as number;
    if (d > 0) avgGain += d;
    else avgLoss += -d;
  }
  avgGain /= period;
  avgLoss /= period;

  const result: number[] = [];

  // First RSI value (from seed)
  result.push(computeRSI(avgGain, avgLoss));

  // Step 3: Wilder smoothing for remaining deltas
  for (let i = period; i < deltas.length; i++) {
    const d = deltas[i] as number;
    const gain = d > 0 ? d : 0;
    const loss = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result.push(computeRSI(avgGain, avgLoss));
  }

  return result;
}

function computeRSI(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return 100;
  if (avgGain === 0) return 0;
  return 100 - 100 / (1 + avgGain / avgLoss);
}
