/**
 * Signal Class Weighter — Domain Service
 *
 * Implements Fix B from REQ_056: signal_class field weighting for conviction
 * score computation.
 *
 * Problem: a simple average of signal scores treats all signal classes equally.
 * A one-time catalyst ("FPT wins a contract") should not override a structural
 * factor ("FPT P/E = 28x, above sector median"). Signal class weights let the
 * chain synthesizer apply appropriate emphasis before averaging.
 *
 * Weight map (locked in REQ_056 §Fix B):
 *   structural_factor  1.5  — persistent structural facts, highest weight
 *   cyclical           1.0  — sector/macro cycle signals, neutral weight
 *   technical_signal   0.8  — price/volume pattern signals
 *   one_time_catalyst  0.7  — single events, lower weight
 *   sentiment          0.5  — news sentiment, lowest weight
 *   NULL / undefined   1.0  — unclassified, treated as neutral weight
 *
 * Formula (weighted average):
 *   score = sum(score_i * weight_i) / sum(weight_i)
 *
 * Layer: domain/services — pure function, zero infrastructure imports.
 */

// ── Types ──────────────────────────────────────────────────────────────────

/** Valid signal class values stored in agent_signals.signal_class. */
export type SignalClassWeight =
  | "structural_factor"
  | "cyclical"
  | "technical_signal"
  | "one_time_catalyst"
  | "sentiment";

/**
 * Input for a single signal in the weighted average computation.
 * signal_class null/undefined → weight defaults to 1.0 (unclassified).
 */
export interface WeightedSignalInput {
  /** Conviction/confidence score in [0, 1]. */
  score: number;
  /** Signal class determining the weight multiplier. NULL = unclassified (1.0). */
  signalClass: SignalClassWeight | null | undefined;
}

// ── Weight Map (locked by REQ_056) ─────────────────────────────────────────

/**
 * Weight multipliers per signal class.
 *
 * Locked: do not change these values without a PO approval + REQ update.
 * Adjust only the signal_class the agent assigns, not these constants.
 */
export const SIGNAL_CLASS_WEIGHTS: Record<SignalClassWeight, number> = {
  structural_factor: 1.5,
  cyclical: 1.0,
  technical_signal: 0.8,
  one_time_catalyst: 0.7,
  sentiment: 0.5,
} as const;

/** Weight for unclassified (NULL/undefined) signals. */
export const DEFAULT_SIGNAL_WEIGHT = 1.0;

// ── computeWeightedConvictionScore ─────────────────────────────────────────

/**
 * Computes a weighted average conviction score from a list of signals.
 *
 * Each signal's score is multiplied by the weight of its class before
 * averaging. Signals with null/undefined signalClass use the default weight
 * of 1.0, ensuring backward compatibility with pre-1106 signals.
 *
 * Formula: sum(score_i * weight_i) / sum(weight_i)
 *
 * Edge cases:
 *   - Empty array → returns 0.
 *   - All weights are 1.0 (all NULL) → result equals the simple average.
 *   - Result is clamped to [0, 1] to handle floating-point edge cases.
 *
 * @param signals - Array of { score, signalClass } pairs
 * @returns Weighted average score in [0, 1]
 *
 * @example
 *   // structural_factor=0.6 vs one_time_catalyst=0.9
 *   // (0.6*1.5 + 0.9*0.7) / (1.5+0.7) = 1.53/2.2 ≈ 0.695 (not 0.75)
 *   computeWeightedConvictionScore([
 *     { score: 0.6, signalClass: 'structural_factor' },
 *     { score: 0.9, signalClass: 'one_time_catalyst' },
 *   ]) // → 0.6954...
 */
export function computeWeightedConvictionScore(
  signals: WeightedSignalInput[],
): number {
  if (signals.length === 0) return 0;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const { score, signalClass } of signals) {
    const weight =
      signalClass != null
        ? (SIGNAL_CLASS_WEIGHTS[signalClass] ?? DEFAULT_SIGNAL_WEIGHT)
        : DEFAULT_SIGNAL_WEIGHT;

    weightedSum += score * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return 0;

  const raw = weightedSum / totalWeight;
  // Clamp to [0, 1] to guard against floating-point drift
  return Math.min(1, Math.max(0, raw));
}
