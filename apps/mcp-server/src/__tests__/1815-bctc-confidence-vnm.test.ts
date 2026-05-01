/**
 * Task 1815 — BCTC confidence false-zero for VNM Q4-2025
 *
 * Root cause (confirmed from live DB, 2026-05-01):
 *   balanceSheetExtractor picks up a sub-total for totalAssets (~957 tỷ)
 *   while equity.total is correctly extracted (~18,829 tỷ) and
 *   netRevenue is correct (~63,645 tỷ).
 *
 *   totalAssets < totalEquity  AND  ratio ≈ 19.7  (<500 threshold)
 *   → VAL-01 hard fail → confidence_financial = 0.0
 *   → composite = 0.0 → conviction signal skipped
 *
 * The fix: when assets < equity (ratio < 500) but netRevenue >> totalAssets
 * (revenue > assets * 30 is physically impossible for a real company whose
 * asset figure is correct), treat as an extraction positioning error and
 * apply a soft penalty instead of a hard fail.
 *
 * Regression guard: genuine VNM Q4-2024 corruption (assets=957, equity=18829,
 * revenue=5000) must still return 0.0 — revenue does NOT exceed assets*30 there.
 */
import { describe, it, expect } from "bun:test";
import { validateFinancialFigures } from "../domain/services/financial-reports/financialFiguresValidator.js";

describe("Task 1815 — VNM Q4-2025 false-zero confidence fix", () => {
  /**
   * RED: Real VNM Q4-2025 live-DB numbers.
   *   totalAssets=957072 triệu (sub-total extraction error)
   *   totalEquity=18829355 triệu (correct)
   *   netRevenue=63645886 triệu (correct)
   *
   * Current behaviour: returns 0.0 (hard fail VAL-01).
   * Expected behaviour: returns > 0.0 (soft penalty — extraction error, not
   *   accounting fraud).
   */
  it("VNM Q4-2025 live figures: assets<equity but revenue>>assets → soft penalty, NOT 0.0", () => {
    const confidence = validateFinancialFigures({
      totalAssets: 957_072,
      totalEquity: 18_829_355,
      totalLiabilities: null,
      operatingMargin: null,
      netRevenue: 63_645_886,
    });

    // Must NOT be 0.0 — this is a positional extraction error, not OCR corruption.
    expect(confidence).toBeGreaterThan(0.0);
    // Should still be penalised (not 1.0) — the assets figure is suspicious.
    expect(confidence).toBeLessThan(1.0);
  });

  /**
   * Regression: genuine VNM Q4-2024 corruption (assets=957, equity=18829,
   * revenue=5000) must still hard-fail.  revenue (5000) does NOT exceed
   * assets*30 (28710), so the new guard does not activate.
   */
  it("VNM Q4-2024 genuine corruption (assets=957, revenue=5000): still returns 0.0", () => {
    const confidence = validateFinancialFigures({
      totalAssets: 957,
      totalEquity: 18_829,
      totalLiabilities: 6_000,
      operatingMargin: null,
      netRevenue: 5_000,
    });

    expect(confidence).toBe(0.0);
  });

  /**
   * Normal VNM-like company (all figures plausible): must pass cleanly.
   */
  it("healthy company (assets > equity, normal margin): returns 1.0", () => {
    const confidence = validateFinancialFigures({
      totalAssets: 60_000_000,
      totalEquity: 22_000_000,
      totalLiabilities: 38_000_000,
      operatingMargin: 0.15,
      netRevenue: 63_000_000,
    });

    expect(confidence).toBe(1.0);
  });
});
