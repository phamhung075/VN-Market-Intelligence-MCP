/**
 * FIX-C — get_bctc_series MCP tool tests
 *
 * Coverage:
 *   1. DONE-only guard: a non-DONE period is excluded from results
 *   2. Sparse-history honesty: only existing periods returned (no padding/fabrication)
 *   3. Structured array shape: each item has sort_key + period fields + requested fields
 *   4. Unknown / extra fields are silently excluded (only allowed set returned)
 *   5. Empty result when no DONE periods exist
 *   6. Respects `periods` limit
 *   7. Null values for null DB fields are returned as null (honest-absent)
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerBctcSeriesTools, buildSeriesData } from "../interface/mcp/tools/financial-reports/bctcSeriesTools.js";

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
    refine_status TEXT NOT NULL DEFAULT 'DONE',
    period_basis TEXT,
    balance_sheet_json TEXT
  )`);
  return db;
}

function insertReport(
  db: Database,
  opts: {
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
    roe?: number | null;
    pe?: number | null;
    pb?: number | null;
    debt_to_equity?: number | null;
  },
): void {
  const {
    code, sort_key, period_year, period_quarter = null, period_type,
    refine_status = "DONE",
    net_profit = 1_000_000,
    net_revenue = 5_000_000,
    eps = 1000,
    total_assets = 20_000_000,
    equity_total = 8_000_000,
    operating_cf = 800_000,
    roe = 12.5,
    pe = 10.0,
    pb = 1.5,
    debt_to_equity = 0.8,
  } = opts;

  db.prepare(`INSERT INTO financial_reports (
      id, action_code, period_year, period_quarter, period_type, sort_key,
      net_profit, net_revenue, eps, total_assets, equity_total, operating_cf,
      roe, pe, pb, debt_to_equity, refine_status
    ) VALUES (
      lower(hex(randomblob(8))),
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?
    )`).run(
    code, period_year, period_quarter, period_type, sort_key,
    net_profit, net_revenue, eps, total_assets, equity_total, operating_cf,
    roe, pe, pb, debt_to_equity, refine_status,
  );
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
  it("returns objects with period identifiers + requested fields (correct shape)", () => {
    insertReport(db, {
      code: "VNM", sort_key: "2025-Q1", period_year: 2025, period_quarter: 1, period_type: "Q1",
      net_profit: 1_200_000, roe: 18.5, pe: 15.2,
    });

    const result = buildSeriesData(db, "VNM", ["net_profit", "roe", "pe"], 4);

    expect(result).toHaveLength(1);
    const point = result[0]!;

    // Period identifiers always present
    expect(typeof point.sort_key).toBe("string");
    expect(typeof point.period_year).toBe("number");
    expect(point.period_type).toBe("Q1");

    // Requested fields present with correct values
    expect(point.net_profit).toBe(1_200_000);
    expect(point.roe).toBe(18.5);
    expect(point.pe).toBe(15.2);

    // Non-requested fields absent
    expect("eps" in point).toBe(false);
    expect("total_assets" in point).toBe(false);
  });

  // ── Test 4: Null DB values → null output (honest-absent) ─────────────────
  it("returns null for DB null fields (honest-absent, no fabrication)", () => {
    insertReport(db, {
      code: "HPG", sort_key: "2025-Q4", period_year: 2025, period_type: "Q4",
      roe: null, pe: null, debt_to_equity: null,
    });

    const result = buildSeriesData(db, "HPG", ["roe", "pe", "debt_to_equity"], 4);

    expect(result).toHaveLength(1);
    expect(result[0]!.roe).toBeNull();
    expect(result[0]!.pe).toBeNull();
    expect(result[0]!.debt_to_equity).toBeNull();
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
  it("all allowed fields are returned when requested", () => {
    insertReport(db, {
      code: "DHG", sort_key: "2025-Q2", period_year: 2025, period_quarter: 2, period_type: "Q2",
      net_profit: 500_000, net_revenue: 3_000_000, eps: 800,
      total_assets: 10_000_000, equity_total: 4_000_000, operating_cf: 600_000,
      roe: 14.0, pe: 12.0, pb: 1.8, debt_to_equity: 0.5,
    });

    const result = buildSeriesData(db, "DHG", [
      "pe", "pb", "roe", "debt_to_equity", "operating_cf",
      "net_profit", "eps", "total_assets", "net_revenue", "equity_total",
    ], 1);

    expect(result).toHaveLength(1);
    const pt = result[0]!;
    expect(pt.pe).toBe(12.0);
    expect(pt.pb).toBe(1.8);
    expect(pt.roe).toBe(14.0);
    expect(pt.debt_to_equity).toBe(0.5);
    expect(pt.operating_cf).toBe(600_000);
    expect(pt.net_profit).toBe(500_000);
    expect(pt.eps).toBe(800);
    expect(pt.total_assets).toBe(10_000_000);
    expect(pt.net_revenue).toBe(3_000_000);
    expect(pt.equity_total).toBe(4_000_000);
  });
});
