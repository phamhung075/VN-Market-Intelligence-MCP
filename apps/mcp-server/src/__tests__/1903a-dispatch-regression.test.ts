/**
 * Task 1903a — MCP dispatch/schema collision regression-shape guard
 *
 * Suite A (WAV-REG-01..07): write_alert_verdict returns correct JSON shape,
 *   not stale "Message sent" Telegram string from a prior handler collision.
 * Suite B (GMS-REG-02..04): get_macro_snapshot returns macro regime content,
 *   not electricity/portfolio bleed (1898a precedent: 084:237-271, 089:349-373).
 *
 * Strategy (C1 FIX-CI-C1-MACRO-INJECT-SEAM-TESTS — Suite B only):
 * - GMS-REG-02: OLD assertion `toContain("[Macro Signal Summary]")` is no longer valid.
 *   The Go service returns JSON, not formatted text sections.
 *   NEW assertion: response envelope has source_tier + parseable inner text with signals.
 * - GMS-REG-03: negative-space guards (no ĐIỆN LỰC / portfolio) — still valid, kept.
 * - GMS-REG-04: content.length === 1 — still valid, kept.
 * - globalThis.fetch mock added (beforeAll pattern from 1881a) to intercept POST /snapshot.
 * - Suite A is UNCHANGED.
 */

// DB_PATH must be set before any import that triggers getDb()
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeAll, afterAll, mock } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

mock.module("../infrastructure/rag/retriever.js", () => ({
  searchContext: async () => [],
  insertAnalysis: async () => {},
}));

import { initDatabase, closeDb } from "../infrastructure/db/schema.js";
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
  args: Record<string, unknown> = {},
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
// Lifecycle — fetch mock for Suite B
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
        oilUsd: 106.06,
        goldUsd: 2340.5,
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
          oil: { impact: "HIGH", priceUSD: 106.06 },
          gold: { direction: "BULLISH", priceUSD: 2340.5 },
          usdvnd: { direction: "STABLE", rateVND: 25450.0 },
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
// Fixtures
// ---------------------------------------------------------------------------

// Mirrors live re-verification input from REQ_1903a.md
const VALID_WAV_INPUT = {
  ticker: "VCB",
  direction: "bullish" as const,
  conviction: 0.7,
  alertSource: "verified_chain" as const,
  firedAt: "2026-05-13T16:42:00.000Z",
};

// ---------------------------------------------------------------------------
// Suite A — write_alert_verdict shape guard (WAV-REG-01..07) — UNCHANGED
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

  it("GMS-REG-02: response is a valid JSON envelope with source_tier and signals (replaces '[Macro Signal Summary]' section check)", async () => {
    const server = makeMacroServer();
    const result = await callMacroTool(server, "get_macro_snapshot");

    const raw = JSON.parse(firstText(result)) as { source_tier: number; text: string; fetchedAt: string };
    expect(typeof raw.source_tier).toBe("number");
    expect(typeof raw.text).toBe("string");

    // Inner payload must contain signals (the new form of "macro signal summary")
    const inner = JSON.parse(raw.text) as Record<string, unknown>;
    expect(inner.signals).toBeDefined();
    const signals = inner.signals as Record<string, unknown>;
    expect(signals.carry).toBeDefined();
  });

  it("GMS-REG-03: 'thép' guard — sector bleed absent; electricity/portfolio never present", async () => {
    const server = makeMacroServer();
    const result = await callMacroTool(server, "get_macro_snapshot");
    const text = firstText(result);
    // If 'thép' present, macro source_tier must also be present (not pure sector bleed)
    if (text.includes("thép")) {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      expect(typeof parsed.source_tier).toBe("number");
    }
    expect(text).not.toContain("ĐIỆN LỰC");
    expect(text).not.toContain("TRẠNG THÁI ĐIỆN");
    expect(text).not.toContain("portfolio");
    expect(text).not.toContain("positions");
  });

  it("GMS-REG-04: result.content.length === 1 (single text item, not array of portfolio rows)", async () => {
    const server = makeMacroServer();
    const result = await callMacroTool(server, "get_macro_snapshot");
    expect(result.content).toHaveLength(1);
  });

});
