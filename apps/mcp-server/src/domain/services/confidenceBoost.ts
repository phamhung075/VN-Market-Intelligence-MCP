/**
 * computeConfidenceBoost — pure domain service
 *
 * Computes a confidence boost multiplier based on price anomaly sigma.
 *
 * @param moveSigma      - move expressed in standard-deviation units
 *                         (from PriceAnomalyFindingData.move_sigma)
 * @param baseConfidence - original signal confidence [0, 1]
 * @returns boosted confidence clamped to [0, 1]
 *
 * Boost schedule (additive on top of baseConfidence):
 *   |moveSigma| < 1.5          → no boost (+0.00)
 *   1.5 ≤ |moveSigma| < 2.0   → +0.05
 *   2.0 ≤ |moveSigma| < 3.0   → +0.10
 *   |moveSigma| ≥ 3.0          → +0.20
 *
 * Result is always clamped to [0, 1]. Never throws.
 * Zero infrastructure imports — domain layer only.
 */
export function computeConfidenceBoost(moveSigma: number, baseConfidence: number): number {
  const absSigma = Math.abs(moveSigma);

  let boost: number;
  if (absSigma >= 3.0) {
    boost = 0.20;
  } else if (absSigma >= 2.0) {
    boost = 0.10;
  } else if (absSigma >= 1.5) {
    boost = 0.05;
  } else {
    boost = 0.00;
  }

  const result = baseConfidence + boost;
  // Clamp to [0, 1]
  return Math.min(1.0, Math.max(0.0, result));
}
