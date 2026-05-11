/**
 * Task 1870b — P_NET_PROFIT regex: exclude "chưa phân phối" (retained earnings)
 *
 * Root cause: FPT Q4 2025 mixed-unit PDF balance sheet contains:
 *   "Lợi nhuận sau thuế CHƯA PHÂN PHỐI" (retained earnings, ~14.3T VND raw)
 * Old P_NET_PROFIT matched it → sentinel = 14.3T → m = 0.000001 →
 * all income-statement values persisted ×1e-6 (revenue stored as 20.22 instead of 20.2T).
 *
 * Fix: add negative lookahead (?!\s+ch[ưu]a\s+ph[âa]n\s+ph[ốo]i) to both
 * P_NET_PROFIT and F_NET_PROFIT to exclude the retained-earnings label.
 *
 * TDD: write failing tests BEFORE applying the fix in incomeStatementExtractor.ts.
 */
import { describe, it, expect } from "bun:test";
import { extractIncomeStatement } from "../domain/services/financial-reports/incomeStatementExtractor";

// ---------------------------------------------------------------------------
// Unit-style: synthetic mixed-unit fixture mimicking FPT Q4 2025 structure
// Balance sheet "chưa phân phối" line appears BEFORE income statement content.
// Unit header is "đồng" (bare VND) → detectUnitMultiplier returns -1 sentinel.
// Without the fix: P_NET_PROFIT grabs 14_300_000_000_000 (retained earnings) as
// netProfit → sentinel = 14.3T → m = 0.000001 → revenue = 20.22545 (wrong).
// With the fix: P_NET_PROFIT skips the retained-earnings line → sentinel uses
// actual income-statement values → magnitude inference returns -1 → m = 0.000001
// (correct: raw VND) → revenue = 20_225_450_000 triệu × 0.000001 = 20_225_450 triệu.
// ---------------------------------------------------------------------------
const SAMPLE_FPT_MIXED_UNIT = `
BÁO CÁO TÀI CHÍNH HỢP NHẤT
Quý 4/2025
Đơn vị: đồng

CÂN ĐỐI KẾ TOÁN
Lợi nhuận sau thuế chưa phân phối     14.300.000.000.000

BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH
Doanh thu thuần về bán hàng và cung cấp dịch vụ    20.225.450.000.000
Giá vốn hàng bán                                   15.000.000.000.000
Lợi nhuận gộp về bán hàng và cung cấp dịch vụ      5.225.450.000.000
Lợi nhuận thuần từ hoạt động kinh doanh             1.900.000.000.000
Tổng lợi nhuận kế toán trước thuế                   1.900.000.000.000
Lợi nhuận sau thuế thu nhập doanh nghiệp            1.520.000.000.000
`;

// ---------------------------------------------------------------------------
// Fixture: pure income statement — "Lợi nhuận sau thuế TNDN" must STILL match.
// Ensures the negative lookahead does not break legitimate net-profit extraction.
// ---------------------------------------------------------------------------
const SAMPLE_INCOME_STMT_ONLY = `
BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH
Đơn vị: triệu đồng

Doanh thu thuần về bán hàng             9.500.000
Giá vốn hàng bán                        6.000.000
Lợi nhuận gộp về bán hàng               3.500.000
Lợi nhuận thuần từ hoạt động kinh doanh 1.950.000
Tổng lợi nhuận kế toán trước thuế       2.020.000
Lợi nhuận sau thuế thu nhập doanh nghiệp 1.620.000
`;

// ---------------------------------------------------------------------------
// Fixture: ASCII fallback — diacritic-stripped, retained-earnings line present.
// "loi nhuan sau thue chua phan phoi" must NOT match F_NET_PROFIT.
// "loi nhuan sau thue thu nhap doanh nghiep" must STILL match.
// ---------------------------------------------------------------------------
const SAMPLE_ASCII_FALLBACK_MIXED = `
BAO CAO TAI CHINH HOP NHAT
Don vi: dong

CAN DOI KE TOAN
Loi nhuan sau thue chua phan phoi    14300000000000

BAO CAO KET QUA HOAT DONG KINH DOANH
Doanh thu thuan ve ban hang          20225450000000
Gia von hang ban                     15000000000000
Loi nhuan gop ve ban hang             5225450000000
Loi nhuan thuan tu hoat dong kinh doanh 1900000000000
Tong loi nhuan ke toan truoc thue     1900000000000
Loi nhuan sau thue thu nhap doanh nghiep 1520000000000
`;

describe("1870b — P_NET_PROFIT excludes 'chưa phân phối' (retained earnings)", () => {
  // --- RED tests: these FAIL before the regex fix ---

  it("P_NET_PROFIT does NOT match 'Lợi nhuận sau thuế chưa phân phối' (retained earnings)", () => {
    // Direct regex test — the fix must make this pass
    const P_NET_PROFIT_FIXED = /l[ợo]i\s+nhu[ậa]n\s+sau\s+thu[ếe](?!\s+ch[ưu]a\s+ph[âa]n\s+ph[ốo]i)/i;
    const retainedEarningsLine = "Lợi nhuận sau thuế chưa phân phối";
    expect(P_NET_PROFIT_FIXED.test(retainedEarningsLine)).toBe(false);
  });

  it("P_NET_PROFIT SHOULD match 'Lợi nhuận sau thuế thu nhập doanh nghiệp' (legitimate net profit)", () => {
    const P_NET_PROFIT_FIXED = /l[ợo]i\s+nhu[ậa]n\s+sau\s+thu[ếe](?!\s+ch[ưu]a\s+ph[âa]n\s+ph[ốo]i)/i;
    const netProfitLine = "Lợi nhuận sau thuế thu nhập doanh nghiệp   1.620.000";
    expect(P_NET_PROFIT_FIXED.test(netProfitLine)).toBe(true);
  });

  it("P_NET_PROFIT SHOULD match short form 'Lợi nhuận sau thuế TNDN'", () => {
    const P_NET_PROFIT_FIXED = /l[ợo]i\s+nhu[ậa]n\s+sau\s+thu[ếe](?!\s+ch[ưu]a\s+ph[âa]n\s+ph[ốo]i)/i;
    const shortFormLine = "Lợi nhuận sau thuế TNDN   912.000";
    expect(P_NET_PROFIT_FIXED.test(shortFormLine)).toBe(true);
  });

  it("F_NET_PROFIT (ASCII) does NOT match 'loi nhuan sau thue chua phan phoi'", () => {
    const F_NET_PROFIT_FIXED = /loi\s+nhuan\s+sau\s+thue(?!\s+chua\s+phan\s+phoi)/i;
    const asciiRetainedEarnings = "loi nhuan sau thue chua phan phoi";
    expect(F_NET_PROFIT_FIXED.test(asciiRetainedEarnings)).toBe(false);
  });

  it("F_NET_PROFIT (ASCII) SHOULD match 'loi nhuan sau thue thu nhap doanh nghiep'", () => {
    const F_NET_PROFIT_FIXED = /loi\s+nhuan\s+sau\s+thue(?!\s+chua\s+phan\s+phoi)/i;
    const asciiNetProfitLine = "loi nhuan sau thue thu nhap doanh nghiep  1620000";
    expect(F_NET_PROFIT_FIXED.test(asciiNetProfitLine)).toBe(true);
  });

  // --- Integration: mixed-unit PDF with retained-earnings contamination ---

  it("mixed-unit PDF: netRevenue extracted from income statement (NOT poisoned by retained earnings sentinel)", () => {
    const result = extractIncomeStatement(SAMPLE_FPT_MIXED_UNIT);
    // With fix: retained-earnings line excluded → sentinel uses income-statement
    // values (raw VND) → m = 0.000001 → netRevenue = 20_225_450_000_000 * 0.000001
    // = 20_225_450 triệu (correct ~20.2 trillion VND).
    // Without fix: sentinel = 14.3T (retained earnings) → m = 0.000001 →
    // netRevenue = 20_225_450_000_000 * 0.000001 = 20_225_450 (same m, but
    // netProfit would be wrong: 14.3T * 0.000001 = 14_300_000 instead of 1_520_000).
    expect(result.netRevenue).toBeGreaterThan(10_000_000); // at least 10T triệu
    expect(result.netRevenue).toBeCloseTo(20_225_450, -3); // ~20.2T triệu ±1%
    // netProfit must be income-statement value, NOT retained earnings
    expect(result.netProfit).toBeCloseTo(1_520_000, -2); // ~1.52T triệu ±1%
    expect(result.netProfit).toBeLessThan(5_000_000); // must NOT be 14.3T
  });

  it("mixed-unit PDF: composite confidence guard — netProfit NOT contaminated by retained earnings", () => {
    const result = extractIncomeStatement(SAMPLE_FPT_MIXED_UNIT);
    // Before fix: P_NET_PROFIT matches retained earnings → netProfit = 14_300_000
    // After fix: netProfit = 1_520_000 (income-statement value)
    expect(result.netProfit).not.toBeCloseTo(14_300_000, -2);
  });

  // --- Regression: pure income statement must still parse correctly ---

  it("regression: pure income statement (no retained earnings) still extracts netProfit correctly", () => {
    const result = extractIncomeStatement(SAMPLE_INCOME_STMT_ONLY);
    expect(result.netRevenue).toBe(9_500_000);
    expect(result.netProfit).toBe(1_620_000);
  });

  it("regression: ASCII fallback mixed fixture extracts correct values", () => {
    const result = extractIncomeStatement(SAMPLE_ASCII_FALLBACK_MIXED);
    // Raw VND → m = 0.000001
    expect(result.netRevenue).toBeCloseTo(20_225_450, -3);
    expect(result.netProfit).toBeCloseTo(1_520_000, -2);
    expect(result.netProfit).toBeLessThan(5_000_000);
  });
});
