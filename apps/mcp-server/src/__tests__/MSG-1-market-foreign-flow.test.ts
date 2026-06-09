/**
 * MSG-1 — get_market_foreign_flow MCP Tool Tests
 *
 * Tests for market-wide foreign investor flow aggregation.
 * Uses in-memory SQLite with daily_ohlcv data.
 *
 * AC-1: Happy path — sums buy/sell/net across tickers for latest session
 * AC-2: top_n param returns correct ranked lists
 * AC-3: Empty data → no-data message (not an error)
 * AC-4: days param returns multiple sessions
 * AC-5: Partial data (some tickers have NULL foreign_net_vol) — NULLs excluded
 *
 * Harness: _registeredTools direct-handler invocation (CI-safe; no InMemoryTransport).
 * REWRITE rationale: InMemoryTransport+Client.callTool() stalls on Bun 1.3.13/Ubuntu CI
 * (TRANSPORT-HANG fingerprint ~5000ms); direct handler invocation removes the message
 * loop entirely — CI-safe, order-independent.
 * Template: 1134-get-foreign-flow-tool.test.ts (proven CI-green 4×).
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Database } from "bun:sqlite";
import {
  registerMarketWideForeignFlowTool,
  queryMarketWideForeignFlow,
  queryTopFlowTickers,
} from "../interface/mcp/tools/market-data/marketWideForeignFlowTool.js";

// ─────────────────────────────────────────────────────────────────────────────
// MCP callTool returns unknown — use this helper to extract content safely
// ─────────────────────────────────────────────────────────────────────────────

interface McpTextResult {
  isError?: boolean;
  content: Array<{ type: string; text: string }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test server type — exposes _registeredTools for direct handler invocation
// NOTE: Cannot use intersection type (McpServer & { _registeredTools: ... })
// because _registeredTools is private in McpServer; tsc reduces intersection
// to never. Use (server as unknown as RegisteredToolsServer) at call site.
// ─────────────────────────────────────────────────────────────────────────────

type RegisteredToolsServer = {
  _registeredTools: Record<string, {
    handler: (args: Record<string, unknown>) => Promise<McpTextResult>;
  }>;
};

// ---------------------------------------------------------------------------
// Module-level fixtures (set in beforeEach, torn down in afterEach)
// ---------------------------------------------------------------------------

let _testDb: Database;
let _testServer: McpServer;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code             TEXT NOT NULL,
      date             TEXT NOT NULL,
      open             REAL,
      high             REAL,
      low              REAL,
      close            REAL NOT NULL DEFAULT 0,
      volume           REAL,
      updated_at       TEXT NOT NULL DEFAULT '',
      foreign_buy_vol  REAL,
      foreign_sell_vol REAL,
      foreign_net_vol  REAL,
      put_through_vol  REAL,
      PRIMARY KEY (code, date)
    )
  `);
  return db;
}

function insert(
  db: Database,
  code: string,
  date: string,
  buyVol: number | null,
  sellVol: number | null,
  netVol: number | null,
): void {
  db.prepare(
    `INSERT OR REPLACE INTO daily_ohlcv
       (code, date, close, foreign_buy_vol, foreign_sell_vol, foreign_net_vol)
     VALUES (?, ?, 0, ?, ?, ?)`,
  ).run(code, date, buyVol, sellVol, netVol);
}

/** Call the get_market_foreign_flow tool directly via _registeredTools */
async function callTool(
  args: Record<string, unknown>,
): Promise<string> {
  const tool = (_testServer as unknown as RegisteredToolsServer)._registeredTools["get_market_foreign_flow"];
  if (!tool) throw new Error("Tool not registered: get_market_foreign_flow");
  const result = await tool.handler(args);
  return result.content[0]?.text ?? "";
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  _testDb = buildDb();
  _testServer = new McpServer({ name: "test", version: "0.0.0" });
  registerMarketWideForeignFlowTool(_testServer, _testDb);
});

afterEach(() => {
  _testDb.close();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MSG-1 — get_market_foreign_flow tool", () => {
  // ── AC-1: Happy path ─────────────────────────────────────────────────────
  it("AC-1: aggregates buy/sell/net across tickers for latest session", async () => {
    insert(_testDb, "VCB", "2026-06-01", 500_000, 200_000, 300_000);
    insert(_testDb, "ACB", "2026-06-01", 300_000, 400_000, -100_000);
    insert(_testDb, "TCB", "2026-06-01", 100_000, 50_000, 50_000);

    const text = await callTool({ days: 1 });
    const parsed = JSON.parse(text);

    expect(parsed.source_tier).toBe(2);
    expect(parsed.text).toContain("2026-06-01");
    // Total buy = 900_000 → "900.0k"
    expect(parsed.text).toContain("900.0k");
    // Total net = 300_000 - 100_000 + 50_000 = 250_000 → +250.0k
    expect(parsed.text).toContain("+250.0k");
    expect(parsed.text).toContain("NET BUY");
  });

  // ── AC-2: top_n returns ranked tickers ───────────────────────────────────
  it("AC-2: top_n returns correct net-buyer and net-seller rankings", async () => {
    insert(_testDb, "VCB", "2026-06-01", 500_000, 100_000, 400_000);
    insert(_testDb, "ACB", "2026-06-01", 100_000, 600_000, -500_000);
    insert(_testDb, "FPT", "2026-06-01", 200_000, 50_000, 150_000);

    const text = await callTool({ days: 1, top_n: 3 });
    const parsed = JSON.parse(text);

    // Top buyer should be VCB (+400k)
    expect(parsed.text).toContain("VCB");
    // Top seller should be ACB (-500k)
    expect(parsed.text).toContain("ACB");
    expect(parsed.text).toContain("Net Buyers");
    expect(parsed.text).toContain("Net Sellers");
  });

  // ── AC-3: Empty data → no-data message ───────────────────────────────────
  it("AC-3: returns no-data message when daily_ohlcv has no foreign flow data", async () => {
    // Only OHLCV rows with NULL foreign_net_vol
    _testDb.prepare(
      `INSERT INTO daily_ohlcv (code, date, close) VALUES (?, ?, ?)`,
    ).run("VNM", "2026-06-01", 100000);

    const text = await callTool({});
    const parsed = JSON.parse(text);

    expect(parsed.source_tier).toBe(2);
    expect(parsed.note).toBeDefined();
    expect(parsed.note.toLowerCase()).toContain("no foreign flow data");
    expect(parsed.text).toBeUndefined();
  });

  // ── AC-4: days param returns multiple sessions ────────────────────────────
  it("AC-4: days=3 returns aggregates for 3 trading dates", async () => {
    insert(_testDb, "VCB", "2026-05-30", 100_000, 50_000, 50_000);
    insert(_testDb, "VCB", "2026-05-31", 200_000, 80_000, 120_000);
    insert(_testDb, "VCB", "2026-06-01", 300_000, 100_000, 200_000);

    const text = await callTool({ days: 3 });
    const parsed = JSON.parse(text);

    expect(parsed.sessions_returned).toBe(3);
    expect(parsed.text).toContain("2026-06-01");
    expect(parsed.text).toContain("2026-05-31");
    expect(parsed.text).toContain("2026-05-30");
  });

  // ── AC-5: NULL foreign_net_vol rows excluded from aggregate ───────────────
  it("AC-5: rows with NULL foreign_net_vol are excluded from aggregation", async () => {
    insert(_testDb, "VCB", "2026-06-01", 500_000, 200_000, 300_000);
    // Row without foreign flow data (NULL)
    _testDb.prepare(
      `INSERT INTO daily_ohlcv (code, date, close) VALUES (?, ?, ?)`,
    ).run("VNM", "2026-06-01", 50000);

    const text = await callTool({ days: 1 });
    const parsed = JSON.parse(text);

    // Only 1 ticker should be counted (VNM excluded due to NULL foreign_net_vol)
    expect(parsed.text).toContain("1 tickers");
  });

  // ── Unit tests for query helpers ──────────────────────────────────────────

  it("queryMarketWideForeignFlow returns correct aggregates", () => {
    insert(_testDb, "VCB", "2026-06-01", 500_000, 200_000, 300_000);
    insert(_testDb, "ACB", "2026-06-01", 300_000, 400_000, -100_000);

    const rows = queryMarketWideForeignFlow(_testDb, 1);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.date).toBe("2026-06-01");
    expect(rows[0]!.total_buy).toBe(800_000);
    expect(rows[0]!.total_sell).toBe(600_000);
    expect(rows[0]!.total_net).toBe(200_000);
    expect(rows[0]!.ticker_count).toBe(2);
  });

  it("queryTopFlowTickers returns top buyers and sellers correctly", () => {
    insert(_testDb, "VCB", "2026-06-01", 500_000, 100_000, 400_000);
    insert(_testDb, "ACB", "2026-06-01", 100_000, 600_000, -500_000);
    insert(_testDb, "FPT", "2026-06-01", 200_000, 50_000, 150_000);

    const { topBuyers, topSellers } = queryTopFlowTickers(_testDb, "2026-06-01", 2);

    expect(topBuyers[0]!.code).toBe("VCB");
    expect(topBuyers[0]!.foreign_net_vol).toBe(400_000);
    expect(topSellers[0]!.code).toBe("ACB");
    expect(topSellers[0]!.foreign_net_vol).toBe(-500_000);
  });

  it("queryMarketWideForeignFlow returns empty array when no data", () => {
    const rows = queryMarketWideForeignFlow(_testDb, 5);
    expect(rows).toHaveLength(0);
  });
});
