/**
 * Task 066 — AI Summary Generator (Rule-Based BCTC)
 *
 * Tests for generateAiSummary use case and its pure helper functions.
 * Uses in-memory SQLite to avoid file I/O.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";

// Set DB_PATH before any schema import
process.env["DB_PATH"] = ":memory:";

import {
  generateAiSummary,
  detectFinancialSignals,
  deriveOutlook,
  buildStrengthsWeaknesses,
  buildSummaryNarrative,
} from "../application/usecases/generateAiSummary.js";
import { initDatabase, closeDb, getDb } from "../infrastructure/db/schema.js";
import type { FinancialReport, FinancialSignal } from "../../bctc-schema.js";
import type { Outlook } from "../../bctc-schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fixture helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeReport(overrides: Partial<FinancialReport> = {}): FinancialReport {
  const base: FinancialReport = {
    id: "test-report-001",
    actionCode: "VCB",
    companyName: "Ngân hàng TMCP Ngoại thương Việt Nam",
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
      sscUrl: "https://congbothongtin.ssc.gov.vn/faces/DetailComp.xhtml",
      pdfPath: null,
      publishedAt: "2024-04-25T00:00:00.000Z",
      parsedAt: "2024-04-25T10:00:00.000Z",
      auditStatus: "unaudited",
      auditor: null,
      reportLanguage: "vi",
      pageCount: 10,
      extractionConfidence: 0.95,
    },
    balanceSheet: {
      currentAssets: {
        cash: 50000,
        shortTermInvestments: 10000,
        accountsReceivable: 20000,
        inventory: 5000,
        otherCurrentAssets: 2000,
        total: 87000,
      },
      nonCurrentAssets: {
        longTermReceivables: 5000,
        fixedAssets: 30000,
        investmentProperty: 0,
        longTermInvestments: 10000,
        goodwill: 0,
        otherLongTermAssets: 1000,
        total: 46000,
      },
      totalAssets: 133000,
      currentLiabilities: {
        shortTermDebt: 15000,
        accountsPayable: 8000,
        advancesFromCustomers: 1000,
        taxPayable: 500,
        payablesToEmployees: 300,
        otherCurrentLiabilities: 1200,
        total: 26000,
      },
      longTermLiabilities: {
        longTermDebt: 20000,
        deferredTaxLiabilities: 200,
        otherLongTermLiabilities: 800,
        total: 21000,
      },
      totalLiabilities: 47000,
      equity: {
        shareCapital: 50000,
        sharePremium: 10000,
        treasuryShares: 0,
        retainedEarnings: 25000,
        otherEquityFunds: 1000,
        minorityInterest: 0,
        total: 86000,
      },
      totalLiabilitiesAndEquity: 133000,
    },
    incomeStatement: {
      grossRevenue: 100000,
      revenueDeductions: 2000,
      netRevenue: 98000,
      cogs: 60000,
      grossProfit: 38000,
      financialIncome: 1000,
      financialExpenses: 500,
      interestExpenses: 400,
      shareOfAssociates: 0,
      sellingExpenses: 5000,
      adminExpenses: 3000,
      operatingProfit: 30500,
      otherIncome: 200,
      otherExpenses: 100,
      otherProfit: 100,
      profitBeforeTax: 30600,
      incomeTaxCurrent: 6120,
      incomeTaxDeferred: 0,
      totalIncomeTax: 6120,
      netProfit: 24480,
      minorityInterest: 0,
      netProfitParent: 24480,
      eps: 4896,
      dilutedEps: 4896,
      ebitda: 33500,
      ebit: 30500,
    },
    cashFlow: {
      profitBeforeTax: 30600,
      depreciationAmortization: 3000,
      workingCapitalChanges: -2000,
      interestPaid: 400,
      incomeTaxPaid: 6120,
      operatingCF: 25000,
      capex: -5000,
      proceedsFromAssetSales: 0,
      investmentPurchases: 0,
      investmentProceeds: 0,
      dividendsReceived: 0,
      investingCF: -5000,
      proceedsFromDebt: 0,
      debtRepayments: 0,
      proceedsFromShareIssuance: 0,
      dividendsPaid: -3000,
      financingCF: -3000,
      netCashFlow: 17000,
      beginningCash: 33000,
      endingCash: 50000,
      freeCashFlow: 20000, // operatingCF + capex = 25000 - 5000
    },
    ratios: {
      grossMarginPct: 38.78,
      operatingMarginPct: 31.12,
      netMarginPct: 24.98,
      ebitdaMarginPct: 34.18,
      roe: 28.5,
      roa: 18.4,
      roic: 20.0,
      currentRatio: 3.35,
      quickRatio: 3.15,
      cashRatio: 1.92,
      debtToEquity: 0.8,
      debtToAssets: 0.35,
      netDebt: -15000,
      netDebtToEbitda: -0.45,
      interestCoverageRatio: 76.25,
      assetTurnover: 0.74,
      inventoryTurnover: 12.0,
      inventoryDays: 30.4,
      receivablesTurnover: 4.9,
      receivablesDays: 74.5,
      payablesTurnover: 7.5,
      payablesDays: 48.7,
      cashConversionCycle: 56.2,
      eps: 4896,
      bvps: 17200,
      revenuePerShare: 19600,
      fcfPerShare: 4000,
      pe: null,
      pb: null,
      ps: null,
      evToEbitda: null,
      dividendYieldPct: null,
    },
    yoyDelta: null,
    qoqDelta: null,
    marketData: null,
    aiAnalysis: null,
    embedding: null,
    embeddingText: "",
    notesRawText: null,
  };

  return { ...base, ...overrides } as FinancialReport;
}

// ─────────────────────────────────────────────────────────────────────────────
// DB setup
// ─────────────────────────────────────────────────────────────────────────────

/** Insert a minimal financial_reports row for persist tests.
 * Uses the report id as the sort_key suffix to avoid UNIQUE(action_code, sort_key) conflicts.
 */
function insertReportRow(id: string): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO financial_reports
      (id, action_code, company_name, exchange, domain, period_type,
       period_year, period_quarter, sort_key,
       period_start, period_end,
       published_at, parsed_at, audit_status, extraction_confidence,
       embedding_text, balance_sheet_json, income_stmt_json,
       cash_flow_json, ratios_json)
    VALUES
      (?, 'VCB', 'Ngân hàng TMCP Ngoại thương Việt Nam', 'HOSE', 'banking',
       'Q1', 2024, 1, ?,
       '2024-01-01', '2024-03-31',
       '2024-04-25T00:00:00.000Z', '2024-04-25T10:00:00.000Z', 'unaudited', 0.95,
       '', '{}', '{}', '{}', '{}')
  `);
  stmt.run(id, id);
}

beforeAll(async () => {
  await initDatabase();
});

afterAll(() => {
  closeDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// detectFinancialSignals — unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("detectFinancialSignals", () => {
  it("emits strong_revenue_growth when YoY netRevenue changePct >= 20", () => {
    const report = makeReport({
      yoyDelta: {
        comparedTo: "2023-Q1",
        deltaType: "YoY",
        netRevenue: { current: 98000, previous: 75000, changeAbsolute: 23000, changePct: 30.67 },
        grossProfit: { current: 38000, previous: 28000, changeAbsolute: 10000, changePct: 35.71 },
        operatingProfit: { current: 30500, previous: 22000, changeAbsolute: 8500, changePct: 38.64 },
        netProfit: { current: 24480, previous: 18000, changeAbsolute: 6480, changePct: 36.0 },
        ebitda: { current: 33500, previous: 26000, changeAbsolute: 7500, changePct: 28.85 },
        eps: { current: 4896, previous: 3600, changeAbsolute: 1296, changePct: 36.0 },
        totalAssets: { current: 133000, previous: 120000, changeAbsolute: 13000, changePct: 10.83 },
        equity: { current: 86000, previous: 78000, changeAbsolute: 8000, changePct: 10.26 },
        totalDebt: { current: 35000, previous: 40000, changeAbsolute: -5000, changePct: -12.5 },
        cash: { current: 50000, previous: 40000, changeAbsolute: 10000, changePct: 25.0 },
        grossMarginPP: { current: 38.78, previous: 37.33, changePP: 1.45 },
        netMarginPP: { current: 24.98, previous: 24.0, changePP: 0.98 },
        roePP: { current: 28.5, previous: 23.1, changePP: 5.4 },
        debtToEquityPP: { current: 0.8, previous: 0.51, changePP: -0.29 },
        operatingCF: { current: 25000, previous: 20000, changeAbsolute: 5000, changePct: 25.0 },
        freeCashFlow: { current: 20000, previous: 15000, changeAbsolute: 5000, changePct: 33.33 },
      },
    });
    const signals = detectFinancialSignals(report);
    expect(signals).toContain("strong_revenue_growth" as FinancialSignal);
  });

  it("emits revenue_decline when YoY netRevenue changePct < 0", () => {
    const report = makeReport({
      yoyDelta: {
        comparedTo: "2023-Q1",
        deltaType: "YoY",
        netRevenue: { current: 90000, previous: 98000, changeAbsolute: -8000, changePct: -8.16 },
        grossProfit: { current: 35000, previous: 38000, changeAbsolute: -3000, changePct: -7.89 },
        operatingProfit: { current: 25000, previous: 30500, changeAbsolute: -5500, changePct: -18.03 },
        netProfit: { current: 20000, previous: 24480, changeAbsolute: -4480, changePct: -18.3 },
        ebitda: { current: 28000, previous: 33500, changeAbsolute: -5500, changePct: -16.42 },
        eps: { current: 4000, previous: 4896, changeAbsolute: -896, changePct: -18.3 },
        totalAssets: { current: 133000, previous: 133000, changeAbsolute: 0, changePct: 0 },
        equity: { current: 86000, previous: 86000, changeAbsolute: 0, changePct: 0 },
        totalDebt: { current: 35000, previous: 35000, changeAbsolute: 0, changePct: 0 },
        cash: { current: 50000, previous: 50000, changeAbsolute: 0, changePct: 0 },
        grossMarginPP: { current: 38.78, previous: 38.78, changePP: 0 },
        netMarginPP: { current: 22.22, previous: 24.98, changePP: -2.76 },
        roePP: { current: 23.25, previous: 28.5, changePP: -5.25 },
        debtToEquityPP: { current: 0.41, previous: 0.41, changePP: 0 },
        operatingCF: { current: 20000, previous: 25000, changeAbsolute: -5000, changePct: -20.0 },
        freeCashFlow: { current: 16000, previous: 20000, changeAbsolute: -4000, changePct: -20.0 },
      },
    });
    const signals = detectFinancialSignals(report);
    expect(signals).toContain("revenue_decline" as FinancialSignal);
  });

  it("emits margin_expansion when YoY grossMarginPP.changePP > 1.5", () => {
    const report = makeReport({
      yoyDelta: {
        comparedTo: "2023-Q1",
        deltaType: "YoY",
        netRevenue: { current: 98000, previous: 95000, changeAbsolute: 3000, changePct: 3.16 },
        grossProfit: { current: 38000, previous: 34200, changeAbsolute: 3800, changePct: 11.11 },
        operatingProfit: { current: 30500, previous: 28000, changeAbsolute: 2500, changePct: 8.93 },
        netProfit: { current: 24480, previous: 22000, changeAbsolute: 2480, changePct: 11.27 },
        ebitda: { current: 33500, previous: 30000, changeAbsolute: 3500, changePct: 11.67 },
        eps: { current: 4896, previous: 4400, changeAbsolute: 496, changePct: 11.27 },
        totalAssets: { current: 133000, previous: 120000, changeAbsolute: 13000, changePct: 10.83 },
        equity: { current: 86000, previous: 78000, changeAbsolute: 8000, changePct: 10.26 },
        totalDebt: { current: 35000, previous: 35000, changeAbsolute: 0, changePct: 0 },
        cash: { current: 50000, previous: 40000, changeAbsolute: 10000, changePct: 25.0 },
        grossMarginPP: { current: 38.78, previous: 36.0, changePP: 2.78 },
        netMarginPP: { current: 24.98, previous: 23.16, changePP: 1.82 },
        roePP: { current: 28.5, previous: 28.2, changePP: 0.3 },
        debtToEquityPP: { current: 0.41, previous: 0.45, changePP: -0.04 },
        operatingCF: { current: 25000, previous: 22000, changeAbsolute: 3000, changePct: 13.64 },
        freeCashFlow: { current: 20000, previous: 18000, changeAbsolute: 2000, changePct: 11.11 },
      },
    });
    const signals = detectFinancialSignals(report);
    expect(signals).toContain("margin_expansion" as FinancialSignal);
  });

  it("emits margin_compression when YoY grossMarginPP.changePP < -1.5", () => {
    const report = makeReport({
      yoyDelta: {
        comparedTo: "2023-Q1",
        deltaType: "YoY",
        netRevenue: { current: 98000, previous: 95000, changeAbsolute: 3000, changePct: 3.16 },
        grossProfit: { current: 36000, previous: 36100, changeAbsolute: -100, changePct: -0.28 },
        operatingProfit: { current: 28000, previous: 30000, changeAbsolute: -2000, changePct: -6.67 },
        netProfit: { current: 22000, previous: 24000, changeAbsolute: -2000, changePct: -8.33 },
        ebitda: { current: 30000, previous: 33000, changeAbsolute: -3000, changePct: -9.09 },
        eps: { current: 4400, previous: 4800, changeAbsolute: -400, changePct: -8.33 },
        totalAssets: { current: 133000, previous: 130000, changeAbsolute: 3000, changePct: 2.31 },
        equity: { current: 86000, previous: 84000, changeAbsolute: 2000, changePct: 2.38 },
        totalDebt: { current: 35000, previous: 35000, changeAbsolute: 0, changePct: 0 },
        cash: { current: 50000, previous: 48000, changeAbsolute: 2000, changePct: 4.17 },
        grossMarginPP: { current: 36.73, previous: 38.0, changePP: -1.27 }, // only -1.27, not < -1.5
        netMarginPP: { current: 22.45, previous: 25.26, changePP: -2.81 },
        roePP: { current: 25.58, previous: 28.57, changePP: -2.99 },
        debtToEquityPP: { current: 0.41, previous: 0.42, changePP: -0.01 },
        operatingCF: { current: 23000, previous: 25000, changeAbsolute: -2000, changePct: -8.0 },
        freeCashFlow: { current: 18000, previous: 20000, changeAbsolute: -2000, changePct: -10.0 },
      },
    });
    const signals1 = detectFinancialSignals(report);
    expect(signals1).not.toContain("margin_compression" as FinancialSignal);

    // Now with changePP < -1.5
    const report2 = makeReport({
      yoyDelta: {
        ...report.yoyDelta!,
        grossMarginPP: { current: 36.0, previous: 38.0, changePP: -2.0 },
      },
    });
    const signals2 = detectFinancialSignals(report2);
    expect(signals2).toContain("margin_compression" as FinancialSignal);
  });

  it("emits strong_profit_growth when YoY netProfit changePct >= 20", () => {
    const report = makeReport({
      yoyDelta: {
        comparedTo: "2023-Q1",
        deltaType: "YoY",
        netRevenue: { current: 98000, previous: 95000, changeAbsolute: 3000, changePct: 3.16 },
        grossProfit: { current: 38000, previous: 36000, changeAbsolute: 2000, changePct: 5.56 },
        operatingProfit: { current: 30500, previous: 25000, changeAbsolute: 5500, changePct: 22.0 },
        netProfit: { current: 24480, previous: 20000, changeAbsolute: 4480, changePct: 22.4 },
        ebitda: { current: 33500, previous: 28000, changeAbsolute: 5500, changePct: 19.64 },
        eps: { current: 4896, previous: 4000, changeAbsolute: 896, changePct: 22.4 },
        totalAssets: { current: 133000, previous: 120000, changeAbsolute: 13000, changePct: 10.83 },
        equity: { current: 86000, previous: 78000, changeAbsolute: 8000, changePct: 10.26 },
        totalDebt: { current: 35000, previous: 35000, changeAbsolute: 0, changePct: 0 },
        cash: { current: 50000, previous: 40000, changeAbsolute: 10000, changePct: 25.0 },
        grossMarginPP: { current: 38.78, previous: 37.89, changePP: 0.89 },
        netMarginPP: { current: 24.98, previous: 21.05, changePP: 3.93 },
        roePP: { current: 28.5, previous: 25.64, changePP: 2.86 },
        debtToEquityPP: { current: 0.41, previous: 0.45, changePP: -0.04 },
        operatingCF: { current: 25000, previous: 21000, changeAbsolute: 4000, changePct: 19.05 },
        freeCashFlow: { current: 20000, previous: 16000, changeAbsolute: 4000, changePct: 25.0 },
      },
    });
    const signals = detectFinancialSignals(report);
    expect(signals).toContain("strong_profit_growth" as FinancialSignal);
  });

  it("emits profit_decline when YoY netProfit changePct < 0", () => {
    const report = makeReport({
      yoyDelta: {
        comparedTo: "2023-Q1",
        deltaType: "YoY",
        netRevenue: { current: 98000, previous: 95000, changeAbsolute: 3000, changePct: 3.16 },
        grossProfit: { current: 38000, previous: 36000, changeAbsolute: 2000, changePct: 5.56 },
        operatingProfit: { current: 28000, previous: 30000, changeAbsolute: -2000, changePct: -6.67 },
        netProfit: { current: 22000, previous: 24480, changeAbsolute: -2480, changePct: -10.13 },
        ebitda: { current: 31000, previous: 33500, changeAbsolute: -2500, changePct: -7.46 },
        eps: { current: 4400, previous: 4896, changeAbsolute: -496, changePct: -10.13 },
        totalAssets: { current: 133000, previous: 133000, changeAbsolute: 0, changePct: 0 },
        equity: { current: 86000, previous: 86000, changeAbsolute: 0, changePct: 0 },
        totalDebt: { current: 35000, previous: 35000, changeAbsolute: 0, changePct: 0 },
        cash: { current: 50000, previous: 50000, changeAbsolute: 0, changePct: 0 },
        grossMarginPP: { current: 38.78, previous: 37.89, changePP: 0.89 },
        netMarginPP: { current: 22.45, previous: 25.77, changePP: -3.32 },
        roePP: { current: 25.58, previous: 28.5, changePP: -2.92 },
        debtToEquityPP: { current: 0.41, previous: 0.41, changePP: 0 },
        operatingCF: { current: 23000, previous: 25000, changeAbsolute: -2000, changePct: -8.0 },
        freeCashFlow: { current: 18000, previous: 20000, changeAbsolute: -2000, changePct: -10.0 },
      },
    });
    const signals = detectFinancialSignals(report);
    expect(signals).toContain("profit_decline" as FinancialSignal);
  });

  it("emits high_debt when debtToEquity > 2.0", () => {
    const report = makeReport({
      ratios: { ...makeReport().ratios, debtToEquity: 2.5 },
    });
    const signals = detectFinancialSignals(report);
    expect(signals).toContain("high_debt" as FinancialSignal);
  });

  it("emits high_debt and caps Infinity debtToEquity at 99.9", () => {
    const report = makeReport({
      ratios: { ...makeReport().ratios, debtToEquity: Infinity },
    });
    const signals = detectFinancialSignals(report);
    expect(signals).toContain("high_debt" as FinancialSignal);
    // Does not throw — Infinity is handled
  });

  it("emits debt_reduction when YoY totalDebt changePct < -10", () => {
    const report = makeReport({
      yoyDelta: {
        comparedTo: "2023-Q1",
        deltaType: "YoY",
        netRevenue: { current: 98000, previous: 95000, changeAbsolute: 3000, changePct: 3.16 },
        grossProfit: { current: 38000, previous: 36000, changeAbsolute: 2000, changePct: 5.56 },
        operatingProfit: { current: 30500, previous: 29000, changeAbsolute: 1500, changePct: 5.17 },
        netProfit: { current: 24480, previous: 23000, changeAbsolute: 1480, changePct: 6.43 },
        ebitda: { current: 33500, previous: 32000, changeAbsolute: 1500, changePct: 4.69 },
        eps: { current: 4896, previous: 4600, changeAbsolute: 296, changePct: 6.43 },
        totalAssets: { current: 133000, previous: 138000, changeAbsolute: -5000, changePct: -3.62 },
        equity: { current: 86000, previous: 84000, changeAbsolute: 2000, changePct: 2.38 },
        totalDebt: { current: 28000, previous: 40000, changeAbsolute: -12000, changePct: -30.0 },
        cash: { current: 50000, previous: 45000, changeAbsolute: 5000, changePct: 11.11 },
        grossMarginPP: { current: 38.78, previous: 37.89, changePP: 0.89 },
        netMarginPP: { current: 24.98, previous: 24.21, changePP: 0.77 },
        roePP: { current: 28.5, previous: 27.38, changePP: 1.12 },
        debtToEquityPP: { current: 0.33, previous: 0.48, changePP: -0.15 },
        operatingCF: { current: 25000, previous: 23000, changeAbsolute: 2000, changePct: 8.7 },
        freeCashFlow: { current: 20000, previous: 18000, changeAbsolute: 2000, changePct: 11.11 },
      },
    });
    const signals = detectFinancialSignals(report);
    expect(signals).toContain("debt_reduction" as FinancialSignal);
  });

  it("emits strong_cashflow when FCF > 0 and YoY freeCashFlow changePct > 0", () => {
    const report = makeReport({
      cashFlow: { ...makeReport().cashFlow, freeCashFlow: 20000 },
      yoyDelta: {
        comparedTo: "2023-Q1",
        deltaType: "YoY",
        netRevenue: { current: 98000, previous: 95000, changeAbsolute: 3000, changePct: 3.16 },
        grossProfit: { current: 38000, previous: 36000, changeAbsolute: 2000, changePct: 5.56 },
        operatingProfit: { current: 30500, previous: 29000, changeAbsolute: 1500, changePct: 5.17 },
        netProfit: { current: 24480, previous: 23000, changeAbsolute: 1480, changePct: 6.43 },
        ebitda: { current: 33500, previous: 32000, changeAbsolute: 1500, changePct: 4.69 },
        eps: { current: 4896, previous: 4600, changeAbsolute: 296, changePct: 6.43 },
        totalAssets: { current: 133000, previous: 120000, changeAbsolute: 13000, changePct: 10.83 },
        equity: { current: 86000, previous: 78000, changeAbsolute: 8000, changePct: 10.26 },
        totalDebt: { current: 35000, previous: 35000, changeAbsolute: 0, changePct: 0 },
        cash: { current: 50000, previous: 40000, changeAbsolute: 10000, changePct: 25.0 },
        grossMarginPP: { current: 38.78, previous: 37.89, changePP: 0.89 },
        netMarginPP: { current: 24.98, previous: 24.21, changePP: 0.77 },
        roePP: { current: 28.5, previous: 29.49, changePP: -0.99 },
        debtToEquityPP: { current: 0.41, previous: 0.45, changePP: -0.04 },
        operatingCF: { current: 25000, previous: 22000, changeAbsolute: 3000, changePct: 13.64 },
        freeCashFlow: { current: 20000, previous: 15000, changeAbsolute: 5000, changePct: 33.33 },
      },
    });
    const signals = detectFinancialSignals(report);
    expect(signals).toContain("strong_cashflow" as FinancialSignal);
  });

  it("emits negative_cashflow when FCF < 0", () => {
    const report = makeReport({
      cashFlow: { ...makeReport().cashFlow, freeCashFlow: -5000 },
    });
    const signals = detectFinancialSignals(report);
    expect(signals).toContain("negative_cashflow" as FinancialSignal);
  });

  it("emits inventory_buildup when inventoryDays > 90", () => {
    const report = makeReport({
      ratios: { ...makeReport().ratios, inventoryDays: 95 },
    });
    const signals = detectFinancialSignals(report);
    expect(signals).toContain("inventory_buildup" as FinancialSignal);
  });

  it("emits receivables_concern when receivablesDays > 60", () => {
    const report = makeReport({
      ratios: { ...makeReport().ratios, receivablesDays: 65 },
    });
    const signals = detectFinancialSignals(report);
    expect(signals).toContain("receivables_concern" as FinancialSignal);
  });

  it("does not emit delta-based signals when yoyDelta is null", () => {
    const report = makeReport({ yoyDelta: null });
    const signals = detectFinancialSignals(report);
    expect(signals).not.toContain("strong_revenue_growth" as FinancialSignal);
    expect(signals).not.toContain("revenue_decline" as FinancialSignal);
    expect(signals).not.toContain("strong_profit_growth" as FinancialSignal);
    expect(signals).not.toContain("profit_decline" as FinancialSignal);
    expect(signals).not.toContain("margin_expansion" as FinancialSignal);
    expect(signals).not.toContain("margin_compression" as FinancialSignal);
  });

  it("skips changePct checks when changePct is null", () => {
    const report = makeReport({
      yoyDelta: {
        comparedTo: "2023-Q1",
        deltaType: "YoY",
        netRevenue: { current: 98000, previous: 0, changeAbsolute: 98000, changePct: null },
        grossProfit: { current: 38000, previous: 0, changeAbsolute: 38000, changePct: null },
        operatingProfit: { current: 30500, previous: 0, changeAbsolute: 30500, changePct: null },
        netProfit: { current: 24480, previous: 0, changeAbsolute: 24480, changePct: null },
        ebitda: { current: 33500, previous: 0, changeAbsolute: 33500, changePct: null },
        eps: { current: 4896, previous: 0, changeAbsolute: 4896, changePct: null },
        totalAssets: { current: 133000, previous: 0, changeAbsolute: 133000, changePct: null },
        equity: { current: 86000, previous: 0, changeAbsolute: 86000, changePct: null },
        totalDebt: { current: 35000, previous: 0, changeAbsolute: 35000, changePct: null },
        cash: { current: 50000, previous: 0, changeAbsolute: 50000, changePct: null },
        grossMarginPP: { current: 38.78, previous: 0, changePP: 38.78 },
        netMarginPP: { current: 24.98, previous: 0, changePP: 24.98 },
        roePP: { current: 28.5, previous: 0, changePP: 28.5 },
        debtToEquityPP: { current: 0.41, previous: 0, changePP: 0.41 },
        operatingCF: { current: 25000, previous: 0, changeAbsolute: 25000, changePct: null },
        freeCashFlow: { current: 20000, previous: 0, changeAbsolute: 20000, changePct: null },
      },
    });
    // Should not throw and should not produce revenue/profit delta signals
    expect(() => detectFinancialSignals(report)).not.toThrow();
    const signals = detectFinancialSignals(report);
    expect(signals).not.toContain("strong_revenue_growth" as FinancialSignal);
    expect(signals).not.toContain("revenue_decline" as FinancialSignal);
  });

  it("does not emit both strong_revenue_growth and revenue_decline for same report", () => {
    // Mathematically impossible, but guard against regression
    const report = makeReport({
      yoyDelta: {
        comparedTo: "2023-Q1",
        deltaType: "YoY",
        netRevenue: { current: 98000, previous: 75000, changeAbsolute: 23000, changePct: 30.67 },
        grossProfit: { current: 38000, previous: 28000, changeAbsolute: 10000, changePct: 35.71 },
        operatingProfit: { current: 30500, previous: 22000, changeAbsolute: 8500, changePct: 38.64 },
        netProfit: { current: 24480, previous: 18000, changeAbsolute: 6480, changePct: 36.0 },
        ebitda: { current: 33500, previous: 26000, changeAbsolute: 7500, changePct: 28.85 },
        eps: { current: 4896, previous: 3600, changeAbsolute: 1296, changePct: 36.0 },
        totalAssets: { current: 133000, previous: 120000, changeAbsolute: 13000, changePct: 10.83 },
        equity: { current: 86000, previous: 78000, changeAbsolute: 8000, changePct: 10.26 },
        totalDebt: { current: 35000, previous: 40000, changeAbsolute: -5000, changePct: -12.5 },
        cash: { current: 50000, previous: 40000, changeAbsolute: 10000, changePct: 25.0 },
        grossMarginPP: { current: 38.78, previous: 37.33, changePP: 1.45 },
        netMarginPP: { current: 24.98, previous: 24.0, changePP: 0.98 },
        roePP: { current: 28.5, previous: 23.1, changePP: 5.4 },
        debtToEquityPP: { current: 0.41, previous: 0.51, changePP: -0.1 },
        operatingCF: { current: 25000, previous: 20000, changeAbsolute: 5000, changePct: 25.0 },
        freeCashFlow: { current: 20000, previous: 15000, changeAbsolute: 5000, changePct: 33.33 },
      },
    });
    const signals = detectFinancialSignals(report);
    const hasGrowth = signals.includes("strong_revenue_growth");
    const hasDecline = signals.includes("revenue_decline");
    expect(hasGrowth && hasDecline).toBe(false);
  });

  it("deduplicates signals (no duplicates in output)", () => {
    const report = makeReport({
      ratios: { ...makeReport().ratios, debtToEquity: 3.0, inventoryDays: 100 },
    });
    const signals = detectFinancialSignals(report);
    const unique = new Set(signals);
    expect(signals.length).toBe(unique.size);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// deriveOutlook — unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("deriveOutlook", () => {
  it("returns 'positive' when >= 2 positive signals and no negative signals", () => {
    const signals: FinancialSignal[] = ["strong_revenue_growth", "strong_profit_growth", "margin_expansion"];
    expect(deriveOutlook(signals)).toBe("positive" as Outlook);
  });

  it("returns 'negative' when >= 2 negative signals and no positive signals", () => {
    const signals: FinancialSignal[] = ["revenue_decline", "profit_decline", "high_debt"];
    expect(deriveOutlook(signals)).toBe("negative" as Outlook);
  });

  it("returns 'mixed' when both positive and negative signals present", () => {
    const signals: FinancialSignal[] = ["strong_revenue_growth", "negative_cashflow", "high_debt"];
    expect(deriveOutlook(signals)).toBe("mixed" as Outlook);
  });

  it("returns 'neutral' when no signals", () => {
    expect(deriveOutlook([])).toBe("neutral" as Outlook);
  });

  it("returns 'neutral' for only 1 positive signal with no negatives", () => {
    const signals: FinancialSignal[] = ["strong_revenue_growth"];
    expect(deriveOutlook(signals)).toBe("neutral" as Outlook);
  });

  it("returns 'neutral' for only 1 negative signal with no positives", () => {
    const signals: FinancialSignal[] = ["high_debt"];
    expect(deriveOutlook(signals)).toBe("neutral" as Outlook);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildStrengthsWeaknesses — unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("buildStrengthsWeaknesses", () => {
  it("maps positive signals to keyStrengths", () => {
    const report = makeReport({
      yoyDelta: {
        comparedTo: "2023-Q1",
        deltaType: "YoY",
        netRevenue: { current: 98000, previous: 75000, changeAbsolute: 23000, changePct: 30.67 },
        grossProfit: { current: 38000, previous: 28000, changeAbsolute: 10000, changePct: 35.71 },
        operatingProfit: { current: 30500, previous: 22000, changeAbsolute: 8500, changePct: 38.64 },
        netProfit: { current: 24480, previous: 18000, changeAbsolute: 6480, changePct: 36.0 },
        ebitda: { current: 33500, previous: 26000, changeAbsolute: 7500, changePct: 28.85 },
        eps: { current: 4896, previous: 3600, changeAbsolute: 1296, changePct: 36.0 },
        totalAssets: { current: 133000, previous: 120000, changeAbsolute: 13000, changePct: 10.83 },
        equity: { current: 86000, previous: 78000, changeAbsolute: 8000, changePct: 10.26 },
        totalDebt: { current: 35000, previous: 40000, changeAbsolute: -5000, changePct: -12.5 },
        cash: { current: 50000, previous: 40000, changeAbsolute: 10000, changePct: 25.0 },
        grossMarginPP: { current: 38.78, previous: 37.33, changePP: 1.45 },
        netMarginPP: { current: 24.98, previous: 24.0, changePP: 0.98 },
        roePP: { current: 28.5, previous: 23.1, changePP: 5.4 },
        debtToEquityPP: { current: 0.41, previous: 0.51, changePP: -0.1 },
        operatingCF: { current: 25000, previous: 20000, changeAbsolute: 5000, changePct: 25.0 },
        freeCashFlow: { current: 20000, previous: 15000, changeAbsolute: 5000, changePct: 33.33 },
      },
    });
    const signals: FinancialSignal[] = ["strong_revenue_growth", "strong_profit_growth"];
    const { keyStrengths, keyWeaknesses } = buildStrengthsWeaknesses(signals, report);
    expect(keyStrengths.length).toBeGreaterThan(0);
    expect(keyWeaknesses.length).toBe(0);
    expect(keyStrengths[0]).toContain("30"); // Revenue changePct 30.67
  });

  it("maps negative signals to keyWeaknesses", () => {
    const report = makeReport({
      ratios: { ...makeReport().ratios, debtToEquity: 2.8, receivablesDays: 70 },
    });
    const signals: FinancialSignal[] = ["high_debt", "receivables_concern"];
    const { keyStrengths, keyWeaknesses } = buildStrengthsWeaknesses(signals, report);
    expect(keyWeaknesses.length).toBeGreaterThan(0);
    expect(keyStrengths.length).toBe(0);
    expect(keyWeaknesses.some(w => w.includes("2.80") || w.includes("2.8"))).toBe(true);
  });

  it("returns empty arrays when no signals", () => {
    const report = makeReport();
    const { keyStrengths, keyWeaknesses } = buildStrengthsWeaknesses([], report);
    expect(keyStrengths).toEqual([]);
    expect(keyWeaknesses).toEqual([]);
  });

  it("includes metric values in generated text", () => {
    const report = makeReport({
      ratios: { ...makeReport().ratios, inventoryDays: 105 },
    });
    const signals: FinancialSignal[] = ["inventory_buildup"];
    const { keyWeaknesses } = buildStrengthsWeaknesses(signals, report);
    expect(keyWeaknesses.length).toBe(1);
    expect(keyWeaknesses[0]).toContain("105");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildSummaryNarrative — unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("buildSummaryNarrative", () => {
  it("includes stock code in summary", () => {
    const report = makeReport();
    const narrative = buildSummaryNarrative(report, [], "neutral");
    expect(narrative).toContain("VCB");
  });

  it("includes period in summary", () => {
    const report = makeReport();
    const narrative = buildSummaryNarrative(report, [], "neutral");
    expect(narrative.length).toBeGreaterThan(20);
  });

  it("references positive outlook in text", () => {
    const report = makeReport();
    const signals: FinancialSignal[] = ["strong_revenue_growth", "strong_profit_growth"];
    const narrative = buildSummaryNarrative(report, signals, "positive");
    expect(narrative.toLowerCase()).toMatch(/tích cực|tốt|tăng trưởng|mạnh/i);
  });

  it("references negative outlook in text", () => {
    const report = makeReport();
    const signals: FinancialSignal[] = ["revenue_decline", "profit_decline"];
    const narrative = buildSummaryNarrative(report, signals, "negative");
    expect(narrative.toLowerCase()).toMatch(/tiêu cực|giảm|yếu|cần theo dõi/i);
  });

  it("works with empty signals (ratios-only path)", () => {
    const report = makeReport({ yoyDelta: null });
    const narrative = buildSummaryNarrative(report, [], "neutral");
    expect(narrative.length).toBeGreaterThan(0);
    expect(narrative).toContain("VCB");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// generateAiSummary — integration tests
// ─────────────────────────────────────────────────────────────────────────────

describe("generateAiSummary", () => {
  it("returns positive outlook for report with strong growth signals", async () => {
    const id = "test-report-positive-001";
    insertReportRow(id);
    const report = makeReport({
      id,
      // Override receivablesDays to not trigger receivables_concern (> 60 = negative)
      ratios: { ...makeReport().ratios, receivablesDays: 45 },
      yoyDelta: {
        comparedTo: "2023-Q1",
        deltaType: "YoY",
        netRevenue: { current: 98000, previous: 75000, changeAbsolute: 23000, changePct: 30.67 },
        grossProfit: { current: 38000, previous: 28000, changeAbsolute: 10000, changePct: 35.71 },
        operatingProfit: { current: 30500, previous: 22000, changeAbsolute: 8500, changePct: 38.64 },
        netProfit: { current: 24480, previous: 18000, changeAbsolute: 6480, changePct: 36.0 },
        ebitda: { current: 33500, previous: 26000, changeAbsolute: 7500, changePct: 28.85 },
        eps: { current: 4896, previous: 3600, changeAbsolute: 1296, changePct: 36.0 },
        totalAssets: { current: 133000, previous: 120000, changeAbsolute: 13000, changePct: 10.83 },
        equity: { current: 86000, previous: 78000, changeAbsolute: 8000, changePct: 10.26 },
        totalDebt: { current: 35000, previous: 40000, changeAbsolute: -5000, changePct: -12.5 },
        cash: { current: 50000, previous: 40000, changeAbsolute: 10000, changePct: 25.0 },
        grossMarginPP: { current: 38.78, previous: 36.0, changePP: 2.78 },
        netMarginPP: { current: 24.98, previous: 24.0, changePP: 0.98 },
        roePP: { current: 28.5, previous: 23.1, changePP: 5.4 },
        debtToEquityPP: { current: 0.41, previous: 0.51, changePP: -0.1 },
        operatingCF: { current: 25000, previous: 20000, changeAbsolute: 5000, changePct: 25.0 },
        freeCashFlow: { current: 20000, previous: 15000, changeAbsolute: 5000, changePct: 33.33 },
      },
      cashFlow: { ...makeReport().cashFlow, freeCashFlow: 20000 },
    });

    const db = getDb();
    const result = await generateAiSummary(report, { db });

    expect(result.signals).toContain("strong_revenue_growth" as FinancialSignal);
    expect(result.signals).toContain("margin_expansion" as FinancialSignal);
    expect(result.signals).toContain("strong_profit_growth" as FinancialSignal);
    expect(result.outlook).toBe("positive" as Outlook);
    expect(result.keyStrengths.length).toBeGreaterThanOrEqual(2);
    expect(result.keyWeaknesses.length).toBe(0);
    expect(result.summary).toBeTruthy();
    expect(result.generatedAt).toBeTruthy();
    // Validate ISO timestamp
    expect(() => new Date(result.generatedAt)).not.toThrow();
    expect(new Date(result.generatedAt).toISOString()).toBe(result.generatedAt);
  });

  it("returns negative outlook for report with revenue decline, negative FCF, high D/E", async () => {
    const id = "test-report-negative-001";
    insertReportRow(id);
    const report = makeReport({
      id,
      ratios: { ...makeReport().ratios, debtToEquity: 2.5 },
      cashFlow: { ...makeReport().cashFlow, freeCashFlow: -8000 },
      yoyDelta: {
        comparedTo: "2023-Q1",
        deltaType: "YoY",
        netRevenue: { current: 90000, previous: 98000, changeAbsolute: -8000, changePct: -8.16 },
        grossProfit: { current: 35000, previous: 38000, changeAbsolute: -3000, changePct: -7.89 },
        operatingProfit: { current: 25000, previous: 30500, changeAbsolute: -5500, changePct: -18.03 },
        netProfit: { current: 20000, previous: 24480, changeAbsolute: -4480, changePct: -18.3 },
        ebitda: { current: 28000, previous: 33500, changeAbsolute: -5500, changePct: -16.42 },
        eps: { current: 4000, previous: 4896, changeAbsolute: -896, changePct: -18.3 },
        totalAssets: { current: 133000, previous: 133000, changeAbsolute: 0, changePct: 0 },
        equity: { current: 86000, previous: 86000, changeAbsolute: 0, changePct: 0 },
        totalDebt: { current: 35000, previous: 35000, changeAbsolute: 0, changePct: 0 },
        cash: { current: 50000, previous: 50000, changeAbsolute: 0, changePct: 0 },
        grossMarginPP: { current: 38.78, previous: 38.78, changePP: 0 },
        netMarginPP: { current: 22.22, previous: 24.98, changePP: -2.76 },
        roePP: { current: 23.25, previous: 28.5, changePP: -5.25 },
        debtToEquityPP: { current: 0.41, previous: 0.41, changePP: 0 },
        operatingCF: { current: 20000, previous: 25000, changeAbsolute: -5000, changePct: -20.0 },
        freeCashFlow: { current: -8000, previous: 20000, changeAbsolute: -28000, changePct: -140.0 },
      },
    });

    const db = getDb();
    const result = await generateAiSummary(report, { db });

    expect(result.signals).toContain("revenue_decline" as FinancialSignal);
    expect(result.signals).toContain("negative_cashflow" as FinancialSignal);
    expect(result.signals).toContain("high_debt" as FinancialSignal);
    expect(result.outlook).toBe("negative" as Outlook);
    expect(result.keyWeaknesses.length).toBeGreaterThanOrEqual(2);
  });

  it("handles mixed signals correctly", async () => {
    const id = "test-report-mixed-001";
    insertReportRow(id);
    const report = makeReport({
      id,
      ratios: { ...makeReport().ratios, debtToEquity: 2.5, inventoryDays: 100 },
      cashFlow: { ...makeReport().cashFlow, freeCashFlow: 20000 },
      yoyDelta: {
        comparedTo: "2023-Q1",
        deltaType: "YoY",
        netRevenue: { current: 98000, previous: 75000, changeAbsolute: 23000, changePct: 30.67 },
        grossProfit: { current: 38000, previous: 28000, changeAbsolute: 10000, changePct: 35.71 },
        operatingProfit: { current: 30500, previous: 22000, changeAbsolute: 8500, changePct: 38.64 },
        netProfit: { current: 24480, previous: 18000, changeAbsolute: 6480, changePct: 36.0 },
        ebitda: { current: 33500, previous: 26000, changeAbsolute: 7500, changePct: 28.85 },
        eps: { current: 4896, previous: 3600, changeAbsolute: 1296, changePct: 36.0 },
        totalAssets: { current: 133000, previous: 120000, changeAbsolute: 13000, changePct: 10.83 },
        equity: { current: 86000, previous: 78000, changeAbsolute: 8000, changePct: 10.26 },
        totalDebt: { current: 35000, previous: 40000, changeAbsolute: -5000, changePct: -12.5 },
        cash: { current: 50000, previous: 40000, changeAbsolute: 10000, changePct: 25.0 },
        grossMarginPP: { current: 38.78, previous: 36.0, changePP: 2.78 },
        netMarginPP: { current: 24.98, previous: 24.0, changePP: 0.98 },
        roePP: { current: 28.5, previous: 23.1, changePP: 5.4 },
        debtToEquityPP: { current: 0.41, previous: 0.51, changePP: -0.1 },
        operatingCF: { current: 25000, previous: 20000, changeAbsolute: 5000, changePct: 25.0 },
        freeCashFlow: { current: 20000, previous: 15000, changeAbsolute: 5000, changePct: 33.33 },
      },
    });

    const db = getDb();
    const result = await generateAiSummary(report, { db });
    expect(result.outlook).toBe("mixed" as Outlook);
  });

  it("returns neutral outlook with empty signals for report with no notable ratios", async () => {
    const id = "test-report-neutral-001";
    insertReportRow(id);
    const report = makeReport({
      id,
      yoyDelta: null,
      ratios: {
        ...makeReport().ratios,
        debtToEquity: 0.5,
        inventoryDays: 30,
        receivablesDays: 40,
      },
      cashFlow: { ...makeReport().cashFlow, freeCashFlow: 0 },
    });

    const db = getDb();
    const result = await generateAiSummary(report, { db });
    expect(result.outlook).toBe("neutral" as Outlook);
    expect(result.signals.length).toBe(0);
    expect(result.keyStrengths).toEqual([]);
    expect(result.keyWeaknesses).toEqual([]);
    expect(result.summary).toBeTruthy();
  });

  it("includes stock code and key findings in summary text", async () => {
    const id = "test-report-summary-text-001";
    insertReportRow(id);
    const report = makeReport({
      id,
      yoyDelta: {
        comparedTo: "2023-Q1",
        deltaType: "YoY",
        netRevenue: { current: 98000, previous: 75000, changeAbsolute: 23000, changePct: 30.67 },
        grossProfit: { current: 38000, previous: 28000, changeAbsolute: 10000, changePct: 35.71 },
        operatingProfit: { current: 30500, previous: 22000, changeAbsolute: 8500, changePct: 38.64 },
        netProfit: { current: 24480, previous: 18000, changeAbsolute: 6480, changePct: 36.0 },
        ebitda: { current: 33500, previous: 26000, changeAbsolute: 7500, changePct: 28.85 },
        eps: { current: 4896, previous: 3600, changeAbsolute: 1296, changePct: 36.0 },
        totalAssets: { current: 133000, previous: 120000, changeAbsolute: 13000, changePct: 10.83 },
        equity: { current: 86000, previous: 78000, changeAbsolute: 8000, changePct: 10.26 },
        totalDebt: { current: 35000, previous: 40000, changeAbsolute: -5000, changePct: -12.5 },
        cash: { current: 50000, previous: 40000, changeAbsolute: 10000, changePct: 25.0 },
        grossMarginPP: { current: 38.78, previous: 37.33, changePP: 1.45 },
        netMarginPP: { current: 24.98, previous: 24.0, changePP: 0.98 },
        roePP: { current: 28.5, previous: 23.1, changePP: 5.4 },
        debtToEquityPP: { current: 0.41, previous: 0.51, changePP: -0.1 },
        operatingCF: { current: 25000, previous: 20000, changeAbsolute: 5000, changePct: 25.0 },
        freeCashFlow: { current: 20000, previous: 15000, changeAbsolute: 5000, changePct: 33.33 },
      },
      cashFlow: { ...makeReport().cashFlow, freeCashFlow: 20000 },
    });

    const db = getDb();
    const result = await generateAiSummary(report, { db });
    expect(result.summary).toContain("VCB");
    expect(result.summary.length).toBeGreaterThan(30);
  });

  it("does not throw when periodDeltas is null (ratios-only report)", async () => {
    const id = "test-report-nodelta-001";
    insertReportRow(id);
    const report = makeReport({ id, yoyDelta: null, qoqDelta: null });

    const db = getDb();
    let error: unknown = null;
    try {
      await generateAiSummary(report, { db });
    } catch (e) {
      error = e;
    }
    expect(error).toBeNull();
  });

  it("persists ai_analysis to financial_reports table", async () => {
    const id = "test-report-persist-001";
    insertReportRow(id);
    const report = makeReport({ id });

    const db = getDb();
    const result = await generateAiSummary(report, { db });

    const row = db
      .query<{ ai_analysis: string }, [string]>(
        "SELECT ai_analysis FROM financial_reports WHERE id = ?"
      )
      .get(id);

    expect(row).not.toBeNull();
    expect(row!.ai_analysis).toBeTruthy();
    const parsed = JSON.parse(row!.ai_analysis);
    expect(parsed.outlook).toBe(result.outlook);
    expect(parsed.generatedAt).toBe(result.generatedAt);
  });

  it("does not throw when report id is not found in DB (logs warning, returns result)", async () => {
    const report = makeReport({ id: "non-existent-id-999" });
    const db = getDb();

    let error: unknown = null;
    let result;
    try {
      result = await generateAiSummary(report, { db });
    } catch (e) {
      error = e;
    }
    expect(error).toBeNull();
    expect(result).toBeTruthy();
  });
});
