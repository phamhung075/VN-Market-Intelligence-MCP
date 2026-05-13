/**
 * Task 1903a — MCP dispatch/schema collision regression-shape guard
 *
 * Suite A (WAV-REG-01..07): write_alert_verdict returns correct JSON shape,
 *   not stale "Message sent" Telegram string from a prior handler collision.
 * Suite B (GMS-REG-02..04): get_macro_snapshot returns macro regime content,
 *   not electricity/portfolio bleed (1898a precedent: 084:237-271, 089:349-373).
 */

// DB_PATH must be set before any import that triggers getDb()
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, mock } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

mock.module("../infrastructure/rag/retriever.js", () => ({
  searchContext: async () => [],
  insertAnalysis: async () => {},
}));

import { writeAlertVerdict } from "../interface/mcp/tools/alerts/alertVerdictTools.js";
import { registerMacroTools } from "../interface/mcp/tools/macro/macroTools.js";
import type { AlertVerdict } from "../infrastructure/fileStore/alertVerdictStore.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFakeStore() {
  const appended: AlertVerdict[] = [];
  return {
    appended,
    appendOne: async (v: AlertVerdict) => { appended.push(v); },
  };
}

function makeMacroServer(): McpServer {
  const server = new McpServer(
    { name: "test-1903a", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );
  registerMacroTools(server);
  return server;
}

async function callMacroTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const tools = (server as unknown as {
    _registeredTools: Record<string, {
      callback?: (args: Record<string, unknown>) => Promise<unknown>;
      handler?: (args: Record<string, unknown>) => Promise<unknown>;
    }>;
  })._registeredTools;
  const tool = tools[toolName];
  if (!tool) throw new Error(`Tool not registered: ${toolName}`);
  const fn = tool.callback ?? tool.handler;
  if (!fn) throw new Error(`No callable found for: ${toolName}`);
  return fn(args) as Promise<{ content: Array<{ type: string; text: string }> }>;
}

function firstText(result: { content: Array<{ type: string; text: string }> }): string {
  const item = result.content[0];
  if (!item) throw new Error("Tool returned no content items");
  return item.text;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COMMODITY_FIXTURE = {
  brentCrudeUSD: 106.06,
  goldUSDPerOz: 2340.50,
  usdVndRate: 25450.0,
  fetchedAt: new Date().toISOString(),
};

const SBV_FIXTURE = {
  overnightRatePct: 3.0,
  refinancingRatePct: 4.5,
  discountRatePct: 4.0,
  maxDepositRatePct: 5.0,
  maxLendingRatePct: 9.0,
  interbankOvernightPct: 4.8,
  usdVndOfficial: 25452.0,
  fetchedAt: new Date().toISOString(),
};

// Mirrors live re-verification input from REQ_1903a.md
const VALID_WAV_INPUT = {
  ticker: "VCB",
  direction: "bullish" as const,
  conviction: 0.7,
  alertSource: "verified_chain" as const,
  firedAt: "2026-05-13T16:42:00.000Z",
};

// ---------------------------------------------------------------------------
// Suite A — write_alert_verdict shape guard (WAV-REG-01..07)
// ---------------------------------------------------------------------------

describe("1903a — Suite A: write_alert_verdict shape guard", () => {

  it("WAV-REG-01: response serialises as valid JSON object (not a bare string)", async () => {
    const store = makeFakeStore();
    const result = await writeAlertVerdict(VALID_WAV_INPUT, { store });
    const text = JSON.stringify(result);
    expect(() => JSON.parse(text)).not.toThrow();
    const parsed = JSON.parse(text) as unknown;
    expect(typeof parsed).toBe("object");
    expect(parsed).not.toBeNull();
  });

  it("WAV-REG-02: result.success is true on happy path", async () => {
    const store = makeFakeStore();
    const result = await writeAlertVerdict(VALID_WAV_INPUT, { store });
    expect(result.success).toBe(true);
  });

  it("WAV-REG-03: result.id is a non-empty string (UUID present)", async () => {
    const store = makeFakeStore();
    const result = await writeAlertVerdict(VALID_WAV_INPUT, { store });
    expect(typeof result.id).toBe("string");
    expect(result.id.length).toBeGreaterThan(0);
  });

  it("WAV-REG-04: result.ticker echoes back uppercase 'VCB'", async () => {
    const store = makeFakeStore();
    const result = await writeAlertVerdict(VALID_WAV_INPUT, { store });
    expect(result.ticker).toBe("VCB");
  });

  it("WAV-REG-05: result.verdict is 'pending' at fire time", async () => {
    const store = makeFakeStore();
    const result = await writeAlertVerdict(VALID_WAV_INPUT, { store });
    expect(result.verdict).toBe("pending");
  });

  it("WAV-REG-06: serialised text does NOT contain 'Message sent' (stale-handler guard)", async () => {
    const store = makeFakeStore();
    const result = await writeAlertVerdict(VALID_WAV_INPUT, { store });
    // Stale build returned a Telegram confirmation string instead of JSON shape
    expect(JSON.stringify(result)).not.toContain("Message sent");
  });

  it("WAV-REG-07: result.success is not undefined — shape not degraded to bare string", async () => {
    const store = makeFakeStore();
    const result = await writeAlertVerdict(VALID_WAV_INPUT, { store });
    expect(result.success).not.toBeUndefined();
  });

});

// ---------------------------------------------------------------------------
// Suite B — get_macro_snapshot shape guard (GMS-REG-02..04)
// GMS-REG-01 / MT-REGRESSION-1898a already covered in 089-tool-macro.test.ts
// ---------------------------------------------------------------------------

describe("1903a — Suite B: get_macro_snapshot shape guard", () => {

  it("GMS-REG-02: response contains '[Macro Signal Summary]' section header", async () => {
    const server = makeMacroServer();
    const result = await callMacroTool(server, "get_macro_snapshot", {
      _testCommodityClient: COMMODITY_FIXTURE,
      _testSbvClient: SBV_FIXTURE,
    });
    expect(firstText(result)).toContain("[Macro Signal Summary]");
  });

  it("GMS-REG-03: 'thép' guard — sector bleed absent; electricity/portfolio never present", async () => {
    const server = makeMacroServer();
    const result = await callMacroTool(server, "get_macro_snapshot", {
      _testCommodityClient: COMMODITY_FIXTURE,
      _testSbvClient: SBV_FIXTURE,
    });
    const text = firstText(result);
    // If 'thép' present, macro header must also be present (not pure sector bleed)
    if (text.includes("thép")) {
      expect(text).toContain("=== Macro Snapshot ===");
    }
    expect(text).not.toContain("ĐIỆN LỰC");
    expect(text).not.toContain("TRẠNG THÁI ĐIỆN");
    expect(text).not.toContain("portfolio");
    expect(text).not.toContain("positions");
  });

  it("GMS-REG-04: result.content.length === 1 (single text item, not array of portfolio rows)", async () => {
    const server = makeMacroServer();
    const result = await callMacroTool(server, "get_macro_snapshot", {
      _testCommodityClient: COMMODITY_FIXTURE,
      _testSbvClient: SBV_FIXTURE,
    });
    expect(result.content).toHaveLength(1);
  });

});
