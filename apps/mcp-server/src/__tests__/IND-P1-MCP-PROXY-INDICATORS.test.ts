/**
 * IND-P1-MCP-PROXY-INDICATORS — Test Suite
 *
 * Covers the 4 new MCP proxy tools:
 *   get_roc_momentum        → POST /ta/roc-momentum       (TA service)
 *   get_relative_strength   → POST /ta/relative-strength  (TA service)
 *   get_52w_proximity       → POST /ta/52w-proximity      (TA service)
 *   get_foreign_accum_rank  → POST /price/foreign-accum-rank (stock-price service)
 *
 * Test scope:
 *   REG-*:  Tool is registered on McpServer under the correct name.
 *   NULL-*: Honest-NULL fields from upstream are passed through unchanged (never default-filled).
 *   ERR-*:  Upstream failure → tool returns {error:'...'} JSON — never throws.
 *   FWRD-*: watchlist_tickers arg forwarding to the HTTP POST body.
 *
 * Harness: globalThis.fetch is replaced per-test with a stub; restored after each test.
 * No real HTTP calls are made. No DB required (pure proxy layer).
 *
 * Honest-NULL discipline: tests assert null fields are present and null, never coerced.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerROCMomentumTools } from "../interface/mcp/tools/market-data/rocMomentumTools.js";
import { registerRelativeStrengthTools } from "../interface/mcp/tools/market-data/relativeStrengthTools.js";
import { register52WProximityTools } from "../interface/mcp/tools/market-data/52wProximityTools.js";
import { registerForeignAccumRankTools } from "../interface/mcp/tools/market-data/foreignAccumRankTools.js";

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

type ToolHandler = {
  handler: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text: string }>;
  }>;
};
type ToolServerInternal = { _registeredTools: Record<string, ToolHandler> };

/** Call a registered tool by name and parse its JSON text content. */
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

/** Build a stub Response that returns the given JSON body with HTTP 200. */
function stubOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** Build a stub Response that returns a 500 error. */
function stubErr(msg = "internal server error"): Response {
  return new Response(msg, { status: 500 });
}

/**
 * Cast a simple async function to typeof globalThis.fetch.
 * Bun's fetch type includes a `preconnect` method not present on plain functions;
 * this cast is safe because tests only verify the JSON response content.
 */
function asFetch(fn: (...args: unknown[]) => Promise<Response>): typeof globalThis.fetch {
  return fn as unknown as typeof globalThis.fetch;
}

// ---------------------------------------------------------------------------
// Fetch override — save/restore per test
// ---------------------------------------------------------------------------

let _originalFetch: typeof globalThis.fetch;
beforeEach(() => { _originalFetch = globalThis.fetch; });
afterEach(() => { globalThis.fetch = _originalFetch; });

// ===========================================================================
// get_roc_momentum
// ===========================================================================

describe("get_roc_momentum — registration (REG-1)", () => {
  it("tool is registered under 'get_roc_momentum'", () => {
    globalThis.fetch = asFetch(async () => stubOk({
      tickers: [], factor_return_buckets: [], momentum_factor_z: null, computed_as_of: "",
    }));
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerROCMomentumTools(server);
    const registry = (server as unknown as ToolServerInternal)._registeredTools;
    expect(registry["get_roc_momentum"]).toBeDefined();
  });
});

describe("get_roc_momentum — honest-NULL passthrough", () => {
  it("NULL-1: momentum_factor_z null passes through unchanged", async () => {
    const upstream = {
      tickers: [],
      factor_return_buckets: Array.from({ length: 10 }, (_, i) => ({
        decile: i + 1, avg_return: null, ticker_count: 0,
      })),
      momentum_factor_z: null,
      computed_as_of: "2026-06-30T00:00:00Z",
    };
    globalThis.fetch = asFetch(async () => stubOk(upstream));
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerROCMomentumTools(server);
    const result = await callTool(server, "get_roc_momentum") as Record<string, unknown>;
    expect(result["momentum_factor_z"]).toBeNull();
    expect(result["tickers"]).toEqual([]);
  });

  it("NULL-2: per-ticker null_reason + null roc_12_1 pass through unchanged", async () => {
    const upstream = {
      tickers: [
        { ticker: "FPT", roc_12_1: null, z_score: null, decile: null, label: null, null_reason: "INSUFFICIENT_BARS" },
      ],
      factor_return_buckets: [],
      momentum_factor_z: null,
      computed_as_of: "2026-06-30T00:00:00Z",
    };
    globalThis.fetch = asFetch(async () => stubOk(upstream));
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerROCMomentumTools(server);
    const result = await callTool(server, "get_roc_momentum") as Record<string, unknown>;
    const tickers = result["tickers"] as Array<Record<string, unknown>>;
    expect(tickers[0]!["null_reason"]).toBe("INSUFFICIENT_BARS");
    expect(tickers[0]!["roc_12_1"]).toBeNull();
  });

  it("NULL-3: proxy injects source_tier=3 + fetched_at string", async () => {
    globalThis.fetch = asFetch(async () => stubOk({
      tickers: [], factor_return_buckets: [], momentum_factor_z: null, computed_as_of: "2026-06-30T00:00:00Z",
    }));
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerROCMomentumTools(server);
    const result = await callTool(server, "get_roc_momentum") as Record<string, unknown>;
    expect(result["source_tier"]).toBe(3);
    expect(typeof result["fetched_at"]).toBe("string");
  });
});

describe("get_roc_momentum — error boundary", () => {
  it("ERR-1: returns {error:'...'} on upstream 500 — never throws", async () => {
    globalThis.fetch = asFetch(async () => stubErr("boom"));
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerROCMomentumTools(server);
    const result = await callTool(server, "get_roc_momentum") as Record<string, unknown>;
    expect(result).toHaveProperty("error");
    expect(typeof result["error"]).toBe("string");
    expect((result["error"] as string).toLowerCase()).toContain("roc");
  });

  it("ERR-2: returns {error:'...'} when fetch throws (network error) — never throws", async () => {
    globalThis.fetch = asFetch(async () => { throw new Error("ECONNREFUSED"); });
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerROCMomentumTools(server);
    const result = await callTool(server, "get_roc_momentum") as Record<string, unknown>;
    expect(result).toHaveProperty("error");
  });
});

// ===========================================================================
// get_relative_strength
// ===========================================================================

describe("get_relative_strength — registration (REG-2)", () => {
  it("tool is registered under 'get_relative_strength'", () => {
    globalThis.fetch = asFetch(async () => stubOk({
      tickers: [], market_rs_composite: null, low_sample_warning: true, computed_as_of: "",
    }));
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerRelativeStrengthTools(server);
    const registry = (server as unknown as ToolServerInternal)._registeredTools;
    expect(registry["get_relative_strength"]).toBeDefined();
  });
});

describe("get_relative_strength — honest-NULL passthrough", () => {
  it("NULL-4: market_rs_composite null + low_sample_warning true pass through unchanged", async () => {
    globalThis.fetch = asFetch(async () => stubOk({
      tickers: [], market_rs_composite: null, low_sample_warning: true, computed_as_of: "2026-06-30T00:00:00Z",
    }));
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerRelativeStrengthTools(server);
    const result = await callTool(server, "get_relative_strength") as Record<string, unknown>;
    expect(result["market_rs_composite"]).toBeNull();
    expect(result["low_sample_warning"]).toBe(true);
  });

  it("NULL-5: per-ticker RS null fields + null_reason pass through unchanged", async () => {
    const upstream = {
      tickers: [
        {
          ticker: "VCB",
          rs_63d_pct: null, rs_126d_pct: null, rs_252d_pct: null,
          mansfield_rs_63d: null, mansfield_rs_126d: null, mansfield_rs_252d: null,
          composite_rs_score: null, composite_label: null,
          null_reason: "INSUFFICIENT_BARS",
        },
      ],
      market_rs_composite: null,
      low_sample_warning: true,
      computed_as_of: "2026-06-30T00:00:00Z",
    };
    globalThis.fetch = asFetch(async () => stubOk(upstream));
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerRelativeStrengthTools(server);
    const result = await callTool(server, "get_relative_strength") as Record<string, unknown>;
    const tickers = result["tickers"] as Array<Record<string, unknown>>;
    expect(tickers[0]!["composite_rs_score"]).toBeNull();
    expect(tickers[0]!["null_reason"]).toBe("INSUFFICIENT_BARS");
  });
});

describe("get_relative_strength — error boundary", () => {
  it("ERR-3: returns {error:'...'} on upstream 500 — never throws", async () => {
    globalThis.fetch = asFetch(async () => stubErr("service unavailable"));
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerRelativeStrengthTools(server);
    const result = await callTool(server, "get_relative_strength") as Record<string, unknown>;
    expect(result).toHaveProperty("error");
    expect(typeof result["error"]).toBe("string");
  });
});

// ===========================================================================
// get_52w_proximity
// ===========================================================================

describe("get_52w_proximity — registration (REG-3)", () => {
  it("tool is registered under 'get_52w_proximity'", () => {
    globalThis.fetch = asFetch(async () => stubOk({
      tickers: [], aggregate: {}, net_new_highs: 0, denominator_ma200: 0, computed_as_of: "",
    }));
    const server = new McpServer({ name: "test", version: "0.0.1" });
    register52WProximityTools(server);
    const registry = (server as unknown as ToolServerInternal)._registeredTools;
    expect(registry["get_52w_proximity"]).toBeDefined();
  });
});

describe("get_52w_proximity — honest-NULL passthrough", () => {
  it("NULL-6: pct_above_ma200 null when denominator_ma200=0 passes through unchanged", async () => {
    const upstream = {
      tickers: [],
      aggregate: {
        new_highs_count: 0, new_lows_count: 0, net_new_highs: 0,
        pct_above_ma50: null, pct_above_ma200: null, denominator_ma200: 0,
      },
      net_new_highs: 0,
      denominator_ma200: 0,
      computed_as_of: "2026-06-30T00:00:00Z",
    };
    globalThis.fetch = asFetch(async () => stubOk(upstream));
    const server = new McpServer({ name: "test", version: "0.0.1" });
    register52WProximityTools(server);
    const result = await callTool(server, "get_52w_proximity") as Record<string, unknown>;
    expect(result["denominator_ma200"]).toBe(0);
    expect(result["net_new_highs"]).toBe(0);
    const agg = result["aggregate"] as Record<string, unknown>;
    expect(agg["pct_above_ma200"]).toBeNull();
  });

  it("NULL-7: per-ticker null_reason + null high_52w + null above_ma200 pass through unchanged", async () => {
    const upstream = {
      tickers: [
        {
          ticker: "HPG",
          high_52w: null, low_52w: null,
          pct_from_52w_high: null, pct_from_52w_low: null,
          above_ma50: null, above_ma200: null,
          proximity_label: null, new_high_today: null,
          null_reason: "NO_DATA",
        },
      ],
      aggregate: { new_highs_count: 0, new_lows_count: 0, net_new_highs: 0, pct_above_ma50: null, pct_above_ma200: null, denominator_ma200: 0 },
      net_new_highs: 0,
      denominator_ma200: 0,
      computed_as_of: "2026-06-30T00:00:00Z",
    };
    globalThis.fetch = asFetch(async () => stubOk(upstream));
    const server = new McpServer({ name: "test", version: "0.0.1" });
    register52WProximityTools(server);
    const result = await callTool(server, "get_52w_proximity") as Record<string, unknown>;
    const tickers = result["tickers"] as Array<Record<string, unknown>>;
    expect(tickers[0]!["null_reason"]).toBe("NO_DATA");
    expect(tickers[0]!["high_52w"]).toBeNull();
    expect(tickers[0]!["above_ma200"]).toBeNull();
  });
});

describe("get_52w_proximity — error boundary", () => {
  it("ERR-4: returns {error:'...'} on upstream 500 — never throws", async () => {
    globalThis.fetch = asFetch(async () => stubErr("upstream down"));
    const server = new McpServer({ name: "test", version: "0.0.1" });
    register52WProximityTools(server);
    const result = await callTool(server, "get_52w_proximity") as Record<string, unknown>;
    expect(result).toHaveProperty("error");
    expect(typeof result["error"]).toBe("string");
  });
});

// ===========================================================================
// get_foreign_accum_rank
// ===========================================================================

describe("get_foreign_accum_rank — registration (REG-4)", () => {
  it("tool is registered under 'get_foreign_accum_rank'", () => {
    globalThis.fetch = asFetch(async () => stubOk({
      tickers: [], foreign_accum_z_market: null, adtv_unit: "shares", computed_as_of: "",
    }));
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerForeignAccumRankTools(server);
    const registry = (server as unknown as ToolServerInternal)._registeredTools;
    expect(registry["get_foreign_accum_rank"]).toBeDefined();
  });
});

describe("get_foreign_accum_rank — honest-NULL passthrough", () => {
  it("NULL-8: foreign_accum_z_market null + adtv_unit='shares' pass through unchanged", async () => {
    globalThis.fetch = asFetch(async () => stubOk({
      tickers: [], foreign_accum_z_market: null, adtv_unit: "shares", computed_as_of: "2026-06-30T00:00:00Z",
    }));
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerForeignAccumRankTools(server);
    const result = await callTool(server, "get_foreign_accum_rank") as Record<string, unknown>;
    expect(result["foreign_accum_z_market"]).toBeNull();
    expect(result["adtv_unit"]).toBe("shares");
  });

  it("NULL-9: per-ticker room_exhaustion null passes through unchanged (NOT coerced to false)", async () => {
    const upstream = {
      tickers: [
        {
          ticker: "SSI",
          net_flow_5d_raw: null, net_flow_20d_raw: null,
          cum_net_flow_5d_normalized: null, cum_net_flow_20d_normalized: null,
          z_score_5d: null, rank: null, label: null,
          room_exhaustion: null,
          null_reason: "INSUFFICIENT_BARS",
        },
      ],
      foreign_accum_z_market: null,
      adtv_unit: "shares",
      computed_as_of: "2026-06-30T00:00:00Z",
    };
    globalThis.fetch = asFetch(async () => stubOk(upstream));
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerForeignAccumRankTools(server);
    const result = await callTool(server, "get_foreign_accum_rank") as Record<string, unknown>;
    const tickers = result["tickers"] as Array<Record<string, unknown>>;
    // room_exhaustion MUST be null — honest-NULL, never default-filled to false
    expect(tickers[0]!["room_exhaustion"]).toBeNull();
    expect(tickers[0]!["null_reason"]).toBe("INSUFFICIENT_BARS");
    expect(tickers[0]!["z_score_5d"]).toBeNull();
  });

  it("NULL-10: adtv_unit 'shares' preserved as string in passthrough", async () => {
    globalThis.fetch = asFetch(async () => stubOk({
      tickers: [], foreign_accum_z_market: null, adtv_unit: "shares", computed_as_of: "",
    }));
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerForeignAccumRankTools(server);
    const result = await callTool(server, "get_foreign_accum_rank") as Record<string, unknown>;
    expect(result["adtv_unit"]).toBe("shares");
  });
});

describe("get_foreign_accum_rank — error boundary", () => {
  it("ERR-5: returns {error:'...'} on upstream 500 — never throws", async () => {
    globalThis.fetch = asFetch(async () => stubErr("stock-price down"));
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerForeignAccumRankTools(server);
    const result = await callTool(server, "get_foreign_accum_rank") as Record<string, unknown>;
    expect(result).toHaveProperty("error");
    expect(typeof result["error"]).toBe("string");
  });

  it("ERR-6: returns {error:'...'} when fetch throws (network error) — never throws", async () => {
    globalThis.fetch = asFetch(async () => { throw new Error("ECONNREFUSED localhost:5000"); });
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerForeignAccumRankTools(server);
    const result = await callTool(server, "get_foreign_accum_rank") as Record<string, unknown>;
    expect(result).toHaveProperty("error");
  });
});

// ===========================================================================
// watchlist_tickers forwarding
// ===========================================================================

describe("watchlist_tickers forwarding", () => {
  it("FWRD-1: get_roc_momentum with watchlist_tickers sends tickers in POST body", async () => {
    let capturedBody: unknown;
    globalThis.fetch = asFetch(async (...args: unknown[]) => {
      const opts = args[1] as RequestInit | undefined;
      capturedBody = JSON.parse((opts?.body as string) ?? "{}");
      return stubOk({ tickers: [], factor_return_buckets: [], momentum_factor_z: null, computed_as_of: "" });
    });
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerROCMomentumTools(server);
    await callTool(server, "get_roc_momentum", { watchlist_tickers: ["FPT", "VCB"] });
    expect((capturedBody as Record<string, unknown>)["tickers"]).toEqual(["FPT", "VCB"]);
  });

  it("FWRD-2: get_foreign_accum_rank without watchlist_tickers sends empty body (no tickers key)", async () => {
    let capturedBody: unknown;
    globalThis.fetch = asFetch(async (...args: unknown[]) => {
      const opts = args[1] as RequestInit | undefined;
      capturedBody = JSON.parse((opts?.body as string) ?? "{}");
      return stubOk({ tickers: [], foreign_accum_z_market: null, adtv_unit: "shares", computed_as_of: "" });
    });
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerForeignAccumRankTools(server);
    await callTool(server, "get_foreign_accum_rank");
    expect((capturedBody as Record<string, unknown>)["tickers"]).toBeUndefined();
  });
});
