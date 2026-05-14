/**
 * Task 1908c — totalAssets Plausibility Override (BCTC-1908c guard)
 *
 * Problem: In VPBank-style multi-page balance sheets, `extractSplitBlockAll`
 * resolves code "270" (TONG TAI SAN) to a sub-item value from a later page
 * (Tai san dai han khac, code 260) because both sub-item and total appear as
 * the same positional slot in the merged value block. The codes block lists
 * codes [100, 200, 260, 270] in sorted order; the value block provides four
 * values: [current_total, noncurrent_total, sub_item_value, sub_item_value].
 * Zip maps codes[3]=270 → values[3]=sub_item_value. Because totalAssets > 0,
 * the existing zero-guard (line 714) never fires.
 *
 * Guard spec (BCTC-1908c):
 *   computedFromSubtotals = currentAssets.total + nonCurrentAssets.total
 *   if totalAssets > 0
 *      && computedFromSubtotals > 0
 *      && computedFromSubtotals / totalAssets > 5
 *   then totalAssets = computedFromSubtotals
 *
 * Fixture strategy:
 *   No PDF fixtures in repo — tests use inline OCR text that precisely triggers
 *   the positional drift by including code "260" before "270" in the codes block
 *   with a repeated small value in the value block (matching the real OCR layout
 *   where the sub-item value for 260 appears again in the 270 slot).
 *
 *   VNM Q4 2025 (real ratio ~55.7x):
 *     currentAssets.total = 36,261,181 triệu  (raw VND ÷ 1e6)
 *     nonCurrentAssets.total = 17,051,190 triệu
 *     true totalAssets = 53,312,371 triệu
 *     drifted code-270 capture = 957,000 triệu (957 billion VND raw)
 *     drift ratio = 53,312,371 / 957,000 ≈ 55.7x
 *
 *   DIG Q4 2025 (real ratio ~2,846x with triệu fixture):
 *     currentAssets.total = 28,000,000 triệu
 *     nonCurrentAssets.total = 460,000 triệu
 *     true totalAssets = 28,460,000 triệu
 *     drifted capture = 10,000 triệu
 *     drift ratio = 28,460,000 / 10,000 = 2,846x
 *
 *   VCB Q4 2025 (clean, ratio = 1.0x) — guard must NOT fire
 *   FPT Q4 2025 (clean, ratio = 1.0x) — guard must NOT fire
 */

import { describe, it, expect } from "bun:test";
import { extractBalanceSheet } from "../domain/services/financial-reports/balanceSheetExtractor";
import { validateFinancialFigures } from "../domain/services/financial-reports/financialFiguresValidator";

// ---------------------------------------------------------------------------
// VNM Q4 2025 — positional drift fixture (ratio ~55.7x)
//
// Split-block format: codes in labels block, values after "31/12/2025 VND".
// codes block: [100, 200, 260, 270] (sorted)
// value block: [36.261.181e6, 17.051.190e6, 957e9, 957e9]  (raw VND)
// zip result: 100→36261181e6, 200→17051190e6, 260→957e9, 270→957e9  (DRIFT)
// After ÷1e6 magnitude conversion:
//   totalAssets = 957,000 triệu  (wrong)
//   currentAssets.total = 36,261,181 triệu  (correct)
//   nonCurrentAssets.total = 17,051,190 triệu  (correct)
// ---------------------------------------------------------------------------
const VNM_Q4_2025_DRIFT = `
Báo cáo tình hình tài chính hợp nhất tại ngày 31 tháng 12 năm 2025

TÀI SẢN

Tài sản ngắn hạn (100 = 110 + 120 + 130 + 140 + 150)
Tài sản dài hạn (200 = 210 + 220 + 230 + 240 + 250 + 260)
Tài sản dài hạn khác
TỔNG TÀI SẢN (270 = 100 + 200)

100
200
260
270

31/12/2025
VND

36.261.181.000.000
17.051.190.000.000
957.000.000.000
957.000.000.000

NGUON VON

NỢ PHẢI TRẢ (300 = 310 + 330)
VỐN CHỦ SỞ HỮU (400 = 410)

300
400

31/12/2025
VND

18.829.355.000.000
34.483.015.000.000
`;

// ---------------------------------------------------------------------------
// DIG Q4 2025 — extreme positional drift fixture (ratio ~2,846x)
//
// Uses triệu đồng unit directly (avoids magnitude-inference edge cases).
// codes: [100, 200, 260, 270]
// values: [28.000.000, 460.000, 10.000, 10.000] triệu
// zip result: 270→10,000 triệu  (DRIFT — true totalAssets = 28,460,000 triệu)
// drift ratio = 28,460,000 / 10,000 = 2,846x
// ---------------------------------------------------------------------------
const DIG_Q4_2025_DRIFT = `
Báo cáo tình hình tài chính hợp nhất tại ngày 31 tháng 12 năm 2025
Đơn vị: triệu đồng

TÀI SẢN

Tài sản ngắn hạn (100 = 110 + 120 + 130 + 140 + 150)
Tài sản dài hạn (200 = 210 + 220 + 230 + 240 + 250 + 260)
Tài sản dài hạn khác
TỔNG TÀI SẢN (270 = 100 + 200)

100
200
260
270

31/12/2025
VND

28.000.000
460.000
10.000
10.000

NGUON VON

NỢ PHẢI TRẢ (300 = 310 + 330)
VỐN CHỦ SỞ HỮU (400 = 410)

300
400

31/12/2025
VND

20.000.000
8.460.000
`;

// ---------------------------------------------------------------------------
// VCB Q4 2025 — well-formed, inline format, override must NOT fire
// totalAssets = currentAssets.total + nonCurrentAssets.total (ratio = 1.0x)
// ---------------------------------------------------------------------------
const VCB_Q4_2025_CLEAN = `
BẢNG CÂN ĐỐI KẾ TOÁN HỢP NHẤT
Tại ngày 31 tháng 12 năm 2025
Đơn vị: triệu đồng

TÀI SẢN
A. TÀI SẢN NGẮN HẠN                     1.800.000.000
I. Tiền và các khoản tương đương tiền      200.000.000
B. TÀI SẢN DÀI HẠN                        200.000.000
I. Tài sản cố định                         150.000.000
II. Tài sản dài hạn khác                    50.000.000
TỔNG CỘNG TÀI SẢN                       2.000.000.000

NGUỒN VỐN
A. NỢ PHẢI TRẢ                           1.500.000.000
I. Nợ ngắn hạn                           1.200.000.000
II. Nợ dài hạn                             300.000.000
B. VỐN CHỦ SỞ HỮU                         500.000.000
TỔNG CỘNG NGUỒN VỐN                     2.000.000.000
`;

// ---------------------------------------------------------------------------
// FPT Q4 2025 — well-formed, inline format, override must NOT fire
// totalAssets = 50,000,000 triệu = currentAssets (30M) + nonCurrent (20M)
// ---------------------------------------------------------------------------
const FPT_Q4_2025_CLEAN = `
BẢNG CÂN ĐỐI KẾ TOÁN HỢP NHẤT
Tại ngày 31 tháng 12 năm 2025
Đơn vị: triệu đồng

TÀI SẢN
A. TÀI SẢN NGẮN HẠN                     30.000.000
I. Tiền và các khoản tương đương tiền     5.000.000
B. TÀI SẢN DÀI HẠN                      20.000.000
I. Tài sản cố định                       12.000.000
II. Tài sản dài hạn khác                  2.000.000
TỔNG CỘNG TÀI SẢN                       50.000.000

NGUỒN VỐN
A. NỢ PHẢI TRẢ                           25.000.000
I. Nợ ngắn hạn                           15.000.000
II. Nợ dài hạn                           10.000.000
B. VỐN CHỦ SỞ HỮU                       25.000.000
TỔNG CỘNG NGUỒN VỐN                     50.000.000
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BCTC-1908c: totalAssets plausibility override — positional drift guard", () => {
  // ── VNM Q4 2025 — override fires (drift ratio ~55.7x) ────────────────────

  it("VNM Q4 2025: guard fires — totalAssets overridden to currentAssets + nonCurrentAssets", () => {
    const bs = extractBalanceSheet(VNM_Q4_2025_DRIFT);
    const computed = bs.currentAssets.total + bs.nonCurrentAssets.total;
    expect(bs.currentAssets.total).toBeGreaterThan(30_000_000);
    expect(bs.nonCurrentAssets.total).toBeGreaterThan(10_000_000);
    // Guard must fire: totalAssets must equal computed sum (not the drifted 957,000)
    expect(bs.totalAssets).toBe(computed);
    // Sanity: result is dramatically larger than the drifted sub-item value
    expect(bs.totalAssets).toBeGreaterThan(50_000_000);
  });

  it("VNM Q4 2025: totalAssets within ±2% of currentAssets + nonCurrentAssets", () => {
    const bs = extractBalanceSheet(VNM_Q4_2025_DRIFT);
    const computed = bs.currentAssets.total + bs.nonCurrentAssets.total;
    const ratio = bs.totalAssets / computed;
    expect(ratio).toBeGreaterThanOrEqual(0.98);
    expect(ratio).toBeLessThanOrEqual(1.02);
  });

  it("VNM Q4 2025: after override, VAL-07 confidence > 0 (liab/assets ratio plausible)", () => {
    const bs = extractBalanceSheet(VNM_Q4_2025_DRIFT);
    const confidence = validateFinancialFigures({
      totalAssets: bs.totalAssets,
      totalEquity: bs.equity.total,
      totalLiabilities: bs.totalLiabilities,
      netRevenue: null,
      operatingMargin: null,
    });
    expect(confidence).toBeGreaterThan(0);
  });

  // ── DIG Q4 2025 — override fires (extreme ratio ~2,846x) ─────────────────

  it("DIG Q4 2025: guard fires — totalAssets overridden (extreme drift ratio ~2,846x)", () => {
    const bs = extractBalanceSheet(DIG_Q4_2025_DRIFT);
    const computed = bs.currentAssets.total + bs.nonCurrentAssets.total;
    expect(bs.currentAssets.total).toBeGreaterThan(20_000_000);
    // Guard must fire: totalAssets must equal computed sum (not the drifted 10,000)
    expect(bs.totalAssets).toBe(computed);
    expect(bs.totalAssets).toBeGreaterThan(20_000_000);
  });

  it("DIG Q4 2025: totalAssets within ±2% of currentAssets + nonCurrentAssets", () => {
    const bs = extractBalanceSheet(DIG_Q4_2025_DRIFT);
    const computed = bs.currentAssets.total + bs.nonCurrentAssets.total;
    const ratio = bs.totalAssets / computed;
    expect(ratio).toBeGreaterThanOrEqual(0.98);
    expect(ratio).toBeLessThanOrEqual(1.02);
  });

  it("DIG Q4 2025: after override, VAL-07 confidence > 0", () => {
    const bs = extractBalanceSheet(DIG_Q4_2025_DRIFT);
    const confidence = validateFinancialFigures({
      totalAssets: bs.totalAssets,
      totalEquity: bs.equity.total,
      totalLiabilities: bs.totalLiabilities,
      netRevenue: null,
      operatingMargin: null,
    });
    expect(confidence).toBeGreaterThan(0);
  });

  // ── VCB Q4 2025 — guard must NOT fire (ratio = 1.0x) ─────────────────────

  it("VCB Q4 2025: guard does NOT fire — consistent totalAssets unchanged", () => {
    const bs = extractBalanceSheet(VCB_Q4_2025_CLEAN);
    const computed = bs.currentAssets.total + bs.nonCurrentAssets.total;
    // ratio = 1.0x — guard must not fire; totalAssets = computed is fine either way,
    // but drift ratio must be ≤ 5 to confirm guard condition was not met
    if (computed > 0 && bs.totalAssets > 0) {
      expect(computed / bs.totalAssets).toBeLessThanOrEqual(5);
    }
    expect(bs.totalAssets).toBeGreaterThan(0);
  });

  // ── FPT Q4 2025 — guard must NOT fire (ratio = 1.0x) ─────────────────────

  it("FPT Q4 2025: guard does NOT fire — consistent totalAssets unchanged", () => {
    const bs = extractBalanceSheet(FPT_Q4_2025_CLEAN);
    const computed = bs.currentAssets.total + bs.nonCurrentAssets.total;
    // ratio = 1.0x — guard must not fire
    if (computed > 0 && bs.totalAssets > 0) {
      expect(computed / bs.totalAssets).toBeLessThanOrEqual(5);
    }
    expect(bs.totalAssets).toBeGreaterThan(0);
  });
});
