/**
 * Task 1878b — Sloan Accruals Ratio domain function
 *
 * Pure domain function: no I/O, no infrastructure imports.
 * Formula: Accruals_t = (NetIncome_t - OperatingCashFlow_t) / TotalAssets_t
 *
 * Sign semantics:
 *   Positive → NI > OCF — earnings elevated relative to cash generation (potential inflation signal)
 *   Negative → OCF > NI — conservative earnings, cash-backed
 *
 * Layer: domain/services/financial-reports (co-located with ratioComputer.ts)
 *
 * @module domain/services/financial-reports/accruals
 */

import { z } from "zod";

// ── Input types ──────────────────────────────────────────────────────────────

export interface AccrualsInput {
  net_income_m: number | null;
  ocf_m: number | null;
  total_assets_m: number | null;
}

// ── Output types ─────────────────────────────────────────────────────────────

export interface AccrualPointResult {
  accruals_ratio: number | null;
  missing: string[];
  error: string | null;
}

// ── Zod schema (exported for tool-layer reuse in tests) ──────────────────────

export const AccrualsInputSchema = z.object({
  net_income_m: z.number().nullable(),
  ocf_m: z.number().nullable(),
  total_assets_m: z.number().nullable(),
});

// ── Pure function ─────────────────────────────────────────────────────────────

/**
 * Compute the Sloan Accruals Ratio for a single period.
 *
 * Returns:
 *   - accruals_ratio: (net_income - ocf) / total_assets, or null if any input is null or total_assets = 0
 *   - missing: list of which inputs were null (["NET_INCOME", "OCF", "TOTAL_ASSETS"] as applicable)
 *   - error: "zero_total_assets" if total_assets = 0, otherwise null
 *
 * Never throws. Returns null ratio for all invalid/missing data cases.
 */
export function computeAccrualPoint(input: AccrualsInput): AccrualPointResult {
  const { net_income_m, ocf_m, total_assets_m } = input;

  const missing: string[] = [];

  if (net_income_m === null || net_income_m === undefined) {
    missing.push("NET_INCOME");
  }
  if (ocf_m === null || ocf_m === undefined) {
    missing.push("OCF");
  }
  if (total_assets_m === null || total_assets_m === undefined) {
    missing.push("TOTAL_ASSETS");
  }

  // If any required input is missing, cannot compute
  if (missing.length > 0) {
    return { accruals_ratio: null, missing, error: null };
  }

  // All inputs present — check division by zero
  if (total_assets_m === 0) {
    return { accruals_ratio: null, missing: [], error: "zero_total_assets" };
  }

  const ratio = (net_income_m! - ocf_m!) / total_assets_m!;

  // Guard: reject non-finite results (should not happen, but belt-and-suspenders)
  if (!Number.isFinite(ratio)) {
    return { accruals_ratio: null, missing: [], error: "zero_total_assets" };
  }

  return { accruals_ratio: ratio, missing: [], error: null };
}
