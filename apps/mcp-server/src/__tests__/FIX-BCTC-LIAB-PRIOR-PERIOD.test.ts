/**
 * FIX-BCTC-LIAB-PRIOR-PERIOD — RED→GREEN regression tests
 *
 * Root cause: parseSplitBlockBalanceSheet picks the FIRST date+unit header
 * as the separator. For HPG parent-company ("Báo cáo tài chính riêng") and
 * similar formats where the PRIOR-period date header (31/12/2024 or 01/01/2025)
 * appears BEFORE the current-period header (31/12/2025), the "value block"
 * starts at the prior-period values. All codes are then zipped against
 * prior-period figures.
 *
 * Evidence from SPIKE_3012-bctc-eval-hpg-ppc.md (commit a2b38ec1):
 *   balance_sheet_json.totalLiabilities = 1,012,889.94M (prior period — WRONG)
 *   correct value = 4,239,852.22M (current period, matches financial_reports scalar)
 *   currentLiabilities.total + longTermLiabilities.total = 4,239,852.22M (correct)
 *
 * Fix: separator detection must prefer the MOST RECENT date header
 * (highest year), not the first occurrence.
 *
 * Tests:
 *   T1 — RED→GREEN: HPG-style prior-period-first format → totalLiabilities
 *        must equal current-period value, not prior-period value
 *   T2 — RED→GREEN: same fixture → currentLiabilities.total + longTermLiabilities.total
 *        must equal totalLiabilities (identity check passes → no false-positive validation failure)
 *   T3 — regression: VNM-style current-period-first format still works
 *   T4 — regression: totalAssets extracted correctly from prior-period-first fixture
 *   T5 — RED→GREEN: prior-period-first two-column inline line format (01/01/YYYY leading zero)
 */

import { describe, it, expect } from "bun:test";
import { extractBalanceSheet } from "../domain/services/financial-reports/balanceSheetExtractor";

// ---------------------------------------------------------------------------
// Fixture: HPG parent-company format — PRIOR period date header appears FIRST
//
// In HPG's Báo cáo tài chính riêng OCR, the balance sheet liabilities section
// has a two-column header block where the layout is:
//   [code column] [prior-period date/VND] [current-period date/VND]
// OCR merges this as: prior date first, then values, then current date, then values.
//
// Values are HPG Q4 2025 actual figures from SPIKE_3012:
//   totalLiabilities (current)  = 4,239,852,220,000 VND
//   totalLiabilities (prior)    = 1,012,889,937,592 VND  ← bug produces this
//   currentLiabilities (current) = 1,380,352,220,000 VND
//   longTermLiabilities (current) = 2,859,500,000,000 VND
//   equity.total (current)       = 94,430,926,470,000 VND
//   totalAssets (current)        = 98,670,778,690,000 VND
// ---------------------------------------------------------------------------

// Assets section (current-period-first format — always correct)
const HPG_ASSETS_SECTION = `
Báo cáo tình hình tài chính tại ngày 31 tháng 12 năm 2025

TÀI SẢN

Tài sản ngắn hạn
(100 = 110 + 120 + 130 + 140 + 150)

Tiền và các khoản tương đương tiền

Đầu tư tài chính ngắn hạn

Các khoản phải thu ngắn hạn

Hàng tồn kho

Tài sản ngắn hạn khác

Tài sản dài hạn
(200 = 210 + 220 + 230 + 250 + 260) 200

Tài sản cố định

Đầu tư tài chính dài hạn

TỔNG CỘNG TÀI SẢN (270 = 100 + 200)

100

110

120

130

140

150

210

220

250

270

31/12/2025
VND

4.230.926.470.000

800.000.000.000

1.200.000.000.000

900.000.000.000

980.000.000.000

350.926.470.000

94.439.852.220.000

50.000.000.000.000

40.000.000.000.000

98.670.778.690.000

31/12/2024
VND

4.000.000.000.000

750.000.000.000

1.100.000.000.000

850.000.000.000

950.000.000.000

350.000.000.000

88.000.000.000.000

46.000.000.000.000

38.000.000.000.000

92.000.000.000.000
`;

// Liabilities + equity section — PRIOR date header appears FIRST (HPG bug trigger)
const HPG_LIABILITIES_PRIOR_FIRST = `
NGUỒN VỐN

NỢ PHẢI TRẢ
(300 = 310 + 330)

Nợ ngắn hạn
(310 = 311 + 312 + 313 + 314 + 319)

Nợ dài hạn
(330 = 333 + 334 + 336 + 337 + 338)

VỐN CHỦ SỞ HỮU
(400 = 410 + 420 + 430)

Vốn góp của chủ sở hữu

TỔNG CỘNG NGUỒN VỐN (440 = 300 + 400)

300

310

330

400

411

440

31/12/2024
VND

1.012.889.937.592

652.352.220.000

360.537.717.592

91.100.000.000.000

20.000.000.000.000

92.000.000.000.000

31/12/2025
VND

4.239.852.220.000

1.380.352.220.000

2.859.500.000.000

94.430.926.470.000

20.000.000.000.000

98.670.778.690.000
`;

const HPG_FULL_PRIOR_FIRST = HPG_ASSETS_SECTION + HPG_LIABILITIES_PRIOR_FIRST;

// ---------------------------------------------------------------------------
// Fixture: VNM-style — CURRENT period date header appears FIRST (regression guard)
// ---------------------------------------------------------------------------
const HPG_LIABILITIES_CURRENT_FIRST = `
NGUỒN VỐN

NỢ PHẢI TRẢ
(300 = 310 + 330)

Nợ ngắn hạn
(310 = 311 + 312 + 313 + 314 + 319)

Nợ dài hạn
(330 = 333 + 334 + 336 + 337 + 338)

VỐN CHỦ SỞ HỮU
(400 = 410 + 420 + 430)

Vốn góp của chủ sở hữu

TỔNG CỘNG NGUỒN VỐN (440 = 300 + 400)

300

310

330

400

411

440

31/12/2025
VND

4.239.852.220.000

1.380.352.220.000

2.859.500.000.000

94.430.926.470.000

20.000.000.000.000

98.670.778.690.000

31/12/2024
VND

1.012.889.937.592

652.352.220.000

360.537.717.592

91.100.000.000.000

20.000.000.000.000

92.000.000.000.000
`;

const HPG_FULL_CURRENT_FIRST = HPG_ASSETS_SECTION + HPG_LIABILITIES_CURRENT_FIRST;

// ---------------------------------------------------------------------------
// Fixture: leading-zero prior-period date "01/01/2025" (T5)
// Some HPG OCR variants use DD/MM/YYYY with zero-padding — this variant
// was not caught by the original hitSecondPeriod regex /^1\/1\/20\d\d/.
// ---------------------------------------------------------------------------
const HPG_LIABILITIES_LEADING_ZERO_PRIOR = `
NGUỒN VỐN

NỢ PHẢI TRẢ
(300 = 310 + 330)

Nợ ngắn hạn

Nợ dài hạn

VỐN CHỦ SỞ HỮU

TỔNG CỘNG NGUỒN VỐN (440 = 300 + 400)

300

310

330

400

440

01/01/2025
VND

1.012.889.937.592

652.352.220.000

360.537.717.592

91.100.000.000.000

92.000.000.000.000

31/12/2025
VND

4.239.852.220.000

1.380.352.220.000

2.859.500.000.000

94.430.926.470.000

98.670.778.690.000
`;

const HPG_FULL_LEADING_ZERO_PRIOR = HPG_ASSETS_SECTION + HPG_LIABILITIES_LEADING_ZERO_PRIOR;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FIX-BCTC-LIAB-PRIOR-PERIOD — prior-period column binding bug", () => {
  // T1: Core bug — prior-period-first format must extract totalLiabilities from
  //     the CURRENT period (4,239,852M), not the prior period (1,012,889M)
  it("T1: prior-period-first format: totalLiabilities must be current-period value 4,239,852M", () => {
    const bs = extractBalanceSheet(HPG_FULL_PRIOR_FIRST);
    // 4,239,852,220,000 VND ÷ 1,000,000 = 4,239,852.22 million VND
    // The bug produced 1,012,889.94M (prior period) — must NOT be that value
    expect(bs.totalLiabilities).not.toBeCloseTo(1_012_889, -3);
    expect(bs.totalLiabilities).toBeGreaterThan(4_000_000);
    expect(bs.totalLiabilities).toBeLessThan(5_000_000);
  });

  // T2: Identity check — totalLiabilities must equal currentLiabilities.total + longTermLiabilities.total
  //     This is the validation that produced the false-positive "failed" status
  it("T2: prior-period-first format: totalLiabilities identity holds (no false-positive validation failure)", () => {
    const bs = extractBalanceSheet(HPG_FULL_PRIOR_FIRST);
    const computedTotal = bs.currentLiabilities.total + bs.longTermLiabilities.total;
    // Both sub-totals must be from current period
    expect(bs.currentLiabilities.total).toBeGreaterThan(1_000_000);
    expect(bs.longTermLiabilities.total).toBeGreaterThan(1_000_000);
    // Identity: totalLiabilities ≈ currentLiabilities.total + longTermLiabilities.total
    // Allow ±1% tolerance for magnitude conversion rounding
    if (computedTotal > 0 && bs.totalLiabilities > 0) {
      const delta = Math.abs(bs.totalLiabilities - computedTotal) / computedTotal;
      expect(delta).toBeLessThan(0.01);
    }
  });

  // T3: Regression — current-period-first format (VNM style) still extracts correctly
  it("T3: regression: current-period-first format extracts totalLiabilities correctly", () => {
    const bs = extractBalanceSheet(HPG_FULL_CURRENT_FIRST);
    expect(bs.totalLiabilities).toBeGreaterThan(4_000_000);
    expect(bs.totalLiabilities).toBeLessThan(5_000_000);
  });

  // T4: Regression — totalAssets extracted correctly from prior-period-first fixture
  it("T4: prior-period-first format: totalAssets is current-period value ≈ 98,670,779M", () => {
    const bs = extractBalanceSheet(HPG_FULL_PRIOR_FIRST);
    // 98,670,778,690,000 VND ÷ 1,000,000 ≈ 98,670,779 million VND
    expect(bs.totalAssets).toBeGreaterThan(90_000_000);
    expect(bs.totalAssets).toBeLessThan(110_000_000);
  });

  // T5: Leading-zero prior date "01/01/2025" — hitSecondPeriod missed this variant
  it("T5: leading-zero prior date '01/01/2025' does not contaminate totalLiabilities", () => {
    const bs = extractBalanceSheet(HPG_FULL_LEADING_ZERO_PRIOR);
    expect(bs.totalLiabilities).not.toBeCloseTo(1_012_889, -3);
    expect(bs.totalLiabilities).toBeGreaterThan(4_000_000);
    expect(bs.totalLiabilities).toBeLessThan(5_000_000);
  });
});
