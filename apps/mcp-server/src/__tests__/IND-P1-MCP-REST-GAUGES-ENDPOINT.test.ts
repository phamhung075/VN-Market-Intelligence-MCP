/**
 * IND-P1-MCP-REST-GAUGES-ENDPOINT.test.ts
 *
 * Sprint: MARKET-INDICATOR-DEPTH-P0
 *
 * Tests for GET /api/indicator-gauges handler and aggregation logic.
 *
 * Coverage:
 *   REG-1:   handleGetIndicatorGauges + aggregateIndicatorGauges are exported
 *   GEN-1:   generated_at ALWAYS a valid ISO string regardless of section state
 *   200-1:   HTTP handler returns 200 even on section failures
 *   ISO-1:   Partial failure — one source throws → that section null, others populated
 *   ISO-2:   All 5 sources fail → still 200 with all-null sections
 *   NULL-1:  breadth = null when getBreadthThrust returns {error} shape
 *   NULL-2:  sentiment null_reason preserved passthrough
 *   NULL-3:  volatility null_reason synthesized when rv_20d_percentile is null
 *   PROJ-1:  foreign_room response does NOT contain tickers key
 *   PROJ-2:  foreign_room projects market_saturation_pct + foreign_outflow_z_5d from .market
 *   LIQ-1:   liquidity = null when fetchLiquidity returns ok:false (degrade)
 *   LIQ-2:   source_tier = 3 when policy_rates.is_estimate = true (estimate/fallback)
 *   LIQ-3:   source_tier = 2 when policy_rates.is_estimate = false (live)
 *   LIQ-4:   liquidity null_reason from omo.blocked_reason when omo null
 *
 * Honest-NULL discipline: every null field carries null_reason; never fabricated.
 *
 * Run: bun test src/__tests__/IND-P1-MCP-REST-GAUGES-ENDPOINT.test.ts
 */

import { describe, it, expect } from "bun:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import {
  handleGetIndicatorGauges,
  aggregateIndicatorGauges,
  type IndicatorGaugesDto,
  type IndicatorGaugesDeps,
} from "../interface/mcp/routes/indicatorGaugesHandler.js";
import type { ComputeVolatilityResponse } from "../infrastructure/microservices/clients.js";
import type { MarketSentimentResponse } from "../application/usecases/getMarketSentimentIndex.js";
import type { ForeignRoomResponse } from "../application/usecases/getForeignRoom.js";
import type { BreadthThrustResponse } from "../application/usecases/getBreadthThrust.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal fake res for HTTP handler assertions */
function makeRes() {
  const res = {
    statusCode: 0,
    body: "",
    headers: {} as Record<string, string>,
    writeHead(code: number, headers: Record<string, string> = {}) {
      this.statusCode = code;
      Object.assign(this.headers, headers);
    },
    end(data = "") {
      this.body += data;
    },
  };
  return res;
}

const fakeReq = {} as IncomingMessage;
/** Fake DB — all source functions are mocked, actual db value unused */
const fakeDb = {} as unknown as Database;

// ─────────────────────────────────────────────────────────────────────────────
// Fixture data — minimal valid shapes for each section
// ─────────────────────────────────────────────────────────────────────────────

const mockVolatility: ComputeVolatilityResponse = {
  rv_20d_percentile: 0.72,
  rv_10d_pct: 12.5,
  rv_20d_pct: 11.8,
  rv_60d_pct: 10.2,
  gk_vol_20d_pct: 12.1,
  vol_regime: "ELEVATED",
  vol_regime_pct: 0.72,
  history_sessions: 180,
  drawdown_252d_pct: -25.4,
  source_tier: 3,
  asof: "2026-06-30T00:00:00.000Z",
};

const mockVolatilityNullPercentile: ComputeVolatilityResponse = {
  rv_20d_percentile: null,
  rv_10d_pct: null,
  rv_20d_pct: null,
  rv_60d_pct: null,
  gk_vol_20d_pct: null,
  vol_regime: null,
  vol_regime_pct: null,
  history_sessions: 5,
  drawdown_252d_pct: null,
  source_tier: 3,
};

const mockSentiment: MarketSentimentResponse = {
  news_sentiment_z: 0.45,
  history_quality: "SUFFICIENT",
  days_available: 45,
  today_date: "2026-06-30",
  today_daily_score: 0.3,
  sentiment_z_60d: 0.45,
  sentiment_z_90d: 0.32,
  sentiment_ema_5d: 0.28,
  bull_ratio_5d: 0.6,
  bear_ratio_5d: 0.25,
  neutral_ratio_5d: 0.15,
  total_articles_5d: 40,
  article_spike: false,
  today_article_count: 8,
  article_volume_30d_avg: 6.5,
  source_tier: 3,
  unit: "score",
  asof: "2026-06-30",
  confidence: 0.8,
  null_reason: null,
};

const mockSentimentNullZ: MarketSentimentResponse = {
  ...mockSentiment,
  news_sentiment_z: null,
  history_quality: "INSUFFICIENT",
  null_reason: "Only 12 days available (need ≥21)",
  confidence: 0.4,
};

/** breadth empty — returns error shape */
const mockBreadthError = {
  error: "no breadth history — market_breadth_history is empty; accrual starts on next trading day",
};

/** breadth success — minimal valid shape with breadth_z_score */
const mockBreadthSuccess: BreadthThrustResponse = {
  accruing_since: "2026-01-02",
  sessions_accrued: 120,
  history_quality: "SUFFICIENT",
  asof: "2026-06-30",
  adl: 42500,
  adl_history: [],
  rana_today: 0.62,
  mclellan_osc: 18.5,
  mclellan_summation: 285.0,
  floor_panic: false,
  ceiling_fomo: false,
  floor_pct: 0.12,
  ceiling_pct: 0.88,
  is_halt_day: false,
  thrust_triggered: false,
  thrust_sessions_count: 0,
  thrust_possible: false,
  zweig_max_consecutive: 2,
  breadth_z_score: {
    value: 1.35,
    unit: "z-score",
    asof: "2026-06-30",
    source_tier: 2,
    confidence: 1.0,
    null_reason: null,
  },
  source_tier: 2,
  source: "market_breadth_history",
  fetched_at: "2026-06-30T00:00:00.000Z",
};

const mockForeignRoom: ForeignRoomResponse = {
  as_of_date: "2026-06-30",
  tickers: [
    // Intentionally have some tickers — they must NOT appear in the response
    { code: "VCB", sector: "Banking" } as unknown as ForeignRoomResponse["tickers"][0],
    { code: "FPT", sector: "Technology" } as unknown as ForeignRoomResponse["tickers"][0],
  ],
  market: {
    market_saturation_pct: 42.5,
    sector_saturation: { Banking: 65.0, Technology: 30.0 },
    foreign_outflow_z_5d: null,
    sessions_for_z: 7,
    source_tier: 2,
    unit: "pct",
    null_reason: "Only 7 sessions available (need ≥20)",
  },
  source_tier: 2,
  coverage_note: "Covers watchlist tickers only.",
};

const mockLiquidityOkLive = (): ReturnType<NonNullable<IndicatorGaugesDeps["fetchLiquidity"]>> =>
  Promise.resolve({
    ok: true as const,
    data: {
      policy_rates: { refi_rate_pct: 4.5, is_estimate: false },
      omo: { net_outstanding_bn_vnd: 12345, is_estimate: false },
      fetched_at: "2026-06-30T00:00:00.000Z",
    },
  });

const mockLiquidityOkEstimate = (): ReturnType<NonNullable<IndicatorGaugesDeps["fetchLiquidity"]>> =>
  Promise.resolve({
    ok: true as const,
    data: {
      policy_rates: { refi_rate_pct: 4.5, is_estimate: true },
      omo: {
        net_outstanding_bn_vnd: null,
        blocked_reason: "SBV OMO parse failure — is_estimate=true",
        is_estimate: true,
      },
      fetched_at: "2026-06-30T00:00:00.000Z",
    },
  });

const mockLiquidityDegrade = (): ReturnType<NonNullable<IndicatorGaugesDeps["fetchLiquidity"]>> =>
  Promise.resolve({
    ok: false as const,
    degrade: {
      reason: "deadline" as const,
      label: "macroFetch/liquidity-state",
    },
  });

/** Build a deps object with all 5 sources mocked to valid data */
function allGoodDeps(): IndicatorGaugesDeps {
  return {
    computeVolatility: () => Promise.resolve(mockVolatility),
    computeSentiment: () => Promise.resolve(mockSentiment),
    computeBreadth: () => Promise.resolve(mockBreadthSuccess),
    computeForeignRoom: () => Promise.resolve(mockForeignRoom),
    fetchLiquidity: mockLiquidityOkLive,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// REG-1: exports exist
// ─────────────────────────────────────────────────────────────────────────────

describe("IND-P1-MCP-REST-GAUGES-ENDPOINT — registration", () => {
  it("REG-1a: handleGetIndicatorGauges is a function", () => {
    expect(typeof handleGetIndicatorGauges).toBe("function");
  });

  it("REG-1b: aggregateIndicatorGauges is a function", () => {
    expect(typeof aggregateIndicatorGauges).toBe("function");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GEN-1: generated_at always set
// ─────────────────────────────────────────────────────────────────────────────

describe("IND-P1-MCP-REST-GAUGES-ENDPOINT — generated_at invariant", () => {
  it("GEN-1a: generated_at is an ISO string when all sources succeed", async () => {
    const result = await aggregateIndicatorGauges(fakeDb, allGoodDeps());
    expect(result.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("GEN-1b: generated_at set even when all sources fail", async () => {
    const allFail: IndicatorGaugesDeps = {
      computeVolatility: () => Promise.reject(new Error("net error")),
      computeSentiment: () => Promise.reject(new Error("db error")),
      computeBreadth: () => Promise.reject(new Error("db error")),
      computeForeignRoom: () => Promise.reject(new Error("db error")),
      fetchLiquidity: mockLiquidityDegrade,
    };
    const result = await aggregateIndicatorGauges(fakeDb, allFail);
    expect(result.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 200-1: HTTP 200 always
// ─────────────────────────────────────────────────────────────────────────────

describe("IND-P1-MCP-REST-GAUGES-ENDPOINT — HTTP 200 contract", () => {
  it("200-1a: HTTP 200 when all sources succeed", async () => {
    const fakeServerRes = makeRes();
    await handleGetIndicatorGauges(
      fakeReq,
      fakeServerRes as unknown as ServerResponse,
      fakeDb,
      allGoodDeps(),
    );
    expect(fakeServerRes.statusCode).toBe(200);
  });

  it("200-1b: HTTP 200 when all sources fail (partial degrade)", async () => {
    const allFail: IndicatorGaugesDeps = {
      computeVolatility: () => Promise.reject(new Error("net error")),
      computeSentiment: () => Promise.reject(new Error("db error")),
      computeBreadth: () => Promise.reject(new Error("db error")),
      computeForeignRoom: () => Promise.reject(new Error("db error")),
      fetchLiquidity: mockLiquidityDegrade,
    };
    const fakeServerRes = makeRes();
    await handleGetIndicatorGauges(
      fakeReq,
      fakeServerRes as unknown as ServerResponse,
      fakeDb,
      allFail,
    );
    expect(fakeServerRes.statusCode).toBe(200);
  });

  it("200-1c: response body is valid JSON", async () => {
    const fakeServerRes = makeRes();
    await handleGetIndicatorGauges(
      fakeReq,
      fakeServerRes as unknown as ServerResponse,
      fakeDb,
      allGoodDeps(),
    );
    expect(() => JSON.parse(fakeServerRes.body)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ISO-1/ISO-2: Partial-failure section isolation
// ─────────────────────────────────────────────────────────────────────────────

describe("IND-P1-MCP-REST-GAUGES-ENDPOINT — section isolation (Promise.allSettled)", () => {
  it("ISO-1a: volatility source throws → volatility=null, other sections populated", async () => {
    const deps: IndicatorGaugesDeps = {
      ...allGoodDeps(),
      computeVolatility: () => Promise.reject(new Error("TA service down")),
    };
    const result = await aggregateIndicatorGauges(fakeDb, deps);

    expect(result.volatility).toBeNull();
    expect(result.sentiment).not.toBeNull();
    expect(result.breadth).not.toBeNull();
    expect(result.foreign_room).not.toBeNull();
    expect(result.liquidity).not.toBeNull();
  });

  it("ISO-1b: sentiment source throws → sentiment=null, others populated", async () => {
    const deps: IndicatorGaugesDeps = {
      ...allGoodDeps(),
      computeSentiment: () => Promise.reject(new Error("db error")),
    };
    const result = await aggregateIndicatorGauges(fakeDb, deps);

    expect(result.sentiment).toBeNull();
    expect(result.volatility).not.toBeNull();
    expect(result.breadth).not.toBeNull();
    expect(result.foreign_room).not.toBeNull();
    expect(result.liquidity).not.toBeNull();
  });

  it("ISO-1c: breadth source throws → breadth=null, others populated", async () => {
    const deps: IndicatorGaugesDeps = {
      ...allGoodDeps(),
      computeBreadth: () => Promise.reject(new Error("db error")),
    };
    const result = await aggregateIndicatorGauges(fakeDb, deps);

    expect(result.breadth).toBeNull();
    expect(result.volatility).not.toBeNull();
    expect(result.sentiment).not.toBeNull();
    expect(result.foreign_room).not.toBeNull();
    expect(result.liquidity).not.toBeNull();
  });

  it("ISO-1d: foreign_room source throws → foreign_room=null, others populated", async () => {
    const deps: IndicatorGaugesDeps = {
      ...allGoodDeps(),
      computeForeignRoom: () => Promise.reject(new Error("db error")),
    };
    const result = await aggregateIndicatorGauges(fakeDb, deps);

    expect(result.foreign_room).toBeNull();
    expect(result.volatility).not.toBeNull();
    expect(result.sentiment).not.toBeNull();
    expect(result.breadth).not.toBeNull();
    expect(result.liquidity).not.toBeNull();
  });

  it("ISO-2: all 5 sources fail → generated_at set, all sections null", async () => {
    const allFail: IndicatorGaugesDeps = {
      computeVolatility: () => Promise.reject(new Error("net error")),
      computeSentiment: () => Promise.reject(new Error("db error")),
      computeBreadth: () => Promise.reject(new Error("db error")),
      computeForeignRoom: () => Promise.reject(new Error("db error")),
      fetchLiquidity: mockLiquidityDegrade,
    };
    const result = await aggregateIndicatorGauges(fakeDb, allFail);

    expect(result.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.volatility).toBeNull();
    expect(result.sentiment).toBeNull();
    expect(result.breadth).toBeNull();
    expect(result.foreign_room).toBeNull();
    expect(result.liquidity).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NULL-1: breadth null when getBreadthThrust returns {error} shape
// ─────────────────────────────────────────────────────────────────────────────

describe("IND-P1-MCP-REST-GAUGES-ENDPOINT — honest-NULL breadth", () => {
  it("NULL-1a: breadth = null when usecase returns {error} shape (history empty)", async () => {
    const deps: IndicatorGaugesDeps = {
      ...allGoodDeps(),
      computeBreadth: () => Promise.resolve(mockBreadthError),
    };
    const result = await aggregateIndicatorGauges(fakeDb, deps);
    expect(result.breadth).toBeNull();
  });

  it("NULL-1b: breadth populated when usecase returns full success shape", async () => {
    const result = await aggregateIndicatorGauges(fakeDb, allGoodDeps());
    expect(result.breadth).not.toBeNull();
    expect(result.breadth?.breadth_z_score).toBeDefined();
    expect(result.breadth?.breadth_z_score.value).toBe(1.35);
    expect(result.breadth?.mclellan_osc).toBe(18.5);
    expect(result.breadth?.history_quality).toBe("SUFFICIENT");
    expect(result.breadth?.asof).toBe("2026-06-30");
    expect(result.breadth?.source_tier).toBe(2);
  });

  it("NULL-1c: breadth_z_score fields map correctly from GaugeReadyScalar", async () => {
    const result = await aggregateIndicatorGauges(fakeDb, allGoodDeps());
    const bz = result.breadth?.breadth_z_score;
    expect(bz?.value).toBe(1.35);
    expect(bz?.unit).toBe("z-score");
    expect(bz?.asof).toBe("2026-06-30");
    expect(bz?.confidence).toBe(1.0);
    expect(bz?.null_reason).toBeNull();
    // source_tier must NOT be on the nested breadth_z_score (only on the section)
    expect((bz as unknown as Record<string, unknown>)?.["source_tier"]).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NULL-2: sentiment passthrough
// ─────────────────────────────────────────────────────────────────────────────

describe("IND-P1-MCP-REST-GAUGES-ENDPOINT — honest-NULL sentiment", () => {
  it("NULL-2a: sentiment fields map 1:1 from usecase response", async () => {
    const result = await aggregateIndicatorGauges(fakeDb, allGoodDeps());
    const s = result.sentiment;
    expect(s).not.toBeNull();
    expect(s?.news_sentiment_z).toBe(0.45);
    expect(s?.history_quality).toBe("SUFFICIENT");
    expect(s?.sentiment_ema_5d).toBe(0.28);
    expect(s?.bull_ratio_5d).toBe(0.6);
    expect(s?.bear_ratio_5d).toBe(0.25);
    expect(s?.asof).toBe("2026-06-30");
    expect(s?.null_reason).toBeNull();
    expect(s?.source_tier).toBe(3);
  });

  it("NULL-2b: null_reason preserved when news_sentiment_z is null", async () => {
    const deps: IndicatorGaugesDeps = {
      ...allGoodDeps(),
      computeSentiment: () => Promise.resolve(mockSentimentNullZ),
    };
    const result = await aggregateIndicatorGauges(fakeDb, deps);
    expect(result.sentiment?.news_sentiment_z).toBeNull();
    expect(result.sentiment?.null_reason).toBe("Only 12 days available (need ≥21)");
    expect(result.sentiment?.history_quality).toBe("INSUFFICIENT");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NULL-3: volatility null_reason synthesized
// ─────────────────────────────────────────────────────────────────────────────

describe("IND-P1-MCP-REST-GAUGES-ENDPOINT — honest-NULL volatility", () => {
  it("NULL-3a: null_reason synthesized when rv_20d_percentile is null", async () => {
    const deps: IndicatorGaugesDeps = {
      ...allGoodDeps(),
      computeVolatility: () => Promise.resolve(mockVolatilityNullPercentile),
    };
    const result = await aggregateIndicatorGauges(fakeDb, deps);
    expect(result.volatility?.rv_20d_percentile).toBeNull();
    expect(result.volatility?.null_reason).toContain("5");
    expect(typeof result.volatility?.null_reason).toBe("string");
  });

  it("NULL-3b: null_reason is null when rv_20d_percentile is a valid number", async () => {
    const result = await aggregateIndicatorGauges(fakeDb, allGoodDeps());
    expect(result.volatility?.rv_20d_percentile).toBe(0.72);
    expect(result.volatility?.null_reason).toBeNull();
  });

  it("NULL-3c: asof derived from data.asof date portion", async () => {
    const result = await aggregateIndicatorGauges(fakeDb, allGoodDeps());
    // mockVolatility.asof = "2026-06-30T00:00:00.000Z" → asof should be "2026-06-30"
    expect(result.volatility?.asof).toBe("2026-06-30");
  });

  it("NULL-3d: source_tier defaults to 3 when data.source_tier undefined", async () => {
    const { source_tier: _omit, ...rest } = mockVolatility;
    const noTier: ComputeVolatilityResponse = rest as ComputeVolatilityResponse;
    const deps: IndicatorGaugesDeps = {
      ...allGoodDeps(),
      computeVolatility: () => Promise.resolve(noTier),
    };
    const result = await aggregateIndicatorGauges(fakeDb, deps);
    expect(result.volatility?.source_tier).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PROJ-1 / PROJ-2: foreign_room .market-only projection
// ─────────────────────────────────────────────────────────────────────────────

describe("IND-P1-MCP-REST-GAUGES-ENDPOINT — foreign_room projection", () => {
  it("PROJ-1: tickers[] is NOT present in the foreign_room section", async () => {
    const result = await aggregateIndicatorGauges(fakeDb, allGoodDeps());
    expect(result.foreign_room).not.toBeNull();
    // The tickers array must NOT appear anywhere in the foreign_room section
    const frObj = result.foreign_room as unknown as Record<string, unknown>;
    expect("tickers" in frObj).toBe(false);
  });

  it("PROJ-2a: market_saturation_pct from .market", async () => {
    const result = await aggregateIndicatorGauges(fakeDb, allGoodDeps());
    expect(result.foreign_room?.market_saturation_pct).toBe(42.5);
  });

  it("PROJ-2b: foreign_outflow_z_5d null (insufficient sessions) with null_reason", async () => {
    const result = await aggregateIndicatorGauges(fakeDb, allGoodDeps());
    expect(result.foreign_room?.foreign_outflow_z_5d).toBeNull();
    expect(result.foreign_room?.null_reason).toContain("7 sessions");
  });

  it("PROJ-2c: as_of_date from top-level response (not from .market)", async () => {
    const result = await aggregateIndicatorGauges(fakeDb, allGoodDeps());
    expect(result.foreign_room?.as_of_date).toBe("2026-06-30");
  });

  it("PROJ-2d: source_tier from .market.source_tier (=2)", async () => {
    const result = await aggregateIndicatorGauges(fakeDb, allGoodDeps());
    expect(result.foreign_room?.source_tier).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LIQ-1/2/3/4: liquidity section
// ─────────────────────────────────────────────────────────────────────────────

describe("IND-P1-MCP-REST-GAUGES-ENDPOINT — liquidity section", () => {
  it("LIQ-1: liquidity = null when fetchLiquidity returns ok:false", async () => {
    const deps: IndicatorGaugesDeps = {
      ...allGoodDeps(),
      fetchLiquidity: mockLiquidityDegrade,
    };
    const result = await aggregateIndicatorGauges(fakeDb, deps);
    expect(result.liquidity).toBeNull();
  });

  it("LIQ-2: source_tier = 3 when policy_rates.is_estimate = true", async () => {
    const deps: IndicatorGaugesDeps = {
      ...allGoodDeps(),
      fetchLiquidity: mockLiquidityOkEstimate,
    };
    const result = await aggregateIndicatorGauges(fakeDb, deps);
    expect(result.liquidity?.source_tier).toBe(3);
  });

  it("LIQ-3: source_tier = 2 when policy_rates.is_estimate = false", async () => {
    const result = await aggregateIndicatorGauges(fakeDb, allGoodDeps());
    expect(result.liquidity?.source_tier).toBe(2);
  });

  it("LIQ-4a: omo_net_outstanding_bn_vnd populated when omo ok", async () => {
    const result = await aggregateIndicatorGauges(fakeDb, allGoodDeps());
    expect(result.liquidity?.omo_net_outstanding_bn_vnd).toBe(12345);
    expect(result.liquidity?.null_reason).toBeNull();
  });

  it("LIQ-4b: null_reason from omo.blocked_reason when omo null", async () => {
    const deps: IndicatorGaugesDeps = {
      ...allGoodDeps(),
      fetchLiquidity: mockLiquidityOkEstimate,
    };
    const result = await aggregateIndicatorGauges(fakeDb, deps);
    expect(result.liquidity?.omo_net_outstanding_bn_vnd).toBeNull();
    expect(result.liquidity?.null_reason).toBe("SBV OMO parse failure — is_estimate=true");
  });

  it("LIQ-4c: policy_refi_rate_pct mapped from policy_rates.refi_rate_pct", async () => {
    const result = await aggregateIndicatorGauges(fakeDb, allGoodDeps());
    expect(result.liquidity?.policy_refi_rate_pct).toBe(4.5);
  });

  it("LIQ-4d: fetched_at preserved from macro payload", async () => {
    const result = await aggregateIndicatorGauges(fakeDb, allGoodDeps());
    expect(result.liquidity?.fetched_at).toBe("2026-06-30T00:00:00.000Z");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Full HTTP handler integration test
// ─────────────────────────────────────────────────────────────────────────────

describe("IND-P1-MCP-REST-GAUGES-ENDPOINT — HTTP handler", () => {
  it("handles full success: 200 + valid DTO body", async () => {
    const fakeServerRes = makeRes();
    await handleGetIndicatorGauges(
      fakeReq,
      fakeServerRes as unknown as ServerResponse,
      fakeDb,
      allGoodDeps(),
    );

    expect(fakeServerRes.statusCode).toBe(200);
    const body = JSON.parse(fakeServerRes.body) as IndicatorGaugesDto;
    expect(body.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.volatility).not.toBeNull();
    expect(body.sentiment).not.toBeNull();
    expect(body.breadth).not.toBeNull();
    expect(body.foreign_room).not.toBeNull();
    expect(body.liquidity).not.toBeNull();
  });

  it("handles partial failure: 200 + some sections null", async () => {
    const fakeServerRes = makeRes();
    await handleGetIndicatorGauges(
      fakeReq,
      fakeServerRes as unknown as ServerResponse,
      fakeDb,
      {
        computeVolatility: () => Promise.reject(new Error("TA service down")),
        computeSentiment: () => Promise.resolve(mockSentiment),
        computeBreadth: () => Promise.resolve(mockBreadthError),
        computeForeignRoom: () => Promise.reject(new Error("db error")),
        fetchLiquidity: mockLiquidityDegrade,
      },
    );

    expect(fakeServerRes.statusCode).toBe(200);
    const body = JSON.parse(fakeServerRes.body) as IndicatorGaugesDto;
    expect(body.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.volatility).toBeNull();
    expect(body.sentiment).not.toBeNull();
    expect(body.breadth).toBeNull(); // error shape → null
    expect(body.foreign_room).toBeNull();
    expect(body.liquidity).toBeNull();
  });
});
