/**
 * Base Rate Computer — Task 1125
 *
 * Pure domain service for prediction calibration metrics.
 * Contains zero imports from infrastructure.
 *
 * The Brier Score measures the accuracy of probabilistic predictions.
 * Lower is better: 0 = perfect, 1 = worst possible.
 *
 * Formula: brier_score = (outcome - confidence)^2
 *   - outcome: 1 (true) or 0 (false)
 *   - confidence: probability forecast in [0.0, 1.0]
 *
 * Layer: domain/services — no I/O, no infrastructure imports.
 *
 * @module domain/services/baseRateComputer
 */

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes the Brier Score for a single probabilistic prediction.
 *
 * Brier Score = (outcome - confidence)^2
 *
 * Interpretation:
 *   - 0.0 = perfect forecast (high confidence + correct, or low confidence + incorrect)
 *   - 0.25 = uninformative forecast (confidence = 0.5 regardless of outcome)
 *   - 1.0 = maximally wrong forecast (confidence = 1.0 but outcome = 0)
 *
 * @param outcome    - Actual outcome: 1 (condition was true) or 0 (condition was false)
 * @param confidence - Forecasted probability [0.0, 1.0]
 * @returns          - Brier score in [0.0, 1.0]
 */
export function computeBrierScore(outcome: 0 | 1, confidence: number): number {
  return (outcome - confidence) ** 2;
}
