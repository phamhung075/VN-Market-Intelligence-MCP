/**
 * /dashboard/indicator-gauges — Chỉ Báo Thị Trường P0.
 *
 * Sprint: MARKET-INDICATOR-DEPTH-P0
 * Task:   IND-P1-FRONTEND-GAUGE-CARDS
 *
 * Data source: GET /api/indicator-gauges (frontend proxy → mcp-server :3000).
 * The proxy route is api.indicator-gauges.tsx.
 *
 * Surfaces 6 live gauge scalars from 5 P0 tools:
 *   1. rv_20d_percentile   — Volatility (get_volatility_indicators)
 *   2. news_sentiment_z    — Sentiment  (get_market_sentiment_index)
 *   3. breadth_z_score     — Breadth    (get_breadth_thrust)
 *   4. foreign_outflow_z   — Khối ngoại (get_foreign_room)
 *   5. omo_net_outstanding  — Thanh khoản (get_vn_liquidity_state)
 *   6. policy_refi_rate    — Lãi suất tái cấp vốn (get_vn_liquidity_state)
 *
 * Honest-NULL contract (HARD):
 *   - All 5 gauge sections may be null when data is still accruing or blocked.
 *   - Individual scalar fields within a section may also be null.
 *   - NEVER fabricate or default-fill a null value.
 *   - Each null section renders "Chưa có dữ liệu" + gray FreshnessBadge.
 *
 * Freshness:
 *   - SLA tier: "daily" for all 5 gauges (computed once per trading day).
 *   - FreshnessBadge uses the section's own asof/fetched_at field.
 *   - Global generated_at shown in PageHeader.
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
import { useFreshnessRevalidator } from "~/lib/hooks/useFreshnessRevalidator";
import { GaugeCard } from "~/components/GaugeCard";
import type { GaugeCardProps } from "~/components/GaugeCard";

export const meta: MetaFunction = () => [
  { title: "Chỉ Báo Thị Trường — VN Market Intelligence" },
];

// ---------------------------------------------------------------------------
// Domain types — matched to GET /api/indicator-gauges DTO
// ---------------------------------------------------------------------------

export interface VolatilityGauge {
  /** Gauge-ready scalar P1: percentile rank of rv_20d in available history (0–1). */
  rv_20d_percentile: number | null;
  /** Annualized realized volatility 20-day window (%). */
  rv_20d_pct: number | null;
  /** Regime label: "LOW" | "NORMAL" | "ELEVATED" | "CRISIS". */
  vol_regime: string | null;
  /** Percentile rank used for regime classification (0–1). */
  vol_regime_pct: number | null;
  /** Date of last computation (YYYY-MM-DD). */
  asof: string | null;
  /** Human-readable reason when rv_20d_percentile is null. */
  null_reason: string | null;
  source_tier?: number;
}

export interface SentimentGauge {
  /** Gauge-ready scalar P1: z-score vs 60d baseline (null when INSUFFICIENT). */
  news_sentiment_z: number | null;
  /** History adequacy: "EMPTY" | "INSUFFICIENT" | "SUFFICIENT". */
  history_quality: "EMPTY" | "INSUFFICIENT" | "SUFFICIENT";
  /** 5-day EMA of daily sentiment score. */
  sentiment_ema_5d: number | null;
  /** Proportion of bullish articles in last 5 days (0–1). */
  bull_ratio_5d: number | null;
  /** Proportion of bearish articles in last 5 days (0–1). */
  bear_ratio_5d: number | null;
  /** Date this sentiment was computed for (YYYY-MM-DD). */
  asof: string;
  /** Reason when news_sentiment_z is null. */
  null_reason: string | null;
  source_tier?: number;
}

export interface BreadthZScore {
  /** Z-score value, null when <21 sessions or osc not warmed up. */
  value: number | null;
  unit: string;
  asof: string | null;
  confidence: number | null;
  null_reason: string | null;
}

export interface BreadthGauge {
  /** Gauge-ready scalar P1 (6-field wrapper). */
  breadth_z_score: BreadthZScore;
  /** McClellan Oscillator value, null when <39 sessions. */
  mclellan_osc: number | null;
  /** History quality: "INSUFFICIENT" | "WARMUP" | "SUFFICIENT". */
  history_quality: "INSUFFICIENT" | "WARMUP" | "SUFFICIENT";
  /** Most recent session date. */
  asof: string | null;
  source_tier?: number;
}

export interface ForeignRoomGauge {
  /** Cap-weighted market saturation percentage (0–100). */
  market_saturation_pct: number | null;
  /** Gauge-ready scalar P1: z-score of market-wide 5d velocity (null when <20 sessions). */
  foreign_outflow_z_5d: number | null;
  as_of_date: string | null;
  null_reason: string | null;
  source_tier?: number;
}

export interface LiquidityGauge {
  /** SBV OMO net outstanding (positive = net add, negative = net absorb). Null when blocked. */
  omo_net_outstanding_bn_vnd: number | null;
  /** SBV refi rate (%). */
  policy_refi_rate_pct: number | null;
  /** ISO timestamp when liquidity data was fetched. */
  fetched_at: string | null;
  null_reason: string | null;
  source_tier?: number;
}

export interface IndicatorGaugesDto {
  generated_at: string;
  error?: string;
  volatility: VolatilityGauge | null;
  sentiment: SentimentGauge | null;
  breadth: BreadthGauge | null;
  foreign_room: ForeignRoomGauge | null;
  liquidity: LiquidityGauge | null;
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

interface LoaderData {
  generated_at: string;
  volatility: VolatilityGauge | null;
  sentiment: SentimentGauge | null;
  breadth: BreadthGauge | null;
  foreign_room: ForeignRoomGauge | null;
  liquidity: LiquidityGauge | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Pure helpers — exported for unit testing
// ---------------------------------------------------------------------------

/**
 * Parse raw JSON response from /api/indicator-gauges.
 * Returns a safe IndicatorGaugesDto in ALL cases — never throws.
 * null raw → all gauge sections null (honest-NULL state).
 * Invalid shape → all gauge sections null (graceful fallback).
 */
export function parseIndicatorGaugesDto(raw: unknown): IndicatorGaugesDto {
  const fallback: IndicatorGaugesDto = {
    generated_at: new Date().toISOString(),
    volatility: null,
    sentiment: null,
    breadth: null,
    foreign_room: null,
    liquidity: null,
  };

  if (raw === null || raw === undefined) return fallback;
  if (typeof raw !== "object" || Array.isArray(raw)) return fallback;

  // Check for the expected DTO shape — must have generated_at
  const obj = raw as Record<string, unknown>;
  if (!("generated_at" in obj)) return fallback;

  return {
    generated_at:
      typeof obj["generated_at"] === "string"
        ? obj["generated_at"]
        : fallback.generated_at,
    error: typeof obj["error"] === "string" ? obj["error"] : undefined,
    volatility:
      obj["volatility"] !== null &&
      typeof obj["volatility"] === "object" &&
      !Array.isArray(obj["volatility"])
        ? (obj["volatility"] as VolatilityGauge)
        : null,
    sentiment:
      obj["sentiment"] !== null &&
      typeof obj["sentiment"] === "object" &&
      !Array.isArray(obj["sentiment"])
        ? (obj["sentiment"] as SentimentGauge)
        : null,
    breadth:
      obj["breadth"] !== null &&
      typeof obj["breadth"] === "object" &&
      !Array.isArray(obj["breadth"])
        ? (obj["breadth"] as BreadthGauge)
        : null,
    foreign_room:
      obj["foreign_room"] !== null &&
      typeof obj["foreign_room"] === "object" &&
      !Array.isArray(obj["foreign_room"])
        ? (obj["foreign_room"] as ForeignRoomGauge)
        : null,
    liquidity:
      obj["liquidity"] !== null &&
      typeof obj["liquidity"] === "object" &&
      !Array.isArray(obj["liquidity"])
        ? (obj["liquidity"] as LiquidityGauge)
        : null,
  };
}

/**
 * Volatility regime → Vietnamese label + color tier.
 * Exported for unit tests.
 */
export function formatVolatilityRegime(regime: string | null): {
  label: string;
  color: "green" | "amber" | "red" | "gray";
} {
  switch (regime) {
    case "LOW":
      return { label: "Biến Động Thấp", color: "green" };
    case "NORMAL":
      return { label: "Bình Thường", color: "amber" };
    case "ELEVATED":
      return { label: "Biến Động Cao", color: "red" };
    case "CRISIS":
      return { label: "Khủng Hoảng", color: "red" };
    default:
      return { label: "Chưa xác định", color: "gray" };
  }
}

/**
 * History quality → Vietnamese label + color tier.
 * SUFFICIENT = green, WARMUP/INSUFFICIENT = amber, EMPTY/null = gray.
 * Exported for unit tests.
 */
export function formatHistoryQuality(quality: string | null): {
  label: string;
  color: "green" | "amber" | "gray";
} {
  switch (quality) {
    case "SUFFICIENT":
      return { label: "Đủ dữ liệu", color: "green" };
    case "WARMUP":
      return { label: "Đang tích lũy", color: "amber" };
    case "INSUFFICIENT":
      return { label: "Chưa đủ dữ liệu", color: "amber" };
    case "EMPTY":
    default:
      return { label: "Chưa có dữ liệu", color: "gray" };
  }
}

/**
 * Format z-score for display: "+1.45 σ", "−0.83 σ", "0.00 σ", "—".
 * Exported for unit tests.
 */
export function formatZScore(z: number | null): string {
  if (z === null || z === undefined) return "—";
  const abs = Math.abs(z);
  const formatted = abs.toFixed(2);
  if (z > 0) return `+${formatted} σ`;
  if (z < 0) return `−${formatted} σ`;
  return `${formatted} σ`;
}

/**
 * Format OMO net outstanding (billion VND).
 * Exported for unit tests.
 */
export function formatOmoBn(value: number | null): string {
  if (value === null || value === undefined) return "—";
  const abs = Math.abs(value);
  // Display in nghìn tỷ (thousand billion) when ≥1000
  if (abs >= 1_000) {
    const nghintri = (value / 1_000).toFixed(1);
    return `${nghintri} nghìn tỷ`;
  }
  return `${value.toLocaleString("vi-VN")} tỷ`;
}

/**
 * Core fetch-and-parse logic — exported for unit testing.
 * Returns all-null gauge sections on any upstream error.
 */
export async function fetchIndicatorGauges(
  origin: string,
): Promise<LoaderData> {
  const generated_at = new Date().toISOString();

  const { data, error } = await safeFetch<IndicatorGaugesDto>(
    `${origin}/api/indicator-gauges`,
    parseIndicatorGaugesDto,
    { label: "dashboard.indicator-gauges" },
  );

  if (error !== null) {
    return {
      generated_at,
      volatility: null,
      sentiment: null,
      breadth: null,
      foreign_room: null,
      liquidity: null,
      error,
    };
  }

  return {
    generated_at: data.generated_at || generated_at,
    volatility: data.volatility,
    sentiment: data.sentiment,
    breadth: data.breadth,
    foreign_room: data.foreign_room,
    liquidity: data.liquidity,
    error: null,
  };
}

export async function loader({ request: _request }: LoaderFunctionArgs) {
  const origin =
    typeof process !== "undefined" && process.env["FRONTEND_ORIGIN"]
      ? process.env["FRONTEND_ORIGIN"]
      : "http://localhost:3001";

  const data = await fetchIndicatorGauges(origin);
  return json<LoaderData>(data);
}

// ---------------------------------------------------------------------------
// UI helpers — color mappings for badges
// (REGIME_COLOR_CLASSES and GaugeCard now live in ~/components/GaugeCard.tsx)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function IndicatorGaugesPage() {
  const { generated_at, volatility, sentiment, breadth, foreign_room, liquidity, error } =
    useLoaderData<typeof loader>();

  useFreshnessRevalidator("daily");

  // ── Volatility card ───────────────────────────────────────────────────────
  const volRegime = formatVolatilityRegime(volatility?.vol_regime ?? null);
  const volScalar =
    volatility?.rv_20d_percentile != null
      ? `${(volatility.rv_20d_percentile * 100).toFixed(0)}%`
      : "—";
  const volDetails =
    volatility?.rv_20d_pct != null
      ? [
          {
            label: "Biến động 20 ngày",
            value: `${volatility.rv_20d_pct.toFixed(1)}%`,
          },
        ]
      : undefined;

  // ── Sentiment card ────────────────────────────────────────────────────────
  const sentQuality = formatHistoryQuality(sentiment?.history_quality ?? null);
  const sentScalar = formatZScore(sentiment?.news_sentiment_z ?? null);
  const sentDetails: GaugeCardProps["details"] = [];
  if (sentiment?.sentiment_ema_5d != null) {
    sentDetails.push({
      label: "EMA tâm lý 5 ngày",
      value: sentiment.sentiment_ema_5d.toFixed(3),
    });
  }
  if (sentiment?.bull_ratio_5d != null) {
    sentDetails.push({
      label: "Tỷ lệ tích cực (5ng)",
      value: `${(sentiment.bull_ratio_5d * 100).toFixed(0)}%`,
    });
  }

  // ── Breadth card ──────────────────────────────────────────────────────────
  const breadthQuality = formatHistoryQuality(breadth?.history_quality ?? null);
  const breadthScalar = formatZScore(breadth?.breadth_z_score?.value ?? null);
  const breadthDetails: GaugeCardProps["details"] = [];
  if (breadth?.mclellan_osc != null) {
    breadthDetails.push({
      label: "Dao động McClellan",
      value: breadth.mclellan_osc.toFixed(1),
    });
  }

  // ── Foreign room card ─────────────────────────────────────────────────────
  const frScalar = formatZScore(foreign_room?.foreign_outflow_z_5d ?? null);
  const frSatPct =
    foreign_room?.market_saturation_pct != null
      ? `${foreign_room.market_saturation_pct.toFixed(1)}%`
      : "—";
  const frBadge: GaugeCardProps["badge"] = (() => {
    const z = foreign_room?.foreign_outflow_z_5d ?? null;
    if (z === null) return { label: "Chưa có dữ liệu", color: "gray" };
    if (z > 1.5) return { label: "Bán ròng mạnh", color: "red" };
    if (z > 0.5) return { label: "Bán ròng nhẹ", color: "amber" };
    if (z < -0.5) return { label: "Mua ròng", color: "green" };
    return { label: "Trung lập", color: "amber" };
  })();
  const frDetails: GaugeCardProps["details"] = [
    { label: "Tỷ lệ bão hòa phòng", value: frSatPct },
  ];

  // ── Liquidity cards (2 scalars) ───────────────────────────────────────────
  const omoScalar = formatOmoBn(liquidity?.omo_net_outstanding_bn_vnd ?? null);
  const omoBadge: GaugeCardProps["badge"] = (() => {
    const v = liquidity?.omo_net_outstanding_bn_vnd ?? null;
    if (v === null) return { label: "Chưa có dữ liệu", color: "gray" };
    if (v > 0) return { label: "Bơm tiền ròng", color: "green" };
    if (v < 0) return { label: "Hút tiền ròng", color: "amber" };
    return { label: "Trung hòa", color: "gray" };
  })();
  const refiRate =
    liquidity?.policy_refi_rate_pct != null
      ? `${liquidity.policy_refi_rate_pct.toFixed(2)}%`
      : "—";

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Chỉ Báo Thị Trường P0"
        subtitle="Sáu chỉ số kỹ thuật tổng hợp giúp đánh giá trạng thái thị trường: biến động, tâm lý, độ rộng, khối ngoại và thanh khoản"
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
          Không thể tải dữ liệu chỉ báo: {error}
        </div>
      )}

      {/* Gauge grid — 5 cards in 2-3 columns */}
      <section aria-label="Chỉ báo thị trường" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">

        {/* Card 1 — Volatility */}
        <GaugeCard
          title="Biến Động Thị Trường"
          subtitle="Phần vị biến động 20 ngày (rv_20d_percentile)"
          scalar={volScalar}
          badge={volRegime}
          details={volDetails}
          dataAsof={volatility?.asof ?? null}
          nullReason={
            volatility === null
              ? "Chưa có dữ liệu — dịch vụ phân tích kỹ thuật chưa sẵn sàng."
              : (volatility.null_reason ?? null)
          }
        />

        {/* Card 2 — Sentiment */}
        <GaugeCard
          title="Tâm Lý Tin Tức"
          subtitle="Chỉ số Z-score tâm lý thị trường (news_sentiment_z)"
          scalar={sentScalar}
          badge={sentQuality}
          details={sentDetails.length > 0 ? sentDetails : undefined}
          dataAsof={sentiment?.asof ?? null}
          nullReason={
            sentiment === null
              ? "Chưa có dữ liệu — cần ít nhất 21 ngày phân tích tin tức."
              : (sentiment.null_reason ?? null)
          }
        />

        {/* Card 3 — Breadth */}
        <GaugeCard
          title="Độ Rộng Thị Trường"
          subtitle="Z-score dao động McClellan (breadth_z_score)"
          scalar={breadthScalar}
          badge={breadthQuality}
          details={breadthDetails.length > 0 ? breadthDetails : undefined}
          dataAsof={breadth?.asof ?? null}
          nullReason={
            breadth === null
              ? "Chưa có dữ liệu — bảng breadth đang tích lũy từ ngày giao dịch tiếp theo."
              : (breadth.breadth_z_score?.null_reason ?? null)
          }
        />

        {/* Card 4 — Foreign room */}
        <GaugeCard
          title="Dòng Vốn Khối Ngoại"
          subtitle="Z-score tốc độ bán ròng 5 ngày (foreign_outflow_z_5d)"
          scalar={frScalar}
          badge={frBadge}
          details={frDetails}
          dataAsof={foreign_room?.as_of_date ?? null}
          nullReason={
            foreign_room === null
              ? "Chưa có dữ liệu — cần ít nhất 20 phiên giao dịch."
              : (foreign_room.null_reason ?? null)
          }
        />

        {/* Card 5 — OMO Liquidity */}
        <GaugeCard
          title="OMO Tịnh Thanh Khoản"
          subtitle="Dư nợ OMO ròng — SBV bơm / hút tiền (tỷ VND)"
          scalar={omoScalar}
          badge={omoBadge}
          details={
            liquidity?.policy_refi_rate_pct != null
              ? [{ label: "Lãi suất tái cấp vốn", value: refiRate }]
              : undefined
          }
          dataAsof={liquidity?.fetched_at ?? null}
          nullReason={
            liquidity === null
              ? "Chưa có dữ liệu — dịch vụ macro chưa sẵn sàng."
              : (liquidity.null_reason ?? null)
          }
        />

        {/* Card 6 — Refi rate (second liquidity scalar) */}
        <GaugeCard
          title="Lãi Suất Tái Cấp Vốn"
          subtitle="Lãi suất chính sách SBV — refi_rate (% / năm)"
          scalar={refiRate}
          badge={(() => {
            const r = liquidity?.policy_refi_rate_pct ?? null;
            if (r === null) return { label: "Chưa có dữ liệu", color: "gray" as const };
            if (r <= 4.0) return { label: "Nới lỏng", color: "green" as const };
            if (r <= 5.0) return { label: "Trung lập", color: "amber" as const };
            return { label: "Thắt chặt", color: "red" as const };
          })()}
          dataAsof={liquidity?.fetched_at ?? null}
          nullReason={
            liquidity === null
              ? "Chưa có dữ liệu — dịch vụ macro chưa sẵn sàng."
              : null
          }
        />
      </section>

      {/* Footnote */}
      <p className="text-xs text-slate-600 leading-relaxed">
        Dữ liệu được tổng hợp từ 5 công cụ P0: get_volatility_indicators ·
        get_market_sentiment_index · get_breadth_thrust · get_foreign_room ·
        get_vn_liquidity_state. Giá trị null = dữ liệu đang tích lũy, không
        được làm giả.
      </p>
    </div>
  );
}
