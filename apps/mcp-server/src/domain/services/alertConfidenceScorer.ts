/**
 * alertConfidenceScorer — Domain Service: derive alert/evidence confidence from
 * an in-scope signal-strength magnitude, instead of persisting a frozen literal.
 *
 * FACTORY-SCHEDULER-alert-confidence-literals: four scheduler jobs persisted a
 * fixed confidence number (foreignFlowAlertJob 0.75, insiderCheckJob 0.85,
 * bbAlertScanJob 0.65, taAlertScanJob 0.7) even though a real magnitude/strength
 * signal was already computed right beside the literal (e.g. foreignFlowAlertJob's
 * own `min(1, |totalNetVolume3d| / 500_000)` evidence-fragment magnitude,
 * insiderCheckJob's `min(1, buyDays / 10)`). Downstream consumers (evidence
 * accumulator, alert scoring) treat `confidence` as a real per-signal metric, so
 * a constant defeats that purpose. This service replaces the frozen number with
 * a linear interpolation between `base` (weakest qualifying signal, strength=0)
 * and `ceiling` (strongest observed signal, strength=1).
 *
 * DDD layer: domain/services — pure function, no I/O, no imports.
 *
 * @module domain/services/alertConfidenceScorer
 */

export interface ConfidenceFromStrengthParams {
  /** Signal strength — any real number; values outside [0, 1] are clamped before use. */
  strength: number;
  /** Confidence returned when (clamped) strength = 0 — the weakest qualifying signal. */
  base: number;
  /** Confidence returned when (clamped) strength = 1 — the strongest observed signal. */
  ceiling: number;
}

/**
 * Linearly interpolate confidence between `base` (strength=0) and `ceiling`
 * (strength=1). `strength` is clamped to [0, 1] before interpolation so an
 * out-of-range magnitude never pushes confidence past `ceiling` or below `base`.
 *
 * Pure, deterministic, never throws.
 */
export function deriveConfidenceFromStrength(
  params: ConfidenceFromStrengthParams,
): number {
  const { strength, base, ceiling } = params;
  const clampedStrength = Math.min(1, Math.max(0, strength));
  return base + clampedStrength * (ceiling - base);
}
