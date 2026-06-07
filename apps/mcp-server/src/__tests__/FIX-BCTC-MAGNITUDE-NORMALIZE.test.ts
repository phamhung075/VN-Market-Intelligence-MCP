/**
 * FIX-BCTC-MAGNITUDE-NORMALIZE — RED→GREEN fixture tests
 *
 * Tests the two-part fix for the balance-sheet parse path:
 *
 * Part 1 — Magnitude normalization catch-22:
 *   When split-column OCR layout leaves totalAssets=0 but other fields
 *   (equity.total, totalLiabilitiesAndEquity) are extracted from inline-format
 *   page 2 (label+value on same line), the old magnitude inference checked only
 *   totalAssets → missed raw VND → extractorGuards rejected equity as
 *   "impossible". Fix: scan ALL raw fields for large values (>1e9) when sentinel.
 *
 * Part 2 — extractorGuards post-normalization:
 *   Guard is applied after ÷1e6, so equity=4,466 tỷ → 4,466,380 triệu → passes.
 *   This is confirmed by the PPC fixture below (equity.total > 0 after fix).
 *
 * Part 3 — totalAssets identity fallback:
 *   When totalAssets=0 AND totalLiabilitiesAndEquity>0 (extracted from inline
 *   TỔNG CỘNG NGUỒN VỐN line), totalAssets is set from the sources-side total.
 *   BCTC identity: totalAssets ≡ totalLiabilitiesAndEquity.
 *
 * Part 4 — Within-BS intra-statement unit mismatch (HPG case):
 *   detectBsIntraStmtUnitMismatch(totalAssets, totalLiabilities) > 100x → true.
 *
 * Evidence base (dispatcher-verified 2026-06-07):
 *   PPC Q4-2025: assets 5,246,604,575,370 / liab 780,223,778,402 / equity 4,466,380,796,968
 *   HPG Q1-2026: assets 400,271,001,803 vs liab 76,754,658 (~5000× mixed units)
 *   DPM Q4-2025: assets 1,369,863 vs liab 767 (already triệu — should not be touched)
 */

import { describe, it, expect } from "bun:test";
import { extractBalanceSheet } from "../domain/services/financial-reports/balanceSheetExtractor";
import {
  detectBsIntraStmtUnitMismatch,
} from "../domain/services/financial-reports/financialFiguresValidator";

// ---------------------------------------------------------------------------
// MNORM-1: PPC Q4-2025 — split-column OCR (labels page 9, values column far below)
//   Page 9: labels + item codes only (no inline values for assets side)
//   Page 10: NGUỒN VỐN side with inline values (label+code+value on same line)
//   Unit: "Bon vi: VND" (OCR-corrupted "Đơn vị: VND") — bare VND sentinel
// ---------------------------------------------------------------------------

// Represents the OCR-concatenated full text of PPC Q4-2025 BS pages
const PPC_Q4_2025 = `
MẪU SỐ B 01-DN
Ban hành theo Thông tư số 200/2014/TT-BTC

BANG CÂN ĐỐI KẾ TOÁN
Tại ngày 31 tháng 12 năm 2025

TAI SAN
TAI SAN NGAN HAN
Tiền và các khoản tương đương tiền
Tiền
Các khoản tương đương tiền
Đầu tư tài chính ngắn hạn
Đầu tư nắm giữ đến ngày đáo hạn
Các khoản phải thu ngắn hạn
Phải thu ngắn hạn của khách hàng
Trả trước cho người bán ngắn hạn
Hàng tồn kho
Hàng tồn kho
TAI SAN DAI HAN
Tài sản cố định hữu hình
Tài sản dài hạn khác
TỔNG CỘNG TÀI SẢN
(270=100+200)

100

110
111
112
120
123
130
131
132

140
141

200

220
221

260
261

270

Mã số Thuyết minh

Bon vi: VND
Số cuối năm  Số đầu năm

2.490.349.536.763
395.414.669.779
20.414.669.779
375.000.000.000
40.000.000.000
40.000.000.000

1.102.042.818.563
1.063.153.504.238
29.879.459.595

725.512.954.061
788.458.633.286

2.756.255.038.607
192.968.293.380
191.977.519.762

41.375.366.460

5.246.604.575.370

5.533.688.169.131

MẪU SỐ B 01-DN

BẢNG CÂN ĐỐI KẾ TOÁN (Tiếp theo)

Đơn vị: VND
NGUỒN VỐN Mã số Thuyết Số cuối năm Số đầu năm
C. NO PHAI TRA 300 780.223.778.402 1.009.356.204.934
I. Nợ ngắn hạn 310 780.223.778.402 1.009.356.204.934
1. Phải trả người bán ngắn hạn 311 663.788.686.477 798.613.428.414
2. Người mua trả tiền trước ngắn hạn 312 7.523.350 350.501.682
D. _ VỐN CHỦ SỞ HỮU 400 4.466.380.796.968 4.524.331.964.197
I. Vốn chủ sởhữu 410 19 4.466.380.796.968 4.524.331.964.197
1. Vốn góp của chủ sở hữu 411 3.262.350.000.000 3.262.350.000.000
2. Thặng dư vốn cổ phần 412 11.692.500.615 11.692.500.615
4. Cổ phiếu quỹ 415 (87.388.368.719) (87.388.368.719)
5. Quỹ đầu tư phát triển 418 768.728.447.071 658.981.464.619
6. Lợi nhuận sau thuế chưa phân phối 421 190.200.865.081 376.271.688.271
TỔNG CỘNG NGUỒN VỐN (440=300+400) 440 5.246.604.575.370 5.533.688.169.131

BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH
`;

// Canonical values in raw VND (from OCR text)
const PPC_RAW_ASSETS = 5_246_604_575_370;
const PPC_RAW_LIAB = 780_223_778_402;
const PPC_RAW_EQUITY = 4_466_380_796_968;

// Canonical values in triệu (project canonical unit = triệu VND)
const PPC_TRIEU_ASSETS = PPC_RAW_ASSETS / 1_000_000;    // 5,246,604.575 triệu
const PPC_TRIEU_LIAB = PPC_RAW_LIAB / 1_000_000;        // 780,223.778 triệu
const PPC_TRIEU_EQUITY = PPC_RAW_EQUITY / 1_000_000;    // 4,466,380.797 triệu

// ---------------------------------------------------------------------------
// MNORM-2: DPM Q4-2025 — small numbers already in triệu (idempotency check)
//   Magnitude inference must NOT trigger for normal triệu-scale statements.
// ---------------------------------------------------------------------------
const DPM_TRIEU = `
Đơn vị tính: Triệu đồng

BẢNG CÂN ĐỐI KẾ TOÁN

A. TÀI SẢN NGẮN HẠN                             800.000
I. Tiền và các khoản tương đương tiền              200.000
B. TÀI SẢN DÀI HẠN                              569.863
TỔNG CỘNG TÀI SẢN                              1.369.863

A. NỢ PHẢI TRẢ                                     767
I. Nợ ngắn hạn                                      767
B. VỐN CHỦ SỞ HỮU                              1.369.096
I. Vốn góp của chủ sở hữu                         600.000
TỔNG CỘNG NGUỒN VỐN                            1.369.863
`;

// ---------------------------------------------------------------------------
// MNORM-3: HPG mixed-units — assets raw VND, liabilities triệu (intra-BS mismatch)
//   This is not a parse fix (the extractor cannot fix it) — we flag it via
//   detectBsIntraStmtUnitMismatch. The validator then marks low_confidence.
// ---------------------------------------------------------------------------

describe("FIX-BCTC-MAGNITUDE-NORMALIZE — Part 1+2+3: PPC Q4-2025 split-column OCR", () => {
  const bs = extractBalanceSheet(PPC_Q4_2025);

  it("MNORM-PPC-1: totalAssets normalized to triệu (not 0, not raw VND)", () => {
    // Was: 0 (split-block extraction failed)
    // Now: 5,246,604.575 triệu via identity fallback + magnitude inference
    expect(bs.totalAssets).toBeCloseTo(PPC_TRIEU_ASSETS, 0);
    expect(bs.totalAssets).toBeGreaterThan(1_000_000);  // > 1M triệu — clearly triệu not raw
    expect(bs.totalAssets).toBeLessThan(PPC_RAW_ASSETS); // not raw VND
  });

  it("MNORM-PPC-2: totalLiabilities normalized to triệu", () => {
    // Was: 780223778402 (raw VND, not normalized) or 0
    // Now: ~780,223 triệu
    expect(bs.totalLiabilities).toBeCloseTo(PPC_TRIEU_LIAB, 0);
    expect(bs.totalLiabilities).toBeLessThan(PPC_RAW_LIAB); // not raw VND
  });

  it("MNORM-PPC-3: equity.total normalized to triệu (guard no longer rejects it)", () => {
    // Was: 0 (guard rejected 4,466,380,796,968 as > GUARD_MAX=2T triệu)
    // Now: ~4,466,380 triệu (well within GUARD_MAX)
    expect(bs.equity.total).toBeCloseTo(PPC_TRIEU_EQUITY, 0);
    expect(bs.equity.total).toBeGreaterThan(0); // guard no longer rejects
    expect(bs.equity.total).toBeLessThan(PPC_RAW_EQUITY); // not raw VND
  });

  it("MNORM-PPC-4: totalLiabilitiesAndEquity normalized and equals assets", () => {
    expect(bs.totalLiabilitiesAndEquity).toBeCloseTo(PPC_TRIEU_ASSETS, 0);
    expect(bs.totalLiabilitiesAndEquity).toBe(bs.totalAssets);
  });

  it("MNORM-PPC-5: accounting identity holds (delta ~0)", () => {
    const sum = bs.totalLiabilities + bs.equity.total;
    const delta = Math.abs(bs.totalAssets - sum);
    // Allow floating-point tolerance: < 1 triệu (0.00002% of 5.2M triệu)
    expect(delta).toBeLessThan(1);
  });
});

// ---------------------------------------------------------------------------
// MNORM: DPM — already-triệu statement is idempotent
// ---------------------------------------------------------------------------

describe("FIX-BCTC-MAGNITUDE-NORMALIZE — idempotency: already-triệu statements unchanged", () => {
  const bs = extractBalanceSheet(DPM_TRIEU);

  it("MNORM-DPM-1: totalAssets stays at triệu value (no double-divide)", () => {
    // Explicit triệu header → multiplier=1 → magnitude inference does NOT fire
    expect(bs.totalAssets).toBe(1_369_863);
  });

  it("MNORM-DPM-2: totalLiabilities stays at triệu value", () => {
    expect(bs.totalLiabilities).toBe(767);
  });

  it("MNORM-DPM-3: equity.total stays at triệu value", () => {
    // 1,369,863 - 767 = 1,369,096
    expect(bs.equity.total).toBeCloseTo(1_369_096, 0);
  });
});

// ---------------------------------------------------------------------------
// MNORM: HPG — within-BS intra-statement unit mismatch detection
// ---------------------------------------------------------------------------

describe("FIX-BCTC-MAGNITUDE-NORMALIZE — Part 4: detectBsIntraStmtUnitMismatch", () => {
  it("MNORM-HPG-1: returns true when assets ~5000× larger than liabilities", () => {
    // HPG Q1-2026 pattern: assets in raw VND, liabilities in triệu
    const assetsRawVnd = 400_271_001_803;  // raw VND value stored as triệu
    const liabTrieu = 76_754_658;          // triệu value
    // ratio ≈ 5214 > 100 → mismatch
    expect(detectBsIntraStmtUnitMismatch(assetsRawVnd, liabTrieu)).toBe(true);
  });

  it("MNORM-HPG-2: returns false for normally proportioned BS (real company)", () => {
    // PPC: assets=5,246,604 triệu, liab=780,223 triệu → ratio ~6.7 < 100
    expect(detectBsIntraStmtUnitMismatch(5_246_604, 780_223)).toBe(false);
  });

  it("MNORM-HPG-3: returns false for high-equity company (liab/assets ~1%)", () => {
    // Cash company: assets=10,000,000, liab=50,000 → ratio=200 → detects as mismatch
    // BUT: 200 > 100 so this IS flagged. That's correct — 200x is suspicious.
    // A legitimate 99% equity company would have ratio ~100x but never much more.
    // Using ratio=99 here (just below threshold) to test boundary.
    expect(detectBsIntraStmtUnitMismatch(10_000_000, 101_010)).toBe(false); // ratio ~99
  });

  it("MNORM-HPG-4: returns false when either input is null or zero", () => {
    expect(detectBsIntraStmtUnitMismatch(null, 780_223)).toBe(false);
    expect(detectBsIntraStmtUnitMismatch(5_246_604, null)).toBe(false);
    expect(detectBsIntraStmtUnitMismatch(0, 780_223)).toBe(false);
    expect(detectBsIntraStmtUnitMismatch(5_246_604, 0)).toBe(false);
  });

  it("MNORM-HPG-5: returns true when liabilities are ~5000× larger than assets (reversed mismatch)", () => {
    // Reversed direction: liab in raw VND, assets in triệu
    expect(detectBsIntraStmtUnitMismatch(76_754, 400_271_001_803)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// MNORM: guard-level regression — GUARD_MAX must pass post-normalization values
// ---------------------------------------------------------------------------

describe("FIX-BCTC-MAGNITUDE-NORMALIZE — extractorGuards: real PPC equity passes guard", () => {
  it("MNORM-GUARD-1: equity.total > 0 after normalization (guard does not reject)", () => {
    const bs = extractBalanceSheet(PPC_Q4_2025);
    // If guard still rejected, equity.total would be 0
    expect(bs.equity.total).toBeGreaterThan(0);
  });

  it("MNORM-GUARD-2: equity.total is within GUARD_MAX (2T triệu)", () => {
    const bs = extractBalanceSheet(PPC_Q4_2025);
    const GUARD_MAX = 2_000_000_000_000; // 2T triệu (from extractorGuards.ts)
    expect(bs.equity.total).toBeLessThan(GUARD_MAX);
  });
});
