/**
 * Domain Service — Carry Trade Signal
 *
 * Quantifies the attractiveness of VND-denominated assets to foreign
 * institutional investors relative to USD by comparing the SBV deposit rate
 * against the US Fed Funds rate.
 *
 * This is a PURE domain function — zero infrastructure imports, zero DB access.
 * The caller (interface/mcp tool or application use-case) is responsible for
 * reading live rates from the database and passing them in as plain numbers.
 *
 * Core component of the Thien Thoi methodology — Question 1: Global liquidity
 * regime (Question: "Is global capital flowing into or out of EM assets?").
 *
 * Thresholds (carry spread = vndDepositRate − fedFundsRate):
 *   spread > 2.5%              → HOT_MONEY_INFLOW
 *   0.5% ≤ spread ≤ 2.5%      → NEUTRAL
 *   spread < 0.5%              → FII_OUTFLOW_RISK
 *
 * Task: TASK-1423c
 * Sprint: 1423 — Trần Ngọc Báu Macro Framework (Phase 1)
 *
 * @module domain/services/macro/carryTradeSignal
 */

/** Carry trade regime classification. */
export type CarryTradeRegime = "HOT_MONEY_INFLOW" | "NEUTRAL" | "FII_OUTFLOW_RISK";

/**
 * Result of a carry trade signal computation.
 *
 * All rate fields are in percentage points (e.g. 5.5 = 5.5%).
 */
export interface CarryTradeSignal {
  /** SBV max deposit rate (%) — e.g. 5.5 means 5.5 % p.a. */
  vndDepositRate: number;
  /** US Fed Funds effective rate (%) */
  fedFundsRate: number;
  /** vndDepositRate − fedFundsRate, rounded to 2 decimal places */
  carrySpread: number;
  /** Regime classification based on spread thresholds */
  regime: CarryTradeRegime;
  /** Human-readable one-liner explanation in English */
  reasoning: string;
  /** ISO 8601 timestamp of computation */
  computedAt: string;
}

/** Threshold: spread above this value → HOT_MONEY_INFLOW */
const HOT_MONEY_THRESHOLD = 2.5;

/** Threshold: spread below this value → FII_OUTFLOW_RISK */
const OUTFLOW_RISK_THRESHOLD = 0.5;

/**
 * Computes the carry trade signal for VND vs USD.
 *
 * Implements the Thien Thoi global-liquidity-regime classification.
 *
 * Edge case: if either input is 0 (data unavailable), returns NEUTRAL with
 * a "Data unavailable" reasoning string. Does NOT throw.
 *
 * @param vndRate  SBV max deposit rate in percentage points (e.g. 5.5)
 * @param fedRate  US Fed Funds rate in percentage points (e.g. 4.33)
 * @returns        CarryTradeSignal — fully typed result with regime + reasoning
 */
export function computeCarryTradeSignal(
  vndRate: number,
  fedRate: number,
): CarryTradeSignal {
  const computedAt = new Date().toISOString();

  // ── Zero-data guard ────────────────────────────────────────────────────────
  if (vndRate === 0 || fedRate === 0) {
    return {
      vndDepositRate: vndRate,
      fedFundsRate: fedRate,
      carrySpread: 0,
      regime: "NEUTRAL",
      reasoning: "Data unavailable — one or both rates are zero",
      computedAt,
    };
  }

  // ── Carry spread ───────────────────────────────────────────────────────────
  const rawSpread = vndRate - fedRate;
  const carrySpread = Math.round(rawSpread * 100) / 100;

  // ── Regime classification ──────────────────────────────────────────────────
  let regime: CarryTradeRegime;
  let reasoning: string;

  if (carrySpread > HOT_MONEY_THRESHOLD) {
    regime = "HOT_MONEY_INFLOW";
    reasoning =
      `VND carry spread of ${carrySpread.toFixed(2)}pp is attractive: ` +
      `SBV deposit rate (${vndRate}%) materially exceeds USD Fed Funds ` +
      `(${fedRate}%), incentivising foreign inflow into VND assets.`;
  } else if (carrySpread >= OUTFLOW_RISK_THRESHOLD) {
    regime = "NEUTRAL";
    reasoning =
      `VND carry spread of ${carrySpread.toFixed(2)}pp is moderate: ` +
      `SBV rate (${vndRate}%) offers a balanced premium over USD (${fedRate}%) — ` +
      `neither strongly attracting nor repelling foreign institutional capital.`;
  } else {
    regime = "FII_OUTFLOW_RISK";
    reasoning =
      `VND carry spread of ${carrySpread.toFixed(2)}pp signals outflow risk: ` +
      `USD (${fedRate}%) yields near or above SBV deposit rate (${vndRate}%), ` +
      `reducing the incentive to hold VND assets and increasing FII exit pressure.`;
  }

  return {
    vndDepositRate: vndRate,
    fedFundsRate: fedRate,
    carrySpread,
    regime,
    reasoning,
    computedAt,
  };
}
