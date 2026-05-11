/**
 * Tests for Task 1426b — Yield Spread Signal
 *
 * Covers:
 *   Unit tests — pure domain function computeYieldSpreadSignal():
 *     - CHEAP branch (spread > 2pp)
 *     - FAIRLY_VALUED branch (0 < spread ≤ 2pp)
 *     - EXPENSIVE branch (spread ≤ 0)
 *     - UNKNOWN when earningYield = 0
 *     - UNKNOWN when depositRate = 0
 *     - Boundary: earningYield === depositRate → EXPENSIVE
 *     - Boundary: earningYield === depositRate + 2 → FAIRLY_VALUED (threshold is strictly >)
 *
 *   MCP tool integration tests — get_yield_spread_signal via _test injection params:
 *     - CHEAP via injection
 *     - FAIRLY_VALUED via injection
 *     - EXPENSIVE via injection
 *     - UNKNOWN via injection (earningYield = 0)
 *
 * @module __tests__/1570b-yield-spread-signal
 */

import { describe, it, expect } from "bun:test";
import {
  computeYieldSpreadSignal,
  type YieldSpreadSignal,
} from "../domain/services/macro/yieldSpreadSignal.js";
import { registerDinhGiaTools } from "../interface/mcp/tools/macro/dinhGiaTools.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Round to 2 decimal places (mirrors domain rounding). */
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─────────────────────────────────────────────────────────────────────────────
// Unit tests — pure domain function
// ─────────────────────────────────────────────────────────────────────────────

describe("computeYieldSpreadSignal — pure domain fn", () => {
  it("CHEAP: earningYield=8.0, depositRate=5.0 → spread=+3.0, label=CHEAP", () => {
    const result = computeYieldSpreadSignal(8.0, 5.0);
    expect(result.label).toBe("CHEAP");
    expect(result.spread).toBe(3.0);
    expect(result.earningYield).toBe(8.0);
    expect(result.depositRate).toBe(5.0);
    expect(result.reasoning).toContain("CHEAP");
    expect(result.computedAt).toBeTruthy();
  });

  it("FAIRLY_VALUED: earningYield=6.0, depositRate=5.5 → spread=+0.5, label=FAIRLY_VALUED", () => {
    const result = computeYieldSpreadSignal(6.0, 5.5);
    expect(result.label).toBe("FAIRLY_VALUED");
    expect(result.spread).toBe(r2(6.0 - 5.5));
    expect(result.reasoning).toContain("FAIRLY_VALUED");
  });

  it("EXPENSIVE: earningYield=4.0, depositRate=5.5 → spread=-1.5, label=EXPENSIVE", () => {
    const result = computeYieldSpreadSignal(4.0, 5.5);
    expect(result.label).toBe("EXPENSIVE");
    expect(result.spread).toBe(r2(4.0 - 5.5));
    expect(result.reasoning).toContain("EXPENSIVE");
  });

  it("UNKNOWN: earningYield=0, depositRate=5.5 → label=UNKNOWN", () => {
    const result = computeYieldSpreadSignal(0, 5.5);
    expect(result.label).toBe("UNKNOWN");
    expect(result.spread).toBe(0);
    expect(result.reasoning).toMatch(/unavailable/i);
  });

  it("UNKNOWN: earningYield=7.0, depositRate=0 → label=UNKNOWN", () => {
    const result = computeYieldSpreadSignal(7.0, 0);
    expect(result.label).toBe("UNKNOWN");
    expect(result.spread).toBe(0);
    expect(result.reasoning).toMatch(/unavailable/i);
  });

  it("Boundary: earningYield === depositRate → EXPENSIVE (spread = 0, not strictly > 0)", () => {
    const result = computeYieldSpreadSignal(5.5, 5.5);
    expect(result.label).toBe("EXPENSIVE");
    expect(result.spread).toBe(0);
  });

  it("Boundary: earningYield = depositRate + 2 → FAIRLY_VALUED (threshold is strictly > 2pp)", () => {
    // spread = 2.0 — exactly at boundary; threshold requires spread > 2, so 2.0 → FAIRLY_VALUED
    const result = computeYieldSpreadSignal(7.5, 5.5);
    expect(result.label).toBe("FAIRLY_VALUED");
    expect(result.spread).toBe(2.0);
  });

  it("Returns valid ISO timestamp in computedAt", () => {
    const result = computeYieldSpreadSignal(7.0, 5.0);
    expect(() => new Date(result.computedAt)).not.toThrow();
    expect(new Date(result.computedAt).getFullYear()).toBeGreaterThan(2020);
  });

  it("Spread is rounded to 2 decimal places", () => {
    // 7.331 - 5.0 = 2.331 → rounds to 2.33
    const result = computeYieldSpreadSignal(7.331, 5.0);
    expect(result.spread).toBe(2.33);
    // Still CHEAP (2.33 > 2)
    expect(result.label).toBe("CHEAP");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MCP tool integration tests — using _test injection params
// ─────────────────────────────────────────────────────────────────────────────

describe("get_yield_spread_signal MCP tool — injection params", () => {
  /** Minimal McpServer mock that captures tool registrations. */
  function makeMockServer() {
    const handlers: Record<
      string,
      (args: Record<string, unknown>) => { content: Array<{ type: string; text: string }> }
    > = {};

    const server = {
      tool: (
        name: string,
        _description: string,
        _schema: unknown,
        handler: (args: Record<string, unknown>) => { content: Array<{ type: string; text: string }> },
      ) => {
        handlers[name] = handler;
      },
    } as unknown as import("@modelcontextprotocol/sdk/server/mcp.js").McpServer;

    return { server, handlers };
  }

  function callTool(
    handlers: Record<string, (args: Record<string, unknown>) => { content: Array<{ type: string; text: string }> }>,
    toolName: string,
    args: Record<string, unknown>,
  ): YieldSpreadSignal {
    const handler = handlers[toolName];
    if (!handler) throw new Error(`Tool "${toolName}" not registered`);
    const result = handler(args);
    return JSON.parse(result.content[0]!.text) as YieldSpreadSignal;
  }

  it("CHEAP via injection: earningYield=9.0, depositRate=5.0 → label=CHEAP", () => {
    const { server, handlers } = makeMockServer();
    registerDinhGiaTools(server);
    const signal = callTool(handlers, "get_yield_spread_signal", {
      _testEarningYield: 9.0,
      _testDepositRate: 5.0,
    });
    expect(signal.label).toBe("CHEAP");
    expect(signal.spread).toBe(4.0);
  });

  it("FAIRLY_VALUED via injection: earningYield=6.5, depositRate=5.5 → label=FAIRLY_VALUED", () => {
    const { server, handlers } = makeMockServer();
    registerDinhGiaTools(server);
    const signal = callTool(handlers, "get_yield_spread_signal", {
      _testEarningYield: 6.5,
      _testDepositRate: 5.5,
    });
    expect(signal.label).toBe("FAIRLY_VALUED");
    expect(signal.spread).toBe(1.0);
  });

  it("EXPENSIVE via injection: earningYield=4.0, depositRate=6.0 → label=EXPENSIVE", () => {
    const { server, handlers } = makeMockServer();
    registerDinhGiaTools(server);
    const signal = callTool(handlers, "get_yield_spread_signal", {
      _testEarningYield: 4.0,
      _testDepositRate: 6.0,
    });
    expect(signal.label).toBe("EXPENSIVE");
    expect(signal.spread).toBe(-2.0);
  });

  it("UNKNOWN via injection: earningYield=0 → label=UNKNOWN", () => {
    const { server, handlers } = makeMockServer();
    registerDinhGiaTools(server);
    const signal = callTool(handlers, "get_yield_spread_signal", {
      _testEarningYield: 0,
      _testDepositRate: 5.5,
    });
    expect(signal.label).toBe("UNKNOWN");
    expect(signal.spread).toBe(0);
  });

  it("Tool returns valid JSON with all required fields", () => {
    const { server, handlers } = makeMockServer();
    registerDinhGiaTools(server);
    const signal = callTool(handlers, "get_yield_spread_signal", {
      _testEarningYield: 7.0,
      _testDepositRate: 5.0,
    });
    expect(signal).toHaveProperty("label");
    expect(signal).toHaveProperty("spread");
    expect(signal).toHaveProperty("earningYield");
    expect(signal).toHaveProperty("depositRate");
    expect(signal).toHaveProperty("reasoning");
    expect(signal).toHaveProperty("computedAt");
  });
});
