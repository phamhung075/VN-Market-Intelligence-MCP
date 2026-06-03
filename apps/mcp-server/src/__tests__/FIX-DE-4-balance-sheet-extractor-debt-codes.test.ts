/**
 * FIX-DE-4 — balanceSheetExtractor: fix OCR path VAS code mapping for debt
 *
 * ROOT CAUSE: shortTermDebt was mapped to code 311 (accounts payable / "Phải
 * trả người bán") instead of code 321 ("Vay và nợ thuê tài chính ngắn hạn").
 * longTermDebt was mapped to code 334 ("Vay dài hạn") instead of the current
 * standard code 339 ("Vay và nợ thuê tài chính dài hạn").
 *
 * SPEC (architect brief 2026-06-03-bctc-debt-decomposition-gap.md §FIX-DE-4):
 *   - shortTermDebt: code 321 primary; code 319 fallback ONLY via label hint
 *     /vay ngắn hạn/ (to exclude "Phải trả ngắn hạn khác" on some issuers)
 *   - longTermDebt: code 339 primary; code 334 fallback
 *   - Code 311 MUST NOT map to shortTermDebt (it is accounts payable)
 */
import { describe, it, expect } from "bun:test";
import { extractBalanceSheet } from "../domain/services/financial-reports/balanceSheetExtractor";

// ---------------------------------------------------------------------------
// Test corpus A: HPG-like — code 311 (trade payables) present AND code 319
// (label "Vay và nợ thuê tài chính ngắn hạn") present.
// Expected: shortTermDebt = code-319 borrowings value (38,532), NOT code-311
// accounts payable value (38,729).
// ---------------------------------------------------------------------------
const SAMPLE_HPG_LIKE = `
Báo cáo tình hình tài chính hợp nhất
Tại ngày 31/12/2024
Đơn vị: triệu đồng

TÀI SẢN
A. TÀI SẢN NGẮN HẠN                             85.000.000
B. TÀI SẢN DÀI HẠN                              65.000.000
TỔNG CỘNG TÀI SẢN                              150.000.000

NGUỒN VỐN
A. NỢ PHẢI TRẢ                                  95.000.000
I. Nợ ngắn hạn                                  75.000.000
1. Phải trả người bán ngắn hạn                  38.729.000
2. Vay và nợ thuê tài chính ngắn hạn            38.532.000
3. Người mua trả tiền trước ngắn hạn               500.000
4. Thuế và các khoản phải nộp Nhà nước             800.000
5. Phải trả người lao động                       1.200.000
6. Nợ ngắn hạn khác                             2.000.000
II. Nợ dài hạn                                  20.000.000
1. Vay và nợ thuê tài chính dài hạn             15.000.000
2. Thuế thu nhập hoãn lại phải trả                500.000
3. Nợ dài hạn khác                              4.500.000
B. VỐN CHỦ SỞ HỮU                              55.000.000
I. Vốn góp của chủ sở hữu                       25.000.000
IV. Lợi nhuận sau thuế chưa phân phối           30.000.000
TỔNG CỘNG NGUỒN VỐN                           150.000.000
`;

// ---------------------------------------------------------------------------
// Test corpus B: Clean corporate — code 321 present (FPT-like layout),
// no code 319 ambiguity.
// Expected: shortTermDebt = 14.491.358 from code 321 label match.
// ---------------------------------------------------------------------------
const SAMPLE_CODE321 = `
Báo cáo tình hình tài chính
Tại ngày 31/3/2026
Đơn vị: triệu đồng

TÀI SẢN
A. TÀI SẢN NGẮN HẠN                             50.000.000
B. TÀI SẢN DÀI HẠN                              38.000.000
TỔNG CỘNG TÀI SẢN                               88.000.000

NGUỒN VỐN
A. NỢ PHẢI TRẢ                                   48.000.000
I. Nợ ngắn hạn                                   32.000.000
10. Vay và nợ thuê tài chính ngắn hạn            14.491.358
11. Phải trả người bán ngắn hạn                  10.000.000
12. Người mua trả tiền trước ngắn hạn             2.000.000
13. Thuế và các khoản phải nộp Nhà nước           1.200.000
14. Phải trả người lao động                         800.000
19. Nợ ngắn hạn khác                             3.508.642
II. Nợ dài hạn                                   16.000.000
3. Vay và nợ thuê tài chính dài hạn               1.605.069
4. Thuế thu nhập hoãn lại phải trả                  200.000
5. Nợ dài hạn khác                              14.194.931
B. VỐN CHỦ SỞ HỮU                               40.000.000
I. Vốn góp của chủ sở hữu                        15.000.000
IV. Lợi nhuận sau thuế chưa phân phối            25.000.000
TỔNG CỘNG NGUỒN VỐN                             88.000.000
`;

// ---------------------------------------------------------------------------
// Test corpus C: Issuer where code 319 = "Phải trả ngắn hạn khác"
// (NOT borrowings) and code 321 is absent. shortTermDebt must be 0 (not the
// payables value from code 319) because the label does NOT match /vay ngắn hạn/.
// ---------------------------------------------------------------------------
const SAMPLE_319_PAYABLES_ONLY = `
Báo cáo tình hình tài chính
Tại ngày 31/12/2024
Đơn vị: triệu đồng

TÀI SẢN
A. TÀI SẢN NGẮN HẠN    20.000.000
B. TÀI SẢN DÀI HẠN     10.000.000
TỔNG CỘNG TÀI SẢN      30.000.000

NGUỒN VỐN
A. NỢ PHẢI TRẢ         18.000.000
I. Nợ ngắn hạn         12.000.000
1. Phải trả người bán ngắn hạn   5.000.000
2. Phải trả ngắn hạn khác        7.000.000
II. Nợ dài hạn          6.000.000
B. VỐN CHỦ SỞ HỮU     12.000.000
TỔNG CỘNG NGUỒN VỐN   30.000.000
`;

// ---------------------------------------------------------------------------
// Test corpus D: Code 339 present AND code 334 present — long-term debt must
// prefer code 339 (current standard) over code 334.
// ---------------------------------------------------------------------------
const SAMPLE_339_PREFERRED = `
Báo cáo tình hình tài chính
Tại ngày 31/12/2024
Đơn vị: triệu đồng

TÀI SẢN
A. TÀI SẢN NGẮN HẠN    40.000.000
B. TÀI SẢN DÀI HẠN     30.000.000
TỔNG CỘNG TÀI SẢN      70.000.000

NGUỒN VỐN
A. NỢ PHẢI TRẢ         40.000.000
I. Nợ ngắn hạn         20.000.000
1. Vay và nợ thuê tài chính ngắn hạn  10.000.000
II. Nợ dài hạn         20.000.000
1. Vay và nợ thuê tài chính dài hạn   12.500.000
2. Vay dài hạn                         5.000.000
3. Nợ dài hạn khác                     2.500.000
B. VỐN CHỦ SỞ HỮU     30.000.000
TỔNG CỘNG NGUỒN VỐN   70.000.000
`;

// ---------------------------------------------------------------------------
// Test corpus E: Older VAS layout — code 319 as "Vay ngắn hạn" (borrowings),
// no code 321 present. shortTermDebt must be picked up via label hint.
// ---------------------------------------------------------------------------
const SAMPLE_VNM_LIKE = `
Báo cáo tình hình tài chính
Tại ngày 31/12/2025
Đơn vị: triệu đồng

TÀI SẢN
A. TÀI SẢN NGẮN HẠN    25.000.000
B. TÀI SẢN DÀI HẠN     20.000.000
TỔNG CỘNG TÀI SẢN      45.000.000

NGUỒN VỐN
A. NỢ PHẢI TRẢ         11.000.000
I. Nợ ngắn hạn          9.000.000
Vay ngắn hạn              102.363
Phải trả người bán ngắn hạn  3.000.000
II. Nợ dài hạn          2.000.000
Nợ dài hạn              2.000.000
B. VỐN CHỦ SỞ HỮU     34.000.000
TỔNG CỘNG NGUỒN VỐN   45.000.000
`;

describe("FIX-DE-4 — balanceSheetExtractor: correct VAS debt code mappings", () => {
  // ── Test 1: HPG-like — code 319 (borrowings) preferred over code 311 (payables) ──
  it("HPG-like: picks shortTermDebt from borrowings row (label Vay), NOT from accounts payable row", () => {
    const bs = extractBalanceSheet(SAMPLE_HPG_LIKE);
    // shortTermDebt must be the borrowings value (38,532), NOT the payables value (38,729)
    expect(bs.currentLiabilities.shortTermDebt).toBe(38_532_000);
    // accountsPayable must still be the payables value (38,729)
    expect(bs.currentLiabilities.accountsPayable).toBe(38_729_000);
  });

  // ── Test 2: Clean corporate with code 321 ────────────────────────────────
  it("code 321 corporate: shortTermDebt = 14,491,358 from Vay và nợ thuê tài chính ngắn hạn", () => {
    const bs = extractBalanceSheet(SAMPLE_CODE321);
    expect(bs.currentLiabilities.shortTermDebt).toBe(14_491_358);
    // longTermDebt must prefer code 339 (1,605,069) not a fallback
    expect(bs.longTermLiabilities.longTermDebt).toBe(1_605_069);
  });

  // ── Test 3: Code 319 as "Phải trả ngắn hạn khác" — must NOT map to shortTermDebt ──
  it("code 319 as other-payables only: shortTermDebt = 0 (label hint guards against wrong pick)", () => {
    const bs = extractBalanceSheet(SAMPLE_319_PAYABLES_ONLY);
    // No borrowings label → shortTermDebt must be 0
    expect(bs.currentLiabilities.shortTermDebt).toBe(0);
    // The payables value must still appear in accountsPayable
    expect(bs.currentLiabilities.accountsPayable).toBe(5_000_000);
  });

  // ── Test 4: Code 339 preferred over code 334 for long-term debt ──────────
  it("prefers code 339 (Vay và nợ thuê tài chính dài hạn) over code 334 for longTermDebt", () => {
    const bs = extractBalanceSheet(SAMPLE_339_PREFERRED);
    // Must pick 12,500,000 (from "Vay và nợ thuê tài chính dài hạn"), not 5,000,000 (from "Vay dài hạn")
    expect(bs.longTermLiabilities.longTermDebt).toBe(12_500_000);
    expect(bs.currentLiabilities.shortTermDebt).toBe(10_000_000);
  });

  // ── Test 5: VNM-like — code 319 as "Vay ngắn hạn" (borrowings fallback) ──
  it("VNM-like: shortTermDebt picked via Vay ngắn hạn label (code 319 fallback)", () => {
    const bs = extractBalanceSheet(SAMPLE_VNM_LIKE);
    // 102,363 from "Vay ngắn hạn" — borrowings label, code-319 layout
    expect(bs.currentLiabilities.shortTermDebt).toBe(102_363);
    // accountsPayable = 3,000,000 from "Phải trả người bán ngắn hạn"
    expect(bs.currentLiabilities.accountsPayable).toBe(3_000_000);
  });
});
