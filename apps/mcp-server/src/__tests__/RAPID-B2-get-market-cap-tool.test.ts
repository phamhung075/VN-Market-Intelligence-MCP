/**
 * FIX-B-2 — get_market_cap MCP Tool tests
 *
 * Tests cover:
 *   1. Happy path: code with market_cap_bn and close price → structured JSON
 *   2. Happy path: FPT with real-ish data → shares_outstanding_approx computed
 *   3. Missing market_cap_bn (null in DB) → honest null
 *   4. Zero market_cap_bn → shares_outstanding_approx null (safe-divide guard)
 *   5. Price unavailable (no daily_ohlcv row) → shares_outstanding_approx null
 *   6. Code not found → all nulls
 *   7. Zero close price → shares_outstanding_approx null (divide-by-zero guard)
 *   8. Replay: call tool twice on same data → same result
 *   9. Tool registered in MCP server and callable via MCP client
 *   10. Code is uppercased by tool
 *
 * Sandbox: :memory: SQLite — zero live credentials, zero API keys.
 * Replay: test 8 explicitly calls tool twice and asserts same JSON.
 *
 * DoD: G1–G6 LEAN (fence/sandbox/replay/red-green/tsc/honest-artifact)
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  queryMarketCap,
  registerMarketCapTools,
  type MarketCapResult,
} from "../interface/mcp/tools/market-data/marketCapTools.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface McpTextResult {
  isError?: boolean;
  content: Array<{ type: string; text: string }>;
}

/**
 * Create an in-memory DB with the minimal tables needed for market cap queries.
 */
function createTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS vnstock_trading_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      date TEXT NOT NULL DEFAULT '1970-01-01',
      market_cap_bn REAL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, date)
    );
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      date TEXT NOT NULL,
      close REAL NOT NULL,
      UNIQUE(code, date)
    );
  `);
  return db;
}

function seedStats(
  db: Database,
  code: string,
  marketCapBn: number | null,
  fetchedAt = "2026-06-04T08:00:00Z",
  date = "2026-06-04",
): void {
  db.prepare(
    `INSERT OR REPLACE INTO vnstock_trading_stats (code, date, market_cap_bn, fetched_at)
     VALUES (?, ?, ?, ?)`,
  ).run(code, date, marketCapBn, fetchedAt);
}

function seedPrice(db: Database, code: string, close: number, date = "2026-06-04"): void {
  db.prepare(
    `INSERT OR REPLACE INTO daily_ohlcv (code, date, close) VALUES (?, ?, ?)`,
  ).run(code, date, close);
}

async function buildConnectedPair(db: Database): Promise<Client> {
  const server = new McpServer({ name: "test", version: "0.0.1" });
  registerMarketCapTools(server, () => db);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: "test-client", version: "0.0.1" });
  await client.connect(clientTransport);
  return client;
}

// ─────────────────────────────────────────────────────────────────────────────
// queryMarketCap unit tests (pure logic, no MCP overhead)
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-B-2 — queryMarketCap (unit)", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  // Test 1: Happy path — market_cap + close price → computed shares
  it("returns structured result with computed shares_outstanding_approx", () => {
    // 248 billion VND market cap, close price 80,000 VND
    // shares_approx = 248e9 / 80_000 = 3_100_000_000
    seedStats(db, "VNM", 248);
    seedPrice(db, "VNM", 80_000);

    const result = queryMarketCap(db, "VNM");

    expect(result.code).toBe("VNM");
    expect(result.market_cap_billion).toBe(248);
    expect(result.shares_outstanding_approx).toBe(3_100_000);
    expect(result.fetched_at).toBe("2026-06-04T08:00:00Z");
  });

  // Test 2: FPT-like data — realistic values
  it("FPT: computes shares_outstanding_approx from realistic market cap + price", () => {
    // FPT approx: market_cap ~165_000 billion VND, close ~100_000 VND
    // shares_approx = 165_000e9 / 100_000 = 1_650_000_000
    seedStats(db, "FPT", 165_000);
    seedPrice(db, "FPT", 100_000);

    const result = queryMarketCap(db, "FPT");

    expect(result.code).toBe("FPT");
    expect(result.market_cap_billion).toBe(165_000);
    expect(result.shares_outstanding_approx).not.toBeNull();
    // Allow reasonable floating-point tolerance
    expect(result.shares_outstanding_approx).toBeGreaterThan(1_000_000_000);
  });

  // Test 3: Missing market_cap_bn (null in DB) → honest null
  it("returns null market_cap_billion when DB field is null", () => {
    seedStats(db, "VCB", null);
    seedPrice(db, "VCB", 90_000);

    const result = queryMarketCap(db, "VCB");

    expect(result.market_cap_billion).toBeNull();
    expect(result.shares_outstanding_approx).toBeNull(); // no cap → no shares
  });

  // Test 4: Zero market_cap_bn → shares_outstanding_approx null (safe-divide guard)
  it("returns null shares_outstanding_approx when market_cap_billion is 0", () => {
    seedStats(db, "ZERO", 0);
    seedPrice(db, "ZERO", 80_000);

    const result = queryMarketCap(db, "ZERO");

    expect(result.market_cap_billion).toBe(0);
    expect(result.shares_outstanding_approx).toBeNull(); // 0 cap → null shares (guard fires on !> 0)
  });

  // Test 5: Price unavailable → shares_outstanding_approx null (honest sparse-data)
  it("returns null shares_outstanding_approx when no close price in daily_ohlcv", () => {
    seedStats(db, "MWG", 100_000);
    // No price seeded for MWG

    const result = queryMarketCap(db, "MWG");

    expect(result.market_cap_billion).toBe(100_000);
    expect(result.shares_outstanding_approx).toBeNull();
  });

  // Test 6: Code not found → all nulls
  it("returns all nulls when code not in DB", () => {
    const result = queryMarketCap(db, "UNKNOWN");

    expect(result.code).toBe("UNKNOWN");
    expect(result.market_cap_billion).toBeNull();
    expect(result.shares_outstanding_approx).toBeNull();
    expect(result.fetched_at).toBeNull();
  });

  // Test 7: Zero close price → shares_outstanding_approx null (divide-by-zero guard)
  it("returns null shares_outstanding_approx when close price is 0 (divide-by-zero guard)", () => {
    seedStats(db, "BADPRICE", 50_000);
    seedPrice(db, "BADPRICE", 0);

    const result = queryMarketCap(db, "BADPRICE");

    expect(result.market_cap_billion).toBe(50_000);
    expect(result.shares_outstanding_approx).toBeNull(); // 0 price → null (close > 0 guard)
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// get_market_cap MCP tool tests (via InMemory transport)
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-B-2 — get_market_cap MCP tool", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  // Test 8: Replay — call tool twice → same JSON result
  it("replay: calling get_market_cap twice on same data returns identical JSON", async () => {
    seedStats(db, "VNM", 248);
    seedPrice(db, "VNM", 80_000);

    const client = await buildConnectedPair(db);

    const r1 = await client.callTool({
      name: "get_market_cap",
      arguments: { code: "VNM" },
    }) as McpTextResult;

    const r2 = await client.callTool({
      name: "get_market_cap",
      arguments: { code: "VNM" },
    }) as McpTextResult;

    expect(r1.content[0]!.text).toBe(r2.content[0]!.text);
  });

  // Test 9: Tool registered + callable via MCP client
  it("tool is registered and returns valid JSON via MCP client", async () => {
    seedStats(db, "FPT", 165_000);
    seedPrice(db, "FPT", 100_000);

    const client = await buildConnectedPair(db);
    const result = await client.callTool({
      name: "get_market_cap",
      arguments: { code: "FPT" },
    }) as McpTextResult;

    expect(result.isError).not.toBe(true);
    const parsed = JSON.parse(result.content[0]!.text) as MarketCapResult;
    expect(parsed.code).toBe("FPT");
    expect(parsed.market_cap_billion).toBe(165_000);
    expect(parsed.shares_outstanding_approx).not.toBeNull();
  });

  // Test 10: Code is uppercased by tool
  it("tool uppercases lowercase code input", async () => {
    seedStats(db, "VNM", 248);

    const client = await buildConnectedPair(db);
    const result = await client.callTool({
      name: "get_market_cap",
      arguments: { code: "vnm" },
    }) as McpTextResult;

    const parsed = JSON.parse(result.content[0]!.text) as MarketCapResult;
    expect(parsed.code).toBe("VNM");
    expect(parsed.market_cap_billion).toBe(248);
  });
});
