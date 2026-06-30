/**
 * indicatorGaugesHandler.ts — GET /api/indicator-gauges
 *
 * IND-P1-MCP-REST-GAUGES-ENDPOINT (sprint MARKET-INDICATOR-DEPTH-P0)
 *
 * Aggregates the 5 P0 indicator sources into a single REST response so the
 * frontend dashboard.indicator-gauges.tsx can render real gauge-card data.
 *
 * Sources (resolved in parallel via Promise.allSettled):
 *   1. volatility   — computeVolatilityIndicators()    (TA service HTTP POST)
 *   2. sentiment    — getMarketSentimentIndex(db)       (SQLite, local)
 *   3. breadth      — getBreadthThrust(db)              (SQLite, local)
 *   4. foreign_room — getForeignRoom(db)                (SQLite, local)
 *   5. liquidity    — macroFetch() → /liquidity-state  (macro-indicators HTTP POST)
 *
 * Isolation contract:
 *   - Promise.allSettled isolates each source — one failure degrades ONLY that section.
 *   - Section failure (throw / rejected Promise) → section = null.
 *   - Liquidity ok:false (macroFetch degrade) → liquidity = null.
 *   - Endpoint returns HTTP 200 whenever it can construct a response.
 *   - generated_at ALWAYS set.
 *
 * Honest-NULL (STANDING RULE):
 *   - Real fetched values or explicit null + null_reason — NEVER fabricated.
 *   - breadth: null when getBreadthThrust returns {error} (history empty/accruing).
 *   - foreign_room projects ONLY .market scalars — NEVER forwards .tickers[].
 *   - liquidity.source_tier ENDPOINT-ASSIGNED (macro payload carries no source_tier).
 *
 * DDD Layer: interface — imports from application/usecases + infrastructure.
 *   No domain logic in this file. db is injected by server.ts.
 *
 * @module interface/mcp/routes/indicatorGaugesHandler
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import {
  computeVolatilityIndicators,
  type ComputeVolatilityResponse,
} from "../../../infrastructure/microservices/clients.js";
import {
  getMarketSentimentIndex,
  type MarketSentimentResponse,
} from "../../../application/usecases/getMarketSentimentIndex.js";
import {
  getBreadthThrust,
  type BreadthThrustResponse,
} from "../../../application/usecases/getBreadthThrust.js";
import {
  getForeignRoom,
  type ForeignRoomResponse,
} from "../../../application/usecases/getForeignRoom.js";
import { macroFetch, type DegradeEnvelope } from "../../../infrastructure/fetchers/fetchDeadline.js";
import { getMacroBaseUrl } from "../tools/macro/macroHttpClient.js";

// ─────────────────────────────────────────────────────────────────────────────
// Liquidity state shape (minimal — maps only the fields we project)
// Full schema: liquidityStateTools.ts LiquidityStateResponseSchema
// ─────────────────────────────────────────────────────────────────────────────

interface LiquidityPolicyRates {
  refi_rate_pct: number;
  is_estimate: boolean;
}

interface LiquidityOmo {
  net_outstanding_bn_vnd: number | null;
  blocked_reason?: string;
  is_estimate: boolean;
}

interface LiquidityStateData {
  policy_rates: LiquidityPolicyRates;
  omo: LiquidityOmo;
  fetched_at: string;
}

/** Discriminated result of macroFetch<LiquidityStateData> */
type LiquidityFetchResult =
  | { ok: true; data: LiquidityStateData }
  | { ok: false; degrade: DegradeEnvelope };

// ─────────────────────────────────────────────────────────────────────────────
// Response DTO types — must match frontend IndicatorGaugesDto field-for-field
// SSOT: apps/frontend/app/routes/dashboard.indicator-gauges.tsx (interfaces L49-133)
// ─────────────────────────────────────────────────────────────────────────────

export interface VolatilityGauge {
  /** Percentile rank of rv_20d in available history (0–1). Null when insufficient. */
  rv_20d_percentile: number | null;
  /** Annualized realized volatility 20-day (%). */
  rv_20d_pct: number | null;
  /** Regime label: "LOW" | "NORMAL" | "ELEVATED" | "CRISIS". */
  vol_regime: string | null;
  /** Percentile rank used for regime classification (0–1). */
  vol_regime_pct: number | null;
  /** Date of last computation (YYYY-MM-DD). Derived from data.asof or server date. */
  asof: string | null;
  /** Reason when rv_20d_percentile is null (synthesized from history_sessions). */
  null_reason: string | null;
  source_tier: number;
}

export interface SentimentGauge {
  /** z-score vs 60d baseline (null when INSUFFICIENT). */
  news_sentiment_z: number | null;
  /** Always present. "EMPTY" | "INSUFFICIENT" | "SUFFICIENT". */
  history_quality: "EMPTY" | "INSUFFICIENT" | "SUFFICIENT";
  /** 5-day EMA of daily sentiment score. */
  sentiment_ema_5d: number | null;
  /** Proportion of bullish articles in last 5 days (0–1). */
  bull_ratio_5d: number | null;
  /** Proportion of bearish articles in last 5 days (0–1). */
  bear_ratio_5d: number | null;
  /** ISO date this response represents (YYYY-MM-DD). */
  asof: string;
  /** Human-readable reason when news_sentiment_z is null. */
  null_reason: string | null;
  source_tier: number;
}

export interface BreadthZScore {
  /** Z-score value, null when <21 sessions or osc not warmed up. */
  value: number | null;
  unit: string;
  asof: string | null;
  confidence: number | null;
  null_reason: string | null;
  // Note: source_tier lives on BreadthGauge, NOT here — the frontend BreadthZScore has no source_tier
}

export interface BreadthGauge {
  /** Gauge-ready scalar P1 (6-field wrapper minus source_tier). */
  breadth_z_score: BreadthZScore;
  /** McClellan Oscillator value, null when <39 sessions. */
  mclellan_osc: number | null;
  /** History quality: "INSUFFICIENT" | "WARMUP" | "SUFFICIENT". */
  history_quality: "INSUFFICIENT" | "WARMUP" | "SUFFICIENT";
  /** Most recent session date. */
  asof: string | null;
  source_tier: number;
}

export interface ForeignRoomGauge {
  /** Cap-weighted market saturation % (0–100). From .market.market_saturation_pct. */
  market_saturation_pct: number | null;
  /** Gauge-ready z-score of market-wide 5d velocity. Null when <20 sessions. */
  foreign_outflow_z_5d: number | null;
  /** As-of date from top-level response (NOT from .market). */
  as_of_date: string | null;
  /** From .market.null_reason when foreign_outflow_z_5d is null. */
  null_reason: string | null;
  /** From .market.source_tier (=2). */
  source_tier: number;
}

export interface LiquidityGauge {
  /** SBV OMO net outstanding (bn VND). Null when blocked or parse failed. */
  omo_net_outstanding_bn_vnd: number | null;
  /** SBV refi rate (%). From policy_rates.refi_rate_pct. */
  policy_refi_rate_pct: number | null;
  /** ISO timestamp when liquidity data was fetched. */
  fetched_at: string | null;
  /** Reason when omo_net_outstanding_bn_vnd is null (from omo.blocked_reason). */
  null_reason: string | null;
  /**
   * ENDPOINT-ASSIGNED (macro payload carries no source_tier):
   *   2 = policy_rates.is_estimate=false (live SBV fetch)
   *   3 = policy_rates.is_estimate=true  (DB fallback / estimate)
   */
  source_tier: number;
}

export interface IndicatorGaugesDto {
  /** Server clock ISO timestamp. ALWAYS set. */
  generated_at: string;
  /** Set only on catastrophic handler failure. */
  error?: string;
  volatility: VolatilityGauge | null;
  sentiment: SentimentGauge | null;
  /** null when getBreadthThrust returns {error} (history still accruing). */
  breadth: BreadthGauge | null;
  /** null only if getForeignRoom errors entirely. */
  foreign_room: ForeignRoomGauge | null;
  /** null when macroFetch returns ok:false (service down / timeout). */
  liquidity: LiquidityGauge | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dependency injection — injectable source functions (test isolation)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Optional overrides for all 5 source functions.
 * Production: all undefined → real implementations used.
 * Tests: inject stubs to avoid real HTTP / DB calls.
 */
export interface IndicatorGaugesDeps {
  /** Override macro-indicators base URL (default: getMacroBaseUrl()). */
  macroBaseUrl?: string;
  /** Override computeVolatilityIndicators call. */
  computeVolatility?: () => Promise<ComputeVolatilityResponse>;
  /** Override getMarketSentimentIndex call. */
  computeSentiment?: (db: Database) => Promise<MarketSentimentResponse>;
  /** Override getBreadthThrust call. */
  computeBreadth?: (db: Database) => Promise<BreadthThrustResponse | { error: string }>;
  /** Override getForeignRoom call. */
  computeForeignRoom?: (db: Database) => Promise<ForeignRoomResponse>;
  /** Override macroFetch liquidity call. */
  fetchLiquidity?: () => Promise<LiquidityFetchResult>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section builders — pure mapping, no IO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map ComputeVolatilityResponse → VolatilityGauge.
 *
 * asof: data.asof is optional in the TS interface → derive YYYY-MM-DD from it
 *        when present; fall back to server date.
 * null_reason: synthesized from history_sessions when rv_20d_percentile is null.
 */
function buildVolatilitySection(data: ComputeVolatilityResponse): VolatilityGauge {
  const asof =
    typeof data.asof === "string"
      ? data.asof.slice(0, 10)
      : new Date().toISOString().slice(0, 10);

  const null_reason =
    data.rv_20d_percentile === null
      ? data.history_sessions != null
        ? `Insufficient history (${data.history_sessions} sessions available)`
        : "Insufficient history — rv_20d_percentile not computable"
      : null;

  return {
    rv_20d_percentile: data.rv_20d_percentile,
    rv_20d_pct: data.rv_20d_pct,
    vol_regime: data.vol_regime,
    vol_regime_pct: data.vol_regime_pct,
    asof,
    null_reason,
    source_tier: data.source_tier ?? 3,
  };
}

/**
 * Map MarketSentimentResponse → SentimentGauge.
 * Straight passthrough — all required fields already exist in the usecase response.
 */
function buildSentimentSection(data: MarketSentimentResponse): SentimentGauge {
  return {
    news_sentiment_z: data.news_sentiment_z,
    history_quality: data.history_quality,
    sentiment_ema_5d: data.sentiment_ema_5d,
    bull_ratio_5d: data.bull_ratio_5d,
    bear_ratio_5d: data.bear_ratio_5d,
    asof: data.asof,
    null_reason: data.null_reason,
    source_tier: data.source_tier,
  };
}

/**
 * Map BreadthThrustResponse → BreadthGauge | null.
 *
 * NFR-BR-3: when getBreadthThrust returns {error} (table empty / history
 * accruing), emit breadth=null (honest-NULL). The frontend renders a gray
 * "Chưa có dữ liệu" badge for this section.
 *
 * breadth_z_score: project {value, unit, asof, confidence, null_reason} only —
 *   source_tier lives on the section level, not the nested BreadthZScore.
 */
function buildBreadthSection(
  data: BreadthThrustResponse | { error: string },
): BreadthGauge | null {
  if ("error" in data) {
    // History still accruing — honest-NULL per NFR-BR-3
    return null;
  }

  const bz = data.breadth_z_score;
  return {
    breadth_z_score: {
      value: bz.value,
      unit: bz.unit,
      asof: bz.asof,
      confidence: bz.confidence,
      null_reason: bz.null_reason,
    },
    mclellan_osc: data.mclellan_osc,
    history_quality: data.history_quality,
    asof: data.asof,
    source_tier: data.source_tier,
  };
}

/**
 * Map ForeignRoomResponse → ForeignRoomGauge.
 *
 * CRITICAL: project ONLY the two .market scalars (market_saturation_pct,
 * foreign_outflow_z_5d). NEVER forward .tickers[] — the gauge response
 * must stay small (105-ticker array excluded by design).
 *
 * as_of_date: from TOP-LEVEL response (not from .market).
 * null_reason: from .market.null_reason (optional field — default null).
 * source_tier: from .market.source_tier (= 2).
 */
function buildForeignRoomSection(data: ForeignRoomResponse): ForeignRoomGauge {
  const market = data.market;
  return {
    market_saturation_pct: market.market_saturation_pct,
    foreign_outflow_z_5d: market.foreign_outflow_z_5d,
    as_of_date: data.as_of_date,
    null_reason: market.null_reason ?? null,
    source_tier: market.source_tier,
  };
}

/**
 * Map LiquidityFetchResult → LiquidityGauge | null.
 *
 * ok:false → null (service down, deadline, or network error).
 *
 * source_tier ENDPOINT-ASSIGNED (macro payload has none):
 *   - 2: policy_rates.is_estimate=false (live SBV fetch)
 *   - 3: policy_rates.is_estimate=true  (DB fallback / estimate)
 *
 * null_reason: from omo.blocked_reason when omo.net_outstanding_bn_vnd is null.
 */
function buildLiquiditySection(result: LiquidityFetchResult): LiquidityGauge | null {
  if (!result.ok) {
    return null;
  }

  const { policy_rates, omo, fetched_at } = result.data;
  const source_tier = policy_rates.is_estimate === true ? 3 : 2;
  const null_reason =
    omo.net_outstanding_bn_vnd === null
      ? (omo.blocked_reason ?? "OMO data unavailable")
      : null;

  return {
    omo_net_outstanding_bn_vnd: omo.net_outstanding_bn_vnd,
    policy_refi_rate_pct: policy_rates.refi_rate_pct,
    fetched_at,
    null_reason,
    source_tier,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Core aggregation — exported for testability
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aggregate all 5 P0 indicator sources in parallel.
 *
 * Uses Promise.allSettled so one source failure degrades only that section.
 * Always returns a valid IndicatorGaugesDto — individual sections may be null.
 *
 * @param db   - SQLite database (injected by server.ts)
 * @param deps - Optional overrides for testability
 */
export async function aggregateIndicatorGauges(
  db: Database,
  deps: IndicatorGaugesDeps = {},
): Promise<IndicatorGaugesDto> {
  const macroBaseUrl = deps.macroBaseUrl ?? getMacroBaseUrl();

  const doVolatility =
    deps.computeVolatility ?? (() => computeVolatilityIndicators({}));
  const doSentiment =
    deps.computeSentiment ?? ((d: Database) => getMarketSentimentIndex(d));
  const doBreadth =
    deps.computeBreadth ?? ((d: Database) => getBreadthThrust(d));
  const doForeignRoom =
    deps.computeForeignRoom ?? ((d: Database) => getForeignRoom(d));
  const doLiquidity =
    deps.fetchLiquidity ??
    (() =>
      macroFetch<LiquidityStateData>(
        macroBaseUrl,
        "/liquidity-state",
        {},
        { deadlineMs: 15_000 },
      ) as Promise<LiquidityFetchResult>);

  const [volResult, sentResult, breadthResult, frResult, liqResult] =
    await Promise.allSettled([
      doVolatility(),
      doSentiment(db),
      doBreadth(db),
      doForeignRoom(db),
      doLiquidity(),
    ]);

  return {
    generated_at: new Date().toISOString(),
    volatility:
      volResult.status === "fulfilled"
        ? buildVolatilitySection(volResult.value)
        : null,
    sentiment:
      sentResult.status === "fulfilled"
        ? buildSentimentSection(sentResult.value)
        : null,
    breadth:
      breadthResult.status === "fulfilled"
        ? buildBreadthSection(breadthResult.value)
        : null,
    foreign_room:
      frResult.status === "fulfilled"
        ? buildForeignRoomSection(frResult.value)
        : null,
    liquidity:
      liqResult.status === "fulfilled"
        ? buildLiquiditySection(liqResult.value)
        : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle GET /api/indicator-gauges.
 *
 * Always returns HTTP 200 — section failures degrade to null, never 5xx.
 * Catastrophic handler failure (cannot construct response) still returns 200
 * with all-null sections + error field per the honest-NULL contract.
 *
 * @param _req - HTTP request (unused — no query params)
 * @param res  - HTTP response
 * @param db   - SQLite database (injected by server.ts)
 * @param deps - Optional overrides for testability
 */
export async function handleGetIndicatorGauges(
  _req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  deps: IndicatorGaugesDeps = {},
): Promise<void> {
  try {
    const body = await aggregateIndicatorGauges(db, deps);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  } catch (err) {
    // Catastrophic failure — still return 200 with all-null sections + error string
    const body: IndicatorGaugesDto = {
      generated_at: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
      volatility: null,
      sentiment: null,
      breadth: null,
      foreign_room: null,
      liquidity: null,
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  }
}
