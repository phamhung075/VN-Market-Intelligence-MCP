/**
 * bbBreakoutStrength — Domain Service: Bollinger Band breakout penetration strength
 *
 * FACTORY-SCHEDULER-alert-confidence-literals: bbAlertScanJob already computes
 * bb20.upper/bb20.lower and the latest close right beside the frozen
 * `confidence = 0.65` literal it used to persist. This service turns that
 * already-available data into an in-scope strength signal — how far the close
 * price penetrated past the band edge, relative to the band's own width —
 * which the scheduler job then feeds into deriveConfidenceFromStrength()
 * (domain/services/alertConfidenceScorer.ts) to derive a real confidence value.
 *
 * DDD layer: domain/services — pure function, no I/O, no imports.
 *
 * @module domain/services/bbBreakoutStrength
 */

export interface BbBreakoutStrengthParams {
  /** Latest close price. */
  close: number;
  /** BB20 upper band. */
  upper: number;
  /** BB20 lower band. */
  lower: number;
}

/**
 * Compute breakout strength in [0, 1] — how far `close` penetrated past the
 * band edge, expressed as a fraction of the band's own width (upper - lower).
 *
 *   close > upper → (close - upper) / width, clamped to [0, 1]
 *   close < lower → (lower - close) / width, clamped to [0, 1]
 *   otherwise     → 0 (inside the band — no breakout)
 *
 * Degenerate band (upper <= lower, e.g. malformed upstream data) is treated
 * as maximum-strength (1) whenever close is outside [lower, upper], since a
 * zero/negative-width band has no meaningful proportional scale — any close
 * outside it is, by definition, a boundary violation.
 *
 * Pure, deterministic, never throws.
 */
export function computeBbBreakoutStrength(
  params: BbBreakoutStrengthParams,
): number {
  const { close, upper, lower } = params;
  const width = upper - lower;

  if (width <= 0) {
    return close > upper || close < lower ? 1 : 0;
  }
  if (close > upper) {
    return Math.min(1, (close - upper) / width);
  }
  if (close < lower) {
    return Math.min(1, (lower - close) / width);
  }
  return 0;
}
