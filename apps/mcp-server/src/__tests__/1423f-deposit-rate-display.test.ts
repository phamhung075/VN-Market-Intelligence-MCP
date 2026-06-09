/**
 * Task 1423f — Max Deposit Rate display in macro snapshot
 *
 * Verifies that the get_macro_snapshot tool includes deposit rate data
 * in the signals.carry.vndDepositRate field of the JSON response.
 *
 * Strategy (C1 FIX-CI-C1-MACRO-INJECT-SEAM-TESTS):
 * - The tool now proxies to the Go macro-indicators service (P2-B1 rewire).
 * - Old _testSbvClient injection seam no longer exists (commit 98df0f43).
 * - globalThis.fetch is mocked to inject controlled MacroSnapshotResponse data.
 * - Assertions updated from "Max Deposit Rate:" text-section checks to
 *   signals.carry.vndDepositRate JSON field checks.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeAll, afterAll, mock } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

mock.module("../infrastructure/rag/retriever.js", () => ({
  searchContext: async () => [],
  insertAnalysis: async () => {},
}));

import { initDatabase, closeDb } from "../infrastructure/db/schema.js";
import { registerMacroTools } from "../interface/mcp/tools/macro/macroTools.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const tools = (server as unknown as {
    _registeredTools: Record<
      string,
      {
        callback?: (args: Record<string, unknown>) => Promise<unknown>;
        handler?: (args: Record<string, unknown>) => Promise<unknown>;
      }
    >;
  })._registeredTools;

  const tool = tools[toolName];
  if (!tool) throw new Error(`Tool not registered: ${toolName}`);

  const fn = tool.callback ?? tool.handler;
  if (!fn) throw new Error(`No callable found for tool: ${toolName}`);

  return fn(args) as Promise<{ content: Array<{ type: string; text: string }> }>;
}

function makeServer(): McpServer {
  const server = new McpServer(
    { name: "test-server", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );
  registerMacroTools(server);
  return server;
}

/** Parse the outer { source_tier, text, fetchedAt } envelope. */
function parseEnvelope(result: { content: Array<{ type: string; text: string }> }): {
  source_tier: number;
  text: string;
  fetchedAt: string;
} {
  const text = result.content[0]?.text ?? "";
  return JSON.parse(text) as { source_tier: number; text: string; fetchedAt: string };
}

/** Parse the inner MacroSnapshotResponse from the envelope's text field. */
function parseInner(result: { content: Array<{ type: string; text: string }> }): Record<string, unknown> {
  const env = parseEnvelope(result);
  return JSON.parse(env.text) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Lifecycle — fetch mock with deposit rate fixture
// ---------------------------------------------------------------------------

let restoreFetch: (() => void) | undefined;

/** The deposit rate value injected via fetch mock. */
const MOCK_DEPOSIT_RATE = 5.0;
/** A second deposit rate value for the "ordered appearance" test. */
const MOCK_DEPOSIT_RATE_ZERO = 0.0;

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
        usdVnd: 25430.0,
        dataSource: "live",
        signals: {
          carry: {
            regime: "NEUTRAL",
            carrySpread: 1.38,
            vndDepositRate: MOCK_DEPOSIT_RATE,
            fedFundsRate: 3.62,
            refinancingRatePct: 4.5,
            is_estimate: false,
            source_tier: 2,
          },
          yield: {
            label: "CHEAP",
            spread: 3.2,
            earningYield: 8.2,
            depositRate: MOCK_DEPOSIT_RATE,
            is_estimate: false,
            source_tier: 2,
          },
          oil: { impact: "NEUTRAL", priceUSD: 84.0 },
          gold: { direction: "BULLISH", priceUSD: 2350.0 },
          usdvnd: { direction: "STABLE", rateVND: 25430.0 },
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
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Task 1423f — Max Deposit Rate display", () => {
  it("includes vndDepositRate in signals.carry (replaces 'Max Deposit Rate:' text section)", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot");

    const inner = parseInner(result);
    const signals = inner.signals as Record<string, unknown>;
    const carry = signals.carry as Record<string, unknown>;
    // vndDepositRate maps to what was previously "Max Deposit Rate:" in the old text section
    expect(typeof carry.vndDepositRate).toBe("number");
    expect(carry.vndDepositRate).toBe(MOCK_DEPOSIT_RATE);
  });

  it("signals.carry.vndDepositRate appears in inner JSON (replaces ordering assertion)", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot");

    // signals.yield.depositRate should also match
    const inner = parseInner(result);
    const signals = inner.signals as Record<string, unknown>;
    const carry = signals.carry as Record<string, unknown>;
    const yieldSig = signals.yield as Record<string, unknown>;
    // Both carry and yield sub-objects reference the deposit rate
    expect(carry.vndDepositRate).toBe(MOCK_DEPOSIT_RATE);
    expect(yieldSig.depositRate).toBe(MOCK_DEPOSIT_RATE);
  });

  it("deposit rate value is a positive number in mock response", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot");

    const inner = parseInner(result);
    const signals = inner.signals as Record<string, unknown>;
    const carry = signals.carry as Record<string, unknown>;
    // In the mock, MOCK_DEPOSIT_RATE=5.0, so it is > 0
    expect(carry.vndDepositRate as number).toBeGreaterThan(MOCK_DEPOSIT_RATE_ZERO);
  });
});
