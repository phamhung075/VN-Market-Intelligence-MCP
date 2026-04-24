/**
 * Task 178 — get_price_history MCP tool
 *
 * Tests the priceHistoryTools registration and output format.
 * Uses an in-memory SQLite database with seeded market_prices_history rows.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// ── helpers to set up an isolated in-memory DB ──────────────────────────────

function buildInMemoryDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE market_prices_history (
      code       TEXT NOT NULL,
      price      REAL NOT NULL,
      volume     REAL NOT NULL,
      fetched_at TEXT NOT NULL,
      exchange   TEXT DEFAULT 'HOSE',
      PRIMARY KEY (code, fetched_at)
    );
    CREATE INDEX idx_mph_code_fetched
      ON market_prices_history(code, fetched_at DESC);
  `);
  return db;
}

function seedHistory(
  db: Database,
  code: string,
  rows: Array<{ price: number; volume: number; fetched_at: string; exchange?: string }>,
) {
  const ins = db.prepare(
    "INSERT OR REPLACE INTO market_prices_history (code, price, volume, fetched_at, exchange) VALUES (?, ?, ?, ?, ?)",
  );
  for (const r of rows) {
    ins.run(code, r.price, r.volume, r.fetched_at, r.exchange ?? "HOSE");
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
    // Sprint 053 / 1021: use dates relative to `now` so the 7-day window
    // always covers them regardless of when the test runs. Hard-coded
    // 2026-04-01 dates drifted outside the window as the clock moved on.
    const iso = (daysAgo: number) =>
      new Date(Date.now() - daysAgo * 24 * 3600 * 1000).toISOString();
    seedHistory(db, "VCB", [
      { price: 85000, volume: 1200000, fetched_at: iso(1) },
      { price: 84000, volume: 900000,  fetched_at: iso(2) },
      { price: 83500, volume: 800000,  fetched_at: iso(3) },
    ]);

    const result = await callTool(server, "get_price_history", {
      actionCode: "VCB",
      days: 7,
    });

    expect(result.content).toHaveLength(1);
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
    const iso = (daysAgo: number) =>
      new Date(Date.now() - daysAgo * 24 * 3600 * 1000).toISOString();
    // oldest price 80000, newest price 84000 → return +5.00%
    seedHistory(db, "VNM", [
      { price: 84000, volume: 500000, fetched_at: iso(1) },
      { price: 80000, volume: 400000, fetched_at: iso(8) },
    ]);

    const result = await callTool(server, "get_price_history", {
      actionCode: "VNM",
      days: 14,
    });

    const text = result.content[0]!.text;
    // +5.00% return (84000 vs 80000)
    expect(text).toContain("+5.00%");
  });

  it("shows 'Khong co du lieu' when stock has no history rows", async () => {
    const result = await callTool(server, "get_price_history", {
      actionCode: "UNKNOWN",
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
      price: 50000 + i * 100,
      volume: 100000,
      fetched_at: new Date(
        Date.UTC(2026, 2, 23 + i), // 2026-03-23 to 2026-04-01
      ).toISOString(),
    }));
    seedHistory(db, "FPT", rows);

    const result = await callTool(server, "get_price_history", {
      actionCode: "FPT",
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
      { price: 85000, volume: 1000000, fetched_at: "2026-04-01T00:00:00.000Z" },
    ]);

    // Omit `days` — should not throw
    const result = await callTool(server, "get_price_history", {
      actionCode: "VCB",
    });

    expect(result.content[0]!.text).toContain("VCB");
  });

  it("shows negative period return correctly", async () => {
    const iso = (daysAgo: number) =>
      new Date(Date.now() - daysAgo * 24 * 3600 * 1000).toISOString();
    seedHistory(db, "HPG", [
      { price: 28000, volume: 2000000, fetched_at: iso(1) },
      { price: 30000, volume: 1500000, fetched_at: iso(5) },
    ]);

    const result = await callTool(server, "get_price_history", {
      actionCode: "HPG",
      days: 7,
    });

    const text = result.content[0]!.text;
    // -6.67% return (28000 vs 30000)
    expect(text).toContain("-6.67%");
  });

  it("returns content array with type 'text'", async () => {
    const result = await callTool(server, "get_price_history", {
      actionCode: "VCB",
      days: 1,
    });
    expect(result.content[0]!.type).toBe("text");
  });
});
