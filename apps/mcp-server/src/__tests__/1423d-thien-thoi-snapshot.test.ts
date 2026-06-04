/**
 * Task 1423d — [Thien Thoi] Section in get_macro_snapshot
 *
 * Tests for the formatThienThoi() pure helper and the end-to-end
 * get_macro_snapshot tool output (with DB seed via _testCommodityClient
 * injection + direct DB write for tracked_indicators).
 *
 * Strategy:
 *   - TT-01..TT-06: pure unit tests for formatThienThoi() — no DB needed.
 *   - TT-07..TT-09: integration tests — register tool, seed DB, call tool,
 *     assert [Thien Thoi] block appears in output.
 *   - TT-10: existing section headings still present (backward compat).
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeAll, afterAll, mock } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

mock.module("../infrastructure/rag/retriever.js", () => ({
  searchContext: async () => [],
  insertAnalysis: async () => {},
}));

import { initDatabase, closeDb, getDb } from "../infrastructure/db/schema.js";
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
  args: Record<string, unknown>,
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

const COMMODITY_FULL = {
  brentCrudeUSD: 84.0,
  goldUSDPerOz: 2350.0,
  usdVndRate: 25400.0,
  fetchedAt: new Date().toISOString(),
  vix: 18.0,
  sp500: 5100.0,
  shanghaiComp: 3200.0,
  hangSeng: 18000.0,
  dxy: 104.2,
  cnyVndRate: null, // DSI-INV-1: unavailable, not a live rate
  copperUSD: 4.5,
  silverUSDPerOz: 28.0,
  jpyVndRate: 170.0,
  us10yYield: 4.52,
};

const SBV_FULL = {
  overnightRatePct: 3.0,
  refinancingRatePct: 4.5,
  usdVndOfficial: 25410.0,
  discountRatePct: 1.5,
  maxDepositRatePct: 5.5,
  maxLendingRatePct: 12.0,
  interbankOvernightPct: 4.0,
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
// Unit tests — formatThienThoi() pure function
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
// Integration tests — get_macro_snapshot tool output
// ---------------------------------------------------------------------------

describe("Task 1423d — get_macro_snapshot [Thien Thoi] block integration", () => {

  // TT-07: tool output contains Thien Thoi block with DXY data
  it("TT-07: tool output starts with [Thien Thoi] block when commodity has dxy > 0", async () => {
    const db = getDb();
    // Seed fed_funds_rate in tracked_indicators
    db.run(
      `INSERT INTO tracked_indicators (indicator, value, unit, source, extracted_at)
       VALUES ('fed_funds_rate', 5.33, '%', 'fred', datetime('now'))`,
    );

    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot", {
      _testCommodityClient: COMMODITY_FULL,
      _testSbvClient: SBV_FULL,
    });

    const text = firstText(result);
    expect(text).toContain("[Global Macro Inputs — Thien Thoi]");
    expect(text).toContain("DXY:");
    expect(text).toContain("US 10Y Yield:");
    expect(text).toContain("Fed Funds Rate:");
    expect(text).toContain("VND Carry Spread:");
    expect(text).toContain("Global Liquidity:");
  });

  // TT-08: Thien Thoi block appears BEFORE [Commodity Prices]
  it("TT-08: [Thien Thoi] block appears before [Commodity Prices]", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot", {
      _testCommodityClient: COMMODITY_FULL,
      _testSbvClient: SBV_FULL,
    });

    const text = firstText(result);
    const thienIdx = text.indexOf("[Global Macro Inputs — Thien Thoi]");
    const commodIdx = text.indexOf("[Commodity Prices]");
    expect(thienIdx).toBeGreaterThanOrEqual(0);
    expect(commodIdx).toBeGreaterThanOrEqual(0);
    expect(thienIdx).toBeLessThan(commodIdx);
  });

  // TT-09: commodity null — Thien Thoi block degrades gracefully
  it("TT-09: commodity=null — Thien Thoi shows unavailable for DXY and US10Y", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot", {
      _testCommodityClient: null,
      _testSbvClient: SBV_FULL,
    });

    const text = firstText(result);
    // Block still rendered (fed_funds_rate is in DB or falls back)
    expect(text).toContain("[Global Macro Inputs — Thien Thoi]");
    expect(text).toContain("unavailable");
  });

  // TT-10: backward compat — existing sections still present
  it("TT-10: backward compat — existing sections still present alongside Thien Thoi", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot", {
      _testCommodityClient: COMMODITY_FULL,
      _testSbvClient: SBV_FULL,
    });

    const text = firstText(result);
    expect(text).toContain("=== Macro Snapshot ===");
    expect(text).toContain("[Commodity Prices]");
    expect(text).toContain("[SBV Central Bank Rates]");
    expect(text).toContain("[Macro Signal Summary]");
  });

});
