/**
 * /dashboard/momentum — "Động Lực & Dòng Tiền" (merged: Momentum P1 + Money Radar P0).
 *
 * Sprint: MERGE-MONEY-RADAR-INTO-MOMENTUM (this merge) — absorbs the former
 * /dashboard/money-radar page (see dashboard.money-radar.tsx, now a redirect-only
 * route) per docs/handoffs/BA-MERGE-MONEY-RADAR-INTO-MOMENTUM.md.
 * Prior sprints: BA-IND-P1-MOMENTUM-FRONTEND / TASK-502-MOMENTUM-FRONTEND (Section A,
 * momentum) and MONEY-RADAR-P0 / MONEY-RADAR-P0-T3-DASHBOARD (Section B, radar).
 *
 * ONE unified page, TWO textually-distinct DTO/parser/formatter/fetcher families
 * (do-not-homogenize, HARD per BA spec §5/§10) — only the presentational shell
 * (GaugeCard/FreshnessBadge/InfoCardExpand) is shared, and that reuse predates
 * this merge (both source pages already called them identically).
 *
 * Section A — "Động Lực Thị Trường" (momentum, honest-NULL, OHLCV-depth-gated).
 * Data source: GET /api/momentum-indicators (proxy: api.momentum-indicators.tsx).
 * Surfaces 4 P1 momentum scalars:
 *   1. momentum_factor_z      — ROC (get_roc_momentum)
 *   2. market_rs_composite    — RS  (get_relative_strength)
 *   3. net_new_highs          — 52W proximity (get_52w_proximity)
 *   4. foreign_accum_z_market — Foreign accumulation (get_foreign_accum_rank)
 * Honest-NULL contract (HARD): sections/scalars may be null when data is still
 * accruing or blocked. NEVER fabricate. Null section renders "Chưa có dữ liệu" +
 * gray FreshnessBadge.
 *
 * Section B — "Radar Dòng Tiền" (money-radar, non-null on live data,
 * depth-independent inputs). Data source: GET /api/money-radar (proxy:
 * api.money-radar.tsx). Upstream tool: get_money_radar_composite.
 * Surfaces 4 Money Radar P0 scalars:
 *   1. score                             — Composite money-flow score [-1,+1]
 *   2. components.foreign_accum_z_market — Foreign accumulation z-score
 *   3. components.rel_vol_z_20           — Domestic relative-volume z-score(20)
 *   4. divergence.flag                   — Divergence engine (D1-D4) signal
 * Honest-NULL contract (HN-6): score/components null when coverage_pct < 0.5;
 * divergence.flag === "UNKNOWN" is the divergence-specific honest-null state
 * (HN-4) — never fabricated as GREEN.
 *
 * Loader: fetches both feeds independently via Promise.allSettled — one feed's
 * failure never blanks the other section (per-section isolation, page always 200).
 * fetchMomentumIndicators/fetchMoneyRadarComposite already swallow errors
 * internally (safeFetch), so the allSettled rejected branch is defense-in-depth.
 *
 * Freshness: SLA tier "daily" (maxStalenessMin=1560, 26h) for BOTH families.
 * useFreshnessRevalidator("daily") called ONCE for the whole page (both families
 * share the tier). Page-level FreshnessBadge shows the OLDER (less fresh) of the
 * two feeds' generated_at — never silently prefers one feed's timestamp. Each
 * card keeps its own per-section FreshnessBadge (momentum: computed_as_of;
 * radar: composite generated_at) — unchanged per-family behavior.
 *
 * Labels: plain Vietnamese — non-technical user. Divergence enum tokens
 * (GREEN/AMBER/RED/UNKNOWN) render as-is; the human-facing badge underneath
 * stays Vietnamese.
 * DDD layer: interface — loader calls app/lib/api via safeFetch; no direct DB.
 */

import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { safeFetch } from "~/lib/api/fetchUtils";
import { PageHeader } from "~/components/PageHeader";
import { FreshnessBadge } from "~/components/FreshnessBadge";
import { GaugeCard } from "~/components/GaugeCard";
import type { GaugeCardProps } from "~/components/GaugeCard";
import { InfoCardExpand } from "~/components/InfoCardExpand";
import { useFreshnessRevalidator } from "~/lib/hooks/useFreshnessRevalidator";
import { formatZScore } from "~/routes/dashboard.indicator-gauges";

export const meta: MetaFunction = () => [
  { title: "Động Lực & Dòng Tiền — VN Market Intelligence" },
];

// ===========================================================================
// SECTION A — Momentum P1 domain (unchanged from TASK-502-MOMENTUM-FRONTEND)
// ===========================================================================

// ---------------------------------------------------------------------------
// Domain types — matched to GET /api/momentum-indicators DTO (TASK-501)
// ---------------------------------------------------------------------------

export interface RocSection {
  /** Z-score of momentum factor (null when accruing). */
  momentum_factor_z: number | null;
  /** ISO date of last computation. */
  computed_as_of: string | null;
  /** Human-readable reason when momentum_factor_z is null. */
  null_reason: string | null;
  source_tier?: number;
}

export interface RelativeStrengthSection {
  /** Composite RS scalar — positive = market strong, negative = weak. */
  market_rs_composite: number | null;
  /** True when < threshold tickers — results may be less reliable. */
  low_sample_warning: boolean;
  /** ISO date of last computation. */
  computed_as_of: string | null;
  /** Human-readable reason when market_rs_composite is null. */
  null_reason: string | null;
  source_tier?: number;
}

export interface Proximity52wSection {
  /** Net count: new 52-week highs minus new lows. */
  net_new_highs: number | null;
  /** Fraction of tickers trading above their 50-day MA (0–1). */
  pct_above_ma50: number | null;
  /** Fraction of tickers trading above their 200-day MA (0–1). */
  pct_above_ma200: number | null;
  /** ISO date of last computation. */
  computed_as_of: string | null;
  /** Human-readable reason when net_new_highs is null. */
  null_reason: string | null;
  source_tier?: number;
}

export interface ForeignAccumSection {
  /** Z-score of ADTV-normalized foreign accumulation. */
  foreign_accum_z_market: number | null;
  /** ISO date of last computation. */
  computed_as_of: string | null;
  /** Human-readable reason when foreign_accum_z_market is null. */
  null_reason: string | null;
  source_tier?: number;
}

export interface MomentumIndicatorsDto {
  generated_at: string;
  source_tier?: number;
  error?: string;
  roc: RocSection | null;
  relative_strength: RelativeStrengthSection | null;
  proximity_52w: Proximity52wSection | null;
  foreign_accum: ForeignAccumSection | null;
}

interface MomentumLoaderData {
  generated_at: string;
  roc: RocSection | null;
  relative_strength: RelativeStrengthSection | null;
  proximity_52w: Proximity52wSection | null;
  foreign_accum: ForeignAccumSection | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Parser — exported for unit tests (AC-5)
// ---------------------------------------------------------------------------

/**
 * Parse raw JSON response from /api/momentum-indicators.
 * Returns a safe MomentumIndicatorsDto in ALL cases — never throws.
 * null raw → all sections null (honest-NULL state).
 * Invalid shape → all sections null (graceful fallback).
 */
export function parseMomentumIndicatorsDto(
  raw: unknown,
): MomentumIndicatorsDto {
  const fallback: MomentumIndicatorsDto = {
    generated_at: new Date().toISOString(),
    roc: null,
    relative_strength: null,
    proximity_52w: null,
    foreign_accum: null,
  };

  if (raw === null || raw === undefined) return fallback;
  if (typeof raw !== "object" || Array.isArray(raw)) return fallback;

  const obj = raw as Record<string, unknown>;
  if (!("generated_at" in obj)) return fallback;

  return {
    generated_at:
      typeof obj["generated_at"] === "string"
        ? obj["generated_at"]
        : fallback.generated_at,
    error: typeof obj["error"] === "string" ? obj["error"] : undefined,
    source_tier:
      typeof obj["source_tier"] === "number" ? obj["source_tier"] : undefined,
    roc:
      obj["roc"] !== null &&
      typeof obj["roc"] === "object" &&
      !Array.isArray(obj["roc"])
        ? (obj["roc"] as RocSection)
        : null,
    relative_strength:
      obj["relative_strength"] !== null &&
      typeof obj["relative_strength"] === "object" &&
      !Array.isArray(obj["relative_strength"])
        ? (obj["relative_strength"] as RelativeStrengthSection)
        : null,
    proximity_52w:
      obj["proximity_52w"] !== null &&
      typeof obj["proximity_52w"] === "object" &&
      !Array.isArray(obj["proximity_52w"])
        ? (obj["proximity_52w"] as Proximity52wSection)
        : null,
    foreign_accum:
      obj["foreign_accum"] !== null &&
      typeof obj["foreign_accum"] === "object" &&
      !Array.isArray(obj["foreign_accum"])
        ? (obj["foreign_accum"] as ForeignAccumSection)
        : null,
  };
}

// ---------------------------------------------------------------------------
// formatRSComposite — AC-M2 (exported for unit tests)
// ---------------------------------------------------------------------------

/**
 * Format Relative Strength composite value for display.
 * Returns label + color for badge rendering.
 * Exported for unit tests.
 */
export function formatRSComposite(value: number | null): {
  label: string;
  color: "green" | "amber" | "gray";
} {
  if (value === null || value === undefined)
    return { label: "Chưa có dữ liệu", color: "gray" };
  if (value > 0) return { label: "MẠNH", color: "green" };
  if (value < 0) return { label: "YẾU", color: "amber" };
  return { label: "TRUNG TÍNH", color: "amber" };
}

// ---------------------------------------------------------------------------
// fetchMomentumIndicators — exported for unit tests (AC-5)
// ---------------------------------------------------------------------------

/**
 * Core fetch-and-parse logic for momentum indicators.
 * Returns all-null sections on any upstream error (honest-NULL).
 * Exported for unit testing.
 */
export async function fetchMomentumIndicators(
  origin: string,
): Promise<MomentumLoaderData> {
  const generated_at = new Date().toISOString();

  const { data, error } = await safeFetch<MomentumIndicatorsDto>(
    `${origin}/api/momentum-indicators`,
    parseMomentumIndicatorsDto,
    { label: "dashboard.momentum" },
  );

  if (error !== null) {
    return {
      generated_at,
      roc: null,
      relative_strength: null,
      proximity_52w: null,
      foreign_accum: null,
      error,
    };
  }

  return {
    generated_at: data.generated_at || generated_at,
    roc: data.roc,
    relative_strength: data.relative_strength,
    proximity_52w: data.proximity_52w,
    foreign_accum: data.foreign_accum,
    error: null,
  };
}

// ===========================================================================
// SECTION B — Money Radar P0 domain (ported verbatim from dashboard.money-radar.tsx
// per FR-2.1 of docs/handoffs/BA-MERGE-MONEY-RADAR-INTO-MOMENTUM.md — a fully
// distinct type/function family from Section A above; DO NOT merge/homogenize)
// ===========================================================================

// ---------------------------------------------------------------------------
// Domain types — matched to GET /api/money-radar DTO
// (get_money_radar_composite response schema, brief §4)
// ---------------------------------------------------------------------------

export type DivergenceFlag = "GREEN" | "AMBER" | "RED" | "UNKNOWN";

export interface DivergenceSection {
  flag: DivergenceFlag;
  severity: number;
  detectors: string[];
  null_reason?: string;
}

export interface MoneyRadarComponents {
  foreign_net_direction: number | null;
  foreign_accum_z_market: number | null;
  foreign_outflow_z_5d: number | null;
  obv_slope: number | null;
  rel_vol_z_20: number | null;
  up_down_vol_ratio: number | null;
  degraded_vwap_proxy_z: number | null;
  carry_regime: number | null;
  credit_flow_direction: number | null;
  volatility_regime: number | null;
}

const EMPTY_COMPONENTS: MoneyRadarComponents = {
  foreign_net_direction: null,
  foreign_accum_z_market: null,
  foreign_outflow_z_5d: null,
  obv_slope: null,
  rel_vol_z_20: null,
  up_down_vol_ratio: null,
  degraded_vwap_proxy_z: null,
  carry_regime: null,
  credit_flow_direction: null,
  volatility_regime: null,
};

export interface MoneyRadarCompositeDto {
  score: number | null;
  delta_5d: number | null;
  divergence: DivergenceSection;
  coverage_pct: number;
  source_tier: number | null;
  is_estimate: boolean;
  null_reason: string | null;
  components: MoneyRadarComponents;
  generated_at: string;
  error?: string;
}

interface RadarLoaderData {
  generated_at: string;
  score: number | null;
  delta_5d: number | null;
  divergence: DivergenceSection;
  coverage_pct: number;
  source_tier: number | null;
  is_estimate: boolean;
  null_reason: string | null;
  components: MoneyRadarComponents;
  error: string | null;
}

const FALLBACK_DIVERGENCE: DivergenceSection = {
  flag: "UNKNOWN",
  severity: 0,
  detectors: [],
};

// ---------------------------------------------------------------------------
// Parser — exported for unit tests
// ---------------------------------------------------------------------------

/**
 * Parse raw JSON response from /api/money-radar.
 * Returns a safe MoneyRadarCompositeDto in ALL cases — never throws.
 * null raw → all-null honest state (divergence.flag = UNKNOWN).
 * Invalid shape → all-null honest state (graceful fallback).
 */
export function parseMoneyRadarCompositeDto(
  raw: unknown,
): MoneyRadarCompositeDto {
  const fallback: MoneyRadarCompositeDto = {
    score: null,
    delta_5d: null,
    divergence: FALLBACK_DIVERGENCE,
    coverage_pct: 0,
    source_tier: null,
    is_estimate: false,
    null_reason: null,
    components: EMPTY_COMPONENTS,
    generated_at: new Date().toISOString(),
  };

  if (raw === null || raw === undefined) return fallback;
  if (typeof raw !== "object" || Array.isArray(raw)) return fallback;

  const obj = raw as Record<string, unknown>;
  if (!("generated_at" in obj)) return fallback;

  const rawDivergence = obj["divergence"];
  const divergence: DivergenceSection =
    rawDivergence !== null &&
    typeof rawDivergence === "object" &&
    !Array.isArray(rawDivergence)
      ? parseDivergence(rawDivergence as Record<string, unknown>)
      : FALLBACK_DIVERGENCE;

  const rawComponents = obj["components"];
  const components: MoneyRadarComponents =
    rawComponents !== null &&
    typeof rawComponents === "object" &&
    !Array.isArray(rawComponents)
      ? { ...EMPTY_COMPONENTS, ...(rawComponents as Record<string, unknown>) }
      : EMPTY_COMPONENTS;

  return {
    generated_at:
      typeof obj["generated_at"] === "string"
        ? obj["generated_at"]
        : fallback.generated_at,
    error: typeof obj["error"] === "string" ? obj["error"] : undefined,
    score: typeof obj["score"] === "number" ? obj["score"] : null,
    delta_5d: typeof obj["delta_5d"] === "number" ? obj["delta_5d"] : null,
    divergence,
    coverage_pct:
      typeof obj["coverage_pct"] === "number" ? obj["coverage_pct"] : 0,
    source_tier:
      typeof obj["source_tier"] === "number" ? obj["source_tier"] : null,
    is_estimate:
      typeof obj["is_estimate"] === "boolean" ? obj["is_estimate"] : false,
    null_reason:
      typeof obj["null_reason"] === "string" ? obj["null_reason"] : null,
    components,
  };
}

function parseDivergence(obj: Record<string, unknown>): DivergenceSection {
  const flag = obj["flag"];
  const validFlag: DivergenceFlag =
    flag === "GREEN" || flag === "AMBER" || flag === "RED" || flag === "UNKNOWN"
      ? flag
      : "UNKNOWN";
  return {
    flag: validFlag,
    severity: typeof obj["severity"] === "number" ? obj["severity"] : 0,
    detectors: Array.isArray(obj["detectors"])
      ? (obj["detectors"] as unknown[]).filter(
          (d): d is string => typeof d === "string",
        )
      : [],
    null_reason:
      typeof obj["null_reason"] === "string" ? obj["null_reason"] : undefined,
  };
}

// ---------------------------------------------------------------------------
// Formatters — exported for unit tests
// ---------------------------------------------------------------------------

/** Format a raw scalar to 2 decimal places, or "—" when null (brief §8). */
export function formatScalar2(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return value.toFixed(2);
}

/** Card 1 — Dòng Tiền badge: MẠNH / YẾU / TRUNG TÍNH (brief §8). */
export function formatCompositeScoreBadge(
  score: number | null,
): { label: string; color: "green" | "amber" | "gray" } {
  if (score === null || score === undefined)
    return { label: "Chưa có dữ liệu", color: "gray" };
  if (score > 0) return { label: "MẠNH", color: "green" };
  if (score < 0) return { label: "YẾU", color: "amber" };
  return { label: "TRUNG TÍNH", color: "amber" };
}

/** Card 2 — Dòng Vốn Ngoại badge: GOM HÀNG / XÃ HÀNG (brief §8). */
export function formatForeignAccumBadge(
  z: number | null,
): { label: string; color: "green" | "red" | "gray" } {
  if (z === null || z === undefined)
    return { label: "Chưa có dữ liệu", color: "gray" };
  if (z < 0) return { label: "GOM HÀNG", color: "green" };
  return { label: "XÃ HÀNG", color: "red" };
}

/** Card 3 — Khối Lượng Nội Địa badge: CAO / THẤP (brief §8). */
export function formatRelVolBadge(
  z: number | null,
): { label: string; color: "green" | "amber" | "gray" } {
  if (z === null || z === undefined)
    return { label: "Chưa có dữ liệu", color: "gray" };
  if (z >= 0) return { label: "CAO", color: "green" };
  return { label: "THẤP", color: "amber" };
}

/**
 * Card 4 — Tín Hiệu Phân Kỳ badge: PHÂN KỲ / KHÔNG RÕ (brief §8).
 * HN-4: flag=UNKNOWN is the divergence-specific honest-null state — treated
 * as the null path (gray "Chưa có dữ liệu"), never GREEN.
 */
export function formatDivergenceBadge(
  flag: DivergenceFlag,
): { label: string; color: "amber" | "red" | "green" | "gray" } {
  if (flag === "UNKNOWN") return { label: "Chưa có dữ liệu", color: "gray" };
  if (flag === "RED") return { label: "PHÂN KỲ", color: "red" };
  if (flag === "AMBER") return { label: "PHÂN KỲ", color: "amber" };
  return { label: "KHÔNG RÕ", color: "green" };
}

/** Card 4 scalar — divergence.flag itself; "—" for the UNKNOWN null-equivalent state. */
export function formatDivergenceScalar(flag: DivergenceFlag): string {
  return flag === "UNKNOWN" ? "—" : flag;
}

// ---------------------------------------------------------------------------
// fetchMoneyRadarComposite — exported for unit tests
// ---------------------------------------------------------------------------

/**
 * Core fetch-and-parse logic for the Money Radar composite.
 * Returns all-null honest state on any upstream error (honest-NULL).
 * Exported for unit testing.
 */
export async function fetchMoneyRadarComposite(
  origin: string,
): Promise<RadarLoaderData> {
  const generated_at = new Date().toISOString();

  const { data, error } = await safeFetch<MoneyRadarCompositeDto>(
    `${origin}/api/money-radar`,
    parseMoneyRadarCompositeDto,
    { label: "dashboard.momentum(radar)" },
  );

  if (error !== null) {
    return {
      generated_at,
      score: null,
      delta_5d: null,
      divergence: FALLBACK_DIVERGENCE,
      coverage_pct: 0,
      source_tier: null,
      is_estimate: false,
      null_reason: null,
      components: EMPTY_COMPONENTS,
      error,
    };
  }

  return {
    generated_at: data.generated_at || generated_at,
    score: data.score,
    delta_5d: data.delta_5d,
    divergence: data.divergence,
    coverage_pct: data.coverage_pct,
    source_tier: data.source_tier,
    is_estimate: data.is_estimate,
    null_reason: data.null_reason,
    components: data.components,
    error: null,
  };
}

// ===========================================================================
// Merged loader — FR-2.2 (Promise.allSettled, per-feed isolation)
// ===========================================================================

/** Pick the OLDER (less fresh) of two ISO timestamps — page-level badge (FR-3). */
function olderGeneratedAt(a: string, b: string): string {
  const aTime = new Date(a).getTime();
  const bTime = new Date(b).getTime();
  if (Number.isNaN(aTime)) return b;
  if (Number.isNaN(bTime)) return a;
  return aTime <= bTime ? a : b;
}

export async function loader({ request: _request }: LoaderFunctionArgs) {
  const origin =
    typeof process !== "undefined" && process.env["FRONTEND_ORIGIN"]
      ? process.env["FRONTEND_ORIGIN"]
      : "http://localhost:3001";

  const [momentumResult, radarResult] = await Promise.allSettled([
    fetchMomentumIndicators(origin),
    fetchMoneyRadarComposite(origin),
  ]);

  const momentum: MomentumLoaderData =
    momentumResult.status === "fulfilled"
      ? momentumResult.value
      : {
          generated_at: new Date().toISOString(),
          roc: null,
          relative_strength: null,
          proximity_52w: null,
          foreign_accum: null,
          error:
            momentumResult.reason instanceof Error
              ? momentumResult.reason.message
              : "unknown error",
        };

  const radar: RadarLoaderData =
    radarResult.status === "fulfilled"
      ? radarResult.value
      : {
          generated_at: new Date().toISOString(),
          score: null,
          delta_5d: null,
          divergence: FALLBACK_DIVERGENCE,
          coverage_pct: 0,
          source_tier: null,
          is_estimate: false,
          null_reason: null,
          components: EMPTY_COMPONENTS,
          error:
            radarResult.reason instanceof Error
              ? radarResult.reason.message
              : "unknown error",
        };

  return json({ momentum, radar });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MomentumPage() {
  const { momentum, radar } = useLoaderData<typeof loader>();

  const {
    generated_at: momentumGeneratedAt,
    roc,
    relative_strength: rs,
    proximity_52w,
    foreign_accum: fa,
    error: momentumError,
  } = momentum;

  const {
    generated_at: radarGeneratedAt,
    score,
    delta_5d,
    divergence,
    coverage_pct,
    source_tier,
    is_estimate,
    null_reason,
    components,
    error: radarError,
  } = radar;

  useFreshnessRevalidator("daily");

  const pageGeneratedAt = olderGeneratedAt(momentumGeneratedAt, radarGeneratedAt);

  // ── ROC card ──────────────────────────────────────────────────────────────
  const rocScalar = formatZScore(roc?.momentum_factor_z ?? null);
  const rocBadge: GaugeCardProps["badge"] = (() => {
    const z = roc?.momentum_factor_z ?? null;
    if (z === null) return { label: "Chưa có dữ liệu", color: "gray" };
    if (z > 1.5) return { label: "TÍCH CỰC", color: "green" };
    if (z > 0.5) return { label: "TRUNG LẬP TÍCH CỰC", color: "amber" };
    if (z < -0.5) return { label: "TIÊU CỰC", color: "red" };
    return { label: "TRUNG LẬP", color: "amber" };
  })();

  // ── RS card ───────────────────────────────────────────────────────────────
  const rsFormatted = formatRSComposite(rs?.market_rs_composite ?? null);
  const rsScalar =
    rs?.market_rs_composite != null
      ? rs.market_rs_composite.toFixed(3)
      : "—";
  const rsDetails: GaugeCardProps["details"] =
    rs?.low_sample_warning === true
      ? [
          {
            label: "Cảnh báo",
            value: "Mẫu ít tickers — kết quả có thể thiếu chính xác",
          },
        ]
      : undefined;

  // ── 52W card ──────────────────────────────────────────────────────────────
  const w52Scalar =
    proximity_52w?.net_new_highs != null
      ? proximity_52w.net_new_highs.toString()
      : "—";
  const w52Badge: GaugeCardProps["badge"] = (() => {
    const n = proximity_52w?.net_new_highs ?? null;
    if (n === null) return { label: "Chưa có dữ liệu", color: "gray" };
    if (n > 0) return { label: "Bứt phá", color: "green" };
    if (n < 0) return { label: "Tích lũy", color: "amber" };
    return { label: "Trung lập", color: "gray" };
  })();
  const w52Details: GaugeCardProps["details"] = [];
  if (proximity_52w?.pct_above_ma50 != null) {
    w52Details.push({
      label: "Trên MA50",
      value: `${(proximity_52w.pct_above_ma50 * 100).toFixed(1)}%`,
    });
  }
  if (proximity_52w?.pct_above_ma200 != null) {
    w52Details.push({
      label: "Trên MA200",
      value: `${(proximity_52w.pct_above_ma200 * 100).toFixed(1)}%`,
    });
  }

  // ── FA card ───────────────────────────────────────────────────────────────
  const faScalar = formatZScore(fa?.foreign_accum_z_market ?? null);
  const faBadge: GaugeCardProps["badge"] = (() => {
    const z = fa?.foreign_accum_z_market ?? null;
    if (z === null) return { label: "Chưa có dữ liệu", color: "gray" };
    if (z < -1) return { label: "TÍCH LŨY MẠNH", color: "green" };
    if (z < 0) return { label: "TÍCH LŨY NHẸ", color: "amber" };
    return { label: "PHÂN PHỐI", color: "red" };
  })();

  // ── Radar Card 1 — Money Radar composite score ───────────────────────────
  const scoreScalar = formatScalar2(score);
  const scoreBadge: GaugeCardProps["badge"] = formatCompositeScoreBadge(score);
  const scoreDetails: GaugeCardProps["details"] = [];
  if (delta_5d !== null) {
    scoreDetails.push({ label: "Thay đổi 5 phiên", value: formatScalar2(delta_5d) });
  }
  scoreDetails.push({
    label: "Độ phủ dữ liệu",
    value: `${(coverage_pct * 100).toFixed(0)}%`,
  });
  if (is_estimate) {
    scoreDetails.push({ label: "Cảnh báo", value: "Có thành phần ước tính (chưa xác thực đầy đủ)" });
  }

  // ── Radar Card 2 — Khối Ngoại ─────────────────────────────────────────────
  const foreignScalar = formatScalar2(components.foreign_accum_z_market);
  const foreignBadge: GaugeCardProps["badge"] = formatForeignAccumBadge(
    components.foreign_accum_z_market,
  );

  // ── Radar Card 3 — Khối Lượng Nội ────────────────────────────────────────
  const relVolScalar = formatScalar2(components.rel_vol_z_20);
  const relVolBadge: GaugeCardProps["badge"] = formatRelVolBadge(
    components.rel_vol_z_20,
  );

  // ── Radar Card 4 — Phân Kỳ ────────────────────────────────────────────────
  const divergenceScalar = formatDivergenceScalar(divergence.flag);
  const divergenceBadge: GaugeCardProps["badge"] = formatDivergenceBadge(
    divergence.flag,
  );
  const divergenceDetails: GaugeCardProps["details"] =
    divergence.flag !== "UNKNOWN" && divergence.detectors.length > 0
      ? [
          { label: "Mức độ", value: String(divergence.severity) },
          { label: "Bộ dò tín hiệu", value: divergence.detectors.join(", ") },
        ]
      : undefined;

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Động Lực & Dòng Tiền"
        subtitle="Chỉ số động lực thị trường và radar dòng tiền hợp nhất"
        actions={
          <FreshnessBadge dataAsof={pageGeneratedAt ?? null} slaTierKey="daily" />
        }
      />

      {/* Error banners — each scoped to its own feed, never merged (§6 edge cases) */}
      {momentumError && (
        <div
          role="alert"
          className="rounded border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-300"
        >
          Không thể tải dữ liệu động lực: {momentumError}
        </div>
      )}
      {radarError && (
        <div
          role="alert"
          className="rounded border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-300"
        >
          Không thể tải dữ liệu radar dòng tiền: {radarError}
        </div>
      )}

      {/* Section A — Động Lực Thị Trường (4 momentum cards) */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
          Động Lực Thị Trường
        </h2>
        <section
          aria-label="Chỉ báo động lực thị trường"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          {/* Card 1 — ROC momentum */}
          <GaugeCard
            title="Đà Tăng Giá"
            subtitle="Z-score động lượng thị trường"
            scalar={rocScalar}
            badge={rocBadge}
            dataAsof={roc?.computed_as_of ?? null}
            nullReason={
              roc === null
                ? "Chưa có dữ liệu — dịch vụ ROC chưa sẵn sàng."
                : (roc.null_reason ?? null)
            }
            expandContent={
              <InfoCardExpand
                summary={
                  <span className="text-xs text-slate-400">
                    get_roc_momentum · apps/technical-analysis
                  </span>
                }
                findingData={{
                  computed_as_of: roc?.computed_as_of ?? null,
                  null_reason: roc?.null_reason ?? null,
                }}
                source={null}
              />
            }
          />

          {/* Card 2 — Relative Strength */}
          <GaugeCard
            title="Sức Mạnh Tương Đối"
            subtitle="Composite RS thị trường"
            scalar={rsScalar}
            badge={{ label: rsFormatted.label, color: rsFormatted.color as GaugeCardProps["badge"]["color"] }}
            details={rsDetails}
            dataAsof={rs?.computed_as_of ?? null}
            nullReason={
              rs === null
                ? "Chưa có dữ liệu — dịch vụ RS chưa sẵn sàng."
                : (rs.null_reason ?? null)
            }
            expandContent={
              <InfoCardExpand
                summary={
                  <span className="text-xs text-slate-400">
                    get_relative_strength · apps/technical-analysis
                  </span>
                }
                findingData={{
                  computed_as_of: rs?.computed_as_of ?? null,
                  null_reason: rs?.null_reason ?? null,
                  low_sample_warning: rs?.low_sample_warning ?? null,
                }}
                source={null}
              />
            }
          />

          {/* Card 3 — 52-week proximity */}
          <GaugeCard
            title="Phân Bổ 52 Tuần"
            subtitle="Số cổ phiếu tạo đỉnh ròng"
            scalar={w52Scalar}
            badge={w52Badge}
            details={w52Details.length > 0 ? w52Details : undefined}
            dataAsof={proximity_52w?.computed_as_of ?? null}
            nullReason={
              proximity_52w === null
                ? "Chưa có dữ liệu — dịch vụ 52 tuần chưa sẵn sàng."
                : (proximity_52w.null_reason ?? null)
            }
            expandContent={
              <InfoCardExpand
                summary={
                  <span className="text-xs text-slate-400">
                    get_52w_proximity · apps/technical-analysis
                  </span>
                }
                findingData={{
                  computed_as_of: proximity_52w?.computed_as_of ?? null,
                  null_reason: proximity_52w?.null_reason ?? null,
                }}
                source={null}
              />
            }
          />

          {/* Card 4 — Foreign accumulation */}
          <GaugeCard
            title="Tích Lũy Khối Ngoại"
            subtitle="Z-score ADTV-normalized"
            scalar={faScalar}
            badge={faBadge}
            dataAsof={fa?.computed_as_of ?? null}
            nullReason={
              fa === null
                ? "Chưa có dữ liệu — dịch vụ tích lũy khối ngoại chưa sẵn sàng."
                : (fa.null_reason ?? null)
            }
            expandContent={
              <InfoCardExpand
                summary={
                  <span className="text-xs text-slate-400">
                    get_foreign_accum_rank · apps/technical-analysis
                  </span>
                }
                findingData={{
                  computed_as_of: fa?.computed_as_of ?? null,
                  null_reason: fa?.null_reason ?? null,
                }}
                source={null}
              />
            }
          />
        </section>
      </div>

      {/* Section B — Radar Dòng Tiền (4 money-radar cards, ported verbatim) */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
          Radar Dòng Tiền
        </h2>
        <section
          aria-label="Chỉ báo radar dòng tiền"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          {/* Card 1 — Money Radar composite score */}
          <GaugeCard
            title="Dòng Tiền"
            subtitle="Điểm tổng hợp dòng vốn thị trường"
            scalar={scoreScalar}
            badge={scoreBadge}
            details={scoreDetails.length > 0 ? scoreDetails : undefined}
            dataAsof={radarGeneratedAt ?? null}
            nullReason={
              score === null
                ? (null_reason ?? "Chưa có dữ liệu — điểm tổng hợp dòng tiền chưa đủ độ phủ.")
                : null
            }
            expandContent={
              <InfoCardExpand
                summary={
                  <span className="text-xs text-slate-400">
                    get_money_radar_composite · apps/mcp-server
                  </span>
                }
                findingData={{
                  delta_5d,
                  coverage_pct,
                  source_tier,
                  is_estimate,
                  null_reason,
                }}
                source={null}
              />
            }
          />

          {/* Card 2 — Foreign accumulation z-score */}
          <GaugeCard
            title="Dòng Vốn Ngoại"
            subtitle="Z-score tích lũy khối ngoại"
            scalar={foreignScalar}
            badge={foreignBadge}
            dataAsof={radarGeneratedAt ?? null}
            nullReason={
              components.foreign_accum_z_market === null
                ? "Chưa có dữ liệu — thành phần dòng vốn ngoại chưa sẵn sàng."
                : null
            }
            expandContent={
              <InfoCardExpand
                summary={
                  <span className="text-xs text-slate-400">
                    get_foreign_accum_rank (qua get_money_radar_composite)
                  </span>
                }
                findingData={{
                  foreign_accum_z_market: components.foreign_accum_z_market,
                  foreign_net_direction: components.foreign_net_direction,
                  foreign_outflow_z_5d: components.foreign_outflow_z_5d,
                }}
                source={null}
              />
            }
          />

          {/* Card 3 — Domestic relative-volume z-score */}
          <GaugeCard
            title="Khối Lượng Nội Địa"
            subtitle="Z-score khối lượng tương đối (20 phiên)"
            scalar={relVolScalar}
            badge={relVolBadge}
            dataAsof={radarGeneratedAt ?? null}
            nullReason={
              components.rel_vol_z_20 === null
                ? "Chưa có dữ liệu — thành phần khối lượng nội địa chưa sẵn sàng."
                : null
            }
            expandContent={
              <InfoCardExpand
                summary={
                  <span className="text-xs text-slate-400">
                    get_money_flow_oscillators (qua get_money_radar_composite)
                  </span>
                }
                findingData={{
                  rel_vol_z_20: components.rel_vol_z_20,
                  obv_slope: components.obv_slope,
                  up_down_vol_ratio: components.up_down_vol_ratio,
                  degraded_vwap_proxy_z: components.degraded_vwap_proxy_z,
                }}
                source={null}
              />
            }
          />

          {/* Card 4 — Divergence engine flag */}
          <GaugeCard
            title="Tín Hiệu Phân Kỳ"
            subtitle="Động cơ phân kỳ D1-D4"
            scalar={divergenceScalar}
            badge={divergenceBadge}
            details={divergenceDetails}
            dataAsof={radarGeneratedAt ?? null}
            nullReason={
              divergence.flag === "UNKNOWN"
                ? (divergence.null_reason ??
                    "Chưa có dữ liệu — trục giá hoặc dòng tiền chưa đủ để so khớp phân kỳ.")
                : null
            }
            expandContent={
              <InfoCardExpand
                summary={
                  <span className="text-xs text-slate-400">
                    D1-D4 divergence engine · get_money_radar_composite
                  </span>
                }
                findingData={{
                  flag: divergence.flag,
                  severity: divergence.severity,
                  detectors: divergence.detectors,
                  null_reason: divergence.null_reason ?? null,
                }}
                source={null}
              />
            }
          />
        </section>
      </div>

      {/* Footnotes — both preserved distinctly (FR-1, dev-frontend's call) */}
      <p className="text-xs text-slate-600 leading-relaxed">
        Động Lực Thị Trường: dữ liệu được tổng hợp từ 4 công cụ P1:
        get_roc_momentum · get_relative_strength · get_52w_proximity ·
        get_foreign_accum_rank. Giá trị null = dữ liệu đang tích lũy, không
        được làm giả.
      </p>
      <p className="text-xs text-slate-600 leading-relaxed">
        Radar Dòng Tiền: dữ liệu được tổng hợp từ get_money_radar_composite:
        dòng ngoại, khối lượng nội địa, chế độ carry/tín dụng/biến động, và
        động cơ phân kỳ D1-D4. Giá trị null = dữ liệu chưa đủ độ phủ, không
        được làm giả.
      </p>
    </div>
  );
}
