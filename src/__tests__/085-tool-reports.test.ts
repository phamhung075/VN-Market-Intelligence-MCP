/**
 * Task 085 — SSC Report MCP Tools (fetch / summary / compare)
 *
 * Tests for `registerReportTools` which registers three MCP tools:
 *   - fetch_ssc_reports    : triggers the full BCTC pipeline and returns a summary
 *   - get_financial_summary: queries SQLite and returns formatted key metrics
 *   - compare_financials   : compares two periods using computePeriodDelta
 *
 * Dependencies are mocked:
 *   - fetchParseAndStoreBctc → returns a deterministic FinancialReport fixture
 *   - getDb / SQLite         → uses :memory: database via DB_PATH env var
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { registerReportTools } from "../interface/mcp/tools/financial-reports/reports.js";
import type { FinancialReport } from "../../bctc-schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — invoke a registered MCP tool directly
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pull the registered handler from the McpServer's internal tool registry
 * and call it with the given args.  This bypasses the SSE transport so we
 * can unit-test tool logic without a network.
 *
 * McpServer stores tools in `_registeredTools` as a plain object keyed by
 * tool name; each value has a `handler` async function.
 */
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

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

/** Shared balance sheet for the 2024 fixture */
const BS_2024 = {
  currentAssets: {
    cash: 5_000_000,
    shortTermInvestments: 0,
    accountsReceivable: 0,
    inventory: 12_000_000,
    otherCurrentAssets: 0,
    total: 50_000_000,
  },
  nonCurrentAssets: {
    longTermReceivables: 0,
    fixedAssets: 0,
    investmentProperty: 0,
    longTermInvestments: 0,
    goodwill: 0,
    otherLongTermAssets: 0,
    total: 30_000_000,
  },
  totalAssets: 80_000_000,
  currentLiabilities: {
    shortTermDebt: 8_000_000,
    accountsPayable: 0,
    advancesFromCustomers: 0,
    taxPayable: 0,
    payablesToEmployees: 0,
    otherCurrentLiabilities: 0,
    total: 15_000_000,
  },
  longTermLiabilities: {
    longTermDebt: 10_000_000,
    deferredTaxLiabilities: 0,
    otherLongTermLiabilities: 0,
    total: 15_000_000,
  },
  totalLiabilities: 30_000_000,
  equity: {
    shareCapital: 0,
    sharePremium: 0,
    treasuryShares: 0,
    retainedEarnings: 0,
    otherEquityFunds: 0,
    minorityInterest: 0,
    total: 50_000_000,
  },
  totalLiabilitiesAndEquity: 80_000_000,
};

/** Shared income statement for the 2024 fixture */
const IS_2024 = {
  grossRevenue: 40_000_000,
  revenueDeductions: 500_000,
  netRevenue: 39_500_000,
  cogs: 25_000_000,
  grossProfit: 14_500_000,
  financialIncome: 0,
  financialExpenses: 0,
  interestExpenses: 0,
  shareOfAssociates: 0,
  sellingExpenses: 0,
  adminExpenses: 0,
  operatingProfit: 8_500_000,
  otherIncome: 0,
  otherExpenses: 0,
  otherProfit: 0,
  profitBeforeTax: 8_600_000,
  incomeTaxCurrent: 1_720_000,
  incomeTaxDeferred: 0,
  totalIncomeTax: 1_720_000,
  netProfit: 6_880_000,
  minorityInterest: 0,
  netProfitParent: 6_880_000,
  eps: 2_500,
  dilutedEps: 2_500,
  ebitda: 9_000_000,
  ebit: 8_500_000,
};

/** Shared cash flow for the 2024 fixture */
const CF_2024 = {
  profitBeforeTax: 8_600_000,
  depreciationAmortization: 500_000,
  workingCapitalChanges: 0,
  interestPaid: 0,
  incomeTaxPaid: 1_720_000,
  operatingCF: 5_880_000,
  capex: -3_000_000,
  proceedsFromAssetSales: 0,
  investmentPurchases: 0,
  investmentProceeds: 0,
  dividendsReceived: 0,
  investingCF: -3_000_000,
  proceedsFromDebt: 0,
  debtRepayments: 0,
  proceedsFromShareIssuance: 0,
  dividendsPaid: 0,
  financingCF: 1_000_000,
  netCashFlow: 3_880_000,
  beginningCash: 4_000_000,
  endingCash: 7_880_000,
  freeCashFlow: 2_880_000,
};

/** Full ratios fixture — all nullable fields defaulted to null */
const RATIOS_2024 = {
  grossMarginPct: 36.7,
  operatingMarginPct: 21.5,
  netMarginPct: 17.4,
  ebitdaMarginPct: 22.8,
  roe: 13.76,
  roa: 8.6,
  roic: null as unknown as number,
  currentRatio: 3.33,
  quickRatio: null as unknown as number,
  cashRatio: null as unknown as number,
  debtToEquity: 0.36,
  debtToAssets: 0.375,
  netDebt: 13_000_000,
  netDebtToEbitda: null as unknown as number,
  interestCoverageRatio: null as unknown as number,
  assetTurnover: null as unknown as number,
  inventoryTurnover: null as unknown as number,
  inventoryDays: null as unknown as number,
  receivablesTurnover: null as unknown as number,
  receivablesDays: null as unknown as number,
  payablesTurnover: null as unknown as number,
  payablesDays: null as unknown as number,
  cashConversionCycle: null as unknown as number,
  eps: 2_500,
  bvps: null as unknown as number,
  revenuePerShare: null as unknown as number,
  fcfPerShare: null as unknown as number,
  pe: null,
  pb: null,
  ps: null,
  evToEbitda: null,
  dividendYieldPct: null,
};

const FIXTURE_REPORT: FinancialReport = {
  id: "test-id-001",
  actionCode: "VCB",
  companyName: "Vietcombank",
  exchange: "HOSE",
  domain: "banking",
  period: {
    year: 2024,
    quarter: 1,
    periodType: "Q1",
    startDate: "2024-01-01",
    endDate: "2024-03-31",
    sortKey: "2024-Q1",
  },
  source: {
    sscUrl: "https://ssc.gov.vn/test",
    pdfPath: null,
    publishedAt: "2024-04-15T00:00:00.000Z",
    parsedAt: "2024-04-15T01:00:00.000Z",
    auditStatus: "unaudited",
    auditor: null,
    reportLanguage: "vi",
    pageCount: null,
    extractionConfidence: 0.8,
  },
  balanceSheet: BS_2024,
  incomeStatement: IS_2024,
  cashFlow: CF_2024,
  ratios: RATIOS_2024,
  yoyDelta: null,
  qoqDelta: null,
  marketData: null,
  aiAnalysis: null,
  embedding: null,
  embeddingText: "VCB 2024-Q1 BCTC",
  notesRawText: null,
};

/** Second period fixture for comparison tests */
const FIXTURE_REPORT_2023: FinancialReport = {
  id: "test-id-002",
  actionCode: "VCB",
  companyName: "Vietcombank",
  exchange: "HOSE",
  domain: "banking",
  period: {
    year: 2023,
    quarter: 1,
    periodType: "Q1",
    startDate: "2023-01-01",
    endDate: "2023-03-31",
    sortKey: "2023-Q1",
  },
  source: {
    sscUrl: "https://ssc.gov.vn/test-2023",
    pdfPath: null,
    publishedAt: "2023-04-15T00:00:00.000Z",
    parsedAt: "2023-04-15T01:00:00.000Z",
    auditStatus: "unaudited",
    auditor: null,
    reportLanguage: "vi",
    pageCount: null,
    extractionConfidence: 0.75,
  },
  balanceSheet: {
    ...BS_2024,
    totalAssets: 70_000_000,
    equity: { ...BS_2024.equity, total: 45_000_000 },
    totalLiabilitiesAndEquity: 70_000_000,
  },
  incomeStatement: {
    ...IS_2024,
    netRevenue: 35_000_000,
    grossProfit: 12_000_000,
    netProfit: 5_500_000,
  },
  cashFlow: CF_2024,
  ratios: {
    ...RATIOS_2024,
    grossMarginPct: 34.3,
    netMarginPct: 15.7,
    roe: 12.2,
  },
  yoyDelta: null,
  qoqDelta: null,
  marketData: null,
  aiAnalysis: null,
  embedding: null,
  embeddingText: "VCB 2023-Q1 BCTC",
  notesRawText: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// Insert a report directly into the in-memory DB (simulates a stored report)
// ─────────────────────────────────────────────────────────────────────────────

function insertFixtureReport(report: FinancialReport): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO financial_reports (
      id, action_code, company_name, exchange, domain,
      period_year, period_quarter, period_type, period_start, period_end, sort_key,
      ssc_url, pdf_path, published_at, parsed_at, audit_status, auditor,
      extraction_confidence,
      net_revenue, gross_profit, operating_profit, ebitda,
      profit_before_tax, net_profit, eps, diluted_eps,
      total_assets, current_assets, cash, inventory,
      total_liabilities, short_term_debt, long_term_debt, equity_total,
      operating_cf, investing_cf, financing_cf, capex, free_cash_flow,
      gross_margin_pct, operating_margin_pct, net_margin_pct,
      roe, roa, current_ratio, debt_to_equity, net_debt_to_ebitda, pe, pb,
      balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json,
      yoy_delta_json, qoq_delta_json, market_data_json, embedding_text, notes_raw_text
    ) VALUES (
      $id, $actionCode, $companyName, $exchange, $domain,
      $periodYear, $periodQuarter, $periodType, $periodStart, $periodEnd, $sortKey,
      $sscUrl, $pdfPath, $publishedAt, $parsedAt, $auditStatus, $auditor,
      $extractionConfidence,
      $netRevenue, $grossProfit, $operatingProfit, $ebitda,
      $profitBeforeTax, $netProfit, $eps, $dilutedEps,
      $totalAssets, $currentAssets, $cash, $inventory,
      $totalLiabilities, $shortTermDebt, $longTermDebt, $equityTotal,
      $operatingCf, $investingCf, $financingCf, $capex, $freeCashFlow,
      $grossMarginPct, $operatingMarginPct, $netMarginPct,
      $roe, $roa, $currentRatio, $debtToEquity, $netDebtToEbitda, $pe, $pb,
      $balanceSheetJson, $incomeStmtJson, $cashFlowJson, $ratiosJson,
      $yoyDeltaJson, $qoqDeltaJson, $marketDataJson, $embeddingText, $notesRawText
    )
  `).run({
    $id: report.id,
    $actionCode: report.actionCode,
    $companyName: report.companyName,
    $exchange: report.exchange,
    $domain: report.domain,
    $periodYear: report.period.year,
    $periodQuarter: report.period.quarter,
    $periodType: report.period.periodType,
    $periodStart: report.period.startDate,
    $periodEnd: report.period.endDate,
    $sortKey: report.period.sortKey,
    $sscUrl: report.source.sscUrl,
    $pdfPath: report.source.pdfPath,
    $publishedAt: report.source.publishedAt,
    $parsedAt: report.source.parsedAt,
    $auditStatus: report.source.auditStatus,
    $auditor: report.source.auditor,
    $extractionConfidence: report.source.extractionConfidence,
    $netRevenue: report.incomeStatement.netRevenue,
    $grossProfit: report.incomeStatement.grossProfit,
    $operatingProfit: report.incomeStatement.operatingProfit,
    $ebitda: report.incomeStatement.ebitda,
    $profitBeforeTax: report.incomeStatement.profitBeforeTax,
    $netProfit: report.incomeStatement.netProfit,
    $eps: report.incomeStatement.eps,
    $dilutedEps: report.incomeStatement.dilutedEps,
    $totalAssets: report.balanceSheet.totalAssets,
    $currentAssets: report.balanceSheet.currentAssets.total,
    $cash: report.balanceSheet.currentAssets.cash,
    $inventory: report.balanceSheet.currentAssets.inventory,
    $totalLiabilities: report.balanceSheet.totalLiabilities,
    $shortTermDebt: report.balanceSheet.currentLiabilities.shortTermDebt,
    $longTermDebt: report.balanceSheet.longTermLiabilities.longTermDebt,
    $equityTotal: report.balanceSheet.equity.total,
    $operatingCf: report.cashFlow.operatingCF,
    $investingCf: report.cashFlow.investingCF,
    $financingCf: report.cashFlow.financingCF,
    $capex: report.cashFlow.capex,
    $freeCashFlow: report.cashFlow.freeCashFlow,
    $grossMarginPct: report.ratios.grossMarginPct ?? null,
    $operatingMarginPct: report.ratios.operatingMarginPct ?? null,
    $netMarginPct: report.ratios.netMarginPct ?? null,
    $roe: report.ratios.roe ?? null,
    $roa: report.ratios.roa ?? null,
    $currentRatio: report.ratios.currentRatio ?? null,
    $debtToEquity: report.ratios.debtToEquity ?? null,
    $netDebtToEbitda: report.ratios.netDebtToEbitda ?? null,
    $pe: report.ratios.pe ?? null,
    $pb: report.ratios.pb ?? null,
    $balanceSheetJson: JSON.stringify(report.balanceSheet),
    $incomeStmtJson: JSON.stringify(report.incomeStatement),
    $cashFlowJson: JSON.stringify(report.cashFlow),
    $ratiosJson: JSON.stringify(report.ratios),
    $yoyDeltaJson: null,
    $qoqDeltaJson: null,
    $marketDataJson: null,
    $embeddingText: report.embeddingText,
    $notesRawText: null,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite setup
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 085 — SSC Report MCP Tools", () => {
  let server: McpServer;

  beforeAll(async () => {
    // Use an in-memory SQLite for all tests
    Bun.env["DB_PATH"] = ":memory:";
    await initDatabase();

    // Remove any rows left by earlier test files that share the same singleton
    // DB connection (e.g. 066-ai-summary.test.ts inserts VCB rows whose
    // sort_key sorts above '2024-Q1', causing get_financial_summary to return
    // zeros instead of the fixture values).
    getDb().exec("DELETE FROM financial_reports WHERE action_code = 'VCB'");

    // Insert fixture reports so get_financial_summary and compare_financials
    // have data to query
    insertFixtureReport(FIXTURE_REPORT);
    insertFixtureReport(FIXTURE_REPORT_2023);
  });

  afterAll(() => {
    closeDb();
  });

  beforeEach(() => {
    server = new McpServer(
      { name: "test-server", version: "0.0.1" },
      { capabilities: { tools: {} } },
    );
    registerReportTools(server);
  });

  // ── Test 1: tools are registered ───────────────────────────────────────────
  // fetch_ssc_reports removed in sprint-036 task 230 (automated via sscCheckerJob)
  it("registers remaining report tools on the McpServer (fetch_ssc_reports removed)", () => {
    const registry = (server as unknown as {
      _registeredTools: Record<string, unknown>;
    })._registeredTools;

    expect("fetch_ssc_reports" in registry).toBe(false); // removed in task 230
    expect("get_financial_summary" in registry).toBe(true);
    expect("compare_financials" in registry).toBe(true);
  });

  // ── Test 2: fetch_ssc_reports — REMOVED in sprint-036 task 230 ───────────────
  it.skip("fetch_ssc_reports returns formatted summary from pipeline (tool removed in task 230)", async () => {
    // fetch_ssc_reports is no longer registered as an MCP tool.
    // SSC fetching is now automated via sscCheckerJob cron.
  });

  // ── Test 3: fetch_ssc_reports — REMOVED in sprint-036 task 230 ──────────────
  it.skip("fetch_ssc_reports handles null result (tool removed in task 230)", async () => {
    // fetch_ssc_reports is no longer registered as an MCP tool.
  });

  // ── Test 4: get_financial_summary returns key metrics ──────────────────────
  it("get_financial_summary returns formatted revenue and profit for stored report", async () => {
    const result = await callTool(server, "get_financial_summary", {
      actionCode: "VCB",
      year: 2024,
      quarter: "Q1",
    });

    expect(result.content).toHaveLength(1);
    const text = result.content[0]!.text;

    // Should include key financial figures from the fixture
    expect(text).toContain("VCB");
    expect(text).toContain("39"); // netRevenue ~39.5 billion
    expect(text).toContain("6");  // netProfit ~6.88 billion
  });

  // ── Test 5: get_financial_summary for missing stock ─────────────────────────
  it("get_financial_summary returns not-found message for unknown stock", async () => {
    const result = await callTool(server, "get_financial_summary", {
      actionCode: "XXXXXX",
    });

    const text = result.content[0]!.text;
    expect(text).toMatch(/no (financial|report|data)/i);
  });

  // ── Test 6: compare_financials shows YoY delta ──────────────────────────────
  it("compare_financials returns YoY comparison between 2024-Q1 and 2023-Q1", async () => {
    const result = await callTool(server, "compare_financials", {
      actionCode: "VCB",
      period1: { year: 2024, quarter: "Q1" },
      period2: { year: 2023, quarter: "Q1" },
    });

    expect(result.content).toHaveLength(1);
    const text = result.content[0]!.text;

    // Should identify the two periods
    expect(text).toContain("2024");
    expect(text).toContain("2023");
    // Should contain a percentage change (revenue grew from 35B to 39.5B ~ +12.9%)
    expect(text).toMatch(/\+?\d+(\.\d+)?%/);
  });

  // ── Test 7: compare_financials handles missing period ───────────────────────
  it("compare_financials returns error when one period is missing", async () => {
    const result = await callTool(server, "compare_financials", {
      actionCode: "VCB",
      period1: { year: 2024, quarter: "Q2" }, // not in DB
      period2: { year: 2023, quarter: "Q1" },
    });

    const text = result.content[0]!.text;
    expect(text).toMatch(/not found|no (data|report)/i);
  });
});
