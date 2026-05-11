/**
 * Domain Service — Investment Clock Phase Classifier
 *
 * Classifies the current macro regime into one of four Investment Clock phases
 * based on the growth and inflation signals from Vietnam macro indicators.
 *
 * This is a PURE domain function — zero infrastructure imports, zero DB access.
 * The caller (interface/mcp tool) reads from macro_indicators and passes plain
 * values here.
 *
 * Growth proxy:  manufacturing_pmi (PMI > 50 = expansion / UP)
 *   Fallback:    gdp_growth (> 0 = UP)
 * Inflation proxy: cpi (> 3.0 = HIGH pressure)
 *   Fallback:    inflation_rate
 *
 * Threshold context: CPI 3.0% is an early-warning level relative to SBV target
 * of 4%. This threshold is calibrated for Vietnam context and should be
 * parameterised before applying to other markets.
 *
 * Truth table:
 *   PMI > 50 (UP)  + CPI ≤ 3.0 (LOW)  → Recovery
 *   PMI > 50 (UP)  + CPI > 3.0 (HIGH) → Overheat
 *   PMI ≤ 50 (DOWN) + CPI > 3.0 (HIGH) → Stagflation
 *   PMI ≤ 50 (DOWN) + CPI ≤ 3.0 (LOW)  → Reflation
 *
 * Task: TASK-1880a
 * Sprint: 1880 — Investment Clock + Pyramid Tier
 *
 * @module domain/services/macro/investmentClock
 */

/** Four-phase Investment Clock classification. */
export type InvestmentClockPhase = "Recovery" | "Overheat" | "Stagflation" | "Reflation";

/** PMI threshold: > 50 = expansion (standard PMI neutral). */
const PMI_EXPANSION_THRESHOLD = 50;

/**
 * CPI threshold: > 3.0 = inflation pressure (Vietnam context — SBV target 4%,
 * early-warning at 3%).
 */
const CPI_PRESSURE_THRESHOLD = 3.0;

/** Result of investment clock phase classification. */
export interface InvestmentClockResult {
  phase: InvestmentClockPhase | null;
  reason?: string;
  growthSignal: "UP" | "DOWN" | null;
  inflationSignal: "HIGH" | "LOW" | null;
}

/**
 * Classifies the current macro regime into an Investment Clock phase.
 *
 * Accepts primary signals (pmi, cpi) plus optional fallback signals
 * (gdpGrowth, inflationRate). Falls back gracefully when primary signals
 * are null. Returns { phase: null, reason: "insufficient_data" } if both
 * growth signals and both inflation signals are unavailable.
 *
 * Never throws — all null/undefined inputs handled explicitly.
 *
 * @param inputs.pmi           Vietnam manufacturing PMI (e.g. 51.2)
 * @param inputs.cpi           Vietnam CPI level (e.g. 2.8)
 * @param inputs.gdpGrowth     GDP growth % — fallback if pmi is null
 * @param inputs.inflationRate Alternate inflation series — fallback if cpi is null
 */
export function classifyInvestmentClockPhase(inputs: {
  pmi: number | null;
  cpi: number | null;
  gdpGrowth?: number | null;
  inflationRate?: number | null;
}): InvestmentClockResult {
  const { pmi, cpi, gdpGrowth, inflationRate } = inputs;

  // ── Resolve growth signal ─────────────────────────────────────────────────
  let growthSignal: "UP" | "DOWN" | null = null;

  if (pmi !== null && pmi !== undefined) {
    growthSignal = pmi > PMI_EXPANSION_THRESHOLD ? "UP" : "DOWN";
  } else if (gdpGrowth !== null && gdpGrowth !== undefined) {
    growthSignal = gdpGrowth > 0 ? "UP" : "DOWN";
  }

  // ── Resolve inflation signal ──────────────────────────────────────────────
  let inflationSignal: "HIGH" | "LOW" | null = null;

  const effectiveCpi = cpi !== null && cpi !== undefined ? cpi : inflationRate ?? null;
  if (effectiveCpi !== null) {
    inflationSignal = effectiveCpi > CPI_PRESSURE_THRESHOLD ? "HIGH" : "LOW";
  }

  // ── Guard: insufficient data ──────────────────────────────────────────────
  if (growthSignal === null || inflationSignal === null) {
    return {
      phase: null,
      reason: "insufficient_data",
      growthSignal,
      inflationSignal,
    };
  }

  // ── 2×2 truth table ───────────────────────────────────────────────────────
  let phase: InvestmentClockPhase;

  if (growthSignal === "UP" && inflationSignal === "LOW") {
    phase = "Recovery";
  } else if (growthSignal === "UP" && inflationSignal === "HIGH") {
    phase = "Overheat";
  } else if (growthSignal === "DOWN" && inflationSignal === "HIGH") {
    phase = "Stagflation";
  } else {
    // growthSignal === "DOWN" && inflationSignal === "LOW"
    phase = "Reflation";
  }

  return { phase, growthSignal, inflationSignal };
}
