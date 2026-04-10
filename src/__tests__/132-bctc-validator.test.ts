// src/__tests__/132-bctc-validator.test.ts
import { describe, it, expect } from "bun:test";
import {
  validateFinancialReport,
  type ValidationResult,
} from "../domain/services/bctcValidator.js";

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/** Build a minimal valid report fixture. All numbers in million VND. */
function validReport() {
  return {
    balanceSheet: {
      totalAssets: 100_000,
      totalLiabilities: 60_000,
      equityTotal: 40_000,
      currentAssets: 55_000,
      nonCurrentAssets: 45_000,
    },
    incomeStatement: {
      netRevenue: 50_000,
      grossProfit: 15_000,
      netProfit: 8_000,
    },
    cashFlow: {
      operatingCF: 10_000,
    },
    extractionConfidence: 0.85,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Task 132 — BCTC Validator
// ────────────────────────────────────────────────────────────────────────────

describe("Task 132 — BCTC Validator", () => {
  // ── 1. Smoke test: a well-formed report passes all checks ─────────────────

  it("valid report passes all checks with no errors or warnings", () => {
    const result = validateFinancialReport(validReport());
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  // ── 2. Accounting Identity — CRITICAL ────────────────────────────────────

  it("produces error when Assets ≠ Liabilities + Equity beyond 1% tolerance", () => {
    const report = validReport();
    // totalAssets=100_000, totalLiabilities=60_000, equityTotal=30_000 → sum=90_000 (10% gap)
    report.balanceSheet.equityTotal = 30_000;
    const result = validateFinancialReport(report);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => /accounting identity/i.test(e))).toBe(true);
  });

  it("passes when Assets = Liabilities + Equity within 0.5% tolerance", () => {
    const report = validReport();
    // totalAssets=100_000, totalLiabilities=60_000, equityTotal=39_800 → sum=99_800 (0.2% gap)
    report.balanceSheet.equityTotal = 39_800;
    const result = validateFinancialReport(report);
    expect(result.isValid).toBe(true);
    expect(result.errors.filter((e) => /accounting identity/i.test(e))).toHaveLength(0);
  });

  it("sets confidence = 0 when accounting mismatch exceeds 5%", () => {
    const report = validReport();
    // totalAssets=100_000, sum L+E = 60_000 + 10_000 = 70_000 → 30% mismatch
    report.balanceSheet.equityTotal = 10_000;
    const result = validateFinancialReport(report);
    expect(result.confidence).toBe(0);
    expect(result.isValid).toBe(false);
  });

  // ── 3. Asset Decomposition ────────────────────────────────────────────────

  it("adds warning when currentAssets + nonCurrentAssets diverges from totalAssets by > 2%", () => {
    const report = validReport();
    // currentAssets=55_000 + nonCurrentAssets=35_000 = 90_000, but totalAssets=100_000 → 10% gap
    report.balanceSheet.nonCurrentAssets = 35_000;
    const result = validateFinancialReport(report);
    expect(result.warnings.some((w) => /asset decomposition/i.test(w))).toBe(true);
  });

  it("no asset decomposition warning when sub-components are within 2% of total", () => {
    const result = validateFinancialReport(validReport());
    expect(result.warnings.some((w) => /asset decomposition/i.test(w))).toBe(false);
  });

  // ── 4. Profitability Sanity ───────────────────────────────────────────────

  it("produces error when grossProfit > netRevenue", () => {
    const report = validReport();
    report.incomeStatement.grossProfit = 60_000; // > netRevenue=50_000
    const result = validateFinancialReport(report);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => /gross profit exceeds revenue/i.test(e))).toBe(true);
  });

  it("produces warning when netProfit > grossProfit (possible non-operating income)", () => {
    const report = validReport();
    report.incomeStatement.netProfit = 20_000; // > grossProfit=15_000
    const result = validateFinancialReport(report);
    // Should be a warning (not error) since non-operating income is valid
    expect(result.warnings.some((w) => /net profit exceeds gross profit/i.test(w))).toBe(true);
  });

  it("produces warning when netRevenue = 0 but netProfit > 0", () => {
    const report = validReport();
    report.incomeStatement.netRevenue = 0;
    report.incomeStatement.grossProfit = 0;
    report.incomeStatement.netProfit = 5_000;
    const result = validateFinancialReport(report);
    expect(result.warnings.some((w) => /zero revenue with positive profit/i.test(w))).toBe(true);
  });

  // ── 5. Magnitude Checks ───────────────────────────────────────────────────

  it("produces error for values exceeding 1e15 (quadrillion VND)", () => {
    const report = validReport();
    report.balanceSheet.totalAssets = 2e15;
    const result = validateFinancialReport(report);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => /unrealistic magnitude/i.test(e))).toBe(true);
  });

  it("produces error when extractionConfidence < 0.3", () => {
    const report = validReport();
    report.extractionConfidence = 0.2;
    const result = validateFinancialReport(report);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => /low pdf extraction confidence/i.test(e))).toBe(true);
  });

  it("passes when extractionConfidence is exactly 0.3", () => {
    const report = validReport();
    report.extractionConfidence = 0.3;
    const result = validateFinancialReport(report);
    // confidence = 0.3 is on the boundary — should pass (< 0.3 triggers error)
    expect(result.errors.filter((e) => /low pdf extraction confidence/i.test(e))).toHaveLength(0);
  });

  it("produces error when all balance sheet fields are zero (empty balance sheet)", () => {
    const report = validReport();
    report.balanceSheet = {
      totalAssets: 0,
      totalLiabilities: 0,
      equityTotal: 0,
      currentAssets: 0,
      nonCurrentAssets: 0,
    };
    const result = validateFinancialReport(report);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => /empty balance sheet/i.test(e))).toBe(true);
  });

  // ── 6. Negative Value Checks ──────────────────────────────────────────────

  it("produces error when totalAssets is negative", () => {
    const report = validReport();
    report.balanceSheet.totalAssets = -50_000;
    const result = validateFinancialReport(report);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => /negative total assets/i.test(e))).toBe(true);
  });

  it("produces warning (not error) when netRevenue is negative", () => {
    const report = validReport();
    report.incomeStatement.netRevenue = -10_000;
    // grossProfit must be <= netRevenue to avoid a different error
    report.incomeStatement.grossProfit = -15_000;
    const result = validateFinancialReport(report);
    expect(result.warnings.some((w) => /negative revenue/i.test(w))).toBe(true);
    // isValid may be true or false depending on other checks, but the revenue warning must appear
  });

  it("produces warning (not error) when equityTotal is negative (insolvency indicator)", () => {
    const report = validReport();
    // Make identity hold: totalAssets=100_000, totalLiabilities=110_000, equityTotal=-10_000
    report.balanceSheet.totalLiabilities = 110_000;
    report.balanceSheet.equityTotal = -10_000;
    const result = validateFinancialReport(report);
    expect(result.warnings.some((w) => /negative equity/i.test(w))).toBe(true);
    // Negative equity is a warning, not automatically an error
    expect(result.errors.filter((e) => /negative equity/i.test(e))).toHaveLength(0);
  });

  // ── 7. Partial / Mixed Reports ────────────────────────────────────────────

  it("isValid = true when only warnings present (no errors)", () => {
    const report = validReport();
    // Trigger only a warning: netProfit > grossProfit (non-operating income scenario)
    report.incomeStatement.netProfit = 20_000; // > grossProfit=15_000
    const result = validateFinancialReport(report);
    expect(result.isValid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);
  });

  it("confidence is reduced by each blocking issue", () => {
    const cleanResult = validateFinancialReport(validReport());

    const dirtyReport = validReport();
    dirtyReport.extractionConfidence = 0.15; // triggers error
    dirtyReport.balanceSheet.equityTotal = 5_000; // big accounting mismatch → confidence=0
    const dirtyResult = validateFinancialReport(dirtyReport);

    expect(dirtyResult.confidence).toBeLessThan(cleanResult.confidence);
  });

  // ── 8. Missing / Optional Fields ─────────────────────────────────────────

  it("handles missing incomeStatement gracefully (no crash)", () => {
    const report: Parameters<typeof validateFinancialReport>[0] = {
      balanceSheet: {
        totalAssets: 100_000,
        totalLiabilities: 60_000,
        equityTotal: 40_000,
        currentAssets: 55_000,
        nonCurrentAssets: 45_000,
      },
      extractionConfidence: 0.75,
    };
    expect(() => validateFinancialReport(report)).not.toThrow();
  });

  it("handles missing balanceSheet gracefully (no crash)", () => {
    const report: Parameters<typeof validateFinancialReport>[0] = {
      incomeStatement: {
        netRevenue: 50_000,
        grossProfit: 15_000,
        netProfit: 8_000,
      },
      extractionConfidence: 0.75,
    };
    expect(() => validateFinancialReport(report)).not.toThrow();
  });

  it("missing balanceSheet always produces an empty-balance-sheet error", () => {
    const report: Parameters<typeof validateFinancialReport>[0] = {
      incomeStatement: { netRevenue: 50_000, grossProfit: 15_000, netProfit: 8_000 },
      extractionConfidence: 0.75,
    };
    const result = validateFinancialReport(report);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => /empty balance sheet/i.test(e))).toBe(true);
  });

  // ── 9. Error message content ──────────────────────────────────────────────

  it("accounting identity error includes actual A, L and E values", () => {
    const report = validReport();
    report.balanceSheet.equityTotal = 20_000; // big gap
    const result = validateFinancialReport(report);
    const identityError = result.errors.find((e) => /accounting identity/i.test(e)) ?? "";
    // Error message should mention the actual numbers
    expect(identityError).toMatch(/100.?000|60.?000|20.?000/);
  });

  // ── 10. Confidence score properties ──────────────────────────────────────

  it("confidence is always between 0 and 1 inclusive", () => {
    const cases = [
      validReport(),
      { ...validReport(), extractionConfidence: 0 },
      { ...validReport(), extractionConfidence: 1 },
    ];
    for (const c of cases) {
      const result = validateFinancialReport(c);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("returns a ValidationResult interface with all required fields", () => {
    const result = validateFinancialReport(validReport());
    expect(typeof result.isValid).toBe("boolean");
    expect(typeof result.confidence).toBe("number");
    expect(Array.isArray(result.warnings)).toBe(true);
    expect(Array.isArray(result.errors)).toBe(true);
  });

  // ── 11. Accounting identity 1%–5% band ───────────────────────────────────

  it("produces error (not zero-confidence) when accounting mismatch is between 1% and 5%", () => {
    const report = validReport();
    // totalAssets=100_000, sum L+E = 60_000 + 37_000 = 97_000 → 3% gap (between 1% and 5%)
    report.balanceSheet.equityTotal = 37_000;
    const result = validateFinancialReport(report);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => /accounting identity/i.test(e))).toBe(true);
    // confidence should NOT be zero since mismatch < 5%
    expect(result.confidence).toBeGreaterThan(0);
  });

  // ── 12. Income statement magnitude check ─────────────────────────────────

  it("produces error when income statement field exceeds 1e15", () => {
    const report = validReport();
    report.incomeStatement.netRevenue = 2e15;
    report.incomeStatement.grossProfit = 1e15;
    const result = validateFinancialReport(report);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => /unrealistic magnitude.*netRevenue/i.test(e))).toBe(true);
  });

  // ── 13. Zero balance-sheet totals guard (task 1088 / report #1072) ───────

  it("rejects report when totalAssets, totalLiabilities and equityTotal are all zero (false-positive 'passed' guard)", () => {
    // Reproduces the VNM Q4-2025 OCR-parse failure mode: balance sheet totals
    // come back zero because the unit-header detector defaulted multiplier to
    // 1, but currentAssets/nonCurrentAssets were nonzero so the existing
    // 'all five fields zero' guard did not fire. Result: validation_status
    // wrongly stored as 'passed' and downstream tools displayed garbage.
    const report = validReport();
    report.balanceSheet.totalAssets = 0;
    report.balanceSheet.totalLiabilities = 0;
    report.balanceSheet.equityTotal = 0;
    // Leave currentAssets/nonCurrentAssets nonzero — this is what made the
    // bug slip past the existing empty-balance-sheet check.
    const result = validateFinancialReport(report);
    expect(result.isValid).toBe(false);
    expect(
      result.errors.some((e) => /zero balance.sheet totals/i.test(e)),
    ).toBe(true);
  });

  it("still passes when totals are nonzero even if currentAssets is zero", () => {
    const report = validReport();
    report.balanceSheet.currentAssets = 0;
    report.balanceSheet.nonCurrentAssets = 100_000; // keep totalAssets identity intact
    const result = validateFinancialReport(report);
    // No 'zero totals' error — totals are still 100k/60k/40k
    expect(
      result.errors.some((e) => /zero balance.sheet totals/i.test(e)),
    ).toBe(false);
  });
});
