/**
 * FIX-MACRO-SNAPSHOT-HUMANIZE-TEXT
 *
 * get_macro_snapshot.text previously returned raw JSON (`JSON.stringify(data)`)
 * while get_market_snapshot.text returns human-readable prose — a latent
 * raw-JSON leak-trap for any future cowork/chef prose-parser that naively
 * echoes `.text` to the MARKET channel (spun from
 * VERIFY-COWORK-MACRO-SNAPSHOT-ENVELOPE, router-verified NO active leak).
 *
 * Fix: `buildMacroSnapshotText()` renders the raw macro-indicators response
 * into a human-readable, section-block-shaped text (same shape family as
 * get_market_snapshot) GENERICALLY — no per-field/per-ticker hardcode, so any
 * current or future macro field is picked up automatically. The raw payload
 * is passed through verbatim as the envelope's `data` field so synthesizing
 * agents still get typed values without parsing prose.
 *
 * Pure-unit tests (MHT-01..MHT-08) exercise buildMacroSnapshotText() directly.
 * Integration tests (MHT-09..MHT-11) exercise the live get_macro_snapshot
 * MCP tool via a mocked globalThis.fetch (same pattern as 089-tool-macro.test.ts).
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeAll, afterAll, mock } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const _realRetrieverFMSHT = { searchContext: async () => [], insertAnalysis: async () => {} };
mock.module("../infrastructure/rag/retriever.js", () => _realRetrieverFMSHT);

import { initDatabase, closeDb } from "../infrastructure/db/schema.js";
import {
  buildMacroSnapshotText,
  registerMacroTools,
} from "../interface/mcp/tools/macro/macroTools.js";

// ---------------------------------------------------------------------------
// Pure-unit tests — buildMacroSnapshotText()
// ---------------------------------------------------------------------------

describe("FIX-MACRO-SNAPSHOT-HUMANIZE-TEXT — buildMacroSnapshotText() pure unit", () => {
  const SAMPLE = {
    status: "ok",
    vnIndex: 1282.5,
    oilUsd: 84,
    goldUsd: 1950.5,
    dataSource: "live",
    signals: {
      carry: {
        regime: "NEUTRAL",
        carrySpread: 1.38,
        is_estimate: false,
        source_tier: 2,
      },
      yield: {
        label: "CHEAP",
        spread: null,
      },
    },
  };

  // MHT-01: closes the raw-JSON leak-trap — text is no longer parseable as JSON.
  it("MHT-01: text is NOT valid JSON (raw-JSON leak-trap closed)", () => {
    const text = buildMacroSnapshotText(SAMPLE, "2026-06-09T00:00:00Z");
    expect(() => JSON.parse(text)).toThrow();
  });

  it("MHT-01b: text does not literally equal JSON.stringify(data) (regression guard)", () => {
    const text = buildMacroSnapshotText(SAMPLE, "2026-06-09T00:00:00Z");
    expect(text).not.toBe(JSON.stringify(SAMPLE, null, 2));
    expect(text).not.toBe(JSON.stringify(SAMPLE));
  });

  it("MHT-02: opens with a [Macro Snapshot] section header", () => {
    const text = buildMacroSnapshotText(SAMPLE, "2026-06-09T00:00:00Z");
    expect(text.startsWith("[Macro Snapshot]")).toBe(true);
  });

  it("MHT-03: top-level scalar fields render generically as 'Label: Value'", () => {
    const text = buildMacroSnapshotText(SAMPLE, "2026-06-09T00:00:00Z");
    expect(text).toContain("Status: ok");
    expect(text).toContain("Data Source: live");
    // camelCase key -> spaced Title Case, no per-field dictionary
    expect(text).toContain("Vn Index: 1282.50");
    expect(text).toContain("Oil Usd: 84");
  });

  it("MHT-04: nested objects render as bracketed [Section] sub-headers with indented fields", () => {
    const text = buildMacroSnapshotText(SAMPLE, "2026-06-09T00:00:00Z");
    expect(text).toContain("[Signals]");
    expect(text).toContain("[Carry]");
    expect(text).toContain("Regime: NEUTRAL");
    expect(text).toContain("[Yield]");
    expect(text).toContain("Label: CHEAP");
  });

  it("MHT-05: numbers — non-integer gets 2 decimals, integer stays plain", () => {
    const text = buildMacroSnapshotText(SAMPLE, "2026-06-09T00:00:00Z");
    expect(text).toContain("Carry Spread: 1.38");
    expect(text).toContain("Source Tier: 2");
  });

  it("MHT-06: null/undefined fields render as honest 'unavailable' (never fabricated)", () => {
    const text = buildMacroSnapshotText(SAMPLE, "2026-06-09T00:00:00Z");
    expect(text).toContain("Spread: unavailable");
  });

  it("MHT-07: trailing 'Generated:' line reflects fetchedAt; null fetchedAt is honest 'unavailable'", () => {
    const withTs = buildMacroSnapshotText(SAMPLE, "2026-06-09T00:00:00Z");
    expect(withTs).toContain("Generated: 2026-06-09T00:00:00Z");

    const withoutTs = buildMacroSnapshotText(SAMPLE, null);
    expect(withoutTs).toContain("Generated: unavailable");
  });

  // MHT-08 (generic_mandate): a brand-new, never-seen-before field is rendered
  // automatically — proves NO per-field/per-ticker hardcode gates this path.
  it("MHT-08: generic_mandate — an unforeseen future field renders automatically, no code change needed", () => {
    const withNewField = {
      ...SAMPLE,
      futureIndicator: { widgetCount: 7, trending: true },
    };
    const text = buildMacroSnapshotText(withNewField, "2026-06-09T00:00:00Z");
    expect(text).toContain("[Future Indicator]");
    expect(text).toContain("Widget Count: 7");
    expect(text).toContain("Trending: true");
  });

  it("MHT-08b: empty data object produces an honest empty-body block, no crash", () => {
    const text = buildMacroSnapshotText({}, null);
    expect(text).toContain("[Macro Snapshot]");
    expect(text).toContain("Generated: unavailable");
  });
});

// ---------------------------------------------------------------------------
// Integration tests — live get_macro_snapshot tool
// ---------------------------------------------------------------------------

async function callTool(
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
  if (!fn) throw new Error(`No callable found for tool: ${toolName}`);
  return fn(args) as Promise<{ content: Array<{ type: string; text: string }> }>;
}

function firstText(result: { content: Array<{ type: string; text: string }> }): string {
  const item = result.content[0];
  if (!item) throw new Error("Tool returned no content items");
  return item.text;
}

function makeServer(): McpServer {
  const server = new McpServer(
    { name: "test-fmsht", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );
  registerMacroTools(server);
  return server;
}

const MOCK_SNAPSHOT = {
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
};

let restoreFetch: (() => void) | undefined;

beforeAll(async () => {
  await initDatabase();

  const originalFetch = globalThis.fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/snapshot")) {
      return new Response(JSON.stringify(MOCK_SNAPSHOT), {
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
  mock.module("../infrastructure/rag/retriever.js", () => _realRetrieverFMSHT);
});

describe("FIX-MACRO-SNAPSHOT-HUMANIZE-TEXT — get_macro_snapshot integration", () => {
  it("MHT-09: envelope.text is human-readable prose (not raw JSON); source_tier stays the first key", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot");

    const envRaw = firstText(result);
    const env = JSON.parse(envRaw) as {
      source_tier: number;
      text: string;
      fetchedAt: string;
      data?: Record<string, unknown>;
    };

    expect(typeof env.text).toBe("string");
    expect(() => JSON.parse(env.text)).toThrow();
    expect(env.text).toContain("[Macro Snapshot]");
    expect(env.text).toContain("[Signals]");
    expect(env.text).toContain("Regime: NEUTRAL");

    // AC-8 (1881a) precedent preserved: source_tier is still the first envelope key.
    expect(Object.keys(env)[0]).toBe("source_tier");
  });

  it("MHT-10: structured envelope fields still present — data.signals.carry.regime readable directly, no JSON.parse(text) needed", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot");

    const env = JSON.parse(firstText(result)) as {
      source_tier: number;
      fetchedAt: string;
      data?: { signals?: { carry?: { regime?: string; vndDepositRate?: number } } };
    };

    expect(env.data).toBeDefined();
    expect(env.data?.signals?.carry?.regime).toBe("NEUTRAL");
    expect(env.data?.signals?.carry?.vndDepositRate).toBe(5.0);
    expect(typeof env.fetchedAt).toBe("string");
  });

  it("MHT-11: no MARKET-channel leak path — text never contains a bare JSON-looking blob starting with '{\"'", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot");

    const env = JSON.parse(firstText(result)) as { text: string };
    expect(env.text.trimStart().startsWith('{"')).toBe(false);
  });
});
