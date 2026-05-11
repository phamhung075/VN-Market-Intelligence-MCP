/**
 * Domain Service — Yield Spread Signal
 *
 * Computes the equity risk premium proxy for the Vietnamese market by comparing
 * the market-wide earnings yield against the SBV max deposit rate.
 *
 * This is a PURE domain function — zero infrastructure imports, zero DB access.
 * The caller (interface/mcp tool) is responsible for reading live values from
 * the database and passing them in as plain numbers.
 *
 * Core component of the Báu Phase 2 (Dinh Gia) methodology:
 *   spread = earningYield − depositRate
 *
 * Thresholds (Báu methodology):
 *   spread > +2pp              → CHEAP       (strong equity risk premium)
 *   0 < spread ≤ +2pp         → FAIRLY_VALUED
 *   spread ≤ 0                → EXPENSIVE    (equity offers no premium over deposits)
 *   Either input is 0         → UNKNOWN
 *
 * Sprint: 1426 — Báu Phase 2 (Dinh Gia)
 * Task: TASK-1426b
 *
 * @module domain/services/macro/yieldSpreadSignal
 */

/** Valuation label for the yield spread signal. */
export type YieldSpreadLabel = "CHEAP" | "FAIRLY_VALUED" | "EXPENSIVE" | "UNKNOWN";

/**
 * Result of a yield spread signal computation.
 *
 * All rate fields are in percentage points (e.g. 7.32 = 7.32%).
 */
export interface YieldSpreadSignal {
  /** Equity earnings yield (%) — e.g. 7.32 means 7.32% */
  earningYield: number;
  /** SBV max deposit rate (%) — e.g. 5.50 means 5.50% */
  depositRate: number;
  /** earningYield − depositRate, rounded to 2 decimal places */
  spread: number;
  /** Valuation label based on spread thresholds */
  label: YieldSpreadLabel;
  /** Human-readable one-liner explanation in English */
  reasoning: string;
  /** ISO 8601 timestamp of computation */
  computedAt: string;
}

/** Threshold: spread must exceed this value to be CHEAP (strictly >) */
const CHEAP_THRESHOLD = 2;

/**
 * Computes the yield spread signal for Vietnamese equities vs. bank deposits.
 *
 * Implements the Báu Phase 2 (Dinh Gia) valuation classification.
 *
 * Edge case: if either input is 0 (data unavailable), returns UNKNOWN with
 * a "Data unavailable" reasoning string. Does NOT throw.
 *
 * @param earningYield  Market earnings yield in percentage points (e.g. 7.32)
 * @param depositRate   SBV max deposit rate in percentage points (e.g. 5.50)
 * @returns             YieldSpreadSignal — fully typed result with label + reasoning
 */
export function computeYieldSpreadSignal(
  earningYield: number,
  depositRate: number,
): YieldSpreadSignal {
  const computedAt = new Date().toISOString();

  // ── Zero-data guard ────────────────────────────────────────────────────────
  if (earningYield === 0 || depositRate === 0) {
    return {
      earningYield,
      depositRate,
      spread: 0,
      label: "UNKNOWN",
      reasoning: "Data unavailable — one or both inputs are zero",
      computedAt,
    };
  }

  // ── Spread computation ─────────────────────────────────────────────────────
  const rawSpread = earningYield - depositRate;
  const spread = Math.round(rawSpread * 100) / 100;

  // ── Valuation classification ───────────────────────────────────────────────
  let label: YieldSpreadLabel;
  let reasoning: string;

  if (spread > CHEAP_THRESHOLD) {
    label = "CHEAP";
    reasoning =
      `Equity earnings yield (${earningYield.toFixed(2)}%) exceeds the SBV deposit rate ` +
      `(${depositRate.toFixed(2)}%) by ${spread.toFixed(2)}pp — well above the +2pp threshold. ` +
      `Vietnamese equities offer a strong risk premium over bank deposits (CHEAP).`;
  } else if (spread > 0) {
    label = "FAIRLY_VALUED";
    reasoning =
      `Equity earnings yield (${earningYield.toFixed(2)}%) exceeds the SBV deposit rate ` +
      `(${depositRate.toFixed(2)}%) by ${spread.toFixed(2)}pp — a modest but positive premium. ` +
      `Vietnamese equities are fairly valued relative to bank deposits (FAIRLY_VALUED).`;
  } else {
    label = "EXPENSIVE";
    reasoning =
      `Equity earnings yield (${earningYield.toFixed(2)}%) does not exceed the SBV deposit rate ` +
      `(${depositRate.toFixed(2)}%) — spread is ${spread.toFixed(2)}pp. ` +
      `Bank deposits offer equal or better returns than equities at current prices (EXPENSIVE).`;
  }

  return {
    earningYield,
    depositRate,
    spread,
    label,
    reasoning,
    computedAt,
  };
}
