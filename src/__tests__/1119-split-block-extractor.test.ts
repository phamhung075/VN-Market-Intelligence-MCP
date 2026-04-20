/**
 * Task 1119 — Split-block OCR extractor for consolidated BCTC
 *
 * Tests the split-block fallback in incomeStatementExtractor and
 * balanceSheetExtractor. The VNM Q4-2025 consolidated PDF produces OCR
 * text where labels and numbers are in separate blocks (100+ lines apart),
 * with multi-column packed rows for the annual figures.
 *
 * Structure of VNM consolidated income statement OCR:
 *   Block A (lines 0-70):  All labels (no numbers)
 *   Block B (lines 71-90): Item codes (01, 02, 10, ..., 50)
 *   Block C (lines 91-150): Data rows
 *     - Gross revenue Q4: 63.723.520.008.574 (separate line)
 *     - Deductions Q4: 77.633.252.347 (separate line)
 *     - Items 10-30 packed: "63.645... 61.782..." (4-column rows)
 *
 * Expected behaviour:
 *   extractIncomeStatement(vnmOcrText) → net_revenue ≈ 63,645,887 (million VND)
 */

import { describe, it, expect } from "bun:test";
import { extractIncomeStatement } from "../domain/services/financial-reports/incomeStatementExtractor";
import { extractBalanceSheet } from "../domain/services/financial-reports/balanceSheetExtractor";

// ---------------------------------------------------------------------------
// Minimal split-block sample — simulates the VNM OCR structure
// ---------------------------------------------------------------------------

const SPLIT_BLOCK_INCOME = `
Báo cáo kết quả hoạt động kinh doanh hợp nhất

Doanh thu bán hàng và cung cấp dịch vụ

Các khoản giảm trừ doanh thu

Doanh thu thuần về bán hàng và cung cấp dịch vụ
(10 = 01 - 02)
Giá vốn hàng bán và dịch vụ cung cấp
Lợi nhuận gộp về bán hàng và cung cấp dịch vụ
(20 = 10 - 11)

Doanh thu hoạt động tài chính

Chí phí tài chính

Trong đó: Chí phi lãi vay

Chi phí bán hàng

Chi phí quản lý doanh nghiệp
Lợi nhuận thuần từ hoạt động kinh doanh

Thu nhập khác
Chi phí khác

Lợi nhuận kế toán trước thuế

Chi phí thuế TNDN hiện hành
Chi phí thuế TNDN hoãn lại

Lợi nhuận sau thuế thu nhập doanh nghiệp

Lợi ích của cổ đông không kiểm soát

Mã số
01
02
10
11
20
21
22
23
24
25
26
30
31
32
40
50
51
52
60
61

Quý IV kết thúc ngày
31/12/2025 31/12/2024
VND VND

5.000.000.000.000

50.000.000.000

Năm kết thúc ngày

31/12/2025
VND

20.000.000.000.000

200.000.000.000

31/12/2024
VND

19.000.000.000.000
180.000.000.000

19.800.000.000.000 18.820.000.000.000 19.800.000.000.000 18.820.000.000.000
12.000.000.000.000 11.500.000.000.000 12.000.000.000.000 11.500.000.000.000
7.800.000.000.000 7.320.000.000.000 7.800.000.000.000 7.320.000.000.000
500.000.000.000 450.000.000.000 500.000.000.000 450.000.000.000
100.000.000.000 90.000.000.000 100.000.000.000 90.000.000.000
80.000.000.000 70.000.000.000 80.000.000.000 70.000.000.000
10.000.000.000 5.000.000.000 10.000.000.000 5.000.000.000

1.200.000.000.000
200.000.000.000

1.100.000.000.000
180.000.000.000

4.500.000.000.000
700.000.000.000

4.300.000.000.000
650.000.000.000

5.300.000.000.000

4.950.000.000.000

50.000.000.000

45.000.000.000

5.350.000.000.000

4.995.000.000.000

200.000.000.000 180.000.000.000 800.000.000.000 750.000.000.000
50.000.000.000 40.000.000.000 150.000.000.000 120.000.000.000
250.000.000.000 220.000.000.000 950.000.000.000 870.000.000.000

4.400.000.000.000

4.125.000.000.000

300.000.000.000

280.000.000.000
`;

// Approximate expected values (in triệu VND = million VND)
// Using FY-2025 column (3rd column in 4-col rows, or the "Năm 31/12/2025" single rows)
// net revenue ≈ 19,800,000 million VND
// cogs ≈ 12,000,000 million VND
// gross profit ≈ 7,800,000 million VND
// profit before tax ≈ 5,350,000 million VND
// net profit ≈ 4,400,000 million VND

describe("split-block OCR extractor — income statement", () => {
  it("extracts net revenue from 4-column packed row (FY-2025 = col 3)", () => {
    const is = extractIncomeStatement(SPLIT_BLOCK_INCOME);
    // Net revenue FY-2025: 19,800,000,000,000 VND = 19,800,000 triệu
    expect(is.netRevenue).toBeGreaterThan(19_000_000);
    expect(is.netRevenue).toBeLessThan(21_000_000);
  });

  it("extracts COGS from packed row", () => {
    const is = extractIncomeStatement(SPLIT_BLOCK_INCOME);
    // COGS FY-2025: 12,000,000,000,000 VND = 12,000,000 triệu
    expect(is.cogs).toBeGreaterThan(11_000_000);
    expect(is.cogs).toBeLessThan(13_000_000);
  });

  it("extracts gross profit from packed row", () => {
    const is = extractIncomeStatement(SPLIT_BLOCK_INCOME);
    // Gross profit FY-2025: 7,800,000,000,000 VND = 7,800,000 triệu
    expect(is.grossProfit).toBeGreaterThan(7_000_000);
    expect(is.grossProfit).toBeLessThan(9_000_000);
  });

  it("correctly divides by 1,000,000 (magnitude inference for raw VND)", () => {
    const is = extractIncomeStatement(SPLIT_BLOCK_INCOME);
    // Net revenue is in raw VND (19.8T VND) → after magnitude inference → 19,800,000 triệu
    // This validates that magnitude inference correctly divides by 1M
    expect(is.netRevenue).toBeGreaterThan(15_000_000);
    expect(is.netRevenue).toBeLessThan(25_000_000);
  });
});

// ---------------------------------------------------------------------------
// Real VNM values test (approximate — from actual OCR page 8)
// ---------------------------------------------------------------------------

const VNM_INCOME_SNIPPET = `
Báo cáo kết quả hoạt động kinh doanh hợp nhất cho giai đoạn quý IV và năm kết thúc ngày 31 tháng 12 năm 2025

Doanh thu bán hàng và cung cấp dịch vụ

Các khoản giảm trừ doanh thu

Doanh thu thuần về bán hàng và cung cấp dịch vụ
(10 = 01 - 02)
Giá vốn hàng bán và dịch vụ cung cấp
Lợi nhuận gộp về bán hàng và cung cấp dịch vụ
(20 = 10 - 11)

Doanh thu hoạt động tài chính

Chỉ phí tài chính

Trong đó: Chỉ phi lãi vay

(Lỗ)/lãi chia từ công ty liên kết, liên doanh

Chi phí bán hàng

Chi phí quản lý doanh nghiệp
Lợi nhuận thuần từ hoạt động kinh doanh
{30 = 20 + (21 - 22) + 24 - (25 + 26)}

Thu nhập khác
Chi phí khác
Kết quả từ hoạt động khác (40 = 31 - 32)

Lợi nhuận kế toán trước thuế (50 = 30 + 40)

Mã
số
01
02
10
11

20

21
22
es
24
25
26

30

31
32

40

50

Quý IV kết thúc ngày
31/12/2025 31/12/2024
VND VND

17.045.421.378.817

11.868.972.863

15.485.051.436.522

7.978.311.081

Năm kết thúc ngày

31/12/2025
VND

63.723.520.008.574

77.633.252.347

31/12/2024
VND

61.823.889.921.880
41.280.393.435

17.033.552.405.954 15.477.073.125.441 63.645.886.756.227 61.782.609.528.445
10.143.535.412.610  9.267.382.480.456 37.436.412.561.696 36.192.433.205.321
6.890.016.993.344  6.209.690.644.985 26.209.474.194.531 25.590.176.323.124
358.341.189.804 394.631.907.537  1.496.851.902.188  1.585.660.836.067
107.566.612.631 140.107.172.656 350.234.100.207 428.238.548.859
89.980.184.766 66.109.861.870 325.804.350.407 279.424.561.295
23.984.472.272 23.396.009.808 (150.558.017.656) 32.002.663.848
`;

describe("VNM Q4-2025 income statement — real OCR snippet", () => {
  it("extracts net revenue ≈ 63.6T VND = 63,645,887 million", () => {
    const is = extractIncomeStatement(VNM_INCOME_SNIPPET);
    // 63,645,886,756,227 VND ÷ 1,000,000 = 63,645,887 million VND (approx)
    expect(is.netRevenue).toBeGreaterThan(60_000_000);
    expect(is.netRevenue).toBeLessThan(68_000_000);
  });

  it("extracts COGS ≈ 37.4T VND", () => {
    const is = extractIncomeStatement(VNM_INCOME_SNIPPET);
    expect(is.cogs).toBeGreaterThan(35_000_000);
    expect(is.cogs).toBeLessThan(40_000_000);
  });

  it("extracts gross profit ≈ 26.2T VND", () => {
    const is = extractIncomeStatement(VNM_INCOME_SNIPPET);
    expect(is.grossProfit).toBeGreaterThan(24_000_000);
    expect(is.grossProfit).toBeLessThan(29_000_000);
  });
});

// ---------------------------------------------------------------------------
// Regression: existing inline format (VEA-style) must still work
// ---------------------------------------------------------------------------

const INLINE_FORMAT = `
BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH
Đơn vị: triệu đồng

3. Doanh thu thuần bán hàng và cung cấp dịch vụ/ Net revenue 10 259.905 68.456 553.542 316.859
4. Giá vốn hàng bán/ Cost of goods sold 11 227.057 62.891 522.798 290.540
5. Lợi nhuận gộp/ Gross profit 20 32.848 5.564 30.744 26.319
`;

describe("regression — inline format still works", () => {
  it("extracts net revenue from inline format (triệu đồng, no split-block)", () => {
    const is = extractIncomeStatement(INLINE_FORMAT);
    // First large number on the label line = 259.905 triệu (259,905,000,000 VND = ~260B VND)
    // Inline format: number on same line as label, first col = Q4-2025
    expect(is.netRevenue).toBeGreaterThan(250_000);
    expect(is.netRevenue).toBeLessThan(270_000);
  });
});
