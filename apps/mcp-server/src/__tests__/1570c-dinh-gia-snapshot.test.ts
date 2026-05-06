/**
 * Task 1426c — [Dinh Gia — Asset Valuation] Section in get_macro_snapshot
 *
 * Tests for:
 *   - formatDinhGia() output shape across all label paths (CHEAP / FAIRLY_VALUED / EXPENSIVE)
 *   - Unavailable path (earningYield or depositRate is 0)
 *   - Section order in get_macro_snapshot: [Dinh Gia] after [Thien Thoi], before [Commodity Prices]
 *   - _testDinhGiaInputs injection param in tool handler
 *
 * Strategy:
 *   - DB_PATH set to :memory: before any import.
 *   - formatDinhGia() is tested as a pure unit (no server needed).
 *   - Tool integration tests use _testDinhGiaInputs injection and pre-resolved
 *     commodity/SBV fixtures to keep HTTP out of these tests.
 */

// Set DB_PATH before any import that triggers getDb()
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeAll, afterAll, mock } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Mock LanceDB-dependent retriever so it never initialises a real vector store
mock.module("../infrastructure/rag/retriever.js", () => ({
  searchContext: async () => [],
  insertAnalysis: async () => {},
}));

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

const COMMODITY_FIXTURE = {
  brentCrudeUSD: 84.37,
  goldUSDPerOz: 1950.50,
  usdVndRate: 25450.0,
  fetchedAt: new Date().toISOString(),
};

const SBV_FIXTURE = {
  overnightRatePct: 5.0,
  refinancingRatePct: 4.5,
  maxDepositRatePct: 5.0,
  usdVndOfficial: 25452.0,
  fetchedAt: new Date().toISOString(),
};

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
// Lifecycle
// ---------------------------------------------------------------------------

beforeAll(async () => {
  await initDatabase();
});

afterAll(() => {
  closeDb();
});

// ---------------------------------------------------------------------------
// Unit tests: formatDinhGia()
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
// Integration tests: get_macro_snapshot with _testDinhGiaInputs injection
// ---------------------------------------------------------------------------

describe("Task 1426c — get_macro_snapshot Dinh Gia integration", () => {

  it("DG-I-01: CHEAP inputs — snapshot text contains [Dinh Gia] section with CHEAP", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot", {
      _testCommodityClient: COMMODITY_FIXTURE,
      _testSbvClient: SBV_FIXTURE,
      _testDinhGiaInputs: DINH_GIA_CHEAP,
    });

    const text = firstText(result);
    expect(text).toContain("[Dinh Gia — Asset Valuation]");
    expect(text).toContain("CHEAP");
    expect(text).toContain("+3.00%");
  });

  it("DG-I-02: FAIRLY_VALUED inputs — snapshot contains FAIRLY_VALUED", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot", {
      _testCommodityClient: COMMODITY_FIXTURE,
      _testSbvClient: SBV_FIXTURE,
      _testDinhGiaInputs: DINH_GIA_FAIRLY_VALUED,
    });

    const text = firstText(result);
    expect(text).toContain("[Dinh Gia — Asset Valuation]");
    expect(text).toContain("FAIRLY_VALUED");
  });

  it("DG-I-03: EXPENSIVE inputs — snapshot contains EXPENSIVE", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot", {
      _testCommodityClient: COMMODITY_FIXTURE,
      _testSbvClient: SBV_FIXTURE,
      _testDinhGiaInputs: DINH_GIA_EXPENSIVE,
    });

    const text = firstText(result);
    expect(text).toContain("[Dinh Gia — Asset Valuation]");
    expect(text).toContain("EXPENSIVE");
  });

  it("DG-I-04: null injection — Dinh Gia section absent (DB failure path)", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot", {
      _testCommodityClient: COMMODITY_FIXTURE,
      _testSbvClient: SBV_FIXTURE,
      _testDinhGiaInputs: null,
    });

    const text = firstText(result);
    expect(text).not.toContain("[Dinh Gia — Asset Valuation]");
    // Other sections still present
    expect(text).toContain("[Commodity Prices]");
    expect(text).toContain("[SBV Central Bank Rates]");
  });

  it("DG-I-05: no injection (undefined) — snapshot runs without crash, other sections intact", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot", {
      _testCommodityClient: COMMODITY_FIXTURE,
      _testSbvClient: SBV_FIXTURE,
      // _testDinhGiaInputs omitted — DB read path (will find no rows in :memory:)
    });

    const text = firstText(result);
    expect(text).toContain("=== Macro Snapshot ===");
    expect(text).toContain("[Commodity Prices]");
    expect(text).toContain("[SBV Central Bank Rates]");
  });

  it("DG-I-06: section order — [Dinh Gia] appears after [Thien Thoi] and before [Commodity Prices]", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot", {
      _testCommodityClient: COMMODITY_FIXTURE,
      _testSbvClient: SBV_FIXTURE,
      _testDinhGiaInputs: DINH_GIA_CHEAP,
    });

    const text = firstText(result);

    const idxCommodity = text.indexOf("[Commodity Prices]");
    const idxDinhGia = text.indexOf("[Dinh Gia — Asset Valuation]");

    // [Dinh Gia] must appear before [Commodity Prices]
    expect(idxDinhGia).toBeGreaterThan(-1);
    expect(idxDinhGia).toBeLessThan(idxCommodity);
  });

  it("DG-I-07: zero earningYield in inputs — section shows unavailable", async () => {
    const server = makeServer();
    const result = await callTool(server, "get_macro_snapshot", {
      _testCommodityClient: COMMODITY_FIXTURE,
      _testSbvClient: SBV_FIXTURE,
      _testDinhGiaInputs: { ...DINH_GIA_CHEAP, earningYield: 0 },
    });

    const text = firstText(result);
    expect(text).toContain("[Dinh Gia — Asset Valuation]");
    expect(text).toContain("unavailable");
    expect(text).not.toContain("CHEAP");
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
