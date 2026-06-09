/**
 * FIX-C — get_bctc_series MCP tool tests
 *
 * Coverage:
 *   1. DONE-only guard: a non-DONE period is excluded from results
 *   2. Sparse-history honesty: only existing periods returned (no padding/fabrication)
 *   3. Structured array shape: each item has sort_key + period fields + requested fields
 *   4. Null values for null DB fields are returned as null (honest-absent)
 *   5. Empty result when no DONE periods exist
 *   6. Respects `periods` limit
 *   7. MCP tool returns structured JSON text
 *   8. All allowed fields work
 *   9. CROSS-TOOL CONSISTENCY: get_bctc_series recomputed roe equals get_bctc_full
 *      structured_data roe for the same ticker/period (same scale, within float tolerance)
 *
 * FIX-C CONSISTENCY FIX: roe and debt_to_equity are now RECOMPUTED from base scalars
 * using the shared recomputeRatios() helper (bctcRatioRecompute.ts — SSOT).
 * The persisted DB columns are stale-cache and are NOT served directly.
 * Tests that check roe/debt_to_equity must control the base scalars (net_profit,
 * equity_total, short_term_debt, long_term_debt, total_liabilities) to produce
 * known recomputed values.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerBctcSeriesTools, buildSeriesData } from "../interface/mcp/tools/financial-reports/bctcSeriesTools.js";
import { registerBctcFullTools } from "../interface/mcp/tools/financial-reports/bctcFullTools.js";

// ─────────────────────────────────────────────────────────────────────────────
// DB helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  db.run(`CREATE TABLE IF NOT EXISTS financial_reports (
    id TEXT PRIMARY KEY,
    action_code TEXT NOT NULL,
    company_name TEXT,
    period_year INTEGER NOT NULL,
    period_quarter INTEGER,
    period_type TEXT NOT NULL,
    sort_key TEXT NOT NULL,
    audit_status TEXT NOT NULL DEFAULT 'unaudited',
    extraction_confidence REAL NOT NULL DEFAULT 0.85,
    net_revenue REAL NOT NULL DEFAULT 0,
    gross_profit REAL NOT NULL DEFAULT 0,
    operating_profit REAL NOT NULL DEFAULT 0,
    ebitda REAL NOT NULL DEFAULT 0,
    profit_before_tax REAL NOT NULL DEFAULT 0,
    net_profit REAL NOT NULL DEFAULT 0,
    eps REAL NOT NULL DEFAULT 0,
    diluted_eps REAL NOT NULL DEFAULT 0,
    total_assets REAL NOT NULL DEFAULT 0,
    current_assets REAL NOT NULL DEFAULT 0,
    cash REAL NOT NULL DEFAULT 0,
    inventory REAL NOT NULL DEFAULT 0,
    total_liabilities REAL NOT NULL DEFAULT 0,
    short_term_debt REAL NOT NULL DEFAULT 0,
    long_term_debt REAL NOT NULL DEFAULT 0,
    equity_total REAL NOT NULL DEFAULT 0,
    operating_cf REAL NOT NULL DEFAULT 0,
    investing_cf REAL NOT NULL DEFAULT 0,
    financing_cf REAL NOT NULL DEFAULT 0,
    capex REAL NOT NULL DEFAULT 0,
    free_cash_flow REAL NOT NULL DEFAULT 0,
    gross_margin_pct REAL,
    operating_margin_pct REAL,
    net_margin_pct REAL,
    roe REAL,
    roa REAL,
    current_ratio REAL,
    debt_to_equity REAL,
    net_debt_to_ebitda REAL,
    pe REAL,
    pb REAL,
    published_at TEXT NOT NULL DEFAULT '',
    yoy_delta_json TEXT,
    qoq_delta_json TEXT,
    refine_status TEXT NOT NULL DEFAULT 'DONE',
    period_basis TEXT,
    balance_sheet_json TEXT,
    report_scope TEXT
  )`);
  // Tables required by get_bctc_full (publishability guards PUB-2/3/4)
  db.run(`CREATE TABLE IF NOT EXISTS bctc_table_rows (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    report_id TEXT NOT NULL,
    code TEXT,
    statement_section TEXT NOT NULL DEFAULT 'general',
    is_summary_row INTEGER NOT NULL DEFAULT 0,
    value_current REAL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS bctc_refined_units (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    report_id TEXT NOT NULL,
    window_status TEXT NOT NULL DEFAULT 'ACCEPTED'
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS rag_analyses (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    affected_actions TEXT,
    sentiment TEXT,
    created_at TEXT NOT NULL DEFAULT '',
    data_env TEXT
,
    source_url TEXT UNIQUE)`);
  db.run(`CREATE TABLE IF NOT EXISTS vnstock_balance_sheet (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    code TEXT NOT NULL,
    year_report INTEGER NOT NULL,
    quarter INTEGER NOT NULL DEFAULT 0,
    receivables_bn REAL,
    fetched_at TEXT NOT NULL DEFAULT ''
  )`);
  return db;
}

interface InsertReportOpts {
  code: string;
  sort_key: string;
  period_year: number;
  period_quarter?: number | null;
  period_type: string;
  refine_status?: string;
  net_profit?: number;
  net_revenue?: number;
  eps?: number;
  total_assets?: number;
  equity_total?: number;
  operating_cf?: number;
  // Derived ratio columns — written to DB but overridden by recompute-on-read.
  // Set these only for tests that need to verify the persisted columns are IGNORED.
  roe?: number | null;
  pe?: number | null;
  pb?: number | null;
  debt_to_equity?: number | null;
  // Scalar columns needed by recomputeRatios() — control these to get a specific
  // recomputed roe/debt_to_equity value.
  short_term_debt?: number;
  long_term_debt?: number;
  cash?: number;
  ebitda?: number;
  current_assets?: number;
  total_liabilities?: number;
  gross_profit?: number;
  operating_profit?: number;
  balance_sheet_json?: string | null;
  extraction_confidence?: number;
  company_name?: string | null;
  report_scope?: string | null;
}

function insertReport(db: Database, opts: InsertReportOpts): string {
  const {
    code, sort_key, period_year, period_quarter = null, period_type,
    refine_status = "DONE",
    net_profit = 1_000_000,
    net_revenue = 5_000_000,
    eps = 1000,
    total_assets = 20_000_000,
    equity_total = 8_000_000,
    operating_cf = 800_000,
    roe = null,   // NOTE: persisted roe is ignored — recomputed from net_profit/equity_total
    pe = 10.0,
    pb = 1.5,
    debt_to_equity = null, // NOTE: persisted d/e is ignored — recomputed
    short_term_debt = 0,
    long_term_debt = 0,
    cash = 0,
    ebitda = 0,
    current_assets = 0,
    total_liabilities = 0,
    gross_profit = 0,
    operating_profit = 0,
    balance_sheet_json = null,
    extraction_confidence = 0.85,
    company_name = null,
    report_scope = "consolidated",
  } = opts;

  const id = `test-${Math.random().toString(36).slice(2)}`;
  db.prepare(`INSERT INTO financial_reports (
      id, action_code, period_year, period_quarter, period_type, sort_key,
      net_profit, net_revenue, eps, total_assets, equity_total, operating_cf,
      roe, pe, pb, debt_to_equity, refine_status,
      short_term_debt, long_term_debt, cash, ebitda,
      current_assets, total_liabilities, gross_profit, operating_profit,
      balance_sheet_json, extraction_confidence, company_name, report_scope,
      published_at
    ) VALUES (
      ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      datetime('now')
    )`).run(
    id,
    code, period_year, period_quarter, period_type, sort_key,
    net_profit, net_revenue, eps, total_assets, equity_total, operating_cf,
    roe, pe, pb, debt_to_equity, refine_status,
    short_term_debt, long_term_debt, cash, ebitda,
    current_assets, total_liabilities, gross_profit, operating_profit,
    balance_sheet_json, extraction_confidence, company_name, report_scope,
  );
  return id;
}

/**
 * Insert a bctc_table_rows row so PUB-2 and PUB-3 pass for get_bctc_full.
 * PUB-2 needs ≥1 row with value_current IS NOT NULL.
 * PUB-3 needs ≥1 non-summary balance-sheet row (is_summary_row=0, code 100-440).
 */
function insertBctcTableRow(db: Database, reportId: string): void {
  db.prepare(`INSERT INTO bctc_table_rows (report_id, code, statement_section, is_summary_row, value_current)
    VALUES (?, '110', 'balance_sheet', 0, 1000000)`).run(reportId);
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP call helper (mirrors pattern from 240-bctc-full.test.ts)
// ─────────────────────────────────────────────────────────────────────────────

type ToolResult = { content: Array<{ type: string; text: string }> };

async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const tools = (server as unknown as {
    _registeredTools: Record<string, {
      callback?: (args: Record<string, unknown>) => Promise<ToolResult>;
      handler?: (args: Record<string, unknown>) => Promise<ToolResult>;
    }>;
  })._registeredTools;
  const tool = tools[toolName];
  if (!tool) throw new Error(`Tool not registered: ${toolName}`);
  const fn = tool.callback ?? tool.handler;
  if (!fn) throw new Error(`No callable for tool: ${toolName}`);
  return fn(args);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-C — get_bctc_series tool", () => {
  let db: Database;
  let server: McpServer;

  beforeEach(() => {
    db = makeDb();
    server = new McpServer({ name: "test", version: "0.0.0" }, { capabilities: { tools: {} } });
    registerBctcSeriesTools(server, db);
    // Also register bctcFull so the consistency test (T9) can call both tools
    registerBctcFullTools(server, db);
  });

  afterEach(() => {
    db.close();
  });

  // ── Test 1: DONE-only guard ────────────────────────────────────────────────
  it("excludes non-DONE periods from results (PUB-1 DONE gate)", () => {
    // Insert one DONE period and one PENDING period
    insertReport(db, {
      code: "VCB", sort_key: "2025-Q4", period_year: 2025, period_type: "Q4",
      refine_status: "DONE", net_profit: 8_100_000,
    });
    insertReport(db, {
      code: "VCB", sort_key: "2025-Q3", period_year: 2025, period_quarter: 3, period_type: "Q3",
      refine_status: "PENDING", net_profit: 7_500_000,
    });
    insertReport(db, {
      code: "VCB", sort_key: "2025-Q2", period_year: 2025, period_quarter: 2, period_type: "Q2",
      refine_status: "PARTIAL", net_profit: 7_000_000,
    });

    // buildSeriesData: DONE gate should exclude PENDING and PARTIAL
    const result = buildSeriesData(db, "VCB", ["net_profit"], 10);

    // Only the DONE period (Q4) should appear
    expect(result).toHaveLength(1);
    expect(result[0]!.sort_key).toBe("2025-Q4");
    expect(result[0]!.net_profit).toBe(8_100_000);
  });

  // ── Test 2: Sparse-history honesty ────────────────────────────────────────
  it("returns only existing periods without padding or fabrication", () => {
    // Insert 2 non-consecutive DONE periods (skip Q3)
    insertReport(db, { code: "FPT", sort_key: "2025-Q4", period_year: 2025, period_type: "Q4" });
    insertReport(db, { code: "FPT", sort_key: "2025-Q2", period_year: 2025, period_type: "Q2" });
    // Q3 intentionally absent

    const result = buildSeriesData(db, "FPT", ["net_profit", "eps"], 10);

    // Only 2 real periods returned (Q4 then Q2, no Q3 phantom)
    expect(result).toHaveLength(2);
    expect(result[0]!.sort_key).toBe("2025-Q4");
    expect(result[1]!.sort_key).toBe("2025-Q2");
  });

  // ── Test 3: Structured array shape ────────────────────────────────────────
  // FIX-C: roe is now RECOMPUTED from net_profit / equity_total × 100.
  // The persisted roe column in the DB is ignored. The test controls base scalars
  // to produce a known recomputed value: 1_200_000 / 8_000_000 × 100 = 15.0%.
  it("returns objects with period identifiers + requested fields (correct shape)", () => {
    insertReport(db, {
      code: "VNM", sort_key: "2025-Q1", period_year: 2025, period_quarter: 1, period_type: "Q1",
      net_profit: 1_200_000,
      equity_total: 8_000_000,   // recomputed roe = 1_200_000/8_000_000*100 = 15.0%
      pe: 15.2,
    });

    const result = buildSeriesData(db, "VNM", ["net_profit", "roe", "pe"], 4);

    expect(result).toHaveLength(1);
    const point = result[0]!;

    // Period identifiers always present
    expect(typeof point.sort_key).toBe("string");
    expect(typeof point.period_year).toBe("number");
    expect(point.period_type).toBe("Q1");

    // Requested fields present with correct RECOMPUTED values
    expect(point.net_profit).toBe(1_200_000);
    // roe recomputed: 1_200_000 / 8_000_000 * 100 = 15.0 (percent scale)
    expect(typeof point.roe).toBe("number");
    expect(point.roe as number).toBeCloseTo(15.0, 5);
    expect(point.pe).toBe(15.2);

    // Non-requested fields absent
    expect("eps" in point).toBe(false);
    expect("total_assets" in point).toBe(false);
  });

  // ── Test 4: Recomputed roe = null when equity_total = 0 (honest-null) ─────
  // FIX-C: with equity_total=0 the recompute guard returns null (no division by zero).
  // The persisted roe column is ignored regardless of what was stored.
  it("recomputed roe is null when equity_total=0 (honest-null, no fabrication)", () => {
    insertReport(db, {
      code: "HPG", sort_key: "2025-Q4", period_year: 2025, period_type: "Q4",
      net_profit: 1_000_000,
      equity_total: 0,   // triggers null guard
      pe: null,
      // short_term_debt=0, long_term_debt=0 → debtSum=0; total_liabilities=0 → debt_to_equity null
      total_liabilities: 0,
    });

    const result = buildSeriesData(db, "HPG", ["roe", "pe", "debt_to_equity"], 4);

    expect(result).toHaveLength(1);
    expect(result[0]!.roe).toBeNull();      // equity=0 → null (guard fired)
    expect(result[0]!.pe).toBeNull();       // pe persisted as null → null
    expect(result[0]!.debt_to_equity).toBeNull(); // debtSum=0, total_liab=0 → null
  });

  // ── Test 5: Empty result when no DONE periods ─────────────────────────────
  it("returns empty data array when no DONE-refined periods exist", async () => {
    insertReport(db, {
      code: "ACB", sort_key: "2025-Q4", period_year: 2025, period_type: "Q4",
      refine_status: "PENDING",
    });

    const result = await callTool(server, "get_bctc_series", {
      code: "ACB",
      fields: ["net_profit"],
      periods: 4,
    });

    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.data).toHaveLength(0);
    expect(parsed.note).toBeDefined();
  });

  // ── Test 6: `periods` limit is respected ──────────────────────────────────
  it("respects the periods limit parameter", () => {
    // Insert 6 DONE periods
    for (let q = 1; q <= 6; q++) {
      const year = q <= 4 ? 2025 : 2024;
      const quarter = q <= 4 ? q : q - 4;
      insertReport(db, {
        code: "MWG",
        sort_key: `${year}-Q${quarter}`,
        period_year: year,
        period_quarter: quarter,
        period_type: `Q${quarter}`,
      });
    }

    const result = buildSeriesData(db, "MWG", ["net_profit"], 3);

    // Only 3 most recent periods returned
    expect(result).toHaveLength(3);
  });

  // ── Test 7: MCP tool returns structured JSON text ─────────────────────────
  it("tool returns valid JSON with code, fields, periods_returned, data", async () => {
    insertReport(db, {
      code: "VCB", sort_key: "2025-Q4", period_year: 2025, period_type: "Q4",
      net_profit: 8_100_000, eps: 4200,
    });

    const result = await callTool(server, "get_bctc_series", {
      code: "vcb",  // lowercase — should uppercase
      fields: ["net_profit", "eps"],
      periods: 4,
    });

    expect(result.content).toHaveLength(1);
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.code).toBe("VCB");
    expect(parsed.fields).toContain("net_profit");
    expect(parsed.fields).toContain("eps");
    expect(typeof parsed.periods_returned).toBe("number");
    expect(Array.isArray(parsed.data)).toBe(true);
    expect(parsed.data[0].net_profit).toBe(8_100_000);
    expect(parsed.data[0].eps).toBe(4200);
  });

  // ── Test 8: All allowed fields work ───────────────────────────────────────
  // FIX-C: roe and debt_to_equity are now recomputed from base scalars.
  // Controls: net_profit=500_000, equity_total=4_000_000 → roe=12.5%
  //           short_term_debt=600_000, long_term_debt=400_000, equity_total=4_000_000
  //           → debtSum=1_000_000, total_liabilities=5_000_000 (≥0.1% threshold)
  //           → debt_to_equity = 1_000_000 / 4_000_000 = 0.25
  it("all allowed fields are returned when requested (recomputed ratios)", () => {
    insertReport(db, {
      code: "DHG", sort_key: "2025-Q2", period_year: 2025, period_quarter: 2, period_type: "Q2",
      net_profit: 500_000, net_revenue: 3_000_000, eps: 800,
      total_assets: 10_000_000, equity_total: 4_000_000, operating_cf: 600_000,
      pe: 12.0, pb: 1.8,
      // Debt scalars for debt_to_equity recompute: sum=1_000_000 / equity=4_000_000 = 0.25
      short_term_debt: 600_000, long_term_debt: 400_000, total_liabilities: 5_000_000,
    });

    const result = buildSeriesData(db, "DHG", [
      "pe", "pb", "roe", "debt_to_equity", "operating_cf",
      "net_profit", "eps", "total_assets", "net_revenue", "equity_total",
    ], 1);

    expect(result).toHaveLength(1);
    const pt = result[0]!;
    expect(pt.pe).toBe(12.0);
    expect(pt.pb).toBe(1.8);
    // roe recomputed: 500_000 / 4_000_000 * 100 = 12.5%
    expect(typeof pt.roe).toBe("number");
    expect(pt.roe as number).toBeCloseTo(12.5, 5);
    // debt_to_equity recomputed: 1_000_000 / 4_000_000 = 0.25
    expect(typeof pt.debt_to_equity).toBe("number");
    expect(pt.debt_to_equity as number).toBeCloseTo(0.25, 5);
    expect(pt.operating_cf).toBe(600_000);
    expect(pt.net_profit).toBe(500_000);
    expect(pt.eps).toBe(800);
    expect(pt.total_assets).toBe(10_000_000);
    expect(pt.net_revenue).toBe(3_000_000);
    expect(pt.equity_total).toBe(4_000_000);
  });

  // ── Test 9: CROSS-TOOL CONSISTENCY ────────────────────────────────────────
  // Regression guard: get_bctc_series recomputed roe MUST equal get_bctc_full
  // structured_data roe for the same ticker/period (same scale, within float tolerance).
  //
  // This test proves that the shared recomputeRatios() helper (bctcRatioRecompute.ts)
  // is used by BOTH tools — any future drift will break this test immediately.
  //
  // Fixture: net_profit=2_476_789, equity_total=40_146_000 (mirrors FPT 2026-Q1 observed values)
  // Expected recomputed roe = 2_476_789 / 40_146_000 * 100 ≈ 6.169%
  //
  // Also checks debt_to_equity consistency.
  it("T9 cross-tool consistency: get_bctc_series roe equals get_bctc_full structured_data roe", async () => {
    const NET_PROFIT = 2_476_789;
    const EQUITY_TOTAL = 40_146_000;
    // short_term_debt + long_term_debt = 5_000_000 > 0.1% of total_liab=20_000_000 → decomp present
    const SHORT_TERM_DEBT = 3_000_000;
    const LONG_TERM_DEBT = 2_000_000;
    const TOTAL_LIABILITIES = 20_000_000;

    // Expected recomputed values (same formula for both tools via SSOT helper)
    const EXPECTED_ROE = (NET_PROFIT / EQUITY_TOTAL) * 100;  // ≈ 6.169%
    const EXPECTED_DE = (SHORT_TERM_DEBT + LONG_TERM_DEBT) / EQUITY_TOTAL; // 5_000_000/40_146_000 ≈ 0.1245

    const reportId = insertReport(db, {
      code: "FPT",
      sort_key: "2026-Q1",
      period_year: 2026,
      period_quarter: 1,
      period_type: "Q1",
      refine_status: "DONE",
      net_profit: NET_PROFIT,
      net_revenue: 12_479_997,
      gross_profit: 3_500_000,
      operating_profit: 2_747_763,
      eps: 1000,
      total_assets: 80_000_000,
      equity_total: EQUITY_TOTAL,
      total_liabilities: TOTAL_LIABILITIES,
      short_term_debt: SHORT_TERM_DEBT,
      long_term_debt: LONG_TERM_DEBT,
      cash: 5_000_000,
      ebitda: 3_000_000,
      current_assets: 30_000_000,
      operating_cf: 1_500_000,
      extraction_confidence: 0.85,
      company_name: "FPT Corporation",
      report_scope: "consolidated",
    });

    // Insert bctc_table_rows so PUB-2 and PUB-3 pass for get_bctc_full
    insertBctcTableRow(db, reportId);

    // ── get_bctc_series ──
    const seriesResult = buildSeriesData(db, "FPT", ["roe", "debt_to_equity"], 4);
    expect(seriesResult).toHaveLength(1);
    const seriesRoe = seriesResult[0]!.roe as number;
    const seriesDe = seriesResult[0]!.debt_to_equity as number;

    // ── get_bctc_full ──
    const fullResult = await callTool(server, "get_bctc_full", {
      code: "FPT",
      year: 2026,
      quarter: "Q1",
    });

    // get_bctc_full returns content[1] as the JSON structured block (FIX-D)
    expect(fullResult.content.length).toBeGreaterThanOrEqual(2);
    const fullJson = JSON.parse(fullResult.content[1]!.text) as {
      structured_data: { roe: number | null; debt_to_equity: number | null };
    };
    const fullRoe = fullJson.structured_data.roe;
    const fullDe = fullJson.structured_data.debt_to_equity;

    // CONSISTENCY ASSERTIONS:
    // Both tools must agree on the same recomputed value (same SSOT helper, same formula)
    expect(typeof seriesRoe).toBe("number");
    expect(typeof fullRoe).toBe("number");
    expect(seriesRoe).toBeCloseTo(EXPECTED_ROE, 4);
    expect(fullRoe as number).toBeCloseTo(EXPECTED_ROE, 4);
    // Cross-tool: they must be equal within float tolerance
    expect(seriesRoe).toBeCloseTo(fullRoe as number, 8);

    // debt_to_equity consistency
    expect(typeof seriesDe).toBe("number");
    expect(typeof fullDe).toBe("number");
    expect(seriesDe).toBeCloseTo(EXPECTED_DE, 4);
    expect(fullDe as number).toBeCloseTo(EXPECTED_DE, 4);
    expect(seriesDe).toBeCloseTo(fullDe as number, 8);
  });
});
