/**
 * Task 1426c — [Dinh Gia — Asset Valuation] Section in get_macro_snapshot
 *
 * Tests for:
 *   - formatDinhGia() output shape across all label paths (CHEAP / FAIRLY_VALUED / EXPENSIVE)
 *   - Unavailable path (earningYield or depositRate is 0)
 *   - get_macro_snapshot tool integration via globalThis.fetch mock
 *
 * Strategy (C1 FIX-CI-C1-MACRO-INJECT-SEAM-TESTS):
 *   - DB_PATH set to :memory: before any import.
 *   - formatDinhGia() is tested as a pure unit (no server needed) — UNCHANGED.
 *   - Tool integration tests (DG-I-*) use globalThis.fetch mock returning a
 *     MacroSnapshotResponse. The old _testDinhGiaInputs / _testCommodityClient /
 *     _testSbvClient injection seams no longer exist after P2-B1 HTTP rewire
 *     (commit 98df0f43). The Go service does NOT emit [Dinh Gia] text sections;
 *     integration tests now assert JSON field checks on signals.yield instead.
 *   - Pure unit tests (DG-01..DG-09) and DB schema drift guards (DG-I-08, DG-I-09)
 *     are UNCHANGED.
 */

// Set DB_PATH before any import that triggers getDb()
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeAll, afterAll, mock } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Mock LanceDB-dependent retriever so it never initialises a real vector store
// C5-CURE: capture stub reference before registering; used in afterAll restore.
const _realRetriever1570c = { searchContext: async () => [], insertAnalysis: async () => {} };
mock.module("../infrastructure/rag/retriever.js", () => _realRetriever1570c);

import { initDatabase, closeDb, getDb } from "../infrastructure/db/schema.js";
import {
  formatDinhGia,
  type DinhGiaInputs,
  registerMacroTools,
} from "../interface/mcp/tools/macro/macroTools.js";

// ---------------------------------------------------------------------------
// Helpers
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
// Fixtures (used by pure unit tests)
// ---------------------------------------------------------------------------

const DINH_GIA_CHEAP: DinhGiaInputs = {
  earningYield: 8.0,
  medianPE: 12.5,
  depositRate: 5.0,
  coverageCount: 28,
  totalWatchlist: 30,
  dataAsOf: "2024-Q4",
};

const DINH_GIA_FAIRLY_VALUED: DinhGiaInputs = {
  earningYield: 6.2,
  medianPE: 16.13,
  depositRate: 5.5,
  coverageCount: 25,
  totalWatchlist: 30,
  dataAsOf: "2024-Q4",
};

const DINH_GIA_EXPENSIVE: DinhGiaInputs = {
  earningYield: 4.0,
  medianPE: 25.0,
  depositRate: 5.5,
  coverageCount: 22,
  totalWatchlist: 30,
  dataAsOf: "2024-Q4",
};

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
            spread: 3.0,
            earningYield: 8.0,
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
  mock.module("../infrastructure/rag/retriever.js", () => _realRetriever1570c);
});

// ---------------------------------------------------------------------------
// Unit tests: formatDinhGia() — UNCHANGED
// ---------------------------------------------------------------------------

describe("Task 1426c — formatDinhGia() unit", () => {

  it("DG-01: CHEAP path — spread >2pp shows CHEAP label and positive spread", () => {
    const lines = formatDinhGia(DINH_GIA_CHEAP);

    expect(lines[0]).toBe("[Dinh Gia — Asset Valuation]");
    expect(lines.some(l => l.includes("8.00%"))).toBe(true);
    expect(lines.some(l => l.includes("5.00%"))).toBe(true);
    expect(lines.some(l => l.includes("+3.00%"))).toBe(true);
    expect(lines.some(l => l.includes("CHEAP"))).toBe(true);
  });

  it("DG-02: CHEAP path — coverage suffix present when coverageCount > 0", () => {
    const lines = formatDinhGia(DINH_GIA_CHEAP);
    const yieldLine = lines.find(l => l.includes("Market Earning Yield")) ?? "";
    expect(yieldLine).toContain("coverage: 28/30");
  });

  it("DG-03: FAIRLY_VALUED path — 0 < spread ≤ 2pp shows FAIRLY_VALUED", () => {
    const lines = formatDinhGia(DINH_GIA_FAIRLY_VALUED);

    // spread = 6.2 - 5.5 = 0.70
    expect(lines.some(l => l.includes("FAIRLY_VALUED"))).toBe(true);
    expect(lines.some(l => l.includes("+0.70%"))).toBe(true);
  });

  it("DG-04: EXPENSIVE path — spread ≤ 0 shows EXPENSIVE and negative sign", () => {
    const lines = formatDinhGia(DINH_GIA_EXPENSIVE);

    // spread = 4.0 - 5.5 = -1.50
    expect(lines.some(l => l.includes("EXPENSIVE"))).toBe(true);
    expect(lines.some(l => l.includes("-1.50%"))).toBe(true);
  });

  it("DG-05: unavailable when earningYield is 0", () => {
    const lines = formatDinhGia({ ...DINH_GIA_CHEAP, earningYield: 0 });
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("unavailable");
  });

  it("DG-06: unavailable when depositRate is 0", () => {
    const lines = formatDinhGia({ ...DINH_GIA_CHEAP, depositRate: 0 });
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("unavailable");
  });

  it("DG-07: no coverage suffix when coverageCount is 0", () => {
    const lines = formatDinhGia({ ...DINH_GIA_CHEAP, coverageCount: 0 });
    const yieldLine = lines.find(l => l.includes("Market Earning Yield")) ?? "";
    expect(yieldLine).not.toContain("coverage:");
  });

  it("DG-08: spread sign — zero spread shows +0.00%", () => {
    // earningYield == depositRate → spread exactly 0
    const lines = formatDinhGia({ ...DINH_GIA_CHEAP, earningYield: 5.0, depositRate: 5.0 });
    // spread = 0 → EXPENSIVE (not > 0), sign should be +
    expect(lines.some(l => l.includes("+0.00%"))).toBe(true);
    expect(lines.some(l => l.includes("EXPENSIVE"))).toBe(true);
  });

  it("DG-09: output is exactly 4 lines in the normal case", () => {
    const lines = formatDinhGia(DINH_GIA_CHEAP);
    expect(lines).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// Integration tests: get_macro_snapshot via fetch mock
// (replaces old _testDinhGiaInputs / _testCommodityClient / _testSbvClient injection)
// ---------------------------------------------------------------------------

describe("Task 1426c — get_macro_snapshot Dinh Gia integration", () => {

  it("DG-I-01: response is valid envelope; inner signals.yield.label is CHEAP", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot");

    const inner = parseInner(result);
    const signals = inner.signals as Record<string, unknown>;
    const yieldSig = signals.yield as Record<string, unknown>;
    expect(yieldSig.label).toBe("CHEAP");
    expect(typeof yieldSig.spread).toBe("number");
    expect((yieldSig.spread as number)).toBeGreaterThan(0);
  });

  it("DG-I-02: inner signals.yield contains earningYield and depositRate fields", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot");

    const inner = parseInner(result);
    const signals = inner.signals as Record<string, unknown>;
    const yieldSig = signals.yield as Record<string, unknown>;
    expect(typeof yieldSig.earningYield).toBe("number");
    expect(typeof yieldSig.depositRate).toBe("number");
  });

  it("DG-I-03: source_tier is present and valid in envelope", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot");

    const env = parseEnvelope(result);
    expect(env.source_tier).toBeGreaterThanOrEqual(1);
    expect(env.source_tier).toBeLessThanOrEqual(4);
  });

  it("DG-I-04: inner text does not contain old section headers (Go service JSON, not TS formatter)", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot");

    // The Go service returns JSON, not formatted text sections
    // The [Dinh Gia — Asset Valuation] header only comes from formatDinhGia() pure helper
    // The tool output is now JSON, not human-readable text
    const env = parseEnvelope(result);
    // outer text is the JSON envelope — no text-section headers
    expect(env.text).not.toContain("=== Macro Snapshot ===");
  });

  it("DG-I-05: tool runs without crash and returns single content item", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot");

    expect(result.content).toHaveLength(1);
    expect(result.content[0]?.type).toBe("text");
  });

  it("DG-I-06: inner text contains both oilUsd and goldUsd fields (JSON structure)", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot");

    const inner = parseInner(result);
    expect(typeof inner.oilUsd).toBe("number");
    expect(typeof inner.goldUsd).toBe("number");
  });

  it("DG-I-07: signals.yield.label is a non-empty string", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot");

    const inner = parseInner(result);
    const signals = inner.signals as Record<string, unknown>;
    const yieldSig = signals.yield as Record<string, unknown>;
    expect(typeof yieldSig.label).toBe("string");
    expect((yieldSig.label as string).length).toBeGreaterThan(0);
  });

  it("DG-I-08: DB schema drift guard — tracked_indicators queries use extracted_at (not fetched_at)", async () => {
    // This test verifies the fix for Telegram report 2746: no such column fetched_at
    const db = getDb();

    // Insert test data into tracked_indicators using the correct column
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tracked_indicators (indicator, value, source, extracted_at)
       VALUES (?, ?, ?, ?)`
    ).run("market_earning_yield", 7.5, "bau_phase2", now);

    db.prepare(
      `INSERT INTO tracked_indicators (indicator, value, source, extracted_at)
       VALUES (?, ?, ?, ?)`
    ).run("market_median_pe", 14.2, "bau_phase2", now);

    // Query should work using extracted_at (not fetched_at)
    const eyRow = db
      .query<{ value: number }, []>(
        `SELECT value FROM tracked_indicators
         WHERE indicator = 'market_earning_yield' AND source = 'bau_phase2'
         ORDER BY extracted_at DESC LIMIT 1`
      )
      .get();

    expect(eyRow).toBeDefined();
    expect(eyRow?.value).toBe(7.5);
  });

  it("DG-I-09: DB schema drift guard — sbv_rates queries use fetched_at (not effective_date)", async () => {
    // This test verifies the fix for Telegram report 2746: no such column effective_date
    const db = getDb();

    // Insert test data into sbv_rates
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO sbv_rates (source, max_deposit_rate_pct, fetched_at)
       VALUES (?, ?, ?)`
    ).run("sbv_api", 5.25, now);

    // Query should work using fetched_at (not effective_date)
    const sbvRow = db
      .query<{ max_deposit_rate_pct: number }, []>(
        `SELECT max_deposit_rate_pct FROM sbv_rates ORDER BY fetched_at DESC LIMIT 1`
      )
      .get();

    expect(sbvRow).toBeDefined();
    expect(sbvRow?.max_deposit_rate_pct).toBe(5.25);
  });
});
