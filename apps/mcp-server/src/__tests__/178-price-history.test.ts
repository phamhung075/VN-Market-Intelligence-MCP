/**
 * Task 178 — get_price_history MCP tool
 *
 * Tests the priceHistoryTools registration and output format.
 * Uses an in-memory SQLite database with seeded daily_ohlcv rows.
 *
 * Task 1804c: Updated to use daily_ohlcv instead of market_prices_history.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ── helpers to set up an isolated in-memory DB ──────────────────────────────

function buildInMemoryDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE daily_ohlcv (
      code    TEXT NOT NULL,
      date    TEXT NOT NULL,
      open    REAL NOT NULL DEFAULT 0,
      high    REAL NOT NULL DEFAULT 0,
      low     REAL NOT NULL DEFAULT 0,
      close   REAL NOT NULL,
      volume  REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (code, date)
    );
    CREATE INDEX idx_daily_ohlcv_code_date
      ON daily_ohlcv(code, date DESC);
  `);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

function seedHistory(
  db: Database,
  code: string,
  rows: Array<{ close: number; volume: number; date: string; open?: number; high?: number; low?: number }>,
) {
  const ins = db.prepare(
    "INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  for (const r of rows) {
    ins.run(code, r.date, r.open ?? r.close, r.high ?? r.close, r.low ?? r.close, r.close, r.volume);
  }
}

// ── call helper: invoke the registered tool via internal _registeredTools ───

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
  if (!fn) throw new Error(`No callable found for tool: ${toolName}`);
  return fn(args) as Promise<{ content: Array<{ type: string; text: string }> }>;
}

// ── tests ────────────────────────────────────────────────────────────────────

describe("Task 178 — get_price_history MCP tool", () => {
  let db: Database;
  let server: McpServer;

  beforeEach(() => {
    db = buildInMemoryDb();
    server = new McpServer(
      { name: "test-server", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );

    // Dynamically import and register with injected DB
    const { registerPriceHistoryTools } = require("../interface/mcp/tools/market-data/priceHistoryTools.js");
    registerPriceHistoryTools(server, db);
  });

  afterEach(() => {
    db.close();
  });

  it("returns a formatted table with price rows for a known stock", async () => {
    // Use dates relative to `now` so the 7-day window always covers them.
    const dateStr = (daysAgo: number) =>
      new Date(Date.now() - daysAgo * 24 * 3600 * 1000).toISOString().slice(0, 10);
    seedHistory(db, "VCB", [
      { close: 85000, volume: 1200000, date: dateStr(1) },
      { close: 84000, volume: 900000,  date: dateStr(2) },
      { close: 83500, volume: 800000,  date: dateStr(3) },
    ]);

    const result = await callTool(server, "get_price_history", {
      code: "VCB",
      days: 7,
    });

    // FIX-E: content now has 2 items (text summary + JSON array); content[0] is still the text
    expect(result.content.length).toBeGreaterThanOrEqual(1);
    const text = result.content[0]!.text;

    // Header mentions the stock code
    expect(text).toContain("VCB");
    // Table rows present
    expect(text).toContain("85,000");
    expect(text).toContain("84,000");
    expect(text).toContain("83,500");
    // Stats section present
    expect(text).toContain("Min");
    expect(text).toContain("Max");
  });

  it("computes correct period return % between first and last entry", async () => {
    const dateStr = (daysAgo: number) =>
      new Date(Date.now() - daysAgo * 24 * 3600 * 1000).toISOString().slice(0, 10);
    // oldest close 80000, newest close 84000 → return +5.00%
    seedHistory(db, "VNM", [
      { close: 84000, volume: 500000, date: dateStr(1) },
      { close: 80000, volume: 400000, date: dateStr(8) },
    ]);

    const result = await callTool(server, "get_price_history", {
      code: "VNM",
      days: 14,
    });

    const text = result.content[0]!.text;
    // +5.00% return (84000 vs 80000)
    expect(text).toContain("+5.00%");
  });

  it("shows 'Khong co du lieu' when stock has no history rows", async () => {
    const result = await callTool(server, "get_price_history", {
      code: "UNKNOWN",
      days: 7,
    });

    const text = result.content[0]!.text;
    expect(text).toContain("UNKNOWN");
    // Vietnamese "no data" message
    expect(text.toLowerCase()).toMatch(/kh.*ng.*d.*li/);
  });

  it("limits results to the requested days window", async () => {
    // Seed 10 rows spanning 10 days
    const rows = Array.from({ length: 10 }, (_, i) => ({
      close: 50000 + i * 100,
      volume: 100000,
      date: new Date(
        Date.UTC(2026, 2, 23 + i), // 2026-03-23 to 2026-04-01
      ).toISOString().slice(0, 10),
    }));
    seedHistory(db, "FPT", rows);

    const result = await callTool(server, "get_price_history", {
      code: "FPT",
      days: 3,
    });

    const text = result.content[0]!.text;
    // Only 3 most recent rows visible
    // Count occurrences of "2026" date prefix as proxy for row count
    const dateMatches = (text.match(/2026/g) ?? []).length;
    // Should have at most 3 data rows (plus possibly the header line)
    // The header "3 ngay" should appear, plus 3 date entries
    expect(dateMatches).toBeLessThanOrEqual(5);
  });

  it("defaults to 7 days when 'days' param is omitted", async () => {
    seedHistory(db, "VCB", [
      { close: 85000, volume: 1000000, date: "2026-04-01" },
    ]);

    // Omit `days` — should not throw
    const result = await callTool(server, "get_price_history", {
      code: "VCB",
    });

    expect(result.content[0]!.text).toContain("VCB");
  });

  it("shows negative period return correctly", async () => {
    const dateStr = (daysAgo: number) =>
      new Date(Date.now() - daysAgo * 24 * 3600 * 1000).toISOString().slice(0, 10);
    seedHistory(db, "HPG", [
      { close: 28000, volume: 2000000, date: dateStr(1) },
      { close: 30000, volume: 1500000, date: dateStr(5) },
    ]);

    const result = await callTool(server, "get_price_history", {
      code: "HPG",
      days: 7,
    });

    const text = result.content[0]!.text;
    // -6.67% return (28000 vs 30000)
    expect(text).toContain("-6.67%");
  });

  it("returns content array with type 'text'", async () => {
    const result = await callTool(server, "get_price_history", {
      code: "VCB",
      days: 1,
    });
    expect(result.content[0]!.type).toBe("text");
  });
});
