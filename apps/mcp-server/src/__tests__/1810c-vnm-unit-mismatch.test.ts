/**
 * Task 1810c — VNM Q4-2025 unit scale mismatch regression test
 *
 * Scenario: balanceSheetExtractor detects "Triệu đồng" → totalAssets in triệu (e.g. 80_000 triệu).
 * incomeStatementExtractor misapplies unit → netRevenue in raw VND (e.g. 60_000_000_000).
 * Ratio: 60_000_000_000 / 80_000 = 750_000 >> 1000 → unit_mismatch.
 *
 * Before fix: validateFinancialFigures receives operatingMargin = op / netRevenue
 *   → blows past 500% hard-fail → confidenceFinancial = 0.0 → composite = 0.00 → skipped.
 * After fix: cross-check in parseBctcReport detects >1000x ratio between totalAssets and
 *   netRevenue → returns confidenceFinancial = 0.1 (unit_mismatch) without calling validator.
 */
import { describe, it, expect } from "bun:test";
import { detectUnitMismatch } from "../domain/services/financial-reports/financialFiguresValidator.js";

describe("Task 1810c — VNM unit scale mismatch detection", () => {
  it("returns unit_mismatch=true when netRevenue is 1000x larger than totalAssets", () => {
    // totalAssets in triệu (80_000 triệu = 80 tỷ)
    // netRevenue in raw VND (60_000_000_000 — not normalised)
    const result = detectUnitMismatch(80_000, 60_000_000_000);
    expect(result).toBe(true);
  });

  it("returns unit_mismatch=false for normal same-scale figures", () => {
    // Both in triệu: assets=80_000 triệu, revenue=15_000 triệu — ratio 5.3x — normal
    const result = detectUnitMismatch(80_000, 15_000);
    expect(result).toBe(false);
  });

  it("returns unit_mismatch=false when totalAssets is null", () => {
    expect(detectUnitMismatch(null, 15_000)).toBe(false);
  });

  it("returns unit_mismatch=false when netRevenue is null", () => {
    expect(detectUnitMismatch(80_000, null)).toBe(false);
  });

  it("returns unit_mismatch=true when totalAssets is 1000x larger than netRevenue (inverse mismatch)", () => {
    // Inverse: assets in raw VND, revenue in triệu
    const result = detectUnitMismatch(60_000_000_000, 80_000);
    expect(result).toBe(true);
  });
});
