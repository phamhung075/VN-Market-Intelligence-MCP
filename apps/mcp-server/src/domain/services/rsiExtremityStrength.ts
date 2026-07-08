/**
 * rsiExtremityStrength — Domain Service: RSI overbought/oversold extremity strength
 *
 * FACTORY-SCHEDULER-alert-confidence-literals: taAlertScanJob already computes
 * RSI(14) right beside the frozen `confidence = 0.7` literal it used to persist.
 * This service turns that already-available value into an in-scope strength
 * signal — how far RSI sits past its own overbought(70)/oversold(30) threshold,
 * normalised against the remaining distance to the RSI scale boundary (100 or
 * 0) — which the scheduler job then feeds into deriveConfidenceFromStrength()
 * (domain/services/alertConfidenceScorer.ts) to derive a real confidence value.
 *
 * No MACD/divergence data is used here: taAlertScanJob's ComputeTAResponse does
 * carry an (unused) `macd` field, but introducing a dependency on it purely to
 * feed confidence scoring would be scope creep for an alert type that is
 * itself defined entirely in terms of RSI. RSI's own extremity is a
 * self-consistent, already-in-scope strength measure for an RSI-threshold
 * alert — decision documented in the DJ-GATE-1 entry for
 * FACTORY-SCHEDULER-alert-confidence-literals.
 *
 * DDD layer: domain/services — pure function, no I/O, no imports.
 *
 * @module domain/services/rsiExtremityStrength
 */

/** Overbought threshold — matches the `rsi > 70` branch in taAlertScanJob. */
const RSI_OVERBOUGHT_THRESHOLD = 70;
/** Oversold threshold — matches the `rsi < 30` branch in taAlertScanJob. */
const RSI_OVERSOLD_THRESHOLD = 30;
/**
 * Distance from each threshold to the RSI scale boundary it saturates toward
 * (100 for overbought, 0 for oversold) — both spans are 30 points wide,
 * matching the symmetric 70/30 thresholds.
 */
const RSI_EXTREME_SPAN = 30;

export interface RsiExtremityStrengthParams {
  /** RSI(14) value, expected in [0, 100]. */
  rsi: number;
  /** Which threshold this RSI value crossed. */
  direction: "overbought" | "oversold";
}

/**
 * Compute RSI extremity strength in [0, 1] — how far `rsi` sits past its own
 * threshold, relative to the remaining distance to full saturation.
 *
 *   overbought: (rsi - 70) / 30, clamped to [0, 1] — 0 at RSI=70, 1 at RSI>=100
 *   oversold:   (30 - rsi) / 30, clamped to [0, 1] — 0 at RSI=30, 1 at RSI<=0
 *
 * Pure, deterministic, never throws.
 */
export function computeRsiExtremityStrength(
  params: RsiExtremityStrengthParams,
): number {
  const { rsi, direction } = params;
  const raw =
    direction === "overbought"
      ? (rsi - RSI_OVERBOUGHT_THRESHOLD) / RSI_EXTREME_SPAN
      : (RSI_OVERSOLD_THRESHOLD - rsi) / RSI_EXTREME_SPAN;
  return Math.min(1, Math.max(0, raw));
}
