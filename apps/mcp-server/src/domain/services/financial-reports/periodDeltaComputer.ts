/**
 * Task 046 — Period Delta Computation (QoQ / YoY)
 *
 * Domain service: computes absolute and percent changes for key financial metrics
 * across two periods. Safe division rules:
 *   - previous = 0   → changePct is null (avoids Infinity)
 *   - previous < 0   → changePct is null (sign flip makes % meaningless)
 *   - otherwise      → changePct = (absolute / previous) × 100
 *
 * Pure function, zero I/O. Domain layer only.
 */

import type { ValueChange, RatioChange, PeriodDelta } from "../../../../bctc-schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public input type
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Flat record of key numbers extracted from BalanceSheet, IncomeStatement,
 * CashFlowStatement, and FinancialRatios for a single reporting period.
 *
 * All monetary values in million VND (triệu đồng).
 * Ratio values (margins, ROE, D/E) in their natural units (% or ratio).
 */
export interface FinancialMetrics {
  // ── Income Statement ──────────────────────────────────────────────────────
  /** Net revenue in million VND */
  netRevenue: number;
  /** Gross profit in million VND */
  grossProfit: number;
  /** Operating profit in million VND */
  operatingProfit: number;
  /** Net profit after tax in million VND */
  netProfit: number;
  /** EBITDA in million VND */
  ebitda: number;
  /** Earnings per share in VND */
  eps: number;

  // ── Balance Sheet ─────────────────────────────────────────────────────────
  /** Total assets in million VND */
  totalAssets: number;
  /** Total equity in million VND */
  equity: number;
  /** Total debt (short + long term) in million VND */
  totalDebt: number;
  /** Cash and equivalents in million VND */
  cash: number;

  // ── Cash Flow ─────────────────────────────────────────────────────────────
  /** Operating cash flow in million VND */
  operatingCF: number;
  /** Free cash flow in million VND */
  freeCashFlow: number;

  // ── Ratios ────────────────────────────────────────────────────────────────
  /** Gross margin in percent (e.g. 25.0 for 25%) */
  grossMarginPct: number;
  /**
   * Net margin in percent.
   * DSI-S3 C4: null when DB column is NULL (not yet computed) — a missing ratio
   * must not become a synthetic 0 that produces false QoQ/YoY deltas.
   * Callers set null; ratioChange propagates NaN so buildComparisonSection
   * can render "N/A" (same guard pattern as grossMarginPct for banks).
   */
  netMarginPct: number | null;
  /**
   * Return on equity in percent.
   * DSI-S3 C4: null when DB column is NULL.
   */
  roe: number | null;
  /**
   * Debt-to-equity ratio.
   * DSI-S3 C4: null when DB column is NULL.
   */
  debtToEquity: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a ValueChange struct.
 * changePct is null when:
 *   - previous = 0   (avoid division by zero / Infinity)
 *   - previous < 0   (percentage change across sign boundary is misleading)
 */
function valueChange(current: number, previous: number): ValueChange {
  const changeAbsolute = current - previous;
  let changePct: number | null;
  if (previous === 0 || previous < 0) {
    changePct = null;
  } else {
    changePct = (changeAbsolute / previous) * 100;
  }
  return { current, previous, changeAbsolute, changePct };
}

/**
 * Build a RatioChange struct (percentage-point difference).
 *
 * DSI-S3 C4: if either input is null (DB column not yet computed), propagate
 * NaN so buildComparisonSection can detect and render "N/A" instead of a
 * fabricated delta against a synthetic 0.
 */
function ratioChange(current: number | null, previous: number | null): RatioChange {
  if (current == null || previous == null) {
    return { current: NaN, previous: NaN, changePP: NaN };
  }
  return { current, previous, changePP: current - previous };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute period-over-period delta for all key financial metrics.
 *
 * @param current   - Metrics for the current reporting period
 * @param previous  - Metrics for the comparison period (prior quarter or prior year)
 * @param type      - 'QoQ' for quarter-over-quarter, 'YoY' for year-over-year
 * @returns         PeriodDelta with absolute changes, percent changes, and ratio pp changes
 *
 * @example
 * const delta = computePeriodDelta(q2Metrics, q1Metrics, 'QoQ');
 * console.log(delta.netRevenue.changePct);  // % growth in net revenue
 */
export function computePeriodDelta(
  current: FinancialMetrics,
  previous: FinancialMetrics,
  type: "QoQ" | "YoY",
): PeriodDelta {
  return {
    // Metadata — comparedTo is left empty here since FinancialMetrics carries
    // no period key; callers that hold FiscalPeriod data should set this field
    // after construction if needed. We use an empty string as a safe default.
    comparedTo: "",
    deltaType: type,

    // ── Income Statement deltas ────────────────────────────────────────────
    netRevenue: valueChange(current.netRevenue, previous.netRevenue),
    grossProfit: valueChange(current.grossProfit, previous.grossProfit),
    operatingProfit: valueChange(current.operatingProfit, previous.operatingProfit),
    netProfit: valueChange(current.netProfit, previous.netProfit),
    ebitda: valueChange(current.ebitda, previous.ebitda),
    eps: valueChange(current.eps, previous.eps),

    // ── Balance Sheet deltas ──────────────────────────────────────────────
    totalAssets: valueChange(current.totalAssets, previous.totalAssets),
    equity: valueChange(current.equity, previous.equity),
    totalDebt: valueChange(current.totalDebt, previous.totalDebt),
    cash: valueChange(current.cash, previous.cash),

    // ── Cash Flow deltas ──────────────────────────────────────────────────
    operatingCF: valueChange(current.operatingCF, previous.operatingCF),
    freeCashFlow: valueChange(current.freeCashFlow, previous.freeCashFlow),

    // ── Ratio deltas (percentage points) ──────────────────────────────────
    grossMarginPP: ratioChange(current.grossMarginPct, previous.grossMarginPct),
    netMarginPP: ratioChange(current.netMarginPct, previous.netMarginPct),
    roePP: ratioChange(current.roe, previous.roe),
    debtToEquityPP: ratioChange(current.debtToEquity, previous.debtToEquity),
  };
}
