/**
 * BCTC Validator — Task 132
 *
 * Validates extracted financial report data before it reaches downstream
 * consumers (investors, alerts, RAG memory).
 *
 * Domain layer — pure function, zero I/O.
 *
 * Validation tiers:
 *   CRITICAL (error, isValid = false)
 *     - Accounting identity violated beyond 1% tolerance
 *     - Gross profit exceeds net revenue
 *     - Unrealistic magnitude (> 1e15 VND)
 *     - Low extraction confidence (< 0.3)
 *     - Empty balance sheet (all zeros)
 *     - Negative total assets
 *
 *   WARNING (non-blocking, isValid stays true if no errors)
 *     - Asset decomposition off by > 2%
 *     - Net profit exceeds gross profit
 *     - Zero revenue with positive profit
 *     - Negative net revenue
 *     - Negative equity (insolvency indicator)
 *
 * All amounts are in million VND (triệu đồng).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Public Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  /** true only when there are zero blocking errors */
  isValid: boolean;
  /** 0–1: how confident we are in the extracted data */
  confidence: number;
  /** Non-blocking issues — report can still be used but should be flagged */
  warnings: string[];
  /** Blocking issues — data should not be used */
  errors: string[];
}

/** Minimal shape the validator needs from a financial report */
export interface ValidatableReport {
  balanceSheet?: {
    totalAssets?: number;
    totalLiabilities?: number;
    equityTotal?: number;
    currentAssets?: number;
    nonCurrentAssets?: number;
  };
  incomeStatement?: {
    netRevenue?: number;
    grossProfit?: number;
    netProfit?: number;
  };
  cashFlow?: {
    operatingCF?: number;
  };
  extractionConfidence?: number;
  /**
   * isBankForm — true when the report follows Mẫu B02-TCTD (banking entity).
   * When true, gross_profit comparisons (C-5) and asset decomposition (C-7) are
   * skipped because neither concept applies to bank balance sheets.
   * Derived from financial_reports.domain via isBankForm() (bctcFormType.ts).
   */
  isBankForm?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum realistic value for any single field (quadrillion VND) */
const MAX_REALISTIC_VALUE = 1e15;

/** Accounting identity tolerance: 1% relative mismatch triggers error */
const IDENTITY_ERROR_THRESHOLD = 0.01;

/** Accounting identity: mismatch > 5% → confidence forced to 0 (garbage data) */
const IDENTITY_GARBAGE_THRESHOLD = 0.05;

/** Asset decomposition warning threshold: 2% relative divergence */
const ASSET_DECOMPOSITION_THRESHOLD = 0.02;

/** Minimum acceptable extraction confidence */
const MIN_EXTRACTION_CONFIDENCE = 0.3;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns absolute relative difference between a and b, with safe zero handling. */
function relativeDiff(a: number, b: number): number {
  if (a === 0 && b === 0) return 0;
  const denominator = Math.max(Math.abs(a), Math.abs(b));
  return Math.abs(a - b) / denominator;
}

/** Format a million-VND number for display in error messages. */
function fmt(n: number): string {
  return n.toLocaleString("vi-VN");
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Validator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate a parsed financial report before it is stored or presented.
 *
 * @param report - Partial report shape (all fields optional for graceful handling)
 * @returns ValidationResult with isValid, confidence, warnings, and errors
 */
export function validateFinancialReport(report: ValidatableReport): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const bs = report.balanceSheet;
  const is = report.incomeStatement;
  // DSI-S3 C5: missing confidence → 0 (unknown ≠ max-confidence).
  const extractionConfidence = report.extractionConfidence ?? 0;

  // ── Extraction confidence check ───────────────────────────────────────────
  if (extractionConfidence < MIN_EXTRACTION_CONFIDENCE) {
    errors.push(
      `Low PDF extraction confidence — data unreliable (confidence: ${extractionConfidence.toFixed(2)})`,
    );
  }

  // ── Balance sheet checks ──────────────────────────────────────────────────
  const totalAssets = bs?.totalAssets ?? 0;
  const totalLiabilities = bs?.totalLiabilities ?? 0;
  const equityTotal = bs?.equityTotal ?? 0;
  const currentAssets = bs?.currentAssets ?? 0;
  const nonCurrentAssets = bs?.nonCurrentAssets ?? 0;

  // Empty balance sheet: all five key fields are zero
  if (
    totalAssets === 0 &&
    totalLiabilities === 0 &&
    equityTotal === 0 &&
    currentAssets === 0 &&
    nonCurrentAssets === 0
  ) {
    errors.push("Empty balance sheet — all key fields are zero");
  } else if (
    totalAssets === 0 &&
    totalLiabilities === 0 &&
    equityTotal === 0
  ) {
    // Task 1088 / report #1072 — VNM Q4-2025 OCR-parse failure mode:
    // totals come back zero (unit-header missed → multiplier=1) while
    // currentAssets/nonCurrentAssets carry partial garbage. The full
    // 'all five fields zero' guard above does not fire, so the report
    // would otherwise be stored as validation_status='passed'. Reject
    // any report whose three balance-sheet TOTALS are simultaneously
    // zero — a real, non-shell company cannot have all three at zero.
    errors.push(
      "Zero balance-sheet totals — totalAssets, totalLiabilities and equityTotal are all 0 (impossible for an active company)",
    );
  }

  // Negative total assets
  if (totalAssets < 0) {
    errors.push(`Negative total assets (${fmt(totalAssets)} million VND)`);
  }

  // Negative equity — warning only (valid for insolvent companies)
  if (equityTotal < 0) {
    warnings.push(
      `Negative equity (${fmt(equityTotal)} million VND) — insolvency indicator`,
    );
  }

  // Unrealistic magnitude checks for balance sheet values
  const bsValues: [string, number][] = [
    ["totalAssets", totalAssets],
    ["totalLiabilities", totalLiabilities],
    ["equityTotal", equityTotal],
    ["currentAssets", currentAssets],
    ["nonCurrentAssets", nonCurrentAssets],
  ];
  for (const [field, value] of bsValues) {
    if (Math.abs(value) > MAX_REALISTIC_VALUE) {
      errors.push(
        `Unrealistic magnitude for ${field}: ${value.toExponential(2)} (max 1e15 million VND)`,
      );
    }
  }

  // Accounting identity: Assets = Liabilities + Equity
  // Only validate if totalAssets is non-zero and we have at least one of L or E
  const accountingIdentityApplicable =
    totalAssets !== 0 || totalLiabilities !== 0 || equityTotal !== 0;

  let accountingIdentityViolated = false;
  if (accountingIdentityApplicable) {
    const sumLE = totalLiabilities + equityTotal;
    const diff = relativeDiff(totalAssets, sumLE);

    if (diff > IDENTITY_GARBAGE_THRESHOLD) {
      // > 5%: data is garbage — force confidence to 0 later
      accountingIdentityViolated = true;
      errors.push(
        `Accounting identity violated: Assets (${fmt(totalAssets)}) ≠ Liabilities (${fmt(totalLiabilities)}) + Equity (${fmt(equityTotal)}) — mismatch ${(diff * 100).toFixed(1)}%`,
      );
    } else if (diff > IDENTITY_ERROR_THRESHOLD) {
      // 1%–5%: error but not zero-confidence
      accountingIdentityViolated = true;
      errors.push(
        `Accounting identity violated: Assets (${fmt(totalAssets)}) ≠ Liabilities (${fmt(totalLiabilities)}) + Equity (${fmt(equityTotal)}) — mismatch ${(diff * 100).toFixed(1)}%`,
      );
    }
  }

  // Asset decomposition: currentAssets + nonCurrentAssets ≈ totalAssets
  // C-7 bank guard: banks have no current_assets concept (Mẫu B02-TCTD has no code-100
  // subdivision). Both currentAssets and nonCurrentAssets will be null→0, making the
  // decomposition check structurally inapplicable and potentially spurious.
  if (!report.isBankForm && totalAssets !== 0 && (currentAssets !== 0 || nonCurrentAssets !== 0)) {
    const subTotal = currentAssets + nonCurrentAssets;
    const decompositionDiff = relativeDiff(totalAssets, subTotal);
    if (decompositionDiff > ASSET_DECOMPOSITION_THRESHOLD) {
      warnings.push(
        `Asset decomposition mismatch: currentAssets (${fmt(currentAssets)}) + nonCurrentAssets (${fmt(nonCurrentAssets)}) = ${fmt(subTotal)} but totalAssets = ${fmt(totalAssets)} — divergence ${(decompositionDiff * 100).toFixed(1)}%`,
      );
    }
  }

  // ── Income statement checks ───────────────────────────────────────────────
  if (is) {
    const netRevenue = is.netRevenue ?? 0;
    const grossProfit = is.grossProfit ?? 0;
    const netProfit = is.netProfit ?? 0;

    // Unrealistic magnitude checks for income statement
    const isValues: [string, number][] = [
      ["netRevenue", netRevenue],
      ["grossProfit", grossProfit],
      ["netProfit", netProfit],
    ];
    for (const [field, value] of isValues) {
      if (Math.abs(value) > MAX_REALISTIC_VALUE) {
        errors.push(
          `Unrealistic magnitude for ${field}: ${value.toExponential(2)} (max 1e15 million VND)`,
        );
      }
    }

    // C-5 bank guard: banks have no gross_profit / COGS concept (Mẫu B02-TCTD).
    // gross_profit is SET NULL by the aggregator's notApplicable path for banks.
    // null→0 via `?? 0` would trigger both checks spuriously (e.g. netProfit=4,320,388 > 0).
    // Skip both gross_profit comparisons for bank reports entirely.
    if (!report.isBankForm) {
      // Gross profit must not exceed revenue
      if (grossProfit > netRevenue) {
        errors.push(
          `Gross profit exceeds revenue: grossProfit (${fmt(grossProfit)}) > netRevenue (${fmt(netRevenue)})`,
        );
      }

      // Net profit > gross profit is a warning (could be non-operating income)
      if (netProfit > grossProfit && grossProfit >= 0) {
        warnings.push(
          `Net profit exceeds gross profit: netProfit (${fmt(netProfit)}) > grossProfit (${fmt(grossProfit)}) — possible non-operating income`,
        );
      }
    }

    // Zero revenue with positive profit
    if (netRevenue === 0 && netProfit > 0) {
      warnings.push(
        `Zero revenue with positive profit (netProfit = ${fmt(netProfit)}) — possible data error`,
      );
    }

    // Negative net revenue warning
    if (netRevenue < 0) {
      warnings.push(
        `Negative revenue (${fmt(netRevenue)} million VND) — possible data reversal`,
      );
    }
  }

  // ── Confidence scoring ────────────────────────────────────────────────────
  // Base: use extractionConfidence from PDF extraction
  // Degradations:
  //   - Accounting identity > 5%: force to 0
  //   - Each error: subtract 0.15 (min 0)
  //   - Each warning: subtract 0.05 (min 0)
  let confidence: number;

  const sumLE = totalLiabilities + equityTotal;
  const identityDiff = relativeDiff(totalAssets, sumLE);
  const isGarbage =
    accountingIdentityApplicable &&
    identityDiff > IDENTITY_GARBAGE_THRESHOLD;

  if (isGarbage) {
    confidence = 0;
  } else {
    confidence = Math.max(0, Math.min(1, extractionConfidence));
    // Penalise per error (excluding the identity one already tracked)
    const nonIdentityErrors = errors.filter((e) => !/accounting identity/i.test(e)).length;
    confidence = Math.max(0, confidence - nonIdentityErrors * 0.15 - warnings.length * 0.05);

    // Penalise accounting identity errors that are NOT garbage-tier
    if (accountingIdentityViolated && !isGarbage) {
      confidence = Math.max(0, confidence - 0.2);
    }
  }

  return {
    isValid: errors.length === 0,
    confidence,
    warnings,
    errors,
  };
}
