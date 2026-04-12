/**
 * Task 1134 — get_foreign_flow MCP Tool
 *
 * Tests for the foreignFlowTools registration function.
 * Uses an in-memory SQLite database with the vnstock_trading_stats table
 * to exercise the tool end-to-end without touching the filesystem.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Database } from "bun:sqlite";
import { registerForeignFlowTools } from "../interface/mcp/tools/foreignFlowTools.js";

// MCP callTool returns unknown — use this helper to extract text safely
interface McpTextResult {
  isError?: boolean;
  content: Array<{ type: string; text: string }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildInMemoryDb(): Database {
  const db = new Database(":memory:");

  // Minimal schema — only the columns getForeignFlowHistory uses
  db.exec(`
    CREATE TABLE IF NOT EXISTS vnstock_trading_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      foreign_volume INTEGER NOT NULL DEFAULT 0,
      foreign_room INTEGER NOT NULL DEFAULT 0,
      current_holding_ratio REAL NOT NULL DEFAULT 0
    );
  `);

  return db;
}

/**
 * Insert N days of ascending foreign_volume data for a stock.
 * Each row is 1 day apart (today going backwards).
 * foreignVolume increases by `dailyBuy` each day so that all deltas are positive (net_buy).
 */
function seedHighBuySignal(db: Database, code: string, days: number): void {
  // days of data — most recent inserted last so ORDER BY fetched_at DESC gives [today, ..., oldest]
  const base = 1_000_000; // starting cumulative volume
  const dailyBuy = 50_000;  // daily delta (+50k each day → 3d net = 150k > HIGH_VOLUME_THRESHOLD 100k)

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86_400_000);
    const dateStr = date.toISOString().slice(0, 19).replace("T", " ");
    const volume = base + (days - 1 - i) * dailyBuy;
    db.prepare(
      `INSERT INTO vnstock_trading_stats (code, fetched_at, foreign_volume, foreign_room, current_holding_ratio)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(code, dateStr, volume, 5_000_000, 0.28 + (days - 1 - i) * 0.002);
  }
}

/**
 * Insert N days of zero foreign_volume data.
 */
function seedZeroVolume(db: Database, code: string, days: number): void {
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86_400_000);
    const dateStr = date.toISOString().slice(0, 19).replace("T", " ");
    db.prepare(
      `INSERT INTO vnstock_trading_stats (code, fetched_at, foreign_volume, foreign_room, current_holding_ratio)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(code, dateStr, 0, 0, 0);
  }
}

/**
 * Create a connected MCP client/server pair for the foreign flow tool.
 */
async function buildConnectedPair(db: Database): Promise<Client> {
  const server = new McpServer({ name: "test", version: "0.0.1" });
  registerForeignFlowTools(server, db);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: "test-client", version: "0.0.1" });
  await client.connect(clientTransport);
  return client;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Task 1134 — get_foreign_flow MCP tool", () => {
  let db: Database;

  beforeEach(() => {
    db = buildInMemoryDb();
  });

  // ── AC-1: HIGH buy signal with 5 rows ──────────────────────────────────────
  it("returns formatted analysis with net_buy signal for 5 days of buying data", async () => {
    seedHighBuySignal(db, "VNM", 6); // 6 rows → 5 deltas, 3+ consecutive buy days
    const client = await buildConnectedPair(db);

    const result = await client.callTool({ name: "get_foreign_flow", arguments: { code: "VNM", days: 5 } }) as McpTextResult;
    const text = result.content[0]!.text;

    expect(text).toContain("Direction: net_buy");
    expect(text).toContain("Severity: HIGH");
    // Consecutive days >= 3 (all 4 deltas from 5 rows are positive)
    expect(text).toMatch(/Consecutive days: \d+/);
    expect(text).toContain("Daily history");
    // Should have some table rows for history
    expect(text).toContain("VNM");
  });

  // ── AC-2: insufficient data (< 2 rows) ────────────────────────────────────
  it("returns insufficient data message when fewer than 2 rows exist", async () => {
    // Insert only 1 row
    db.prepare(
      `INSERT INTO vnstock_trading_stats (code, fetched_at, foreign_volume, foreign_room, current_holding_ratio)
       VALUES (?, ?, ?, ?, ?)`,
    ).run("TCB", "2026-04-10 10:00:00", 500_000, 2_000_000, 0.15);

    const client = await buildConnectedPair(db);

    const result = await client.callTool({ name: "get_foreign_flow", arguments: { code: "TCB", days: 10 } }) as McpTextResult;
    const text = result.content[0]!.text;

    expect(text.toLowerCase()).toContain("insufficient foreign flow data");
  });

  // ── AC-3: zero-detection guard ─────────────────────────────────────────────
  it("returns no-data message without calling analyzeForeignFlow when all volumes are 0", async () => {
    seedZeroVolume(db, "HPG", 5);
    const client = await buildConnectedPair(db);

    const result = await client.callTool({ name: "get_foreign_flow", arguments: { code: "HPG", days: 5 } }) as McpTextResult;
    const text = result.content[0]!.text;

    // Must contain "no data available" (case-insensitive check)
    expect(text.toLowerCase()).toContain("no data available");
    // Must NOT contain analysis fields that would only appear if analyzeForeignFlow ran
    expect(text).not.toContain("Direction:");
    expect(text).not.toContain("Severity:");
  });

  // ── AC-4: days=35 exceeds Zod max(30) → validation error ──────────────────
  // MCP SDK returns a resolved response with isError=true for schema validation failures
  // (error code -32602 InvalidParams). It does NOT reject the promise.
  it("returns isError=true for days=35 (exceeds max of 30)", async () => {
    const client = await buildConnectedPair(db);

    const result = await client.callTool({ name: "get_foreign_flow", arguments: { code: "VNM", days: 35 } }) as McpTextResult;
    // The SDK resolves with { isError: true, content: [{ text: "MCP error -32602: ..." }] }
    expect(result.isError).toBe(true);
    const text = result.content[0]!.text;
    expect(text).toContain("-32602");
  });

  // ── AC-5: no data for unknown ticker ──────────────────────────────────────
  it("returns no-data message for unknown ticker with no rows", async () => {
    const client = await buildConnectedPair(db);

    const result = await client.callTool({ name: "get_foreign_flow", arguments: { code: "UNKNOWN", days: 10 } }) as McpTextResult;
    const text = result.content[0]!.text;

    expect(text.toLowerCase()).toContain("no data available");
  });

  // ── AC-6: default days=10 works without explicit parameter ────────────────
  it("uses default days=10 when not specified", async () => {
    seedHighBuySignal(db, "VCB", 12); // 12 rows available
    const client = await buildConnectedPair(db);

    const result = await client.callTool({ name: "get_foreign_flow", arguments: { code: "VCB" } }) as McpTextResult;
    const text = result.content[0]!.text;

    // Should return analysis (not a no-data message) since we have data
    expect(text).toContain("Direction:");
    expect(text).toContain("Daily history");
  });
});
