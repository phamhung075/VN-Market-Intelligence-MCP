/**
 * Task 245 — MCP Tools for Sprint 039
 *
 * 9 tests: 3 per tool — get_legal_risk_signals, get_policy_signals, get_bond_maturity_calendar
 */
import { describe, it, expect } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Database } from "bun:sqlite";
import { registerLegalRiskTools } from "../interface/mcp/tools/sector/legalRiskTools.js";
import { registerPolicyTools } from "../interface/mcp/tools/macro/policyTools.js";
import { registerBondMaturityTools } from "../interface/mcp/tools/sector/bondMaturityTools.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      triggered_at TEXT NOT NULL,
      severity TEXT NOT NULL,
      signals_json TEXT,
      affected_actions_json TEXT,
      message TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      user_note TEXT
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS rag_analyses (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      level TEXT NOT NULL,
      source_title TEXT,
      summary TEXT,
      source_url TEXT,
      source_type TEXT,
      published_at TEXT,
      sentiment TEXT,
      impact_score REAL,
      affected_actions TEXT,
      affected_domains TEXT,
      causal_chain TEXT,
      reasoning TEXT,
      embedding_id TEXT
    )
  `);
  return db;
}

function makeServer(): McpServer {
  return new McpServer(
    { name: "test-server", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );
}

/** Invoke a registered MCP tool directly, bypassing SSE transport. */
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
  return entry.handler(args) as Promise<{ content: Array<{ type: string; text: string }> }>;
}

function getRegisteredTools(server: McpServer): Record<string, unknown> {
  return (server as unknown as { _registeredTools: Record<string, unknown> })
    ._registeredTools ?? {};
}

// ─────────────────────────────────────────────────────────────────────────────
// get_legal_risk_signals tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 245 — get_legal_risk_signals", () => {
  it("registers get_legal_risk_signals tool", () => {
    const server = makeServer();
    const db = makeTestDb();
    registerLegalRiskTools(server, db);
    const tools = getRegisteredTools(server);
    expect(tools["get_legal_risk_signals"]).toBeDefined();
  });

  it("returns text content when no alerts exist", async () => {
    const server = makeServer();
    const db = makeTestDb();
    registerLegalRiskTools(server, db);
    const result = await callTool(server, "get_legal_risk_signals", { days: 30 });
    expect(result.content[0]?.type).toBe("text");
    expect(result.content[0]?.text).toBeTruthy();
  });

  it("accepts stock filter parameter without error", async () => {
    const server = makeServer();
    const db = makeTestDb();
    registerLegalRiskTools(server, db);
    const result = await callTool(server, "get_legal_risk_signals", { stock: "VCB", days: 7 });
    expect(result.content[0]?.type).toBe("text");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// get_policy_signals tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 245 — get_policy_signals", () => {
  it("registers get_policy_signals tool", () => {
    const server = makeServer();
    const db = makeTestDb();
    registerPolicyTools(server, db);
    const tools = getRegisteredTools(server);
    expect(tools["get_policy_signals"]).toBeDefined();
  });

  it("returns text content when no policy news exists", async () => {
    const server = makeServer();
    const db = makeTestDb();
    registerPolicyTools(server, db);
    const result = await callTool(server, "get_policy_signals", { days: 30 });
    expect(result.content[0]?.type).toBe("text");
    expect(result.content[0]?.text).toBeTruthy();
  });

  it("classifies policy news and returns sector analysis", async () => {
    const server = makeServer();
    const db = makeTestDb();

    // Insert policy-related entry
    db.exec(`
      INSERT INTO rag_analyses (id, created_at, level, source_title, summary)
      VALUES ('test-001', datetime('now'), 'country', 'NHNN nới room tín dụng', 'Ngân hàng được nới room tín dụng thêm 2 điểm')
    `);

    registerPolicyTools(server, db);
    const result = await callTool(server, "get_policy_signals", { sector: "banking", days: 30 });
    expect(result.content[0]?.type).toBe("text");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// get_bond_maturity_calendar tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 245 — get_bond_maturity_calendar", () => {
  it("registers get_bond_maturity_calendar tool", () => {
    const server = makeServer();
    const db = makeTestDb();
    registerBondMaturityTools(server, db);
    const tools = getRegisteredTools(server);
    expect(tools["get_bond_maturity_calendar"]).toBeDefined();
  });

  it("returns calendar text with seed data", async () => {
    const server = makeServer();
    const db = makeTestDb();
    registerBondMaturityTools(server, db);
    const result = await callTool(server, "get_bond_maturity_calendar", { months: 24 });
    expect(result.content[0]?.type).toBe("text");
    expect(result.content[0]?.text).toBeTruthy();
  });

  it("accepts months parameter and returns content array", async () => {
    const server = makeServer();
    const db = makeTestDb();
    registerBondMaturityTools(server, db);
    const result = await callTool(server, "get_bond_maturity_calendar", { months: 3 });
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content.length).toBeGreaterThan(0);
  });
});
