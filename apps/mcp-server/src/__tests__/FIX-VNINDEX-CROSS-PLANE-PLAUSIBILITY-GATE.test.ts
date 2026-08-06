/**
 * FIX-VNINDEX-CROSS-PLANE-PLAUSIBILITY-GATE — Integration Tests
 *
 * Reproduces the 2026-07-15 dish-933 incident inputs end-to-end through the
 * live get_macro_snapshot MCP tool handler: a tier-4 is_estimate
 * macro_snapshot.vnIndex (1280.5) vs. a genuinely independent local
 * vn_index_cache reference (1782.12) — asserting the gate replaces the
 * vnIndex-derived fields with an explicit gap-token BEFORE either downstream
 * consumer (the prose `text` renderer AND the raw JSON `data` passthrough)
 * sees the untrustworthy number (two-channel-leak risk, architect brownfield
 * findings §C.5/§D.2 — Risk #2).
 *
 * Test strategy mirrors 089-tool-macro.test.ts (DB_PATH=":memory:",
 * initDatabase(), globalThis.fetch mock injection) and
 * FIX-VNINDEX-CACHE-EMPTY-REFRESH-PATH.test.ts (upsertVnIndexCache seeding
 * via the production writer, not a raw INSERT).
 *
 * @module __tests__/FIX-VNINDEX-CROSS-PLANE-PLAUSIBILITY-GATE
 */

// Set DB_PATH before any import that triggers getDb() (needed for hnx.ts module-level init)
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, mock } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Mock LanceDB-dependent retriever so it never initialises a real vector store
// (same pattern as 089-tool-macro.test.ts) — restored in afterAll so the stub
// does not bleed into sibling files in the same Bun ESM worker.
const _realRetrieverVnIdx = { searchContext: async () => [], insertAnalysis: async () => {} };
mock.module("../infrastructure/rag/retriever.js", () => _realRetrieverVnIdx);

import { initDatabase, closeDb, getDb } from "../infrastructure/db/schema.js";
import { upsertVnIndexCache } from "../infrastructure/db/vnIndexCacheStore.js";
import type { MarketPrice } from "../infrastructure/fetchers/hose.js";
import { registerMacroTools } from "../interface/mcp/tools/macro/macroTools.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers (mirrors 089-tool-macro.test.ts)
// ─────────────────────────────────────────────────────────────────────────────

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

function firstText(result: { content: Array<{ type: string; text: string }> }): string {
  const item = result.content[0];
  if (!item) throw new Error("Tool returned no content items");
  return item.text;
}

function parseEnvelope(result: { content: Array<{ type: string; text: string }> }): {
  source_tier: number;
  text: string;
  fetchedAt: string;
  data?: Record<string, unknown>;
} {
  return JSON.parse(firstText(result)) as {
    source_tier: number;
    text: string;
    fetchedAt: string;
    data?: Record<string, unknown>;
  };
}

function makeServer(): McpServer {
  const server = new McpServer(
    { name: "test-server", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );
  registerMacroTools(server);
  return server;
}

function buildLocalMarketPrice(overrides: Partial<MarketPrice> = {}): MarketPrice {
  return {
    code: "VNINDEX",
    exchange: "HOSE",
    price: 1782.12,
    previousPrice: 1806.63,
    changePct: -1.36,
    volume: 500_000,
    avgVolume: 480_000,
    fetchedAt: new Date().toISOString(), // fresh by default
    ...overrides,
  };
}

function makeMockSnapshot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: "ok",
    fetchedAt: "2026-07-15T15:00:00Z",
    vnIndex: 1782.0,
    vnIndexDelta: -24.63,
    vnIndexDirection: "down",
    vnIndex_is_estimate: false,
    vnIndex_source_tier: 1,
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
    },
    ...overrides,
  };
}

function mockFetchOnce(snapshot: Record<string, unknown>): () => void {
  const originalFetch = globalThis.fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/snapshot")) {
      return new Response(JSON.stringify(snapshot), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return originalFetch(input, init);
  };
  return () => { globalThis.fetch = originalFetch; };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

let restoreFetch: (() => void) | undefined;

beforeAll(async () => {
  await initDatabase();
});

// Fresh in-memory DB per test — no vn_index_cache row bleed between the
// GATE-4 "no local reference row at all" case and its siblings that seed one.
beforeEach(async () => {
  closeDb();
  await initDatabase();
});

afterEach(() => {
  restoreFetch?.();
  restoreFetch = undefined;
});

afterAll(() => {
  closeDb();
  mock.module("../infrastructure/rag/retriever.js", () => _realRetrieverVnIdx);
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-VNINDEX-CROSS-PLANE-PLAUSIBILITY-GATE — get_macro_snapshot cross-plane guard", () => {
  it("GATE-1: reproduces the 07-15 incident (macro tier-4 estimate 1280.5 vs local 1782.12) -> gap-token BOTH channels", async () => {
    // Seed the local reference — genuinely independent write path
    // (vnIndexRefreshJob / fetchVnIndex), fresh.
    upsertVnIndexCache(getDb(), buildLocalMarketPrice({ price: 1782.12 }));

    restoreFetch = mockFetchOnce(makeMockSnapshot({
      vnIndex: 1280.5,
      vnIndexDelta: -526.13,
      vnIndexDirection: "down",
      vnIndex_is_estimate: true,
      vnIndex_source_tier: 4,
    }));

    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot");
    const env = parseEnvelope(result);

    // Channel 1: raw JSON data passthrough must be gap-tokened.
    expect(env.data?.vnIndex).toBeNull();
    expect(env.data?.vnIndexDelta).toBeNull();
    expect(env.data?.vnIndexDirection).toBe("unknown");
    // Diagnostic fields remain visible (not the leaking channel).
    expect(env.data?.vnIndex_is_estimate).toBe(true);
    expect(env.data?.vnIndex_source_tier).toBe(4);

    // Channel 2: prose text must NOT narrate the numeric claim — renders
    // "unavailable" generically via the existing renderer (no renderer change).
    expect(env.text).toContain("Vn Index:");
    expect(env.text).toContain("unavailable");
    expect(env.text).not.toContain("1280.5");
    expect(env.text).not.toContain("-526.13");
  });

  it("GATE-2 (negative): tier-1 within-band (macro and local agree) -> unchanged passthrough, no regression", async () => {
    upsertVnIndexCache(getDb(), buildLocalMarketPrice({ price: 1782.12 }));

    restoreFetch = mockFetchOnce(makeMockSnapshot({
      vnIndex: 1782.0, // well within 5% of local 1782.12
      vnIndexDelta: -24.63,
      vnIndexDirection: "down",
      vnIndex_is_estimate: false,
      vnIndex_source_tier: 1,
    }));

    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot");
    const env = parseEnvelope(result);

    expect(env.data?.vnIndex).toBe(1782.0);
    expect(env.data?.vnIndexDelta).toBe(-24.63);
    expect(env.data?.vnIndexDirection).toBe("down");
  });

  it("GATE-3 (negative, EC-1 fail-open): tier-1 live + stale local reference -> values still served (no over-suppression)", async () => {
    // Local reference far past its SLA (stale beyond market-hours + off-hours grace).
    upsertVnIndexCache(getDb(), buildLocalMarketPrice({
      price: 1700.0,
      fetchedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days stale
    }));

    restoreFetch = mockFetchOnce(makeMockSnapshot({
      vnIndex: 1900.0, // would exceed 5% divergence vs the stale local value, but local ref is untrustworthy
      vnIndexDelta: 12.0,
      vnIndexDirection: "up",
      vnIndex_is_estimate: false,
      vnIndex_source_tier: 1,
    }));

    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot");
    const env = parseEnvelope(result);

    // fail-OPEN: macro is tier-1, local ref cannot corroborate -> serve as today.
    expect(env.data?.vnIndex).toBe(1900.0);
    expect(env.data?.vnIndexDelta).toBe(12.0);
    expect(env.data?.vnIndexDirection).toBe("up");
  });

  it("GATE-4 (negative, EC-1 fail-closed): no local reference row at all + macro is_estimate -> gap-token", async () => {
    // No upsertVnIndexCache call — table has zero rows for this code.
    restoreFetch = mockFetchOnce(makeMockSnapshot({
      vnIndex: 1280.5,
      vnIndexDelta: -526.13,
      vnIndexDirection: "down",
      vnIndex_is_estimate: true,
      vnIndex_source_tier: 4,
    }));

    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot");
    const env = parseEnvelope(result);

    expect(env.data?.vnIndex).toBeNull();
    expect(env.data?.vnIndexDelta).toBeNull();
    expect(env.data?.vnIndexDirection).toBe("unknown");
  });
});
