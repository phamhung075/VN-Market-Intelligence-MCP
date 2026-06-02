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

  return db;
}

// ─── call helper ────────────────────────────────────────────────────────────

async function callTool(
  server: McpServer,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const tools = (server as unknown as {
    _registeredTools: Record<string, {
      callback?: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;
      handler?: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;
    }>;
  })._registeredTools;
  const tool = tools[name];
  if (!tool) throw new Error(`Tool ${name} not registered`);
  const fn = tool.callback ?? tool.handler;
  if (!fn) throw new Error(`No callable found for tool: ${name}`);
  const result = await fn(args);
  return result.content[0]?.text ?? "";
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
