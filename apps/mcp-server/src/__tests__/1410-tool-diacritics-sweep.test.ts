Bun.env["DB_PATH"] = ":memory:"; // must be first line

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";

// ── Always-exported (no @ts-expect-error) ────────────────────────────────────
import { handleGetLabelAccuracyReport } from "../interface/mcp/tools/macro/calibrationTools.js";
import { getClimateRiskSignals } from "../interface/mcp/tools/sector/climateTools.js";
import { getCreditFlowSignalHandler } from "../interface/mcp/tools/sector/creditFlowTools.js";
import { getEnergyGridStatus } from "../interface/mcp/tools/sector/energyTools.js";
import { getInsiderSignalsHandler } from "../interface/mcp/tools/sector/leadershipTools.js";
import { handleGetMarketMessageDigest } from "../interface/mcp/tools/briefings/marketMessageTools.js";
import { buildSectorComparisonOutput } from "../interface/mcp/tools/sector/sectorComparisonTools.js";
import { getSectorRotationReport } from "../interface/mcp/tools/sector/sectorRotationTools.js";
import { formatTickerIntelligence } from "../interface/mcp/tools/market-data/tickerIntelligenceTools.js";
// Sprint 144 regression (already exported, already GREEN)
import { formatKinhDichTradingContext } from "../interface/mcp/tools/kinhdich/kinhDichTools.js";
import { formatTaIndicatorReport } from "../interface/mcp/tools/market-data/technicalIndicatorTools.js";
import { buildSupplyChainExposureOutput } from "../interface/mcp/tools/sector/supplyChainTools.js";

// ── Not yet exported — use namespace import + dynamic property access ─────────
// Functions accessed via (ns as any)["name"] so @ts-expect-error is not needed here;
// the expect(fn).toBeDefined() assertion is what goes RED until task 1411 adds exports.
import * as agentSignalToolsNs from "../interface/mcp/tools/news-analysis/agentSignalTools.js";
import * as alertAccuracyNs from "../interface/mcp/tools/alerts/alertAccuracy.js";
import * as alertsNs from "../interface/mcp/tools/alerts/alerts.js";
import * as bctcFullToolsNs from "../interface/mcp/tools/financial-reports/bctcFullTools.js";
import * as correlationToolsNs from "../interface/mcp/tools/sector/correlationTools.js";
import * as performanceToolsNs from "../interface/mcp/tools/portfolio/performanceTools.js";
import * as pharmaToolsNs from "../interface/mcp/tools/sector/pharmaTools.js";
import * as portfolioRiskToolNs from "../interface/mcp/tools/portfolio/portfolioRiskTool.js";
import * as positionToolsNs from "../interface/mcp/tools/portfolio/positionTools.js";
import * as predictionToolsNs from "../interface/mcp/tools/macro/predictionTools.js";
import * as priceAlertToolsNs from "../interface/mcp/tools/market-data/priceAlertTools.js";
import * as priceHistoryToolsNs from "../interface/mcp/tools/market-data/priceHistoryTools.js";
import * as rebalancingToolsNs from "../interface/mcp/tools/portfolio/rebalancingTools.js";
import * as sentimentTrendToolsNs from "../interface/mcp/tools/news-analysis/sentimentTrendTools.js";
import * as telegramReportToolsNs from "../interface/mcp/tools/briefings/telegramReportTools.js";

import type { ToolCandle as DailyCandle } from "../interface/mcp/tools/market-data/technicalIndicatorTools.js";
import type { DomainType } from "../../bctc-schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeMemDb(): Database {
  return new Database(":memory:");
}

/** In-memory DB with market_messages table (empty rows → triggers no-data path). */
function makeMemDbWithMessages(): Database {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE IF NOT EXISTS market_messages (
    id INTEGER PRIMARY KEY,
    from_agent TEXT,
    verdict TEXT,
    reviewed_at TEXT,
    content TEXT
  )`);
  return db;
}

function flatCandles(n: number, price = 100): DailyCandle[] {
  return Array.from({ length: n }, (_, i) => ({
    day: `2026-01-${String(i + 1).padStart(2, "0")}`,
    close: price,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// RED tests — Sprint 145 diacritics sweep
// ─────────────────────────────────────────────────────────────────────────────

describe("Sprint 145 — tool diacritics sweep", () => {
  // Case 1 — agentSignalTools
  it("formatSignalLines: empty signals returns accented no-data message", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (agentSignalToolsNs as any)["formatSignalLines"] as ((...a: unknown[]) => string) | undefined;
    expect(fn).toBeDefined();
    const result = fn!([], "test-agent");
    expect(result).toContain("Không có tín hiệu mới.");
    expect(result).not.toContain("Khong co tin hieu moi");
  });

  // Case 2 — alertAccuracy
  // REWRITE: formatAccuracyReport returns AccuracyReport object (not string); access .text
  it("formatAccuracyReport: zero rows returns accented message", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (alertAccuracyNs as any)["formatAccuracyReport"] as ((...a: unknown[]) => { text: string }) | undefined;
    expect(fn).toBeDefined();
    const result = fn!([], 30, "");
    expect(result.text).toContain("Không có dữ liệu");
    expect(result.text).not.toContain("Khong co du lieu");
  });

  // Case 3 — alerts
  it("formatPriceAlertsSection: empty rows returns accented header", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (alertsNs as any)["formatPriceAlertsSection"] as ((...a: unknown[]) => string) | undefined;
    expect(fn).toBeDefined();
    const result = fn!([], new Map());
    expect(result).toContain("Cảnh báo giá");
    expect(result).not.toContain("Canh bao gia");
  });

  // Case 4 — bctcFullTools
  it("fmtBillions: returns tỷ VND (accented)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (bctcFullToolsNs as any)["fmtBillions"] as ((...a: unknown[]) => string) | undefined;
    expect(fn).toBeDefined();
    const result = fn!(1000);
    expect(result).toContain("tỷ VND");
    expect(result).not.toContain("ty VND");
  });

  // Case 5 — calibrationTools
  it("handleGetLabelAccuracyReport: empty DB returns accented no-data message", async () => {
    // Use DB with empty market_messages table → triggers rows.length === 0 path
    const db = makeMemDbWithMessages();
    const result = await handleGetLabelAccuracyReport(db, 30);
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Không có tin nhắn");
    expect(text).not.toContain("Khong co tin nhan");
  });

  // Case 6 — climateTools
  it("getClimateRiskSignals: returns accented section header", async () => {
    const result = await getClimateRiskSignals({});
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("PHÂN TÍCH RỦI RO");
    expect(text).not.toContain("PHAN TICH RUI RO");
  });

  // Case 7 — correlationTools
  it("formatOutput: no data path returns accented message", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (correlationToolsNs as any)["formatOutput"] as ((...a: unknown[]) => string) | undefined;
    expect(fn).toBeDefined();
    const result = fn!([], 0, 30);
    expect(result).toContain("Không đủ dữ liệu");
    expect(result).not.toContain("Khong du du lieu");
  });

  // Case 8 — creditFlowTools
  it("getCreditFlowSignalHandler: severity label is accented", async () => {
    // All params optional — the handler computes signal internally using defaults
    const result = await getCreditFlowSignalHandler({});
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("NGHIÊM TRỌNG");
    expect(text).not.toContain("NGHIEM TRONG");
  });

  // Case 9 — energyTools
  it("getEnergyGridStatus: returns accented status header", async () => {
    const result = await getEnergyGridStatus({});
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("TRẠNG THÁI ĐIỆN LỰC");
    expect(text).not.toContain("TRANG THAI DIEN LUC");
  });

  // Case 10 — leadershipTools
  it("getInsiderSignalsHandler: no signals returns accented message", async () => {
    // _testData not provided → empty transactions → no signals
    const result = await getInsiderSignalsHandler({
      code: "VCB",
      outstandingShares: 3_000_000_000,
    });
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Không có tín hiệu");
    expect(text).not.toContain("Khong co tin hieu");
  });

  // Case 11 — marketMessageTools
  it("handleGetMarketMessageDigest: empty DB returns accented no-data message", async () => {
    const result = await handleGetMarketMessageDigest({ limit_days: 7 });
    const text = result.content[0]?.text ?? "";
    expect(text).not.toMatch(/Khong co/);
    expect(text).toContain("Không có");
  });

  // Case 12 — performanceTools
  it("formatAttribution: empty rows returns accented no-data message", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (performanceToolsNs as any)["formatAttribution"] as ((...a: unknown[]) => string) | undefined;
    expect(fn).toBeDefined();
    const result = fn!([], 30, "");
    expect(result).toContain("Không có dữ liệu");
    expect(result).not.toContain("Khong co du lieu");
  });

  // Case 13 — pharmaTools
  it("formatEvent: output uses accented labels", () => {
    const stubRow = {
      id: 1,
      event_type: "drug_approval",
      stock_code: "DHG",
      drug_name: "TestDrug",
      manufacturer: "TestMfg",
      approval_date: "2026-01-01",
      description: "Test",
      severity: "critical" as const,
      confidence: 0.9,
      created_at: "2026-01-01T00:00:00Z",
      source_url: null,
      raw_data: null,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (pharmaToolsNs as any)["formatEvent"] as ((...a: unknown[]) => string) | undefined;
    expect(fn).toBeDefined();
    const result = fn!(stubRow);
    expect(result).toContain("Mã cổ phiếu");
    expect(result).not.toContain("Ma co phieu");
    expect(result).toContain("NGHIÊM TRỌNG");
    expect(result).not.toContain("NGIEM TRONG");
  });

  // Case 14 — portfolioRiskTool
  it("formatPortfolioRiskOutput: returns accented header", () => {
    const stubResult = {
      var95Pct: -2.5,
      var95Vnd: -125000,
      maxDrawdownPct: -5.0,
      maxDrawdownStart: "2026-01-01",
      maxDrawdownEnd: "2026-01-10",
      heatMap: [],
      totalValue: 5000000,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (portfolioRiskToolNs as any)["formatPortfolioRiskOutput"] as ((...a: unknown[]) => string) | undefined;
    expect(fn).toBeDefined();
    const result = fn!(stubResult, 30);
    expect(result).toContain("Rủi ro danh mục");
    expect(result).not.toContain("Rui ro danh muc");
  });

  // Case 15 — positionTools
  it("buildPortfolioText: empty positions returns accented message", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (positionToolsNs as any)["buildPortfolioText"] as ((...a: unknown[]) => string) | undefined;
    expect(fn).toBeDefined();
    const result = fn!([]);
    expect(result).toContain("Danh mục đầu tư");
    expect(result).not.toContain("Danh muc dau tu");
  });

  // Case 16 — predictionTools
  it("formatPredictionAccuracy: empty rows returns accented no-data message", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (predictionToolsNs as any)["formatPredictionAccuracy"] as ((...a: unknown[]) => string) | undefined;
    expect(fn).toBeDefined();
    const result = fn!([], 30);
    expect(result).toContain("Không có dữ liệu kết quả");
    expect(result).not.toContain("Khong co du lieu ket qua");
  });

  // Case 17 — priceAlertTools
  it("formatPriceAlertCreated: returns accented confirmation", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (priceAlertToolsNs as any)["formatPriceAlertCreated"] as ((...a: unknown[]) => string) | undefined;
    expect(fn).toBeDefined();
    const result = fn!("VCB", 100000, "dưới");
    expect(result).toContain("Đã tạo cảnh báo giá");
    expect(result).not.toContain("Da tao canh bao gia");
  });

  // Case 18 — priceHistoryTools
  it("formatPriceHistory: no rows returns accented no-data message", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (priceHistoryToolsNs as any)["formatPriceHistory"] as ((...a: unknown[]) => string) | undefined;
    expect(fn).toBeDefined();
    const result = fn!("VCB", 30, []);
    expect(result).toContain("Không có dữ liệu");
    expect(result).not.toContain("Khong co du lieu");
  });

  // Case 19 — rebalancingTools
  it("formatRebalancingWarnings: overweight returns accented warning", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (rebalancingToolsNs as any)["formatRebalancingWarnings"] as ((...a: unknown[]) => { warn: string; note: string }) | undefined;
    expect(fn).toBeDefined();
    const { warn } = fn!(150, []);
    expect(warn).toContain("CẢNH BÁO");
    expect(warn).not.toContain("CANH BAO");
  });

  // Case 20 — sectorComparisonTools
  it("buildSectorComparisonOutput: output uses accented price label", () => {
    const stubInput = {
      code: "VCB",
      domain: "banking" as DomainType,
      financials: new Map(),
      prices: new Map(),
      tradingStats: new Map(),
      peerCodes: [],
    };
    const result = buildSectorComparisonOutput(stubInput);
    expect(result).toContain("Giá hôm nay");
    expect(result).not.toContain("Gia hom nay");
  });

  // Case 21 — sectorRotationTools
  it("getSectorRotationReport: empty DB returns accented header", async () => {
    const db = makeMemDb();
    const result = await getSectorRotationReport(db);
    expect(result).toContain("PHÂN TÍCH DÒNG TIỀN");
    expect(result).not.toContain("PHAN TICH DONG TIEN");
  });

  // Case 22 — sentimentTrendTools
  it("formatTrendOutput: empty data returns accented header", () => {
    const stubTrend = {
      code: "VCB",
      windowDays: 7,
      dailyBreakdown: [],
      summary: "Test",
      trendDirection: "stable" as const,
      slope: 0,
      totalArticles: 0,
      avgSentimentScore: 0,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (sentimentTrendToolsNs as any)["formatTrendOutput"] as ((...a: unknown[]) => string) | undefined;
    expect(fn).toBeDefined();
    const result = fn!(stubTrend);
    expect(result).toContain("Xu hướng tâm lý");
    expect(result).not.toContain("Xu huong tam ly");
  });

  // Case 23 — telegramReportTools
  it("formatReportError: returns accented error prefix", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (telegramReportToolsNs as any)["formatReportError"] as ((...a: unknown[]) => string) | undefined;
    expect(fn).toBeDefined();
    const result = fn!("đọc", 42, "timeout");
    expect(result).toContain("Lỗi khi");
    expect(result).not.toContain("Loi khi");
  });

  // Case 24 — tickerIntelligenceTools
  it("formatTickerIntelligence: section header [1] GIÁ is accented", () => {
    const emptySections: [string, string, string, string, string, string] = [
      "(no data)",
      "(no data)",
      "(no data)",
      "(no data)",
      "(no data)",
      "(no data)",
    ];
    const result = formatTickerIntelligence(
      "VCB",
      emptySections,
      new Date().toISOString(),
    );
    expect(result).toContain("[1] GIÁ");
    expect(result).not.toContain("[1] GIA");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GREEN regression — Sprint 144 fixes (must PASS immediately)
// ─────────────────────────────────────────────────────────────────────────────

describe("Sprint 144 — regression (must be GREEN)", () => {
  it("kinhDichTools: formatKinhDichTradingContext still accented", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: string = (formatKinhDichTradingContext as any)("THUAN LOI");
    expect(result).toContain("Thuận lợi");
    expect(result).not.toContain("THUAN LOI");
  });

  it("technicalIndicatorTools: formatTaIndicatorReport still accented", () => {
    const candles = flatCandles(60);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: string = (formatTaIndicatorReport as any)("VCB", candles, 60);
    expect(result).toContain("Xu hướng");
    expect(result).not.toContain("Xu huong");
  });

  it("supplyChainTools: buildSupplyChainExposureOutput still accented", () => {
    const result = buildSupplyChainExposureOutput([], [], null);
    expect(result).toContain("TỔNG KẾT");
    expect(result).not.toContain("TONG KET");
  });
});
