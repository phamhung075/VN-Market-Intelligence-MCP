/**
 * Task 089 — get_macro_snapshot MCP Tool Tests
 *
 * Tests for the macro snapshot tool that aggregates commodity prices
 * (Yahoo Finance) and SBV central bank rates.
 *
 * Strategy:
 * - DB_PATH set to :memory: before any import to prevent module-level side effects.
 * - LanceDB-dependent modules are mocked.
 * - _testCommodityClient and _testSbvClient injection used for all HTTP calls.
 * - Pre-resolved snapshot objects are injected to avoid building HTML fixtures.
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
// Types (mirrors the fetcher interfaces)
// ---------------------------------------------------------------------------

interface CommoditySnapshot {
  brentCrudeUSD: number;
  goldUSDPerOz: number;
  usdVndRate: number;
  fetchedAt: string;
}

interface SbvMacroSnapshot {
  overnightRatePct: number;
  refinancingRatePct: number;
  discountRatePct: number;
  maxDepositRatePct: number;
  maxLendingRatePct: number;
  interbankOvernightPct: number;
  usdVndOfficial: number;
  fetchedAt: string;
}

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
  args: Record<string, unknown>,
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

function makeServer(): McpServer {
  const server = new McpServer(
    { name: "test-server", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );
  registerMacroTools(server);
  return server;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COMMODITY_NORMAL: CommoditySnapshot = {
  brentCrudeUSD: 84.37,
  goldUSDPerOz: 1950.50,
  usdVndRate: 25450.0,
  fetchedAt: new Date().toISOString(),
};

const SBV_NORMAL: SbvMacroSnapshot = {
  overnightRatePct: 5.0,
  refinancingRatePct: 4.5,
  discountRatePct: 4.5,
  maxDepositRatePct: 5.0,
  maxLendingRatePct: 9.0,
  interbankOvernightPct: 4.8,
  usdVndOfficial: 25452.0,
  fetchedAt: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeAll(async () => {
  await initDatabase();
});

afterAll(() => {
  closeDb();
});

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe("Task 089 — get_macro_snapshot MCP tool", () => {

  // MT-01: Happy path — both fetchers return data
  it("MT-01: happy path — output contains all sections when both fetchers return data", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot", {
      _testCommodityClient: COMMODITY_NORMAL,
      _testSbvClient: SBV_NORMAL,
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0]?.type).toBe("text");

    const text = firstText(result);
    expect(text).toContain("=== Macro Snapshot ===");
    expect(text).toContain("[Commodity Prices]");
    expect(text).toContain("[SBV Central Bank Rates]");
    expect(text).toContain("[Macro Signal Summary]");
    expect(text).toContain("Generated:");
  });

  // MT-02: Commodity data null — commodity section shows "unavailable"
  it("MT-02: commodity null — commodity section shows unavailable", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot", {
      _testCommodityClient: null,
      _testSbvClient: SBV_NORMAL,
    });

    const text = firstText(result);
    expect(text).toContain("[Commodity Prices]");
    expect(text).toContain("unavailable");
    // SBV section should still show data
    expect(text).toContain("Refinancing Rate");
  });

  // MT-03: SBV data null — SBV section shows "unavailable"
  it("MT-03: SBV null — SBV section shows unavailable", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot", {
      _testCommodityClient: COMMODITY_NORMAL,
      _testSbvClient: null,
    });

    const text = firstText(result);
    expect(text).toContain("[SBV Central Bank Rates]");
    expect(text).toContain("unavailable");
    // Commodity section should still show data
    expect(text).toContain("Brent Crude");
  });

  // MT-04: Both null — all unavailable
  it("MT-04: both null — tool returns valid response with all unavailable", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot", {
      _testCommodityClient: null,
      _testSbvClient: null,
    });

    const text = firstText(result);
    expect(text).toContain("=== Macro Snapshot ===");
    expect(text).toContain("[Commodity Prices]");
    expect(text).toContain("[SBV Central Bank Rates]");
    // Both sections show unavailable
    const matches = text.match(/unavailable/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  // MT-05: High oil signal (brent=95)
  it("MT-05: high oil signal when brent > 90", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot", {
      _testCommodityClient: { ...COMMODITY_NORMAL, brentCrudeUSD: 95.0 },
      _testSbvClient: SBV_NORMAL,
    });

    const text = firstText(result);
    expect(text).toContain("CAO");
    expect(text).toContain("dầu khí");
  });

  // MT-06: Low oil signal (brent=60)
  it("MT-06: low oil signal when brent < 70", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot", {
      _testCommodityClient: { ...COMMODITY_NORMAL, brentCrudeUSD: 60.0 },
      _testSbvClient: SBV_NORMAL,
    });

    const text = firstText(result);
    expect(text).toContain("THẤP");
    expect(text).toContain("dầu khí");
  });

  // MT-07: High gold signal (gold=2500)
  it("MT-07: high gold signal when gold > 2000", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot", {
      _testCommodityClient: { ...COMMODITY_NORMAL, goldUSDPerOz: 2500.0 },
      _testSbvClient: SBV_NORMAL,
    });

    const text = firstText(result);
    expect(text).toContain("CAO ($");
    expect(text).toContain("vàng");
  });

  // MT-08: Tight policy signal (refi=7)
  it("MT-08: tight policy signal when refinancing rate > 6%", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot", {
      _testCommodityClient: COMMODITY_NORMAL,
      _testSbvClient: { ...SBV_NORMAL, refinancingRatePct: 7.0 },
    });

    const text = firstText(result);
    expect(text).toContain("THẮT CHẶT");
    expect(text).toContain("ngân hàng");
    expect(text).toContain("bất động sản");
  });

  // MT-09: Loose policy signal (refi=3)
  it("MT-09: loose policy signal when refinancing rate < 4%", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot", {
      _testCommodityClient: COMMODITY_NORMAL,
      _testSbvClient: { ...SBV_NORMAL, refinancingRatePct: 3.0 },
    });

    const text = firstText(result);
    expect(text).toContain("NỚI LỎNG");
    expect(text).toContain("ngân hàng");
    expect(text).toContain("bất động sản");
  });

  // MT-10: High USD/VND signal (26000)
  it("MT-10: high USD/VND signal when rate > 25500", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot", {
      _testCommodityClient: { ...COMMODITY_NORMAL, usdVndRate: 26000.0 },
      _testSbvClient: SBV_NORMAL,
    });

    const text = firstText(result);
    expect(text).toContain("HIGH (USD/VND");
    expect(text).toContain("trên 25500");
    expect(text).toContain("hàng không");
    expect(text).toContain("thép");
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

  // Additional: Neutral signals display correctly
  it("neutral oil signal (brent between 70-90)", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot", {
      _testCommodityClient: { ...COMMODITY_NORMAL, brentCrudeUSD: 80.0 },
      _testSbvClient: SBV_NORMAL,
    });

    const text = firstText(result);
    expect(text).not.toContain("CAO ($");
    expect(text).not.toContain("THẤP ($");
    expect(text).toContain("bình thường");
  });

  it("neutral gold signal (gold <= 2000)", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot", {
      _testCommodityClient: { ...COMMODITY_NORMAL, goldUSDPerOz: 1800.0 },
      _testSbvClient: SBV_NORMAL,
    });

    const text = firstText(result);
    expect(text).toContain("bình thường ($");
  });

  it("neutral USD/VND signal (rate <= 25500)", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot", {
      _testCommodityClient: { ...COMMODITY_NORMAL, usdVndRate: 25000.0 },
      _testSbvClient: SBV_NORMAL,
    });

    const text = firstText(result);
    expect(text).toContain("LOW (USD/VND");
    expect(text).toContain("below 25500 threshold");
  });

  it("neutral policy signal (refi rate 4-6%)", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot", {
      _testCommodityClient: COMMODITY_NORMAL,
      _testSbvClient: { ...SBV_NORMAL, refinancingRatePct: 5.0 },
    });

    const text = firstText(result);
    expect(text).toContain("bình thường (");
    expect(text).toContain("bình thường");
  });

  // MT-REGRESSION-1898a: response-shape guard — no electricity / portfolio content (stale-build guard)
  it("get_macro_snapshot returns regime/macro shape — no electricity or portfolio content (regression: 1898a / TNB c45 stale-build guard)", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot", {
      _testCommodityClient: COMMODITY_NORMAL,
      _testSbvClient: SBV_NORMAL,
    });

    const text = firstText(result);

    // (i) Contains macro snapshot header — macro handler, not electricity/portfolio handler
    expect(text).toContain("=== Macro Snapshot ===");

    // (ii) Contains expected macro sections
    expect(text).toContain("[Commodity Prices]");
    expect(text).toContain("[SBV Central Bank Rates]");

    // (iii) Must NOT contain electricity content markers (stale-build regression guard)
    expect(text).not.toContain("ĐIỆN LỰC");
    expect(text).not.toContain("TRẠNG THÁI ĐIỆN");

    // (iv) Must NOT contain portfolio content markers (stale-build regression guard)
    expect(text).not.toContain("portfolio");
    expect(text).not.toContain("positions");
  });
});
