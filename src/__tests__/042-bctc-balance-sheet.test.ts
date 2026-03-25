/**
 * Task 042 — Balance Sheet Extractor
 *
 * TDD tests for extractBalanceSheet(rawText) → BalanceSheet
 */
import { describe, it, expect } from "bun:test";
import { extractBalanceSheet } from "../domain/services/balanceSheetExtractor";

// ---------------------------------------------------------------------------
// Sample 1: Standard BCTC with full line items
// ---------------------------------------------------------------------------
const SAMPLE_FULL = `
BẢNG CÂN ĐỐI KẾ TOÁN
Tại ngày 31 tháng 12 năm 2024
Đơn vị: triệu đồng

TÀI SẢN
A. TÀI SẢN NGẮN HẠN                                  5.500.000
I. Tiền và các khoản tương đương tiền                  1.200.000
II. Đầu tư tài chính ngắn hạn                           300.000
III. Các khoản phải thu ngắn hạn                       2.000.000
IV. Hàng tồn kho                                      1.500.000
V. Tài sản ngắn hạn khác                                500.000
B. TÀI SẢN DÀI HẠN                                    4.500.000
I. Các khoản phải thu dài hạn                            100.000
II. Tài sản cố định                                    2.500.000
III. Bất động sản đầu tư                                 200.000
IV. Đầu tư tài chính dài hạn                          1.000.000
V. Lợi thế thương mại                                   300.000
VI. Tài sản dài hạn khác                                400.000
TỔNG CỘNG TÀI SẢN                                    10.000.000

NGUỒN VỐN
A. NỢ PHẢI TRẢ                                        6.000.000
I. Nợ ngắn hạn                                        4.000.000
1. Vay và nợ thuê tài chính ngắn hạn                  1.500.000
2. Phải trả người bán ngắn hạn                          800.000
3. Người mua trả tiền trước ngắn hạn                    200.000
4. Thuế và các khoản phải nộp Nhà nước                   300.000
5. Phải trả người lao động                               400.000
6. Nợ ngắn hạn khác                                      800.000
II. Nợ dài hạn                                         2.000.000
1. Vay và nợ thuê tài chính dài hạn                    1.500.000
2. Thuế thu nhập hoãn lại phải trả                       100.000
3. Nợ dài hạn khác                                       400.000
B. VỐN CHỦ SỞ HỮU                                     4.000.000
I. Vốn góp của chủ sở hữu                             2.000.000
II. Thặng dư vốn cổ phần                                500.000
III. Cổ phiếu quỹ                                      (100.000)
IV. Lợi nhuận sau thuế chưa phân phối                  1.200.000
V. Quỹ khác thuộc vốn chủ sở hữu                        200.000
VI. Lợi ích cổ đông không kiểm soát                      200.000
TỔNG CỘNG NGUỒN VỐN                                  10.000.000
`;

// ---------------------------------------------------------------------------
// Sample 2: Minimal / sparse — only major totals present
// ---------------------------------------------------------------------------
const SAMPLE_MINIMAL = `
BẢNG CÂN ĐỐI KẾ TOÁN
Đơn vị: triệu đồng

A. Tài sản ngắn hạn          800.000
I. Tiền và tương đương tiền   200.000
B. Tài sản dài hạn           200.000
TỔNG CỘNG TÀI SẢN          1.000.000

A. Nợ phải trả               600.000
I. Nợ ngắn hạn               500.000
II. Nợ dài hạn               100.000
B. Vốn chủ sở hữu            400.000
I. Vốn góp của chủ sở hữu    300.000
TỔNG CỘNG NGUỒN VỐN        1.000.000
`;

// ---------------------------------------------------------------------------
// Sample 3: Comma-separated numbers (English format from some scrapers)
// ---------------------------------------------------------------------------
const SAMPLE_COMMA_FORMAT = `
Bảng cân đối kế toán
Đơn vị: triệu đồng

A. TÀI SẢN NGẮN HẠN                   2,500,000
I. Tiền và các khoản tương đương tiền     500,000
II. Đầu tư tài chính ngắn hạn            100,000
III. Các khoản phải thu ngắn hạn          900,000
IV. Hàng tồn kho                          800,000
V. Tài sản ngắn hạn khác                 200,000
B. TÀI SẢN DÀI HẠN                     1,500,000
II. Tài sản cố định                     1,000,000
IV. Đầu tư tài chính dài hạn             400,000
VI. Tài sản dài hạn khác                 100,000
TỔNG CỘNG TÀI SẢN                      4,000,000

A. NỢ PHẢI TRẢ                         2,400,000
I. Nợ ngắn hạn                         1,800,000
1. Vay và nợ thuê tài chính ngắn hạn     700,000
II. Nợ dài hạn                            600,000
B. VỐN CHỦ SỞ HỮU                      1,600,000
I. Vốn góp của chủ sở hữu              1,000,000
IV. Lợi nhuận sau thuế chưa phân phối     600,000
TỔNG CỘNG NGUỒN VỐN                    4,000,000
`;

describe("042 — extractBalanceSheet", () => {
  // ── Test 1: Full balance sheet ──────────────────────────────────────────
  it("extracts all fields from a standard Vietnamese BCTC", () => {
    const bs = extractBalanceSheet(SAMPLE_FULL);

    // Current assets
    expect(bs.currentAssets.total).toBe(5_500_000);
    expect(bs.currentAssets.cash).toBe(1_200_000);
    expect(bs.currentAssets.shortTermInvestments).toBe(300_000);
    expect(bs.currentAssets.accountsReceivable).toBe(2_000_000);
    expect(bs.currentAssets.inventory).toBe(1_500_000);
    expect(bs.currentAssets.otherCurrentAssets).toBe(500_000);

    // Non-current assets
    expect(bs.nonCurrentAssets.total).toBe(4_500_000);
    expect(bs.nonCurrentAssets.longTermReceivables).toBe(100_000);
    expect(bs.nonCurrentAssets.fixedAssets).toBe(2_500_000);
    expect(bs.nonCurrentAssets.investmentProperty).toBe(200_000);
    expect(bs.nonCurrentAssets.longTermInvestments).toBe(1_000_000);
    expect(bs.nonCurrentAssets.goodwill).toBe(300_000);
    expect(bs.nonCurrentAssets.otherLongTermAssets).toBe(400_000);

    // Total assets = currentAssets.total + nonCurrentAssets.total
    expect(bs.totalAssets).toBe(10_000_000);
    expect(bs.totalAssets).toBe(bs.currentAssets.total + bs.nonCurrentAssets.total);

    // Liabilities
    expect(bs.totalLiabilities).toBe(6_000_000);
    expect(bs.currentLiabilities.total).toBe(4_000_000);
    expect(bs.currentLiabilities.shortTermDebt).toBe(1_500_000);
    expect(bs.currentLiabilities.accountsPayable).toBe(800_000);
    expect(bs.currentLiabilities.advancesFromCustomers).toBe(200_000);
    expect(bs.currentLiabilities.taxPayable).toBe(300_000);
    expect(bs.currentLiabilities.payablesToEmployees).toBe(400_000);
    expect(bs.currentLiabilities.otherCurrentLiabilities).toBe(800_000);

    expect(bs.longTermLiabilities.total).toBe(2_000_000);
    expect(bs.longTermLiabilities.longTermDebt).toBe(1_500_000);
    expect(bs.longTermLiabilities.deferredTaxLiabilities).toBe(100_000);
    expect(bs.longTermLiabilities.otherLongTermLiabilities).toBe(400_000);

    // Equity
    expect(bs.equity.total).toBe(4_000_000);
    expect(bs.equity.shareCapital).toBe(2_000_000);
    expect(bs.equity.sharePremium).toBe(500_000);
    expect(bs.equity.treasuryShares).toBe(-100_000);
    expect(bs.equity.retainedEarnings).toBe(1_200_000);
    expect(bs.equity.otherEquityFunds).toBe(200_000);
    expect(bs.equity.minorityInterest).toBe(200_000);

    // Grand totals balance
    expect(bs.totalLiabilitiesAndEquity).toBe(10_000_000);
    expect(bs.totalLiabilitiesAndEquity).toBe(bs.totalAssets);
  });

  // ── Test 2: Minimal fields — missing items default to 0 ────────────────
  it("handles missing fields gracefully (defaults to 0)", () => {
    const bs = extractBalanceSheet(SAMPLE_MINIMAL);

    expect(bs.currentAssets.total).toBe(800_000);
    expect(bs.currentAssets.cash).toBe(200_000);
    expect(bs.currentAssets.shortTermInvestments).toBe(0);
    expect(bs.currentAssets.inventory).toBe(0);

    expect(bs.nonCurrentAssets.total).toBe(200_000);
    expect(bs.nonCurrentAssets.fixedAssets).toBe(0);

    expect(bs.totalAssets).toBe(1_000_000);
    expect(bs.totalAssets).toBe(bs.currentAssets.total + bs.nonCurrentAssets.total);

    expect(bs.totalLiabilities).toBe(600_000);
    expect(bs.currentLiabilities.total).toBe(500_000);
    expect(bs.longTermLiabilities.total).toBe(100_000);

    expect(bs.equity.total).toBe(400_000);
    expect(bs.equity.shareCapital).toBe(300_000);
    expect(bs.equity.retainedEarnings).toBe(0);

    expect(bs.totalLiabilitiesAndEquity).toBe(1_000_000);
  });

  // ── Test 3: English comma format numbers ───────────────────────────────
  it("parses English comma-formatted numbers correctly", () => {
    const bs = extractBalanceSheet(SAMPLE_COMMA_FORMAT);

    expect(bs.currentAssets.total).toBe(2_500_000);
    expect(bs.currentAssets.cash).toBe(500_000);
    expect(bs.currentAssets.inventory).toBe(800_000);

    expect(bs.nonCurrentAssets.total).toBe(1_500_000);
    expect(bs.nonCurrentAssets.fixedAssets).toBe(1_000_000);

    expect(bs.totalAssets).toBe(4_000_000);
    expect(bs.totalAssets).toBe(bs.currentAssets.total + bs.nonCurrentAssets.total);

    expect(bs.totalLiabilities).toBe(2_400_000);
    expect(bs.equity.total).toBe(1_600_000);
    expect(bs.totalLiabilitiesAndEquity).toBe(4_000_000);
  });

  // ── Test 4: totalAssets = currentAssets + nonCurrentAssets invariant ────
  it("maintains totalAssets = currentAssets + nonCurrentAssets for all samples", () => {
    for (const sample of [SAMPLE_FULL, SAMPLE_MINIMAL, SAMPLE_COMMA_FORMAT]) {
      const bs = extractBalanceSheet(sample);
      expect(bs.totalAssets).toBe(bs.currentAssets.total + bs.nonCurrentAssets.total);
    }
  });

  // ── Test 5: Empty / garbage input ──────────────────────────────────────
  it("returns zeroed BalanceSheet for empty input", () => {
    const bs = extractBalanceSheet("");
    expect(bs.totalAssets).toBe(0);
    expect(bs.currentAssets.total).toBe(0);
    expect(bs.nonCurrentAssets.total).toBe(0);
    expect(bs.totalLiabilities).toBe(0);
    expect(bs.equity.total).toBe(0);
    expect(bs.totalLiabilitiesAndEquity).toBe(0);
  });
});
