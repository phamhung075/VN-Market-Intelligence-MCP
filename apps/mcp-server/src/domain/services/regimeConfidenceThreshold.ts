/**
 * Regime-Based Confidence Threshold — pure domain function, no I/O.
 *
 * Enforces minimum confidence thresholds for urgent_news signals based on the
 * current market regime. Under benign regimes (NEUTRAL) the bar is highest;
 * under stressed regimes (BEAR) the bar is lower so more signals pass.
 *
 * Rules:
 *   NEUTRAL → urgent_news requires confidence >= 0.60
 *   BULL    → urgent_news requires confidence >= 0.50
 *   BEAR    → urgent_news requires confidence >= 0.40
 *
 * Missing regime defaults to NEUTRAL (strictest). Missing confidence is treated
 * as "not supplied" and passes through — schema validation handles required
 * field enforcement separately.
 *
 * Only urgent_news signals are subject to regime thresholds. All other signal
 * types pass unconditionally.
 *
 * @module domain/services/regimeConfidenceThreshold
 */

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Minimum confidence thresholds per regime for urgent_news signals.
 * Keys are normalised to uppercase for comparison.
 */
export const REGIME_THRESHOLDS: Record<string, number> = {
  NEUTRAL: 0.60,
  BULL: 0.50,
  BEAR: 0.40,
} as const;

/** Default regime when caller does not supply one. */
const DEFAULT_REGIME = "NEUTRAL";

// ── Input / Result types ──────────────────────────────────────────────────────

export interface RegimeThresholdInput {
  /** Signal type — only "urgent_news" is subject to regime thresholds. */
  signal_type: string;
  /** Confidence value in [0, 1], or undefined when field was not supplied. */
  confidence: number | undefined;
  /** Market regime string, e.g. "NEUTRAL" | "BULL" | "BEAR". Case-insensitive. */
  regime: string | undefined;
}

export type RegimeThresholdResult =
  | { pass: true }
  | { pass: false; reason: string; threshold: number; actual: number; regime: string };

// ── checkRegimeConfidenceThreshold ────────────────────────────────────────────

/**
 * Check whether a signal meets the regime-based confidence threshold.
 *
 * Returns `{ pass: true }` when:
 *   - signal_type is not "urgent_news"  (bypass — other types not subject to regime check)
 *   - confidence is undefined           (not supplied — pass through; schema validates fields)
 *   - confidence >= threshold for the given regime
 *
 * Returns `{ pass: false, reason, threshold, actual, regime }` when:
 *   - signal_type is "urgent_news" AND confidence < threshold
 *
 * Pure function — no I/O, no side effects.
 */
export function checkRegimeConfidenceThreshold(
  input: RegimeThresholdInput
): RegimeThresholdResult {
  const { signal_type, confidence, regime } = input;

  // Only urgent_news signals are subject to regime thresholds
  if (signal_type !== "urgent_news") {
    return { pass: true };
  }

  // No confidence supplied → cannot enforce threshold, pass through
  if (confidence === undefined || confidence === null) {
    return { pass: true };
  }

  const normalisedRegime = (regime ?? DEFAULT_REGIME).toUpperCase();
  const threshold = REGIME_THRESHOLDS[normalisedRegime] ?? REGIME_THRESHOLDS[DEFAULT_REGIME] ?? 0.6;

  if (confidence >= threshold) {
    return { pass: true };
  }

  return {
    pass: false,
    reason:
      `urgent_news blocked: confidence=${confidence.toFixed(2)} < ${threshold.toFixed(2)} ` +
      `required under ${normalisedRegime} regime`,
    threshold,
    actual: confidence,
    regime: normalisedRegime,
  };
}
