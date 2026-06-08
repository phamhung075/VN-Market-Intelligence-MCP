Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1109 — log_agent_work + get_agent_work_log MCP tools
 *
 * Tests cover:
 *   - log_agent_work status='running' creates entry, returns id
 *   - log_agent_work status='completed' with id updates the entry
 *   - get_agent_work_log returns entries (most recent first)
 *   - get_agent_work_log with agent_name filter returns only matching rows
 *   - get_agent_work_log with empty DB returns empty list
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAgentWorkLogTools } from "../interface/mcp/tools/system/agentWorkLogTools.js";
import { logAgentWorkStart } from "../infrastructure/db/agentWorkLogStore.js";

// ─── In-memory DB helper ───────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_work_log (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_name   TEXT    NOT NULL,
      session_id   TEXT,
      started_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      finished_at  TEXT,
      summary      TEXT,
      findings     TEXT,
      actions_json TEXT,
      status       TEXT    NOT NULL DEFAULT 'running'
        CHECK(status IN ('running','completed','error'))
    );
  `);
  return db;
}

// ─── Tool call helper ─────────────────────────────────────────────────────

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
  return entry.handler(args) as Promise<{
    content: Array<{ type: string; text: string }>;
  }>;
}

/** Safely extract text from first content item (throws if missing). */
function firstText(result: { content: Array<{ type: string; text: string }> }): string {
  const item = result.content[0];
  if (!item) throw new Error("No content item in tool result");
  return item.text;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1109 — Agent Work Log MCP Tools", () => {
  let db: Database;
  let server: McpServer;

  beforeEach(() => {
    db = makeDb();
    server = new McpServer(
      { name: "test", version: "0.0.1" },
      { capabilities: { tools: {} } },
    );
    registerAgentWorkLogTools(server, db);
  });

  // ── log_agent_work — running ─────────────────────────────────────────────

  it("log_agent_work status=running creates entry and returns id", async () => {
    const result = await callTool(server, "log_agent_work", {
      agent_name: "unified-agent",
      status: "running",
    });

    expect(result.content).toHaveLength(1);
    const parsed = JSON.parse(firstText(result)) as { id: number };
    expect(typeof parsed.id).toBe("number");
    expect(parsed.id).toBeGreaterThan(0);

    // Row should be in DB
    const row = db
      .query<{ status: string; agent_name: string }, [number]>(
        "SELECT status, agent_name FROM agent_work_log WHERE id = ?",
      )
      .get(parsed.id);
    expect(row).not.toBeNull();
    expect(row!.status).toBe("running");
    expect(row!.agent_name).toBe("unified-agent");
  });

  it("log_agent_work status=running with session_id stores session_id", async () => {
    const result = await callTool(server, "log_agent_work", {
      agent_name: "code-janitor",
      session_id: "sess-abc123",
      status: "running",
    });
    const { id } = JSON.parse(firstText(result)) as { id: number };

    const row = db
      .query<{ session_id: string | null }, [number]>(
        "SELECT session_id FROM agent_work_log WHERE id = ?",
      )
      .get(id);
    expect(row).not.toBeNull();
    expect(row!.session_id).toBe("sess-abc123");
  });

  // ── log_agent_work — completed ──────────────────────────────────────────

  it("log_agent_work status=completed updates the row", async () => {
    // Insert a running row first
    const id = logAgentWorkStart(db, "alert-commander");

    const result = await callTool(server, "log_agent_work", {
      agent_name: "alert-commander",
      id,
      summary: "Sent 3 alerts",
      findings: "VCB momentum positive",
      actions: [{ type: "send_telegram", detail: "VCB alert" }],
      status: "completed",
    });

    expect(result.content).toHaveLength(1);
    const parsed = JSON.parse(firstText(result)) as { ok: boolean };
    expect(parsed.ok).toBe(true);

    const row = db
      .query<
        { status: string; summary: string | null; finished_at: string | null },
        [number]
      >("SELECT status, summary, finished_at FROM agent_work_log WHERE id = ?")
      .get(id);
    expect(row).not.toBeNull();
    expect(row!.status).toBe("completed");
    expect(row!.summary).toBe("Sent 3 alerts");
    expect(row!.finished_at).not.toBeNull();
  });

  it("log_agent_work status=error updates the row with error status", async () => {
    const id = logAgentWorkStart(db, "news-scout");

    await callTool(server, "log_agent_work", {
      agent_name: "news-scout",
      id,
      summary: "Crashed on fetch",
      status: "error",
    });

    const row = db
      .query<{ status: string }, [number]>(
        "SELECT status FROM agent_work_log WHERE id = ?",
      )
      .get(id);
    expect(row).not.toBeNull();
    expect(row!.status).toBe("error");
  });

  it("log_agent_work status=completed without id returns error text", async () => {
    const result = await callTool(server, "log_agent_work", {
      agent_name: "code-janitor",
      status: "completed",
      // no id provided
    });
    const text = firstText(result);
    // Should contain an error message mentioning id
    expect(text.toLowerCase()).toContain("id");
  });

  // ── get_agent_work_log — basic ──────────────────────────────────────────

  it("get_agent_work_log returns empty list when DB is empty", async () => {
    const result = await callTool(server, "get_agent_work_log", {});
    const parsed = JSON.parse(firstText(result)) as unknown[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(0);
  });

  it("get_agent_work_log returns entries (DESC order by id)", async () => {
    logAgentWorkStart(db, "agent-A");
    logAgentWorkStart(db, "agent-B");
    logAgentWorkStart(db, "agent-C");

    const result = await callTool(server, "get_agent_work_log", { limit: 10 });
    const entries = JSON.parse(firstText(result)) as Array<{
      agent_name: string;
      id: number;
    }>;
    expect(entries.length).toBe(3);
    // All three agents should be present
    const names = entries.map((e) => e.agent_name);
    expect(names).toContain("agent-A");
    expect(names).toContain("agent-B");
    expect(names).toContain("agent-C");
    // IDs should be in descending order (most recently inserted first)
    const ids = entries.map((e) => e.id);
    // ids[0], ids[1], ids[2] are all defined since entries.length === 3
    const id0 = ids[0] as number;
    const id1 = ids[1] as number;
    const id2 = ids[2] as number;
    expect(id0).toBeGreaterThan(id1);
    expect(id1).toBeGreaterThan(id2);
  });

  it("get_agent_work_log filters by agent_name", async () => {
    logAgentWorkStart(db, "unified-agent");
    logAgentWorkStart(db, "code-janitor");
    logAgentWorkStart(db, "unified-agent");

    const result = await callTool(server, "get_agent_work_log", {
      agent_name: "unified-agent",
      limit: 20,
    });
    const entries = JSON.parse(firstText(result)) as Array<{
      agent_name: string;
    }>;
    expect(entries.length).toBe(2);
    expect(entries.every((e) => e.agent_name === "unified-agent")).toBe(true);
  });

  it("get_agent_work_log respects limit parameter", async () => {
    for (let i = 0; i < 5; i++) logAgentWorkStart(db, "bulk-agent");

    const result = await callTool(server, "get_agent_work_log", { limit: 3 });
    const entries = JSON.parse(firstText(result)) as unknown[];
    expect(entries.length).toBe(3);
  });

  // ── Tool registration count ──────────────────────────────────────────────

  it("registers exactly 2 tools: log_agent_work and get_agent_work_log", () => {
    const freshServer = new McpServer(
      { name: "test", version: "0.0.1" },
      { capabilities: { tools: {} } },
    );
    registerAgentWorkLogTools(freshServer, db);
    const tools = (freshServer as unknown as {
      _registeredTools: Record<string, unknown>;
    })._registeredTools;
    const names = Object.keys(tools);
    expect(names).toContain("log_agent_work");
    expect(names).toContain("get_agent_work_log");
    expect(names).toHaveLength(2);
  });
});
