/**
 * Task 121 — BCTC Parser Edge Cases
 *
 * 36 test cases covering uncovered branches in the four domain parsers:
 *   - parseVnNumber  (P-01–P-15)
 *   - extractBalanceSheet (B-01–B-08)
 *   - extractIncomeStatement (I-01–I-08)
 *   - extractCashFlow (C-01–C-05)
 *
 * All inputs are inline strings — no I/O, no HTTP calls.
 * Numbers in BCTC fixtures are in triệu đồng (million VND) unless stated otherwise.
 */

import { describe, it, expect } from "bun:test";
import { parseVnNumber } from "../domain/services/vnNumberParser.js";
import { extractBalanceSheet } from "../domain/services/financial-reports/balanceSheetExtractor.js";
import { extractIncomeStatement } from "../domain/services/financial-reports/incomeStatementExtractor.js";
import { extractCashFlow } from "../domain/services/financial-reports/cashFlowExtractor.js";

// ============================================================================
// parseVnNumber — uncovered branches (P-01 to P-15)
// ============================================================================

describe("Task 121 — parseVnNumber edge cases", () => {
  // P-01: parentheses + multi-dot thousands
  it("P-01: '(1.234.567)' → -1234567 (parentheses + multi-dot thousands)", () => {
    expect(parseVnNumber("(1.234.567)")).toBe(-1234567);
  });

  // P-02: parentheses + single-dot thousands (3-digit suffix)
  it("P-02: '(456.789)' → -456789 (parentheses + single-dot 3-digit suffix)", () => {
    expect(parseVnNumber("(456.789)")).toBe(-456789);
  });

  // P-03: Vietnamese decimal format — dot is thousands, comma is decimal
  it("P-03: '1.234,56' → 1234.56 (Vietnamese decimal: dot=thousands, comma=decimal)", () => {
    expect(parseVnNumber("1.234,56")).toBe(1234.56);
  });

  // P-04: English thousands — multiple commas
  it("P-04: '1,234,567' → 1234567 (English thousands: multiple commas)", () => {
    expect(parseVnNumber("1,234,567")).toBe(1234567);
  });

  // P-05: single comma as Vietnamese decimal (< 3 digits after comma)
  it("P-05: '0,5' → 0.5 (single comma with non-3-digit suffix → decimal)", () => {
    expect(parseVnNumber("0,5")).toBe(0.5);
  });

  // P-06: single comma with exactly 3 trailing digits → thousands separator
  it("P-06: '1,234' → 1234 (single comma + 3 trailing digits → thousands)", () => {
    expect(parseVnNumber("1,234")).toBe(1234);
  });

  // P-07: single dot with non-3-digit suffix → decimal
  it("P-07: '1.5' → 1.5 (single dot with non-3-digit suffix → decimal)", () => {
    expect(parseVnNumber("1.5")).toBe(1.5);
  });

  // P-08: single dot with exactly 3-digit suffix → Vietnamese thousands
  it("P-08: '1.000' → 1000 (single dot + 3-digit suffix → Vietnamese thousands)", () => {
    expect(parseVnNumber("1.000")).toBe(1000);
  });

  // P-09: dash prefix with multi-dot thousands
  it("P-09: '-1.234.567' → -1234567 (dash prefix + Vietnamese thousands)", () => {
    expect(parseVnNumber("-1.234.567")).toBe(-1234567);
  });

  // P-10: bare dash → null
  it("P-10: '-' → null (bare dash is a non-numeric placeholder)", () => {
    expect(parseVnNumber("-")).toBeNull();
  });

  // P-11: empty string → null
  it("P-11: '' → null (empty string)", () => {
    expect(parseVnNumber("")).toBeNull();
  });

  // P-12: N/A placeholder → null
  it("P-12: 'N/A' → null (non-numeric placeholder)", () => {
    expect(parseVnNumber("N/A")).toBeNull();
  });

  // P-13: em-dash placeholder → null
  it("P-13: '—' → null (em-dash is a non-numeric placeholder)", () => {
    expect(parseVnNumber("—")).toBeNull();
  });

  // P-14: empty parentheses → null
  // Code path: after slice(1,-1).trim() inner string is ""; Number("") = 0;
  // isNaN(0) is false but s === "" is true → returns null
  it("P-14: '()' → null (empty parentheses: inner string is empty after strip)", () => {
    expect(parseVnNumber("()")).toBeNull();
  });

  // P-15: purely alphabetic string → null (NaN result)
  it("P-15: 'abc' → null (non-numeric string produces NaN)", () => {
    expect(parseVnNumber("abc")).toBeNull();
  });
});

// ============================================================================
// extractBalanceSheet — specific branch paths (B-01 to B-08)
// ============================================================================

describe("Task 121 — extractBalanceSheet edge cases", () => {
  // B-01: fully populated Vietnamese BCTC text — all fields parsed to non-zero
  it("B-01: fully populated balance sheet: all key fields non-zero; totalAssets = currentAssets + nonCurrentAssets", () => {
    const text = `
BẢNG CÂN ĐỐI KẾ TOÁN

A. TÀI SẢN NGẮN HẠN                    3.000.000
I. Tiền và các khoản tương đương tiền     800.000
II. Đầu tư tài chính ngắn hạn            200.000
III. Các khoản phải thu ngắn hạn       1.000.000
IV. Hàng tồn kho                         750.000
V. Tài sản ngắn hạn khác                 250.000

B. TÀI SẢN DÀI HẠN                    2.000.000
II. Tài sản cố định                    1.500.000
VI. Tài sản dài hạn khác                 500.000

TỔNG CỘNG TÀI SẢN                     5.000.000

A. NỢ PHẢI TRẢ                        3.000.000
I. Nợ ngắn hạn                        2.000.000
II. Nợ dài hạn                        1.000.000
B. VỐN CHỦ SỞ HỮU                     2.000.000
I. Vốn góp của chủ sở hữu             1.500.000
IV. Lợi nhuận sau thuế chưa phân phối    500.000
TỔNG CỘNG NGUỒN VỐN                   5.000.000
    `;

    const bs = extractBalanceSheet(text);
    expect(bs.currentAssets.total).toBeGreaterThan(0);
    expect(bs.nonCurrentAssets.total).toBeGreaterThan(0);
    expect(bs.totalAssets).toBe(bs.currentAssets.total + bs.nonCurrentAssets.total);
    expect(bs.totalAssets).toBe(5_000_000);
    expect(bs.currentAssets.cash).toBe(800_000);
    expect(bs.currentAssets.inventory).toBe(750_000);
    expect(bs.equity.retainedEarnings).toBe(500_000);
  });

  // B-02: totalAssets line missing — computed as fallback sum
  it("B-02: missing totalAssets line → computed from currentAssets.total + nonCurrentAssets.total", () => {
    // Deliberately omit any line matching P_TOTAL_ASSETS ("tổng cộng tài sản")
    const text = `
BẢNG CÂN ĐỐI KẾ TOÁN

A. TÀI SẢN NGẮN HẠN    2.400.000
B. TÀI SẢN DÀI HẠN     1.600.000
    `;
    // No "tổng cộng tài sản" line → fallback triggers
    const bs = extractBalanceSheet(text);
    expect(bs.currentAssets.total).toBe(2_400_000);
    expect(bs.nonCurrentAssets.total).toBe(1_600_000);
    expect(bs.totalAssets).toBe(4_000_000);
    expect(bs.totalAssets).toBe(bs.currentAssets.total + bs.nonCurrentAssets.total);
  });

  // B-03: totalLiabilities line missing — computed from current + long-term sub-totals
  it("B-03: missing totalLiabilities line → computed from currentLiabilities + longTermLiabilities", () => {
    const text = `
BẢNG CÂN ĐỐI KẾ TOÁN

A. TÀI SẢN NGẮN HẠN    1.000.000
TỔNG CỘNG TÀI SẢN      1.000.000

I. Nợ ngắn hạn          600.000
II. Nợ dài hạn           200.000
B. VỐN CHỦ SỞ HỮU       200.000
    `;
    // "Nợ phải trả" (P_TOTAL_LIABILITIES) line is absent
    const bs = extractBalanceSheet(text);
    expect(bs.currentLiabilities.total).toBe(600_000);
    expect(bs.longTermLiabilities.total).toBe(200_000);
    expect(bs.totalLiabilities).toBe(800_000);
    expect(bs.totalLiabilities).toBe(bs.currentLiabilities.total + bs.longTermLiabilities.total);
  });

  // B-04: empty string input → all fields default to 0, no exception
  it("B-04: empty string input → all fields are 0, no exception thrown", () => {
    expect(() => extractBalanceSheet("")).not.toThrow();
    const bs = extractBalanceSheet("");
    expect(bs.totalAssets).toBe(0);
    expect(bs.currentAssets.cash).toBe(0);
    expect(bs.currentAssets.inventory).toBe(0);
    expect(bs.totalLiabilities).toBe(0);
    expect(bs.equity.total).toBe(0);
    expect(bs.totalLiabilitiesAndEquity).toBe(0);
  });

  // B-05: negative treasury shares and retained earnings (parentheses notation)
  it("B-05: parentheses negatives on matching lines → stored as negative numbers", () => {
    const text = `
BẢNG CÂN ĐỐI KẾ TOÁN

A. TÀI SẢN NGẮN HẠN    500.000
TỔNG CỘNG TÀI SẢN      500.000

B. VỐN CHỦ SỞ HỮU       500.000
I. Vốn góp của chủ sở hữu   700.000
III. Cổ phiếu quỹ            (50.000)
IV. Lợi nhuận sau thuế chưa phân phối   (150.000)
    `;
    const bs = extractBalanceSheet(text);
    expect(bs.equity.treasuryShares).toBe(-50_000);
    expect(bs.equity.retainedEarnings).toBe(-150_000);
  });

  // B-06: single newline input → all fields default to 0
  it("B-06: single newline input → all fields default to 0", () => {
    const bs = extractBalanceSheet("\n");
    expect(bs.totalAssets).toBe(0);
    expect(bs.totalLiabilities).toBe(0);
    expect(bs.equity.total).toBe(0);
  });

  // B-07: numbers present but no Vietnamese keywords → no match, all values 0
  it("B-07: text with numbers but no Vietnamese keywords → all values 0, no throw", () => {
    const text = `
Some English text
Line 1: 1000000
Line 2: 2000000
Total: 3000000
    `;
    expect(() => extractBalanceSheet(text)).not.toThrow();
    const bs = extractBalanceSheet(text);
    expect(bs.totalAssets).toBe(0);
    expect(bs.currentAssets.total).toBe(0);
    expect(bs.totalLiabilities).toBe(0);
    expect(bs.equity.total).toBe(0);
  });

  // B-08: treasury shares line with parentheses value → returns -50000
  it("B-08: 'Cổ phiếu quỹ (50.000)' → equity.treasuryShares = -50000", () => {
    const text = `
BẢNG CÂN ĐỐI KẾ TOÁN

A. TÀI SẢN NGẮN HẠN    500.000
TỔNG CỘNG TÀI SẢN      500.000

B. VỐN CHỦ SỞ HỮU       450.000
I. Vốn góp của chủ sở hữu   500.000
III. Cổ phiếu quỹ            (50.000)
    `;
    const bs = extractBalanceSheet(text);
    expect(bs.equity.treasuryShares).toBe(-50_000);
  });
});

// ============================================================================
// extractIncomeStatement — specific branch paths (I-01 to I-08)
// ============================================================================

describe("Task 121 — extractIncomeStatement edge cases", () => {
  // I-01: fully populated KQHĐKD text — all fields parsed; ebit == operatingProfit
  it("I-01: fully populated income statement: all fields parsed; ebit === operatingProfit", () => {
    const text = `
BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH

1. Doanh thu bán hàng và cung cấp dịch vụ    8.000.000
2. Các khoản giảm trừ doanh thu                 200.000
3. Doanh thu thuần về bán hàng                7.800.000
4. Giá vốn hàng bán                           5.000.000
5. Lợi nhuận gộp về bán hàng                  2.800.000
6. Doanh thu hoạt động tài chính                 150.000
7. Chi phí tài chính                             250.000
   Trong đó: Chi phí lãi vay                     180.000
9. Chi phí bán hàng                              600.000
10. Chi phí quản lý doanh nghiệp                 400.000
11. Lợi nhuận thuần từ hoạt động kinh doanh    1.700.000
12. Thu nhập khác                                 80.000
13. Chi phí khác                                  20.000
14. Lợi nhuận khác                                60.000
15. Tổng lợi nhuận kế toán trước thuế          1.760.000
16. Chi phí thuế TNDN hiện hành                  340.000
17. Chi phí thuế TNDN hoãn lại                    12.000
18. Tổng chi phí thuế TNDN                       352.000
19. Lợi nhuận sau thuế thu nhập doanh nghiệp   1.408.000
    `;
    const is = extractIncomeStatement(text);
    expect(is.netRevenue).toBe(7_800_000);
    expect(is.grossProfit).toBe(2_800_000);
    expect(is.operatingProfit).toBe(1_700_000);
    expect(is.ebit).toBe(is.operatingProfit);
  });

  // I-02: grossProfit line missing; netRevenue and cogs present → fallback computed
  it("I-02: missing grossProfit line + netRevenue > 0 → grossProfit = netRevenue - cogs", () => {
    const text = `
BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH

Doanh thu thuần              4.000.000
Giá vốn hàng bán             2.500.000
Chi phí bán hàng               300.000
Lợi nhuận thuần từ HĐKD     1.200.000
Lợi nhuận trước thuế         1.200.000
Lợi nhuận sau thuế TNDN        960.000
    `;
    // No "lợi nhuận gộp" line → fallback should compute 4.000.000 - 2.500.000 = 1.500.000
    const is = extractIncomeStatement(text);
    expect(is.netRevenue).toBe(4_000_000);
    expect(is.cogs).toBe(2_500_000);
    expect(is.grossProfit).toBe(1_500_000);
  });

  // I-03: grossProfit line missing; netRevenue == 0 → fallback NOT triggered; grossProfit stays 0
  it("I-03: missing grossProfit + netRevenue = 0 → fallback NOT triggered; grossProfit stays 0", () => {
    const text = `
BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH

Doanh thu thuần              0
Giá vốn hàng bán             500.000
Lợi nhuận sau thuế TNDN    (500.000)
    `;
    // netRevenue is explicitly 0, so guard (netRevenue > 0) prevents fallback
    const is = extractIncomeStatement(text);
    expect(is.netRevenue).toBe(0);
    expect(is.grossProfit).toBe(0);
  });

  // I-04: otherProfit line missing; otherIncome > 0 and otherExpenses > 0 → fallback computed
  it("I-04: missing otherProfit + otherIncome > 0 + otherExpenses > 0 → otherProfit = otherIncome - otherExpenses", () => {
    const text = `
BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH

Doanh thu thuần              3.000.000
Giá vốn hàng bán             2.000.000
Lợi nhuận gộp                1.000.000
Thu nhập khác                  120.000
Chi phí khác                    40.000
Lợi nhuận trước thuế           900.000
Lợi nhuận sau thuế TNDN       720.000
    `;
    // No "lợi nhuận khác" line → fallback: 120.000 - 40.000 = 80.000
    const is = extractIncomeStatement(text);
    expect(is.otherIncome).toBe(120_000);
    expect(is.otherExpenses).toBe(40_000);
    expect(is.otherProfit).toBe(80_000);
  });

  // I-05: otherProfit line missing; both otherIncome == 0 and otherExpenses == 0 → fallback NOT triggered
  it("I-05: missing otherProfit + otherIncome = 0 + otherExpenses = 0 → otherProfit stays 0", () => {
    const text = `
BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH

Doanh thu thuần              2.000.000
Giá vốn hàng bán             1.500.000
Lợi nhuận gộp                  500.000
Lợi nhuận trước thuế           500.000
Lợi nhuận sau thuế TNDN       400.000
    `;
    // Neither otherIncome nor otherExpenses are present → both default to 0
    // Guard: (otherIncome > 0 || otherExpenses > 0) is false → otherProfit stays 0
    const is = extractIncomeStatement(text);
    expect(is.otherIncome).toBe(0);
    expect(is.otherExpenses).toBe(0);
    expect(is.otherProfit).toBe(0);
  });

  // I-06: totalIncomeTax missing; incomeTaxCurrent and incomeTaxDeferred both present → fallback sum
  it("I-06: missing totalIncomeTax + incomeTaxCurrent > 0 + incomeTaxDeferred > 0 → fallback sum", () => {
    const text = `
BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH

Doanh thu thuần              5.000.000
Giá vốn hàng bán             3.000.000
Lợi nhuận gộp                2.000.000
Lợi nhuận trước thuế         2.000.000
Chi phí thuế TNDN hiện hành    380.000
Chi phí thuế TNDN hoãn lại      20.000
Lợi nhuận sau thuế TNDN      1.600.000
    `;
    // "Tổng chi phí thuế TNDN" line absent → fallback: 380.000 + 20.000 = 400.000
    const is = extractIncomeStatement(text);
    expect(is.incomeTaxCurrent).toBe(380_000);
    expect(is.incomeTaxDeferred).toBe(20_000);
    expect(is.totalIncomeTax).toBe(400_000);
  });

  // I-07: ebitda is always 0 (cannot compute without depreciation)
  it("I-07: ebitda is always 0 regardless of input (no depreciation line in income statement)", () => {
    const text = `
BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH

Doanh thu thuần              5.000.000
Giá vốn hàng bán             3.000.000
Lợi nhuận gộp                2.000.000
Lợi nhuận thuần từ HĐKD      1.500.000
Lợi nhuận sau thuế TNDN      1.200.000
    `;
    const is = extractIncomeStatement(text);
    expect(is.ebitda).toBe(0);
  });

  // I-08: loss quarter — netProfit extracted as parentheses negative
  it("I-08: loss quarter: '(5.000)' → netProfit = -5000", () => {
    const text = `
BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH

Doanh thu thuần              800.000
Giá vốn hàng bán             900.000
Lợi nhuận gộp               (100.000)
Lợi nhuận trước thuế         (6.000)
Lợi nhuận sau thuế TNDN      (5.000)
    `;
    const is = extractIncomeStatement(text);
    expect(is.netProfit).toBe(-5_000);
    expect(is.grossProfit).toBe(-100_000);
  });
});

// ============================================================================
// extractCashFlow — specific branch paths (C-01 to C-05)
// ============================================================================

describe("Task 121 — extractCashFlow edge cases", () => {
  // C-01: fully populated LCTT text — all sections non-zero; freeCashFlow = operatingCF + capex
  it("C-01: fully populated cash flow: all sections non-zero; freeCashFlow = operatingCF + capex", () => {
    const text = `
BÁO CÁO LƯU CHUYỂN TIỀN TỆ

1. Lợi nhuận trước thuế                              1.800.000
2. Khấu hao TSCĐ và BĐSĐT                              400.000
3. Thay đổi vốn lưu động                             (200.000)
4. Tiền lãi vay đã trả                               (150.000)
5. Thuế TNDN đã nộp                                  (350.000)
Lưu chuyển tiền thuần từ hoạt động kinh doanh        1.500.000

1. Tiền chi mua sắm TSCĐ và các tài sản dài hạn khác (600.000)
2. Tiền thu thanh lý TSCĐ                               40.000
Lưu chuyển tiền thuần từ hoạt động đầu tư             (560.000)

1. Tiền vay nhận được                                  800.000
2. Tiền trả nợ gốc vay                               (500.000)
4. Cổ tức đã trả cho cổ đông                          (200.000)
Lưu chuyển tiền thuần từ hoạt động tài chính            100.000

Lưu chuyển tiền thuần trong kỳ                        1.040.000
Tiền và tương đương tiền đầu kỳ                         960.000
Tiền và tương đương tiền cuối kỳ                      2.000.000
    `;
    const cf = extractCashFlow(text);
    expect(cf.operatingCF).toBeGreaterThan(0);
    expect(cf.investingCF).toBeLessThan(0);
    expect(cf.financingCF).toBeGreaterThan(0);
    expect(cf.freeCashFlow).toBe(cf.operatingCF + cf.capex);
    expect(cf.freeCashFlow).toBe(1_500_000 + (-600_000)); // 900_000
  });

  // C-02: capex is negative (parentheses); freeCashFlow = operatingCF + capex
  it("C-02: capex = (10.000) → capex = -10000; freeCashFlow = operatingCF + capex", () => {
    const text = `
BÁO CÁO LƯU CHUYỂN TIỀN TỆ

Lưu chuyển tiền thuần từ hoạt động kinh doanh     50.000
Tiền chi mua sắm TSCĐ và các tài sản dài hạn khác (10.000)
Lưu chuyển tiền thuần từ hoạt động đầu tư         (10.000)
Lưu chuyển tiền thuần từ hoạt động tài chính        5.000
Lưu chuyển tiền thuần trong kỳ                     45.000
Tiền và tương đương tiền đầu kỳ                    55.000
Tiền và tương đương tiền cuối kỳ                  100.000
    `;
    const cf = extractCashFlow(text);
    expect(cf.capex).toBe(-10_000);
    expect(cf.operatingCF).toBe(50_000);
    expect(cf.freeCashFlow).toBe(50_000 + (-10_000)); // 40_000
  });

  // C-03: all three CF sub-totals missing; all zero; no throw
  it("C-03: all CF sub-totals missing → operatingCF = investingCF = financingCF = 0; no throw", () => {
    const text = `
BÁO CÁO LƯU CHUYỂN TIỀN TỆ

Lưu chuyển tiền thuần trong kỳ                     0
Tiền và tương đương tiền đầu kỳ                    0
Tiền và tương đương tiền cuối kỳ                   0
    `;
    expect(() => extractCashFlow(text)).not.toThrow();
    const cf = extractCashFlow(text);
    expect(cf.operatingCF).toBe(0);
    expect(cf.investingCF).toBe(0);
    expect(cf.financingCF).toBe(0);
    expect(cf.netCashFlow).toBe(0);
    expect(cf.freeCashFlow).toBe(0);
  });

  // C-04: only beginningCash and endingCash lines present; all CF sections default to 0
  it("C-04: only beginningCash and endingCash lines → both parsed; operating/investing/financing = 0", () => {
    const text = `
BÁO CÁO LƯU CHUYỂN TIỀN TỆ

Tiền và tương đương tiền đầu kỳ    1.000.000
Tiền và tương đương tiền cuối kỳ   1.200.000
    `;
    const cf = extractCashFlow(text);
    expect(cf.beginningCash).toBe(1_000_000);
    expect(cf.endingCash).toBe(1_200_000);
    expect(cf.operatingCF).toBe(0);
    expect(cf.investingCF).toBe(0);
    expect(cf.financingCF).toBe(0);
  });

  // C-05: image-only PDF (empty string) → all fields 0; no exception
  it("C-05: empty string (image-only PDF) → all fields = 0, no exception thrown", () => {
    expect(() => extractCashFlow("")).not.toThrow();
    const cf = extractCashFlow("");
    expect(cf.operatingCF).toBe(0);
    expect(cf.investingCF).toBe(0);
    expect(cf.financingCF).toBe(0);
    expect(cf.capex).toBe(0);
    expect(cf.netCashFlow).toBe(0);
    expect(cf.beginningCash).toBe(0);
    expect(cf.endingCash).toBe(0);
    expect(cf.freeCashFlow).toBe(0);
  });
});
