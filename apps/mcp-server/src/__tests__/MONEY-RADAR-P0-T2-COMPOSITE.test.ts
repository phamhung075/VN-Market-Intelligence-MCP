/**
 * MONEY-RADAR-P0-T2-COMPOSITE — Test Suite
 *
 * Covers get_money_radar_composite (application/usecases/getMoneyRadarComposite.ts
 * + interface/mcp/tools/market-data/moneyRadarTools.ts) per
 * docs/architecture-briefs/2026-07-01-money-radar.md §4 + §5 (HN-1..HN-7).
 *
 * Test scope:
 *   REG-*:  Tool is registered on McpServer under the correct name.
 *   DOD-*:  Phase-0 DoD acceptance bullets (brief §6 + task ACCEPTANCE).
 *   HN-*:   Honest-NULL guard tests (HN-1..HN-7).
 *   PURE-*: Pure domain calculator unit tests (fusion, detectors, OBV slope).
 *
 * Harness: in-memory SQLite (bun:sqlite) seeded via initDatabase(); globalThis.fetch
 * replaced with a URL-routing stub for the 3 downstream microservices
 * (stock-price :5000, technical-analysis :5003, macro-indicators :5004).
 * No real HTTP calls, no real DB file — same harness style as
 * IND-P1-MCP-PROXY-INDICATORS.test.ts + P0-BREADTH-TIME-SERIES.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { initDatabase } from "../infrastructure/db/schema.js";
import { getMoneyRadarComposite } from "../application/usecases/getMoneyRadarComposite.js";
import { registerMoneyRadarTools } from "../interface/mcp/tools/market-data/moneyRadarTools.js";
import {
  fuseComponents,
  aggregateDivergence,
  detectD1IndexVsBreadth,
  detectD2PriceVsObv,
  detectD3CrowdVsSmart,
  detectD4UnconfirmedBreakout,
  computeMarketObvSlope,
  computeIndexReturn,
  computeStreakWeightedSign,
  type ComponentInput,
} from "../domain/services/market-data/moneyRadarCalculator.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

type ToolHandler = {
  handler: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text: string }>;
  }>;
};
type ToolServerInternal = { _registeredTools: Record<string, ToolHandler> };

async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  const registry = (server as unknown as ToolServerInternal)._registeredTools;
  const entry = registry[toolName];
  if (!entry) throw new Error(`Tool "${toolName}" not registered`);
  const result = await entry.handler(args);
  return JSON.parse(result.content[0]!.text);
}

function stubOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function stubErr(msg = "internal error"): Response {
  return new Response(msg, { status: 500 });
}

/** Route globalThis.fetch by URL substring to the 3 downstream services. */
function buildFetchRouter(routes: Array<[string, () => Response]>): typeof globalThis.fetch {
  return (async (input: unknown) => {
    const url = typeof input === "string" ? input : (input as URL).toString();
    for (const [frag, handler] of routes) {
      if (url.includes(frag)) return handler();
    }
    return stubErr(`unrouted URL in test: ${url}`);
  }) as unknown as typeof globalThis.fetch;
}

/** Default all-fail router — every downstream call returns 500. */
function allFailRouter(): typeof globalThis.fetch {
  return buildFetchRouter([
    ["/price/foreign-accum-rank", () => stubErr("stock-price down")],
    ["/ta/money-flow-oscillators", () => stubErr("ta down")],
    ["/ta/volatility-indicators", () => stubErr("ta down")],
    ["/snapshot", () => stubErr("macro down")],
  ]);
}

function seedWatchlist(db: Database, codes: string[]): void {
  const now = new Date().toISOString();
  for (const code of codes) {
    db.prepare(`INSERT INTO watchlist (code, exchange, added_at) VALUES (?, 'HOSE', ?)`).run(code, now);
  }
}

/** Seed daily_ohlcv rows for one ticker from an ASC array of {date, close, volume}. */
function seedOhlcv(db: Database, code: string, bars: Array<{ date: string; close: number; volume: number }>): void {
  for (const b of bars) {
    db.prepare(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(code, b.date, b.close, b.close, b.close, b.close, b.volume, new Date().toISOString());
  }
}

/** Seed market_prices_history VNINDEX rows, one per day (ASC closes). */
function seedVnIndex(db: Database, dailyCloses: Array<{ date: string; price: number }>): void {
  for (const row of dailyCloses) {
    db.prepare(
      `INSERT INTO market_prices_history (code, price, volume, fetched_at) VALUES ('VNINDEX', ?, 0, ?)`,
    ).run(row.price, `${row.date}T08:00:00Z`);
  }
}

function dateSeq(n: number, startDay = 1): string[] {
  return Array.from({ length: n }, (_, i) => `2026-06-${String(startDay + i).padStart(2, "0")}`);
}

/** A neutral 6-day flat OHLCV series (no OBV trend, minimal footprint). */
function flatBars(dates: string[], close = 50, volume = 10_000) {
  return dates.map((date) => ({ date, close, volume }));
}

let _originalFetch: typeof globalThis.fetch;
beforeEach(() => {
  _originalFetch = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = _originalFetch;
});

async function makeDb(): Promise<Database> {
  const db = new Database(":memory:");
  await initDatabase(db);
  return db;
}

// ===========================================================================
// REG — registration
// ===========================================================================

describe("get_money_radar_composite — registration (REG-1)", () => {
  it("tool is registered under 'get_money_radar_composite'", async () => {
    globalThis.fetch = allFailRouter();
    const db = await makeDb();
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerMoneyRadarTools(server, db);
    const registry = (server as unknown as ToolServerInternal)._registeredTools;
    expect(registry["get_money_radar_composite"]).toBeDefined();
  });

  it("REG-2: tool never throws even when every downstream call fails", async () => {
    globalThis.fetch = allFailRouter();
    const db = await makeDb();
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerMoneyRadarTools(server, db);
    const result = await callTool(server, "get_money_radar_composite") as Record<string, unknown>;
    expect(result).not.toHaveProperty("error");
    expect(result).toHaveProperty("score");
  });
});

// ===========================================================================
// DOD — Phase-0 DoD acceptance bullets
// ===========================================================================

describe("get_money_radar_composite — DoD-1: real non-null score", () => {
  it("DOD-1: foreign_accum_z_market, obv_slope, rel_vol_z_20, volatility_regime all non-null -> score non-null", async () => {
    const db = await makeDb();
    seedWatchlist(db, ["AAA", "BBB", "CCC"]);
    const dates = dateSeq(8);
    // 8 bars each, non-trivial close movement so OBV slope resolves non-null.
    seedOhlcv(db, "AAA", dates.map((d, i) => ({ date: d, close: 50 + i, volume: 10_000 + i * 100 })));
    seedOhlcv(db, "BBB", dates.map((d, i) => ({ date: d, close: 30 - i * 0.5, volume: 8_000 })));
    seedOhlcv(db, "CCC", dates.map((d, i) => ({ date: d, close: 20 + (i % 2), volume: 5_000 })));

    globalThis.fetch = buildFetchRouter([
      ["/price/foreign-accum-rank", () => stubOk({
        tickers: [], foreign_accum_z_market: 1.4, adtv_unit: "shares", computed_as_of: "2026-06-08T00:00:00Z",
      })],
      ["/ta/money-flow-oscillators", () => stubOk({
        tickers: [
          { code: "AAA", obv: 1000, rel_vol_z_20: 0.8, up_down_vol_ratio: 1.3, degraded_vwap: 52, is_proxy: true, bars_used: 8 },
          { code: "BBB", obv: -400, rel_vol_z_20: 0.5, up_down_vol_ratio: 0.9, degraded_vwap: 28, is_proxy: true, bars_used: 8 },
          { code: "CCC", obv: 200, rel_vol_z_20: 0.2, up_down_vol_ratio: 1.1, degraded_vwap: 21, is_proxy: true, bars_used: 8 },
        ],
      })],
      ["/ta/volatility-indicators", () => stubOk({
        rv_20d_percentile: 0.4, rv_10d_pct: 12, rv_20d_pct: 14, rv_60d_pct: null,
        gk_vol_20d_pct: 13, vol_regime: "NORMAL", vol_regime_pct: 0.4, history_sessions: 60,
        drawdown_252d_pct: null,
      })],
      ["/snapshot", () => stubOk({ signals: {}, fetchedAt: "2026-06-08T00:00:00Z" })],
    ]);

    const result = await getMoneyRadarComposite(db);

    expect(result.components["foreign_accum_z_market"]).not.toBeNull();
    expect(result.components["obv_slope"]).not.toBeNull();
    expect(result.components["rel_vol_z_20"]).not.toBeNull();
    expect(result.components["volatility_regime"]).not.toBeNull();
    expect(result.coverage_pct).toBeGreaterThanOrEqual(0.5);
    expect(result.score).not.toBeNull();
    expect(result.score).toBeGreaterThanOrEqual(-1);
    expect(result.score).toBeLessThanOrEqual(1);
  });
});

describe("get_money_radar_composite — DoD-2: coverage_pct < 0.5 -> score=null (HN-2)", () => {
  it("DOD-2: no watchlist/index data + all downstream calls fail -> score=null, coverage<0.5, null_reason set (not zero-fill)", async () => {
    const db = await makeDb();
    globalThis.fetch = allFailRouter();

    const result = await getMoneyRadarComposite(db);

    expect(result.coverage_pct).toBeLessThan(0.5);
    expect(result.score).toBeNull();
    expect(typeof result.null_reason).toBe("string");
    expect(result.null_reason).not.toBeNull();
    // HN-1: never zero-filled — a null score is NOT literally 0
    expect(result.score).not.toBe(0);
  });
});

describe("get_money_radar_composite — DoD-3: D2 fires on index-up / OBV-down (HN-4 axis-resolved case)", () => {
  it("DOD-3: index return > 0 AND market OBV slope < 0 -> divergence.flag=AMBER, detectors=['D2']", async () => {
    const db = await makeDb();
    seedWatchlist(db, ["DDD", "EEE", "FFF"]);
    const dates = dateSeq(6, 10);

    // DDD, EEE trend DOWN (close falling every day) -> OBV slope negative for both.
    seedOhlcv(db, "DDD", dates.map((d, i) => ({ date: d, close: 100 - i, volume: 100_000 })));
    seedOhlcv(db, "EEE", dates.map((d, i) => ({ date: d, close: 80 - i, volume: 90_000 })));
    // FFF trends UP -> OBV slope positive (minority; aggregate still negative: -1/3).
    seedOhlcv(db, "FFF", dates.map((d, i) => ({ date: d, close: 40 + i, volume: 50_000 })));

    // VNINDEX rises steadily over the same 6-session window -> index_return_5d > 0.
    seedVnIndex(db, dates.map((d, i) => ({ date: d, price: 1000 + i * 5 })));

    globalThis.fetch = buildFetchRouter([
      ["/price/foreign-accum-rank", () => stubOk({
        tickers: [], foreign_accum_z_market: null, adtv_unit: "shares", computed_as_of: "",
      })],
      // rel_vol_z_20 POSITIVE on every ticker -> D4 condition (relVolZ20<0) stays CLEAR,
      // isolating D2 as the only fired detector.
      ["/ta/money-flow-oscillators", () => stubOk({
        tickers: [
          { code: "DDD", obv: -500, rel_vol_z_20: 1.2, up_down_vol_ratio: 0.5, degraded_vwap: null, is_proxy: true, bars_used: 6 },
          { code: "EEE", obv: -300, rel_vol_z_20: 0.9, up_down_vol_ratio: 0.6, degraded_vwap: null, is_proxy: true, bars_used: 6 },
          { code: "FFF", obv: 200, rel_vol_z_20: 1.5, up_down_vol_ratio: 1.4, degraded_vwap: null, is_proxy: true, bars_used: 6 },
        ],
      })],
      ["/ta/volatility-indicators", () => stubOk({
        rv_20d_percentile: null, rv_10d_pct: null, rv_20d_pct: null, rv_60d_pct: null,
        gk_vol_20d_pct: null, vol_regime: null, vol_regime_pct: null, history_sessions: 0,
        drawdown_252d_pct: null,
      })],
      ["/snapshot", () => stubErr("macro down")],
    ]);

    const result = await getMoneyRadarComposite(db);

    expect(result.divergence.flag).toBe("AMBER");
    expect(result.divergence.detectors).toEqual(["D2"]);
    expect(result.divergence.severity).toBe(1);
  });
});

describe("get_money_radar_composite — DoD-4 / HN-4: null divergence axis -> UNKNOWN, never GREEN", () => {
  it("DOD-4: no VNINDEX data, no watchlist OHLCV, no breadth history -> all 4 detectors UNKNOWN -> flag=UNKNOWN", async () => {
    const db = await makeDb();
    // No watchlist, no daily_ohlcv, no market_prices_history VNINDEX, no market_breadth_history.
    globalThis.fetch = allFailRouter();

    const result = await getMoneyRadarComposite(db);

    expect(result.divergence.flag).toBe("UNKNOWN");
    expect(result.divergence.flag).not.toBe("GREEN");
    expect(result.divergence.detectors).toEqual([]);
    expect(result.divergence.severity).toBe(0);
    expect(typeof result.divergence.null_reason).toBe("string");
  });
});

// ===========================================================================
// HN — Honest-NULL guards
// ===========================================================================

describe("get_money_radar_composite — HN-3: credit-flow is_estimate excluded", () => {
  it("HN-3: credit_flow_direction is null (excluded) when is_estimate=true (default path — no live YoY provided)", async () => {
    const db = await makeDb();
    globalThis.fetch = allFailRouter();

    const result = await getMoneyRadarComposite(db);

    // The composite never supplies explicit YoY inputs to getCreditFlowSignalHandler,
    // so is_estimate is always true today -> component MUST be excluded (HN-3), not
    // a fabricated +1/0/-1 built on DEFAULT_RE_CREDIT_TRILLION / ±15% YoY defaults.
    expect(result.components["credit_flow_direction"]).toBeNull();
  });
});

describe("get_money_radar_composite — HN-7: source_tier = min contributing tier", () => {
  it("HN-7: carry live (tier 2) alongside tier-3 components -> source_tier=2 (honest floor)", async () => {
    const db = await makeDb();
    seedWatchlist(db, ["GGG"]);
    const dates = dateSeq(8, 1);
    seedOhlcv(db, "GGG", dates.map((d, i) => ({ date: d, close: 10 + i, volume: 1_000 })));

    globalThis.fetch = buildFetchRouter([
      ["/price/foreign-accum-rank", () => stubOk({
        tickers: [], foreign_accum_z_market: 0.9, adtv_unit: "shares", computed_as_of: "",
      })],
      ["/ta/money-flow-oscillators", () => stubOk({
        tickers: [
          { code: "GGG", obv: 300, rel_vol_z_20: 0.4, up_down_vol_ratio: 1.1, degraded_vwap: 11, is_proxy: true, bars_used: 8 },
        ],
      })],
      ["/ta/volatility-indicators", () => stubOk({
        rv_20d_percentile: 0.3, rv_10d_pct: 10, rv_20d_pct: 11, rv_60d_pct: null,
        gk_vol_20d_pct: 10, vol_regime: "LOW", vol_regime_pct: 0.1, history_sessions: 40,
        drawdown_252d_pct: null,
      })],
      // carry regime LIVE (is_estimate=false) -> tier 2, the lowest (most confident) tier
      // among the non-null contributing components in this fixture.
      ["/snapshot", () => stubOk({
        signals: { carry: { regime: "HOT_MONEY_INFLOW", is_estimate: false, source_tier: 2 } },
        fetchedAt: "2026-06-08T00:00:00Z",
      })],
    ]);

    const result = await getMoneyRadarComposite(db);

    expect(result.components["carry_regime"]).toBe(1);
    expect(result.score).not.toBeNull();
    expect(result.source_tier).toBe(2);
    expect(result.is_estimate).toBe(false);
  });
});

describe("get_money_radar_composite — HN-5: degraded VWAP proxy label", () => {
  it("HN-5: composite exposes the VWAP-derived component under a proxy-labeled key, never bare 'degraded_vwap'", async () => {
    const db = await makeDb();
    seedWatchlist(db, ["HHH"]);
    const dates = dateSeq(8, 1);
    seedOhlcv(db, "HHH", dates.map((d, i) => ({ date: d, close: 10 + i * 0.2, volume: 1_000 })));

    globalThis.fetch = buildFetchRouter([
      ["/price/foreign-accum-rank", () => stubOk({ tickers: [], foreign_accum_z_market: null, adtv_unit: "shares", computed_as_of: "" })],
      ["/ta/money-flow-oscillators", () => stubOk({
        tickers: [{ code: "HHH", obv: 50, rel_vol_z_20: 0.1, up_down_vol_ratio: 1.0, degraded_vwap: 10.5, is_proxy: true, bars_used: 8 }],
      })],
      ["/ta/volatility-indicators", () => stubOk({
        rv_20d_percentile: null, rv_10d_pct: null, rv_20d_pct: null, rv_60d_pct: null,
        gk_vol_20d_pct: null, vol_regime: null, vol_regime_pct: null, history_sessions: 0, drawdown_252d_pct: null,
      })],
      ["/snapshot", () => stubErr("macro down")],
    ]);

    const result = await getMoneyRadarComposite(db);

    expect(Object.keys(result.components)).toContain("degraded_vwap_proxy_z");
    expect(Object.keys(result.components)).not.toContain("degraded_vwap");
  });
});

// ===========================================================================
// PURE — domain calculator unit tests
// ===========================================================================

describe("moneyRadarCalculator — fuseComponents (HN-1, HN-2, HN-7)", () => {
  it("PURE-1: excludes null components from the weighted mean (never zero-fills)", () => {
    const components: ComponentInput[] = [
      { key: "a", value: 1, tier: 2 },
      { key: "b", value: null, tier: 2 },
      { key: "c", value: 1, tier: 3 },
    ];
    const result = fuseComponents(components);
    // If 'b' were zero-filled the mean would drop; since it's excluded, score stays at 1.
    expect(result.score).toBe(1);
  });

  it("PURE-2: coverage_pct < 0.5 -> score=null with a descriptive null_reason", () => {
    const components: ComponentInput[] = [
      { key: "a", value: 1, tier: 2 },
      { key: "b", value: null, tier: 2 },
      { key: "c", value: null, tier: 2 },
    ];
    const result = fuseComponents(components);
    expect(result.coverage_pct).toBeLessThan(0.5);
    expect(result.score).toBeNull();
    expect(result.null_reason).toContain("b");
    expect(result.null_reason).toContain("c");
  });

  it("PURE-3: source_tier = min tier across NON-NULL contributing components only", () => {
    const components: ComponentInput[] = [
      { key: "a", value: 1, tier: 4 },
      { key: "b", value: null, tier: 1 }, // null at tier 1 must NOT count
      { key: "c", value: 0.5, tier: 2 },
    ];
    const result = fuseComponents(components);
    expect(result.source_tier).toBe(2);
  });
});

describe("moneyRadarCalculator — divergence detectors (HN-4)", () => {
  it("PURE-4: D2 UNKNOWN when either axis is null — never CLEAR/FIRED", () => {
    expect(detectD2PriceVsObv(null, -1).status).toBe("UNKNOWN");
    expect(detectD2PriceVsObv(0.01, null).status).toBe("UNKNOWN");
  });

  it("PURE-5: D1/D3/D4 UNKNOWN when their axes are null", () => {
    expect(detectD1IndexVsBreadth(null, -5).status).toBe("UNKNOWN");
    expect(detectD3CrowdVsSmart(null, -1, -1).status).toBe("UNKNOWN");
    expect(detectD4UnconfirmedBreakout(true, null).status).toBe("UNKNOWN");
  });

  it("PURE-6: aggregateDivergence never returns GREEN when a detector is UNKNOWN and none fired", () => {
    const agg = aggregateDivergence([
      { id: "D1", status: "UNKNOWN", null_reason: "x" },
      { id: "D2", status: "CLEAR" },
      { id: "D3", status: "CLEAR" },
      { id: "D4", status: "CLEAR" },
    ]);
    expect(agg.flag).toBe("UNKNOWN");
  });

  it("PURE-7: aggregateDivergence returns GREEN only when all 4 resolve and none fire", () => {
    const agg = aggregateDivergence([
      { id: "D1", status: "CLEAR" },
      { id: "D2", status: "CLEAR" },
      { id: "D3", status: "CLEAR" },
      { id: "D4", status: "CLEAR" },
    ]);
    expect(agg.flag).toBe("GREEN");
  });

  it("PURE-8: 2+ fired detectors -> RED, severity capped at 3", () => {
    const agg = aggregateDivergence([
      { id: "D1", status: "FIRED" },
      { id: "D2", status: "FIRED" },
      { id: "D3", status: "FIRED" },
      { id: "D4", status: "FIRED" },
    ]);
    expect(agg.flag).toBe("RED");
    expect(agg.severity).toBe(3);
    expect(agg.detectors.length).toBe(4);
  });
});

describe("moneyRadarCalculator — OBV slope + index return + streak sign", () => {
  it("PURE-9: computeMarketObvSlope returns null when no ticker has enough bars", () => {
    const result = computeMarketObvSlope({ AAA: [{ date: "2026-06-01", close: 10, volume: 100 }] }, 5);
    expect(result.value).toBeNull();
  });

  it("PURE-10: computeIndexReturn null when fewer than window+1 closes", () => {
    expect(computeIndexReturn([100, 101, 102], 5)).toBeNull();
  });

  it("PURE-11: computeStreakWeightedSign null on empty series, bounded sign*weight otherwise", () => {
    expect(computeStreakWeightedSign([])).toBeNull();
    const v = computeStreakWeightedSign([100, 100, 100, -50]);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThanOrEqual(1);
  });
});
