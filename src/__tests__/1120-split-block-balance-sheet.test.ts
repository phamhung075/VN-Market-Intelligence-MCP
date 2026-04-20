/**
 * Task 1120 — Split-block OCR extractor for consolidated BCTC balance sheet
 *
 * VNM Q4-2025 consolidated PDF produces OCR text where labels and numbers
 * are in separate blocks (60+ lines apart), with the structure:
 *
 *   Labels block:  All labels (no numbers, or only inline item codes)
 *   Codes block:   Standalone item codes (100, 110, 111...)
 *   Notes block:   Thuyết minh references (V.1, V.4(a)...)
 *   Value block:   Actual monetary values, starting with "31/12/2025\nVND"
 *
 * Expected behaviour:
 *   extractBalanceSheet(vnmOcrText) → totalAssets ≈ 53,312,371 million VND
 *
 * Real VNM Q4-2025 balance sheet values (in million VND):
 *   currentAssets.total ≈ 36,261,181  (item 100)
 *   currentAssets.cash ≈ 1,794,880  (item 110)
 *   currentAssets.inventory ≈ 6,839,280  (item 140)
 *   nonCurrentAssets.total ≈ 17,051,190  (item 200)
 *   totalAssets ≈ 53,312,371  (item 270)
 *   totalLiabilities ≈ 18,829,355  (item 300)
 *   equity.total ≈ 34,483,015  (item 400)
 */

import { describe, it, expect } from "bun:test";
import { extractBalanceSheet } from "../domain/services/financial-reports/balanceSheetExtractor";

// ---------------------------------------------------------------------------
// Minimal split-block sample — simulates VNM OCR structure (pages 5+6+7)
// All labels appear first, then item codes, then "31/12/2025 VND", then values
// ---------------------------------------------------------------------------

const SPLIT_BLOCK_BS = `
Báo cáo tình hình tài chính hợp nhất tại ngày 31 tháng 12 năm 2025

TÀI SẢN

Tài sản ngắn hạn
(100 = 110 + 120 + 130 + 140 + 150)

Tiền và các khoản tương đương tiền

Các khoản đầu tư tài chính ngắn hạn

Các khoản phải thu ngắn hạn

Hàng tồn kho

Tài sản ngắn hạn khác

Tài sản dài hạn
(200 = 210 + 220 + 230 + 240 + 250 + 260) 200

Các khoản phải thu dài hạn

Tài sản cố định

Bất động sản đầu tư

Các khoản đầu tư tài chính dài hạn

Lợi thế thương mại

TỔNG TÀI SẢN (270 = 100 + 200)

sô

100

110

120

130

140

150

210

220

230

250

260

270

Thuyết minh

V.1

V.4(a)

V.3(a)

V.5

V.11(a)

V.3(b)

V.7

V.8

V.4(c)

V.13

31/12/2025
VND

20.000.000.000.000

1.500.000.000.000

8.000.000.000.000

5.000.000.000.000

4.000.000.000.000

1.500.000.000.000

15.000.000.000.000

500.000.000.000

10.000.000.000.000

2.000.000.000.000

1.000.000.000.000

1.500.000.000.000

35.000.000.000.000

1/1/2025
VND

19.000.000.000.000

1.400.000.000.000

7.500.000.000.000

4.800.000.000.000

3.900.000.000.000

1.400.000.000.000

14.000.000.000.000

450.000.000.000

9.500.000.000.000

1.800.000.000.000

900.000.000.000

1.350.000.000.000

33.000.000.000.000

NGUON VON

NỢ PHẢI TRẢ (300 = 310 + 330)

Nợ ngắn hạn

Nợ dài hạn

VỐN CHỦ SỞ HỮU (400 = 410)

Vốn chủ sở hữu
Vốn cổ phần
Thặng dư vốn cổ phần
Lợi nhuận sau thuế chưa phân phối
Lợi ích cổ đông không kiểm soát

TỔNG NGUỒN VỐN (440 = 300 + 400)

300

310

330

400

410
411
412
421

429

440

Thuyết minh

V.14

V.16

31/12/2025
VND

12.000.000.000.000

10.000.000.000.000

2.000.000.000.000

23.000.000.000.000

23.000.000.000.000
10.000.000.000.000
500.000.000.000
9.000.000.000.000
3.500.000.000.000

35.000.000.000.000

1/1/2025
VND

11.500.000.000.000

9.500.000.000.000

2.000.000.000.000

21.500.000.000.000

21.500.000.000.000
10.000.000.000.000
500.000.000.000
8.000.000.000.000
3.000.000.000.000

33.000.000.000.000
`;

// Expected values (in triệu VND = million VND):
// currentAssets.total ≈ 20,000,000 triệu
// nonCurrentAssets.total ≈ 15,000,000 triệu
// totalAssets ≈ 35,000,000 triệu
// totalLiabilities ≈ 12,000,000 triệu
// equity.total ≈ 23,000,000 triệu

describe("split-block OCR extractor — balance sheet", () => {
  it("extracts totalAssets from split-block format", () => {
    const bs = extractBalanceSheet(SPLIT_BLOCK_BS);
    // 35,000,000,000,000 VND ÷ 1,000,000 = 35,000,000 million VND
    expect(bs.totalAssets).toBeGreaterThan(30_000_000);
    expect(bs.totalAssets).toBeLessThan(40_000_000);
  });

  it("extracts currentAssets.total from split-block format", () => {
    const bs = extractBalanceSheet(SPLIT_BLOCK_BS);
    // 20,000,000,000,000 VND ÷ 1,000,000 = 20,000,000 million VND
    expect(bs.currentAssets.total).toBeGreaterThan(18_000_000);
    expect(bs.currentAssets.total).toBeLessThan(22_000_000);
  });

  it("extracts nonCurrentAssets.total from split-block format", () => {
    const bs = extractBalanceSheet(SPLIT_BLOCK_BS);
    // 15,000,000,000,000 VND ÷ 1,000,000 = 15,000,000 million VND
    expect(bs.nonCurrentAssets.total).toBeGreaterThan(13_000_000);
    expect(bs.nonCurrentAssets.total).toBeLessThan(17_000_000);
  });

  it("extracts inventory from split-block format", () => {
    const bs = extractBalanceSheet(SPLIT_BLOCK_BS);
    // 4,000,000,000,000 VND ÷ 1,000,000 = 4,000,000 million VND
    expect(bs.currentAssets.inventory).toBeGreaterThan(3_500_000);
    expect(bs.currentAssets.inventory).toBeLessThan(4_500_000);
  });

  it("extracts equity.total from split-block format", () => {
    const bs = extractBalanceSheet(SPLIT_BLOCK_BS);
    // 23,000,000,000,000 VND ÷ 1,000,000 = 23,000,000 million VND
    expect(bs.equity.total).toBeGreaterThan(20_000_000);
    expect(bs.equity.total).toBeLessThan(26_000_000);
  });
});

// ---------------------------------------------------------------------------
// Real VNM Q4-2025 OCR snippet (from pages 5+6+7 combined)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Focused split-block tests for specific fields
// Each uses a minimal, self-consistent fixture (exact code count = value count)
// ---------------------------------------------------------------------------

// Page with just current assets — tests item 100 (total) and 140 (inventory)
const SB_CURRENT_ASSETS = `
Báo cáo tình hình tài chính hợp nhất tại ngày 31 tháng 12 năm 2025

TÀI SẢN

Tài sản ngắn hạn
(100 = 110 + 120 + 130 + 140 + 150)

Tiền và các khoản tương đương tiền
Tiên và các khoản tương đương tiền
Tiền gửi ngắn hạn

Các khoản đầu tư tài chính ngắn hạn

Các khoản phải thu ngắn hạn

Hàng tồn kho
Hàng tồn kho

Tài sản ngắn hạn khác

sô

100

110
111
112

120

130

140
141

150

Thuyết minh

V.1

V.4

V.3

V.5

V.11

31/12/2025
VND

36.261.180.908.033

1.794.879.718.871
1.630.879.718.871
164.000.000.000

21.354.863.600.460

6.027.719.081.073

6.839.279.842.936
6.897.878.201.557

244.438.664.693

1/1/2025
VND

37.553.650.065.098

2.225.943.732.075
1.877.943.732.075
348.000.000.000

23.260.088.671.767

6.233.758.612.009

5.686.840.161.906
5.723.932.310.689

147.018.887.251
`;

// Page with non-current assets + total assets — tests items 200 and 270
const SB_NONCURRENT_ASSETS = `
Báo cáo tình hình tài chính hợp nhất tại ngày 31 tháng 12 năm 2025 (tiếp theo)

Tài sản dài hạn
(200 = 210 + 220 + 230 + 250 + 260) 200

Các khoản phải thu dài hạn

Tài sản cố định

Bất động sản đầu tư

Các khoản đầu tư tài chính dài hạn

Tài sản dài hạn khác

TONG TAI SAN (270 = 100 + 200)

210

220

230

250

260

270

Thuyết minh

V.3

V.7

V.8

V.4

V.11

31/12/2025
VND

17.051.189.809.268

23.255.275.322

12.648.916.412.221

1.320.803.519.138

957.072.946.110

2.049.361.473.261

53.312.370.717.301

1/1/2025
VND

17.495.411.471.963

17.592.137.763

12.550.564.799.221

1.539.776.005.637

1.373.189.677.193

1.960.671.058.977

55.049.061.537.061
`;

// Page with liabilities + equity — tests items 300, 400
const SB_LIABILITIES_EQUITY = `
Báo cáo tình hình tài chính hợp nhất tại ngày 31 tháng 12 năm 2025 (tiếp theo)

NGUON VON
NỢ PHAI TRA (300 = 310 + 330)

Nợ ngắn hạn
Phải trả người bán ngắn hạn
Người mua trả tiền trước ngắn hạn
Thuế và các khoản phải nộp
Phải trả người lao động
Nợ ngắn hạn khác

Nợ dài hạn
Vay dài hạn
Thuế thu nhập hoãn lại phải trả

VON CHỦ SỞ HỮU (400 = 410)

Vốn chủ sở hữu
Vốn cổ phần
Thặng dư vốn cổ phần
Lợi nhuận sau thuế chưa phân phối
Lợi ích cổ đông không kiểm soát

TONG NGUON VON (440 = 300 + 400)

300

310
311
312
313
314
319

330
336
337

400

410
411
412
421

429

440

Thuyết minh

V.14

V.16

31/12/2025
VND

18.829.355.431.194

18.520.286.019.795
3.923.308.706.878
253.080.586.375
1.803.999.103.453
321.578.564.134
9.393.736.731.992

309.069.411.399
62.907.826.150
245.547.119.760

34.483.015.286.107

34.483.015.286.107
20.899.554.450.000
34.110.709.700
8.522.576.422.223
3.797.632.379.221

53.312.370.717.301

1/1/2025
VND

18.874.658.707.398

18.459.546.837.640
3.874.064.349.587
191.336.029.327
1.014.478.141.379
307.904.216.360
1.148.532.208.981

415.111.869.758
157.903.902.450
256.485.039.756

36.174.402.829.663

36.174.402.829.663
20.899.554.450.000
34.110.709.700
7.079.114.621.362
3.895.583.288.658

55.049.061.537.061
`;

const VNM_BS_COMBINED = SB_CURRENT_ASSETS + SB_NONCURRENT_ASSETS + SB_LIABILITIES_EQUITY;

describe("VNM Q4-2025 balance sheet — split-block pages 5+6+7", () => {
  it("extracts totalAssets ≈ 53.3T VND = 53,312,371 million", () => {
    const bs = extractBalanceSheet(VNM_BS_COMBINED);
    // 53,312,370,717,301 VND ÷ 1,000,000 = 53,312,371 million VND
    expect(bs.totalAssets).toBeGreaterThan(50_000_000);
    expect(bs.totalAssets).toBeLessThan(57_000_000);
  });

  it("extracts currentAssets.total ≈ 36.3T VND", () => {
    const bs = extractBalanceSheet(VNM_BS_COMBINED);
    expect(bs.currentAssets.total).toBeGreaterThan(33_000_000);
    expect(bs.currentAssets.total).toBeLessThan(39_000_000);
  });

  it("extracts currentAssets.inventory ≈ 6.84T VND", () => {
    const bs = extractBalanceSheet(VNM_BS_COMBINED);
    expect(bs.currentAssets.inventory).toBeGreaterThan(6_000_000);
    expect(bs.currentAssets.inventory).toBeLessThan(8_000_000);
  });

  it("extracts equity.total ≈ 34.5T VND", () => {
    const bs = extractBalanceSheet(VNM_BS_COMBINED);
    expect(bs.equity.total).toBeGreaterThan(30_000_000);
    expect(bs.equity.total).toBeLessThan(38_000_000);
  });
});

// ---------------------------------------------------------------------------
// Regression: existing inline format must still work
// ---------------------------------------------------------------------------

const INLINE_BS = `
BÁO CÁO TÌNH HÌNH TÀI CHÍNH
Đơn vị: triệu đồng

Tài sản ngắn hạn 100 5.000.000 4.500.000
Tiền và các khoản tương đương tiền 110 500.000 450.000
Hàng tồn kho 140 1.500.000 1.400.000
Tài sản dài hạn 200 3.000.000 2.800.000
Tài sản cố định 220 2.000.000 1.900.000
TỔNG TÀI SẢN 270 8.000.000 7.300.000
Nợ phải trả 300 3.000.000 2.800.000
Nợ ngắn hạn 310 2.000.000 1.900.000
Nợ dài hạn 330 1.000.000 900.000
Vốn chủ sở hữu 400 5.000.000 4.500.000
TỔNG NGUỒN VỐN 440 8.000.000 7.300.000
`;

describe("regression — inline format still works after split-block changes", () => {
  it("extracts totalAssets from inline format (triệu đồng)", () => {
    const bs = extractBalanceSheet(INLINE_BS);
    // 8,000,000 triệu = already in triệu, no magnitude inference needed
    expect(bs.totalAssets).toBeGreaterThan(7_000_000);
    expect(bs.totalAssets).toBeLessThan(9_000_000);
  });

  it("extracts equity.total from inline format", () => {
    const bs = extractBalanceSheet(INLINE_BS);
    expect(bs.equity.total).toBeGreaterThan(4_000_000);
    expect(bs.equity.total).toBeLessThan(6_000_000);
  });
});
