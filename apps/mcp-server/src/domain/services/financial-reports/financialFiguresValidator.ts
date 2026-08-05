/**
 * financialFiguresValidator.ts — Task 1345b / 1349d
 *
 * Domain service: pure financial validation function.
 * TypeScript mirror of Python validate_financial_figures() in pdf-extractor.
 *
 * Domain layer: ZERO imports from infrastructure/.
 * No I/O, no DB, no HTTP. Pure calculation only.
 *
 * The full BCTC-VAL-NN rule catalog (hard/soft violations) and the detailed
 * rule engine (validateFinancialFiguresDetailed) live in
 * financialFiguresRules.ts (FIX-CI-SIZELINT-BCTC-1345B-PARSE-VALIDATOR-PAIR,
 * 2026-08-05 split — see that file's docstring for the catalog). This file
 * keeps the two unit-mismatch pre-checks (detectUnitMismatch /
 * detectBsIntraStmtUnitMismatch), the report-date validator, the shared
 * FinancialFiguresInput contract, and the thin validateFinancialFigures()
 * wrapper every existing caller/test uses. validateFinancialFiguresDetailed()
 * and its violation types are re-exported below unchanged so no import path
 * needs to move.
 *
 * composite_confidence = min(ocr_confidence, confidence_financial)
 * Downstream callers must gate conviction signal generation on composite <= 0.3.
 */

import { validateFinancialFiguresDetailed } from "./financialFiguresRules.js";
export { validateFinancialFiguresDetailed } from "./financialFiguresRules.js";
export type {
  FinancialFiguresViolation,
  FinancialFiguresValidationResult,
} from "./financialFiguresRules.js";

/**
 * Validate a BCTC report date string.
 *
 * Valid formats: "YYYY-Qn" (e.g. "2025-Q4") or "YYYY" (annual).
 * A date is invalid if:
 *   - It does not match a recognised pattern
 *   - The year is in the future (> current calendar year)
 *   - The quarter number is outside 1–4
 *
 * Domain layer — pure function, zero I/O.
 *
 * @param reportDate - Raw date string from BCTC record.
 * @returns true when the date is structurally valid and not in the future.
 *
 * @example
 * validateReportDate("2025-Q4")    // → true
 * validateReportDate("invalid")    // → false
 * validateReportDate("2030-Q1")    // → false (future)
 */
export function validateReportDate(reportDate: string | null | undefined): boolean {
  if (reportDate === null || reportDate === undefined || reportDate.trim() === "") {
    return false;
  }

  const currentYear = new Date().getFullYear();

  // Pattern: YYYY-Qn
  const quarterMatch = /^(\d{4})-Q([1-4])$/.exec(reportDate.trim());
  if (quarterMatch) {
    const year = parseInt(quarterMatch[1] ?? "0", 10);
    return year <= currentYear;
  }

  // Pattern: YYYY (annual report)
  const annualMatch = /^(\d{4})$/.exec(reportDate.trim());
  if (annualMatch) {
    const year = parseInt(annualMatch[1] ?? "0", 10);
    return year <= currentYear;
  }

  return false;
}

export interface FinancialFiguresInput {
  /** Total assets from balance sheet (billion VND). null = not extracted. */
  totalAssets: number | null;
  /** Total equity from balance sheet (billion VND). null = not extracted. */
  totalEquity: number | null;
  /** Total liabilities from balance sheet (billion VND). null = not extracted. */
  totalLiabilities: number | null;
  /** Operating profit / net revenue as ratio (not %). null = not extracted. */
  operatingMargin: number | null;
  /** Net revenue from income statement (billion VND). null = not extracted. */
  netRevenue: number | null;
}

/**
 * Detect a cross-statement unit scale mismatch (Task 1810c).
 *
 * Returns true when totalAssets and netRevenue differ by more than 1000x,
 * which is physically impossible for a real company and signals that one
 * extractor left its values in a different scale (e.g. raw VND vs triệu).
 *
 * Domain layer — pure function, zero I/O.
 *
 * @param totalAssets - Balance sheet total assets (triệu VND). null = not extracted.
 * @param netRevenue  - Income statement net revenue (triệu VND). null = not extracted.
 * @returns true when a unit mismatch is detected.
 */
export function detectUnitMismatch(
  totalAssets: number | null,
  netRevenue: number | null,
): boolean {
  if (totalAssets === null || netRevenue === null || totalAssets === 0 || netRevenue === 0) return false;
  const ratio = totalAssets > netRevenue ? totalAssets / netRevenue : netRevenue / totalAssets;
  return ratio > 1000;
}

/**
 * Detect a within-balance-sheet unit scale mismatch (FIX-BCTC-MAGNITUDE-NORMALIZE).
 *
 * Returns true when totalAssets and totalLiabilities differ by more than 100x,
 * which is physically impossible for a real company and signals that the OCR
 * extractor left one field in raw VND while the other was normalised to triệu
 * (e.g. HPG Q1-2026: assets 400,271,001,803 raw-VND vs liabilities 76,754,658 triệu).
 *
 * A 100x threshold is used rather than 1000x because legitimate high-equity
 * companies can have liabilities well below 10% of assets (e.g. 10x ratio is
 * real), but a 100x+ difference guarantees a unit-normalisation failure.
 *
 * Domain layer — pure function, zero I/O.
 *
 * @param totalAssets      - Balance sheet total assets (triệu VND). null/0 = skip.
 * @param totalLiabilities - Balance sheet total liabilities (triệu VND). null/0 = skip.
 * @returns true when a within-statement unit mismatch is detected.
 */
export function detectBsIntraStmtUnitMismatch(
  totalAssets: number | null,
  totalLiabilities: number | null,
): boolean {
  if (totalAssets === null || totalLiabilities === null || totalAssets === 0 || totalLiabilities === 0) return false;
  const ratio = totalAssets > totalLiabilities ? totalAssets / totalLiabilities : totalLiabilities / totalAssets;
  return ratio > 100;
}

/**
 * Validate extracted BCTC financial figures against accounting rules.
 *
 * Thin wrapper around {@link validateFinancialFiguresDetailed} — returns only
 * the confidence number, for the many existing callers/tests that don't need
 * per-rule detail.
 *
 * Returns a confidence score in [0.0, 1.0]:
 *   1.0 — all provided figures pass all rules
 *   0.0 — at least one hard violation (accounting identity impossible)
 *   0.4 / 0.6 / 0.8 — soft violations stack, NO floor (see module docstring)
 *
 * @param input - Extracted financial figures; null values are skipped.
 * @returns float in [0.0, 1.0]
 *
 * @example
 * // VNM Q4 2024 corruption: assets << equity
 * validateFinancialFigures({ totalAssets: 957, totalEquity: 18829, ... }) // → 0.0
 *
 * @example
 * // VEA Q4 2024: impossible operating margin (330%)
 * validateFinancialFigures({ ..., operatingMargin: 3.3 }) // → 0.8 (soft -0.2)
 */
export function validateFinancialFigures(input: FinancialFiguresInput): number {
  return validateFinancialFiguresDetailed(input).confidence;
}
