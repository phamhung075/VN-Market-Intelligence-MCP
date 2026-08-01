/**
 * financialFiguresValidator.ts — Task 1345b / 1349d
 *
 * Domain service: pure financial validation function.
 * TypeScript mirror of Python validate_financial_figures() in pdf-extractor.
 *
 * Domain layer: ZERO imports from infrastructure/.
 * No I/O, no DB, no HTTP. Pure calculation only.
 *
 * Validation Rules (from BA spec REQ_1345 § 2.3 + REQ_1349d edge cases):
 *
 * Hard violations (return 0.0 immediately):
 *   BCTC-VAL-01: total_assets < total_equity (accounting identity broken)
 *                Example: VNM Q4 2024 — assets=957T < equity=18829T → 0.0
 *                Guard: when equity/assets ratio >= UNIT_SCALE_RATIO_THRESHOLD (500),
 *                equity is likely in raw VND while assets are in tỷ (OCR unit mismatch).
 *                In that case, apply soft penalty (+0.2) instead of hard fail.
 *   BCTC-VAL-01-SCALE: unit-scale artefact soft penalty (+0.2)
 *   BCTC-VAL-02: total_assets < 0 (impossible in real accounting)
 *   BCTC-VAL-04: total_liabilities < 0 (impossible in real accounting)
 *   BCTC-VAL-07: total_liabilities > total_assets * 5 (extreme leverage — data corruption)
 *                Example: liab=1000, assets=100 → ratio 10x → 0.0
 *   BCTC-VAL-08: all key figures are zero (empty extraction — no usable data)
 *   BCTC-VAL-09: critically incomplete — assets/equity/revenue all null/zero with liabilities present
 *   BCTC-VAL-10: operating_margin beyond extreme bounds (ratio > 5.0 or < -5.0 = ±500%)
 *                Example: margin=9.99 (999%) — OCR corruption → 0.0
 *
 * Soft violations (-0.2 each, stacked):
 *   BCTC-VAL-03: operating_margin outside (-5.0, +1.0) as ratio — moderate outlier (still soft)
 *                Example: VEA Q4 2024 — margin=3.3 (330%) → but caught by VAL-10 if > 2.0
 *   BCTC-VAL-05: net_revenue <= 0 (non-holding company with no revenue)
 *   BCTC-VAL-06: equity < 0 (negative equity — suspicious for OCR extraction)
 *
 *   FIX-BCTC-1345B-ALERT-NAMES-A-RULE-FAMILY-THAT-CANNOT-PRODUCE-ITS-OWN-VALUE
 *   (2026-08-01): there is NO 0.1 floor. The three soft violations above are
 *   the only ones that can stack (max penalty 0.6), and BCTC-VAL-01-SCALE /
 *   BCTC-VAL-01-POSITION (which require totalEquity>0) can never co-fire with
 *   BCTC-VAL-06 (which requires totalEquity<0) — so the true minimum
 *   non-hard-fail output is 0.4, not 0.1. A `Math.max(confidence, 0.1)` floor
 *   used to sit here; it was dead code (unreachable — penalty never exceeds
 *   0.6) and its docstring made 0.1 look like a legitimate output of this
 *   function, colliding with the unrelated unit-mismatch sentinel value
 *   `0.1` that parseBctcReport.ts assigns WITHOUT calling this function at
 *   all. Removed rather than kept, per the task's AC-3 either/or: this
 *   function's only real outputs are now exactly {0.0, 0.4, 0.6, 0.8, 1.0} —
 *   0.1 is reserved exclusively for the caller's unit-mismatch short-circuit.
 *
 * null values are skipped — partial extraction is not penalized UNLESS the record
 * is critically incomplete (see BCTC-VAL-09).
 *
 * composite_confidence = min(ocr_confidence, confidence_financial)
 * Downstream callers must gate conviction signal generation on composite <= 0.3.
 */

/**
 * Threshold for detecting a unit-scale mismatch in VAL-01.
 *
 * When equity / assets >= this value, the OCR extractor likely left equity in
 * raw VND (e.g. 18,829,000,000,000) while assets are normalised to tỷ (e.g. 1,000).
 * The legitimate maximum equity/assets ratio for any real company is ≈ 0.99;
 * a ratio ≥ 500 is impossible under Vietnamese accounting standards and can only
 * arise from a unit-normalisation failure in the extractor.
 *
 * Derivation:
 *   - 1 tỷ = 10^9 VND, so a mismatch produces a ratio of ~1,000×.
 *   - Setting threshold at 500 provides a 2× safety margin below 1,000.
 *   - The VNM test fixture (957 vs 18829, ratio ≈ 19.7) is well below 500,
 *     so it continues to trigger the hard-fail path (genuine accounting violation).
 *
 * @example
 * // Unit-scale artefact: equity=600000 (raw VND), assets=1000 (tỷ) → ratio 600 > 500
 * // → soft penalty BCTC-VAL-01-SCALE (+0.2), NOT hard fail
 *
 * @example
 * // Genuine violation: equity=18829 (tỷ), assets=957 (tỷ) → ratio ≈ 19.7 < 500
 * // → hard fail, returns 0.0
 */
const UNIT_SCALE_RATIO_THRESHOLD = 500;

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
 * A single rule violation identified by {@link validateFinancialFiguresDetailed}.
 * `rule` is the canonical BCTC-VAL-NN code; `detail` is a human-readable,
 * figure-bearing description suitable for direct inclusion in an alert
 * message (FIX-BCTC-1345B-ALERT-NAMES-A-RULE-FAMILY-THAT-CANNOT-PRODUCE-ITS-OWN-VALUE).
 */
export interface FinancialFiguresViolation {
  rule: string;
  detail: string;
}

/** Result of {@link validateFinancialFiguresDetailed}. */
export interface FinancialFiguresValidationResult {
  confidence: number;
  violations: FinancialFiguresViolation[];
}

/**
 * Validate extracted BCTC financial figures against accounting rules,
 * returning BOTH the confidence score AND the specific rule(s) that fired.
 *
 * `validateFinancialFigures()` below is a thin wrapper around this function
 * (same scoring logic, single source of truth) — it exists so every existing
 * caller/test that only wants the number keeps working unchanged.
 *
 * Returns a confidence score in [0.0, 1.0]:
 *   1.0 — all provided figures pass all rules (violations: [])
 *   0.0 — exactly one hard violation (accounting identity impossible; the
 *         function returns immediately on the first hard violation found,
 *         so violations always has exactly 1 entry when confidence is 0.0)
 *   0.4 / 0.6 / 0.8 — 1–3 soft violations stacked (-0.2 each); there is NO
 *         floor below this — see the module docstring for why 0.1 (this
 *         function's caller reserves that value for an unrelated condition)
 *         can never appear here.
 *
 * @param input - Extracted financial figures; null values are skipped.
 *
 * @example
 * // VNM Q4 2024 corruption: assets << equity
 * validateFinancialFiguresDetailed({ totalAssets: 957, totalEquity: 18829, ... })
 * // → { confidence: 0.0, violations: [{ rule: "BCTC-VAL-01", detail: "..." }] }
 *
 * @example
 * // VEA Q4 2024: impossible operating margin (330%)
 * validateFinancialFiguresDetailed({ ..., operatingMargin: 3.3 })
 * // → { confidence: 0.8, violations: [{ rule: "BCTC-VAL-03", detail: "..." }] }
 */
export function validateFinancialFiguresDetailed(
  input: FinancialFiguresInput,
): FinancialFiguresValidationResult {
  const { totalAssets, totalEquity, totalLiabilities, operatingMargin, netRevenue } = input;

  // ── Hard violations ────────────────────────────────────────────────────────

  // BCTC-VAL-08: all key figures are zero — empty extraction, no usable data.
  // An active company cannot simultaneously have assets=0, equity=0,
  // liabilities=0, and revenue=0. This is a sentinel for a failed parse.
  const assetVal = totalAssets ?? 0;
  const equityVal = totalEquity ?? 0;
  const liabVal = totalLiabilities ?? 0;
  const revenueVal = netRevenue ?? 0;
  if (assetVal === 0 && equityVal === 0 && liabVal === 0 && revenueVal === 0) {
    return {
      confidence: 0.0,
      violations: [{ rule: "BCTC-VAL-08", detail: "all key figures are zero (empty extraction, no usable data)" }],
    };
  }

  // BCTC-VAL-09: critically incomplete record.
  // Assets, equity, and revenue are all null/zero while liabilities is present.
  // Without the asset/equity side we cannot verify the accounting identity;
  // the record carries only one side of the balance sheet — data is unusable.
  if (
    (totalAssets === null || totalAssets === 0) &&
    (totalEquity === null || totalEquity === 0) &&
    (netRevenue === null || netRevenue === 0) &&
    totalLiabilities !== null &&
    totalLiabilities > 0
  ) {
    return {
      confidence: 0.0,
      violations: [{
        rule: "BCTC-VAL-09",
        detail: `assets/equity/revenue all null-or-zero while total_liabilities=${totalLiabilities} is present — critically incomplete record`,
      }],
    };
  }

  // Penalty accumulator — declared here so BCTC-VAL-01-SCALE (soft path) can
  // contribute before the remaining hard-violation checks.
  let penalty = 0;
  const violations: FinancialFiguresViolation[] = [];

  // BCTC-VAL-01: total_assets < total_equity (accounting identity A = L + E)
  //
  // Scale-check guard (BCTC-VAL-01-SCALE):
  //   When equity/assets >= UNIT_SCALE_RATIO_THRESHOLD (500), equity is likely
  //   in raw VND while assets are in tỷ — OCR unit-normalisation failure.
  //   Apply a soft penalty (+0.2) instead of hard-failing to avoid false positives.
  //
  //   When ratio ≤ 500 AND assets < equity AND netRevenue > assets*30 → positional
  //   extraction error (e.g. VNM Q4-2025 sub-total row picked instead of grand total)
  //   → soft penalty (BCTC-VAL-01-POSITION). Otherwise → genuine violation → 0.0.
  if (totalAssets !== null && totalEquity !== null && totalAssets > 0 && totalEquity > 0) {
    const equityToAssetsRatio = totalEquity / totalAssets;
    if (equityToAssetsRatio >= UNIT_SCALE_RATIO_THRESHOLD) {
      // Unit-scale artefact: equity appears in raw VND, assets in tỷ.
      // Bypass hard fail — record a soft penalty instead.
      penalty += 0.2; // BCTC-VAL-01-SCALE
      violations.push({
        rule: "BCTC-VAL-01-SCALE",
        detail: `equity/assets ratio ${equityToAssetsRatio.toFixed(1)}x >= ${UNIT_SCALE_RATIO_THRESHOLD} (unit-scale artefact: equity=${totalEquity}, assets=${totalAssets})`,
      });
    } else if (totalAssets < totalEquity) {
      // BCTC-VAL-01-POSITION: assets < equity but revenue >> assets (>30×).
      // When netRevenue exceeds 30× totalAssets, the assets figure is almost
      // certainly a sub-total extracted from the wrong balance-sheet row
      // (e.g. VNM Q4-2025: extractor picks current-assets sub-total ~957 tỷ
      // instead of grand total ~60,000 tỷ while revenue is correctly ~63,645 tỷ).
      // A real company cannot have revenue 30× its total assets — this is a
      // positional extraction error, not a genuine accounting identity violation.
      // Apply a soft penalty instead of hard-failing so the record is stored.
      if (netRevenue !== null && totalAssets > 0 && netRevenue > totalAssets * 30) {
        penalty += 0.2; // BCTC-VAL-01-POSITION
        violations.push({
          rule: "BCTC-VAL-01-POSITION",
          detail: `total_assets=${totalAssets} < total_equity=${totalEquity} but net_revenue=${netRevenue} > 30x assets (positional extraction error, not accounting-identity violation)`,
        });
      } else {
        // Genuine accounting identity violation — hard fail.
        return {
          confidence: 0.0,
          violations: [{
            rule: "BCTC-VAL-01",
            detail: `total_assets=${totalAssets} < total_equity=${totalEquity} — accounting identity broken (A = L + E)`,
          }],
        };
      }
    }
  }

  // BCTC-VAL-02: negative total assets (physically impossible)
  if (totalAssets !== null && totalAssets < 0) {
    return {
      confidence: 0.0,
      violations: [{ rule: "BCTC-VAL-02", detail: `total_assets=${totalAssets} < 0 (physically impossible)` }],
    };
  }

  // BCTC-VAL-04: negative total liabilities (physically impossible)
  if (totalLiabilities !== null && totalLiabilities < 0) {
    return {
      confidence: 0.0,
      violations: [{ rule: "BCTC-VAL-04", detail: `total_liabilities=${totalLiabilities} < 0 (physically impossible)` }],
    };
  }

  // BCTC-VAL-07: liabilities > assets by ≥ 5x — extreme leverage signals data corruption.
  // Genuine insolvency shows negative equity, not a 5x liability/asset ratio.
  if (
    totalLiabilities !== null &&
    totalAssets !== null &&
    totalAssets > 0 &&
    totalLiabilities > totalAssets * 5
  ) {
    return {
      confidence: 0.0,
      violations: [{
        rule: "BCTC-VAL-07",
        detail: `total_liabilities=${totalLiabilities} > 5x total_assets=${totalAssets} — extreme leverage, data corruption`,
      }],
    };
  }

  // BCTC-VAL-10: operating margin beyond extreme bounds (ratio > 5.0 = 500% or < -5.0).
  // A 500%+ margin is physically impossible for a real company — pure OCR corruption.
  // Moderate outliers (e.g. 330% / ratio 3.3) are still caught by soft BCTC-VAL-03.
  if (operatingMargin !== null && (operatingMargin > 5.0 || operatingMargin < -5.0)) {
    return {
      confidence: 0.0,
      violations: [{
        rule: "BCTC-VAL-10",
        detail: `operating_margin=${(operatingMargin * 100).toFixed(0)}% beyond ±500% bound — OCR corruption`,
      }],
    };
  }

  // ── Soft violations ────────────────────────────────────────────────────────
  // (penalty accumulator declared above near BCTC-VAL-01-SCALE)

  // BCTC-VAL-03: operating margin outside (-5.0, +1.0) as ratio (moderate outlier)
  // Note: extreme margins (> 2.0 or < -2.0) are already caught as hard violations above.
  if (operatingMargin !== null && !(operatingMargin > -5.0 && operatingMargin < 1.0)) {
    penalty += 0.2;
    violations.push({
      rule: "BCTC-VAL-03",
      detail: `operating_margin=${(operatingMargin * 100).toFixed(0)}% outside normal range (-500%,+100%)`,
    });
  }

  // BCTC-VAL-05: net revenue <= 0
  if (netRevenue !== null && netRevenue <= 0) {
    penalty += 0.2;
    violations.push({ rule: "BCTC-VAL-05", detail: `net_revenue=${netRevenue} <= 0` });
  }

  // BCTC-VAL-06: equity < 0
  if (totalEquity !== null && totalEquity < 0) {
    penalty += 0.2;
    violations.push({ rule: "BCTC-VAL-06", detail: `total_equity=${totalEquity} < 0 (negative equity)` });
  }

  const confidence = 1.0 - penalty;
  return { confidence, violations };
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
