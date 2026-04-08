/**
 * Stop-Loss Computer — pure domain function, no I/O.
 *
 * Formula: max(avgCost - 2*atr14, nearestSupport, avgCost * 0.93)
 * Invalid inputs (atr14 <= 0 or nearestSupport <= 0) are excluded from the max().
 *
 * @module domain/services/stopLossComputer
 */

/**
 * Compute a dynamic stop-loss price level in VND.
 *
 * Candidates considered (valid ones only):
 *   1. avgCost - 2 * atr14       — only when atr14 > 0
 *   2. nearestSupport             — only when nearestSupport > 0
 *   3. avgCost * 0.93             — always included (hard floor)
 *
 * Returns Math.max of all valid candidates, rounded to the nearest integer VND.
 *
 * @param avgCost        Average purchase price in VND (integer or float)
 * @param atr14          14-day Average True Range in VND. Pass 0 (or negative) if unavailable.
 * @param nearestSupport Nearest technical support level in VND. Pass 0 (or negative) if unavailable.
 * @returns              Stop-loss price in VND (integer, Math.round applied)
 */
export function computeStopLoss(
  avgCost: number,
  atr14: number,
  nearestSupport: number,
): number {
  const candidates: number[] = [];

  // Candidate 1: ATR-based (only if atr14 is valid)
  if (atr14 > 0) {
    candidates.push(avgCost - 2 * atr14);
  }

  // Candidate 2: Support level (only if nearestSupport is valid)
  if (nearestSupport > 0) {
    candidates.push(nearestSupport);
  }

  // Candidate 3: Hard floor — always included
  candidates.push(avgCost * 0.93);

  return Math.round(Math.max(...candidates));
}
