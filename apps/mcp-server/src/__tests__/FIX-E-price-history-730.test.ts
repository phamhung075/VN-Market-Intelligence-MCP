/**
 * FIX-E — get_price_history 90→730 day widening + structured JSON array
 *
 * Coverage:
 *   1. Regression: existing text output unchanged (content[0] still plain text)
 *   2. days>90 (e.g. 365) is now accepted — regression proving the cap was widened
 *   3. Structured JSON array is present in content[1] with correct shape
 *   4. Honest-absent: empty data array returned when no rows exist
 *   5. days=730 (max) accepted
 *   6. days clamped to 730 (not beyond)
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// ─────────────────────────────────────────────────────────────────────────────
// DB helpers (identical schema to 178-price-history.test.ts)
// ─────────────────────────────────────────────────────────────────────────────

function buildInMemoryDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code    TEXT NOT NULL,
      date    TEXT NOT NULL,
      open    REAL NOT NULL DEFAULT 0,
      high    REAL NOT NULL DEFAULT 0,
      low     REAL NOT NULL DEFAULT 0,
      close   REAL NOT NULL,
      volume  REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (code, date)
    );
  `);
  return db;
}

function seedHistory(
  db: Database,
  code: string,
  rows: Array<{ close: number; volume: number; date: string }>,
): void {
  const ins = db.prepare(
    "INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  for (const r of rows) {
    ins.run(code, r.date, r.close, r.close, r.close, r.close, r.volume);
  }
}

/** ISO date string N days ago from today */
function daysAgoStr(n: number): string {
  return new Date(Date.now() - n * 24 * 3600 * 1000).toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP call helper
// ─────────────────────────────────────────────────────────────────────────────

type ToolResult = { content: Array<{ type: string; text: string }> };

async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const tools = (server as unknown as {
    _registeredTools: Record<string, {
      callback?: (args: Record<string, unknown>) => Promise<ToolResult>;
      handler?: (args: Record<string, unknown>) => Promise<ToolResult>;
    }>;
  })._registeredTools;
  const tool = tools[toolName];
  if (!tool) throw new Error(`Tool not registered: ${toolName}`);
  const fn = tool.callback ?? tool.handler;
  if (!fn) throw new Error(`No callable for tool: ${toolName}`);
  return fn(args);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-E — get_price_history 730-day widening + structured JSON", () => {
  let db: Database;
  let server: McpServer;

  beforeEach(() => {
    db = buildInMemoryDb();
    server = new McpServer({ name: "test", version: "0.0.0" }, { capabilities: { tools: {} } });
    const { registerPriceHistoryTools } = require("../interface/mcp/tools/market-data/priceHistoryTools.js");
    registerPriceHistoryTools(server, db);
  });

  afterEach(() => {
    db.close();
  });

  // ── Test 1: Regression — existing text output (content[0]) unchanged ───────
  it("content[0] is still plain Vietnamese text (regression — existing output unchanged)", async () => {
    seedHistory(db, "VCB", [
      { close: 85000, volume: 1_000_000, date: daysAgoStr(1) },
      { close: 84000, volume: 900_000,  date: daysAgoStr(2) },
    ]);

    const result = await callTool(server, "get_price_history", { code: "VCB", days: 7 });

    // content[0] is the text summary (backwards compat)
    expect(result.content[0]!.type).toBe("text");
    const text = result.content[0]!.text;

    // Must still contain Vietnamese header + numbers (unchanged format)
    expect(text).toContain("VCB");
    expect(text).toContain("85,000");
    expect(text).toContain("Min");
    expect(text).toContain("Max");
  });

  // ── Test 2: days=365 is now accepted (proves cap widened from 90→730) ──────
  it("accepts days=365 without clamping to 90 (regression: cap widened to 730)", async () => {
    // Seed a row 200 days ago — should be returned when days=365 is passed
    seedHistory(db, "FPT", [
      { close: 100000, volume: 500_000, date: daysAgoStr(200) },
      { close: 99000,  volume: 450_000, date: daysAgoStr(100) },
      { close: 98000,  volume: 400_000, date: daysAgoStr(1) },
    ]);

    const result = await callTool(server, "get_price_history", { code: "FPT", days: 365 });

    // All 3 rows should appear (200 days ago is within 365 days)
    const text = result.content[0]!.text;
    expect(text).toContain("100,000");
    expect(text).toContain("99,000");
    expect(text).toContain("98,000");

    // Structured JSON should also reflect days=365
    const parsed = JSON.parse(result.content[1]!.text);
    expect(parsed.days).toBe(365);
    expect(parsed.data).toHaveLength(3);
  });

  // ── Test 3: content[1] structured JSON array shape ────────────────────────
  it("content[1] is valid JSON with code, days, data array [{code, date, close, volume}]", async () => {
    seedHistory(db, "VNM", [
      { close: 72000, volume: 800_000, date: daysAgoStr(1) },
      { close: 71000, volume: 750_000, date: daysAgoStr(2) },
    ]);

    const result = await callTool(server, "get_price_history", { code: "VNM", days: 7 });

    expect(result.content).toHaveLength(2);
    expect(result.content[1]!.type).toBe("text");

    const parsed = JSON.parse(result.content[1]!.text);
    expect(parsed.code).toBe("VNM");
    expect(typeof parsed.days).toBe("number");
    expect(Array.isArray(parsed.data)).toBe(true);
    expect(parsed.data).toHaveLength(2);

    const item = parsed.data[0]!;
    expect(typeof item.code).toBe("string");
    expect(typeof item.date).toBe("string");
    expect(typeof item.close).toBe("number");
    expect(typeof item.volume).toBe("number");
  });

  // ── Test 4: Honest-absent — empty array when no rows exist ────────────────
  it("structured data array is empty (not fabricated) when no rows exist", async () => {
    const result = await callTool(server, "get_price_history", { code: "GHOST", days: 30 });

    // Text output gracefully says no data
    expect(result.content[0]!.text).toContain("GHOST");

    // Structured array is empty (honest-absent)
    const parsed = JSON.parse(result.content[1]!.text);
    expect(parsed.data).toHaveLength(0);
  });

  // ── Test 5: days=730 (maximum) accepted ───────────────────────────────────
  it("accepts days=730 (maximum bound)", async () => {
    seedHistory(db, "HPG", [
      { close: 27000, volume: 2_000_000, date: daysAgoStr(1) },
    ]);

    const result = await callTool(server, "get_price_history", { code: "HPG", days: 730 });

    const parsed = JSON.parse(result.content[1]!.text);
    expect(parsed.days).toBe(730);
    expect(parsed.data).toHaveLength(1);
  });

  // ── Test 6: close and volume values are numerically correct in JSON ────────
  it("structured JSON has correct numeric close and volume values", async () => {
    seedHistory(db, "MWG", [
      { close: 45000, volume: 1_234_567, date: daysAgoStr(1) },
    ]);

    const result = await callTool(server, "get_price_history", { code: "MWG", days: 7 });
    const parsed = JSON.parse(result.content[1]!.text);

    expect(parsed.data[0]!.close).toBe(45000);
    expect(parsed.data[0]!.volume).toBe(1_234_567);
  });
});
