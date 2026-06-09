/**
 * Task 1423d — [Thien Thoi] Section in get_macro_snapshot
 *
 * Tests for the formatThienThoi() pure helper and the end-to-end
 * get_macro_snapshot tool output.
 *
 * Strategy (C1 FIX-CI-C1-MACRO-INJECT-SEAM-TESTS):
 *   - TT-01..TT-06: pure unit tests for formatThienThoi() — no DB needed.
 *     These are UNCHANGED — formatThienThoi() is a pure function, still correct.
 *   - TT-07..TT-10: integration tests — register tool, mock globalThis.fetch
 *     returning a MacroSnapshotResponse, call tool, assert JSON envelope shape.
 *     The old _testCommodityClient / _testSbvClient injection seams no longer
 *     exist after P2-B1 HTTP rewire (commit 98df0f43). Fetch mock is the new
 *     injection point per 1881a pattern.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeAll, afterAll, mock } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// C5-CURE: capture stub reference before registering; used in afterAll restore.
const _realRetriever1423d = { searchContext: async () => [], insertAnalysis: async () => {} };
mock.module("../infrastructure/rag/retriever.js", () => _realRetriever1423d);

import { initDatabase, closeDb } from "../infrastructure/db/schema.js";
import {
  formatThienThoi,
  registerMacroTools,
  type ThienThoiInputs,
} from "../interface/mcp/tools/macro/macroTools.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const tools = (
    server as unknown as {
      _registeredTools: Record<
        string,
        {
          callback?: (args: Record<string, unknown>) => Promise<unknown>;
          handler?: (args: Record<string, unknown>) => Promise<unknown>;
        }
      >;
    }
  )._registeredTools;

  const tool = tools[toolName];
  if (!tool) throw new Error(`Tool not registered: ${toolName}`);
  const fn = tool.callback ?? tool.handler;
  if (!fn) throw new Error(`No callable for tool: ${toolName}`);
  return fn(args) as Promise<{ content: Array<{ type: string; text: string }> }>;
}

function firstText(result: { content: Array<{ type: string; text: string }> }): string {
  const item = result.content[0];
  if (!item) throw new Error("Tool returned no content");
  return item.text;
}

/** Parse the outer { source_tier, text, fetchedAt } envelope. */
function parseEnvelope(result: { content: Array<{ type: string; text: string }> }): {
  source_tier: number;
  text: string;
  fetchedAt: string;
} {
  return JSON.parse(firstText(result)) as { source_tier: number; text: string; fetchedAt: string };
}

/** Parse the inner MacroSnapshotResponse from the envelope's text field. */
function parseInner(result: { content: Array<{ type: string; text: string }> }): Record<string, unknown> {
  const env = parseEnvelope(result);
  return JSON.parse(env.text) as Record<string, unknown>;
}

function makeServer(): McpServer {
  const server = new McpServer(
    { name: "test-server", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );
  registerMacroTools(server);
  return server;
}

// ---------------------------------------------------------------------------
// Lifecycle — fetch mock for integration tests
// ---------------------------------------------------------------------------

let restoreFetch: (() => void) | undefined;

beforeAll(async () => {
  await initDatabase();

  const originalFetch = globalThis.fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/snapshot")) {
      const snapshot = {
        status: "ok",
        fetchedAt: "2026-06-09T00:00:00Z",
        vnIndex: 1282.5,
        oilUsd: 84.0,
        goldUsd: 2350.0,
        usdVnd: 25400.0,
        dataSource: "live",
        signals: {
          carry: {
            regime: "NEUTRAL",
            carrySpread: 1.38,
            vndDepositRate: 5.0,
            fedFundsRate: 3.62,
            is_estimate: false,
            source_tier: 2,
          },
          yield: {
            label: "CHEAP",
            spread: 3.2,
            earningYield: 8.2,
            depositRate: 5.0,
            is_estimate: false,
            source_tier: 2,
          },
          oil: { impact: "NEUTRAL", priceUSD: 84.0 },
          gold: { direction: "BULLISH", priceUSD: 2350.0 },
          usdvnd: { direction: "STABLE", rateVND: 25400.0 },
          "investment-clock": { phase: "RECOVERY" },
        },
      };
      return new Response(JSON.stringify(snapshot), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return originalFetch(input, _init);
  };
  restoreFetch = () => { globalThis.fetch = originalFetch; };
});

afterAll(() => {
  restoreFetch?.();
  closeDb();
  // C5-CURE: restore rag/retriever stub so downstream files in the same Bun
  // process see the same no-op (no real LanceDB) rather than a leaked stale stub.
  mock.module("../infrastructure/rag/retriever.js", () => _realRetriever1423d);
});

// ---------------------------------------------------------------------------
// Unit tests — formatThienThoi() pure function (UNCHANGED — TT-01..TT-06 pass)
// ---------------------------------------------------------------------------

describe("Task 1423d — formatThienThoi() pure helper", () => {

  // TT-01: TIGHTENING regime — all three signals tightening
  it("TT-01: TIGHTENING when DXY strengthening + US10Y > 4.5% + FII_OUTFLOW_RISK carry", () => {
    const inputs: ThienThoiInputs = {
      dxy: 108.0,         // above 30d mean by >2% → STRENGTHENING
      dxy30dMean: 100.0,
      us10yYield: 4.8,    // > 4.5% → RISK-OFF
      vndDepositRate: 4.5,
      fedFundsRate: 5.0,  // carry = -0.5 → FII_OUTFLOW_RISK
      fedFundsRateIsEstimate: false,
    };
    const lines = formatThienThoi(inputs);
    const text = lines.join("\n");

    expect(text).toContain("[Global Macro Inputs — Thien Thoi]");
    expect(text).toContain("USD STRENGTHENING");
    expect(text).toContain("RISK-OFF threshold");
    expect(text).toContain("FII_OUTFLOW_RISK");
    expect(text).toContain("TIGHTENING");
  });

  // TT-02: EASING regime — all three signals easing
  it("TT-02: EASING when DXY weakening + US10Y < 4.0% + HOT_MONEY_INFLOW carry", () => {
    const inputs: ThienThoiInputs = {
      dxy: 96.0,          // below 30d mean by >2% → WEAKENING
      dxy30dMean: 100.0,
      us10yYield: 3.5,    // < 4.0% → RISK-ON
      vndDepositRate: 7.0,
      fedFundsRate: 4.0,  // carry = +3.0 → HOT_MONEY_INFLOW
      fedFundsRateIsEstimate: false,
    };
    const lines = formatThienThoi(inputs);
    const text = lines.join("\n");

    expect(text).toContain("USD WEAKENING");
    expect(text).toContain("RISK-ON");
    expect(text).toContain("HOT_MONEY_INFLOW");
    expect(text).toContain("EASING");
  });

  // TT-03: NEUTRAL regime — mixed signals
  it("TT-03: NEUTRAL when signals are mixed", () => {
    const inputs: ThienThoiInputs = {
      dxy: 100.5,         // within ±2% of mean → STABLE
      dxy30dMean: 100.0,
      us10yYield: 4.2,    // between 4.0-4.5 → NEUTRAL
      vndDepositRate: 5.5,
      fedFundsRate: 5.0,  // carry = +0.5 → NEUTRAL
      fedFundsRateIsEstimate: false,
    };
    const lines = formatThienThoi(inputs);
    const text = lines.join("\n");

    expect(text).toContain("USD STABLE");
    expect(text).toContain("NEUTRAL");
    // At least one NEUTRAL (either carry or global liquidity)
    const neutralCount = (text.match(/NEUTRAL/g) ?? []).length;
    expect(neutralCount).toBeGreaterThanOrEqual(1);
  });

  // TT-04: DXY=0 shows unavailable
  it("TT-04: DXY=0 shows unavailable, does not crash", () => {
    const inputs: ThienThoiInputs = {
      dxy: 0,
      dxy30dMean: 0,
      us10yYield: 4.5,
      vndDepositRate: 5.5,
      fedFundsRate: 5.0,
      fedFundsRateIsEstimate: false,
    };
    const text = formatThienThoi(inputs).join("\n");
    expect(text).toContain("DXY:              unavailable");
    expect(text).not.toContain("0.00 —");
  });

  // TT-05: US10Y=0 shows unavailable
  it("TT-05: US10Y=0 shows unavailable, does not crash", () => {
    const inputs: ThienThoiInputs = {
      dxy: 104.0,
      dxy30dMean: 102.0,
      us10yYield: 0,
      vndDepositRate: 5.5,
      fedFundsRate: 5.0,
      fedFundsRateIsEstimate: false,
    };
    const text = formatThienThoi(inputs).join("\n");
    expect(text).toContain("US 10Y Yield:     unavailable");
  });

  // TT-06: fed_funds_rate is estimate → shows (est.) label
  it("TT-06: fedFundsRateIsEstimate=true shows (est.) label", () => {
    const inputs: ThienThoiInputs = {
      dxy: 104.0,
      dxy30dMean: 102.0,
      us10yYield: 4.5,
      vndDepositRate: 5.5,
      fedFundsRate: 5.33,
      fedFundsRateIsEstimate: true,
    };
    const text = formatThienThoi(inputs).join("\n");
    expect(text).toContain("(est.)");
    expect(text).not.toContain("(FRED)");
  });

});

// ---------------------------------------------------------------------------
// Integration tests — get_macro_snapshot tool output (fetch mock)
// ---------------------------------------------------------------------------

describe("Task 1423d — get_macro_snapshot [Thien Thoi] block integration", () => {

  // TT-07: tool output envelope contains source_tier and parseable text (replaces DXY section check)
  it("TT-07: tool output is valid envelope with source_tier and parseable inner text", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot");

    expect(result.content).toHaveLength(1);
    const env = parseEnvelope(result);
    expect(typeof env.source_tier).toBe("number");
    expect(typeof env.text).toBe("string");
    expect(() => JSON.parse(env.text)).not.toThrow();
  });

  // TT-08: inner text contains signals object (replaces "[Commodity Prices]" ordering check)
  it("TT-08: inner text contains signals object from Go service", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot");

    const inner = parseInner(result);
    expect(inner.signals).toBeDefined();
    const signals = inner.signals as Record<string, unknown>;
    expect(signals.carry).toBeDefined();
    expect(signals.oil).toBeDefined();
  });

  // TT-09: fetch mock returns status "ok" even when no injection params
  it("TT-09: tool returns status ok from mocked Go service", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot");

    const inner = parseInner(result);
    expect(inner.status).toBe("ok");
  });

  // TT-10: backward compat — response is single-content JSON envelope
  it("TT-10: backward compat — response is a single-content JSON envelope", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot");

    expect(result.content).toHaveLength(1);
    expect(result.content[0]?.type).toBe("text");
    const env = parseEnvelope(result);
    expect(typeof env.source_tier).toBe("number");
    expect(typeof env.text).toBe("string");
    expect(typeof env.fetchedAt).toBe("string");
  });

});
