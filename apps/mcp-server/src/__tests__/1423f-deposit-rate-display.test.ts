/**
 * Task 1423f — Max Deposit Rate display in macro snapshot
 *
 * Verifies that formatMacroSnapshot (via the get_macro_snapshot tool path)
 * includes "Max Deposit Rate:" in the [SBV Central Bank Rates] section.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, mock } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

mock.module("../infrastructure/rag/retriever.js", () => ({
  searchContext: async () => [],
  insertAnalysis: async () => {},
}));

import { registerMacroTools } from "../interface/mcp/tools/macro/macroTools.js";
import type { SbvMacroSnapshot } from "../infrastructure/fetchers/sbv.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>,
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

const BASE_SBV: SbvMacroSnapshot = {
  overnightRatePct: 3.0,
  refinancingRatePct: 4.5,
  usdVndOfficial: 25430.0,
  discountRatePct: 1.5,
  maxDepositRatePct: 5.0,
  maxLendingRatePct: 12.0,
  interbankOvernightPct: 4.0,
  fetchedAt: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Task 1423f — Max Deposit Rate display", () => {
  it("includes Max Deposit Rate line in SBV section", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot", {
      _testCommodityClient: null,
      _testSbvClient: BASE_SBV,
    });

    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Max Deposit Rate:");
    expect(text).toContain("5.00%");
  });

  it("shows Max Deposit Rate AFTER Refinancing Rate line", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot", {
      _testCommodityClient: null,
      _testSbvClient: BASE_SBV,
    });

    const text = result.content[0]?.text ?? "";
    const refiIdx = text.indexOf("Refinancing Rate:");
    const depositIdx = text.indexOf("Max Deposit Rate:");
    expect(refiIdx).toBeGreaterThan(-1);
    expect(depositIdx).toBeGreaterThan(refiIdx);
  });

  it("shows 0.00% when maxDepositRatePct is 0", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot", {
      _testCommodityClient: null,
      _testSbvClient: { ...BASE_SBV, maxDepositRatePct: 0 },
    });

    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Max Deposit Rate:  0.00%");
  });
});
