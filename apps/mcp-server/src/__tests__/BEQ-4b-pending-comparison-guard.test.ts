/**
 * BEQ-4b DV — refine_status=PENDING guard in buildComparisonSection
 *
 * Sprint: BCTC-EXTRACT-QUALITY
 * Brief: docs/architecture-briefs/2026-06-02-bctc-extract-quality.md § FIX-3
 *
 * Anti-false-green:
 *   RED proof: without the guard, a prior row with refine_status='PENDING' and
 *   garbage scalars (net_profit = net_revenue / 1000, gross_profit = net_revenue)
 *   would produce an absurd YoY comparison (e.g. +12146%).
 *   The test asserts the withheld message is returned, NOT the garbage YoY values.
 *
 *   GREEN proof: when the prior row is DONE, the comparison is emitted normally.
 *
 * Verification: pure in-memory SQLite — no HTTP, no echo.
 */

import { describe, it, expect } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Database } from "bun:sqlite";
import { registerBctcFullTools } from "../interface/mcp/tools/financial-reports/bctcFullTools.js";

// ── Schema setup ──────────────────────────────────────────────────────────────

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
    domain TEXT,
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
    refine_status TEXT NOT NULL DEFAULT 'DONE'
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
    causal_chain TEXT,
    data_env TEXT
,
    source_url TEXT UNIQUE)`);

  return db;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeServer(db: Database): McpServer {
  const server = new McpServer(
    { name: "test", version: "0.0.0" },
    { capabilities: { tools: {} } },
  );
  registerBctcFullTools(server, db);
  return server;
}

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

/** Insert a financial report row and return its id. */
function insertReport(
  db: Database,
  opts: {
    id: string;
    code: string;
    year: number;
    quarter: number;
    sortKey: string;
    netRevenue: number;
    netProfit: number;
    grossProfit?: number;
    refineStatus: "PENDING" | "DONE" | "PARTIAL";
  },
): void {
  db.run(`
    INSERT INTO financial_reports
      (id, action_code, period_year, period_quarter, period_type, sort_key,
       net_revenue, gross_profit, net_profit, refine_status,
       total_assets, total_liabilities, equity_total,
       published_at, audit_status, extraction_confidence)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1000000, 600000, 400000, '2026-01-01', 'reviewed', 0.85)
  `, [
    opts.id, opts.code, opts.year, opts.quarter, `Q${opts.quarter}`, opts.sortKey,
    opts.netRevenue, opts.grossProfit ?? opts.netProfit * 2,
    opts.netProfit, opts.refineStatus,
  ]);
}

/** Insert bctc_table_rows rows (needed for PUB-2 + PUB-3 gates).
 * PUB-2: at least 1 row with value_current IS NOT NULL.
 * PUB-3: at least 1 non-summary (is_summary_row=0) balance_sheet row.
 */
function insertTableRow(db: Database, reportId: string): void {
  // Summary row (code 270 — total assets, is_summary_row=1) — satisfies PUB-2
  db.run(`
    INSERT INTO bctc_table_rows
      (report_id, page_number, statement_section, row_order, code, label,
       period_current, value_current, unit, is_summary_row)
    VALUES (?, 1, 'balance_sheet', 1, '270', 'TỔNG CỘNG TÀI SẢN', 'Q1-2026', 88000000000, 'vnd', 1)
  `, [reportId]);
  // Non-summary child row (is_summary_row=0) — satisfies PUB-3
  db.run(`
    INSERT INTO bctc_table_rows
      (report_id, page_number, statement_section, row_order, code, label,
       period_current, value_current, unit, is_summary_row)
    VALUES (?, 1, 'balance_sheet', 2, '110', 'Tiền và các khoản tương đương tiền', 'Q1-2026', 5000000000, 'vnd', 0)
  `, [reportId]);
}

/** Insert a bctc_refined_units row (needed for PUB-3 gate). */
function insertRefinedUnit(db: Database, reportId: string): void {
  db.run(`
    INSERT INTO bctc_refined_units
      (report_id, unit_id, page_numbers_json, markdown, row_count, confidence, window_status)
    VALUES (?, ?, '[1]', '| test |', 5, 0.85, 'DONE')
  `, [reportId, `unit-${reportId.slice(0, 8)}`]);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("BEQ-4b — buildComparisonSection PENDING guard", () => {
  it("RED→GREEN: withholds comparison when prior row is PENDING (contamination guard)", async () => {
    /**
     * Anti-false-green proof:
     *
     * RED scenario (what the bug looked like):
     *   FPT 2025-Q4 is PENDING with net_profit=20,225 and net_revenue=20,225,450
     *   (net_profit = net_revenue / 1000 — unit-scale bug from legacy OCR parse).
     *   FPT 2026-Q1 has net_profit=2,476,790 (correct, from refine pipeline).
     *   Without guard: YoY = (2,476,790 - 20,225) / 20,225 * 100 = +12,146%.
     *   This is garbage — the comparison must be withheld.
     *
     * GREEN (what the fix produces):
     *   Guard fires → returns withheld message.
     *   No garbage numeric delta is emitted.
     */

    const db = makeDb();

    // latest: FPT 2026-Q1 — DONE (correct, refined)
    const latestId = "fpt-2026-q1-done-xxxx";
    insertReport(db, {
      id: latestId,
      code: "FPT",
      year: 2026,
      quarter: 1,
      sortKey: "2026-Q1",
      netRevenue: 20_500_000,
      netProfit: 2_476_790,   // correct value from refine pipeline
      refineStatus: "DONE",
    });
    insertTableRow(db, latestId);
    insertRefinedUnit(db, latestId);

    // prior: FPT 2025-Q4 — PENDING (legacy OCR garbage: net_profit = net_revenue / 1000)
    insertReport(db, {
      id: "fpt-2025-q4-pending-x",
      code: "FPT",
      year: 2025,
      quarter: 4,
      sortKey: "2025-Q4",
      netRevenue: 20_225_450, // million VND (correct revenue)
      netProfit: 20_225,      // BUG: = net_revenue / 1000 (unit scale bug)
      grossProfit: 20_225_450, // BUG: gross_profit = net_revenue (wrong)
      refineStatus: "PENDING",
    });

    const server = makeServer(db);
    const text = await callTool(server, "get_bctc_full", { code: "FPT" });

    // Must contain the comparison section
    expect(text).toContain("=== QoQ/YoY COMPARISON ===");

    // GREEN: guard fired — withheld message present
    expect(text).toContain("not yet refined");
    expect(text).toContain("withheld to avoid contamination");
    expect(text).toContain("2025-Q4");

    // Must NOT contain any garbage YoY percentages or numeric delta from the PENDING row.
    // The +12146% contamination must be absent.
    expect(text).not.toContain("+12146");
    expect(text).not.toContain("12146%");
    // Must NOT contain the garbage net_profit value formatted as a comparison
    expect(text).not.toContain("20,225");

    // Verify via direct DB read: prior row is PENDING (not HTTP echo)
    const priorRow = db.query<{ refine_status: string }, [string, string]>(
      "SELECT refine_status FROM financial_reports WHERE action_code=? AND sort_key=?",
    ).get("FPT", "2025-Q4");
    expect(priorRow?.refine_status).toBe("PENDING");
  });

  it("allows comparison through when prior row is DONE", async () => {
    /**
     * GREEN control test: when prior is DONE, the guard does NOT fire
     * and the comparison is emitted normally.
     */
    const db = makeDb();

    // latest: FPT 2026-Q1 — DONE
    const latestId = "fpt-2026-q1-done-ctrl";
    insertReport(db, {
      id: latestId,
      code: "FPT",
      year: 2026,
      quarter: 1,
      sortKey: "2026-Q1",
      netRevenue: 20_500_000,
      netProfit: 2_476_790,
      refineStatus: "DONE",
    });
    insertTableRow(db, latestId);
    insertRefinedUnit(db, latestId);

    // prior: FPT 2025-Q4 — DONE (correct values, guard should NOT fire)
    insertReport(db, {
      id: "fpt-2025-q4-done-ctrl",
      code: "FPT",
      year: 2025,
      quarter: 4,
      sortKey: "2025-Q4",
      netRevenue: 19_800_000,
      netProfit: 2_200_000,   // correct value
      refineStatus: "DONE",
    });

    const server = makeServer(db);
    const text = await callTool(server, "get_bctc_full", { code: "FPT" });

    // Comparison should NOT be withheld
    expect(text).not.toContain("not yet refined");
    expect(text).not.toContain("withheld to avoid contamination");

    // Should contain an actual YoY comparison
    expect(text).toContain("=== QoQ/YoY COMPARISON ===");
    expect(text).toContain("YoY");

    // Verify prior row is DONE
    const priorRow = db.query<{ refine_status: string }, [string, string]>(
      "SELECT refine_status FROM financial_reports WHERE action_code=? AND sort_key=?",
    ).get("FPT", "2025-Q4");
    expect(priorRow?.refine_status).toBe("DONE");
  });

  it("also withholds when prior is selected via fallback path", async () => {
    /**
     * Guard covers both the preferred-quarter path and the fallback
     * "any earlier row" path. This test uses the fallback.
     */
    const db = makeDb();

    // latest: FPT 2026-Q1 — DONE
    const latestId = "fpt-2026-q1-done-fbck";
    insertReport(db, {
      id: latestId,
      code: "FPT",
      year: 2026,
      quarter: 1,
      sortKey: "2026-Q1",
      netRevenue: 20_500_000,
      netProfit: 2_476_790,
      refineStatus: "DONE",
    });
    insertTableRow(db, latestId);
    insertRefinedUnit(db, latestId);

    // prior: FPT 2025-Q3 — PENDING (fallback row, not Q4)
    insertReport(db, {
      id: "fpt-2025-q3-pending-x",
      code: "FPT",
      year: 2025,
      quarter: 3,
      sortKey: "2025-Q3",
      netRevenue: 18_000_000,
      netProfit: 18,           // garbage OCR value
      refineStatus: "PENDING",
    });

    const server = makeServer(db);
    const text = await callTool(server, "get_bctc_full", { code: "FPT" });

    expect(text).toContain("=== QoQ/YoY COMPARISON ===");
    expect(text).toContain("not yet refined");
    expect(text).toContain("withheld to avoid contamination");
  });
});
