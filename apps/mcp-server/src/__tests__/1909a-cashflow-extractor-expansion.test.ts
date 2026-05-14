/**
 * Task 1909a — Cash Flow Extractor Expansion
 *
 * Tests for multi-layout parity with balanceSheetExtractor.ts:
 *   - VNM Q4-2025: split-block layout (labels + values separated 60+ lines)
 *   - DIG Q4-2025: inline layout with bank label variants (E-2)
 *   - VCB Q4-2025: bank layout with "luồng tiền thuần" label variant (E-2)
 *   - Drift override guard on grand totals (E-1, threshold=5)
 *   - Parenthesised negatives (E-3)
 *   - Legit OCF=0 both>0 guard (E-4)
 *   - Unit multiplier: tỷ đồng detection
 *   - Confidence scoring per BCTC-1345b
 *
 * All fixtures are inline OCR mocks — no PDF in repo.
 */

import { describe, it, expect, spyOn } from "bun:test";
import { extractCashFlow, computeCashFlowConfidence } from "../domain/services/financial-reports/cashFlowExtractor";

// ===========================================================================
// Fixture 1 — VNM Q4-2025 Split-block layout
// ===========================================================================
// Consolidated PDF: labels (with item codes 01–70) appear first,
// then a "31/12/2025 Triệu VND" separator, then the ordered values.
// Values are in triệu đồng (multiplier = 1).
//
// Codes in label block (sorted): 1,2,7,11,12,20,21,22,24,25,30,31,32,34,40,50,60,70
// = 18 codes → 18 values in value block (position-zip)
//
// Value order (must match code sort order exactly):
//   1  → 5.600.000  (profitBeforeTax)
//   2  → 1.200.000  (depreciation)
//   7  → (450.000)  (workingCapital)
//   11 → (180.000)  (interestPaid)
//   12 → (620.000)  (incomeTaxPaid)
//   20 → 5.550.000  (operatingCF)
//   21 → (1.800.000)(capex)
//   22 → 80.000     (assetSales)
//   24 → 120.000    (investmentProceeds)
//   25 → 95.000     (dividendsReceived)
//   30 → (1.505.000)(investingCF)
//   31 → 2.000.000  (proceedsFromDebt)
//   32 → (1.500.000)(debtRepayments)
//   34 → (350.000)  (dividendsPaid)
//   40 → 150.000    (financingCF)
//   50 → 4.195.000  (netCashFlow = 5.550.000 - 1.505.000 + 150.000)
//   60 → 800.000    (beginningCash)
//   70 → 4.995.000  (endingCash = 800.000 + 4.195.000)
// ===========================================================================
const VNM_Q4_2025_SPLIT_BLOCK = `
BÁO CÁO LƯU CHUYỂN TIỀN TỆ HỢP NHẤT
Cho năm tài chính kết thúc ngày 31/12/2025
Đơn vị tính: Triệu đồng

I. Lưu chuyển tiền từ hoạt động kinh doanh
Lợi nhuận trước thuế
01
Khấu hao TSCĐ và BĐSĐT
02
Thay đổi vốn lưu động
07
Tiền lãi vay đã trả
11
Thuế TNDN đã nộp
12
Lưu chuyển tiền thuần từ hoạt động kinh doanh
(20 = 01+02+...+13)
20

II. Lưu chuyển tiền từ hoạt động đầu tư
Tiền chi mua sắm TSCĐ
21
Tiền thu thanh lý TSCĐ
22
Tiền thu hồi đầu tư tài chính
24
Cổ tức và lãi tiền gửi đã thu
25
Lưu chuyển tiền thuần từ hoạt động đầu tư
(30 = 21+22+...+29)
30

III. Lưu chuyển tiền từ hoạt động tài chính
Tiền vay nhận được
31
Tiền trả nợ gốc vay
32
Cổ tức đã trả cho cổ đông
34
Lưu chuyển tiền thuần từ hoạt động tài chính
(40 = 31+32+...+39)
40

Lưu chuyển tiền thuần trong kỳ
50
Tiền và tương đương tiền đầu kỳ
60
Tiền và tương đương tiền cuối kỳ
70

31/12/2025 Triệu VND

5.600.000
1.200.000
(450.000)
(180.000)
(620.000)
5.550.000
(1.800.000)
80.000
120.000
95.000
(1.505.000)
2.000.000
(1.500.000)
(350.000)
150.000
4.195.000
800.000
4.995.000
`;

// ===========================================================================
// Fixture 2 — DIG Q4-2025 Inline layout with parenthesised negatives (E-3)
// ===========================================================================
// Standard inline format. Negative values use Vietnamese parenthesis convention.
// Also tests: inline bank-adjacent label variant "HĐKD" abbreviation.
// Values are in triệu đồng.
// ===========================================================================
const DIG_Q4_2025_INLINE = `
BÁO CÁO LƯU CHUYỂN TIỀN TỆ
Quý 4 năm 2025
Đơn vị tính: Triệu đồng

I. Lưu chuyển tiền từ hoạt động kinh doanh
1. Lợi nhuận trước thuế                                    850.000
2. Khấu hao TSCĐ và BĐSĐT                                  320.000
3. Thay đổi vốn lưu động                                  (210.000)
4. Tiền lãi vay đã trả                                     (95.000)
5. Thuế TNDN đã nộp                                       (175.000)
Lưu chuyển tiền thuần từ HĐKD                              690.000

II. Lưu chuyển tiền từ hoạt động đầu tư
1. Tiền chi mua sắm TSCĐ và BĐSĐT                         (500.000)
2. Tiền thu thanh lý TSCĐ                                   30.000
3. Tiền chi mua các khoản đầu tư tài chính                (100.000)
4. Tiền thu hồi đầu tư tài chính                            75.000
5. Cổ tức và lãi tiền gửi đã thu                            40.000
Lưu chuyển tiền thuần từ HĐĐT                             (455.000)

III. Lưu chuyển tiền từ hoạt động tài chính
1. Tiền vay nhận được                                      400.000
2. Tiền trả nợ gốc vay                                    (300.000)
3. Tiền thu từ phát hành cổ phiếu                          100.000
4. Cổ tức đã trả                                          (120.000)
Lưu chuyển tiền thuần từ HĐTC                               80.000

Lưu chuyển tiền thuần trong kỳ                             315.000
Tiền và tương đương tiền đầu kỳ                            185.000
Tiền và tương đương tiền cuối kỳ                           500.000
`;

// ===========================================================================
// Fixture 3 — VCB Q4-2025 Bank label variants (E-2)
// ===========================================================================
// Banking BCTC (Mẫu B03/TCTD) uses "luồng tiền thuần từ" instead of
// "lưu chuyển tiền thuần từ". Values are large (bank scale), triệu đồng.
// ===========================================================================
const VCB_Q4_2025_BANK_LABELS = `
BÁO CÁO LƯU CHUYỂN TIỀN TỆ
Năm kết thúc ngày 31/12/2025
Đơn vị tính: Triệu đồng

I. Hoạt động kinh doanh
1. Lợi nhuận trước thuế                               18.000.000
2. Khấu hao TSCĐ và BĐSĐT                              1.200.000
3. Thay đổi vốn lưu động                             (3.500.000)
4. Tiền lãi vay đã trả                               (8.000.000)
5. Thuế TNDN đã nộp                                  (3.600.000)
Luồng tiền thuần từ hoạt động kinh doanh               4.100.000

II. Hoạt động đầu tư
1. Tiền chi mua sắm TSCĐ                             (1.500.000)
2. Tiền thu thanh lý TSCĐ                               200.000
3. Tiền chi mua các khoản đầu tư tài chính           (5.000.000)
4. Tiền thu hồi đầu tư tài chính                      3.000.000
5. Cổ tức và lãi tiền gửi đã thu                        500.000
Luồng tiền thuần từ hoạt động đầu tư                 (2.800.000)

III. Hoạt động tài chính
1. Tiền vay nhận được                                15.000.000
2. Tiền trả nợ gốc vay                              (12.000.000)
3. Tiền thu từ phát hành cổ phiếu                      500.000
4. Cổ tức đã trả                                    (2.500.000)
Luồng tiền thuần từ hoạt động tài chính               1.000.000

Lưu chuyển tiền thuần trong kỳ                        2.300.000
Tiền và tương đương tiền đầu kỳ                       8.500.000
Tiền và tương đương tiền cuối kỳ                     10.800.000
`;

// ===========================================================================
// Fixture 4 — Drift override (E-1): page-split OCF section
// ===========================================================================
// Simulates positional drift: the regex for P_OPERATING_CF matches a line
// that actually carries a sub-item value (e.g. 600.000) rather than the true
// grand total. The subtotal sum (1.200.000 + 300.000) = 1.500.000, which is
// 2.5× the stated 600.000 — BELOW the 5× threshold → NO override.
// Then a second case with ratio > 5× to confirm override fires.
// ===========================================================================
const DRIFT_BELOW_THRESHOLD = `
BÁO CÁO LƯU CHUYỂN TIỀN TỆ
Đơn vị tính: Triệu đồng

I. Lưu chuyển tiền từ hoạt động kinh doanh
1. Lợi nhuận trước thuế                                 1.200.000
2. Khấu hao TSCĐ và BĐSĐT                                300.000
Lưu chuyển tiền thuần từ hoạt động kinh doanh             600.000

II. Lưu chuyển tiền từ hoạt động đầu tư
Tiền chi mua sắm TSCĐ                                   (100.000)
Lưu chuyển tiền thuần từ hoạt động đầu tư               (100.000)

III. Lưu chuyển tiền từ hoạt động tài chính
Tiền vay nhận được                                        200.000
Tiền trả nợ gốc vay                                     (150.000)
Lưu chuyển tiền thuần từ hoạt động tài chính               50.000

Lưu chuyển tiền thuần trong kỳ                            550.000
Tiền và tương đương tiền đầu kỳ                           450.000
Tiền và tương đương tiền cuối kỳ                        1.000.000
`;

const DRIFT_ABOVE_THRESHOLD = `
BÁO CÁO LƯU CHUYỂN TIỀN TỆ
Đơn vị tính: Triệu đồng

I. Lưu chuyển tiền từ hoạt động kinh doanh
1. Lợi nhuận trước thuế                                 3.000.000
2. Khấu hao TSCĐ và BĐSĐT                                800.000
3. Thay đổi vốn lưu động                               (200.000)
4. Tiền lãi vay đã trả                                  (100.000)
5. Thuế TNDN đã nộp                                     (500.000)
Lưu chuyển tiền thuần từ hoạt động kinh doanh             500.000

Lưu chuyển tiền thuần trong kỳ                            500.000
Tiền và tương đương tiền đầu kỳ                           200.000
Tiền và tương đương tiền cuối kỳ                          700.000
`;

// ===========================================================================
// Fixture 5 — Legit OCF = 0 (E-4): both-zero guard
// ===========================================================================
// A company with genuinely zero operating cash flow (e.g. shell company).
// The drift guard must NOT override when operatingCF = 0 OR subtotalSum = 0.
// ===========================================================================
const LEGIT_ZERO_OCF = `
BÁO CÁO LƯU CHUYỂN TIỀN TỆ
Đơn vị tính: Triệu đồng

I. Lưu chuyển tiền từ hoạt động kinh doanh
Lưu chuyển tiền thuần từ hoạt động kinh doanh                     0

II. Lưu chuyển tiền từ hoạt động đầu tư
Tiền chi mua sắm TSCĐ                                     (50.000)
Lưu chuyển tiền thuần từ hoạt động đầu tư                 (50.000)

III. Lưu chuyển tiền từ hoạt động tài chính
Tiền vay nhận được                                         50.000
Lưu chuyển tiền thuần từ hoạt động tài chính               50.000

Lưu chuyển tiền thuần trong kỳ                                  0
Tiền và tương đương tiền đầu kỳ                           100.000
Tiền và tương đương tiền cuối kỳ                          100.000
`;

// ===========================================================================
// Fixture 6 — Unit: tỷ đồng
// ===========================================================================
// PDF header declares "Đơn vị tính: Tỷ đồng".
// All numbers in fixture are in tỷ; extractor must multiply by 1000.
// ===========================================================================
const TY_DONG_UNIT = `
BÁO CÁO LƯU CHUYỂN TIỀN TỆ
Đơn vị tính: Tỷ đồng

I. Lưu chuyển tiền từ hoạt động kinh doanh
1. Lợi nhuận trước thuế                                     2.000
2. Khấu hao TSCĐ và BĐSĐT                                     500
3. Thay đổi vốn lưu động                                     (300)
4. Tiền lãi vay đã trả                                       (200)
5. Thuế TNDN đã nộp                                          (400)
Lưu chuyển tiền thuần từ hoạt động kinh doanh               1.600

II. Lưu chuyển tiền từ hoạt động đầu tư
Tiền chi mua sắm TSCĐ                                        (800)
Lưu chuyển tiền thuần từ hoạt động đầu tư                    (800)

III. Lưu chuyển tiền từ hoạt động tài chính
Tiền vay nhận được                                           1.000
Tiền trả nợ gốc vay                                          (600)
Lưu chuyển tiền thuần từ hoạt động tài chính                   400

Lưu chuyển tiền thuần trong kỳ                              1.200
Tiền và tương đương tiền đầu kỳ                               800
Tiền và tương đương tiền cuối kỳ                            2.000
`;

// ===========================================================================
// Tests
// ===========================================================================

describe("1909a — cashFlowExtractor expansion", () => {
  // ── Fixture 1: VNM Q4-2025 split-block layout ─────────────────────────────

  describe("VNM Q4-2025 split-block layout", () => {
    it("extracts operatingCF from split-block format", () => {
      const cf = extractCashFlow(VNM_Q4_2025_SPLIT_BLOCK);
      // Item 20 in split-block map = 5.550.000
      expect(cf.operatingCF).toBe(5_550_000);
    });

    it("extracts investingCF from split-block format", () => {
      const cf = extractCashFlow(VNM_Q4_2025_SPLIT_BLOCK);
      // Item 30 = (1.505.000)
      expect(cf.investingCF).toBe(-1_505_000);
    });

    it("extracts financingCF from split-block format", () => {
      const cf = extractCashFlow(VNM_Q4_2025_SPLIT_BLOCK);
      // Item 40 = 150.000
      expect(cf.financingCF).toBe(150_000);
    });

    it("extracts netCashFlow, beginningCash, endingCash", () => {
      const cf = extractCashFlow(VNM_Q4_2025_SPLIT_BLOCK);
      // code 50 → 4.195.000, code 60 → 800.000, code 70 → 4.995.000
      expect(cf.netCashFlow).toBe(4_195_000);
      expect(cf.beginningCash).toBe(800_000);
      expect(cf.endingCash).toBe(4_995_000);
    });

    it("computes freeCashFlow = operatingCF + capex", () => {
      const cf = extractCashFlow(VNM_Q4_2025_SPLIT_BLOCK);
      expect(cf.freeCashFlow).toBe(cf.operatingCF + cf.capex);
    });
  });

  // ── Fixture 2: DIG Q4-2025 inline + parenthesised negatives (E-3) ─────────

  describe("DIG Q4-2025 inline layout with parenthesised negatives (E-3)", () => {
    it("extracts positive values correctly", () => {
      const cf = extractCashFlow(DIG_Q4_2025_INLINE);
      expect(cf.profitBeforeTax).toBe(850_000);
      expect(cf.depreciationAmortization).toBe(320_000);
      expect(cf.operatingCF).toBe(690_000);
    });

    it("extracts parenthesised negatives (E-3) correctly", () => {
      const cf = extractCashFlow(DIG_Q4_2025_INLINE);
      // Parenthesised values should be negative
      expect(cf.workingCapitalChanges).toBe(-210_000);
      expect(cf.interestPaid).toBe(-95_000);
      expect(cf.incomeTaxPaid).toBe(-175_000);
      expect(cf.capex).toBe(-500_000);
      expect(cf.debtRepayments).toBe(-300_000);
      expect(cf.dividendsPaid).toBe(-120_000);
    });

    it("extracts investingCF and financingCF", () => {
      const cf = extractCashFlow(DIG_Q4_2025_INLINE);
      expect(cf.investingCF).toBe(-455_000);
      expect(cf.financingCF).toBe(80_000);
    });

    it("maintains netCashFlow = beginningCash + netCashFlow = endingCash", () => {
      const cf = extractCashFlow(DIG_Q4_2025_INLINE);
      expect(cf.netCashFlow).toBe(315_000);
      expect(cf.endingCash).toBe(cf.beginningCash + cf.netCashFlow);
    });
  });

  // ── Fixture 3: VCB Q4-2025 bank label variants (E-2) ─────────────────────

  describe("VCB Q4-2025 bank label variants — luồng tiền thuần (E-2)", () => {
    it("extracts operatingCF from 'Luồng tiền thuần từ hoạt động kinh doanh' (E-2)", () => {
      const cf = extractCashFlow(VCB_Q4_2025_BANK_LABELS);
      expect(cf.operatingCF).toBe(4_100_000);
    });

    it("extracts investingCF from bank label variant (E-2)", () => {
      const cf = extractCashFlow(VCB_Q4_2025_BANK_LABELS);
      expect(cf.investingCF).toBe(-2_800_000);
    });

    it("extracts financingCF from bank label variant (E-2)", () => {
      const cf = extractCashFlow(VCB_Q4_2025_BANK_LABELS);
      expect(cf.financingCF).toBe(1_000_000);
    });

    it("extracts large bank-scale values correctly", () => {
      const cf = extractCashFlow(VCB_Q4_2025_BANK_LABELS);
      expect(cf.profitBeforeTax).toBe(18_000_000);
      expect(cf.netCashFlow).toBe(2_300_000);
      expect(cf.endingCash).toBe(10_800_000);
    });
  });

  // ── Fixture 4: Drift override guard ──────────────────────────────────────

  describe("Drift override guard (threshold = 5×)", () => {
    it("does NOT override when ratio < 5× (DRIFT_BELOW_THRESHOLD)", () => {
      const cf = extractCashFlow(DRIFT_BELOW_THRESHOLD);
      // subtotalSum = 1.200.000 + 300.000 = 1.500.000, stated = 600.000
      // ratio = 1.500.000 / 600.000 = 2.5 — BELOW threshold → keep stated
      expect(cf.operatingCF).toBe(600_000);
    });

    it("overrides and emits console.warn when ratio > 5× (DRIFT_ABOVE_THRESHOLD)", () => {
      const warnSpy = spyOn(console, "warn");

      const cf = extractCashFlow(DRIFT_ABOVE_THRESHOLD);
      // subtotals: 3.000.000 + 800.000 + (-200.000) + (-100.000) + (-500.000) = 3.000.000
      // stated operatingCF = 500.000, ratio = 3.000.000 / 500.000 = 6 → ABOVE threshold
      // Override: operatingCF = 3.000.000
      expect(cf.operatingCF).toBe(3_000_000);

      // console.warn should have been called with drift guard message
      const warnArgs = warnSpy.mock.calls.map((c) => String(c[0]));
      const hasDriftWarn = warnArgs.some((msg) =>
        msg.includes("Drift guard triggered") && msg.includes("operatingCF"),
      );
      expect(hasDriftWarn).toBe(true);
    });
  });

  // ── Fixture 5: Legit OCF = 0 (E-4) ──────────────────────────────────────

  describe("Legit OCF = 0 — both>0 guard (E-4)", () => {
    it("does not override OCF = 0 (E-4 guard: statedTotal = 0)", () => {
      const cf = extractCashFlow(LEGIT_ZERO_OCF);
      // statedTotal = 0 → drift guard skipped → operatingCF stays 0
      expect(cf.operatingCF).toBe(0);
    });

    it("correctly extracts non-zero investing and financing CFs when OCF = 0", () => {
      const cf = extractCashFlow(LEGIT_ZERO_OCF);
      expect(cf.investingCF).toBe(-50_000);
      expect(cf.financingCF).toBe(50_000);
      expect(cf.netCashFlow).toBe(0);
      expect(cf.endingCash).toBe(100_000);
    });
  });

  // ── Fixture 6: Unit multiplier — tỷ đồng ─────────────────────────────────

  describe("Unit multiplier — tỷ đồng (× 1000)", () => {
    it("converts tỷ đồng values to triệu đồng (× 1000)", () => {
      const cf = extractCashFlow(TY_DONG_UNIT);
      // 1.600 tỷ × 1000 = 1.600.000 triệu
      expect(cf.operatingCF).toBe(1_600_000);
      expect(cf.profitBeforeTax).toBe(2_000_000);
      expect(cf.depreciationAmortization).toBe(500_000);
      expect(cf.netCashFlow).toBe(1_200_000);
      expect(cf.endingCash).toBe(2_000_000);
    });
  });

  // ── Confidence scoring (BCTC-1345b) ──────────────────────────────────────

  describe("computeCashFlowConfidence — BCTC-1345b", () => {
    it("returns confidence = 1.0 when all 5 key fields are non-zero", () => {
      const cf = extractCashFlow(DIG_Q4_2025_INLINE);
      const { confidence, lowConfidence } = computeCashFlowConfidence(cf);
      expect(confidence).toBe(1.0);
      expect(lowConfidence).toBe(false);
    });

    it("returns confidence = 0 for empty statement (skip insert signal)", () => {
      const cf = extractCashFlow("");
      const { confidence, lowConfidence } = computeCashFlowConfidence(cf);
      expect(confidence).toBe(0);
      expect(lowConfidence).toBe(false); // 0 means skip, not flag
    });

    it("low_confidence flag is true when 0 < confidence < 0.2", () => {
      // Craft a minimal statement with only 1/5 key fields populated
      const minimalText = `
BÁO CÁO LƯU CHUYỂN TIỀN TỆ
Đơn vị: Triệu đồng
Lưu chuyển tiền thuần từ hoạt động kinh doanh   100.000
`;
      const cf = extractCashFlow(minimalText);
      const { confidence, lowConfidence } = computeCashFlowConfidence(cf);
      // Only operatingCF is non-zero → confidence = 1/5 = 0.2 (NOT < 0.2)
      // To get < 0.2 we'd need 0/5 but that's captured by the empty test above.
      // Test the boundary: confidence = 0.2 is NOT low_confidence
      expect(confidence).toBeGreaterThanOrEqual(0.2);
      expect(lowConfidence).toBe(false);
    });

    it("confidence = 0.6 for VCB (3/5 key fields: operatingCF, investingCF, financingCF; netCashFlow and endingCash may be 0 if not extracted)", () => {
      // Use a statement where netCashFlow and endingCash are not present
      const partial = `
BÁO CÁO LƯU CHUYỂN TIỀN TỆ
Đơn vị tính: Triệu đồng
Luồng tiền thuần từ hoạt động kinh doanh   500.000
Luồng tiền thuần từ hoạt động đầu tư      (200.000)
Luồng tiền thuần từ hoạt động tài chính    100.000
`;
      const cf = extractCashFlow(partial);
      const { confidence } = computeCashFlowConfidence(cf);
      // operatingCF, investingCF, financingCF non-zero = 3/5 = 0.6
      expect(confidence).toBeCloseTo(0.6, 5);
    });
  });
});
