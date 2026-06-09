/**
 * Task 1941d — net_profit API bridge preference in cashFlowTool OCF/NI ratio
 *
 * Root cause (2026-05-18 FA cycle): financial_reports.net_profit = 20,225 triệu
 * for FPT Q4/2025 — that is a revenue-level figure, not NI. The OCR extractor
 * matched an incorrect line and stored gross/net revenue as net_profit.
 * vnstock_financials.net_profit_bn = 2,509.52 billion = 2,509,520 triệu VND (correct).
 *
 * Fix: introduce `net_profit_api_bridge` column (triệu VND, nullable) in
 * financial_reports, populated by bridgeNetProfitToFinancialReports() from
 * vnstock_financials.net_profit_bn * 1000. The cashFlowTool uses COALESCE
 * (net_profit_api_bridge, net_profit) for the OCF/NI ratio denominator.
 *
 * Unit conversion: vnstock_financials.net_profit_bn is tỷ VND (billions).
 *                  financial_reports.net_profit_api_bridge is triệu VND (millions).
 *                  Multiply by 1000.0.
 *
 * Tests:
 *   T1 — bridgeNetProfitToFinancialReports writes correct triệu value from tỷ
 *   T2 — cashFlowTool prefers net_profit_api_bridge over OCR net_profit for ratio
 *   T3 — FPT-realistic: OCR NI=20,225, API bridge NI=2,509,520 → ratio ≈ 1.64 (passes guard)
 *   T4 — NULL API bridge → falls back to OCR net_profit (ratio still computed)
 *   T5 — backfillAllNetProfit covers all distinct tickers in vnstock_financials
 *   T6 — api_bridge NI=0 → ratio null (guard), not division by zero
 *   T7 — ni_source field: "api_bridge" when net_profit_api_bridge used, "ocr" otherwise
 */

import { describe, it, expect } from "bun:test";
import Database from "bun:sqlite";

import {
  bridgeNetProfitToFinancialReports,
  backfillAllNetProfit,
} from "../infrastructure/db/schema-financial-reports.js";
import { buildGetCashFlowHandler } from "../interface/mcp/tools/financial-reports/cashFlowTool.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTestDb(): InstanceType<typeof Database> {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS financial_reports (
      id                      INTEGER PRIMARY KEY AUTOINCREMENT,
      action_code             TEXT    NOT NULL,
      period_year             INTEGER NOT NULL,
      period_quarter          INTEGER,
      net_profit              REAL,
      operating_cf            REAL,
      investing_cf            REAL,
      financing_cf            REAL,
      capex                   REAL,
      free_cash_flow          REAL,
      operating_cash_flow     REAL,
      net_profit_api_bridge   REAL,
      inventory               REAL,
      current_assets          REAL,
      cash                    REAL
    );
  `);
  db.exec(`
    CREATE TABLE vnstock_financials (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      code            TEXT    NOT NULL,
      year_report     INTEGER NOT NULL,
      quarter         INTEGER NOT NULL,
      net_profit_bn   REAL,
      fetched_at      TEXT    NOT NULL,
      UNIQUE(code, year_report, quarter)
    );
  `);
  return db;
}

interface FinancialReportSeedRow {
  action_code: string;
  period_year: number;
  period_quarter: number | null;
  net_profit: number | null;
  operating_cf: number | null;
  operating_cash_flow: number | null;
  net_profit_api_bridge?: number | null;
}

function insertFinancialReport(
  db: InstanceType<typeof Database>,
  row: FinancialReportSeedRow,
): void {
  db.prepare(`
    INSERT INTO financial_reports
      (action_code, period_year, period_quarter,
       net_profit, operating_cf, operating_cash_flow, net_profit_api_bridge)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.action_code,
    row.period_year,
    row.period_quarter,
    row.net_profit,
    row.operating_cf,
    row.operating_cash_flow,
    row.net_profit_api_bridge ?? null,
  );
}

function insertVnstockFinancials(
  db: InstanceType<typeof Database>,
  code: string,
  yearReport: number,
  quarter: number,
  netProfitBn: number | null,
): void {
  db.prepare(`
    INSERT OR REPLACE INTO vnstock_financials
      (code, year_report, quarter, net_profit_bn, fetched_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run(code, yearReport, quarter, netProfitBn);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("1941d — net_profit API bridge for OCF/NI ratio", () => {
  // T1: bridgeNetProfitToFinancialReports writes correct triệu value from tỷ
  it("T1: bridge writes net_profit_api_bridge = net_profit_bn * 1000 triệu", () => {
    const db = makeTestDb();
    insertFinancialReport(db, {
      action_code: "FPT",
      period_year: 2025,
      period_quarter: 4,
      net_profit: 20225,          // wrong OCR value
      operating_cf: 4108450,
      operating_cash_flow: 4108450,
    });
    // vnstock: 2509.52 tỷ = 2,509,520 triệu
    insertVnstockFinancials(db, "FPT", 2025, 4, 2509.52);

    bridgeNetProfitToFinancialReports(db, "FPT");

    const row = db
      .prepare<{ net_profit_api_bridge: number | null }, []>(
        "SELECT net_profit_api_bridge FROM financial_reports WHERE action_code = 'FPT'",
      )
      .get();
    expect(row).not.toBeNull();
    // 2509.52 * 1000 = 2,509,520 triệu
    expect(row!.net_profit_api_bridge).toBeCloseTo(2_509_520, 0);
  });

  // T2: cashFlowTool prefers net_profit_api_bridge over OCR net_profit
  it("T2: cashFlowTool uses net_profit_api_bridge over OCR net_profit for ratio", async () => {
    const db = makeTestDb();
    // OCR net_profit=20225 (wrong), API bridge=2509520 (correct)
    // operating_cash_flow=4108450
    // Expected ratio = 4108450 / 2509520 ≈ 1.636
    insertFinancialReport(db, {
      action_code: "FPT",
      period_year: 2025,
      period_quarter: 4,
      net_profit: 20225,
      operating_cf: 10189002,
      operating_cash_flow: 4108450,
      net_profit_api_bridge: 2_509_520,
    });

    const handler = buildGetCashFlowHandler(db);
    const result = await handler({ ticker: "FPT", period: "Q4", year: 2025 });
    const envelope = JSON.parse(result.content[0].text);

    expect(envelope.found).toBe(true);
    // Ratio uses API bridge NI (2,509,520), NOT OCR NI (20,225)
    expect(envelope.ocf_ni_ratio).toBeCloseTo(4_108_450 / 2_509_520, 2);
    // Must NOT be the suppressed ratio from OCR NI
    expect(envelope.ocf_ni_suppressed).toBe(false);
    // ni_source field indicates which NI was used
    expect(envelope.ni_source).toBe("api_bridge");
  });

  // T3: FPT-realistic end-to-end — correct ratio after bridge
  it("T3: FPT-realistic — bridge NI=2,509,520; OCF=4,108,450 → ratio ≈ 1.636 passes guard", async () => {
    const db = makeTestDb();
    insertFinancialReport(db, {
      action_code: "FPT",
      period_year: 2025,
      period_quarter: 4,
      net_profit: 20225,             // OCR: revenue mistaken for NI
      operating_cf: 10189002,        // OCR: corrupted
      operating_cash_flow: 4108450,  // API bridge: correct OCF (Task 1941a)
      net_profit_api_bridge: 2_509_520, // API bridge: correct NI (Task 1941d)
    });

    const handler = buildGetCashFlowHandler(db);
    const result = await handler({ ticker: "FPT", period: "Q4", year: 2025 });
    const envelope = JSON.parse(result.content[0].text);

    expect(envelope.found).toBe(true);
    expect(envelope.ocf_ni_ratio).toBeCloseTo(4_108_450 / 2_509_520, 2);
    expect(envelope.ocf_ni_ratio_raw).toBeCloseTo(4_108_450 / 2_509_520, 2);
    expect(envelope.ocf_ni_suppressed).toBe(false);
    expect(envelope.ocf_source).toBe("api_bridge");
    expect(envelope.ni_source).toBe("api_bridge");
  });

  // T4: NULL api_bridge → fallback to OCR net_profit
  it("T4: NULL net_profit_api_bridge falls back to OCR net_profit for ratio", async () => {
    const db = makeTestDb();
    insertFinancialReport(db, {
      action_code: "VNM",
      period_year: 2025,
      period_quarter: 4,
      net_profit: 4000000,    // plausible OCR value
      operating_cf: 5000000,
      operating_cash_flow: null,
      net_profit_api_bridge: null,   // no bridge
    });

    const handler = buildGetCashFlowHandler(db);
    const result = await handler({ ticker: "VNM", period: "Q4", year: 2025 });
    const envelope = JSON.parse(result.content[0].text);

    expect(envelope.found).toBe(true);
    // Falls back to OCR NI (4,000,000)
    // OCF also OCR (5,000,000), ratio = 1.25
    expect(envelope.ocf_ni_ratio).toBeCloseTo(1.25, 4);
    expect(envelope.ocf_ni_suppressed).toBe(false);
    expect(envelope.ni_source).toBe("ocr");
  });

  // T5: backfillAllNetProfit covers all distinct tickers
  it("T5: backfillAllNetProfit bridges all tickers in vnstock_financials", () => {
    const db = makeTestDb();
    // Insert two tickers
    insertFinancialReport(db, {
      action_code: "VCB",
      period_year: 2025,
      period_quarter: 4,
      net_profit: 100,
      operating_cf: 200,
      operating_cash_flow: null,
    });
    insertFinancialReport(db, {
      action_code: "HPG",
      period_year: 2025,
      period_quarter: 4,
      net_profit: 50,
      operating_cf: 100,
      operating_cash_flow: null,
    });
    insertVnstockFinancials(db, "VCB", 2025, 4, 10.5);  // 10.5 tỷ = 10,500 triệu
    insertVnstockFinancials(db, "HPG", 2025, 4, 5.0);   // 5.0 tỷ = 5,000 triệu

    backfillAllNetProfit(db);

    const vcbRow = db
      .prepare<{ net_profit_api_bridge: number | null }, []>(
        "SELECT net_profit_api_bridge FROM financial_reports WHERE action_code = 'VCB'",
      )
      .get();
    const hpgRow = db
      .prepare<{ net_profit_api_bridge: number | null }, []>(
        "SELECT net_profit_api_bridge FROM financial_reports WHERE action_code = 'HPG'",
      )
      .get();

    expect(vcbRow!.net_profit_api_bridge).toBeCloseTo(10_500, 0);
    expect(hpgRow!.net_profit_api_bridge).toBeCloseTo(5_000, 0);
  });

  // T6: API bridge NI=0 → ratio null (guard), not division by zero
  it("T6: api_bridge NI=0 → ocf_ni_ratio=null (zero-divide guard)", async () => {
    const db = makeTestDb();
    insertFinancialReport(db, {
      action_code: "ZRO",
      period_year: 2025,
      period_quarter: 1,
      net_profit: 10000,     // OCR has a value
      operating_cf: 5000,
      operating_cash_flow: 5000,
      net_profit_api_bridge: 0, // API bridge says NI=0 (e.g. break-even year)
    });

    const handler = buildGetCashFlowHandler(db);
    const result = await handler({ ticker: "ZRO", period: "Q1", year: 2025 });
    const envelope = JSON.parse(result.content[0].text);

    expect(envelope.found).toBe(true);
    // Zero NI → ratio must be null (not Infinity or NaN)
    expect(envelope.ocf_ni_ratio).toBeNull();
    expect(envelope.ocf_ni_ratio_raw).toBeNull();
    expect(envelope.ni_source).toBe("api_bridge");
  });

  // T7: ni_source field: "api_bridge" vs "ocr"
  it("T7: ni_source='api_bridge' when net_profit_api_bridge non-null, 'ocr' otherwise", async () => {
    const db = makeTestDb();

    // Ticker A: has api bridge
    insertFinancialReport(db, {
      action_code: "AAA",
      period_year: 2025,
      period_quarter: 1,
      net_profit: 1000,
      operating_cf: 1500,
      operating_cash_flow: 1500,
      net_profit_api_bridge: 1200,
    });
    // Ticker B: no api bridge
    insertFinancialReport(db, {
      action_code: "BBB",
      period_year: 2025,
      period_quarter: 1,
      net_profit: 800,
      operating_cf: 900,
      operating_cash_flow: null,
      net_profit_api_bridge: null,
    });

    const handlerA = buildGetCashFlowHandler(db);
    const resA = await handlerA({ ticker: "AAA", period: "Q1", year: 2025 });
    const envA = JSON.parse(resA.content[0].text);
    expect(envA.ni_source).toBe("api_bridge");

    const handlerB = buildGetCashFlowHandler(db);
    const resB = await handlerB({ ticker: "BBB", period: "Q1", year: 2025 });
    const envB = JSON.parse(resB.content[0].text);
    expect(envB.ni_source).toBe("ocr");
  });
});
