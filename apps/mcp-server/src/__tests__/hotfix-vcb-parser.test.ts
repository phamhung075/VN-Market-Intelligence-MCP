/**
 * Hotfix — VCB bank BCTC parser bugs
 *
 * Bug 1: No unit header found — VCB uses "Đơn vị: triệu đồng" format
 *   (bare colon after "vị", no "tính") OR parenthesised form
 *   "(Đơn vị tính: triệu đồng)". The loose fallback was being short-circuited
 *   by P_DONG_ONLY matching "VND" column headers before triệu was found.
 *
 * Bug 2: Years parsed as Liabilities/Equity values.
 *   Numbers in range 1990–2030 are calendar years (column headers like
 *   "2017", "2025") and must be excluded from financial value extraction.
 */
import { describe, it, expect } from "bun:test";
import { extractBalanceSheet } from "../domain/services/financial-reports/balanceSheetExtractor";

// ---------------------------------------------------------------------------
// Bug 1 fixtures — VCB bank unit header variants
// ---------------------------------------------------------------------------

// Variant A: "Đơn vị: triệu đồng" (no "tính", bare colon)
const VCB_UNIT_BARE_COLON = `
BẢNG CÂN ĐỐI KẾ TOÁN HỢP NHẤT
Tại ngày 31 tháng 12 năm 2025
Đơn vị: triệu đồng

TÀI SẢN
A. TÀI SẢN NGẮN HẠN                              8.000.000
I. Tiền và các khoản tương đương tiền              3.000.000
B. TÀI SẢN DÀI HẠN                               2.000.000
II. Tài sản cố định                                1.500.000
TỔNG CỘNG TÀI SẢN                               10.000.000

NGUỒN VỐN
A. NỢ PHẢI TRẢ                                    7.000.000
I. Nợ ngắn hạn                                    4.000.000
II. Nợ dài hạn                                    3.000.000
B. VỐN CHỦ SỞ HỮU                                3.000.000
I. Vốn góp của chủ sở hữu                         2.000.000
TỔNG CỘNG NGUỒN VỐN                             10.000.000
`;

// Variant B: parenthesised "(Đơn vị tính: triệu đồng)"
// P_UNIT_TRIEU already handles the parenthesised form because it doesn't anchor
// at line start. This test confirms it.
const VCB_UNIT_PARENTHESISED = `
BẢNG CÂN ĐỐI KẾ TOÁN HỢP NHẤT
(Đơn vị tính: triệu đồng)

TÀI SẢN
A. TÀI SẢN NGẮN HẠN                              8.000.000
I. Tiền và các khoản tương đương tiền              3.000.000
B. TÀI SẢN DÀI HẠN                               2.000.000
II. Tài sản cố định                                1.500.000
TỔNG CỘNG TÀI SẢN                               10.000.000

NGUỒN VỐN
A. NỢ PHẢI TRẢ                                    7.000.000
I. Nợ ngắn hạn                                    4.000.000
II. Nợ dài hạn                                    3.000.000
B. VỐN CHỦ SỞ HỮU                                3.000.000
I. Vốn góp của chủ sở hữu                         2.000.000
TỔNG CỘNG NGUỒN VỐN                             10.000.000
`;

// Variant C: VCB with "VND" column headers that previously triggered P_DONG_ONLY
// before triệu was detected (the root cause of Bug 1).
const VCB_WITH_VND_COLUMN_HEADERS = `
BẢNG CÂN ĐỐI KẾ TOÁN HỢP NHẤT
Tại ngày 31 tháng 12 năm 2025
Đơn vị: triệu đồng
                                              31/12/2025    31/12/2024
                                                   VND           VND

TÀI SẢN
A. TÀI SẢN NGẮN HẠN                         35.202.546    32.000.000
I. Tiền và các khoản tương đương tiền         8.000.000     7.500.000
B. TÀI SẢN DÀI HẠN                          12.000.000    11.000.000
II. Tài sản cố định                           5.000.000     4.800.000
TỔNG CỘNG TÀI SẢN                           47.202.546    43.000.000

NGUỒN VỐN
A. NỢ PHẢI TRẢ                               32.000.000    29.000.000
I. Nợ ngắn hạn                               18.000.000    16.000.000
II. Nợ dài hạn                               14.000.000    13.000.000
B. VỐN CHỦ SỞ HỮU                           15.202.546    14.000.000
I. Vốn góp của chủ sở hữu                    10.000.000     9.500.000
TỔNG CỘNG NGUỒN VỐN                         47.202.546    43.000.000
`;

// ---------------------------------------------------------------------------
// Bug 2 fixture — years captured as financial values
// Simulates the log: Assets (35.202.546) ≠ Liabilities (2.017) + Equity (2.025)
// where 2.017 and 2.025 are years 2017 and 2025 from a column header row.
// ---------------------------------------------------------------------------

const VCB_YEAR_IN_VALUE_POSITION = `
BẢNG CÂN ĐỐI KẾ TOÁN HỢP NHẤT
Đơn vị: triệu đồng
                                              31/12/2025    31/12/2017

TÀI SẢN
A. TÀI SẢN NGẮN HẠN                         35.202.546    28.000.000
I. Tiền và các khoản tương đương tiền         8.000.000     6.500.000
B. TÀI SẢN DÀI HẠN                          12.000.000    10.000.000
II. Tài sản cố định                           5.000.000     4.000.000
TỔNG CỘNG TÀI SẢN                           47.202.546    38.000.000

NGUỒN VỐN
A. NỢ PHẢI TRẢ                               32.000.000    26.000.000
I. Nợ ngắn hạn                               18.000.000    15.000.000
II. Nợ dài hạn                               14.000.000    11.000.000
B. VỐN CHỦ SỞ HỮU                           15.202.546    12.000.000
I. Vốn góp của chủ sở hữu                    10.000.000     8.000.000
TỔNG CỘNG NGUỒN VỐN                         47.202.546    38.000.000
`;

// Variant D: "triệu VND" column header format (e.g. "(Triệu VND)" or "Triệu VND")
// P_TRIEU_LOOSE requires "triệu đồng" — it misses "triệu VND". This causes
// P_DONG_ONLY to fire → sentinel -1 → magnitude inference path.
// The critical failure mode: when the reported values are small (e.g. a small
// bank with totalAssets < 1 billion triệu), the sentinel-1 path with
// effectiveMultiplier=1 happens to give the right answer. But when the format
// is understood as raw VND (not triệu), the console warns and correctness is
// accidental. The real test: no [balanceSheetExtractor] warning should fire AND
// no erroneous ÷1,000,000 scaling when values are in the 1–999 billion range.
//
// Use large values that would trigger ÷1,000,000 if sentinel fires:
const VCB_UNIT_TRIEU_VND = `
BẢNG CÂN ĐỐI KẾ TOÁN HỢP NHẤT
                                              31/12/2025    31/12/2024
                                             (Triệu VND)  (Triệu VND)

TÀI SẢN
A. TÀI SẢN NGẮN HẠN                      1.500.000.000   1.400.000.000
I. Tiền và các khoản tương đương tiền       500.000.000     450.000.000
B. TÀI SẢN DÀI HẠN                         800.000.000     750.000.000
II. Tài sản cố định                         400.000.000     370.000.000
TỔNG CỘNG TÀI SẢN                        2.300.000.000   2.150.000.000

NGUỒN VỐN
A. NỢ PHẢI TRẢ                            1.800.000.000   1.680.000.000
I. Nợ ngắn hạn                            1.000.000.000     950.000.000
II. Nợ dài hạn                              800.000.000     730.000.000
B. VỐN CHỦ SỞ HỮU                          500.000.000     470.000.000
I. Vốn góp của chủ sở hữu                  300.000.000     285.000.000
TỔNG CỘNG NGUỒN VỐN                      2.300.000.000   2.150.000.000
`;

// Minimal reproducer for Bug 2: a line where the first "large" number is a year
// and the real value follows. Without year-filter, extractNumber returns 2.025.
const MINIMAL_YEAR_FIRST = `
Đơn vị tính: triệu đồng
NỢ PHẢI TRẢ                    2.025          8.500.000
VỐN CHỦ SỞ HỮU                2.025          3.500.000
TỔNG CỘNG TÀI SẢN                           12.000.000
TỔNG CỘNG NGUỒN VỐN                         12.000.000
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Hotfix — VCB bank BCTC parser", () => {
  // ── Bug 1: Unit header detection ─────────────────────────────────────────

  describe("Bug 1: unit header — bare colon variant 'Đơn vị: triệu đồng'", () => {
    it("detects triệu multiplier (=1), does NOT scale values", () => {
      const bs = extractBalanceSheet(VCB_UNIT_BARE_COLON);
      // If bug present: multiplier defaults to 1 and magnitude inference kicks
      // in or not; either way totalAssets must equal the raw triệu value.
      expect(bs.totalAssets).toBe(10_000_000);
      expect(bs.totalLiabilitiesAndEquity).toBe(10_000_000);
    });

    it("does not apply 1000x multiplier (not tỷ)", () => {
      const bs = extractBalanceSheet(VCB_UNIT_BARE_COLON);
      // If mistakenly treated as tỷ, totalAssets would be 10_000_000_000
      expect(bs.totalAssets).toBeLessThan(100_000_000);
    });
  });

  describe("Bug 1: unit header — parenthesised '(Đơn vị tính: triệu đồng)'", () => {
    it("detects triệu multiplier through parentheses", () => {
      const bs = extractBalanceSheet(VCB_UNIT_PARENTHESISED);
      expect(bs.totalAssets).toBe(10_000_000);
      expect(bs.totalLiabilitiesAndEquity).toBe(10_000_000);
    });
  });

  describe("Bug 1: VND column headers must not short-circuit triệu detection", () => {
    it("detects triệu correctly even when 'VND' appears in column headers", () => {
      const bs = extractBalanceSheet(VCB_WITH_VND_COLUMN_HEADERS);
      // totalAssets must be the first-column value, not magnitude-inferred
      expect(bs.totalAssets).toBe(47_202_546);
      expect(bs.totalLiabilitiesAndEquity).toBe(47_202_546);
    });

    it("balance sheet balances", () => {
      const bs = extractBalanceSheet(VCB_WITH_VND_COLUMN_HEADERS);
      expect(bs.totalAssets).toBe(bs.totalLiabilitiesAndEquity);
    });
  });

  describe("Bug 1: unit header — 'Triệu VND' column header format", () => {
    it("detects triệu unit from '(Triệu VND)' column header", () => {
      const bs = extractBalanceSheet(VCB_UNIT_TRIEU_VND);
      // Without fix: P_DONG_ONLY fires on 'VND', returns sentinel -1.
      // totalAssets = 2_300_000_000 > 1_000_000_000 → magnitude inference
      // applies ÷1,000,000 → result is 2_300 (wrong).
      // With fix: 'Triệu VND' detected → multiplier = 1 → result is 2_300_000_000.
      expect(bs.totalAssets).toBe(2_300_000_000);
      expect(bs.totalLiabilitiesAndEquity).toBe(2_300_000_000);
    });

    it("values are NOT divided by 1,000,000 (not treated as raw VND)", () => {
      const bs = extractBalanceSheet(VCB_UNIT_TRIEU_VND);
      // If ÷1,000,000 applied incorrectly: totalAssets would be 2_300
      expect(bs.totalAssets).toBeGreaterThan(1_000_000_000);
    });
  });

  // ── B-3a: VCB Q4 real OCR format — inline multi-column date/unit header ──

  describe("B-3a: VCB Q4 real OCR format — inline multi-column date/unit header", () => {
    // VCB Q4: date and unit appear mid-line in a merged OCR column header.
    // "Thuyết 31/12/2025 31/12/2024" and "minh Triệu VND Triệu VND" are
    // single OCR lines — no standalone DD/MM/YYYY line ever exists.
    // The old anchored DATE_PATTERN never matched; contains-based search does.
    const VCB_Q4_INLINE_HEADER = `
BẢNG CÂN ĐỐI KẾ TOÁN HỢP NHẤT

NỢ PHẢI TRẢ (300 = 310 + 330)
300
VỐN CHỦ SỞ HỮU (400 = 410 + 430)
400
TỔNG CỘNG NGUỒN VỐN (440 = 300 + 400)
440
Thuyết minh số 1
Thuyết minh số 2
Thuyết minh số 3
Thuyết minh số 4
Thuyết minh số 5
Thuyết minh số 6
Thuyết minh số 7
Thuyết minh số 8
Thuyết minh số 9
Thuyết minh số 10
Thuyết minh số 11
Thuyết minh số 12
Thuyết minh số 13
Thuyết minh số 14
Thuyết minh số 15
Thuyết minh số 16
Thuyết minh số 17
Thuyết minh số 18
Thuyết minh số 19
Thuyết minh số 20
Thuyết 31/12/2025 31/12/2024
minh Triệu VND Triệu VND
1.904.318.782
204.941.834
2.109.260.616
Các khoản nợ phải trả được ghi nhận theo giá trị hợp lý
Nghị định số 93/2017/NĐ-CP do Chính phủ ban hành
`;

    it("routes to split-block parser when date and unit are inline (not standalone)", () => {
      const bs = extractBalanceSheet(VCB_Q4_INLINE_HEADER);
      expect(bs.totalLiabilities).not.toBe(93);
      expect(bs.equity.total).not.toBe(1);
      expect(bs.totalLiabilities).toBeGreaterThan(10_000);
      expect(bs.equity.total).toBeGreaterThan(10_000);
    });

    it("extracts correct total_liabilities for VCB Q4 inline header format", () => {
      const bs = extractBalanceSheet(VCB_Q4_INLINE_HEADER);
      expect(bs.totalLiabilities).toBe(1_904_318_782);
    });

    it("extracts correct equity_total for VCB Q4 inline header format", () => {
      const bs = extractBalanceSheet(VCB_Q4_INLINE_HEADER);
      expect(bs.equity.total).toBe(204_941_834);
    });
  });

  // ── B-3b: VCB Q1 real OCR format — labels-only page + values-only page ──

  describe("B-3b: VCB Q1 real OCR format — labels-only page + values-only page", () => {
    // VCB Q1: labels on one page (separated by "Báo cáo tình hình tài chính" header),
    // values on the next. Date appears only in Vietnamese prose on the labels page.
    // extractSplitBlockAll detects the labels-only page (has item codes, zero monetary
    // values) and concatenates it with the following values page.
    const VCB_Q1_PAGE_PAIR = `
Báo cáo tình hình tài chính hợp nhất
tại ngày 31 tháng 3 năm 2025

NỢ PHẢI TRẢ (300 = 310 + 330)
300
VỐN CHỦ SỞ HỮU (400 = 410 + 430)
400
TỔNG CỘNG NGUỒN VỐN (440 = 300 + 400)
440
Thuyết minh số 1
Thuyết minh số 2
Thuyết minh số 3
Thuyết minh số 4
Thuyết minh số 5
Thuyết minh số 6
Thuyết minh số 7
Thuyết minh số 8
Thuyết minh số 9
Thuyết minh số 10
Báo cáo tình hình tài chính hợp nhất
1.904.318.782
204.941.834
2.109.260.616
Các khoản nợ phải trả được ghi nhận theo giá trị hợp lý
Nghị định số 93/2017/NĐ-CP do Chính phủ ban hành
`;

    it("routes to split-block parser when labels and values are on separate pages", () => {
      const bs = extractBalanceSheet(VCB_Q1_PAGE_PAIR);
      expect(bs.totalLiabilities).not.toBe(93);
      expect(bs.equity.total).not.toBe(1);
      expect(bs.totalLiabilities).toBeGreaterThan(10_000);
      expect(bs.equity.total).toBeGreaterThan(10_000);
    });

    it("extracts correct total_liabilities for VCB Q1 page-pair format", () => {
      const bs = extractBalanceSheet(VCB_Q1_PAGE_PAIR);
      expect(bs.totalLiabilities).toBe(1_904_318_782);
    });

    it("extracts correct equity_total for VCB Q1 page-pair format", () => {
      const bs = extractBalanceSheet(VCB_Q1_PAGE_PAIR);
      expect(bs.equity.total).toBe(204_941_834);
    });
  });

  // ── Bug 2: Year values must not be captured as financial figures ──────────

  describe("Bug 2: year values (1990–2030) excluded from financial extraction", () => {
    it("does not capture column-header years (2017, 2025) as liabilities or equity", () => {
      const bs = extractBalanceSheet(VCB_YEAR_IN_VALUE_POSITION);
      // Years 2017/2025 must NOT appear as financial values
      expect(bs.totalLiabilities).not.toBe(2017);
      expect(bs.totalLiabilities).not.toBe(2025);
      expect(bs.equity.total).not.toBe(2017);
      expect(bs.equity.total).not.toBe(2025);
    });

    it("liabilities and equity values are plausible (millions range)", () => {
      const bs = extractBalanceSheet(VCB_YEAR_IN_VALUE_POSITION);
      // Real values are in the millions; year numbers (2017, 2025) are trivially small
      expect(bs.totalLiabilities).toBeGreaterThan(10_000);
      expect(bs.equity.total).toBeGreaterThan(10_000);
    });

    it("minimal: year appearing before real value on same line is skipped", () => {
      const bs = extractBalanceSheet(MINIMAL_YEAR_FIRST);
      // NỢ PHẢI TRẢ line has "2.025" (year 2025) first, then "8.500.000"
      // extractNumber must skip 2025 and return 8_500_000
      expect(bs.totalLiabilities).not.toBe(2025);
      expect(bs.totalLiabilities).toBeGreaterThan(10_000);
    });
  });
});
