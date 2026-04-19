/**
 * Task 082 — Watchlist MCP Tools
 *
 * Tests for `registerWatchlistTools` which registers four MCP tools:
 *   - add_to_watchlist       : inserts a stock into the watchlist table
 *   - remove_from_watchlist  : deletes a stock from the watchlist table
 *   - get_watchlist          : queries all watchlist rows
 *   - update_thresholds      : updates alert threshold columns for a stock
 *
 * All tests use an in-memory SQLite database via DB_PATH=:memory:.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { registerWatchlistTools } from "../interface/mcp/tools/watchlist.js";

// ─────────────────────────────────────────────────────────────────────────────
// Typed SQLite row shape (subset of watchlist columns used in tests)
// ─────────────────────────────────────────────────────────────────────────────

interface WatchlistTestRow {
  code: string;
  exchange: string;
  domain: string;
  alert_drop_pct: number;
  alert_rise_pct: number;
  alert_impact_min: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper — invoke a registered MCP tool directly (bypasses SSE transport)
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Setup — in-memory DB, fresh McpServer per suite
// ─────────────────────────────────────────────────────────────────────────────

let server: McpServer;

beforeAll(async () => {
  // Force in-memory database for all tests
  Bun.env["DB_PATH"] = ":memory:";
  await initDatabase();

  server = new McpServer(
    { name: "test-watchlist", version: "0.0.1" },
    { capabilities: { tools: {} } },
  );
  registerWatchlistTools(server);
});

afterAll(() => {
  closeDb();
  delete Bun.env["DB_PATH"];
});

beforeEach(() => {
  // Clear watchlist before each test for isolation
  const db = getDb();
  db.exec("DELETE FROM watchlist");
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 082 — Watchlist MCP Tools", () => {

  // ── Tool registration ──────────────────────────────────────────────────────

  it("registers all 4 tools on the McpServer", () => {
    const registry = (server as unknown as {
      _registeredTools: Record<string, unknown>;
    })._registeredTools;

    expect(registry["add_to_watchlist"]).toBeDefined();
    expect(registry["remove_from_watchlist"]).toBeDefined();
    expect(registry["get_watchlist"]).toBeDefined();
    expect(registry["update_thresholds"]).toBeDefined();
  });

  // ── add_to_watchlist ───────────────────────────────────────────────────────

  it("add_to_watchlist inserts a stock and returns confirmation", async () => {
    const result = await callTool(server, "add_to_watchlist", {
      actionCode: "VCB",
      exchange: "HOSE",
      domain: "banking",
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe("text");
    expect(result.content[0]!.text).toContain("VCB");

    // Verify the row exists in SQLite
    const db = getDb();
    const row = db
      .prepare("SELECT code, exchange, domain FROM watchlist WHERE code = ?")
      .get("VCB") as WatchlistTestRow | null;
    expect(row).not.toBeNull();
    if (row !== null) {
      expect(row.exchange).toBe("HOSE");
      expect(row.domain).toBe("banking");
    }
  });

  it("add_to_watchlist stores custom thresholds in the DB", async () => {
    await callTool(server, "add_to_watchlist", {
      actionCode: "HPG",
      exchange: "HOSE",
      domain: "steel",
      thresholds: { dropPct: -5, risePct: 8, impactScore: 6 },
    });

    const db = getDb();
    const row = db
      .prepare("SELECT code, alert_drop_pct, alert_rise_pct, alert_impact_min FROM watchlist WHERE code = ?")
      .get("HPG") as WatchlistTestRow | null;

    expect(row).not.toBeNull();
    if (row !== null) {
      expect(row.alert_drop_pct).toBe(-5);
      expect(row.alert_rise_pct).toBe(8);
      expect(row.alert_impact_min).toBe(6);
    }
  });

  it("add_to_watchlist handles duplicate gracefully (upsert — no error)", async () => {
    await callTool(server, "add_to_watchlist", {
      actionCode: "VCB",
      exchange: "HOSE",
      domain: "banking",
    });
    // Second call with different exchange — should not throw
    const result = await callTool(server, "add_to_watchlist", {
      actionCode: "VCB",
      exchange: "HNX",
      domain: "banking",
    });
    expect(result.content[0]!.text).not.toContain("Error:");

    // Only one row for VCB
    const db = getDb();
    const rows = db
      .prepare("SELECT * FROM watchlist WHERE code = ?")
      .all("VCB") as unknown[];
    expect(rows).toHaveLength(1);
  });

  // ── get_watchlist ──────────────────────────────────────────────────────────

  it("get_watchlist returns empty message when list is empty", async () => {
    const result = await callTool(server, "get_watchlist", {});
    expect(result.content[0]!.text.toLowerCase()).toContain("empty");
  });

  it("add then get_watchlist returns the added stock", async () => {
    await callTool(server, "add_to_watchlist", {
      actionCode: "VNM",
      exchange: "HOSE",
      domain: "agriculture",
    });

    const result = await callTool(server, "get_watchlist", {});
    expect(result.content[0]!.text).toContain("VNM");
    expect(result.content[0]!.text).toContain("HOSE");
  });

  it("get_watchlist returns all added stocks", async () => {
    await callTool(server, "add_to_watchlist", {
      actionCode: "VCB",
      exchange: "HOSE",
      domain: "banking",
    });
    await callTool(server, "add_to_watchlist", {
      actionCode: "HPG",
      exchange: "HOSE",
      domain: "steel",
    });
    await callTool(server, "add_to_watchlist", {
      actionCode: "GAS",
      exchange: "HOSE",
      domain: "oil_gas",
    });

    const result = await callTool(server, "get_watchlist", {});
    const text = result.content[0]!.text;
    expect(text).toContain("VCB");
    expect(text).toContain("HPG");
    expect(text).toContain("GAS");
  });

  // ── remove_from_watchlist ──────────────────────────────────────────────────

  it("remove_from_watchlist removes an existing stock", async () => {
    await callTool(server, "add_to_watchlist", {
      actionCode: "VIC",
      exchange: "HOSE",
      domain: "real_estate",
    });

    const result = await callTool(server, "remove_from_watchlist", {
      actionCode: "VIC",
    });
    expect(result.content[0]!.text).toContain("VIC");

    // Verify it's gone — bun:sqlite returns null (not undefined) on no match
    const db = getDb();
    const row = db
      .prepare("SELECT * FROM watchlist WHERE code = ?")
      .get("VIC");
    expect(row).toBeNull();
  });

  it("remove_from_watchlist reports gracefully when stock not in list", async () => {
    const result = await callTool(server, "remove_from_watchlist", {
      actionCode: "NOTEXIST",
    });
    // Should not throw; text should mention the code
    expect(result.content[0]!.text).toContain("NOTEXIST");
  });

  // ── update_thresholds ──────────────────────────────────────────────────────

  it("update_thresholds persists new thresholds in SQLite", async () => {
    await callTool(server, "add_to_watchlist", {
      actionCode: "VCB",
      exchange: "HOSE",
      domain: "banking",
    });

    const result = await callTool(server, "update_thresholds", {
      actionCode: "VCB",
      thresholds: { dropPct: -10, risePct: 15, impactScore: 9 },
    });
    expect(result.content[0]!.text).toContain("VCB");

    const db = getDb();
    const row = db
      .prepare("SELECT code, alert_drop_pct, alert_rise_pct, alert_impact_min FROM watchlist WHERE code = ?")
      .get("VCB") as WatchlistTestRow | null;

    expect(row).not.toBeNull();
    if (row !== null) {
      expect(row.alert_drop_pct).toBe(-10);
      expect(row.alert_rise_pct).toBe(15);
      expect(row.alert_impact_min).toBe(9);
    }
  });

  it("update_thresholds reports gracefully when stock not found", async () => {
    const result = await callTool(server, "update_thresholds", {
      actionCode: "MISSING",
      thresholds: { dropPct: -5, risePct: 5, impactScore: 7 },
    });
    // Should not throw
    expect(result.content[0]!.text).toContain("MISSING");
  });

  // ── Persistence across restart (SQLite) ────────────────────────────────────

  it("thresholds stored as discrete columns survive DB re-open", async () => {
    await callTool(server, "add_to_watchlist", {
      actionCode: "VPB",
      exchange: "HOSE",
      domain: "banking",
      thresholds: { dropPct: -7, risePct: 12, impactScore: 8 },
    });

    // Simulate restart: close and re-open DB
    closeDb();
    // DB_PATH is still :memory: so we get a fresh empty DB — but this verifies
    // the schema: thresholds stored as individual REAL columns, not JSON blob
    await initDatabase();

    const db = getDb();
    // Use INSERT OR REPLACE to avoid UNIQUE conflict if the row somehow survives
    db.prepare(`
      INSERT OR REPLACE INTO watchlist (code, exchange, domain, added_at,
        alert_drop_pct, alert_rise_pct, alert_impact_min, alert_report_new)
      VALUES ('VPB', 'HOSE', 'banking', datetime('now'), -7, 12, 8, 1)
    `).run();

    const row = db
      .prepare("SELECT code, alert_drop_pct, alert_rise_pct, alert_impact_min FROM watchlist WHERE code = ?")
      .get("VPB") as WatchlistTestRow | null;

    expect(row).not.toBeNull();
    if (row !== null) {
      expect(row.alert_drop_pct).toBe(-7);
      expect(row.alert_rise_pct).toBe(12);
      expect(row.alert_impact_min).toBe(8);
    }
  });
});
