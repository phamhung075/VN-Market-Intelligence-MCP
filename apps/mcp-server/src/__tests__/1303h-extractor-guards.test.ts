import { describe, it, expect, spyOn, beforeEach, afterEach, mock } from "bun:test";
import {
  guardFinancialField,
  GUARD_MAX,
  GUARD_MIN,
} from "../domain/services/financial-reports/extractorGuards";
import { extractIncomeStatement } from "../domain/services/financial-reports/incomeStatementExtractor";
import { extractBalanceSheet } from "../domain/services/financial-reports/balanceSheetExtractor";

describe("1303h: extractorGuards", () => {
  describe("guardFinancialField", () => {
    beforeEach(() => {
      spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      mock.restore();
    });

    // AC-1: above GUARD_MAX
    it("RED: rejects value above GUARD_MAX", () => {
      const result = guardFinancialField(600_000_000_000_000, "netRevenue", 600_000_000_000);
      expect(result).toBe(0);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("netRevenue"),
      );
    });

    // AC-4: below GUARD_MIN
    it("RED: rejects value below GUARD_MIN", () => {
      const result = guardFinancialField(-20_000_000_000_000, "equity", -20_000_000_000);
      expect(result).toBe(0);
      expect(console.warn).toHaveBeenCalled();
    });

    // Boundary: exactly GUARD_MAX passes
    it("GREEN: passes value at GUARD_MAX boundary", () => {
      const result = guardFinancialField(GUARD_MAX, "totalAssets", GUARD_MAX);
      expect(result).toBe(GUARD_MAX);
      expect(console.warn).not.toHaveBeenCalled();
    });

    // Boundary: exactly GUARD_MIN passes
    it("GREEN: passes value at GUARD_MIN boundary", () => {
      const result = guardFinancialField(GUARD_MIN, "equity", GUARD_MIN);
      expect(result).toBe(GUARD_MIN);
      expect(console.warn).not.toHaveBeenCalled();
    });

    // AC-2: valid positive
    it("GREEN: passes valid positive value", () => {
      const result = guardFinancialField(9_500_000, "netRevenue", 9_500_000);
      expect(result).toBe(9_500_000);
      expect(console.warn).not.toHaveBeenCalled();
    });

    // AC-3: valid negative
    it("GREEN: passes valid negative value", () => {
      const result = guardFinancialField(-800_000, "retainedEarnings", -800_000);
      expect(result).toBe(-800_000);
      expect(console.warn).not.toHaveBeenCalled();
    });

    // Zero is the missing-field default — must pass
    it("GREEN: passes zero", () => {
      const result = guardFinancialField(0, "cogs", 0);
      expect(result).toBe(0);
      expect(console.warn).not.toHaveBeenCalled();
    });
  });

  describe("extractIncomeStatement guard integration", () => {
    beforeEach(() => {
      spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      mock.restore();
    });

    // AC-5: OCR-corrupted revenue declared in tỷ — post-multiplier exceeds GUARD_MAX.
    // 600.000.000.000 tỷ × 1000 = 6×10^14 triệu > GUARD_MAX (5×10^14).
    // Magnitude inference does NOT fire (multiplier=1000 ≠ 1).
    it("RED: impossible netRevenue (tỷ unit, OCR artifact) → 0", () => {
      const rawText = `
        Đơn vị tính: tỷ đồng
        Doanh thu bán hàng và cung cấp dịch vụ  600.000.000.000
        Các khoản giảm trừ doanh thu  0
        Doanh thu thuần về bán hàng  600.000.000.000
        Giá vốn hàng bán  100
        Lợi nhuận gộp  100
      `;
      const result = extractIncomeStatement(rawText);
      expect(result.netRevenue).toBe(0);
    });

    // AC-7: VNM-scale (all valid, no warn)
    it("GREEN: VNM-scale revenue passes", () => {
      const rawText = `
        Đơn vị tính: triệu đồng
        Doanh thu bán hàng và cung cấp dịch vụ  14.000.000
        Các khoản giảm trừ doanh thu  50.000
        Doanh thu thuần về bán hàng  13.950.000
        Giá vốn hàng bán  8.000.000
        Lợi nhuận gộp  5.950.000
      `;
      const result = extractIncomeStatement(rawText);
      expect(result.netRevenue).toBeGreaterThan(0);
      // console.warn must not have been called for any guard rejection
      const warnSpy = console.warn as ReturnType<typeof spyOn>;
      const guardWarns = warnSpy.mock.calls.filter((args: unknown[]) =>
        String(args[0]).includes("[extractorGuards]"),
      );
      expect(guardWarns).toHaveLength(0);
    });
  });

  describe("extractBalanceSheet guard integration", () => {
    beforeEach(() => {
      spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      mock.restore();
    });

    // AC-6: impossible totalAssets declared in tỷ — post-multiplier exceeds GUARD_MAX.
    // 600.000.000.000 tỷ × 1000 = 6×10^14 triệu > GUARD_MAX (5×10^14).
    // Magnitude inference does NOT fire (multiplier=1000 ≠ 1).
    it("RED: impossible totalAssets (tỷ unit, OCR artifact) → 0", () => {
      const rawText = `
        Đơn vị tính: tỷ đồng
        TỔNG CỘNG TÀI SẢN  600.000.000.000
        Tài sản ngắn hạn  300.000.000.000
        Tài sản dài hạn  300.000.000.000
        TỔNG CỘNG NGUỒN VỐN  600.000.000.000
      `;
      const result = extractBalanceSheet(rawText);
      expect(result.totalAssets).toBe(0);
    });

    // AC-7: valid totalAssets passes
    it("GREEN: valid totalAssets passes", () => {
      const rawText = `
        Đơn vị tính: triệu đồng
        TỔNG CỘNG TÀI SẢN  5.000.000
        Tài sản ngắn hạn  2.500.000
        Tài sản dài hạn  2.500.000
        TỔNG CỘNG NGUỒN VỐN  5.000.000
      `;
      const result = extractBalanceSheet(rawText);
      expect(result.totalAssets).toBeGreaterThan(0);
    });
  });
});
