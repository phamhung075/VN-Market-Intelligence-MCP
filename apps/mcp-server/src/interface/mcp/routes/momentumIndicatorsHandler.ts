/**
 * momentumIndicatorsHandler.ts — GET /api/momentum-indicators
 *
 * TASK-501-MOMENTUM-API-HANDLER (sprint BA-IND-P1-MOMENTUM-FRONTEND)
 *
 * Aggregates the 4 P1 momentum sources into a single REST response so the
 * frontend dashboard can render real momentum-card data.
 *
 * Sources (resolved in parallel via Promise.allSettled):
 *   1. roc              — computeROCMomentum({})        (TA service HTTP POST)
 *   2. relative_strength — computeRelativeStrength({})   (TA service HTTP POST)
 *   3. proximity_52w    — compute52WProximity({})        (TA service HTTP POST)
 *   4. foreign_accum    — computeForeignAccumRank({})    (stock-price service HTTP POST)
 *
 * Isolation contract:
 *   - Promise.allSettled isolates each source — one failure degrades ONLY that section.
 *   - Section failure (throw / rejected Promise) → section = null.
 *   - Endpoint returns HTTP 200 whenever it can construct a response.
 *   - generated_at ALWAYS set.
 *
 * Honest-NULL (STANDING RULE):
 *   - Real fetched values or explicit null + null_reason — NEVER fabricated.
 *   - roc: null when momentum_factor_z is null (insufficient OHLCV history).
 *   - relative_strength: null_reason when market_rs_composite null (N < 5).
 *   - proximity_52w: null_reason when pct_above_ma200 null (denominator_ma200 = 0).
 *   - foreign_accum: null_reason when foreign_accum_z_market null (< 5 tickers with ≥5 bars).
 *   - Section builders project ONLY market-aggregate scalars — NEVER forward .tickers[] arrays.
 *
 * source_tier: 3 for all 4 sections (ARCH-RATIFY M3 — compute-on-read from SQLite, no live API).
 *
 * CRITICAL: NO db: Database param — all 4 P1 sources are remote HTTP via clients.ts.
 *
 * DDD Layer: interface — imports from infrastructure only (clients.ts).
 *   No domain logic in this file.
 *
 * @module interface/mcp/routes/momentumIndicatorsHandler
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import {
  computeROCMomentum,
  computeRelativeStrength,
  compute52WProximity,
  computeForeignAccumRank,
  type ComputeROCMomentumResponse,
  type ComputeRelativeStrengthResponse,
  type Compute52WProximityResponse,
  type ComputeForeignAccumRankResponse,
} from "../../../infrastructure/microservices/clients.js";

// ─────────────────────────────────────────────────────────────────────────────
// Response DTO types — must match frontend MomentumIndicatorsDto field-for-field
// Spec: docs/handoffs/BA-IND-P1-MOMENTUM-FRONTEND.md §FR-A4
// ─────────────────────────────────────────────────────────────────────────────

export interface RocGauge {
  /** Z-score of cross-sectional momentum factor return. Null when insufficient history (<13 bars). */
  momentum_factor_z: number | null;
  /** ISO date-time of computation. */
  computed_as_of: string;
  /** Reason when momentum_factor_z is null. */
  null_reason: string | null;
  /** ARCH-RATIFY M3: compute-on-read from SQLite → source_tier = 3 */
  source_tier: number;
}

export interface RelativeStrengthGauge {
  /** Composite market-wide RS score. Null when watchlist N < 5. */
  market_rs_composite: number | null;
  /** True when sample size is below recommended threshold. Passthrough from service. */
  low_sample_warning: boolean;
  /** ISO date-time of computation. */
  computed_as_of: string;
  /** Reason when market_rs_composite is null. */
  null_reason: string | null;
  /** ARCH-RATIFY M3: compute-on-read from SQLite → source_tier = 3 */
  source_tier: number;
}

export interface Proximity52WGauge {
  /** Net (new highs - new lows) for this session. From top-level response. */
  net_new_highs: number;
  /** Fraction of tickers above their MA-50 (0–1). From aggregate. */
  pct_above_ma50: number | null;
  /** Fraction of tickers above their MA-200 (0–1). Null when denominator_ma200 = 0. */
  pct_above_ma200: number | null;
  /** Count of tickers with ≥200-bar OHLCV history. From top-level response. */
  denominator_ma200: number;
  /** ISO date-time of computation. */
  computed_as_of: string;
  /** Reason when pct_above_ma200 is null. */
  null_reason: string | null;
  /** ARCH-RATIFY M3: compute-on-read from SQLite → source_tier = 3 */
  source_tier: number;
}

export interface ForeignAccumGauge {
  /** Market-wide Z-score of foreign net flow (5d normalized). Null when < 5 tickers with ≥5 bars. */
  foreign_accum_z_market: number | null;
  /** Unit for ADTV normalization (e.g. "vnd_bn"). */
  adtv_unit: string;
  /** ISO date-time of computation. */
  computed_as_of: string;
  /** Reason when foreign_accum_z_market is null. */
  null_reason: string | null;
  /** ARCH-RATIFY M3: compute-on-read from SQLite → source_tier = 3 */
  source_tier: number;
}

export interface MomentumIndicatorsDto {
  /** Server clock ISO timestamp. ALWAYS set. */
  generated_at: string;
  /** Set only on catastrophic handler failure. */
  error?: string;
  /** ROC momentum factor Z-score. null only if source errors entirely. */
  roc: RocGauge | null;
  /** Market-wide relative strength composite. null only if source errors entirely. */
  relative_strength: RelativeStrengthGauge | null;
  /** 52-week proximity breadth. null only if source errors entirely. */
  proximity_52w: Proximity52WGauge | null;
  /** Foreign accumulation Z-score. null only if source errors entirely. */
  foreign_accum: ForeignAccumGauge | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dependency injection — injectable source functions (test isolation)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Optional overrides for all 4 source functions.
 * Production: all undefined → real clients.ts implementations used.
 * Tests: inject stubs to avoid real HTTP calls.
 */
export interface MomentumIndicatorsDeps {
  /** Override computeROCMomentum call. */
  computeRoc?: () => Promise<ComputeROCMomentumResponse>;
  /** Override computeRelativeStrength call. */
  computeRS?: () => Promise<ComputeRelativeStrengthResponse>;
  /** Override compute52WProximity call. */
  compute52W?: () => Promise<Compute52WProximityResponse>;
  /** Override computeForeignAccumRank call. */
  computeForeignAccum?: () => Promise<ComputeForeignAccumRankResponse>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section builders — pure mapping, no IO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map ComputeROCMomentumResponse → RocGauge.
 *
 * momentum_factor_z: null when insufficient OHLCV history (<13 bars).
 * NEVER forward tickers[] or factor_return_buckets[].
 * source_tier: 3 (ARCH-RATIFY M3).
 */
export function buildRocSection(data: ComputeROCMomentumResponse): RocGauge {
  const null_reason =
    data.momentum_factor_z === null
      ? "Insufficient OHLCV history — momentum_factor_z requires ≥13 bars"
      : null;

  return {
    momentum_factor_z: data.momentum_factor_z,
    computed_as_of: data.computed_as_of,
    null_reason,
    source_tier: 3,
  };
}

/**
 * Map ComputeRelativeStrengthResponse → RelativeStrengthGauge.
 *
 * market_rs_composite: null when watchlist N < 5.
 * low_sample_warning: passthrough from service.
 * NEVER forward tickers[].
 * source_tier: 3 (ARCH-RATIFY M3).
 */
export function buildRelativeStrengthSection(
  data: ComputeRelativeStrengthResponse,
): RelativeStrengthGauge {
  const null_reason =
    data.market_rs_composite === null
      ? "Watchlist too small — market_rs_composite requires N ≥ 5 tickers"
      : null;

  return {
    market_rs_composite: data.market_rs_composite,
    low_sample_warning: data.low_sample_warning,
    computed_as_of: data.computed_as_of,
    null_reason,
    source_tier: 3,
  };
}

/**
 * Map Compute52WProximityResponse → Proximity52WGauge.
 *
 * pct_above_ma200: null when denominator_ma200 = 0 (no tickers with ≥200-bar history).
 * Projects: net_new_highs + denominator_ma200 from top-level; pct_above_ma50 + pct_above_ma200 from aggregate.
 * NEVER forward tickers[].
 * source_tier: 3 (ARCH-RATIFY M3).
 */
export function buildProximity52WSection(
  data: Compute52WProximityResponse,
): Proximity52WGauge {
  const null_reason =
    data.aggregate.pct_above_ma200 === null
      ? "denominator_ma200 = 0 — no tickers have ≥200-bar OHLCV history"
      : null;

  return {
    net_new_highs: data.net_new_highs,
    pct_above_ma50: data.aggregate.pct_above_ma50,
    pct_above_ma200: data.aggregate.pct_above_ma200,
    denominator_ma200: data.denominator_ma200,
    computed_as_of: data.computed_as_of,
    null_reason,
    source_tier: 3,
  };
}

/**
 * Map ComputeForeignAccumRankResponse → ForeignAccumGauge.
 *
 * foreign_accum_z_market: null when < 5 tickers have ≥5 bars of flow data.
 * NEVER forward tickers[].
 * source_tier: 3 (ARCH-RATIFY M3).
 */
export function buildForeignAccumSection(
  data: ComputeForeignAccumRankResponse,
): ForeignAccumGauge {
  const null_reason =
    data.foreign_accum_z_market === null
      ? "Insufficient tickers with ≥5 days of flow data"
      : null;

  return {
    foreign_accum_z_market: data.foreign_accum_z_market,
    adtv_unit: data.adtv_unit,
    computed_as_of: data.computed_as_of,
    null_reason,
    source_tier: 3,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Core aggregation — exported for testability
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aggregate all 4 P1 momentum sources in parallel.
 *
 * Uses Promise.allSettled so one source failure degrades only that section.
 * Always returns a valid MomentumIndicatorsDto — individual sections may be null.
 *
 * CRITICAL: NO db param — all 4 sources are remote HTTP via clients.ts.
 *
 * @param deps - Optional overrides for testability
 */
export async function aggregateMomentumIndicators(
  deps: MomentumIndicatorsDeps = {},
): Promise<MomentumIndicatorsDto> {
  const doRoc =
    deps.computeRoc ?? (() => computeROCMomentum({}));
  const doRS =
    deps.computeRS ?? (() => computeRelativeStrength({}));
  const do52W =
    deps.compute52W ?? (() => compute52WProximity({}));
  const doForeignAccum =
    deps.computeForeignAccum ?? (() => computeForeignAccumRank({}));

  const [rocResult, rsResult, prox52wResult, foreignAccumResult] =
    await Promise.allSettled([
      doRoc(),
      doRS(),
      do52W(),
      doForeignAccum(),
    ]);

  return {
    generated_at: new Date().toISOString(),
    roc:
      rocResult.status === "fulfilled"
        ? buildRocSection(rocResult.value)
        : null,
    relative_strength:
      rsResult.status === "fulfilled"
        ? buildRelativeStrengthSection(rsResult.value)
        : null,
    proximity_52w:
      prox52wResult.status === "fulfilled"
        ? buildProximity52WSection(prox52wResult.value)
        : null,
    foreign_accum:
      foreignAccumResult.status === "fulfilled"
        ? buildForeignAccumSection(foreignAccumResult.value)
        : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle GET /api/momentum-indicators.
 *
 * Always returns HTTP 200 — section failures degrade to null, never 5xx.
 * Catastrophic handler failure (cannot construct response) still returns 200
 * with all-null sections + error field per the honest-NULL contract.
 *
 * CRITICAL: NO db param — all 4 P1 sources are remote HTTP via clients.ts.
 *
 * @param _req - HTTP request (unused — no query params)
 * @param res  - HTTP response
 * @param deps - Optional overrides for testability
 */
export async function handleGetMomentumIndicators(
  _req: IncomingMessage,
  res: ServerResponse,
  deps: MomentumIndicatorsDeps = {},
): Promise<void> {
  try {
    const body = await aggregateMomentumIndicators(deps);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  } catch (err) {
    // Catastrophic failure — still return 200 with all-null sections + error string
    const body: MomentumIndicatorsDto = {
      generated_at: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
      roc: null,
      relative_strength: null,
      proximity_52w: null,
      foreign_accum: null,
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  }
}
