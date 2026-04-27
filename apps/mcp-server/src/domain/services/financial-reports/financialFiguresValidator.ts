/**
 * financialFiguresValidator.ts — Task 1345b
 *
 * Domain service: pure financial validation function.
 * TypeScript mirror of Python validate_financial_figures() in pdf-extractor.
 *
 * Domain layer: ZERO imports from infrastructure/.
 * No I/O, no DB, no HTTP. Pure calculation only.
 *
 * Validation Rules (from BA spec REQ_1345 § 2.3):
 *
 * Hard violations (return 0.0 immediately):
 *   BCTC-VAL-01: total_assets < total_equity (accounting identity broken)
 *                Example: VNM Q4 2024 — assets=957T < equity=18829T → 0.0
 *   BCTC-VAL-02: total_assets < 0 (impossible in real accounting)
 *   BCTC-VAL-04: total_liabilities < 0 (impossible in real accounting)
 *
 * Soft violations (-0.2 each, stacked, floor 0.1):
 *   BCTC-VAL-03: operating_margin outside (-5.0, +1.0) as ratio (not %)
 *                Example: VEA Q4 2024 — margin=3.3 (330%) → -0.2
 *   BCTC-VAL-05: net_revenue <= 0 (non-holding company with no revenue)
 *   BCTC-VAL-06: equity < 0 (negative equity — suspicious for OCR extraction)
 *
 * null values are skipped — partial extraction is not penalized.
 *
 * composite_confidence = min(ocr_confidence, confidence_financial)
 * Downstream callers must gate conviction signal generation on composite <= 0.3.
 */

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
 * Validate extracted BCTC financial figures against accounting rules.
 *
 * Returns a confidence score in [0.0, 1.0]:
 *   1.0  — all provided figures pass all rules
 *   0.0  — at least one hard violation (accounting identity impossible)
 *   0.1+ — soft violations stack, floor at 0.1
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
  const { totalAssets, totalEquity, totalLiabilities, operatingMargin, netRevenue } = input;

  // ── Hard violations ────────────────────────────────────────────────────────

  // BCTC-VAL-01: total_assets < total_equity (accounting identity A = L + E)
  if (
    totalAssets !== null &&
    totalEquity !== null &&
    totalAssets > 0 &&
    totalEquity > 0 &&
    totalAssets < totalEquity
  ) {
    return 0.0;
  }

  // BCTC-VAL-02: negative total assets (physically impossible)
  if (totalAssets !== null && totalAssets < 0) {
    return 0.0;
  }

  // BCTC-VAL-04: negative total liabilities (physically impossible)
  if (totalLiabilities !== null && totalLiabilities < 0) {
    return 0.0;
  }

  // ── Soft violations ────────────────────────────────────────────────────────
  let penalty = 0;

  // BCTC-VAL-03: operating margin outside (-5.0, +1.0) as ratio
  if (operatingMargin !== null && !(operatingMargin > -5.0 && operatingMargin < 1.0)) {
    penalty += 0.2;
  }

  // BCTC-VAL-05: net revenue <= 0
  if (netRevenue !== null && netRevenue <= 0) {
    penalty += 0.2;
  }

  // BCTC-VAL-06: equity < 0
  if (totalEquity !== null && totalEquity < 0) {
    penalty += 0.2;
  }

  const confidence = 1.0 - penalty;
  return Math.max(confidence, 0.1);
}
