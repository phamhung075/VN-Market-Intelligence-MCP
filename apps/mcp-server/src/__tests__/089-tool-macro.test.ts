/**
 * Task 089 — get_macro_snapshot MCP Tool Tests
 *
 * Tests for the macro snapshot tool that proxies to the macro-indicators
 * Go microservice (port 5004) and returns a { source_tier, text, fetchedAt }
 * JSON wrapper.
 *
 * Strategy (C1 FIX-CI-C1-MACRO-INJECT-SEAM-TESTS):
 * - DB_PATH set to :memory: before any import to prevent module-level side effects.
 * - LanceDB-dependent modules are mocked.
 * - globalThis.fetch is mocked in beforeAll to intercept POST /snapshot calls.
 *   This is the new injection point after the P2-B1 HTTP rewire removed
 *   _testCommodityClient / _testSbvClient injection seams (commit 98df0f43).
 * - All assertions updated from section-header strings to JSON field checks
 *   against the { source_tier, text: JSON.stringify(MacroSnapshotResponse), fetchedAt } wrapper.
 */

// Set DB_PATH before any import that triggers getDb() (needed for hnx.ts module-level init)
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeAll, afterAll, mock } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Mock LanceDB-dependent retriever so it never initialises a real vector store
mock.module("../infrastructure/rag/retriever.js", () => ({
  searchContext: async () => [],
  insertAnalysis: async () => {},
}));

import { initDatabase, closeDb } from "../infrastructure/db/schema.js";
import { registerMacroTools } from "../interface/mcp/tools/macro/macroTools.js";
import { registerMacroTools as registerMacroToolsFromIndex } from "../interface/mcp/tools/index.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Call a tool on a McpServer using the internal tool registry.
 * Works with both .callback and .handler property shapes.
 */
async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const tools = (server as unknown as {
    _registeredTools: Record<string, {
      callback?: (args: Record<string, unknown>) => Promise<unknown>;
      handler?: (args: Record<string, unknown>) => Promise<unknown>;
    }>
  })._registeredTools;

  const tool = tools[toolName];
  if (!tool) throw new Error(`Tool not registered: ${toolName}`);

  const fn = tool.callback ?? tool.handler;
  if (!fn) throw new Error(`No callable found for tool: ${toolName}`);

  return fn(args) as Promise<{ content: Array<{ type: string; text: string }> }>;
}

/** Extract the first text content item from a tool result (asserts it exists). */
function firstText(result: { content: Array<{ type: string; text: string }> }): string {
  const item = result.content[0];
  if (!item) throw new Error("Tool returned no content items");
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
// Fetch mock fixture — MacroSnapshotResponse shape from Go service
// ---------------------------------------------------------------------------

/** Build a MacroSnapshotResponse fixture for fetch mock injection. */
function makeMockSnapshot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: "ok",
    fetchedAt: "2026-06-09T00:00:00Z",
    vnIndex: 1282.5,
    oilUsd: 84.37,
    goldUsd: 1950.5,
    usdVnd: 25450.0,
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
      oil: { impact: "NEUTRAL", priceUSD: 84.37 },
      gold: { direction: "BULLISH", priceUSD: 1950.5 },
      usdvnd: { direction: "STABLE", rateVND: 25450.0 },
      "investment-clock": { phase: "RECOVERY" },
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

let restoreFetch: (() => void) | undefined;

beforeAll(async () => {
  await initDatabase();

  const originalFetch = globalThis.fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/snapshot")) {
      const snapshot = makeMockSnapshot();
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
// Test suites
// ---------------------------------------------------------------------------

describe("Task 089 — get_macro_snapshot MCP tool", () => {

  // MT-01: Happy path — response is valid { source_tier, text, fetchedAt } envelope
  it("MT-01: happy path — response is a valid JSON envelope with source_tier, text, fetchedAt", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot");

    expect(result.content).toHaveLength(1);
    expect(result.content[0]?.type).toBe("text");

    const env = parseEnvelope(result);
    expect(typeof env.source_tier).toBe("number");
    expect(typeof env.text).toBe("string");
    expect(typeof env.fetchedAt).toBe("string");
  });

  // MT-02: Inner text contains oilUsd field (replaces "[Commodity Prices]" section check)
  it("MT-02: inner text contains oilUsd field (commodity data present)", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot");

    const inner = parseInner(result);
    expect(typeof inner.oilUsd).toBe("number");
    expect(inner.oilUsd as number).toBeGreaterThan(0);
  });

  // MT-03: Inner text contains carry signal (replaces "[SBV Central Bank Rates]" check)
  it("MT-03: inner text contains carry signal from Go service", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot");

    const inner = parseInner(result);
    const signals = inner.signals as Record<string, unknown> | undefined;
    expect(signals).toBeDefined();
    const carry = signals?.carry as Record<string, unknown> | undefined;
    expect(carry).toBeDefined();
    expect(typeof carry?.vndDepositRate).toBe("number");
  });

  // MT-04: source_tier is a number >= 1 (replaces "all unavailable" check)
  it("MT-04: source_tier is a valid tier number", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot");

    const env = parseEnvelope(result);
    expect(env.source_tier).toBeGreaterThanOrEqual(1);
    expect(env.source_tier).toBeLessThanOrEqual(4);
  });

  // MT-05: signals.oil.priceUSD present (replaces brent > 90 check)
  it("MT-05: signals.oil.priceUSD present in inner payload", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot");

    const inner = parseInner(result);
    const signals = inner.signals as Record<string, unknown> | undefined;
    const oil = signals?.oil as Record<string, unknown> | undefined;
    expect(typeof oil?.priceUSD).toBe("number");
  });

  // MT-06: signals.gold.priceUSD present (replaces "THẤP / dầu khí" check)
  it("MT-06: signals.gold.priceUSD present in inner payload", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot");

    const inner = parseInner(result);
    const signals = inner.signals as Record<string, unknown> | undefined;
    const gold = signals?.gold as Record<string, unknown> | undefined;
    expect(typeof gold?.priceUSD).toBe("number");
  });

  // MT-07: signals.gold.direction present (replaces "CAO ($2500" check)
  it("MT-07: signals.gold.direction present in inner payload", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot");

    const inner = parseInner(result);
    const signals = inner.signals as Record<string, unknown> | undefined;
    const gold = signals?.gold as Record<string, unknown> | undefined;
    expect(typeof gold?.direction).toBe("string");
  });

  // MT-08: signals.carry.regime present (replaces "THẮT CHẶT / ngân hàng" check)
  it("MT-08: signals.carry.regime present in inner payload", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot");

    const inner = parseInner(result);
    const signals = inner.signals as Record<string, unknown> | undefined;
    const carry = signals?.carry as Record<string, unknown> | undefined;
    expect(typeof carry?.regime).toBe("string");
  });

  // MT-09: signals.carry.carrySpread present (replaces "NỚI LỎNG" check)
  it("MT-09: signals.carry.carrySpread present in inner payload", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot");

    const inner = parseInner(result);
    const signals = inner.signals as Record<string, unknown> | undefined;
    const carry = signals?.carry as Record<string, unknown> | undefined;
    expect(typeof carry?.carrySpread).toBe("number");
  });

  // MT-10: signals.usdvnd.rateVND present (replaces "HIGH (USD/VND" check)
  it("MT-10: signals.usdvnd.rateVND present in inner payload", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot");

    const inner = parseInner(result);
    const signals = inner.signals as Record<string, unknown> | undefined;
    const usdvnd = signals?.usdvnd as Record<string, unknown> | undefined;
    expect(typeof usdvnd?.rateVND).toBe("number");
  });

  // MT-11: registerMacroTools importable from tools/index.ts
  it("MT-11: registerMacroTools is importable from tools/index.ts", () => {
    expect(typeof registerMacroToolsFromIndex).toBe("function");
  });

  // MT-12: Tool registered in server (check tool count)
  it("MT-12: tool is registered on the McpServer", () => {
    const server = makeServer();
    const tools = (server as unknown as {
      _registeredTools: Record<string, unknown>
    })._registeredTools;

    expect(tools["get_macro_snapshot"]).toBeDefined();
  });

  // Additional: Inner text is valid JSON string
  it("inner text field is a parseable JSON string containing signals", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot");

    const env = parseEnvelope(result);
    expect(() => JSON.parse(env.text)).not.toThrow();
    const inner = JSON.parse(env.text) as Record<string, unknown>;
    expect(inner.signals).toBeDefined();
  });

  it("fetchedAt field is a non-empty ISO timestamp string", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot");

    const env = parseEnvelope(result);
    expect(env.fetchedAt.length).toBeGreaterThan(0);
    expect(env.fetchedAt).toContain("T");
  });

  it("inner text contains status field from Go service", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot");

    const inner = parseInner(result);
    expect(inner.status).toBe("ok");
  });

  it("inner text contains usdVnd field from Go service", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot");

    const inner = parseInner(result);
    expect(typeof inner.usdVnd).toBe("number");
    expect(inner.usdVnd as number).toBeGreaterThan(0);
  });

  // MT-REGRESSION-1898a: response-shape guard — no electricity / portfolio content (stale-build guard)
  it("get_macro_snapshot returns macro JSON shape — no electricity or portfolio content (regression: 1898a / TNB c45 stale-build guard)", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot");

    const text = firstText(result);

    // (i) Outer envelope is valid JSON with source_tier (macro handler, not electricity/portfolio handler)
    const env = parseEnvelope(result);
    expect(env.source_tier).toBeGreaterThanOrEqual(1);

    // (ii) Inner payload contains expected macro fields
    const inner = parseInner(result);
    expect(inner.signals).toBeDefined();

    // (iii) Must NOT contain electricity content markers (stale-build regression guard)
    expect(text).not.toContain("ĐIỆN LỰC");
    expect(text).not.toContain("TRẠNG THÁI ĐIỆN");

    // (iv) Must NOT contain portfolio content markers (stale-build regression guard)
    expect(text).not.toContain("portfolio");
    expect(text).not.toContain("positions");
  });
});
