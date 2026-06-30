/**
 * /dashboard/momentum — Động Lực Thị Trường P1.
 *
 * Sprint: BA-IND-P1-MOMENTUM-FRONTEND
 * Task:   TASK-502-MOMENTUM-FRONTEND AC-2, AC-M2, AC-M4
 *
 * Data source: GET /api/momentum-indicators (frontend proxy → mcp-server :3000).
 * The proxy route is api.momentum-indicators.tsx.
 *
 * Surfaces 4 P1 momentum scalars:
 *   1. momentum_factor_z     — ROC (get_roc_momentum)
 *   2. market_rs_composite   — RS  (get_relative_strength)
 *   3. net_new_highs         — 52W proximity (get_52w_proximity)
 *   4. foreign_accum_z_market — Foreign accumulation (get_foreign_accum_rank)
 *
 * Honest-NULL contract (HARD):
 *   - All 4 sections may be null when data is still accruing or blocked.
 *   - Individual scalar fields may also be null.
 *   - NEVER fabricate or default-fill a null value.
 *   - Each null section renders "Chưa có dữ liệu" + gray FreshnessBadge.
 *
 * Freshness:
 *   - SLA tier: "daily" for all 4 momentum gauges.
 *   - FreshnessBadge uses each section's computed_as_of field.
 *
 * Labels: plain Vietnamese — non-technical user.
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
  { title: "Động Lực Thị Trường — VN Market Intelligence" },
];

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

// ---------------------------------------------------------------------------
// Loader data type
// ---------------------------------------------------------------------------

interface LoaderData {
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
): Promise<LoaderData> {
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

export async function loader({ request: _request }: LoaderFunctionArgs) {
  const origin =
    typeof process !== "undefined" && process.env["FRONTEND_ORIGIN"]
      ? process.env["FRONTEND_ORIGIN"]
      : "http://localhost:3001";

  const data = await fetchMomentumIndicators(origin);
  return json<LoaderData>(data);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MomentumPage() {
  const {
    generated_at,
    roc,
    relative_strength: rs,
    proximity_52w,
    foreign_accum: fa,
    error,
  } = useLoaderData<typeof loader>();

  useFreshnessRevalidator("daily");

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

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Động Lực Thị Trường P1"
        subtitle="Bốn chỉ số động lực tổng hợp: đà tăng giá, sức mạnh tương đối, phân bổ 52 tuần và tích lũy khối ngoại"
        actions={
          <FreshnessBadge dataAsof={generated_at ?? null} slaTierKey="daily" />
        }
      />

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="rounded border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-300"
        >
          Không thể tải dữ liệu động lực: {error}
        </div>
      )}

      {/* Gauge grid — 4 cards in 2-col / 4-col layouts */}
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

      {/* Footnote */}
      <p className="text-xs text-slate-600 leading-relaxed">
        Dữ liệu được tổng hợp từ 4 công cụ P1: get_roc_momentum ·
        get_relative_strength · get_52w_proximity · get_foreign_accum_rank.
        Giá trị null = dữ liệu đang tích lũy, không được làm giả.
      </p>
    </div>
  );
}
