/**
 * bctcRatioRecompute — shared recompute-on-read helper for DERIVED ratio fields.
 *
 * SSOT for the ratio recompute formulas used by BOTH:
 *   - get_bctc_full  (bctcFullTools.ts  — BAL-1a recompute block)
 *   - get_bctc_series (bctcSeriesTools.ts — FIX-C consistency fix)
 *
 * Motivation: the persisted ratio columns (roe, roa, current_ratio, debt_to_equity,
 * net_debt_to_ebitda) retain OCR-parse values that may be stale, unit-scale wrong,
 * or null for quarters whose recompute path had not yet run.  Both serve tools MUST
 * recompute these values from the base scalars at read time — using the SAME formula
 * — so that they cannot drift apart.
 *
 * Extracting to this module (DRY) permanently eliminates the divergence class:
 *   any future formula change lands here once and is instantly visible to both tools.
 *
 * SCALE CONTRACT:
 *   - roe / roa  → percent scale (e.g. 6.17 means 6.17%)
 *   - debt_to_equity / net_debt_to_ebitda / current_ratio → ratio scale (e.g. 0.5 means 0.5×)
 *
 * HONEST-NULL CONTRACT:
 *   - If required inputs are null/zero the ratio is null — never fabricate, never divide-by-zero.
 *
 * @module domain/services/financial-reports/bctcRatioRecompute
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimal scalar inputs required to recompute all derived ratio fields.
 * All fields are the column names as stored in financial_reports.
 * Monetary values are in million VND (as stored).
 */
export interface RatioRecomputeInputs {
  net_profit: number;
  equity_total: number;
  total_assets: number;
  current_assets: number;
  short_term_debt: number;
  long_term_debt: number;
  cash: number;
  ebitda: number;
  total_liabilities: number;
  /** JSON string from balance_sheet_json column — used for current_ratio only. Null = no data. */
  balance_sheet_json: string | null;
}

/**
 * Recomputed derived ratios — same field names as financial_reports columns.
 */
export interface RecomputedRatios {
  /** Percent scale: net_profit / equity_total × 100.  Null when equity ≤ 0 or inputs null. */
  roe: number | null;
  /** Percent scale: net_profit / total_assets × 100.  Null when total_assets ≤ 0 or inputs null. */
  roa: number | null;
  /** Ratio scale: current_assets / currentLiabilities.total.  Null when denominator implausible. */
  current_ratio: number | null;
  /** Ratio scale: (short_term_debt + long_term_debt) / equity_total.  Null when decomp absent. */
  debt_to_equity: number | null;
  /** Ratio scale: (short_term_debt + long_term_debt − cash) / ebitda.  Null when ebitda ≤ 0. */
  net_debt_to_ebitda: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────────────────

/**
 * safeDivide — returns null when denominator is 0 or result non-finite.
 * Mirrors ratioComputer.ts safeDivide and bctcFullTools.ts safeDivideRead exactly.
 */
export function safeDivide(num: number, denom: number): number | null {
  if (denom === 0) return null;
  const r = num / denom;
  if (!Number.isFinite(r)) return null;
  return r;
}

// ─────────────────────────────────────────────────────────────────────────────
// Exported helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * recomputeRatios — recomputes all 5 derived ratio fields from base scalars.
 *
 * Formula SSOT (mirrors BAL-1a block in bctcFullTools.ts exactly):
 *   roe               = net_profit / equity_total × 100          (percent, equity > 0)
 *   roa               = net_profit / total_assets × 100          (percent, total_assets > 0)
 *   current_ratio     = current_assets / currentLiabilities.total (ratio, from JSON blob)
 *   debt_to_equity    = (short_term_debt + long_term_debt) / equity_total (ratio, decomp present)
 *   net_debt_to_ebitda = (short_term_debt + long_term_debt - cash) / ebitda (ratio, ebitda > 0)
 *
 * BAL-1f guards (current_ratio):
 *   - clTotal must be ≥ 1.0 million VND absolute floor
 *   - clTotal must be ≥ 0.1% of current_assets (meaningful fraction check)
 *   - result > 1000× is clamped to null (implausible band)
 *
 * FU-DE-SERVE-HONEST guards (debt_to_equity):
 *   - debtSum must be ≥ 1.0 million VND absolute floor
 *   - debtSum must be ≥ 0.1% of total_liabilities (decomposition plausibility)
 *   - when decomp absent and total_liabilities > 0 → null (never false 'debt-free')
 *
 * @param inputs  Scalar inputs read from financial_reports row.
 * @returns       Recomputed ratio values, all in their documented scale.
 */
export function recomputeRatios(inputs: RatioRecomputeInputs): RecomputedRatios {
  const {
    net_profit,
    equity_total,
    total_assets,
    current_assets,
    short_term_debt,
    long_term_debt,
    cash,
    ebitda,
    total_liabilities,
    balance_sheet_json,
  } = inputs;

  // ── roe: net_profit / equity_total × 100 ─────────────────────────────────
  const roe: number | null =
    equity_total > 0
      ? (safeDivide(net_profit, equity_total) !== null
          ? safeDivide(net_profit, equity_total)! * 100
          : null)
      : null;

  // ── roa: net_profit / total_assets × 100 ─────────────────────────────────
  const roa: number | null =
    total_assets > 0
      ? (safeDivide(net_profit, total_assets) !== null
          ? safeDivide(net_profit, total_assets)! * 100
          : null)
      : null;

  // ── current_ratio: current_assets / currentLiabilities.total ─────────────
  // Source: balance_sheet_json blob — same source as BLOCK-3 in finalizeBctcRefineTool.ts
  // BAL-1f: principled floor guards against micro-residuals from component rounding.
  let current_ratio: number | null = null;
  if (current_assets !== null && balance_sheet_json) {
    try {
      const bs = JSON.parse(balance_sheet_json) as Record<string, unknown>;
      const cl = bs["currentLiabilities"];
      const clTotal =
        cl !== null && typeof cl === "object" && cl !== undefined
          ? (cl as Record<string, unknown>)["total"]
          : undefined;

      const MIN_CL_FRACTION = 0.001; // 0.1% of current_assets
      const MIN_CL_ABSOLUTE = 1.0;   // 1 million VND minimum
      const clIsPlausible =
        typeof clTotal === "number" &&
        clTotal >= MIN_CL_ABSOLUTE &&
        (current_assets === 0 || clTotal >= current_assets * MIN_CL_FRACTION);

      if (clIsPlausible) {
        const ratio = safeDivide(current_assets, clTotal as number);
        // BAL-1f: implausible result band — > 1000× is physically impossible
        current_ratio = ratio !== null && ratio <= 1000 ? ratio : null;
      }
    } catch {
      // JSON parse error — leave current_ratio null (safe fallback)
    }
  }

  // ── debt_to_equity: (short_term_debt + long_term_debt) / equity_total ────
  // FU-DE-SERVE-HONEST: guard against false 'debt-free' when decomposition absent.
  const debtSum = short_term_debt + long_term_debt;
  const MIN_DEBT_FRACTION = 0.001; // 0.1% of total_liabilities
  const MIN_DEBT_ABSOLUTE = 1.0;   // 1 million VND floor

  const debtDecompPlausible =
    debtSum >= MIN_DEBT_ABSOLUTE &&
    (total_liabilities === 0 || debtSum >= total_liabilities * MIN_DEBT_FRACTION);

  let debt_to_equity: number | null;
  if (debtDecompPlausible && equity_total > 0) {
    debt_to_equity = safeDivide(debtSum, equity_total);
  } else if (!debtDecompPlausible && total_liabilities > 0) {
    // Decomposition absent while real liabilities exist — serve N/A (honest)
    debt_to_equity = null;
  } else {
    // Standard null path: debtSum implausible or equity ≤ 0
    debt_to_equity = equity_total > 0 ? safeDivide(debtSum, equity_total) : null;
  }

  // ── net_debt_to_ebitda: (short_term_debt + long_term_debt − cash) / ebitda
  const net_debt_to_ebitda: number | null =
    ebitda > 0
      ? safeDivide(short_term_debt + long_term_debt - cash, ebitda)
      : null;

  return {
    roe,
    roa,
    current_ratio,
    debt_to_equity,
    net_debt_to_ebitda,
  };
}
