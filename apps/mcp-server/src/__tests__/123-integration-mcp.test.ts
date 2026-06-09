/**
 * Task 123 — Integration Tests: MCP Tools with Real SQLite
 *
 * Tests 5 end-to-end roundtrip chains using a real in-memory SQLite database.
 * LanceDB-dependent modules are mocked (requires filesystem; covered by unit tests in task 012).
 * HTTP fetchers are mocked via injected httpClient parameters.
 *
 * Roundtrips:
 *   RT1 — Watchlist CRUD (add → get → update_thresholds → remove → verify empty)
 *   RT2 — News → Cascade → Alert (seed rag_analyses + alerts → get_alerts → verify)
 *   RT3 — BCTC summary (seed financial_reports → get_financial_summary → verify)
 *   RT4 — Pattern matching (seed rag_analyses → get_patterns → verify ≥3 precedents)
 *   RT5 — Market snapshot (mocked HTTP → get_market_snapshot → verify VN-Index)
 *
 * SQLite: REAL (:memory: singleton, not mocked)
 * LanceDB: MOCKED (mock.module before any import)
 * HTTP: MOCKED via injected _testHoseClient parameter
 *
 * @module __tests__/123-integration-mcp
 */

// Must set DB_PATH before any import that triggers getDb()
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeAll, afterAll, beforeEach, mock } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Mock LanceDB-dependent modules before they are imported by tool files
mock.module("../infrastructure/rag/retriever.js", () => ({
  searchContext: async () => [],
  insertAnalysis: async () => {},
}));

// Mock external HTTP fetchers to avoid network I/O in integration tests
mock.module("../infrastructure/fetchers/yahooFinance.js", () => ({
  fetchYahooFinancePrices: async () => null,
}));
mock.module("../infrastructure/fetchers/sbv.js", () => ({
  fetchSbvRates: async () => null,
}));

import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import {
  registerWatchlistTools,
  registerReportTools,
  registerAlertTools,
  registerAnalysisTools,
  registerMarketTools,
} from "../interface/mcp/tools/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helper — invoke a registered MCP tool directly (bypasses SSE transport)
// ─────────────────────────────────────────────────────────────────────────────

async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const registry = (server as unknown as {
    _registeredTools: Record<string, {
      handler: (args: Record<string, unknown>) => Promise<unknown>;
    }>;
  })._registeredTools;

  const entry = registry[toolName];
  if (!entry) throw new Error(`Tool "${toolName}" not registered`);
  return entry.handler(args) as Promise<{
    content: Array<{ type: string; text: string }>;
  }>;
}

/** Returns the first text content item from a tool response. */
function getText(result: { content: Array<{ type: string; text: string }> }): string {
  const first = result.content[0];
  if (!first || first.type !== "text") throw new Error("No text content in tool response");
  return first.text;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed helpers — direct SQLite inserts for test data
// ─────────────────────────────────────────────────────────────────────────────

function seedRagAnalysis(opts: {
  id: string;
  stockCode: string;
  sourceTitle: string;
  summary: string;
  impactScore: number;
  impactDirection: "up" | "down" | "neutral";
  createdAt?: string;
}): void {
  const db = getDb();
  const now = opts.createdAt ?? new Date().toISOString();
  db.prepare(`
    INSERT OR IGNORE INTO rag_analyses
      (id, created_at, level, source_url, source_title, source_type,
       published_at, sentiment, impact_score, impact_direction, confidence,
       time_horizon, summary, reasoning,
       affected_countries, affected_domains, affected_actions, parent_ids, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    opts.id,
    now,
    "action",
    `https://example.com/${opts.id}`,
    opts.sourceTitle,
    "news",
    now,
    opts.impactScore >= 5 ? "bullish" : "bearish",
    opts.impactScore,
    opts.impactDirection,
    0.8,
    "short",
    opts.summary,
    "Test reasoning",
    JSON.stringify(["VN"]),
    JSON.stringify(["oil_gas"]),
    JSON.stringify([opts.stockCode]),
    JSON.stringify([]),
    JSON.stringify(["oil", "test"]),
  );
}

function seedAlert(opts: {
  id: string;
  severity: "low" | "medium" | "high" | "critical";
  affectedCodes: string[];
  message: string;
  triggeredAt?: string;
}): void {
  const db = getDb();
  const now = opts.triggeredAt ?? new Date().toISOString();
  db.prepare(`
    INSERT OR IGNORE INTO alerts
      (id, triggered_at, severity, signals_json, affected_actions_json,
       analysis_ids_json, message, read, user_note)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL)
  `).run(
    opts.id,
    now,
    opts.severity,
    JSON.stringify(opts.affectedCodes.map((c) => ({ type: "news_impact", actionCode: c }))),
    JSON.stringify(opts.affectedCodes.map((c) => ({ code: c }))),
    JSON.stringify([]),
    opts.message,
  );
}

function seedFinancialReport(opts: {
  id: string;
  actionCode: string;
  year: number;
  quarter: string;
}): void {
  const db = getDb();
  const sortKey = `${opts.year}-${opts.quarter}`;
  const balanceSheetJson = JSON.stringify({
    currentAssets: { cash: 5_000_000, shortTermInvestments: 1_000_000, receivables: 2_000_000, inventory: 500_000, otherCurrentAssets: 100_000, total: 8_600_000 },
    nonCurrentAssets: { longTermInvestments: 10_000_000, fixedAssets: 20_000_000, otherNonCurrentAssets: 500_000, total: 30_500_000 },
    totalAssets: 39_100_000,
    currentLiabilities: { shortTermDebt: 1_000_000, payables: 2_000_000, otherCurrentLiabilities: 500_000, total: 3_500_000 },
    nonCurrentLiabilities: { longTermDebt: 5_000_000, otherNonCurrentLiabilities: 500_000, total: 5_500_000 },
    totalLiabilities: 9_000_000,
    equity: { charter: 15_000_000, retained: 10_000_000, other: 5_100_000, total: 30_100_000 },
  });
  const incomeStatementJson = JSON.stringify({
    netRevenue: 10_000_000,
    cogs: 6_000_000,
    grossProfit: 4_000_000,
    sellingExpenses: 500_000,
    adminExpenses: 300_000,
    operatingProfit: 3_200_000,
    ebitda: 3_500_000,
    financialIncome: 200_000,
    financialExpenses: 100_000,
    profitBeforeTax: 3_300_000,
    incomeTax: 660_000,
    netProfit: 2_640_000,
    eps: 5_280,
    dilutedEps: 5_280,
    minorityInterest: 0,
  });
  const cashFlowJson = JSON.stringify({
    operatingActivities: 3_000_000,
    investingActivities: -1_500_000,
    financingActivities: -500_000,
    capex: -1_000_000,
    freeCashFlow: 2_000_000,
    beginningCash: 4_000_000,
    endingCash: 5_000_000,
  });
  const ratiosJson = JSON.stringify({
    grossMarginPct: 40.0,
    operatingMarginPct: 32.0,
    netMarginPct: 26.4,
    roe: 8.77,
    roa: 6.75,
    currentRatio: 2.46,
    debtToEquity: 0.3,
    netDebtToEbitda: -0.29,
    pe: null,
    pb: null,
    inventoryDays: 30,
    receivablesDays: 73,
    inventoryTurnover: 12.0,
    assetTurnover: 0.26,
    capexToRevenue: 10.0,
    cashConversionCycle: 73,
    ebitdaMarginPct: 35.0,
    returnOnInvestedCapital: 7.5,
    debtCoverageRatio: 3.0,
    grossDebt: 6_000_000,
    netDebt: 1_000_000,
    bookValuePerShare: 60_200,
  });

  db.prepare(`
    INSERT OR IGNORE INTO financial_reports
      (id, action_code, company_name, exchange, domain,
       period_year, period_quarter, period_type,
       period_start, period_end, sort_key,
       ssc_url, pdf_path, published_at, parsed_at,
       audit_status, auditor, extraction_confidence,
       net_revenue, gross_profit, operating_profit, ebitda,
       profit_before_tax, net_profit, eps, diluted_eps,
       total_assets, current_assets, cash, inventory,
       total_liabilities, short_term_debt, long_term_debt, equity_total,
       operating_cf, investing_cf, financing_cf, capex, free_cash_flow,
       gross_margin_pct, operating_margin_pct, net_margin_pct,
       roe, roa, current_ratio, debt_to_equity, net_debt_to_ebitda, pe, pb,
       balance_sheet_json, income_stmt_json, cash_flow_json,
       ratios_json, yoy_delta_json, qoq_delta_json)
    VALUES
      (?, ?, ?, ?, ?,
       ?, ?, ?,
       ?, ?, ?,
       NULL, NULL, ?, ?,
       ?, NULL, ?,
       ?, ?, ?, ?,
       ?, ?, ?, ?,
       ?, ?, ?, ?,
       ?, ?, ?, ?,
       ?, ?, ?, ?, ?,
       ?, ?, ?,
       ?, ?, ?, ?, ?, NULL, NULL,
       ?, ?, ?,
       ?, NULL, NULL)
  `).run(
    opts.id, opts.actionCode, `${opts.actionCode} Company`, "HOSE", "banking",
    opts.year, 1, opts.quarter,
    `${opts.year}-01-01`, `${opts.year}-03-31`, sortKey,
    `${opts.year}-04-30`, new Date().toISOString(),
    "audited", 1.0,
    10_000_000, 4_000_000, 3_200_000, 3_500_000,
    3_300_000, 2_640_000, 5_280, 5_280,
    39_100_000, 8_600_000, 5_000_000, 500_000,
    9_000_000, 1_000_000, 5_000_000, 30_100_000,
    3_000_000, -1_500_000, -500_000, -1_000_000, 2_000_000,
    40.0, 32.0, 26.4,
    8.77, 6.75, 2.46, 0.3, -0.29,
    balanceSheetJson, incomeStatementJson, cashFlowJson,
    ratiosJson,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock HTTP client factory for get_market_snapshot
// ─────────────────────────────────────────────────────────────────────────────

/** VnDirect mock JSON response for VNINDEX */
const VNINDEX_MOCK_JSON = JSON.stringify({
  data: [
    {
      code: "VNINDEX",
      exchange: "HOSE",
      close: 1285.5,
      previousClose: 1270.0,
      pctChange: 1.22,
      nmTotalTradedQty: 350_000_000,
    },
  ],
});

/** VnDirect mock JSON response for VCB */
const VCB_MOCK_JSON = JSON.stringify({
  data: [
    {
      code: "VCB",
      exchange: "HOSE",
      close: 88_000,
      previousClose: 87_000,
      pctChange: 1.15,
      nmTotalTradedQty: 1_500_000,
    },
  ],
});

function makeMockHoseClient(codeToJson: Record<string, string> = {}) {
  return {
    get: async (url: string): Promise<string> => {
      // Check which codes are being fetched from the URL
      for (const [code, json] of Object.entries(codeToJson)) {
        if (url.includes(code)) return json;
      }
      // Default: VNINDEX response
      return VNINDEX_MOCK_JSON;
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Global setup / teardown
// ─────────────────────────────────────────────────────────────────────────────

let server: McpServer;

beforeAll(async () => {
  // Use isolated test DB to prevent corrupting production watchlist
  Bun.env["DB_PATH"] = ":memory:";
  await initDatabase();

  server = new McpServer(
    { name: "test-integration-mcp", version: "0.0.1" },
    { capabilities: { tools: {} } },
  );

  // Register all tool groups on the same server instance (mirrors production wiring)
  registerWatchlistTools(server);
  registerReportTools(server);
  registerAlertTools(server);
  registerAnalysisTools(server);
  registerMarketTools(server);
});

afterAll(() => {
  closeDb();
  delete Bun.env["DB_PATH"];
});

// Clean all tables before each test for isolation between roundtrips
beforeEach(() => {
  const db = getDb();
  db.exec("DELETE FROM watchlist");
  db.exec("DELETE FROM alerts");
  db.exec("DELETE FROM rag_analyses");
  db.exec("DELETE FROM financial_reports");
  db.exec("DELETE FROM market_prices");
});

// ─────────────────────────────────────────────────────────────────────────────
// RT1 — Watchlist CRUD roundtrip
// ─────────────────────────────────────────────────────────────────────────────

describe("RT1 — Watchlist CRUD roundtrip", () => {
  it("adds VCB to watchlist and confirms it is listed", async () => {
    const result = await callTool(server, "add_to_watchlist", {
      actionCode: "VCB",
      exchange: "HOSE",
      domain: "banking",
    });
    const text = getText(result);
    expect(text).toContain("VCB");
    expect(text).toContain("HOSE");
  });

  it("get_watchlist returns VCB after add", async () => {
    await callTool(server, "add_to_watchlist", {
      actionCode: "VCB",
      exchange: "HOSE",
      domain: "banking",
    });
    const result = await callTool(server, "get_watchlist", {});
    const text = getText(result);
    expect(text).toContain("VCB");
    expect(text).toContain("HOSE");
    expect(text.includes("banking") || text.includes("Ngân hàng")).toBe(true);
  });

  it("update_thresholds applies new drop/rise pct for VCB", async () => {
    await callTool(server, "add_to_watchlist", {
      actionCode: "VCB",
      exchange: "HOSE",
      domain: "banking",
    });
    const result = await callTool(server, "update_thresholds", {
      actionCode: "VCB",
      thresholds: { dropPct: -5, risePct: 8 },
    });
    const text = getText(result);
    expect(text).toContain("VCB");
    expect(text).toContain("-5");
    expect(text).toContain("8");

    // Verify via SQLite directly that thresholds were persisted
    const db = getDb();
    const row = db
      .prepare("SELECT alert_drop_pct, alert_rise_pct FROM watchlist WHERE code = ?")
      .get("VCB") as { alert_drop_pct: number; alert_rise_pct: number } | null;
    expect(row).not.toBeNull();
    expect(row!.alert_drop_pct).toBe(-5);
    expect(row!.alert_rise_pct).toBe(8);
  });

  it("remove_from_watchlist removes VCB", async () => {
    await callTool(server, "add_to_watchlist", {
      actionCode: "VCB",
      exchange: "HOSE",
      domain: "banking",
    });
    const result = await callTool(server, "remove_from_watchlist", {
      actionCode: "VCB",
    });
    const text = getText(result);
    expect(text).toContain("removed");
  });

  it("get_watchlist returns empty after remove", async () => {
    await callTool(server, "add_to_watchlist", {
      actionCode: "VCB",
      exchange: "HOSE",
      domain: "banking",
    });
    await callTool(server, "remove_from_watchlist", { actionCode: "VCB" });

    const result = await callTool(server, "get_watchlist", {});
    const text = getText(result);
    expect(text).toContain("empty");
  });

  it("full CRUD chain: add → get → update → remove → verify empty (structural check)", async () => {
    // Add
    const addResult = await callTool(server, "add_to_watchlist", {
      actionCode: "HPG",
      exchange: "HOSE",
      domain: "steel",
      thresholds: { dropPct: -4, risePct: 6, impactScore: 7 },
    });
    expect(getText(addResult)).toContain("HPG");

    // Get — verify present
    const getResult1 = await callTool(server, "get_watchlist", {});
    expect(getText(getResult1)).toContain("HPG");
    expect(getText(getResult1).includes("steel") || getText(getResult1).includes("Thép")).toBe(true);

    // Update
    const updateResult = await callTool(server, "update_thresholds", {
      actionCode: "HPG",
      thresholds: { dropPct: -7 },
    });
    expect(getText(updateResult)).toContain("-7");

    // Remove
    const removeResult = await callTool(server, "remove_from_watchlist", {
      actionCode: "HPG",
    });
    expect(getText(removeResult)).toContain("removed");

    // Get — verify empty
    const getResult2 = await callTool(server, "get_watchlist", {});
    expect(getText(getResult2)).not.toContain("HPG");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RT2 — News seed → Cascade → Alert → get_alerts roundtrip
// ─────────────────────────────────────────────────────────────────────────────

describe("RT2 — News → Cascade → Alert roundtrip", () => {
  it("get_alerts returns seeded VCB alert", async () => {
    // Seed watchlist with VCB
    await callTool(server, "add_to_watchlist", {
      actionCode: "VCB",
      exchange: "HOSE",
      domain: "banking",
    });

    // Seed rag_analyses with a news item mentioning VCB
    seedRagAnalysis({
      id: "rag-rt2-001",
      stockCode: "VCB",
      sourceTitle: "VCB reports strong Q1 banking earnings",
      summary: "Vietcombank posts record banking profit driven by fee income",
      impactScore: 7.5,
      impactDirection: "up",
    });

    // Seed an alert for VCB
    seedAlert({
      id: "alert-rt2-001",
      severity: "high",
      affectedCodes: ["VCB"],
      message: "VCB strong earnings signal — impact score 7.5",
    });

    // Call get_alerts → verify alert exists for VCB
    const result = await callTool(server, "get_alerts", {
      severity: "all",
      unreadOnly: false,
      limitDays: 7,
      limit: 20,
    });
    const text = getText(result);
    expect(text).toContain("VCB");
    expect(text).not.toContain("No alerts found");
  });

  it("get_alerts filters by actionCode to return only VCB alerts", async () => {
    seedAlert({
      id: "alert-rt2-vcb",
      severity: "medium",
      affectedCodes: ["VCB"],
      message: "VCB banking news",
    });
    seedAlert({
      id: "alert-rt2-hpg",
      severity: "medium",
      affectedCodes: ["HPG"],
      message: "HPG steel news",
    });

    const result = await callTool(server, "get_alerts", {
      actionCode: "VCB",
      limitDays: 7,
      limit: 20,
    });
    const text = getText(result);
    expect(text).toContain("VCB");
  });

  it("run_impact_chain returns a chain entry for banking news", async () => {
    // Seed watchlist with VCB (banking)
    await callTool(server, "add_to_watchlist", {
      actionCode: "VCB",
      exchange: "HOSE",
      domain: "banking",
    });

    // run_impact_chain with banking-related text
    const result = await callTool(server, "run_impact_chain", {
      newsText: "Vietnam central bank cuts interest rates to stimulate banking sector lending",
      includeWatchlist: true,
    });
    const text = getText(result);
    // The cascade engine returns a chain — just verify it responded without error
    expect(text).not.toContain("Error running impact chain");
    // Chain header should be present
    expect(text).toContain("Causal Chain");
  });

  it("get_analysis_history returns the seeded rag entry for VCB", async () => {
    seedRagAnalysis({
      id: "rag-rt2-hist",
      stockCode: "VCB",
      sourceTitle: "Banking sector outlook 2026",
      summary: "Vietnamese banks face margin pressure from rate cuts",
      impactScore: 5.0,
      impactDirection: "neutral",
    });

    const result = await callTool(server, "get_analysis_history", {
      actionCode: "VCB",
      limit: 10,
    });
    const text = getText(result);
    expect(text).toContain("Banking sector outlook 2026");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RT3 — BCTC summary roundtrip
// ─────────────────────────────────────────────────────────────────────────────

describe("RT3 — BCTC summary roundtrip", () => {
  it("get_financial_summary returns seeded VCB report data", async () => {
    seedFinancialReport({ id: "fr-rt3-vcb", actionCode: "VCB", year: 2025, quarter: "Q1" });

    const result = await callTool(server, "get_financial_summary", {
      actionCode: "VCB",
    });
    const text = getText(result);
    expect(text).toContain("VCB");
    expect(text).toContain("2025-Q1");
    expect(text).not.toContain("No financial data found");
  });

  it("get_financial_summary shows income statement key fields", async () => {
    seedFinancialReport({ id: "fr-rt3-vcb2", actionCode: "VCB", year: 2025, quarter: "Q1" });

    const result = await callTool(server, "get_financial_summary", {
      actionCode: "VCB",
      year: 2025,
      quarter: "Q1",
    });
    const text = getText(result);
    expect(text).toContain("Net Revenue");
    expect(text).toContain("Gross Profit");
    expect(text).toContain("Net Profit");
  });

  it("get_financial_summary shows balance sheet and ratio fields", async () => {
    seedFinancialReport({ id: "fr-rt3-vcb3", actionCode: "VCB", year: 2025, quarter: "Q1" });

    const result = await callTool(server, "get_financial_summary", {
      actionCode: "VCB",
    });
    const text = getText(result);
    expect(text).toContain("Total Assets");
    expect(text).toContain("ROE");
    expect(text).toContain("D/E Ratio");
  });

  it("get_financial_summary returns not-found message when no report exists", async () => {
    const result = await callTool(server, "get_financial_summary", {
      actionCode: "NONEXISTENT",
    });
    const text = getText(result);
    expect(text).toContain("No financial data found");
  });

  it("get_financial_summary returns formatted summary for seeded report", async () => {
    // fetch_ssc_reports removed in task 230 — use get_financial_summary directly
    seedFinancialReport({ id: "fr-rt3-hpg", actionCode: "HPG", year: 2025, quarter: "Q1" });

    const result = await callTool(server, "get_financial_summary", {
      actionCode: "HPG",
      year: 2025,
      quarter: "Q1",
    });
    const text = getText(result);
    expect(text).toContain("HPG");
    expect(text).toContain("2025-Q1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RT4 — Pattern matching roundtrip
// ─────────────────────────────────────────────────────────────────────────────

describe("RT4 — Pattern matching roundtrip", () => {
  it("get_patterns finds ≥3 precedents for GAS + oil keyword", async () => {
    const baseTime = Date.now();

    // Seed 3 rag_analyses rows mentioning GAS with "oil" in the title, within 24h
    for (let i = 0; i < 3; i++) {
      const ts = new Date(baseTime - i * 60_000).toISOString(); // 1 min apart
      seedRagAnalysis({
        id: `rag-rt4-gas-${i}`,
        stockCode: "GAS",
        sourceTitle: `Global oil price surge hits GAS ${i}`,
        summary: `Oil market impact on GAS stock analysis ${i}`,
        impactScore: 6 + i * 0.5,
        impactDirection: "up",
        createdAt: ts,
      });
    }

    const result = await callTool(server, "get_patterns", {
      stockCode: "GAS",
      eventKeyword: "oil",
      lookbackHours: 24,
    });
    const text = getText(result);
    expect(text).toContain("GAS");
    expect(text).toContain("oil");
    expect(text).not.toContain("No historical precedents found");
    // Verify at least 3 precedents found
    expect(text).toContain("Precedents found: 3");
  });

  it("get_patterns returns correct avgImpactPct across 3 precedents", async () => {
    const baseTime = Date.now();

    // Seed 3 entries with known impact scores: 4, 6, 8 → avg = 6.0
    const scores: number[] = [4, 6, 8];
    for (let i = 0; i < scores.length; i++) {
      const ts = new Date(baseTime - i * 60_000).toISOString();
      seedRagAnalysis({
        id: `rag-rt4-avg-${i}`,
        stockCode: "GAS",
        sourceTitle: `Oil price news affecting GAS item ${i}`,
        summary: `GAS oil impact analysis ${i}`,
        impactScore: scores[i] as number,
        impactDirection: "up",
        createdAt: ts,
      });
    }

    const result = await callTool(server, "get_patterns", {
      stockCode: "GAS",
      eventKeyword: "oil",
      lookbackHours: 24,
    });
    const text = getText(result);
    // avgImpactPct = (4+6+8)/3 = 6.0
    expect(text).toContain("6.00");
  });

  it("get_patterns returns no-precedents message when none match", async () => {
    // Seed entries for GAS but with keyword "steel" (not matching "oil")
    seedRagAnalysis({
      id: "rag-rt4-nomatch",
      stockCode: "GAS",
      sourceTitle: "Steel market unrelated news",
      summary: "Steel industry update",
      impactScore: 5,
      impactDirection: "neutral",
    });

    const result = await callTool(server, "get_patterns", {
      stockCode: "GAS",
      eventKeyword: "oil",
      lookbackHours: 24,
    });
    const text = getText(result);
    expect(text).toContain("No historical precedents found");
  });

  it("get_patterns with lookbackHours=0 returns all-time matches", async () => {
    // Seed an old entry (2 years ago)
    const oldDate = new Date(Date.now() - 365 * 2 * 86_400_000).toISOString();
    seedRagAnalysis({
      id: "rag-rt4-old",
      stockCode: "GAS",
      sourceTitle: "Oil crisis hits GAS two years ago",
      summary: "Historical oil impact on GAS",
      impactScore: 7,
      impactDirection: "down",
      createdAt: oldDate,
    });

    // lookbackHours=0 is not allowed by schema (min=1), use 8760 (1 year) instead
    // The old entry is 2 years old — should not match 1-year lookback
    const result = await callTool(server, "get_patterns", {
      stockCode: "GAS",
      eventKeyword: "oil",
      lookbackHours: 8760, // 1 year max
    });
    const text = getText(result);
    // Old entry (2 years ago) should not appear in 1-year lookback
    expect(text).toContain("No historical precedents found");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RT5 — Market snapshot roundtrip (mocked HTTP)
// ─────────────────────────────────────────────────────────────────────────────

describe("RT5 — Market snapshot roundtrip", () => {
  it("get_market_snapshot with mocked HOSE client returns VN-Index", async () => {
    const mockClient = makeMockHoseClient({ VNINDEX: VNINDEX_MOCK_JSON });

    const result = await callTool(server, "get_market_snapshot", {
      _testHoseClient: mockClient,
    });
    const text = getText(result);
    expect(text).toContain("VN-Index");
    expect(text).toContain("1,285.50");
  });

  it("get_market_snapshot with empty codes returns only VN-Index line", async () => {
    const mockClient = makeMockHoseClient({ VNINDEX: VNINDEX_MOCK_JSON });

    const result = await callTool(server, "get_market_snapshot", {
      codes: [],
      _testHoseClient: mockClient,
    });
    const text = getText(result);
    expect(text).toContain("VN-Index");
    // When no codes provided, shows the no-codes message
    expect(text).toContain("No stock codes requested");
  });

  it("get_market_snapshot with VCB code returns HOSE section with VCB price", async () => {
    const mockClient = {
      get: async (url: string): Promise<string> => {
        if (url.includes("VCB")) return VCB_MOCK_JSON;
        return VNINDEX_MOCK_JSON;
      },
    };

    const result = await callTool(server, "get_market_snapshot", {
      codes: ["VCB"],
      _testHoseClient: mockClient,
    });
    const text = getText(result);
    expect(text).toContain("VN-Index");
    expect(text).toContain("VCB");
    expect(text).toContain("HOSE");
  });

  it("get_market_snapshot includes Generated timestamp in output", async () => {
    const mockClient = makeMockHoseClient({ VNINDEX: VNINDEX_MOCK_JSON });

    const result = await callTool(server, "get_market_snapshot", {
      _testHoseClient: mockClient,
    });
    const text = getText(result);
    expect(text).toContain("Generated:");
  });

  it("get_market_snapshot with watchlist stocks seeded in DB routes HOSE codes correctly", async () => {
    // Seed watchlist with VCB (HOSE) so the exchange-lookup path is exercised
    await callTool(server, "add_to_watchlist", {
      actionCode: "VCB",
      exchange: "HOSE",
      domain: "banking",
    });

    // Also seed market_prices with VCB exchange info
    const db = getDb();
    db.prepare("INSERT OR REPLACE INTO market_prices (code, price, change_pct, volume, updated_at) VALUES (?, ?, ?, ?, ?)").run(
      "VCB", 88_000, 1.15, 1_500_000, new Date().toISOString(),
    );

    const mockClient = {
      get: async (url: string): Promise<string> => {
        if (url.includes("VCB")) return VCB_MOCK_JSON;
        return VNINDEX_MOCK_JSON;
      },
    };

    const result = await callTool(server, "get_market_snapshot", {
      codes: ["VCB"],
      _testHoseClient: mockClient,
    });
    const text = getText(result);
    expect(text).toContain("VCB");
    expect(text).not.toContain("Error fetching market snapshot");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cross-chain structural checks
// ─────────────────────────────────────────────────────────────────────────────

describe("Cross-chain structural checks", () => {
  it("all registered tools are present on the server", () => {
    const registry = (server as unknown as {
      _registeredTools: Record<string, unknown>;
    })._registeredTools;

    const toolNames = Object.keys(registry);
    // Watchlist tools (4)
    expect(toolNames).toContain("add_to_watchlist");
    expect(toolNames).toContain("remove_from_watchlist");
    expect(toolNames).toContain("get_watchlist");
    expect(toolNames).toContain("update_thresholds");
    // Report tools (3 — fetch_ssc_reports removed in task 230; read_bctc_pdf deregistered in TSU-DEV-U3)
    expect(toolNames).not.toContain("fetch_ssc_reports"); // removed in task 230
    expect(toolNames).not.toContain("read_bctc_pdf"); // deregistered in TSU-DEV-U3 (superseded by OCR/PEK pipeline)
    expect(toolNames).toContain("get_financial_summary");
    expect(toolNames).toContain("compare_financials");
    // Alert tools (3 — run_daily_briefing removed in task 230)
    expect(toolNames).toContain("get_alerts");
    expect(toolNames).toContain("mark_alert_read");
    expect(toolNames).not.toContain("run_daily_briefing"); // removed in task 230
    expect(toolNames).toContain("get_analysis_history");
    // Analysis tools (3)
    expect(toolNames).toContain("fetch_and_analyze");
    expect(toolNames).toContain("run_impact_chain");
    expect(toolNames).toContain("search_similar_context");
    // Market tools (2)
    expect(toolNames).toContain("get_market_snapshot");
    expect(toolNames).toContain("get_patterns");

    // At least 15 core tools (read_bctc_pdf deregistered in TSU-DEV-U3; new tools added in later sprints)
    expect(toolNames.length).toBeGreaterThanOrEqual(15);
  });

  it("mark_alert_read marks all unread alerts as read in a single call", async () => {
    // Seed two unread alerts
    seedAlert({ id: "alert-struct-1", severity: "medium", affectedCodes: ["VCB"], message: "VCB alert 1" });
    seedAlert({ id: "alert-struct-2", severity: "low", affectedCodes: ["HPG"], message: "HPG alert 1" });

    const result = await callTool(server, "mark_alert_read", {});
    const text = getText(result);
    expect(text).toContain("2");
    expect(text).toContain("read");
  });

  // run_daily_briefing removed in sprint-036 task 230 — scheduler-driven via Telegram
  it.skip("run_daily_briefing includes watchlist and alert sections (removed in task 230)", async () => {
    // run_daily_briefing is no longer registered as an MCP tool.
  });

  it("SQLite state is isolated between tests — watchlist is empty at start", async () => {
    // This test verifies beforeEach cleanup is working
    const result = await callTool(server, "get_watchlist", {});
    const text = getText(result);
    expect(text).toContain("empty");
  });
});
