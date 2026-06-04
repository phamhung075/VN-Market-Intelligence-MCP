/**
 * Tests for Task 1426b — Yield Spread Signal
 *
 * Covers:
 *   Suite 1. Unit tests — pure domain function computeYieldSpreadSignal():
 *     - CHEAP branch (spread > 2pp)
 *     - FAIRLY_VALUED branch (0 < spread ≤ 2pp)
 *     - EXPENSIVE branch (spread ≤ 0)
 *     - UNKNOWN when earningYield = 0
 *     - UNKNOWN when depositRate = 0
 *     - Boundary: earningYield === depositRate → EXPENSIVE
 *     - Boundary: earningYield === depositRate + 2 → FAIRLY_VALUED (threshold is strictly >)
 *
 *   Suite 2. MCP tool integration tests — get_yield_spread_signal via mocked POST /snapshot
 *     (CARRY-YIELD-SINGLE-SIGNAL-FIXTURE B-2: rewired to POST /snapshot)
 *     - Projects signals.yield from /snapshot
 *     - Surfaces source_tier + is_estimate (is_estimate=true/tier:4 is expected and honest)
 *     - ANTI-FIXTURE: fixture earningYield=8.2 and depositRate=4.7 not served when live
 *     - Null-guard: missing signals.yield returns error
 *     - HTTP error / network error returns error envelope
 *
 * @module __tests__/1570b-yield-spread-signal
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  computeYieldSpreadSignal,
  type YieldSpreadSignal,
} from "../domain/services/macro/yieldSpreadSignal.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDinhGiaTools } from "../interface/mcp/tools/macro/dinhGiaTools.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Round to 2 decimal places (mirrors domain rounding). */
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Invoke a registered MCP tool via _registeredTools internal map. */
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

/** Build a /snapshot response shape containing a yield sub-object. */
function makeSnapshotWithYield(yieldObj: Record<string, unknown>): object {
  return {
    status: "ok",
    dataSource: "macro-indicators",
    fetchedAt: "2026-06-05T00:00:00Z",
    signals: {
      carry: {},
      yield: yieldObj,
      oil: {},
      gold: {},
      usdvnd: {},
      "investment-clock": {},
    },
  };
}

/** Mock globalThis.fetch to return the given snapshot body for POST /snapshot. */
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
// Suite 1 — Unit tests: pure domain function
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
// Suite 2 — MCP tool: get_yield_spread_signal via mocked POST /snapshot
// CARRY-YIELD-SINGLE-SIGNAL-FIXTURE B-2: rewired to POST /snapshot
// ─────────────────────────────────────────────────────────────────────────────

describe("get_yield_spread_signal MCP tool — POST /snapshot projection", () => {
  let server: McpServer;
  let restore: (() => void) | undefined;

  beforeEach(() => {
    server = new McpServer({ name: "test", version: "0.0.0" });
    registerDinhGiaTools(server);
  });

  afterEach(() => {
    restore?.();
    restore = undefined;
  });

  it("projects signals.yield from /snapshot — live CHEAP regime", async () => {
    const yieldPayload = {
      label: "CHEAP",
      spread: 3.2,
      earningYield: 8.2,
      depositRate: 5.0,
      reasoning: "Equity is cheap relative to deposit rates.",
      computedAt: "2026-06-05T00:00:00Z",
      is_estimate: true,
      source_tier: 4,
    };
    restore = mockSnapshotFetch(makeSnapshotWithYield(yieldPayload));

    const response = await callTool(server, "get_yield_spread_signal");
    const result = JSON.parse(response.content[0]!.text) as Record<string, unknown>;

    expect(result.label).toBe("CHEAP");
    expect(result.spread).toBe(3.2);
    expect(result.earningYield).toBe(8.2);
    expect(result.depositRate).toBe(5.0);
    // is_estimate=true surfaced (earningYield is fixture — honest)
    expect(result.is_estimate).toBe(true);
    expect(result.source_tier).toBe(4);
    expect(typeof result.reasoning).toBe("string");
  });

  it("surfaces source_tier and is_estimate from YieldSignalDTO", async () => {
    const yieldPayload = {
      label: "FAIRLY_VALUED",
      spread: 1.5,
      earningYield: 6.5,
      depositRate: 5.0,
      reasoning: "Moderate valuation.",
      computedAt: "2026-06-05T00:00:00Z",
      is_estimate: false,
      source_tier: 2,
    };
    restore = mockSnapshotFetch(makeSnapshotWithYield(yieldPayload));

    const response = await callTool(server, "get_yield_spread_signal");
    const result = JSON.parse(response.content[0]!.text) as Record<string, unknown>;

    expect(result.source_tier).toBeDefined();
    expect(result.is_estimate).toBeDefined();
    expect(result.reasoning).toBeDefined();
  });

  it("ANTI-FIXTURE: fixture earningYield=8.2 + depositRate=4.7 are NOT hardcoded — tool passes through /snapshot values", async () => {
    // Inject non-fixture values; tool must pass them through unchanged
    const yieldPayload = {
      label: "CHEAP",
      spread: 2.73,
      earningYield: 7.23,
      depositRate: 4.5,
      reasoning: "Live computation.",
      computedAt: "2026-06-05T00:00:00Z",
      is_estimate: false,
      source_tier: 2,
    };
    restore = mockSnapshotFetch(makeSnapshotWithYield(yieldPayload));

    const response = await callTool(server, "get_yield_spread_signal");
    const result = JSON.parse(response.content[0]!.text) as Record<string, unknown>;

    // The tool must project what /snapshot returned — no hardcoded 8.2 possible
    expect(result.earningYield).toBe(7.23);
    expect(result.depositRate).toBe(4.5);
    expect(result.earningYield).not.toBe(8.2);
    expect(result.depositRate).not.toBe(4.7);
  });

  it("is_estimate=true is surfaced honestly (fixture fallback active) — not hidden", async () => {
    const yieldPayload = {
      label: "CHEAP",
      spread: 3.2,
      earningYield: 8.2,
      depositRate: 5.0,
      reasoning: "Fixture fallback for earningYield.",
      computedAt: "2026-06-05T00:00:00Z",
      is_estimate: true,
      source_tier: 4,
    };
    restore = mockSnapshotFetch(makeSnapshotWithYield(yieldPayload));

    const response = await callTool(server, "get_yield_spread_signal");
    const result = JSON.parse(response.content[0]!.text) as Record<string, unknown>;

    // is_estimate=true/tier:4 is correct and honest, not a bug
    expect(result.is_estimate).toBe(true);
    expect(result.source_tier).toBe(4);
  });

  it("returns error JSON when /snapshot responds with HTTP 500", async () => {
    restore = mockSnapshotError();

    const response = await callTool(server, "get_yield_spread_signal");
    const result = JSON.parse(response.content[0]!.text) as Record<string, unknown>;

    expect(result.error).toBe("macro-indicators service unavailable");
  });

  it("returns error JSON when fetch throws (network error)", async () => {
    restore = mockSnapshotNetworkError();

    const response = await callTool(server, "get_yield_spread_signal");
    const result = JSON.parse(response.content[0]!.text) as Record<string, unknown>;

    expect(result.error).toBe("macro-indicators service unavailable");
  });

  it("returns error JSON when /snapshot response is missing signals.yield", async () => {
    const snapshotWithoutYield = {
      status: "ok",
      fetchedAt: "2026-06-05T00:00:00Z",
      signals: {
        carry: {},
        oil: {},
      },
    };
    restore = mockSnapshotFetch(snapshotWithoutYield);

    const response = await callTool(server, "get_yield_spread_signal");
    const result = JSON.parse(response.content[0]!.text) as Record<string, unknown>;

    expect(result.error).toBe("yield signal not available in snapshot");
  });

  it("MCP response is valid JSON wrapped in content array", async () => {
    const yieldPayload = {
      label: "CHEAP",
      spread: 3.2,
      earningYield: 8.2,
      depositRate: 5.0,
      reasoning: "Cheap valuation.",
      computedAt: "2026-06-05T00:00:00Z",
      is_estimate: true,
      source_tier: 4,
    };
    restore = mockSnapshotFetch(makeSnapshotWithYield(yieldPayload));

    const response = await callTool(server, "get_yield_spread_signal");
    expect(Array.isArray(response.content)).toBe(true);
    expect(response.content[0]?.type).toBe("text");
    expect(() => JSON.parse(response.content[0]?.text ?? "")).not.toThrow();
  });

  it("Tool returns all required YieldSignalDTO fields", async () => {
    const yieldPayload = {
      label: "CHEAP",
      spread: 3.2,
      earningYield: 8.2,
      depositRate: 5.0,
      reasoning: "Market is cheap.",
      computedAt: "2026-06-05T00:00:00Z",
      is_estimate: true,
      source_tier: 4,
    };
    restore = mockSnapshotFetch(makeSnapshotWithYield(yieldPayload));

    const response = await callTool(server, "get_yield_spread_signal");
    const result = JSON.parse(response.content[0]!.text) as Record<string, unknown>;

    expect(result).toHaveProperty("label");
    expect(result).toHaveProperty("spread");
    expect(result).toHaveProperty("earningYield");
    expect(result).toHaveProperty("depositRate");
    expect(result).toHaveProperty("reasoning");
    expect(result).toHaveProperty("computedAt");
    expect(result).toHaveProperty("source_tier");
    expect(result).toHaveProperty("is_estimate");
  });
});
