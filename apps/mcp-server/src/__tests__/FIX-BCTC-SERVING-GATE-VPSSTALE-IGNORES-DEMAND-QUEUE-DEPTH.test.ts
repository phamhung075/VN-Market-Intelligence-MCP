Bun.env["DB_PATH"] = ":memory:";

/**
 * FIX-BCTC-SERVING-GATE-VPSSTALE-IGNORES-DEMAND-QUEUE-DEPTH
 *
 * Regression coverage for the get_bctc_full serving gate: bctc is a
 * DEMAND-DRIVEN route (see infrastructure/db/vpsDemandQueue.ts) — it pushes
 * only when bctc_vps_queue holds an actionable (`pending`) row. Before this
 * fix, get_bctc_full's `vps_stale` refusal envelope fired purely on last-push
 * age vs the flat BCTC_VPS_SLA_HOURS constant, with ZERO demand-queue check —
 * disagreeing with get_vps_proxy_health, which (post FIX-VPSHEALTH-
 * DEMANDROUTE-EMPTYQUEUE-MISREPORTS-PROXY-UNREACHABLE) already treats an
 * empty bctc queue as idle-no-work, not proxy-down evidence.
 *
 * Harness: _registeredTools direct-handler invocation (CI-safe; no
 * InMemoryTransport) — proven template from FIX-VPSHEALTH-DEMANDROUTE-
 * EMPTYQUEUE-MISREPORTS-PROXY-UNREACHABLE.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Database } from "bun:sqlite";
import { registerBctcFullTools } from "../interface/mcp/tools/financial-reports/bctcFullTools.js";

interface McpTextResult {
  isError?: boolean;
  content: Array<{ type: string; text: string }>;
}

type RegisteredToolsServer = {
  _registeredTools: Record<string, {
    handler: (args: Record<string, unknown>) => Promise<McpTextResult>;
  }>;
};

let _testDb: Database;
let _testServer: McpServer;

function buildTestDb(): Database {
  const db = new Database(":memory:");

  db.exec(`
    CREATE TABLE IF NOT EXISTS financial_reports (
      id TEXT, action_code TEXT, company_name TEXT, period_year INTEGER,
      period_quarter INTEGER, period_type TEXT, sort_key TEXT, audit_status TEXT,
      extraction_confidence REAL, domain TEXT,
      net_revenue REAL, gross_profit REAL, operating_profit REAL,
      ebitda REAL, profit_before_tax REAL, net_profit REAL, eps REAL,
      diluted_eps REAL, total_assets REAL, current_assets REAL, cash REAL,
      inventory REAL, total_liabilities REAL, short_term_debt REAL,
      long_term_debt REAL, equity_total REAL, operating_cf REAL,
      investing_cf REAL, financing_cf REAL, capex REAL, free_cash_flow REAL,
      gross_margin_pct REAL, operating_margin_pct REAL, net_margin_pct REAL,
      roe REAL, roa REAL, current_ratio REAL, debt_to_equity REAL,
      net_debt_to_ebitda REAL, pe REAL, pb REAL, published_at TEXT,
      yoy_delta_json TEXT, qoq_delta_json TEXT, refine_status TEXT,
      period_basis TEXT, balance_sheet_json TEXT, report_scope TEXT,
      validation_status TEXT, validation_notes TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS vps_push_log (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      service      TEXT    NOT NULL,
      items_count  INTEGER NOT NULL DEFAULT 0,
      status       TEXT    NOT NULL DEFAULT 'ok',
      error_msg    TEXT,
      duration_ms  INTEGER,
      pushed_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Mirrors production schema (schema-financial-reports.ts) — bctc's own
  // demand-driven work queue.
  db.exec(`
    CREATE TABLE IF NOT EXISTS bctc_vps_queue (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      action_code     TEXT    NOT NULL,
      period_year     INTEGER NOT NULL,
      period_quarter  TEXT    NOT NULL,
      status          TEXT    NOT NULL DEFAULT 'pending',
      source_url      TEXT,
      attempts        INTEGER NOT NULL DEFAULT 0,
      last_attempt    TEXT,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(action_code, period_year, period_quarter)
    )
  `);

  return db;
}

function seedPush(db: Database, service: string, pushedAtIso: string): void {
  db.prepare(
    `INSERT INTO vps_push_log (service, items_count, status, pushed_at) VALUES (?, 0, 'ok', ?)`,
  ).run(service, pushedAtIso);
}

function seedQueueRow(
  db: Database,
  status: string,
  code: string,
  year: number,
  quarter: string,
): void {
  db.prepare(
    `INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status) VALUES (?, ?, ?, ?)`,
  ).run(code, year, quarter, status);
}

async function callTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<McpTextResult> {
  const tool = (_testServer as unknown as RegisteredToolsServer)._registeredTools[toolName];
  if (!tool) throw new Error(`Tool not registered: ${toolName}`);
  return await tool.handler(args);
}

beforeEach(() => {
  _testDb = buildTestDb();
  _testServer = new McpServer({ name: "test", version: "0.0.1" });
  registerBctcFullTools(_testServer, _testDb);
});

afterEach(() => {
  _testDb.close();
});

describe("FIX-BCTC-SERVING-GATE-VPSSTALE-IGNORES-DEMAND-QUEUE-DEPTH", () => {
  it("AC1 positive: bctc queue empty (0 pending) + stale last push -> NOT vps_stale, plain honest-absence", async () => {
    const now = Date.now();
    // Last ok push far beyond the 48h SLA.
    seedPush(_testDb, "bctc", new Date(now - 58 * 60 * 60 * 1000).toISOString());
    // Live-probe-mirrored queue state: ZERO pending rows; only terminal/parked statuses.
    seedQueueRow(_testDb, "deferred_infra", "AAA", 2025, "Q4");
    seedQueueRow(_testDb, "done", "BBB", 2026, "Q1");
    seedQueueRow(_testDb, "enrich_failed", "CCC", 2026, "Q1");
    seedQueueRow(_testDb, "url_not_found", "DDD", 2026, "Q1");

    const result = await callTool("get_bctc_full", { code: "PLX" });
    const text = result.content[0]!.text;

    expect(text).not.toContain("vps_stale");
    expect(text).not.toContain("VPS proxy stale");
    expect(text).toContain("Chưa có dữ liệu BCTC");
  });

  it("AC2 negative control: bctc queue HAS an actionable (pending) row + stale last push -> vps_stale still fires", async () => {
    const now = Date.now();
    seedPush(_testDb, "bctc", new Date(now - 58 * 60 * 60 * 1000).toISOString());
    // Real work is queued and NOT being processed — this is a genuine incident.
    seedQueueRow(_testDb, "pending", "EEE", 2026, "Q2");

    const result = await callTool("get_bctc_full", { code: "PLX" });
    const text = result.content[0]!.text;

    expect(text).toContain("vps_stale");
    const parsed = JSON.parse(text) as Record<string, unknown>;
    expect(parsed.unavailable).toBe(true);
    expect(parsed.reason).toBe("vps_stale");
  });

  it("fail-open: bctc_vps_queue table absent -> pre-fix behavior unchanged (no gate applied)", async () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE IF NOT EXISTS financial_reports (
        id TEXT, action_code TEXT, sort_key TEXT
      )
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS vps_push_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, service TEXT NOT NULL,
        items_count INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'ok',
        pushed_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    // Deliberately NO bctc_vps_queue table — mirrors an older schema/minimal fixture.
    const server = new McpServer({ name: "test-failopen", version: "0.0.1" });
    registerBctcFullTools(server, db);

    const now = Date.now();
    seedPush(db, "bctc", new Date(now - 58 * 60 * 60 * 1000).toISOString());

    const tool = (server as unknown as RegisteredToolsServer)._registeredTools["get_bctc_full"];
    const result = await tool!.handler({ code: "PLX" });
    const text = result.content[0]!.text;

    expect(text).toContain("vps_stale");

    db.close();
  });
});
