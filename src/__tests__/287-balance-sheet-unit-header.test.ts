/**
 * Task 287 — balanceSheetExtractor: unit-header detection + row-code guard
 *
 * Tests for:
 * - FR-1: detectUnitMultiplier — triệu vs tỷ unit header detection
 * - FR-2: row-code guard in findValue — skip multiples-of-10 in [10, 990]
 * - FR-3 partial: NFC normalization (transparent to existing tests)
 * - applyMultiplier — all monetary fields scaled by multiplier
 */
import { describe, it, expect } from "bun:test";
import { extractBalanceSheet } from "../domain/services/balanceSheetExtractor";

// ---------------------------------------------------------------------------
// FR-1: Unit header detection + multiplier application (287b/287c)
// ---------------------------------------------------------------------------

const SAMPLE_TY_DONG = `
BẢNG CÂN ĐỐI KẾ TOÁN
Tại ngày 31 tháng 12 năm 2024
Đơn vị tính: Tỷ đồng

TÀI SẢN
A. TÀI SẢN NGẮN HẠN                                       35.000
I. Tiền và các khoản tương đương tiền                       8.000
II. Đầu tư tài chính ngắn hạn                               2.000
III. Các khoản phải thu ngắn hạn                           15.000
IV. Hàng tồn kho                                            7.000
V. Tài sản ngắn hạn khác                                    3.000
B. TÀI SẢN DÀI HẠN                                        25.000
I. Các khoản phải thu dài hạn                               1.000
II. Tài sản cố định                                        15.000
III. Bất động sản đầu tư                                    2.000
IV. Đầu tư tài chính dài hạn                                5.000
V. Lợi thế thương mại                                       1.000
VI. Tài sản dài hạn khác                                    1.000
TỔNG CỘNG TÀI SẢN                                         60.000

NGUỒN VỐN
A. NỢ PHẢI TRẢ                                            40.000
I. Nợ ngắn hạn                                            25.000
1. Vay và nợ thuê tài chính ngắn hạn                      10.000
2. Phải trả người bán ngắn hạn                             5.000
3. Người mua trả tiền trước ngắn hạn                       2.000
4. Thuế và các khoản phải nộp Nhà nước                     3.000
5. Phải trả người lao động                                  2.000
6. Nợ ngắn hạn khác                                        3.000
II. Nợ dài hạn                                            15.000
1. Vay và nợ thuê tài chính dài hạn                       12.000
2. Thuế thu nhập hoãn lại phải trả                         1.000
3. Nợ dài hạn khác                                         2.000
B. VỐN CHỦ SỞ HỮU                                        20.000
I. Vốn góp của chủ sở hữu                                 10.000
II. Thặng dư vốn cổ phần                                   3.000
III. Cổ phiếu quỹ                                         (1.000)
IV. Lợi nhuận sau thuế chưa phân phối                      6.000
V. Quỹ khác thuộc vốn chủ sở hữu                           1.000
VI. Lợi ích cổ đông không kiểm soát                        1.000
TỔNG CỘNG NGUỒN VỐN                                      60.000
`;

const SAMPLE_TRIEU_DONG = `
BẢNG CÂN ĐỐI KẾ TOÁN
Đơn vị tính: Triệu đồng

A. TÀI SẢN NGẮN HẠN                  2.000.000
I. Tiền và các khoản tương đương tiền   500.000
B. TÀI SẢN DÀI HẠN                   1.000.000
TỔNG CỘNG TÀI SẢN                    3.000.000

A. NỢ PHẢI TRẢ                        1.500.000
I. Nợ ngắn hạn                        1.000.000
II. Nợ dài hạn                          500.000
B. VỐN CHỦ SỞ HỮU                     1.500.000
I. Vốn góp của chủ sở hữu             1.000.000
TỔNG CỘNG NGUỒN VỐN                  3.000.000
`;

const SAMPLE_NO_UNIT_HEADER = `
BẢNG CÂN ĐỐI KẾ TOÁN

A. TÀI SẢN NGẮN HẠN                  2.000.000
I. Tiền và các khoản tương đương tiền   500.000
B. TÀI SẢN DÀI HẠN                   1.000.000
TỔNG CỘNG TÀI SẢN                    3.000.000

A. NỢ PHẢI TRẢ                        1.500.000
I. Nợ ngắn hạn                        1.000.000
II. Nợ dài hạn                          500.000
B. VỐN CHỦ SỞ HỮU                     1.500.000
I. Vốn góp của chủ sở hữu             1.000.000
TỔNG CỘNG NGUỒN VỐN                  3.000.000
`;

// ---------------------------------------------------------------------------
// FR-2: Row-code guard (287d)
// The first matching line for P_TOTAL_ASSETS ends with "270" (a row code —
// multiple of 10 in [10, 990]), so it must be skipped. The second match
// contains the real grand total.
// ---------------------------------------------------------------------------

const SAMPLE_ROW_CODE_POLLUTION = `
BẢNG CÂN ĐỐI KẾ TOÁN
Đơn vị tính: Triệu đồng

TÀI SẢN
A. TÀI SẢN NGẮN HẠN               100
I. Tiền và các khoản tương đương tiền                1.200.000
B. TÀI SẢN DÀI HẠN                200
II. Tài sản cố định                                  2.500.000
270  TỔNG CỘNG TÀI SẢN            270
TỔNG CỘNG TÀI SẢN                                  60.000.000

NGUỒN VỐN
A. NỢ PHẢI TRẢ                     300
I. Nợ ngắn hạn                     310
II. Nợ dài hạn                     330
B. VỐN CHỦ SỞ HỮU                 400
I. Vốn góp của chủ sở hữu                           10.000.000
TỔNG CỘNG NGUỒN VỐN                                60.000.000
`;

// ---------------------------------------------------------------------------
// FR-3 partial: NFC normalization — NFD input should parse identically
// ---------------------------------------------------------------------------
// Construct NFD version of "Tổng cộng tài sản" by normalizing to NFD
const NFC_TEXT = `
Đơn vị tính: Triệu đồng
Tổng cộng tài sản  1.500.000
Tổng cộng nguồn vốn  1.500.000
`;
// NFD version: decompose diacritics
const NFD_TEXT = NFC_TEXT.normalize("NFD");

describe("Task 287 — balanceSheetExtractor unit-header + row-code guard", () => {
  // ── FR-1: Tỷ đồng unit header → multiplier = 1000 ──────────────────────
  describe("FR-1: unit-header detection — tỷ đồng", () => {
    it("multiplies all monetary fields by 1000 when header is tỷ đồng", () => {
      const bs = extractBalanceSheet(SAMPLE_TY_DONG);

      // totalAssets: 60.000 tỷ → 60,000,000 triệu
      expect(bs.totalAssets).toBe(60_000_000);
      expect(bs.totalLiabilitiesAndEquity).toBe(60_000_000);

      // Current assets sub-fields scaled by 1000
      expect(bs.currentAssets.total).toBe(35_000_000);
      expect(bs.currentAssets.cash).toBe(8_000_000);
      expect(bs.currentAssets.shortTermInvestments).toBe(2_000_000);
      expect(bs.currentAssets.accountsReceivable).toBe(15_000_000);
      expect(bs.currentAssets.inventory).toBe(7_000_000);
      expect(bs.currentAssets.otherCurrentAssets).toBe(3_000_000);

      // Non-current assets
      expect(bs.nonCurrentAssets.total).toBe(25_000_000);
      expect(bs.nonCurrentAssets.fixedAssets).toBe(15_000_000);
      expect(bs.nonCurrentAssets.longTermInvestments).toBe(5_000_000);

      // Liabilities
      expect(bs.totalLiabilities).toBe(40_000_000);
      expect(bs.currentLiabilities.total).toBe(25_000_000);
      expect(bs.longTermLiabilities.total).toBe(15_000_000);

      // Equity — including negative treasury shares scaled correctly
      expect(bs.equity.total).toBe(20_000_000);
      expect(bs.equity.treasuryShares).toBe(-1_000_000);
    });

    it("balance sheet balances after tỷ→triệu conversion", () => {
      const bs = extractBalanceSheet(SAMPLE_TY_DONG);
      expect(bs.totalLiabilitiesAndEquity).toBe(bs.totalAssets);
    });
  });

  // ── FR-1: Triệu đồng unit header → multiplier = 1 (no change) ──────────
  describe("FR-1: unit-header detection — triệu đồng", () => {
    it("does not scale when header is triệu đồng (multiplier = 1)", () => {
      const bs = extractBalanceSheet(SAMPLE_TRIEU_DONG);

      expect(bs.totalAssets).toBe(3_000_000);
      expect(bs.currentAssets.cash).toBe(500_000);
      expect(bs.equity.shareCapital).toBe(1_000_000);
      expect(bs.totalLiabilitiesAndEquity).toBe(3_000_000);
    });
  });

  // ── FR-1: No unit header → defaults to multiplier = 1 ──────────────────
  describe("FR-1: unit-header detection — no header", () => {
    it("defaults to multiplier=1 when no unit header found", () => {
      const bs = extractBalanceSheet(SAMPLE_NO_UNIT_HEADER);

      // Values unchanged (multiplier=1)
      expect(bs.totalAssets).toBe(3_000_000);
      expect(bs.totalLiabilitiesAndEquity).toBe(3_000_000);
    });
  });

  // ── FR-2: Row-code guard ─────────────────────────────────────────────────
  describe("FR-2: row-code guard", () => {
    it("skips row-code lines (trailing multiple-of-10 in [10,990]) and uses the real value", () => {
      const bs = extractBalanceSheet(SAMPLE_ROW_CODE_POLLUTION);

      // The lines ending with "100", "200", "270" are row codes and must be skipped.
      // The real total assets line "TỔNG CỘNG TÀI SẢN  60.000.000" must be used.
      expect(bs.totalAssets).toBe(60_000_000);
      expect(bs.totalLiabilitiesAndEquity).toBe(60_000_000);
    });

    it("does not skip non-round numbers below 990", () => {
      const text = `
Đơn vị tính: Triệu đồng
A. Tài sản ngắn hạn          823
I. Tiền và các khoản tương đương tiền  823
TỔNG CỘNG TÀI SẢN          823
TỔNG CỘNG NGUỒN VỐN        823
`;
      const bs = extractBalanceSheet(text);
      // 823 is not a multiple of 10 → not a row code → should NOT be skipped
      expect(bs.totalAssets).toBe(823);
    });

    it("skips exact multiples of 10 in the guard range [10, 990]", () => {
      // 990 is the boundary — should be skipped as a row code
      // Following line has the real value
      const text = `
Đơn vị tính: Triệu đồng
TỔNG CỘNG TÀI SẢN          990
TỔNG CỘNG TÀI SẢN          5.000.000
TỔNG CỘNG NGUỒN VỐN        5.000.000
`;
      const bs = extractBalanceSheet(text);
      expect(bs.totalAssets).toBe(5_000_000);
    });

    it("does not skip values above 990", () => {
      const text = `
Đơn vị tính: Triệu đồng
TỔNG CỘNG TÀI SẢN          1.000
TỔNG CỘNG NGUỒN VỐN        1.000
`;
      const bs = extractBalanceSheet(text);
      // 1000 > 990, so it is a valid financial value, not a row code
      expect(bs.totalAssets).toBe(1_000);
    });
  });

  // ── FR-3 partial: NFC normalization — NFD text parses identically ────────
  describe("FR-3 partial: NFC normalization", () => {
    it("parses NFD-encoded text identically to NFC input", () => {
      const bsNfc = extractBalanceSheet(NFC_TEXT);
      const bsNfd = extractBalanceSheet(NFD_TEXT);

      expect(bsNfd.totalAssets).toBe(bsNfc.totalAssets);
      expect(bsNfd.totalAssets).toBe(1_500_000);
    });
  });

  // ── Task 1088a: magnitude inference when unit header missing ────────────
  describe("Task 1088a: magnitude inference fallback", () => {
    it("infers raw VND when bare 'đồng' header and large numbers", () => {
      const text = `
BÁO CÁO TÀI CHÍNH
Đơn vị: đồng

A. TÀI SẢN NGẮN HẠN                             35.000.000.000.000
I. Tiền và các khoản tương đương tiền              8.000.000.000.000
TỔNG CỘNG TÀI SẢN                                56.000.000.000.000
TỔNG CỘNG NGUỒN VỐN                              56.000.000.000.000
`;
      const bs = extractBalanceSheet(text);
      // 56 trillion đồng ÷ 1,000,000 = 56,000,000 triệu
      expect(bs.totalAssets).toBe(56_000_000);
    });

    it("infers raw VND from magnitude alone (no unit header at all)", () => {
      const text = `
BÁO CÁO TÀI CHÍNH

A. TÀI SẢN NGẮN HẠN                             35.000.000.000.000
TỔNG CỘNG TÀI SẢN                                56.000.000.000.000
TỔNG CỘNG NGUỒN VỐN                              56.000.000.000.000
`;
      const bs = extractBalanceSheet(text);
      // Default multiplier 1, but totalAssets > 1 billion → infer raw VND
      expect(bs.totalAssets).toBe(56_000_000);
    });

    it("does NOT infer when triệu header is present (even with large numbers)", () => {
      const text = `
Đơn vị tính: Triệu đồng
TỔNG CỘNG TÀI SẢN                                56.000.000
TỔNG CỘNG NGUỒN VỐN                              56.000.000
`;
      const bs = extractBalanceSheet(text);
      // Explicit triệu header → no inference, values are triệu
      expect(bs.totalAssets).toBe(56_000_000);
    });

    it("handles loose 'trieu dong' without diacritics in OCR text", () => {
      const text = `
Don vi tinh: trieu dong

Tai san ngan han                                   35.000.000
TỔNG CỘNG TÀI SẢN                                56.000.000
TỔNG CỘNG NGUỒN VỐN                              56.000.000
`;
      const bs = extractBalanceSheet(text);
      // Loose match picks up "trieu dong" → multiplier = 1
      expect(bs.totalAssets).toBe(56_000_000);
    });
  });
});
