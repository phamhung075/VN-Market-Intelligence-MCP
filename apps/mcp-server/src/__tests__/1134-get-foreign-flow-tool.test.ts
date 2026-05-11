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
import { registerForeignFlowTools } from "../interface/mcp/tools/market-data/foreignFlowTools.js";

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

  // Minimal schema — daily_ohlcv is the foreign flow source since sprint 1517b
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code             TEXT NOT NULL,
      date             TEXT NOT NULL,
      open             REAL,
      high             REAL,
      low              REAL,
      close            REAL,
      volume           REAL,
      foreign_buy_vol  REAL,
      foreign_sell_vol REAL,
      foreign_net_vol  REAL,
      put_through_vol  REAL,
      PRIMARY KEY (code, date)
    );
  `);

  return db;
}

/**
 * Insert N days of per-day net_vol data for a stock into daily_ohlcv.
 * Each row foreign_net_vol = 150_000 → cumsum ascending → deltas +150k → HIGH signal.
 */
function seedHighBuySignal(db: Database, code: string, days: number): void {
  const netVolPerDay = 150_000; // each row = one day's net flow → sum > HIGH threshold
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    const dateStr = d.toISOString().slice(0, 10);
    db.prepare(
      `INSERT OR IGNORE INTO daily_ohlcv (code, date, foreign_net_vol) VALUES (?, ?, ?)`,
    ).run(code, dateStr, netVolPerDay);
  }
}

/**
 * Insert N days of zero foreign_net_vol data into daily_ohlcv.
 */
function seedZeroVolume(db: Database, code: string, days: number): void {
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    const dateStr = d.toISOString().slice(0, 10);
    db.prepare(
      `INSERT OR IGNORE INTO daily_ohlcv (code, date, foreign_net_vol) VALUES (?, ?, ?)`,
    ).run(code, dateStr, 0);
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
    // Insert only 1 row — insufficient for delta calc (needs >= 2)
    db.prepare(
      `INSERT OR IGNORE INTO daily_ohlcv (code, date, foreign_net_vol) VALUES (?, ?, ?)`,
    ).run("TCB", "2026-04-10", 500_000);

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
