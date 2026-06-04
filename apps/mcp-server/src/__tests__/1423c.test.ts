/**
 * Task 1423c — Carry Trade Signal
 *
 * Tests cover:
 *   Suite 1. Domain pure function — computeCarryTradeSignal(): all 3 regime branches + edge cases
 *   Suite 2. MCP tool handler — get_carry_trade_signal via mocked POST /snapshot
 *            Asserts: projects signals.carry, surfaces source_tier + is_estimate +
 *            fetched_at_source + reasoning. Asserts fixture values NOT special-cased.
 *
 * NOTE: The old Suite 2 (injection params _testVndRate/_testFedRate) and Suite 3
 * (DB reads) have been removed — get_carry_trade_signal now calls POST /snapshot
 * on the macro-indicators service (CARRY-YIELD-SINGLE-SIGNAL-FIXTURE B-2).
 * Provenance fields (source_tier, is_estimate, fetched_at_source) are projected
 * directly from the CarrySignalDTO returned by /snapshot.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  computeCarryTradeSignal,
  type CarryTradeSignal,
} from "../domain/services/macro/carryTradeSignal.js";
import { registerCarryTools } from "../interface/mcp/tools/macro/carryTools.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helper — invoke a registered MCP tool via _registeredTools
// ─────────────────────────────────────────────────────────────────────────────

async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown> = {},
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

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot mock helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Build a /snapshot response shape containing a carry sub-object. */
function makeSnapshotWithCarry(carry: Record<string, unknown>): object {
  return {
    status: "ok",
    dataSource: "macro-indicators",
    fetchedAt: "2026-06-05T00:00:00Z",
    signals: {
      carry,
      yield: {},
      oil: {},
      gold: {},
      usdvnd: {},
      "investment-clock": {},
    },
  };
}

/**
 * Mock globalThis.fetch to return the given snapshot body for POST /snapshot.
 * Returns a restore function (call in afterEach).
 */
function mockSnapshotFetch(snapshot: object): () => void {
  const original = globalThis.fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/snapshot")) {
      return new Response(JSON.stringify(snapshot), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return original(input, _init);
  };
  return () => { globalThis.fetch = original; };
}

/** Mock fetch to return HTTP 500 for /snapshot. */
function mockSnapshotError(): () => void {
  const original = globalThis.fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/snapshot")) {
      return new Response("Internal Server Error", { status: 500 });
    }
    return original(input, _init);
  };
  return () => { globalThis.fetch = original; };
}

/** Mock fetch to throw a network error for /snapshot. */
function mockSnapshotNetworkError(): () => void {
  const original = globalThis.fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/snapshot")) {
      throw new Error("ECONNREFUSED");
    }
    return original(input, _init);
  };
  return () => { globalThis.fetch = original; };
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1 — Domain pure function (no MCP, no DB, no HTTP)
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
// Suite 2 — MCP tool: get_carry_trade_signal via mocked POST /snapshot
// CARRY-YIELD-SINGLE-SIGNAL-FIXTURE B-2: rewired to POST /snapshot
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1423c — get_carry_trade_signal MCP tool (POST /snapshot projection)", () => {
  let server: McpServer;
  let restore: (() => void) | undefined;

  beforeEach(() => {
    server = new McpServer({ name: "test", version: "0.0.0" });
    registerCarryTools(server);
  });

  afterEach(() => {
    restore?.();
    restore = undefined;
  });

  it("projects signals.carry from /snapshot — live NEUTRAL regime (fed=3.62, vnd=5.0)", async () => {
    const carryPayload = {
      regime: "NEUTRAL",
      carrySpread: 1.38,
      vndDepositRate: 5.0,
      fedFundsRate: 3.62,
      reasoning: "VND carry spread is moderate (NEUTRAL zone).",
      computedAt: "2026-06-05T00:00:00Z",
      is_estimate: false,
      source_tier: 2,
      fetched_at_source: "2026-06-03T00:00:00Z",
    };
    restore = mockSnapshotFetch(makeSnapshotWithCarry(carryPayload));

    const response = await callTool(server, "get_carry_trade_signal");
    const result = JSON.parse(response.content[0]!.text) as Record<string, unknown>;

    expect(result.regime).toBe("NEUTRAL");
    expect(result.carrySpread).toBe(1.38);
    expect(result.fedFundsRate).toBe(3.62);
    expect(result.vndDepositRate).toBe(5.0);
    expect(result.source_tier).toBe(2);
    expect(result.is_estimate).toBe(false);
    expect(result.fetched_at_source).toBe("2026-06-03T00:00:00Z");
    expect(typeof result.reasoning).toBe("string");
  });

  it("surfaces source_tier and is_estimate fields from CarrySignalDTO", async () => {
    const carryPayload = {
      regime: "HOT_MONEY_INFLOW",
      carrySpread: 3.0,
      vndDepositRate: 6.5,
      fedFundsRate: 3.5,
      reasoning: "Strong VND carry advantage.",
      computedAt: "2026-06-05T00:00:00Z",
      is_estimate: false,
      source_tier: 2,
      fetched_at_source: "2026-06-04T00:00:00Z",
    };
    restore = mockSnapshotFetch(makeSnapshotWithCarry(carryPayload));

    const response = await callTool(server, "get_carry_trade_signal");
    const result = JSON.parse(response.content[0]!.text) as Record<string, unknown>;

    expect(result.source_tier).toBeDefined();
    expect(result.is_estimate).toBeDefined();
    expect(result.fetched_at_source).toBeDefined();
    expect(result.reasoning).toBeDefined();
  });

  it("ANTI-FIXTURE: fixture fedFundsRate=5.33 is NOT served when live /snapshot returns 3.62", async () => {
    const carryPayload = {
      regime: "NEUTRAL",
      carrySpread: 1.38,
      vndDepositRate: 5.0,
      fedFundsRate: 3.62,
      reasoning: "Live data: EFFR=3.62.",
      computedAt: "2026-06-05T00:00:00Z",
      is_estimate: false,
      source_tier: 2,
      fetched_at_source: "2026-06-03T00:00:00Z",
    };
    restore = mockSnapshotFetch(makeSnapshotWithCarry(carryPayload));

    const response = await callTool(server, "get_carry_trade_signal");
    const result = JSON.parse(response.content[0]!.text) as Record<string, unknown>;

    // DSI-INV-1 guard: the old fixture value 5.33 must NOT appear
    expect(result.fedFundsRate).not.toBe(5.33);
    expect(result.fedFundsRate).toBe(3.62);
  });

  it("ANTI-FIXTURE: fixture vndDepositRate=4.7 is NOT served when live /snapshot returns 5.0", async () => {
    const carryPayload = {
      regime: "NEUTRAL",
      carrySpread: 1.38,
      vndDepositRate: 5.0,
      fedFundsRate: 3.62,
      reasoning: "Live data.",
      computedAt: "2026-06-05T00:00:00Z",
      is_estimate: false,
      source_tier: 2,
      fetched_at_source: "2026-06-03T00:00:00Z",
    };
    restore = mockSnapshotFetch(makeSnapshotWithCarry(carryPayload));

    const response = await callTool(server, "get_carry_trade_signal");
    const result = JSON.parse(response.content[0]!.text) as Record<string, unknown>;

    // DSI-INV-1 guard: the old fixture value 4.7 must NOT appear
    expect(result.vndDepositRate).not.toBe(4.7);
    expect(result.vndDepositRate).toBe(5.0);
  });

  it("returns error JSON when /snapshot responds with HTTP 500", async () => {
    restore = mockSnapshotError();

    const response = await callTool(server, "get_carry_trade_signal");
    const result = JSON.parse(response.content[0]!.text) as Record<string, unknown>;

    expect(result.error).toBe("macro-indicators service unavailable");
  });

  it("returns error JSON when fetch throws (network error)", async () => {
    restore = mockSnapshotNetworkError();

    const response = await callTool(server, "get_carry_trade_signal");
    const result = JSON.parse(response.content[0]!.text) as Record<string, unknown>;

    expect(result.error).toBe("macro-indicators service unavailable");
  });

  it("returns error JSON when /snapshot response is missing signals.carry", async () => {
    const snapshotWithoutCarry = {
      status: "ok",
      fetchedAt: "2026-06-05T00:00:00Z",
      signals: {
        oil: {},
        gold: {},
      },
    };
    restore = mockSnapshotFetch(snapshotWithoutCarry);

    const response = await callTool(server, "get_carry_trade_signal");
    const result = JSON.parse(response.content[0]!.text) as Record<string, unknown>;

    expect(result.error).toBe("carry signal not available in snapshot");
  });

  it("MCP response is valid JSON wrapped in content array", async () => {
    const carryPayload = {
      regime: "NEUTRAL",
      carrySpread: 1.38,
      vndDepositRate: 5.0,
      fedFundsRate: 3.62,
      reasoning: "Moderate carry spread.",
      computedAt: "2026-06-05T00:00:00Z",
      is_estimate: false,
      source_tier: 2,
      fetched_at_source: "2026-06-03T00:00:00Z",
    };
    restore = mockSnapshotFetch(makeSnapshotWithCarry(carryPayload));

    const response = await callTool(server, "get_carry_trade_signal");
    expect(Array.isArray(response.content)).toBe(true);
    expect(response.content[0]?.type).toBe("text");
    expect(() => JSON.parse(response.content[0]?.text ?? "")).not.toThrow();
  });

  it("is_estimate=true is surfaced honestly (fixture fallback active)", async () => {
    const carryPayload = {
      regime: "UNKNOWN",
      carrySpread: null,
      vndDepositRate: 4.7,
      fedFundsRate: 5.33,
      reasoning: "Fixture fallback — live data unavailable.",
      computedAt: "2026-06-05T00:00:00Z",
      is_estimate: true,
      source_tier: 4,
      fetched_at_source: null,
    };
    restore = mockSnapshotFetch(makeSnapshotWithCarry(carryPayload));

    const response = await callTool(server, "get_carry_trade_signal");
    const result = JSON.parse(response.content[0]!.text) as Record<string, unknown>;

    // is_estimate=true is surfaced, not hidden
    expect(result.is_estimate).toBe(true);
    expect(result.source_tier).toBe(4);
    expect(result.carrySpread).toBeNull();
  });
});
