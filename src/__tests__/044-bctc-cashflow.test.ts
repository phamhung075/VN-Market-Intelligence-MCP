/**
 * Task 044 — Cash Flow Extractor
 *
 * TDD tests for extractCashFlow(rawText) → CashFlowStatement
 */
import { describe, it, expect } from "bun:test";
import { extractCashFlow } from "../domain/services/cashFlowExtractor";

// ---------------------------------------------------------------------------
// Sample 1: Full cash flow statement
// ---------------------------------------------------------------------------
const SAMPLE_FULL = `
BÁO CÁO LƯU CHUYỂN TIỀN TỆ
Cho năm tài chính kết thúc ngày 31/12/2024
Đơn vị: triệu đồng

I. Lưu chuyển tiền từ hoạt động kinh doanh
1. Lợi nhuận trước thuế                                    2.000.000
2. Khấu hao TSCĐ và BĐSĐT                                    500.000
3. Thay đổi vốn lưu động                                    (300.000)
4. Tiền lãi vay đã trả                                      (200.000)
5. Thuế TNDN đã nộp                                         (400.000)
Lưu chuyển tiền thuần từ hoạt động kinh doanh               1.600.000

II. Lưu chuyển tiền từ hoạt động đầu tư
1. Tiền chi mua sắm TSCĐ và các tài sản dài hạn khác        (800.000)
2. Tiền thu thanh lý TSCĐ                                      50.000
3. Tiền chi mua các khoản đầu tư tài chính                   (200.000)
4. Tiền thu hồi đầu tư tài chính                              100.000
5. Cổ tức và lãi tiền gửi đã thu                               80.000
Lưu chuyển tiền thuần từ hoạt động đầu tư                    (770.000)

III. Lưu chuyển tiền từ hoạt động tài chính
1. Tiền vay nhận được                                        1.000.000
2. Tiền trả nợ gốc vay                                      (600.000)
3. Tiền thu từ phát hành cổ phiếu                              200.000
4. Cổ tức đã trả cho cổ đông                                 (300.000)
Lưu chuyển tiền thuần từ hoạt động tài chính                   300.000

Lưu chuyển tiền thuần trong kỳ                               1.130.000
Tiền và tương đương tiền đầu kỳ                                870.000
Tiền và tương đương tiền cuối kỳ                             2.000.000
`;

// ---------------------------------------------------------------------------
// Sample 2: Minimal — only major totals
// ---------------------------------------------------------------------------
const SAMPLE_MINIMAL = `
BÁO CÁO LƯU CHUYỂN TIỀN TỆ
Đơn vị: triệu đồng

Lưu chuyển tiền thuần từ HĐKD                                 500.000
Tiền chi mua sắm TSCĐ                                        (100.000)
Lưu chuyển tiền thuần từ HĐĐT                                (150.000)
Lưu chuyển tiền thuần từ HĐTC                                (200.000)
Lưu chuyển tiền thuần trong kỳ                                 150.000
Tiền và tương đương tiền đầu kỳ                                350.000
Tiền và tương đương tiền cuối kỳ                               500.000
`;

// ---------------------------------------------------------------------------
// Sample 3: English comma format
// ---------------------------------------------------------------------------
const SAMPLE_COMMA_FORMAT = `
Báo cáo lưu chuyển tiền tệ
Đơn vị: triệu đồng

I. Lưu chuyển tiền từ hoạt động kinh doanh
1. Lợi nhuận trước thuế                                    3,500,000
2. Khấu hao TSCĐ và BĐSĐT                                    800,000
3. Thay đổi vốn lưu động                                    (500,000)
4. Tiền lãi vay đã trả                                      (150,000)
5. Thuế TNDN đã nộp                                         (600,000)
Lưu chuyển tiền thuần từ hoạt động kinh doanh               3,050,000

II. Lưu chuyển tiền từ hoạt động đầu tư
1. Tiền chi mua sắm TSCĐ                                  (1,200,000)
2. Tiền thu thanh lý TSCĐ                                     100,000
3. Tiền chi mua các khoản đầu tư tài chính                   (300,000)
4. Tiền thu hồi đầu tư tài chính                              250,000
5. Cổ tức và lãi tiền gửi đã thu                              120,000
Lưu chuyển tiền thuần từ hoạt động đầu tư                  (1,030,000)

III. Lưu chuyển tiền từ hoạt động tài chính
1. Tiền vay nhận được                                        2,000,000
2. Tiền trả nợ gốc vay                                    (1,500,000)
3. Tiền thu từ phát hành cổ phiếu                              500,000
4. Cổ tức đã trả cho cổ đông                                 (400,000)
Lưu chuyển tiền thuần từ hoạt động tài chính                   600,000

Lưu chuyển tiền thuần trong kỳ                               2,620,000
Tiền và tương đương tiền đầu kỳ                              1,380,000
Tiền và tương đương tiền cuối kỳ                             4,000,000
`;

describe("044 — extractCashFlow", () => {
  // ── Test 1: Full cash flow statement ─────────────────────────────────
  it("extracts all fields from a standard Vietnamese cash flow statement", () => {
    const cf = extractCashFlow(SAMPLE_FULL);

    // Operating
    expect(cf.profitBeforeTax).toBe(2_000_000);
    expect(cf.depreciationAmortization).toBe(500_000);
    expect(cf.workingCapitalChanges).toBe(-300_000);
    expect(cf.interestPaid).toBe(-200_000);
    expect(cf.incomeTaxPaid).toBe(-400_000);
    expect(cf.operatingCF).toBe(1_600_000);

    // Investing
    expect(cf.capex).toBe(-800_000);
    expect(cf.proceedsFromAssetSales).toBe(50_000);
    expect(cf.investmentPurchases).toBe(-200_000);
    expect(cf.investmentProceeds).toBe(100_000);
    expect(cf.dividendsReceived).toBe(80_000);
    expect(cf.investingCF).toBe(-770_000);

    // Financing
    expect(cf.proceedsFromDebt).toBe(1_000_000);
    expect(cf.debtRepayments).toBe(-600_000);
    expect(cf.proceedsFromShareIssuance).toBe(200_000);
    expect(cf.dividendsPaid).toBe(-300_000);
    expect(cf.financingCF).toBe(300_000);

    // Totals
    expect(cf.netCashFlow).toBe(1_130_000);
    expect(cf.beginningCash).toBe(870_000);
    expect(cf.endingCash).toBe(2_000_000);
  });

  // ── Test 2: endingCash = beginningCash + netCashFlow invariant ───────
  it("maintains endingCash = beginningCash + netCashFlow invariant", () => {
    for (const sample of [SAMPLE_FULL, SAMPLE_MINIMAL, SAMPLE_COMMA_FORMAT]) {
      const cf = extractCashFlow(sample);
      expect(cf.endingCash).toBe(cf.beginningCash + cf.netCashFlow);
    }
  });

  // ── Test 3: FCF = operatingCF + capex ────────────────────────────────
  it("computes freeCashFlow = operatingCF + capex", () => {
    const cf = extractCashFlow(SAMPLE_FULL);
    expect(cf.freeCashFlow).toBe(cf.operatingCF + cf.capex);
    expect(cf.freeCashFlow).toBe(1_600_000 + (-800_000)); // 800,000

    const cf2 = extractCashFlow(SAMPLE_COMMA_FORMAT);
    expect(cf2.freeCashFlow).toBe(cf2.operatingCF + cf2.capex);
    expect(cf2.freeCashFlow).toBe(3_050_000 + (-1_200_000)); // 1,850,000
  });

  // ── Test 4: Empty input → zeroed object ──────────────────────────────
  it("returns zeroed CashFlowStatement for empty input", () => {
    const cf = extractCashFlow("");
    expect(cf.profitBeforeTax).toBe(0);
    expect(cf.depreciationAmortization).toBe(0);
    expect(cf.operatingCF).toBe(0);
    expect(cf.capex).toBe(0);
    expect(cf.investingCF).toBe(0);
    expect(cf.financingCF).toBe(0);
    expect(cf.netCashFlow).toBe(0);
    expect(cf.beginningCash).toBe(0);
    expect(cf.endingCash).toBe(0);
    expect(cf.freeCashFlow).toBe(0);
  });

  // ── Test 5: Minimal statement with only totals ───────────────────────
  it("handles minimal statement with only section totals", () => {
    const cf = extractCashFlow(SAMPLE_MINIMAL);

    expect(cf.operatingCF).toBe(500_000);
    expect(cf.capex).toBe(-100_000);
    expect(cf.investingCF).toBe(-150_000);
    expect(cf.financingCF).toBe(-200_000);
    expect(cf.netCashFlow).toBe(150_000);
    expect(cf.beginningCash).toBe(350_000);
    expect(cf.endingCash).toBe(500_000);
    expect(cf.freeCashFlow).toBe(500_000 + (-100_000)); // 400,000
  });

  // ── Test 6: English comma format ─────────────────────────────────────
  it("parses English comma-formatted numbers correctly", () => {
    const cf = extractCashFlow(SAMPLE_COMMA_FORMAT);

    expect(cf.profitBeforeTax).toBe(3_500_000);
    expect(cf.depreciationAmortization).toBe(800_000);
    expect(cf.operatingCF).toBe(3_050_000);
    expect(cf.capex).toBe(-1_200_000);
    expect(cf.investingCF).toBe(-1_030_000);
    expect(cf.proceedsFromDebt).toBe(2_000_000);
    expect(cf.debtRepayments).toBe(-1_500_000);
    expect(cf.financingCF).toBe(600_000);
    expect(cf.netCashFlow).toBe(2_620_000);
    expect(cf.beginningCash).toBe(1_380_000);
    expect(cf.endingCash).toBe(4_000_000);
  });
});
