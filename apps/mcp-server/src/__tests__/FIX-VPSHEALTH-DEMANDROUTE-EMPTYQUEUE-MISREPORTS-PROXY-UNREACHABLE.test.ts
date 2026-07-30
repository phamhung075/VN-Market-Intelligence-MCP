Bun.env["DB_PATH"] = ":memory:";

/**
 * FIX-VPSHEALTH-DEMANDROUTE-EMPTYQUEUE-MISREPORTS-PROXY-UNREACHABLE
 *
 * Regression coverage for the get_vps_proxy_health MCP tool narration bug:
 * bctc is a DEMAND-DRIVEN route — it pushes only when bctc_vps_queue holds
 * an actionable (`pending`) row. Before this fix, a large last-push age on
 * bctc was folded into the generic "STALE: ... — VPS may be down or
 * unreachable" narration even when the proxy was provably up (sibling
 * routes on the same proxy pushing normally) and the true cause was simply
 * an empty bctc work queue.
 *
 * Live root-cause probe (2026-07-29): bctc_vps_queue held 0 `pending` rows
 * (328 deferred_infra, 85 done, 128 enrich_failed, 39 url_not_found) while
 * prices/news/sbv were all pushing normally on the same proxy.
 *
 * Harness: _registeredTools direct-handler invocation (CI-safe; no
 * InMemoryTransport) — proven template from siblings 1134/1117/089.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Database } from "bun:sqlite";
import { registerVpsProxyTools } from "../interface/mcp/tools/system/vpsProxyTools.js";
import { getDemandQueueDepth } from "../infrastructure/db/vpsPushLogStore.js";

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
  db.exec(`CREATE INDEX IF NOT EXISTS idx_vpl_service_ts ON vps_push_log(service, pushed_at)`);

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

function seedPush(
  db: Database,
  service: string,
  pushedAtIso: string,
  opts: { status?: string; items?: number } = {},
): void {
  db.prepare(
    `INSERT INTO vps_push_log (service, items_count, status, pushed_at) VALUES (?, ?, ?, ?)`,
  ).run(service, opts.items ?? 10, opts.status ?? "ok", pushedAtIso);
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
  registerVpsProxyTools(_testServer, _testDb);
});

afterEach(() => {
  _testDb.close();
});

describe("FIX-VPSHEALTH-DEMANDROUTE-EMPTYQUEUE-MISREPORTS-PROXY-UNREACHABLE", () => {
  it("AC: bctc queue empty (0 pending) + siblings pushing within SLA -> proxy NOT asserted down/unreachable", async () => {
    const now = Date.now();
    // Siblings pushing normally on the same proxy, well within their own SLA.
    seedPush(_testDb, "prices", new Date(now - 2 * 60 * 1000).toISOString());
    seedPush(_testDb, "news", new Date(now - 2 * 60 * 1000).toISOString());
    seedPush(_testDb, "sbv", new Date(now - 2 * 60 * 1000).toISOString());
    // bctc last pushed 30h ago — far beyond its 12h (720 min) raw threshold.
    seedPush(_testDb, "bctc", new Date(now - 30 * 60 * 60 * 1000).toISOString());

    // Live-probe-mirrored queue state: ZERO pending rows; only terminal/parked statuses.
    seedQueueRow(_testDb, "deferred_infra", "AAA", 2025, "Q4");
    seedQueueRow(_testDb, "done", "BBB", 2026, "Q1");
    seedQueueRow(_testDb, "enrich_failed", "CCC", 2026, "Q1");
    seedQueueRow(_testDb, "url_not_found", "DDD", 2026, "Q1");

    const result = await callTool("get_vps_proxy_health", { service: "all" });
    const text = result.content[0]!.text;

    // MUST NOT assert the VPS itself is down/unreachable.
    expect(text).not.toContain("VPS may be down or unreachable");
    expect(text).not.toContain("STALE:");
    // Root cause correctly attributed to the empty demand-driven queue, not the proxy.
    expect(text).toContain("IDLE-NO-WORK");
    expect(text).toMatch(/IDLE-NO-WORK[^\n]*bctc/);
    // Per-row Stale? column reflects the corrected inference.
    expect(text).toMatch(/bctc\s+\|[^\n]*\|\s*idle-no-work/);
  });

  it("control: bctc queue HAS an actionable (pending) row -> normal STALE/unreachable narration still fires", async () => {
    const now = Date.now();
    seedPush(_testDb, "prices", new Date(now - 2 * 60 * 1000).toISOString());
    seedPush(_testDb, "news", new Date(now - 2 * 60 * 1000).toISOString());
    seedPush(_testDb, "sbv", new Date(now - 2 * 60 * 1000).toISOString());
    seedPush(_testDb, "bctc", new Date(now - 30 * 60 * 60 * 1000).toISOString());

    // Real work is queued and NOT being processed — this is a genuine incident.
    seedQueueRow(_testDb, "pending", "EEE", 2026, "Q2");

    const result = await callTool("get_vps_proxy_health", { service: "all" });
    const text = result.content[0]!.text;

    expect(text).toContain("STALE:");
    expect(text).toContain("VPS may be down or unreachable");
    expect(text).toMatch(/STALE:[^\n]*bctc/);
    expect(text).not.toContain("IDLE-NO-WORK");
  });

  it("fail-open: bctc_vps_queue table absent -> pre-fix behavior unchanged (no gate applied)", async () => {
    const db = new Database(":memory:");
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
    // Deliberately NO bctc_vps_queue table — mirrors an older schema/minimal fixture.
    const server = new McpServer({ name: "test-failopen", version: "0.0.1" });
    registerVpsProxyTools(server, db);

    const now = Date.now();
    seedPush(db, "bctc", new Date(now - 30 * 60 * 60 * 1000).toISOString());

    const tool = (server as unknown as RegisteredToolsServer)._registeredTools["get_vps_proxy_health"];
    const result = await tool!.handler({ service: "bctc" });
    const text = result.content[0]!.text;

    expect(text).toContain("STALE:");
    expect(text).toContain("VPS may be down or unreachable");
    expect(text).not.toContain("IDLE-NO-WORK");

    db.close();
  });
});

describe("getDemandQueueDepth", () => {
  let db: Database;

  beforeEach(() => {
    db = buildTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it("returns null for a cadence-driven route not in the demand-queue registry", () => {
    expect(getDemandQueueDepth(db, "prices")).toBeNull();
    expect(getDemandQueueDepth(db, "news")).toBeNull();
    expect(getDemandQueueDepth(db, "sbv")).toBeNull();
  });

  it("returns 0 for bctc when the queue holds only terminal/parked rows", () => {
    seedQueueRow(db, "deferred_infra", "AAA", 2025, "Q4");
    seedQueueRow(db, "done", "BBB", 2026, "Q1");
    seedQueueRow(db, "enrich_failed", "CCC", 2026, "Q1");
    seedQueueRow(db, "url_not_found", "DDD", 2026, "Q1");

    expect(getDemandQueueDepth(db, "bctc")).toBe(0);
  });

  it("returns > 0 for bctc when the queue holds an actionable pending row", () => {
    seedQueueRow(db, "pending", "EEE", 2026, "Q2");
    seedQueueRow(db, "done", "BBB", 2026, "Q1");

    expect(getDemandQueueDepth(db, "bctc")).toBe(1);
  });

  it("fails open (null) when bctc_vps_queue table is absent", () => {
    const bareDb = new Database(":memory:");
    bareDb.exec(`
      CREATE TABLE IF NOT EXISTS vps_push_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, service TEXT NOT NULL,
        items_count INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'ok',
        pushed_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    expect(getDemandQueueDepth(bareDb, "bctc")).toBeNull();
    bareDb.close();
  });
});
