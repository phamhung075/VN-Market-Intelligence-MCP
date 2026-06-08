Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1079 — get_user_positions_for_analysis MCP Tool
 *
 * Tests for the enriched position analysis tool that gives Cowork agents:
 * avg cost, qty, current P/L, stop-loss floor, and TP ladder.
 *
 * @module __tests__/1079-positions-for-analysis-tool
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPositionTools } from "../interface/mcp/tools/portfolio/positionTools.js";
import { upsertPosition } from "../infrastructure/db/positionStore.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  db.run(`
    CREATE TABLE positions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      code       TEXT    NOT NULL UNIQUE,
      shares     INTEGER NOT NULL,
      avg_price  REAL    NOT NULL,
      opened_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      closed_at  TEXT,
      notes      TEXT
    )
  `);
  db.run(`
    CREATE TABLE market_prices (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      code       TEXT    NOT NULL UNIQUE,
      price      REAL    NOT NULL,
      updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.run(`
    CREATE TABLE daily_ohlcv (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      code  TEXT NOT NULL,
      date  TEXT NOT NULL,
      open  REAL,
      high  REAL,
      low   REAL,
      close REAL,
      volume INTEGER,
      UNIQUE(code, date)
    )
  `);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

/** Call a registered MCP tool handler directly (bypasses transport). */
async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  // Access internal tool registry via private API (object keyed by tool name)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlers = (server as any)._registeredTools as Record<
    string,
    { handler: (args: Record<string, unknown>) => Promise<unknown> }
  >;
  const tool = handlers?.[toolName];
  if (!tool) throw new Error(`Tool '${toolName}' not found on server`);
  return tool.handler(args);
}

/** Parse JSON from MCP tool response content text. */
function parseResponse(res: unknown): unknown {
  const r = res as { content: Array<{ type: string; text: string }> };
  const first = r.content[0];
  if (!first) throw new Error("Empty content in MCP response");
  return JSON.parse(first.text);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1079 — get_user_positions_for_analysis", () => {
  let db: Database;
  let server: McpServer;

  beforeEach(() => {
    db = makeDb();
    server = new McpServer({ name: "test", version: "0.0.1" });
    registerPositionTools(server, db);
  });

  // ── AC1: Empty portfolio ───────────────────────────────────────────────────
  it("returns empty array when portfolio has no open positions", async () => {
    const res = await callTool(server, "get_user_positions_for_analysis");
    const data = parseResponse(res) as unknown[];
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(0);
  });

  // ── AC2: All positions returned when no ticker filter ─────────────────────
  it("returns all open positions when called with no ticker arg", async () => {
    upsertPosition(db, { code: "VCB", shares: 1000, avgPrice: 75000 });
    upsertPosition(db, { code: "FPT", shares: 500, avgPrice: 80000 });
    upsertPosition(db, { code: "HPG", shares: 2000, avgPrice: 25000 });

    const res = await callTool(server, "get_user_positions_for_analysis");
    const data = parseResponse(res) as unknown[];
    expect(data.length).toBe(3);
  });

  // ── AC3: Ticker filter returns single position ─────────────────────────────
  it("returns only the requested ticker when ticker arg is provided", async () => {
    upsertPosition(db, { code: "VCB", shares: 1000, avgPrice: 75000 });
    upsertPosition(db, { code: "FPT", shares: 500, avgPrice: 80000 });

    const res = await callTool(server, "get_user_positions_for_analysis", {
      ticker: "VCB",
    });
    const data = parseResponse(res) as Array<{ code: string }>;
    expect(data.length).toBe(1);
    expect(data[0]!.code).toBe("VCB");
  });

  // ── AC4: Ticker filter returns empty when no match ─────────────────────────
  it("returns empty array when ticker filter matches no open position", async () => {
    upsertPosition(db, { code: "VCB", shares: 1000, avgPrice: 75000 });

    const res = await callTool(server, "get_user_positions_for_analysis", {
      ticker: "FPT",
    });
    const data = parseResponse(res) as unknown[];
    expect(data.length).toBe(0);
  });

  // ── AC5: stopLossFloor formula ─────────────────────────────────────────────
  it("computes stopLossFloor = Math.round(avgPrice * 0.93)", async () => {
    // VCB: avg=75000 → floor = Math.round(75000 * 0.93) = 69750
    upsertPosition(db, { code: "VCB", shares: 1000, avgPrice: 75000 });

    const res = await callTool(server, "get_user_positions_for_analysis");
    const data = parseResponse(res) as Array<{
      code: string;
      stopLossFloor: number;
    }>;
    const vcb = data.find((p) => p.code === "VCB")!;
    expect(vcb.stopLossFloor).toBe(69750);
  });

  // ── AC6: TP ladder ──────────────────────────────────────────────────────────
  it("computes tp1/tp2/tp3 at +10%/+20%/+30% from avgPrice", async () => {
    // FPT: avg=80000 → tp1=88000, tp2=96000, tp3=104000
    upsertPosition(db, { code: "FPT", shares: 500, avgPrice: 80000 });

    const res = await callTool(server, "get_user_positions_for_analysis");
    const data = parseResponse(res) as Array<{
      code: string;
      tp1: number;
      tp2: number;
      tp3: number;
    }>;
    const fpt = data.find((p) => p.code === "FPT")!;
    expect(fpt.tp1).toBe(88000);
    expect(fpt.tp2).toBe(96000);
    expect(fpt.tp3).toBe(104000);
  });

  // ── AC7: Full JSON shape per position ──────────────────────────────────────
  it("returns all required fields in each position object", async () => {
    db.run(
      `INSERT INTO market_prices (code, price) VALUES ('VCB', 80000)`,
    );
    upsertPosition(db, { code: "VCB", shares: 1000, avgPrice: 75000 });

    const res = await callTool(server, "get_user_positions_for_analysis");
    const data = parseResponse(res) as Array<Record<string, unknown>>;
    const vcb = data.find((p) => p["code"] === "VCB")!;

    expect(vcb).toMatchObject({
      code: "VCB",
      shares: 1000,
      avgPrice: 75000,
      currentPrice: 80000,
      costBasis: 75000000,
      currentValue: 80000000,
      stopLossFloor: 69750,
      tp1: 82500,
      tp2: 90000,
      tp3: 97500,
    });

    // P/L fields should exist
    expect(typeof vcb["unrealizedPnl"]).toBe("number");
    expect(typeof vcb["unrealizedPnlPct"]).toBe("number");
  });

  // ── AC8: Missing market price → nulls for price-dependent fields ───────────
  it("handles missing current price gracefully — pl_abs/pct are null", async () => {
    // No market_prices row for HPG
    upsertPosition(db, { code: "HPG", shares: 2000, avgPrice: 25000 });

    const res = await callTool(server, "get_user_positions_for_analysis");
    const data = parseResponse(res) as Array<{
      code: string;
      currentPrice: number | null;
      unrealizedPnl: number | null;
      unrealizedPnlPct: number | null;
    }>;
    const hpg = data.find((p) => p.code === "HPG")!;
    expect(hpg.currentPrice).toBeNull();
    expect(hpg.unrealizedPnl).toBeNull();
    expect(hpg.unrealizedPnlPct).toBeNull();
  });

  // ── AC9: stopLossFloor with rounding (non-round result) ───────────────────
  it("rounds stopLossFloor correctly for non-integer result", async () => {
    // 12345 * 0.93 = 11480.85 → Math.round = 11481
    upsertPosition(db, { code: "VNM", shares: 100, avgPrice: 12345 });

    const res = await callTool(server, "get_user_positions_for_analysis");
    const data = parseResponse(res) as Array<{
      code: string;
      stopLossFloor: number;
    }>;
    const vnm = data.find((p) => p.code === "VNM")!;
    expect(vnm.stopLossFloor).toBe(Math.round(12345 * 0.93));
  });

  // ── AC10: positionValue field ──────────────────────────────────────────────
  it("includes positionValue = shares * avgPrice (costBasis)", async () => {
    upsertPosition(db, { code: "VCB", shares: 1000, avgPrice: 75000 });

    const res = await callTool(server, "get_user_positions_for_analysis");
    const data = parseResponse(res) as Array<{
      code: string;
      costBasis: number;
    }>;
    const vcb = data.find((p) => p.code === "VCB")!;
    expect(vcb.costBasis).toBe(75000000);
  });

  // ── AC11: Tool is registered alongside existing tools ─────────────────────
  it("tool is registered on server (does not throw when invoked)", async () => {
    // If tool not registered, callTool throws "Tool not found"
    await expect(
      callTool(server, "get_user_positions_for_analysis"),
    ).resolves.toBeDefined();
  });
});
