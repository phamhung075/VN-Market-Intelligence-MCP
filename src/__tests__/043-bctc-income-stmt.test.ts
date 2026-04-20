/**
 * Task 043 — Income Statement Extractor
 *
 * TDD tests for extractIncomeStatement(rawText) → IncomeStatement
 */
import { describe, it, expect } from "bun:test";
import { extractIncomeStatement } from "../domain/services/financial-reports/incomeStatementExtractor";

// ---------------------------------------------------------------------------
// Sample 1: Full income statement (Báo cáo KQHĐKD)
// ---------------------------------------------------------------------------
const SAMPLE_FULL = `
BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH
Quý 4/2024
Đơn vị: triệu đồng

1. Doanh thu bán hàng và cung cấp dịch vụ           10.000.000
2. Các khoản giảm trừ doanh thu                         500.000
3. Doanh thu thuần về bán hàng và CCDV                 9.500.000
4. Giá vốn hàng bán                                   6.000.000
5. Lợi nhuận gộp về bán hàng và CCDV                  3.500.000

6. Doanh thu hoạt động tài chính                         200.000
7. Chi phí tài chính                                     400.000
   Trong đó: Chi phí lãi vay                             300.000
8. Phần lãi/lỗ trong công ty liên kết                     50.000

9. Chi phí bán hàng                                      800.000
10. Chi phí quản lý doanh nghiệp                         600.000

11. Lợi nhuận thuần từ hoạt động kinh doanh             1.950.000
12. Thu nhập khác                                         100.000
13. Chi phí khác                                           30.000
14. Lợi nhuận khác                                         70.000

15. Tổng lợi nhuận kế toán trước thuế                  2.020.000
16. Chi phí thuế TNDN hiện hành                          380.000
17. Chi phí thuế TNDN hoãn lại                            20.000
18. Tổng chi phí thuế TNDN                               400.000

19. Lợi nhuận sau thuế thu nhập doanh nghiệp           1.620.000
20. Lợi ích của cổ đông không kiểm soát                   120.000
21. Lợi nhuận sau thuế của cổ đông công ty mẹ           1.500.000

22. Lãi cơ bản trên cổ phiếu (VND)                        3.750
23. Lãi suy giảm trên cổ phiếu (VND)                      3.600
`;

// ---------------------------------------------------------------------------
// Sample 2: Minimal — only major items present
// ---------------------------------------------------------------------------
const SAMPLE_MINIMAL = `
BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH
Đơn vị: triệu đồng

Doanh thu thuần                     2.000.000
Giá vốn hàng bán                   1.200.000
Lợi nhuận gộp                        800.000
Lợi nhuận thuần từ HĐKD              500.000
Lợi nhuận trước thuế                  500.000
Lợi nhuận sau thuế TNDN              400.000
Lãi cơ bản trên cổ phiếu               1.000
`;

// ---------------------------------------------------------------------------
// Sample 3: English comma-format numbers
// ---------------------------------------------------------------------------
const SAMPLE_COMMA_FORMAT = `
Báo cáo kết quả hoạt động kinh doanh
Đơn vị: triệu đồng

Doanh thu bán hàng và cung cấp dịch vụ       5,000,000
Các khoản giảm trừ doanh thu                    200,000
Doanh thu thuần về bán hàng                    4,800,000
Giá vốn hàng bán                              3,000,000
Lợi nhuận gộp                                 1,800,000

Chi phí tài chính                                150,000
Chi phí lãi vay                                  100,000
Chi phí bán hàng                                 300,000
Chi phí quản lý doanh nghiệp                    250,000

Lợi nhuận thuần từ hoạt động kinh doanh        1,100,000
Thu nhập khác                                     50,000
Chi phí khác                                      10,000
Lợi nhuận khác                                    40,000
Tổng lợi nhuận trước thuế                      1,140,000
Chi phí thuế TNDN hiện hành                      228,000
Lợi nhuận sau thuế TNDN                          912,000
Lãi cơ bản trên cổ phiếu                           2,280
`;

// ---------------------------------------------------------------------------
// Sample 4: Profitable company (EPS > 0 verification)
// ---------------------------------------------------------------------------
const SAMPLE_PROFITABLE = `
BÁO CÁO KQHĐKD
Đơn vị: triệu đồng

Doanh thu bán hàng                              20.000.000
Các khoản giảm trừ doanh thu                       100.000
Doanh thu thuần                                 19.900.000
Giá vốn hàng bán                               12.000.000
Lợi nhuận gộp                                   7.900.000

Doanh thu hoạt động tài chính                      500.000
Chi phí tài chính                                  600.000
Chi phí lãi vay                                    400.000
Phần lãi lỗ trong công ty liên kết                 100.000
Chi phí bán hàng                                 1.500.000
Chi phí quản lý doanh nghiệp                    1.200.000

Lợi nhuận thuần từ hoạt động kinh doanh          5.200.000
Thu nhập khác                                      200.000
Chi phí khác                                       100.000
Lợi nhuận khác                                    100.000

Tổng lợi nhuận trước thuế                        5.300.000
Thuế TNDN hiện hành                              1.060.000
Thuế TNDN hoãn lại                                  40.000
Tổng chi phí thuế TNDN                           1.100.000

Lợi nhuận sau thuế TNDN                          4.200.000
Lợi ích cổ đông không kiểm soát                    200.000
LNST của cổ đông công ty mẹ                      4.000.000

Lãi cơ bản trên cổ phiếu (EPS)                      10.500
Lãi suy giảm trên cổ phiếu                          10.200
`;

describe("043 — extractIncomeStatement", () => {
  // -- Test 1: Full income statement -------------------------------------------
  it("extracts all fields from a standard Vietnamese income statement", () => {
    const is = extractIncomeStatement(SAMPLE_FULL);

    expect(is.grossRevenue).toBe(10_000_000);
    expect(is.revenueDeductions).toBe(500_000);
    expect(is.netRevenue).toBe(9_500_000);
    expect(is.cogs).toBe(6_000_000);
    expect(is.grossProfit).toBe(3_500_000);

    expect(is.financialIncome).toBe(200_000);
    expect(is.financialExpenses).toBe(400_000);
    expect(is.interestExpenses).toBe(300_000);
    expect(is.shareOfAssociates).toBe(50_000);

    expect(is.sellingExpenses).toBe(800_000);
    expect(is.adminExpenses).toBe(600_000);

    expect(is.operatingProfit).toBe(1_950_000);
    expect(is.otherIncome).toBe(100_000);
    expect(is.otherExpenses).toBe(30_000);
    expect(is.otherProfit).toBe(70_000);

    expect(is.profitBeforeTax).toBe(2_020_000);
    expect(is.incomeTaxCurrent).toBe(380_000);
    expect(is.incomeTaxDeferred).toBe(20_000);
    expect(is.totalIncomeTax).toBe(400_000);

    expect(is.netProfit).toBe(1_620_000);
    expect(is.minorityInterest).toBe(120_000);
    expect(is.netProfitParent).toBe(1_500_000);

    expect(is.eps).toBe(3_750);
    expect(is.dilutedEps).toBe(3_600);

    // Computed
    expect(is.ebit).toBe(1_950_000);
  });

  // -- Test 2: grossProfit = netRevenue - cogs invariant -----------------------
  it("maintains grossProfit = netRevenue - cogs invariant", () => {
    for (const sample of [SAMPLE_FULL, SAMPLE_PROFITABLE]) {
      const is = extractIncomeStatement(sample);
      expect(is.grossProfit).toBe(is.netRevenue - is.cogs);
    }
  });

  // -- Test 3: EPS > 0 for profitable companies --------------------------------
  it("EPS > 0 for profitable companies", () => {
    const is = extractIncomeStatement(SAMPLE_PROFITABLE);
    expect(is.eps).toBeGreaterThan(0);
    expect(is.netProfit).toBeGreaterThan(0);
    expect(is.eps).toBe(10_500);
    expect(is.dilutedEps).toBe(10_200);
  });

  // -- Test 4: Minimal input --- missing items default to 0 --------------------
  it("handles missing fields gracefully (defaults to 0)", () => {
    const is = extractIncomeStatement(SAMPLE_MINIMAL);

    expect(is.grossRevenue).toBe(0); // not present
    expect(is.netRevenue).toBe(2_000_000);
    expect(is.cogs).toBe(1_200_000);
    expect(is.grossProfit).toBe(800_000);
    expect(is.operatingProfit).toBe(500_000);
    expect(is.profitBeforeTax).toBe(500_000);
    expect(is.netProfit).toBe(400_000);
    expect(is.eps).toBe(1_000);

    // Missing fields default to 0
    expect(is.financialIncome).toBe(0);
    expect(is.financialExpenses).toBe(0);
    expect(is.sellingExpenses).toBe(0);
    expect(is.adminExpenses).toBe(0);
    expect(is.minorityInterest).toBe(0);
  });

  // -- Test 5: Comma-format numbers --------------------------------------------
  it("parses English comma-formatted numbers correctly", () => {
    const is = extractIncomeStatement(SAMPLE_COMMA_FORMAT);

    expect(is.grossRevenue).toBe(5_000_000);
    expect(is.revenueDeductions).toBe(200_000);
    expect(is.netRevenue).toBe(4_800_000);
    expect(is.cogs).toBe(3_000_000);
    expect(is.grossProfit).toBe(1_800_000);
    expect(is.operatingProfit).toBe(1_100_000);
    expect(is.profitBeforeTax).toBe(1_140_000);
    expect(is.netProfit).toBe(912_000);
    expect(is.eps).toBe(2_280);
  });

  // -- Test 6: Empty input --- zeroed IncomeStatement ---------------------------
  it("returns zeroed IncomeStatement for empty input", () => {
    const is = extractIncomeStatement("");

    expect(is.grossRevenue).toBe(0);
    expect(is.netRevenue).toBe(0);
    expect(is.cogs).toBe(0);
    expect(is.grossProfit).toBe(0);
    expect(is.operatingProfit).toBe(0);
    expect(is.profitBeforeTax).toBe(0);
    expect(is.netProfit).toBe(0);
    expect(is.eps).toBe(0);
    expect(is.dilutedEps).toBe(0);
    expect(is.ebit).toBe(0);
    expect(is.ebitda).toBe(0);
  });

  // -- Test 7: Full profitable company -----------------------------------------
  it("extracts all fields from profitable company sample", () => {
    const is = extractIncomeStatement(SAMPLE_PROFITABLE);

    expect(is.grossRevenue).toBe(20_000_000);
    expect(is.revenueDeductions).toBe(100_000);
    expect(is.netRevenue).toBe(19_900_000);
    expect(is.cogs).toBe(12_000_000);
    expect(is.grossProfit).toBe(7_900_000);

    expect(is.financialIncome).toBe(500_000);
    expect(is.financialExpenses).toBe(600_000);
    expect(is.interestExpenses).toBe(400_000);
    expect(is.shareOfAssociates).toBe(100_000);

    expect(is.sellingExpenses).toBe(1_500_000);
    expect(is.adminExpenses).toBe(1_200_000);

    expect(is.operatingProfit).toBe(5_200_000);
    expect(is.otherIncome).toBe(200_000);
    expect(is.otherExpenses).toBe(100_000);
    expect(is.otherProfit).toBe(100_000);

    expect(is.profitBeforeTax).toBe(5_300_000);
    expect(is.incomeTaxCurrent).toBe(1_060_000);
    expect(is.incomeTaxDeferred).toBe(40_000);
    expect(is.totalIncomeTax).toBe(1_100_000);

    expect(is.netProfit).toBe(4_200_000);
    expect(is.minorityInterest).toBe(200_000);
    expect(is.netProfitParent).toBe(4_000_000);

    expect(is.ebit).toBe(5_200_000);
  });
});
