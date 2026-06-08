/**
 * Task 240 — get_bctc_full compound MCP tool tests
 *
 * Tests use an in-memory SQLite database (injected via _testDb) to avoid
 * any real filesystem or network access.
 *
 * Coverage:
 *   1. Returns all 3 sections when financial + sentiment data exist
 *   2. Returns graceful "no BCTC data" message when no financial rows exist
 *   3. Renders SENTIMENT TREND section with "no data" note when no RAG rows exist
 *   4. Code parameter is required (Zod validation)
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Database } from "bun:sqlite";
import { registerBctcFullTools } from "../interface/mcp/tools/financial-reports/bctcFullTools.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─── helpers ────────────────────────────────────────────────────────────────

function makeServer(db: Database): McpServer {
  const server = new McpServer(
    { name: "test", version: "0.0.0" },
    { capabilities: { tools: {} } },
  );
  registerBctcFullTools(server, db);
  return server;
}

/** Minimal financial_reports row — all required columns filled. Returns the report ID. */
function insertFinancialRow(
  db: Database,
  overrides: Partial<{
    action_code: string;
    period_year: number;
    period_quarter: number | null;
    period_type: string;
    sort_key: string;
    net_revenue: number;
    gross_profit: number;
    operating_profit: number;
    ebitda: number;
    profit_before_tax: number;
    net_profit: number;
    eps: number;
    diluted_eps: number;
    total_assets: number;
    current_assets: number;
    cash: number;
    inventory: number;
    total_liabilities: number;
    short_term_debt: number;
    long_term_debt: number;
    equity_total: number;
    operating_cf: number;
    investing_cf: number;
    financing_cf: number;
    capex: number;
    free_cash_flow: number;
    gross_margin_pct: number | null;
    operating_margin_pct: number | null;
    net_margin_pct: number | null;
    roe: number | null;
    roa: number | null;
    current_ratio: number | null;
    debt_to_equity: number | null;
    net_debt_to_ebitda: number | null;
    pe: number | null;
    pb: number | null;
    audit_status: string;
    extraction_confidence: number;
    company_name: string | null;
    published_at: string;
    yoy_delta_json: string | null;
    qoq_delta_json: string | null;
  }> = {},
): string {
  const defaults = {
    action_code: "VCB",
    period_year: 2025,
    period_quarter: 4,
    period_type: "Q4",
    sort_key: "2025-Q4",
    net_revenue: 45_200_000,
    gross_profit: 20_000_000,
    operating_profit: 12_000_000,
    ebitda: 14_000_000,
    profit_before_tax: 11_500_000,
    net_profit: 8_100_000,
    eps: 4200,
    diluted_eps: 4100,
    total_assets: 1_800_000_000,
    current_assets: 400_000_000,
    cash: 80_000_000,
    inventory: 5_000_000,
    total_liabilities: 1_620_000_000,
    short_term_debt: 200_000_000,
    long_term_debt: 900_000_000,
    equity_total: 180_000_000,
    operating_cf: 10_000_000,
    investing_cf: -3_000_000,
    financing_cf: -2_000_000,
    capex: 1_500_000,
    free_cash_flow: 8_500_000,
    gross_margin_pct: 44.2,
    operating_margin_pct: 26.5,
    net_margin_pct: 17.9,
    roe: 22.1,
    roa: 1.8,
    current_ratio: 1.1,
    debt_to_equity: 8.2,
    net_debt_to_ebitda: 72.1,
    pe: 12.5,
    pb: 2.3,
    audit_status: "reviewed",
    extraction_confidence: 0.92,
    company_name: "Vietcombank",
    published_at: "2026-01-30",
    yoy_delta_json: null,
    qoq_delta_json: null,
    ...overrides,
  };

  db.prepare(`INSERT INTO financial_reports (
      id, action_code, company_name, period_year, period_quarter, period_type, sort_key,
      audit_status, extraction_confidence,
      net_revenue, gross_profit, operating_profit, ebitda, profit_before_tax, net_profit,
      eps, diluted_eps,
      total_assets, current_assets, cash, inventory,
      total_liabilities, short_term_debt, long_term_debt, equity_total,
      operating_cf, investing_cf, financing_cf, capex, free_cash_flow,
      gross_margin_pct, operating_margin_pct, net_margin_pct,
      roe, roa, current_ratio, debt_to_equity, net_debt_to_ebitda, pe, pb,
      published_at, yoy_delta_json, qoq_delta_json
    ) VALUES (
      lower(hex(randomblob(8))),
      ?, ?, ?, ?, ?, ?,
      ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?
    )`).run(
    defaults.action_code,
    defaults.company_name,
    defaults.period_year,
    defaults.period_quarter,
    defaults.period_type,
    defaults.sort_key,
    defaults.audit_status,
    defaults.extraction_confidence,
    defaults.net_revenue,
    defaults.gross_profit,
    defaults.operating_profit,
    defaults.ebitda,
    defaults.profit_before_tax,
    defaults.net_profit,
    defaults.eps,
    defaults.diluted_eps,
    defaults.total_assets,
    defaults.current_assets,
    defaults.cash,
    defaults.inventory,
    defaults.total_liabilities,
    defaults.short_term_debt,
    defaults.long_term_debt,
    defaults.equity_total,
    defaults.operating_cf,
    defaults.investing_cf,
    defaults.financing_cf,
    defaults.capex,
    defaults.free_cash_flow,
    defaults.gross_margin_pct,
    defaults.operating_margin_pct,
    defaults.net_margin_pct,
    defaults.roe,
    defaults.roa,
    defaults.current_ratio,
    defaults.debt_to_equity,
    defaults.net_debt_to_ebitda,
    defaults.pe,
    defaults.pb,
    defaults.published_at,
    defaults.yoy_delta_json,
    defaults.qoq_delta_json,
  );

  // Return the inserted ID for use in related table inserts
  const result = db.query<{ id: string }, [string, string]>("SELECT id FROM financial_reports WHERE action_code = ? AND sort_key = ? LIMIT 1").get(defaults.action_code, defaults.sort_key);
  return result?.id ?? '';
}

/** Insert a rag_analyses row with the given sentiment for today. */
function insertRagRow(
  db: Database,
  stockCode: string,
  sentiment: "bullish" | "bearish" | "neutral",
  daysAgo = 0,
): void {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const createdAt = d.toISOString().slice(0, 10);

  db.prepare(`INSERT INTO rag_analyses (id, action_level, action_code, affected_actions, headline,
      body, source, published_at, created_at, embedding_vector, sentiment, confidence, causal_chain)
    VALUES (
      lower(hex(randomblob(8))), 'action', ?, ?,
      'test headline', 'body text', 'test', ?, ?, '', ?, 0.8, ''
    )`).run(
    stockCode,
    JSON.stringify([stockCode]),
    createdAt,
    createdAt,
    sentiment,
  );
}

/** Insert a bctc_table_rows row for testing publishability.
 * BANK-DEV-2: code='270' (3-digit corporate code) so isBankFormFromDb returns
 * false (corporate), preserving the original corporate-path PUB-3 logic. */
function insertTableRow(
  db: Database,
  reportId: string,
  section: string = "balance_sheet",
  isSummary: number = 0,
): void {
  db.prepare(`INSERT INTO bctc_table_rows
       (report_id, page_number, statement_section, row_order, code, label,
        period_current, value_current, is_summary_row)
     VALUES (?, 1, ?, 1, '270', 'Test Label', 'Q1-2026', 100000, ?)`).run(
    reportId,
    section,
    isSummary,
  );
}

/** Insert a bctc_refined_units row for testing publishability. */
function insertRefinedUnit(
  db: Database,
  reportId: string,
  windowStatus: string = "DONE",
): void {
  db.prepare(`INSERT INTO bctc_refined_units
       (report_id, unit_id, page_numbers_json, markdown, row_count, confidence, window_status)
     VALUES (?, ?, '[1]', '| test |', 5, 0.85, ?)`).run(
    reportId,
    `unit-${reportId.slice(0, 8)}`,
    windowStatus,
  );
}

/** Create a minimal in-memory SQLite with the tables our tool needs. */
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
    extraction_confidence REAL NOT NULL DEFAULT 0.5,
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
    refine_status TEXT DEFAULT 'DONE',
    period_basis TEXT,
    balance_sheet_json TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS bctc_table_rows (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id        TEXT    NOT NULL,
    page_number      INTEGER NOT NULL,
    statement_section TEXT   NOT NULL,
    row_order        INTEGER NOT NULL,
    code             TEXT,
    label            TEXT    NOT NULL,
    period_current   TEXT    NOT NULL,
    value_current    REAL,
    period_prior     TEXT,
    value_prior      REAL,
    unit             TEXT    NOT NULL DEFAULT 'billion_vnd',
    is_summary_row   INTEGER NOT NULL DEFAULT 0,
    extracted_at     TEXT    NOT NULL DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS bctc_refined_units (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id         TEXT    NOT NULL,
    unit_id           TEXT    NOT NULL,
    page_numbers_json TEXT    NOT NULL,
    markdown          TEXT    NOT NULL,
    row_count         INTEGER NOT NULL DEFAULT 0,
    confidence        REAL    NOT NULL DEFAULT 0.0,
    flags             TEXT,
    window_status     TEXT    NOT NULL DEFAULT 'DONE',
    refined_at        TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(report_id, unit_id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS rag_analyses (
    id TEXT PRIMARY KEY,
    action_level TEXT NOT NULL,
    action_code TEXT NOT NULL,
    affected_actions TEXT NOT NULL DEFAULT '[]',
    headline TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT '',
    published_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT '',
    embedding_vector TEXT NOT NULL DEFAULT '',
    sentiment TEXT,
    confidence REAL,
    causal_chain TEXT
  )`);

  // FIX-D: vnstock_balance_sheet needed for receivables query
  db.run(`CREATE TABLE IF NOT EXISTS vnstock_balance_sheet (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL,
    year_report INTEGER NOT NULL,
    quarter INTEGER NOT NULL,
    total_assets_bn REAL,
    total_liabilities_bn REAL,
    total_equity_bn REAL,
    cash_bn REAL,
    short_term_debt_bn REAL,
    long_term_debt_bn REAL,
    receivables_bn REAL,
    inventory_bn REAL,
    source TEXT NOT NULL DEFAULT 'vnstock',
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(code, year_report, quarter, source)
  )`);

  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

// ─── call helpers ────────────────────────────────────────────────────────────

type ToolResult = { content: Array<{ type: string; text: string }> };

function getRegisteredToolFn(
  server: McpServer,
  name: string,
): (args: Record<string, unknown>) => Promise<ToolResult> {
  const tools = (server as unknown as {
    _registeredTools: Record<string, {
      callback?: (args: Record<string, unknown>) => Promise<ToolResult>;
      handler?: (args: Record<string, unknown>) => Promise<ToolResult>;
    }>;
  })._registeredTools;
  const tool = tools[name];
  if (!tool) throw new Error(`Tool ${name} not registered`);
  const fn = tool.callback ?? tool.handler;
  if (!fn) throw new Error(`No callable found for tool: ${name}`);
  return fn;
}

/** Returns content[0].text (plain-text summary — used by all pre-FIX-D tests). */
async function callTool(
  server: McpServer,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const fn = getRegisteredToolFn(server, name);
  const result = await fn(args);
  return result.content[0]?.text ?? "";
}

/** FIX-D: Returns full content array (for structured_data tests that need content[1]). */
async function callToolFull(
  server: McpServer,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const fn = getRegisteredToolFn(server, name);
  return fn(args);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Task 240 — get_bctc_full compound tool", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  it("returns all 3 sections when financial + sentiment data exist", async () => {
    // Insert latest report (Q4/2025) and a prior report (Q3/2025) for comparison
    const id1 = insertFinancialRow(db, {
      action_code: "VCB",
      period_year: 2025,
      period_quarter: 4,
      period_type: "Q4",
      sort_key: "2025-Q4",
      net_revenue: 45_200_000,
      net_profit: 8_100_000,
    });
    insertTableRow(db, id1, "balance_sheet", 0);
    insertRefinedUnit(db, id1);

    insertFinancialRow(db, {
      action_code: "VCB",
      period_year: 2025,
      period_quarter: 3,
      period_type: "Q3",
      sort_key: "2025-Q3",
      net_revenue: 42_100_000,
      net_profit: 7_800_000,
    });
    // Sentiment entries
    insertRagRow(db, "VCB", "bullish", 0);
    insertRagRow(db, "VCB", "bullish", 1);
    insertRagRow(db, "VCB", "bearish", 2);

    const server = makeServer(db);
    const text = await callTool(server, "get_bctc_full", { code: "VCB" });

    // Section 1 — financial summary
    expect(text).toContain("=== BCTC SUMMARY: VCB ===");
    expect(text).toContain("Net Revenue");
    expect(text).toContain("Net Profit");
    expect(text).toContain("ROE");

    // Section 2 — comparison
    expect(text).toContain("=== QoQ/YoY COMPARISON ===");

    // Section 3 — sentiment
    expect(text).toContain("=== SENTIMENT TREND ===");
  });

  it("returns graceful message when no financial data exists for the stock", async () => {
    const server = makeServer(db);
    const text = await callTool(server, "get_bctc_full", { code: "XYZ" });

    expect(text).toContain("Chưa có dữ liệu BCTC cho XYZ");
    expect(text).toContain("list_stored_pdfs");
  });

  it("renders sentiment section with no-data note when no RAG rows exist", async () => {
    const id = insertFinancialRow(db, { action_code: "VNM" });
    insertTableRow(db, id, "balance_sheet", 0);
    insertRefinedUnit(db, id);

    const server = makeServer(db);
    const text = await callTool(server, "get_bctc_full", { code: "VNM" });

    expect(text).toContain("=== BCTC SUMMARY: VNM ===");
    expect(text).toContain("=== SENTIMENT TREND ===");
    // Sentiment section should indicate no data
    expect(text).toContain("Không có dữ liệu");
  });

  it("uppercases the code parameter automatically", async () => {
    const id = insertFinancialRow(db, { action_code: "FPT" });
    insertTableRow(db, id, "balance_sheet", 0);
    insertRefinedUnit(db, id);

    const server = makeServer(db);

    const text = await callTool(server, "get_bctc_full", { code: "fpt" });
    expect(text).toContain("=== BCTC SUMMARY: FPT ===");
  });

  it("filters by year when provided", async () => {
    // Insert two periods for same stock, different years
    const id1 = insertFinancialRow(db, {
      action_code: "VCB",
      period_year: 2024,
      period_quarter: 4,
      period_type: "Q4",
      sort_key: "2024-Q4",
    });
    insertTableRow(db, id1, "balance_sheet", 0);
    insertRefinedUnit(db, id1);

    insertFinancialRow(db, {
      action_code: "VCB",
      period_year: 2025,
      period_quarter: 4,
      period_type: "Q4",
      sort_key: "2025-Q4",
    });

    const server = makeServer(db);
    const text = await callTool(server, "get_bctc_full", { code: "VCB", year: 2024 });

    expect(text).toContain("2024");
    // Should not select the 2025 row as the latest
    expect(text).not.toContain("2025-Q4");
  });
});

// ── BAL-1a-BACKFILL: read-time ratio recompute ────────────────────────────────
//
// Verifies Option R (architect-approved 2026-06-02T14:14Z):
//   After the latestRow fetch, get_bctc_full recomputes the 5 ratio columns
//   from correct base scalars, mutates latestRow, and serves recomputed values —
//   ignoring whatever stale/garbage values are in the persisted ratio columns.
//
// Test scenario: VNM-like row.
//   net_profit = 9,413,600 (million VND = 9,413.6 tỷ)
//   equity_total = 34,483,000 (million VND = 34,483 tỷ)
//   → expected ROE = 9413600 / 34483000 × 100 ≈ 27.30%
//   Persisted roe column = 0 (stale OCR incomeBroken value)
//   After recompute: served ROE ≈ 27.3% (not 0%)
//
// Formula SSOT: mirrors finalizeBctcRefineTool.ts BLOCK-3 (BAL-1a):
//   roe = net_profit / equity_total × 100  (guard equity_total > 0)

describe("BAL-1a-BACKFILL: read-time ratio recompute in get_bctc_full", () => {
  it("TC-BAL-1a-R1: stale persisted roe=0 → served ROE recomputed ≈ 27.3% (VNM-like scalars)", async () => {
    const db = makeDb();

    // Insert with correct base scalars but stale roe=0 (simulates incomeBroken at OCR parse)
    // net_profit=9413600 (million VND), equity_total=34483000 → ROE = 9413600/34483000×100 ≈ 27.30%
    const reportId = "bal1a-vnm-test-001";
    db.prepare(`
      INSERT INTO financial_reports (
        id, action_code, company_name, period_year, period_quarter, period_type, sort_key,
        audit_status, extraction_confidence,
        net_revenue, gross_profit, operating_profit, ebitda, profit_before_tax, net_profit,
        eps, diluted_eps,
        total_assets, current_assets, cash, inventory,
        total_liabilities, short_term_debt, long_term_debt, equity_total,
        operating_cf, investing_cf, financing_cf, capex, free_cash_flow,
        gross_margin_pct, operating_margin_pct, net_margin_pct,
        roe, roa, current_ratio, debt_to_equity, net_debt_to_ebitda, pe, pb,
        published_at, refine_status,
        balance_sheet_json
      ) VALUES (
        ?, 'VNM', 'Vinamilk', 2025, 4, 'Q4', '2025-Q4',
        'audited', 0.92,
        70112000, 20000000, 12000000, 14000000, 11000000, 9413600,
        4200, 4100,
        52000000, 18000000, 3000000, 4000000,
        20000000, 2000000, 5000000, 34483000,
        10000000, -2000000, -3000000, 1500000, 8500000,
        28.5, 17.1, 13.4,
        0, 0, NULL, NULL, NULL, NULL, NULL,
        '2026-02-15', 'DONE',
        ?
      )`).run(
      reportId,
      JSON.stringify({ currentLiabilities: { total: 15000000 } }),
    );

    // Insert table row to pass PUB-2 and PUB-3 (corporate path — code='270')
    db.prepare(`INSERT INTO bctc_table_rows
      (report_id, page_number, statement_section, row_order, code, label,
       period_current, value_current, is_summary_row)
     VALUES (?, 1, 'balance_sheet', 1, '270', 'Total Assets', 'Q4-2025', 52000000, 0)`,
    ).run(reportId);

    const server = makeServer(db);
    const text = await callTool(server, "get_bctc_full", { code: "VNM" });

    // ROE must be recomputed from correct scalars, NOT the stale 0% column.
    // 9413600 / 34483000 × 100 = 27.299...% → displayed as "27.3%"
    expect(text).toContain("ROE");
    expect(text).toContain("27.3%");
    // Must NOT show 0.0% (which is the stale persisted value)
    expect(text).not.toContain("ROE          : 0.0%");

    // ROA must also be recomputed: 9413600 / 52000000 × 100 ≈ 18.1%
    expect(text).toContain("ROA");
    expect(text).not.toContain("ROA          : 0.0%");
  });

  it("TC-BAL-1a-R2: null denominator (equity_total=0) → served ROE is N/A (null), not Infinity", async () => {
    const db = makeDb();

    const reportId = "bal1a-null-denom-001";
    db.prepare(`
      INSERT INTO financial_reports (
        id, action_code, company_name, period_year, period_quarter, period_type, sort_key,
        audit_status, extraction_confidence,
        net_revenue, gross_profit, operating_profit, ebitda, profit_before_tax, net_profit,
        eps, diluted_eps,
        total_assets, current_assets, cash, inventory,
        total_liabilities, short_term_debt, long_term_debt, equity_total,
        operating_cf, investing_cf, financing_cf, capex, free_cash_flow,
        gross_margin_pct, operating_margin_pct, net_margin_pct,
        roe, roa, current_ratio, debt_to_equity, net_debt_to_ebitda, pe, pb,
        published_at, refine_status,
        balance_sheet_json
      ) VALUES (
        ?, 'TST', 'Test Co', 2025, 1, 'Q1', '2025-Q1',
        'audited', 0.92,
        10000000, 3000000, 1500000, 2000000, 1200000, 900000,
        300, 290,
        20000000, 8000000, 1000000, 2000000,
        19000000, 3000000, 7000000, 0,
        1500000, -500000, -700000, 200000, 1300000,
        30.0, 15.0, 9.0,
        999.0, 999.0, NULL, NULL, NULL, NULL, NULL,
        '2025-05-15', 'DONE',
        NULL
      )`).run(reportId);

    db.prepare(`INSERT INTO bctc_table_rows
      (report_id, page_number, statement_section, row_order, code, label,
       period_current, value_current, is_summary_row)
     VALUES (?, 1, 'balance_sheet', 1, '270', 'Total Assets', 'Q1-2025', 20000000, 0)`,
    ).run(reportId);

    const server = makeServer(db);
    const text = await callTool(server, "get_bctc_full", { code: "TST" });

    // equity_total=0 → recomputed roe must be null → rendered as "N/A"
    // Must NOT contain the stale garbage "999.0%" value
    expect(text).not.toContain("999.0%");
    expect(text).toContain("ROE");
    // When ROE is null, fmtPct renders "N/A"
    expect(text).toContain("N/A");
  });
});

// ── BAL-1f: current_ratio micro-residual guard + operating_margin recompute ──────
//
// Verifies three defects reported 2026-06-03:
//
//   DEFECT-1: FPT current_ratio = 41,527,873,060,120x
//     Root: clTotal = 1e-6 (parse artifact from component rounding:
//     shortTermDebt=0 + accountsPayable=1e-6 + ... = 1e-6).
//     1e-6 > 0 is true → safeDivideRead(41527873.06, 1e-6) ≈ 4.15e13.
//     Fix: clTotal must be ≥ 0.1% of current_assets AND ≥ 1.0 million VND.
//
//   DEFECT-2: FPT operating_margin_pct = 0.0% (stale persisted column)
//     Root: recompute block omitted operating_margin_pct.
//     operating_profit=2,747,763.83, net_revenue=12,479,997.21 → true margin=22.02%.
//     Fix: recompute gross/operating/net margin from base scalars in recompute block.
//
//   DEFECT-3 (regression guard): VNM-shape (missing currentLiabilities) → must still N/A.
//   DEFECT-4 (no over-suppression): healthy normal clTotal → correct finite current_ratio.

describe("BAL-1f: current_ratio guard + operating_margin recompute", () => {
  /** Helper: insert a report with the given scalars and balance_sheet_json. */
  function insertFptLikeRow(
    db: Database,
    overrides: {
      action_code: string;
      balance_sheet_json: string | null;
      current_assets: number;
      operating_profit: number;
      net_revenue: number;
      gross_profit: number;
      net_profit: number;
      operating_margin_pct_stale?: number;
    },
  ): string {
    const id = `bal1f-${overrides.action_code.toLowerCase()}-001`;
    db.prepare(`
      INSERT INTO financial_reports (
        id, action_code, company_name, period_year, period_quarter, period_type, sort_key,
        audit_status, extraction_confidence,
        net_revenue, gross_profit, operating_profit, ebitda, profit_before_tax, net_profit,
        eps, diluted_eps,
        total_assets, current_assets, cash, inventory,
        total_liabilities, short_term_debt, long_term_debt, equity_total,
        operating_cf, investing_cf, financing_cf, capex, free_cash_flow,
        gross_margin_pct, operating_margin_pct, net_margin_pct,
        roe, roa, current_ratio, debt_to_equity, net_debt_to_ebitda, pe, pb,
        published_at, refine_status,
        balance_sheet_json
      ) VALUES (
        ?, ?, 'Test Corp', 2025, 1, 'Q1', '2025-Q1',
        'audited', 0.92,
        ?, ?, ?, 3000000, 2000000, ?,
        1200, 1180,
        120000000, ?, 5000000, 2000000,
        80000000, 10000000, 20000000, 40000000,
        5000000, -2000000, -1000000, 500000, 4500000,
        NULL, ?, NULL,
        NULL, NULL, 1, NULL, NULL, NULL, NULL,
        '2025-05-15', 'DONE',
        ?
      )`).run(
      id,
      overrides.action_code,
      overrides.net_revenue,
      overrides.gross_profit,
      overrides.operating_profit,
      overrides.net_profit,
      overrides.current_assets,
      overrides.operating_margin_pct_stale ?? 0,
      overrides.balance_sheet_json,
    );
    return id;
  }

  it("TC-BAL-1f-1 (RED→GREEN): FPT-shape clTotal=1e-6 → current_ratio N/A, NOT 4.15e13", async () => {
    // DEFECT-1: before fix, current_assets=41527873 / clTotal=1e-6 = ~4.15e13 (garbage).
    // After fix: clTotal=1e-6 fails plausibility check → recomputedCurrentRatio=null → N/A.
    const db = makeDb();
    const balJson = JSON.stringify({
      currentLiabilities: {
        shortTermDebt: 0,
        accountsPayable: 1e-6,
        taxPayable: 4e-6,
        payablesToEmployees: 5e-6,
        total: 1e-6,
      },
    });
    const id = insertFptLikeRow(db, {
      action_code: "FPT",
      balance_sheet_json: balJson,
      current_assets: 41_527_873.06,
      operating_profit: 2_747_763.83,
      net_revenue: 12_479_997.21,
      gross_profit: 5_000_000,
      net_profit: 2_200_000,
      operating_margin_pct_stale: 0,  // stale persisted value — the bug
    });
    db.prepare(`INSERT INTO bctc_table_rows
      (report_id, page_number, statement_section, row_order, code, label,
       period_current, value_current, is_summary_row)
     VALUES (?, 1, 'balance_sheet', 1, '270', 'Total Assets', 'Q1-2025', 120000000, 0)`,
    ).run(id);

    const server = makeServer(db);
    const text = await callTool(server, "get_bctc_full", { code: "FPT" });

    // Must NOT show the garbage value 4.15e13 in any form
    expect(text).not.toMatch(/41[,\d]*527[,\d]*873/);  // raw number
    expect(text).not.toMatch(/4\.1\d+e\+?13/i);         // scientific notation

    // Current Ratio must be N/A (parse artifact denominator withheld)
    expect(text).toContain("Current Ratio    : N/A");
  });

  it("TC-BAL-1f-2 (RED→GREEN): FPT-shape operating_margin_pct stale=0 → recomputed ≈ 22.0%", async () => {
    // DEFECT-2: before fix, operating_margin_pct persisted=0, recompute block didn't touch it.
    // buildSummarySection read stale 0 → "0.0%". After fix: recomputed from base scalars.
    // operating_profit=2747763.83, net_revenue=12479997.21 → margin = 22.018...% ≈ 22.0%.
    const db = makeDb();
    const balJson = JSON.stringify({
      currentLiabilities: {
        shortTermDebt: 0,
        accountsPayable: 1e-6,
        total: 1e-6,
      },
    });
    const id = insertFptLikeRow(db, {
      action_code: "FP2",
      balance_sheet_json: balJson,
      current_assets: 41_527_873.06,
      operating_profit: 2_747_763.83,
      net_revenue: 12_479_997.21,
      gross_profit: 5_000_000,
      net_profit: 2_200_000,
      operating_margin_pct_stale: 0,  // the bug: stale 0% persisted
    });
    db.prepare(`INSERT INTO bctc_table_rows
      (report_id, page_number, statement_section, row_order, code, label,
       period_current, value_current, is_summary_row)
     VALUES (?, 1, 'balance_sheet', 1, '270', 'Total Assets', 'Q1-2025', 120000000, 0)`,
    ).run(id);

    const server = makeServer(db);
    const text = await callTool(server, "get_bctc_full", { code: "FP2" });

    // operating_margin_pct must be recomputed: 2747763.83 / 12479997.21 × 100 ≈ 22.0%
    // buildSummarySection line: "Operating Profit : ... (22.0%)"
    expect(text).toContain("22.0%");
    // Must NOT show stale 0.0% on the Operating Profit line
    // (check the Operating Profit line specifically, not other lines that may have 0.0%)
    expect(text).not.toMatch(/Operating Profit.*0\.0%/);
  });

  it("TC-BAL-1f-3 (VNM-shape regression): missing currentLiabilities → current_ratio still N/A", async () => {
    // VNM has no currentLiabilities breakdown in balance_sheet_json.
    // After BAL-1f: must still serve N/A (no regression from new guard).
    const db = makeDb();
    const id = insertFptLikeRow(db, {
      action_code: "VN3",
      balance_sheet_json: null,   // VNM-shape: no balance_sheet_json
      current_assets: 18_000_000,
      operating_profit: 12_000_000,
      net_revenue: 70_000_000,
      gross_profit: 20_000_000,
      net_profit: 9_413_600,
    });
    db.prepare(`INSERT INTO bctc_table_rows
      (report_id, page_number, statement_section, row_order, code, label,
       period_current, value_current, is_summary_row)
     VALUES (?, 1, 'balance_sheet', 1, '270', 'Total Assets', 'Q1-2025', 120000000, 0)`,
    ).run(id);

    const server = makeServer(db);
    const text = await callTool(server, "get_bctc_full", { code: "VN3" });

    // No currentLiabilities → recomputedCurrentRatio = null → N/A
    expect(text).toContain("Current Ratio    : N/A");
  });

  it("TC-BAL-1f-4 (no over-suppression): healthy normal clTotal → correct finite current_ratio", async () => {
    // Guard must NOT suppress valid current_ratios.
    // current_assets=10,000,000, clTotal=5,000,000 → ratio = 2.00x (healthy).
    // clTotal=5,000,000 >> MIN_CL_ABSOLUTE=1.0 and >> 0.1% of current_assets (10,000) → passes.
    const db = makeDb();
    const balJson = JSON.stringify({
      currentLiabilities: { total: 5_000_000 },
    });
    const id = insertFptLikeRow(db, {
      action_code: "HLT",
      balance_sheet_json: balJson,
      current_assets: 10_000_000,
      operating_profit: 2_000_000,
      net_revenue: 15_000_000,
      gross_profit: 5_000_000,
      net_profit: 1_500_000,
    });
    db.prepare(`INSERT INTO bctc_table_rows
      (report_id, page_number, statement_section, row_order, code, label,
       period_current, value_current, is_summary_row)
     VALUES (?, 1, 'balance_sheet', 1, '270', 'Total Assets', 'Q1-2025', 120000000, 0)`,
    ).run(id);

    const server = makeServer(db);
    const text = await callTool(server, "get_bctc_full", { code: "HLT" });

    // current_ratio = 10,000,000 / 5,000,000 = 2.00x — must be shown, not suppressed
    expect(text).toContain("2.00x");
    expect(text).not.toContain("Current Ratio    : N/A");
  });
});

// ── FIX-D: structured_data block + receivables ────────────────────────────────
//
// Non-breaking extension to get_bctc_full:
//   - Adds structured_data JSON block alongside existing text output.
//   - All numeric cols recomputed on read (not stale persisted values).
//   - receivables from vnstock_balance_sheet.receivables_bn (live query).
//   - Existing text output UNCHANGED (regression guard via text_summary key).
//
// AC covered:
//   FIX-D-1: structured_data keys present for DONE record
//   FIX-D-2: receivables populated from vnstock_balance_sheet
//   FIX-D-3: receivables honest-null on missing period
//   FIX-D-4: pe and pb in structured_data match text output (regression/spot-check)
//   FIX-D-5: replay — two calls return identical structured_data
//   (regression) existing text content is preserved in text_summary key

describe("FIX-D — structured_data block in get_bctc_full", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  /** Helper: insert a DONE report with pe=12.5, pb=2.3, net_profit=8_100_000, equity_total=180_000_000 */
  function insertDoneReport(overrideCode = "FPT"): string {
    const id = insertFinancialRow(db, {
      action_code: overrideCode,
      period_year: 2025,
      period_quarter: 4,
      period_type: "Q4",
      sort_key: "2025-Q4",
      net_revenue: 45_200_000,
      net_profit: 8_100_000,
      equity_total: 180_000_000,
      total_assets: 1_800_000_000,
      pe: 12.5,
      pb: 2.3,
      short_term_debt: 200_000_000,
      long_term_debt: 900_000_000,
      total_liabilities: 1_620_000_000,
      cash: 80_000_000,
      operating_cf: 10_000_000,
      eps: 4200,
    });
    insertTableRow(db, id, "balance_sheet", 0);
    insertRefinedUnit(db, id);
    return id;
  }

  // FIX-D-1 (RED→GREEN): structured_data keys present in response for DONE record
  // Uses callToolFull to access content[1] (structured JSON block).
  it("FIX-D-1: structured_data block present with all required keys for DONE record", async () => {
    insertDoneReport("FPT");

    const server = makeServer(db);
    const result = await callToolFull(server, "get_bctc_full", { code: "FPT" });

    // content[1] must exist and be parseable JSON containing structured_data
    expect(result.content[1]).toBeDefined();
    let parsed: Record<string, unknown>;
    expect(() => { parsed = JSON.parse(result.content[1]!.text); }).not.toThrow();
    parsed = JSON.parse(result.content[1]!.text);

    // structured_data must exist
    expect(parsed["structured_data"]).toBeDefined();
    const sd = parsed["structured_data"] as Record<string, unknown>;

    // All required keys must be present
    const requiredKeys = [
      "pe", "pb", "roe", "debt_to_equity", "equity_total",
      "total_assets", "total_liabilities", "cash", "long_term_debt",
      "profit_before_tax", "operating_cf", "net_profit", "eps",
      "net_revenue", "receivables",
    ];
    for (const key of requiredKeys) {
      expect(Object.prototype.hasOwnProperty.call(sd, key), `missing key: ${key}`).toBe(true);
    }
  });

  // FIX-D-2: receivables populated from vnstock_balance_sheet
  it("FIX-D-2: receivables populated from vnstock_balance_sheet when row exists", async () => {
    insertDoneReport("VCB");

    // Seed vnstock_balance_sheet row matching period Q4-2025 (year=2025, quarter=4)
    db.prepare(
      `INSERT OR REPLACE INTO vnstock_balance_sheet
       (code, year_report, quarter, receivables_bn, fetched_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run("VCB", 2025, 4, 125.7, "2026-06-04T08:00:00Z");

    const server = makeServer(db);
    const result = await callToolFull(server, "get_bctc_full", { code: "VCB" });

    const parsed = JSON.parse(result.content[1]!.text) as Record<string, unknown>;
    const sd = parsed["structured_data"] as Record<string, unknown>;

    // receivables must be 125.7 (from vnstock_balance_sheet)
    expect(sd["receivables"]).toBe(125.7);
  });

  // FIX-D-3: receivables honest-null when no matching vnstock_balance_sheet row
  it("FIX-D-3: receivables is null when no vnstock_balance_sheet row for this period", async () => {
    insertDoneReport("MWG");
    // No vnstock_balance_sheet row seeded

    const server = makeServer(db);
    const result = await callToolFull(server, "get_bctc_full", { code: "MWG" });

    const parsed = JSON.parse(result.content[1]!.text) as Record<string, unknown>;
    const sd = parsed["structured_data"] as Record<string, unknown>;

    // receivables must be null (honest sparse)
    expect(sd["receivables"]).toBeNull();
  });

  // FIX-D-4: pe and pb in structured_data match numeric values from text output
  it("FIX-D-4: structured_data.pe and .pb match text output values (regression spot-check)", async () => {
    insertDoneReport("HPG");

    const server = makeServer(db);
    const result = await callToolFull(server, "get_bctc_full", { code: "HPG" });

    const textSummary = result.content[0]!.text;
    const parsed = JSON.parse(result.content[1]!.text) as Record<string, unknown>;
    const sd = parsed["structured_data"] as Record<string, unknown>;

    // pe=12.5 → text shows "12.50x", structured_data.pe = 12.5
    expect(sd["pe"]).toBe(12.5);
    expect(textSummary).toContain("12.50x");

    // pb=2.3 → text shows "2.30x", structured_data.pb = 2.3
    expect(sd["pb"]).toBe(2.3);
    expect(textSummary).toContain("2.30x");
  });

  // FIX-D-5: replay — two calls return identical structured_data
  it("FIX-D-5: replay — two calls return identical structured_data JSON", async () => {
    insertDoneReport("GAS");

    const server = makeServer(db);

    const result1 = await callToolFull(server, "get_bctc_full", { code: "GAS" });
    const result2 = await callToolFull(server, "get_bctc_full", { code: "GAS" });

    // Both content[0] (text) and content[1] (structured) must match
    expect(result1.content[0]!.text).toBe(result2.content[0]!.text);
    expect(result1.content[1]!.text).toBe(result2.content[1]!.text);

    const sd1 = (JSON.parse(result1.content[1]!.text) as Record<string, unknown>)["structured_data"];
    const sd2 = (JSON.parse(result2.content[1]!.text) as Record<string, unknown>)["structured_data"];
    expect(JSON.stringify(sd1)).toBe(JSON.stringify(sd2));
  });

  // Regression: existing text output preserved in content[0] (text output UNCHANGED)
  it("regression: content[0] text preserved — existing content intact after FIX-D", async () => {
    insertDoneReport("VNM");

    const server = makeServer(db);
    const result = await callToolFull(server, "get_bctc_full", { code: "VNM" });

    // content[0] must contain the original plain-text sections
    const textSummary = result.content[0]!.text;
    expect(textSummary).toContain("=== BCTC SUMMARY: VNM ===");
    expect(textSummary).toContain("Net Revenue");
    expect(textSummary).toContain("ROE");
  });
});
