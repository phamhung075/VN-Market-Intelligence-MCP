/**
 * Task 1423c — Carry Trade Signal MCP Tool
 *
 * Tests cover:
 *   1. Domain pure function — all 3 regime branches + zero-rate edge case
 *   2. MCP tool handler — via _testVndRate / _testFedRate injection
 *   3. DB integration — tool reads sbv_rates + tracked_indicators when no
 *      test injectors are provided
 *
 * Note: DB_PATH is set to :memory: by setup.ts preload.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  computeCarryTradeSignal,
  type CarryTradeSignal,
} from "../domain/services/macro/carryTradeSignal.js";
import { registerCarryTools } from "../interface/mcp/tools/macro/carryTools.js";
import { initDatabase, closeDb, getDb } from "../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Invoke a registered MCP tool by name using the internal _registeredTools map. */
async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const tools = (server as unknown as {
    _registeredTools: Record<string, {
      callback?: (args: Record<string, unknown>) => unknown;
      handler?: (args: Record<string, unknown>) => unknown;
    }>;
  })._registeredTools;

  const tool = tools[toolName];
  if (!tool) throw new Error(`Tool not registered: ${toolName}`);

  const fn = tool.callback ?? tool.handler;
  if (!fn) throw new Error(`No callable found for tool: ${toolName}`);

  return fn(args) as Promise<{ content: Array<{ type: string; text: string }> }>;
}

/** Call get_carry_trade_signal via the registered MCP server with injected rates. */
async function callCarryTool(
  server: McpServer,
  vndRate?: number,
  fedRate?: number,
): Promise<CarryTradeSignal> {
  const args: Record<string, unknown> = {};
  if (vndRate !== undefined) args["_testVndRate"] = vndRate;
  if (fedRate !== undefined) args["_testFedRate"] = fedRate;

  const response = await callTool(server, "get_carry_trade_signal", args);
  const text = response.content[0]?.text ?? "{}";
  return JSON.parse(text) as CarryTradeSignal;
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1 — Domain pure function (no MCP, no DB)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1423c — computeCarryTradeSignal (domain)", () => {
  it("returns HOT_MONEY_INFLOW when spread > 2.5%", () => {
    // vnd=6.0, fed=3.0 → spread=3.0 → HOT_MONEY_INFLOW
    const result = computeCarryTradeSignal(6.0, 3.0);
    expect(result.regime).toBe("HOT_MONEY_INFLOW");
    expect(result.carrySpread).toBe(3.0);
    expect(result.vndDepositRate).toBe(6.0);
    expect(result.fedFundsRate).toBe(3.0);
    expect(result.reasoning).toContain("attractive");
  });

  it("returns NEUTRAL when spread is between 0.5% and 2.5%", () => {
    // vnd=5.5, fed=4.33 → spread=1.17 → NEUTRAL
    const result = computeCarryTradeSignal(5.5, 4.33);
    expect(result.regime).toBe("NEUTRAL");
    expect(result.carrySpread).toBeCloseTo(1.17, 2);
  });

  it("returns NEUTRAL exactly at spread = 2.5% boundary", () => {
    // vnd=7.0, fed=4.5 → spread=2.5 (boundary inclusive on NEUTRAL side)
    const result = computeCarryTradeSignal(7.0, 4.5);
    expect(result.regime).toBe("NEUTRAL");
    expect(result.carrySpread).toBe(2.5);
  });

  it("returns HOT_MONEY_INFLOW just above 2.5% threshold", () => {
    // vnd=7.01, fed=4.5 → spread=2.51 → HOT_MONEY_INFLOW
    const result = computeCarryTradeSignal(7.01, 4.5);
    expect(result.regime).toBe("HOT_MONEY_INFLOW");
    expect(result.carrySpread).toBe(2.51);
  });

  it("returns FII_OUTFLOW_RISK when spread < 0.5%", () => {
    // vnd=4.5, fed=4.33 → spread=0.17 → FII_OUTFLOW_RISK
    const result = computeCarryTradeSignal(4.5, 4.33);
    expect(result.regime).toBe("FII_OUTFLOW_RISK");
    expect(result.carrySpread).toBeCloseTo(0.17, 2);
    expect(result.reasoning).toContain("outflow");
  });

  it("returns FII_OUTFLOW_RISK when spread is negative (fed > vnd)", () => {
    // vnd=3.0, fed=5.33 → spread=-2.33 → FII_OUTFLOW_RISK
    const result = computeCarryTradeSignal(3.0, 5.33);
    expect(result.regime).toBe("FII_OUTFLOW_RISK");
    expect(result.carrySpread).toBeLessThan(0);
  });

  it("returns NEUTRAL with 'Data unavailable' reasoning when vndRate = 0", () => {
    const result = computeCarryTradeSignal(0, 5.33);
    expect(result.regime).toBe("NEUTRAL");
    expect(result.carrySpread).toBe(0);
    expect(result.reasoning).toContain("unavailable");
  });

  it("returns NEUTRAL with 'Data unavailable' reasoning when fedRate = 0", () => {
    const result = computeCarryTradeSignal(5.5, 0);
    expect(result.regime).toBe("NEUTRAL");
    expect(result.carrySpread).toBe(0);
    expect(result.reasoning).toContain("unavailable");
  });

  it("returns NEUTRAL with 'Data unavailable' reasoning when both rates = 0", () => {
    const result = computeCarryTradeSignal(0, 0);
    expect(result.regime).toBe("NEUTRAL");
    expect(result.reasoning).toContain("unavailable");
  });

  it("includes a valid ISO 8601 computedAt timestamp", () => {
    const result = computeCarryTradeSignal(5.5, 4.33);
    expect(() => new Date(result.computedAt)).not.toThrow();
    expect(new Date(result.computedAt).toISOString()).toBe(result.computedAt);
  });

  it("rounds carrySpread to 2 decimal places", () => {
    // 5.555 - 3.333 = 2.222 — should stay at 2 dp
    const result = computeCarryTradeSignal(5.555, 3.333);
    const dp = (result.carrySpread.toString().split(".")[1] ?? "").length;
    expect(dp).toBeLessThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2 — MCP tool handler (rate injection via _testVndRate / _testFedRate)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1423c — get_carry_trade_signal MCP tool (injected rates)", () => {
  let server: McpServer;

  beforeEach(() => {
    initDatabase();
    server = new McpServer({ name: "test", version: "0.0.0" });
    registerCarryTools(server);
  });

  afterEach(() => {
    closeDb();
  });

  it("returns HOT_MONEY_INFLOW regime via injected rates", async () => {
    const result = await callCarryTool(server, 7.0, 3.0);
    expect(result.regime).toBe("HOT_MONEY_INFLOW");
    expect(result.carrySpread).toBe(4.0);
  });

  it("returns NEUTRAL regime via injected rates", async () => {
    const result = await callCarryTool(server, 5.5, 4.33);
    expect(result.regime).toBe("NEUTRAL");
    expect(result.carrySpread).toBeCloseTo(1.17, 2);
  });

  it("returns FII_OUTFLOW_RISK regime via injected rates", async () => {
    const result = await callCarryTool(server, 4.5, 4.33);
    expect(result.regime).toBe("FII_OUTFLOW_RISK");
  });

  it("returns NEUTRAL with unavailable reasoning when vndRate injected as 0", async () => {
    const result = await callCarryTool(server, 0, 5.33);
    expect(result.regime).toBe("NEUTRAL");
    expect(result.reasoning).toContain("unavailable");
  });

  it("result contains all required CarryTradeSignal fields", async () => {
    const result = await callCarryTool(server, 5.5, 4.33);
    expect(result).toHaveProperty("vndDepositRate");
    expect(result).toHaveProperty("fedFundsRate");
    expect(result).toHaveProperty("carrySpread");
    expect(result).toHaveProperty("regime");
    expect(result).toHaveProperty("reasoning");
    expect(result).toHaveProperty("computedAt");
  });

  it("MCP response is valid JSON wrapped in content array", async () => {
    const response = await callTool(server, "get_carry_trade_signal", {
      _testVndRate: 5.5,
      _testFedRate: 4.33,
    });
    const content = response.content;
    expect(Array.isArray(content)).toBe(true);
    expect(content[0]?.type).toBe("text");
    expect(() => JSON.parse(content[0]?.text ?? "")).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3 — DB integration (tool reads from sbv_rates + tracked_indicators)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1423c — get_carry_trade_signal DB reads", () => {
  let server: McpServer;

  beforeEach(() => {
    initDatabase();
    server = new McpServer({ name: "test", version: "0.0.0" });
    registerCarryTools(server);
  });

  afterEach(() => {
    closeDb();
  });

  it("returns NEUTRAL/unavailable when DB tables are empty (no data)", async () => {
    // No rows in sbv_rates or tracked_indicators → both rates are 0
    const result = await callCarryTool(server);
    expect(result.regime).toBe("NEUTRAL");
    expect(result.reasoning).toContain("unavailable");
    expect(result.carrySpread).toBe(0);
  });

  it("reads vnd deposit rate from sbv_rates when no injector provided", async () => {
    const db = getDb();
    db.prepare(
      `INSERT INTO sbv_rates (source, max_deposit_rate_pct, fetched_at)
       VALUES ('sbv', 6.5, '2026-04-29T10:00:00.000Z')`,
    ).run();

    // Fed rate still missing → unavailable path
    const result = await callCarryTool(server);
    expect(result.vndDepositRate).toBe(6.5);
    expect(result.regime).toBe("NEUTRAL");
    expect(result.reasoning).toContain("unavailable");
  });

  it("reads fed funds rate from tracked_indicators when no injector provided", async () => {
    const db = getDb();
    db.prepare(
      `INSERT INTO tracked_indicators (indicator, value, unit, source, extracted_at)
       VALUES ('fed_funds_rate', 5.33, '%', 'fred', '2026-04-29T10:00:00.000Z')`,
    ).run();

    // VND rate still missing → unavailable path
    const result = await callCarryTool(server);
    expect(result.fedFundsRate).toBe(5.33);
    expect(result.regime).toBe("NEUTRAL");
    expect(result.reasoning).toContain("unavailable");
  });

  it("computes real regime when both DB rows are present", async () => {
    const db = getDb();
    db.prepare(
      `INSERT INTO sbv_rates (source, max_deposit_rate_pct, fetched_at)
       VALUES ('sbv', 7.0, '2026-04-29T10:00:00.000Z')`,
    ).run();
    db.prepare(
      `INSERT INTO tracked_indicators (indicator, value, unit, source, extracted_at)
       VALUES ('fed_funds_rate', 4.33, '%', 'fred', '2026-04-29T10:00:00.000Z')`,
    ).run();

    const result = await callCarryTool(server);
    // spread = 7.0 - 4.33 = 2.67 → HOT_MONEY_INFLOW
    expect(result.vndDepositRate).toBe(7.0);
    expect(result.fedFundsRate).toBe(4.33);
    expect(result.carrySpread).toBeCloseTo(2.67, 2);
    expect(result.regime).toBe("HOT_MONEY_INFLOW");
  });

  it("uses the most recent sbv_rates row when multiple rows exist", async () => {
    const db = getDb();
    // Insert older row with lower rate
    db.prepare(
      `INSERT INTO sbv_rates (source, max_deposit_rate_pct, fetched_at)
       VALUES ('sbv_old', 4.0, '2026-01-01T00:00:00.000Z')`,
    ).run();
    // Insert newer row with higher rate
    db.prepare(
      `INSERT INTO sbv_rates (source, max_deposit_rate_pct, fetched_at)
       VALUES ('sbv_new', 7.5, '2026-04-29T10:00:00.000Z')`,
    ).run();
    db.prepare(
      `INSERT INTO tracked_indicators (indicator, value, unit, source, extracted_at)
       VALUES ('fed_funds_rate', 4.33, '%', 'fred', '2026-04-29T10:00:00.000Z')`,
    ).run();

    const result = await callCarryTool(server);
    expect(result.vndDepositRate).toBe(7.5);
  });
});
