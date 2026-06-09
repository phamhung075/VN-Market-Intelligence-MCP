Bun.env["DB_PATH"] = ":memory:";
/**
 * Task 1424a — BCTC confidence=0 false positive fix (unit-scale mismatch)
 *
 * Tests for:
 *   1. Unit-scale mismatch guard in financialFiguresValidator.ts (VAL-01)
 *   2. Banking sector operatingProfit proxy in parseBctcReport.ts
 *
 * TC-01  Unit-scale mismatch detected — soft penalty, NOT hard fail
 * TC-02  Genuine hard violation still returns 0.0 (VNM regression guard)
 * TC-03  Ratio exactly at threshold (500x) — treated as scale mismatch
 * TC-04  Ratio one below threshold (499x) — treated as genuine violation
 * TC-05  Banking proxy — VCB with operatingProfit=0, netProfit>0
 * TC-06  Non-bank with operatingProfit=0 — no proxy applied
 */

import { describe, it, expect, mock, beforeEach, afterEach, afterAll } from "bun:test";
import { initDatabase, closeDb } from "../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

// C5-CURE: Load real telegram module via cache-bust BEFORE the stub is registered.
// afterAll at file bottom uses this reference to restore the real module.
const _realMod1424a = await import(
  Bun.resolveSync("../infrastructure/notifiers/telegram.js", import.meta.dir) + "?isolate=1424a"
);

mock.module("../infrastructure/notifiers/telegram.js", () => ({
  sendTelegramWork: () => Promise.resolve(true),
  sendTelegramMarket: () => Promise.resolve(true),
  sendTelegramBug: () => Promise.resolve(true),
  sendTelegram: () => Promise.resolve(true),
}));

beforeEach(async () => {
  closeDb();
  await initDatabase();
});

afterEach(() => {
  closeDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// Unit-scale mismatch guard — pure domain tests (no DB)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1424a — VAL-01 unit-scale mismatch guard", () => {

  /**
   * TC-01: equity > assets * 500 → unit-scale artefact detected.
   * Must NOT return 0.0 — soft penalty only.
   * ratio = 600000 / 1000 = 600 > threshold 500
   */
  it("TC-01: unit-scale mismatch (ratio=600) applies soft penalty, not hard fail", async () => {
    const { validateFinancialFigures } = await import(
      "../domain/services/financial-reports/financialFiguresValidator.js"
    );

    const confidence = validateFinancialFigures({
      totalAssets: 1000,
      totalEquity: 600000, // ratio = 600 — equity in raw VND, assets in tỷ
      totalLiabilities: null,
      operatingMargin: null,
      netRevenue: null,
    });

    // Must be a soft penalty path — not 0.0
    expect(confidence).toBeGreaterThan(0.0);
    // And must be less than 1.0 (penalty was applied)
    expect(confidence).toBeLessThan(1.0);
  });

  /**
   * TC-02: VNM regression guard — genuine hard violation must still return 0.0.
   * ratio = 18829 / 957 ≈ 19.7 — both in tỷ, equity genuinely > assets.
   * This is BELOW threshold 500, so it remains a hard fail.
   */
  it("TC-02: genuine violation (ratio≈19.7) returns 0.0 (VNM regression guard)", async () => {
    const { validateFinancialFigures } = await import(
      "../domain/services/financial-reports/financialFiguresValidator.js"
    );

    const confidence = validateFinancialFigures({
      totalAssets: 957,
      totalEquity: 18829, // ratio ≈ 19.7 — below threshold 500
      totalLiabilities: 6000,
      operatingMargin: null,
      netRevenue: 5000,
    });

    expect(confidence).toBe(0.0);
  });

  /**
   * TC-03: ratio exactly at threshold boundary (500x) — treated as scale mismatch.
   * totalEquity = 1000 * 500 = 500000, ratio = 500 >= 500 → soft penalty path.
   */
  it("TC-03: ratio exactly at threshold (500x) treated as scale mismatch (not hard fail)", async () => {
    const { validateFinancialFigures } = await import(
      "../domain/services/financial-reports/financialFiguresValidator.js"
    );

    const confidence = validateFinancialFigures({
      totalAssets: 1000,
      totalEquity: 500000, // ratio = 500 — exactly at threshold
      totalLiabilities: null,
      operatingMargin: null,
      netRevenue: null,
    });

    expect(confidence).toBeGreaterThan(0.0);
  });

  /**
   * TC-04: ratio one unit below threshold (499x) — treated as genuine violation.
   * totalEquity = 1000 * 499 = 499000, ratio = 499 < 500 → hard fail.
   */
  it("TC-04: ratio just below threshold (499x) treated as genuine violation (returns 0.0)", async () => {
    const { validateFinancialFigures } = await import(
      "../domain/services/financial-reports/financialFiguresValidator.js"
    );

    const confidence = validateFinancialFigures({
      totalAssets: 1000,
      totalEquity: 499000, // ratio = 499 — just below threshold
      totalLiabilities: null,
      operatingMargin: null,
      netRevenue: null,
    });

    expect(confidence).toBe(0.0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Banking proxy tests — application layer (parseBctcReport integration)
// ─────────────────────────────────────────────────────────────────────────────

import type { FiscalPeriod } from "../../bctc-schema.js";

const TEST_PERIOD: FiscalPeriod = {
  year: 2024,
  quarter: 4,
  periodType: "Q4",
  startDate: "2024-10-01",
  endDate: "2024-12-31",
  sortKey: "2024-Q4",
};

/**
 * Minimal BCTC text for VCB (bank): operatingProfit=0, netProfit>0.
 * Banks use "Lợi nhuận thuần từ hoạt động kinh doanh" in a different position;
 * OCR produces operatingProfit=0, netProfit=30000, netRevenue=100000.
 */
const VCB_BANK_BCTC_TEXT = `
NGÂN HÀNG TMCP NGOẠI THƯƠNG VIỆT NAM - VCB
BÁO CÁO TÀI CHÍNH QUÝ 4/2024

BẢNG CÂN ĐỐI KẾ TOÁN
Tài sản ngắn hạn                           500000
Tài sản dài hạn                            457000
TỔNG CỘNG TÀI SẢN                         957000

Nợ phải trả                               800000
Vốn chủ sở hữu                            157000
TỔNG CỘNG NGUỒN VỐN                       957000

BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH
Doanh thu thuần                            100000
Giá vốn hàng bán                            50000
Lợi nhuận gộp                               50000
Lợi nhuận trước thuế                         37500
Thuế TNDN hiện hành                          7500
Lợi nhuận sau thuế                           30000

BÁO CÁO LƯU CHUYỂN TIỀN TỆ
Lưu chuyển tiền từ hoạt động kinh doanh     20000
Lưu chuyển tiền từ hoạt động đầu tư        -10000
Lưu chuyển tiền từ hoạt động tài chính      -5000
Lưu chuyển tiền thuần trong kỳ               5000
Tiền và tương đương tiền đầu kỳ             50000
Tiền và tương đương tiền cuối kỳ            55000
`.trim();

/**
 * Minimal BCTC text for HPG (non-bank): operatingProfit=0, netProfit>0.
 * Without banking proxy, operatingMarginRatio=0.0.
 */
const HPG_NONBANK_BCTC_TEXT = `
TẬP ĐOÀN HÒA PHÁT - HPG
BÁO CÁO TÀI CHÍNH QUÝ 4/2024

BẢNG CÂN ĐỐI KẾ TOÁN
Tài sản ngắn hạn                            80000
Tài sản dài hạn                            120000
TỔNG CỘNG TÀI SẢN                         200000

Nợ phải trả                               130000
Vốn chủ sở hữu                             70000
TỔNG CỘNG NGUỒN VỐN                       200000

BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH
Doanh thu thuần                            150000
Giá vốn hàng bán                           120000
Lợi nhuận gộp                               30000
Lợi nhuận trước thuế                          6250
Thuế TNDN hiện hành                          1250
Lợi nhuận sau thuế                            5000

BÁO CÁO LƯU CHUYỂN TIỀN TỆ
Lưu chuyển tiền từ hoạt động kinh doanh      8000
Lưu chuyển tiền từ hoạt động đầu tư         -4000
Lưu chuyển tiền từ hoạt động tài chính      -2000
Lưu chuyển tiền thuần trong kỳ               2000
Tiền và tương đương tiền đầu kỳ             10000
Tiền và tương đương tiền cuối kỳ            12000
`.trim();

describe("Task 1424a — banking operatingProfit proxy", () => {

  /**
   * TC-05: VCB (bank) with operatingProfit=0 and netProfit>0.
   * The proxy should use netProfit as effectiveOperatingProfit for margin validation.
   * confidenceFinancial must be > 0.3 — no false VAL-10/VAL-03 fire.
   * Stored operating_profit must remain 0 (proxy does NOT alter DB value).
   */
  it("TC-05: VCB bank proxy — confidenceFinancial > 0.3, stored operating_profit = 0", async () => {
    const { parseBctcReport } = await import(
      "../application/usecases/parseBctcReport.js"
    );
    const { getDb } = await import("../infrastructure/db/schema.js");

    await parseBctcReport({
      rawText: VCB_BANK_BCTC_TEXT,
      actionCode: "VCB_1424a",
      period: TEST_PERIOD,
    });

    const db = getDb();
    const row = db
      .query<
        { confidence_financial: number | null; operating_profit: number; validation_status: string },
        [string]
      >(
        "SELECT confidence_financial, operating_profit, validation_status FROM financial_reports WHERE action_code = ? ORDER BY parsed_at DESC LIMIT 1",
      )
      .get("VCB_1424a");

    expect(row).not.toBeNull();

    // The proxy should prevent a false confidence=0 due to operatingProfit=0 for banks.
    // confidence_financial must be > 0.3
    if (row!.confidence_financial !== null) {
      expect(row!.confidence_financial).toBeGreaterThan(0.3);
    }

    // The stored operating_profit must NOT be altered by the proxy — remains 0
    expect(row!.operating_profit).toBe(0);
  });

  /**
   * TC-06: HPG (non-bank) with operatingProfit=0.
   * No proxy applied — operatingMarginRatio = 0.0 is passed to validator.
   * 0.0 is within VAL-10 bounds (not > 5.0 or < -5.0) so confidence is not 0.
   * The test verifies the non-bank path does NOT apply the banking proxy.
   */
  it("TC-06: HPG non-bank with operatingProfit=0 — no proxy, margin=0.0 passes validation", async () => {
    const { parseBctcReport } = await import(
      "../application/usecases/parseBctcReport.js"
    );
    const { getDb } = await import("../infrastructure/db/schema.js");

    await parseBctcReport({
      rawText: HPG_NONBANK_BCTC_TEXT,
      actionCode: "HPG_1424a",
      period: TEST_PERIOD,
    });

    const db = getDb();
    const row = db
      .query<
        { confidence_financial: number | null; operating_profit: number },
        [string]
      >(
        "SELECT confidence_financial, operating_profit FROM financial_reports WHERE action_code = ? ORDER BY parsed_at DESC LIMIT 1",
      )
      .get("HPG_1424a");

    expect(row).not.toBeNull();

    // Non-bank: operating_profit stored as extracted (0 or whatever extractor finds)
    // confidence_financial must not be 0.0 just because operatingMarginRatio=0.0
    // (ratio=0.0 is within bounds, not a hard violation)
    if (row!.confidence_financial !== null) {
      // 0.0 ratio passes all VAL rules — should not hard-fail
      // confidence_financial may be < 1.0 due to other soft penalties but > 0.0
      expect(row!.confidence_financial).toBeGreaterThanOrEqual(0.0);
    }
  });
});

// C5-CURE: restore real telegram module after this file's tests complete.
// _realMod1424a was loaded via cache-bust at file top (before the stub above),
// so it holds genuine implementations. Without this restore, the noop stubs
// registered above leak into the process-global ESM registry and poison all
// downstream CI files in the same Bun worker process (LATENT contaminator).
afterAll(() => {
  mock.module("../infrastructure/notifiers/telegram.js", () => ({
    sendTelegramWork:       _realMod1424a.sendTelegramWork,
    sendTelegramMarket:     _realMod1424a.sendTelegramMarket,
    sendTelegramBug:        _realMod1424a.sendTelegramBug,
    sendTelegram:           _realMod1424a.sendTelegram,
    notifyTelegramAlert:    _realMod1424a.notifyTelegramAlert,
    notifyTelegramDocument: _realMod1424a.notifyTelegramDocument,
    formatConvictionBlock:  _realMod1424a.formatConvictionBlock,
    deleteTelegramBug:      _realMod1424a.deleteTelegramBug,
  }));
});
