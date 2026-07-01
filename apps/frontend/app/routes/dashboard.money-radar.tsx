/**
 * /dashboard/money-radar — Radar Dòng Tiền (Money Radar P0).
 *
 * Sprint: MONEY-RADAR-P0
 * Task:   MONEY-RADAR-P0-T3-DASHBOARD
 *
 * Data source: GET /api/money-radar (frontend proxy → mcp-server :3000).
 * The proxy route is api.money-radar.tsx.
 * Upstream tool: get_money_radar_composite (MONEY-RADAR-P0-T2-COMPOSITE, DONE_VERIFIED).
 *
 * Structure mirrors dashboard.momentum.tsx exactly (docs/architecture-briefs/
 * 2026-07-01-money-radar.md §8, §11.3 route spec): PageHeader + FreshnessBadge
 * in actions, grid-cols-1/sm:grid-cols-2/xl:grid-cols-4, 4 GaugeCards,
 * InfoCardExpand per card (standing: detail+source per card), footnote.
 *
 * Surfaces 4 Money Radar P0 scalars (brief §8 exact mapping):
 *   1. score                      — Composite money-flow score [-1,+1]
 *   2. components.foreign_accum_z_market — Foreign accumulation z-score
 *   3. components.rel_vol_z_20    — Domestic relative-volume z-score(20)
 *   4. divergence.flag            — Divergence engine (D1-D4) signal
 *
 * Honest-NULL contract (HN-6, HARD):
 *   - score / component scalars may be null when coverage_pct < 0.5 or the
 *     component's own gate excludes it (HN-1, HN-2).
 *   - divergence.flag === "UNKNOWN" is the divergence-specific honest-null
 *     state (HN-4): a null axis on any detector → UNKNOWN, never GREEN.
 *   - NEVER fabricate or zero-fill a null value.
 *   - Each null card renders "—" + gray FreshnessBadge + "Chưa có dữ liệu" +
 *     the composite's null_reason.
 *
 * §10 risk note: radar cards render non-null (depth-independent inputs)
 * while momentum cards sit honest-NULL (OHLCV-depth-gated) — this contrast
 * is INTENTIONAL. Do not homogenize; do not touch dashboard.momentum.tsx.
 *
 * Freshness:
 *   - SLA tier: "daily" (maxStalenessMin=1560, 26h) for all 4 radar gauges.
 *   - FreshnessBadge uses the composite's generated_at field.
 *
 * Labels: plain Vietnamese — non-technical user. Divergence flag values
 * (GREEN/AMBER/RED/UNKNOWN) are technical enum tokens, not natural-language
 * copy — rendered as-is per brief §8 scalar-source column ("divergence.flag");
 * the human-facing badge underneath stays Vietnamese.
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

export const meta: MetaFunction = () => [
  { title: "Radar Dòng Tiền — VN Market Intelligence" },
];

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

// ---------------------------------------------------------------------------
// Loader data type
// ---------------------------------------------------------------------------

interface LoaderData {
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
): Promise<LoaderData> {
  const generated_at = new Date().toISOString();

  const { data, error } = await safeFetch<MoneyRadarCompositeDto>(
    `${origin}/api/money-radar`,
    parseMoneyRadarCompositeDto,
    { label: "dashboard.money-radar" },
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

export async function loader({ request: _request }: LoaderFunctionArgs) {
  const origin =
    typeof process !== "undefined" && process.env["FRONTEND_ORIGIN"]
      ? process.env["FRONTEND_ORIGIN"]
      : "http://localhost:3001";

  const data = await fetchMoneyRadarComposite(origin);
  return json<LoaderData>(data);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MoneyRadarPage() {
  const {
    generated_at,
    score,
    delta_5d,
    divergence,
    coverage_pct,
    source_tier,
    is_estimate,
    null_reason,
    components,
    error,
  } = useLoaderData<typeof loader>();

  useFreshnessRevalidator("daily");

  // ── Card 1 — Money Radar Composite ("Dòng Tiền") ─────────────────────────
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

  // ── Card 2 — Khối Ngoại ("Dòng Vốn Ngoại") ───────────────────────────────
  const foreignScalar = formatScalar2(components.foreign_accum_z_market);
  const foreignBadge: GaugeCardProps["badge"] = formatForeignAccumBadge(
    components.foreign_accum_z_market,
  );

  // ── Card 3 — Khối Lượng Nội ("Khối Lượng Nội Địa") ───────────────────────
  const relVolScalar = formatScalar2(components.rel_vol_z_20);
  const relVolBadge: GaugeCardProps["badge"] = formatRelVolBadge(
    components.rel_vol_z_20,
  );

  // ── Card 4 — Phân Kỳ ("Tín Hiệu Phân Kỳ") ────────────────────────────────
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
        title="Radar Dòng Tiền"
        subtitle="Tổng hợp dòng vốn thị trường"
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
          Không thể tải dữ liệu radar dòng tiền: {error}
        </div>
      )}

      {/* Gauge grid — 4 cards in 2-col / 4-col layouts */}
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
          dataAsof={generated_at ?? null}
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
          dataAsof={generated_at ?? null}
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
          dataAsof={generated_at ?? null}
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
          dataAsof={generated_at ?? null}
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

      {/* Footnote */}
      <p className="text-xs text-slate-600 leading-relaxed">
        Dữ liệu được tổng hợp từ get_money_radar_composite: dòng ngoại, khối
        lượng nội địa, chế độ carry/tín dụng/biến động, và động cơ phân kỳ
        D1-D4. Giá trị null = dữ liệu chưa đủ độ phủ, không được làm giả.
      </p>
    </div>
  );
}
