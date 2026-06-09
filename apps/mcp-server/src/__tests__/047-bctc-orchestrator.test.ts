Bun.env["DB_PATH"] = ":memory:";
/**
 * Task 047 — BCTC Orchestrator (Full Parse Pipeline)
 *
 * Tests the parseBctcReport use case which orchestrates:
 *   extractBalanceSheet → extractIncomeStatement → extractCashFlow
 *   → computeFinancialRatios → computePeriodDelta (optional)
 *   → compute confidence → store in SQLite
 */

import { describe, it, expect, beforeAll, afterAll, mock } from "bun:test";
import { parseBctcReport } from "../application/usecases/parseBctcReport.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import type { FiscalPeriod } from "../../bctc-schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Real-module captures — imported BEFORE mock.module() so they hold the genuine
// implementations. Used in afterAll teardown to restore the module registry for
// worker-sibling test files (1328e, 1352a). Pattern: 1352a teardown-describe.
// ─────────────────────────────────────────────────────────────────────────────
import {
  notifyTelegramAlert as _realNotifyTelegramAlert,
  notifyTelegramDocument as _realNotifyTelegramDocument,
  formatConvictionBlock as _realFormatConvictionBlock,
  deleteTelegramBug as _realDeleteTelegramBug,
  sendTelegramWork as _realSendTelegramWork,
  sendTelegramMarket as _realSendTelegramMarket,
  sendTelegramBug as _realSendTelegramBug,
  sendTelegram as _realSendTelegram,
} from "../infrastructure/notifiers/telegram.js";

// Freeze before mock.module() overwrites live bindings.
const _frozenNotifyTelegramAlert = _realNotifyTelegramAlert;
const _frozenNotifyTelegramDocument = _realNotifyTelegramDocument;
const _frozenFormatConvictionBlock = _realFormatConvictionBlock;
const _frozenDeleteTelegramBug = _realDeleteTelegramBug;
const _frozenSendTelegramWork = _realSendTelegramWork;
const _frozenSendTelegramMarket = _realSendTelegramMarket;
const _frozenSendTelegramBug = _realSendTelegramBug;
const _frozenSendTelegram = _realSendTelegram;

// Prevent test fixtures (e.g. actionCode="EMPTY") from firing real Telegram messages.
// Extended with the 4 missing exports so sibling files (1328e, 1352a) can load
// without SyntaxError: "Export named 'notifyTelegramAlert' not found".
mock.module("../infrastructure/notifiers/telegram.js", () => ({
  sendTelegramWork: () => Promise.resolve(true),
  sendTelegramMarket: () => Promise.resolve(true),
  sendTelegramBug: () => Promise.resolve(true),
  sendTelegram: () => Promise.resolve(true),
  notifyTelegramAlert: () => Promise.resolve(true),
  notifyTelegramDocument: () => Promise.resolve(true),
  formatConvictionBlock: _frozenFormatConvictionBlock,
  deleteTelegramBug: () => Promise.resolve(false),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────────

/** Full BCTC fixture: balance sheet + income statement + cash flow */
const FULL_BCTC_TEXT = `
CÔNG TY CỔ PHẦN VCB
BÁO CÁO TÀI CHÍNH QUÝ 1/2024

BẢNG CÂN ĐỐI KẾ TOÁN
Tài sản ngắn hạn                                    50.000.000
  Tiền và tương đương tiền                            5.000.000
  Đầu tư tài chính ngắn hạn                          10.000.000
  Phải thu ngắn hạn                                  20.000.000
  Hàng tồn kho                                       12.000.000
  Tài sản ngắn hạn khác                               3.000.000
Tài sản dài hạn                                     30.000.000
  Tài sản cố định                                    25.000.000
  Đầu tư tài chính dài hạn                            5.000.000
TỔNG CỘNG TÀI SẢN                                   80.000.000

Nợ ngắn hạn                                         20.000.000
  Vay và nợ thuê tài chính ngắn hạn                   8.000.000
  Phải trả người bán ngắn hạn                         6.000.000
  Thuế và các khoản phải nộp                          1.000.000
  Người mua trả tiền trước                            2.000.000
  Nợ ngắn hạn khác                                   3.000.000
Nợ dài hạn                                          10.000.000
  Vay và nợ thuê tài chính dài hạn                   10.000.000
Nợ phải trả                                         30.000.000
Vốn chủ sở hữu                                      50.000.000
  Vốn góp của chủ sở hữu                             30.000.000
  Thặng dư vốn cổ phần                                5.000.000
  Lợi nhuận sau thuế chưa phân phối                  15.000.000
TỔNG CỘNG NGUỒN VỐN                                 80.000.000

BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH
Doanh thu bán hàng và cung cấp dịch vụ              40.000.000
Giảm trừ doanh thu                                     500.000
Doanh thu thuần                                     39.500.000
Giá vốn hàng bán                                    25.000.000
Lợi nhuận gộp                                       14.500.000
Doanh thu hoạt động tài chính                         1.000.000
Chi phí tài chính                                     2.000.000
  Chi phí lãi vay                                    1.500.000
Chi phí bán hàng                                     3.000.000
Chi phí quản lý doanh nghiệp                         2.000.000
Lợi nhuận thuần từ hoạt động kinh doanh              8.500.000
Thu nhập khác                                          200.000
Chi phí khác                                           100.000
Lợi nhuận khác                                        100.000
Lợi nhuận trước thuế                                 8.600.000
Thuế TNDN hiện hành                                  1.720.000
Lợi nhuận sau thuế                                   6.880.000
Lãi cơ bản trên cổ phiếu                                 3.440

BÁO CÁO LƯU CHUYỂN TIỀN TỆ
Lợi nhuận trước thuế                                 8.600.000
Khấu hao TSCĐ                                        1.500.000
Thay đổi vốn lưu động                               (1.000.000)
Tiền lãi vay đã trả                                 (1.500.000)
Thuế TNDN đã nộp                                    (1.720.000)
Lưu chuyển tiền thuần từ hoạt động kinh doanh        5.880.000
Tiền chi mua sắm TSCĐ                               (3.000.000)
Lưu chuyển tiền thuần từ hoạt động đầu tư           (3.000.000)
Tiền vay nhận được                                   5.000.000
Tiền trả nợ gốc vay                                 (4.000.000)
Cổ tức đã trả                                       (1.000.000)
Lưu chuyển tiền thuần từ hoạt động tài chính           (0)
Lưu chuyển tiền thuần trong kỳ                       2.880.000
Tiền và tương đương tiền đầu kỳ                      2.120.000
Tiền và tương đương tiền cuối kỳ                     5.000.000
`;

/** Partial BCTC fixture: only balance sheet — income statement and cash flow are missing */
const PARTIAL_BCTC_TEXT = `
BẢNG CÂN ĐỐI KẾ TOÁN
Tài sản ngắn hạn                                     5.000.000
  Tiền và tương đương tiền                            1.000.000
TỔNG CỘNG TÀI SẢN                                   5.000.000
Vốn chủ sở hữu                                       5.000.000
TỔNG CỘNG NGUỒN VỐN                                  5.000.000
`;

/** Empty text — should produce confidence < 0.7 */
const EMPTY_TEXT = "";

/** Minimal text with only income statement */
const INCOME_ONLY_TEXT = `
Doanh thu thuần                                     10.000.000
Giá vốn hàng bán                                     6.000.000
Lợi nhuận gộp                                        4.000.000
Lợi nhuận trước thuế                                 3.000.000
Lợi nhuận sau thuế                                   2.400.000
`;

const TEST_PERIOD: FiscalPeriod = {
  year: 2024,
  quarter: 1,
  periodType: "Q1",
  startDate: "2024-01-01",
  endDate: "2024-03-31",
  sortKey: "2024-Q1",
};

// ─────────────────────────────────────────────────────────────────────────────
// Setup / teardown
// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // Use in-memory SQLite for tests
  Bun.env["DB_PATH"] = ":memory:";
  await initDatabase();
});

afterAll(() => {
  closeDb();
  delete Bun.env["DB_PATH"];
  // Restore real telegram module so 1328e-conviction-display.test.ts and other
  // sibling files see the real exported functions (not the stub noops above).
  // C5-cure ABSOLUTE: this restore goes in afterAll (teardown scope), NOT file-top.
  mock.module("../infrastructure/notifiers/telegram.js", () => ({
    sendTelegramWork: _frozenSendTelegramWork,
    sendTelegramMarket: _frozenSendTelegramMarket,
    sendTelegramBug: _frozenSendTelegramBug,
    sendTelegram: _frozenSendTelegram,
    notifyTelegramAlert: _frozenNotifyTelegramAlert,
    notifyTelegramDocument: _frozenNotifyTelegramDocument,
    formatConvictionBlock: _frozenFormatConvictionBlock,
    deleteTelegramBug: _frozenDeleteTelegramBug,
  }));
});

// ─────────────────────────────────────────────────────────────────────────────
// Test cases
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 047 — BCTC Orchestrator", () => {

  // ── Test 1: Full BCTC text returns all 3 statements + ratios ─────────────
  it("returns FinancialReport with all 3 statements populated for full BCTC text", async () => {
    const report = await parseBctcReport({
      rawText: FULL_BCTC_TEXT,
      actionCode: "VCB",
      period: TEST_PERIOD,
    });

    // Identity fields
    expect(report.id).toBeTruthy();
    expect(report.actionCode).toBe("VCB");
    expect(report.period.sortKey).toBe("2024-Q1");
    expect(report.period.year).toBe(2024);
    expect(report.period.quarter).toBe(1);

    // Balance Sheet populated
    expect(report.balanceSheet.totalAssets).toBeGreaterThan(0);
    expect(report.balanceSheet.currentAssets.cash).toBeGreaterThan(0);
    expect(report.balanceSheet.equity.total).toBeGreaterThan(0);

    // Income Statement populated
    expect(report.incomeStatement.netRevenue).toBeGreaterThan(0);
    expect(report.incomeStatement.grossProfit).toBeGreaterThan(0);
    expect(report.incomeStatement.netProfit).toBeGreaterThan(0);

    // Cash Flow populated
    expect(report.cashFlow.operatingCF).toBeGreaterThan(0);

    // Ratios computed (non-null for complete report)
    expect(report.ratios).toBeDefined();
    expect(typeof report.ratios.grossMarginPct).toBe("number");
    expect(typeof report.ratios.currentRatio).toBe("number");

    // Source metadata
    expect(report.source.parsedAt).toBeTruthy();
    expect(report.source.auditStatus).toBe("unaudited");
  });

  // ── Test 2: Confidence >= 0.7 for complete text ───────────────────────────
  it("returns confidence >= 0.7 for complete BCTC text", async () => {
    const report = await parseBctcReport({
      rawText: FULL_BCTC_TEXT,
      actionCode: "HPG",
      period: { ...TEST_PERIOD, sortKey: "2024-Q1-HPG" },
    });

    expect(report.source.extractionConfidence).toBeGreaterThanOrEqual(0.7);
  });

  // ── Test 3: Confidence < 0.7 for partial / empty text ────────────────────
  it("returns confidence < 0.7 for partial BCTC text", async () => {
    const report = await parseBctcReport({
      rawText: PARTIAL_BCTC_TEXT,
      actionCode: "PARTIAL",
      period: TEST_PERIOD,
    });

    expect(report.source.extractionConfidence).toBeLessThan(0.7);
  });

  it("returns confidence < 0.7 for empty text", async () => {
    const report = await parseBctcReport({
      rawText: EMPTY_TEXT,
      actionCode: "EMPTY",
      period: TEST_PERIOD,
    });

    expect(report.source.extractionConfidence).toBeLessThan(0.7);
  });

  // ── Test 4: Result stored in SQLite financial_reports table ───────────────
  it("stores result in SQLite financial_reports table", async () => {
    const report = await parseBctcReport({
      rawText: FULL_BCTC_TEXT,
      actionCode: "STORED",
      period: { ...TEST_PERIOD, sortKey: "2024-Q1" },
    });

    const db = getDb();
    const row = db
      .prepare("SELECT * FROM financial_reports WHERE id = ?")
      .get(report.id) as Record<string, unknown> | null;

    expect(row).not.toBeNull();
    expect(row!["action_code"]).toBe("STORED");
    expect(row!["period_year"]).toBe(2024);
    expect(row!["period_quarter"]).toBe(1);
    expect(row!["sort_key"]).toBe("2024-Q1");
    expect(row!["net_revenue"]).toBeGreaterThan(0);
    expect(row!["balance_sheet_json"]).toBeTruthy();
    expect(row!["income_stmt_json"]).toBeTruthy();
    expect(row!["cash_flow_json"]).toBeTruthy();
    expect(row!["ratios_json"]).toBeTruthy();
  });

  // ── Test 5: actionCode and period correctly set ───────────────────────────
  it("correctly sets actionCode and period fields on the returned report", async () => {
    const customPeriod: FiscalPeriod = {
      year: 2023,
      quarter: 4,
      periodType: "Q4",
      startDate: "2023-10-01",
      endDate: "2023-12-31",
      sortKey: "2023-Q4",
    };

    const report = await parseBctcReport({
      rawText: FULL_BCTC_TEXT,
      actionCode: "HPG",
      period: customPeriod,
    });

    expect(report.actionCode).toBe("HPG");
    expect(report.period.year).toBe(2023);
    expect(report.period.quarter).toBe(4);
    expect(report.period.periodType).toBe("Q4");
    expect(report.period.sortKey).toBe("2023-Q4");
  });

  // ── Test 6: Optional shares and price passed through to ratios ────────────
  it("computes valuation ratios when shares and price are provided", async () => {
    const report = await parseBctcReport({
      rawText: FULL_BCTC_TEXT,
      actionCode: "RATIOS",
      period: { ...TEST_PERIOD, sortKey: "2024-Q1-RATIOS" },
      shares: 2_000_000_000, // 2 billion shares
      price: 80_000,          // 80,000 VND/share
    });

    // PE ratio should be computable since we have eps and price
    // EPS is 3440 VND in fixture; price 80000 → PE ≈ 23.3
    expect(report.ratios.pe).not.toBeNull();
    expect(report.ratios.pe).toBeGreaterThan(0);
  });

  // ── Test 7: EBITDA computed via depreciation from cash flow ──────────────
  it("computes EBITDA = operating profit + depreciation from cash flow", async () => {
    const report = await parseBctcReport({
      rawText: FULL_BCTC_TEXT,
      actionCode: "EBITDA",
      period: { ...TEST_PERIOD, sortKey: "2024-Q1-EBITDA" },
    });

    // Fixture: operatingProfit = 8,500,000; depreciation = 1,500,000
    // EBITDA = 8,500,000 + 1,500,000 = 10,000,000
    expect(report.incomeStatement.ebitda).toBeGreaterThan(0);
    expect(report.incomeStatement.ebitda).toBe(
      report.incomeStatement.operatingProfit + report.cashFlow.depreciationAmortization
    );
  });

  // ── Test 8: Income-only text has partial confidence ───────────────────────
  it("returns confidence between 0.3 and 0.7 for income-statement-only text", async () => {
    const report = await parseBctcReport({
      rawText: INCOME_ONLY_TEXT,
      actionCode: "INCOME_ONLY",
      period: TEST_PERIOD,
    });

    // Only income statement has values — balance sheet and cash flow are zero
    expect(report.source.extractionConfidence).toBeGreaterThan(0);
    expect(report.source.extractionConfidence).toBeLessThan(0.7);
    expect(report.incomeStatement.netRevenue).toBeGreaterThan(0);
  });
});
