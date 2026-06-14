/**
 * ALLZERO-OHLCV-FETCH — test suite
 *
 * Acceptance criteria:
 *   AC-1: get_price_history excludes all-zero OHLCV rows (close=0) from results.
 *   AC-2: get_price_history stats.Min reflects actual close range, never 0.
 *   AC-3: ohlcvForeignFlowStore stub rows (open/high/low/close=0) do NOT appear
 *         in get_price_history output even if they exist in daily_ohlcv.
 *   AC-4: normalizeResidualContam() restores VCB-like thousand-VND rows to full-VND
 *         (e.g. close=62.2 → 62200) generically across all tickers with close < 100.
 *   AC-5: get_price_history after backfill of a previously all-zero date returns
 *         real data for that date (not "no data" and not zero).
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPriceHistoryTools } from "../interface/mcp/tools/market-data/priceHistoryTools.js";
import { normalizeResidualContam } from "../scheduler/market-data/allzeroOhlcvBackfill.js";

// ─── DB helpers ───────────────────────────────────────────────────────────────

function buildDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code       TEXT NOT NULL,
      date       TEXT NOT NULL,
      open       REAL NOT NULL DEFAULT 0,
      high       REAL NOT NULL DEFAULT 0,
      low        REAL NOT NULL DEFAULT 0,
      close      REAL NOT NULL DEFAULT 0,
      volume     REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT '',
      foreign_buy_vol  REAL,
      foreign_sell_vol REAL,
      foreign_net_vol  REAL,
      put_through_vol  REAL,
      PRIMARY KEY (code, date)
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY,
      exchange TEXT NOT NULL DEFAULT 'HOSE'
    )
  `);
  return db;
}

async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const tools = (server as unknown as {
    _registeredTools: Record<string, {
      callback?: (args: Record<string, unknown>) => Promise<unknown>;
      handler?: (args: Record<string, unknown>) => Promise<unknown>;
    }>;
  })._registeredTools;
  const tool = tools[toolName];
  if (!tool) throw new Error(`Tool not registered: ${toolName}`);
  const fn = tool.callback ?? tool.handler;
  if (!fn) throw new Error(`No callable found for: ${toolName}`);
  return fn(args) as Promise<{ content: Array<{ type: string; text: string }> }>;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ALLZERO-OHLCV-FETCH — zero-row guard in get_price_history", () => {
  // AC-1: all-zero row excluded from results
  it("AC-1: zero OHLCV row (0/0/0/0) is excluded from get_price_history results", async () => {
    const db = buildDb();
    // Insert one real row and one all-zero row (e.g. 2026-05-30 gap)
    db.run(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES ('SHB', '2026-06-12', 13800, 13850, 13513, 13800, 1000000, datetime('now'))`,
    );
    db.run(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES ('SHB', '2026-05-30', 0, 0, 0, 0, 0, datetime('now'))`,
    );

    const server = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );
    registerPriceHistoryTools(server, db);

    const result = await callTool(server, "get_price_history", {
      code: "SHB",
      days: 60,
    });

    const text = result.content[0]!.text;
    // The real close 13,800 must appear
    expect(text).toContain("13,800");
    // The zero-date 2026-05-30 must NOT appear in output
    expect(text).not.toContain("2026-05-30");
    // "0" as price (from the zero row) must not appear in the stats line
    // Min should be 13,800 not 0
    expect(text).toContain("Min 13,800");
  });

  // AC-2: Min stat reflects real price, not 0
  it("AC-2: stats Min is within the real price band when zero rows exist", async () => {
    const db = buildDb();
    // Insert 3 real rows and one zero row
    const realRows = [
      { date: "2026-06-12", close: 73500, open: 73100, high: 74300, low: 72369 },
      { date: "2026-06-11", close: 73100, open: 73100, high: 73900, low: 72369 },
      { date: "2026-06-10", close: 74200, open: 73700, high: 74500, low: 72800 },
    ];
    const ins = db.prepare(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES ('FPT', ?, ?, ?, ?, ?, 2000000, datetime('now'))`,
    );
    for (const r of realRows) {
      ins.run(r.date, r.open, r.high, r.low, r.close);
    }
    // Simulate the 2026-05-30 all-zero gap row
    db.run(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES ('FPT', '2026-05-30', 0, 0, 0, 0, 0, datetime('now'))`,
    );

    const server = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );
    registerPriceHistoryTools(server, db);

    const result = await callTool(server, "get_price_history", {
      code: "FPT",
      days: 60,
    });

    const text = result.content[0]!.text;
    // Min must be 73,100 (real), NOT 0
    expect(text).toContain("Min 73,100");
    expect(text).not.toContain("Min 0");
  });

  // AC-3: foreign-flow stub rows (high=0, low=0) excluded
  it("AC-3: DPI-4 stub rows with high=0/low=0 are excluded from get_price_history", async () => {
    const db = buildDb();
    // Simulate ohlcvForeignFlowStore stub row: open/high/low/close all zero but
    // with foreign flow data populated — this is the DPI-4 pattern
    db.run(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at,
         foreign_buy_vol, foreign_sell_vol, foreign_net_vol, put_through_vol)
       VALUES ('VCB', '2026-06-14', 0, 0, 0, 0, 0, datetime('now'),
         1500000, 800000, 700000, 0)`,
    );
    // Real row
    db.run(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES ('VCB', '2026-06-12', 61600, 62100, 60984, 61600, 3000000, datetime('now'))`,
    );

    const server = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );
    registerPriceHistoryTools(server, db);

    const result = await callTool(server, "get_price_history", {
      code: "VCB",
      days: 60,
    });

    const text = result.content[0]!.text;
    // Real data visible
    expect(text).toContain("61,600");
    // Stub date not visible
    expect(text).not.toContain("2026-06-14");
    // Min not 0
    expect(text).not.toContain("Min 0");
  });
});

describe("ALLZERO-OHLCV-FETCH — normalizeResidualContam", () => {
  // AC-4: normalizeResidualContam fixes thousand-VND contamination
  it("AC-4: normalizeResidualContam restores close=62.2 → 62200 for VCB watchlist ticker", () => {
    const db = buildDb();
    db.run("INSERT INTO watchlist (code) VALUES ('VCB')");
    db.run("INSERT INTO watchlist (code) VALUES ('DAG')");

    // VCB 2026-06-01 close=62.2 (thousand-VND leak, should be 62200)
    db.run(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES ('VCB', '2026-06-01', 62.3, 62.8, 61.7, 62.2, 2924300, '2026-06-01 19:19:40')`,
    );
    // DAG close=1.4 (thousand-VND, real = 1400)
    db.run(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES ('DAG', '2026-06-12', 1.4, 1.4, 1.4, 1.4, 0, datetime('now'))`,
    );
    // Clean row — must not be touched
    db.run(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES ('VCB', '2026-06-12', 61600, 62100, 60984, 61600, 3000000, datetime('now'))`,
    );

    const result = normalizeResidualContam(db);

    // VCB 2026-06-01 should be normalized
    const vcbRow = db.prepare(
      "SELECT open, high, low, close FROM daily_ohlcv WHERE code='VCB' AND date='2026-06-01'",
    ).get() as { open: number; high: number; low: number; close: number } | undefined;
    expect(vcbRow).toBeDefined();
    expect(vcbRow!.close).toBe(62200);
    expect(vcbRow!.open).toBe(62300);
    expect(vcbRow!.high).toBe(62800);
    expect(vcbRow!.low).toBe(61700);

    // DAG should be normalized
    const dagRow = db.prepare(
      "SELECT close FROM daily_ohlcv WHERE code='DAG' AND date='2026-06-12'",
    ).get() as { close: number } | undefined;
    expect(dagRow!.close).toBe(1400);

    // Clean VCB row must be untouched
    const vcbClean = db.prepare(
      "SELECT close FROM daily_ohlcv WHERE code='VCB' AND date='2026-06-12'",
    ).get() as { close: number } | undefined;
    expect(vcbClean!.close).toBe(61600);

    // Result should report how many rows were fixed
    expect(result.fixed).toBeGreaterThanOrEqual(2);
  });

  it("AC-4b: normalizeResidualContam returns fixed=0 when no contamination exists", () => {
    const db = buildDb();
    db.run("INSERT INTO watchlist (code) VALUES ('FPT')");
    db.run(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES ('FPT', '2026-06-12', 73100, 74300, 72369, 73500, 2000000, datetime('now'))`,
    );

    const result = normalizeResidualContam(db);
    expect(result.fixed).toBe(0);
  });
});
