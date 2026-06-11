/**
 * /dashboard/prediction-claims — Dự báo AI & Kết quả.
 *
 * Data source: GET /api/prediction-claims (frontend server-side proxy → mcp-server :3000).
 * The proxy route is api.prediction-claims.tsx, mirroring the api.foreign-flow.tsx precedent.
 *
 * Endpoint contract (GET /api/prediction-claims?limit=N&outcome=X) — VERIFIED live (commit 69aec59c):
 *   {
 *     generatedAt: string,
 *     calibration: {
 *       total: number, resolved: number, correct: number, wrong: number,
 *       pending: number, hitRate: number|null, avgBrier: number|null
 *     },
 *     claims: [
 *       { id: string, stock: string, agentId: string, claimText: string,
 *         direction: "bullish"|"bearish"|"neutral",
 *         targetPrice: number|null, creationPrice: number|null,
 *         confidence: number, resolutionDate: string,
 *         outcome: "correct"|"wrong"|"pending",
 *         actualPrice: number|null, brierScore: number|null,
 *         createdAt: string, resolvedAt: string|null }
 *     ],
 *     count: number
 *   }
 *
 * CRITICAL null-tolerance:
 *   - hitRate: null when resolved=0 — render "Chưa có", NEVER "0%"
 *   - avgBrier: null when no brier data — render "—", NEVER "0"
 *   - targetPrice / creationPrice / actualPrice / brierScore: nullable → "—"
 *
 * Named exports: fetchPredictionClaimsData, formatHitRate, formatBrier,
 * formatPrice, formatConfidence, directionLabel, directionColorClass,
 * outcomeLabel, outcomeColorClass — pure helpers for unit tests.
 *
 * Decision journal (DJ-GATE-1): This is a new read-only dashboard page.
 * No state mutations, no DB access from frontend — pure HTTP read over proxy.
 */
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { NavLink, useLoaderData } from "@remix-run/react";
import { PageHeader } from "~/components/PageHeader";

export const meta: MetaFunction = () => [
  { title: "Dự báo AI & Kết quả — VN Market Intelligence" },
];

// ---------------------------------------------------------------------------
// Domain types — matched to GET /api/prediction-claims DTO contract
// ---------------------------------------------------------------------------

export type PredictionDirection = "bullish" | "bearish" | "neutral";
export type PredictionOutcome = "correct" | "wrong" | "pending";

export interface PredictionCalibration {
  total: number;
  resolved: number;
  correct: number;
  wrong: number;
  pending: number;
  hitRate: number | null;
  avgBrier: number | null;
}

export interface PredictionClaim {
  id: string;
  stock: string;
  agentId: string;
  claimText: string;
  direction: PredictionDirection;
  targetPrice: number | null;
  creationPrice: number | null;
  confidence: number;
  resolutionDate: string;
  outcome: PredictionOutcome;
  actualPrice: number | null;
  brierScore: number | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface PredictionClaimsDto {
  generatedAt: string;
  calibration: PredictionCalibration;
  claims: PredictionClaim[];
  count: number;
}

// ---------------------------------------------------------------------------
// LoaderData
// ---------------------------------------------------------------------------

export interface LoaderData {
  generatedAt: string;
  calibration: PredictionCalibration;
  claims: PredictionClaim[];
  count: number;
  outcomeFilter: string | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// fetchPredictionClaimsData — exported named helper for unit tests
// (Remix strips loader in jsdom; named helper bypasses that — same pattern
//  as fetchForeignFlowData in dashboard.foreign-flow.tsx)
// ---------------------------------------------------------------------------

const EMPTY_CALIBRATION: PredictionCalibration = {
  total: 0,
  resolved: 0,
  correct: 0,
  wrong: 0,
  pending: 0,
  hitRate: null,
  avgBrier: null,
};

export async function fetchPredictionClaimsData(
  origin: string,
  params?: { limit?: number; outcome?: string }
): Promise<LoaderData> {
  let generatedAt = new Date().toISOString();
  let calibration: PredictionCalibration = { ...EMPTY_CALIBRATION };
  let claims: PredictionClaim[] = [];
  let count = 0;
  let error: string | null = null;

  try {
    const qs = new URLSearchParams();
    if (params?.limit !== undefined) {
      qs.set("limit", String(params.limit));
    }
    if (params?.outcome !== undefined) {
      qs.set("outcome", params.outcome);
    }
    const qsStr = qs.toString();
    const url = `${origin}/api/prediction-claims${qsStr ? `?${qsStr}` : ""}`;

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      error = `Upstream returned ${response.status} ${response.statusText}`;
    } else {
      const raw = (await response.json()) as unknown;
      if (raw !== null && typeof raw === "object" && "claims" in raw) {
        const dto = raw as PredictionClaimsDto;
        generatedAt =
          typeof dto.generatedAt === "string" ? dto.generatedAt : generatedAt;
        claims = Array.isArray(dto.claims) ? dto.claims : [];
        count = typeof dto.count === "number" ? dto.count : claims.length;
        calibration =
          dto.calibration !== null &&
          typeof dto.calibration === "object" &&
          "total" in dto.calibration
            ? {
                total:
                  typeof dto.calibration.total === "number"
                    ? dto.calibration.total
                    : 0,
                resolved:
                  typeof dto.calibration.resolved === "number"
                    ? dto.calibration.resolved
                    : 0,
                correct:
                  typeof dto.calibration.correct === "number"
                    ? dto.calibration.correct
                    : 0,
                wrong:
                  typeof dto.calibration.wrong === "number"
                    ? dto.calibration.wrong
                    : 0,
                pending:
                  typeof dto.calibration.pending === "number"
                    ? dto.calibration.pending
                    : 0,
                // Preserve null — NEVER coerce to 0 (divide-by-zero display guard)
                hitRate:
                  dto.calibration.hitRate !== null &&
                  dto.calibration.hitRate !== undefined &&
                  typeof dto.calibration.hitRate === "number"
                    ? dto.calibration.hitRate
                    : null,
                avgBrier:
                  dto.calibration.avgBrier !== null &&
                  dto.calibration.avgBrier !== undefined &&
                  typeof dto.calibration.avgBrier === "number"
                    ? dto.calibration.avgBrier
                    : null,
              }
            : { ...EMPTY_CALIBRATION };
      } else {
        error = "Unexpected response shape from /api/prediction-claims";
      }
    }
  } catch (err) {
    error =
      err instanceof Error
        ? err.message
        : "Không thể kết nối tới máy chủ dữ liệu dự báo AI";
  }

  return {
    generatedAt,
    calibration,
    claims,
    count,
    outcomeFilter: params?.outcome ?? null,
    error,
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const origin =
    typeof process !== "undefined" && process.env["FRONTEND_ORIGIN"]
      ? process.env["FRONTEND_ORIGIN"]
      : "http://localhost:3001";

  const url = new URL(request.url);
  const outcome = url.searchParams.get("outcome") ?? undefined;

  const data = await fetchPredictionClaimsData(origin, { outcome });

  return json<LoaderData>(data);
}

// ---------------------------------------------------------------------------
// Helpers — formatting (exported for unit tests)
// ---------------------------------------------------------------------------

/**
 * Format hitRate as a percentage string.
 * null → "Chưa có" (NEVER "0%") — divide-by-zero display guard.
 */
export function formatHitRate(hitRate: number | null): string {
  if (hitRate === null || hitRate === undefined) return "Chưa có";
  return `${Math.round(hitRate * 100)}%`;
}

/**
 * Format avgBrier score to 4 decimal places.
 * null → "—" (NEVER "0").
 */
export function formatBrier(brier: number | null): string {
  if (brier === null || brier === undefined) return "—";
  return brier.toFixed(4);
}

/**
 * Format a nullable price value with thousands separator (VND).
 * null → "—".
 */
export function formatPrice(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("vi-VN");
}

/**
 * Format confidence as a percentage string (0–1 range).
 * e.g. 0.75 → "75%"
 */
export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

/**
 * Map direction to Vietnamese label.
 */
export function directionLabel(d: PredictionDirection): string {
  switch (d) {
    case "bullish":
      return "Tăng";
    case "bearish":
      return "Giảm";
    case "neutral":
    default:
      return "Trung lập";
  }
}

/**
 * Map direction to Tailwind color classes.
 * Returns an object with badge and text classes.
 */
export function directionColorClass(d: PredictionDirection): {
  badge: string;
  text: string;
} {
  switch (d) {
    case "bullish":
      return {
        badge: "bg-emerald-900 text-emerald-300 border border-emerald-700",
        text: "text-emerald-400",
      };
    case "bearish":
      return {
        badge: "bg-red-900 text-red-300 border border-red-700",
        text: "text-red-400",
      };
    case "neutral":
    default:
      return {
        badge: "bg-slate-700 text-slate-300 border border-slate-600",
        text: "text-slate-400",
      };
  }
}

/**
 * Map outcome to Vietnamese label.
 */
export function outcomeLabel(o: PredictionOutcome): string {
  switch (o) {
    case "correct":
      return "Đúng";
    case "wrong":
      return "Sai";
    case "pending":
    default:
      return "Đang chờ";
  }
}

/**
 * Map outcome to Tailwind color classes.
 * pending → slate/grey, NEVER red (pending ≠ wrong).
 */
export function outcomeColorClass(o: PredictionOutcome): {
  badge: string;
  text: string;
} {
  switch (o) {
    case "correct":
      return {
        badge: "bg-emerald-900 text-emerald-300 border border-emerald-700",
        text: "text-emerald-400",
      };
    case "wrong":
      return {
        badge: "bg-red-900 text-red-300 border border-red-700",
        text: "text-red-400",
      };
    case "pending":
    default:
      return {
        badge: "bg-slate-700 text-slate-300 border border-slate-600",
        text: "text-slate-400",
      };
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Direction badge — bullish/bearish/neutral with VN label. */
function DirectionBadge({ direction }: { direction: PredictionDirection }) {
  const { badge } = directionColorClass(direction);
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badge}`}
    >
      {directionLabel(direction)}
    </span>
  );
}

/** Outcome badge — correct/wrong/pending; pending is grey, not red. */
function OutcomeBadge({ outcome }: { outcome: PredictionOutcome }) {
  const { badge } = outcomeColorClass(outcome);
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${badge}`}
    >
      {outcomeLabel(outcome)}
    </span>
  );
}

/** Calibration banner — chips summarising overall model accuracy. */
function CalibrationBanner({
  calibration,
}: {
  calibration: PredictionCalibration;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/60 px-5 py-4">
      {/* Tổng dự báo */}
      <div className="flex flex-col items-center rounded-md border border-slate-600 bg-slate-900 px-4 py-2 min-w-[80px]">
        <span className="text-lg font-bold text-slate-100">
          {calibration.total}
        </span>
        <span className="mt-0.5 text-[11px] text-slate-500">Tổng dự báo</span>
      </div>

      {/* Đã có kết quả */}
      <div className="flex flex-col items-center rounded-md border border-slate-600 bg-slate-900 px-4 py-2 min-w-[80px]">
        <span className="text-lg font-bold text-slate-100">
          {calibration.resolved}
        </span>
        <span className="mt-0.5 text-[11px] text-slate-500">
          Đã có kết quả
        </span>
      </div>

      {/* Tỷ lệ đúng — null→"Chưa có", NEVER "0%" */}
      <div className="flex flex-col items-center rounded-md border border-slate-600 bg-slate-900 px-4 py-2 min-w-[80px]">
        <span
          className={`text-lg font-bold ${
            calibration.hitRate !== null ? "text-emerald-400" : "text-slate-500"
          }`}
        >
          {formatHitRate(calibration.hitRate)}
        </span>
        <span className="mt-0.5 text-[11px] text-slate-500">Tỷ lệ đúng</span>
      </div>

      {/* Điểm Brier TB — null→"—" with hint */}
      <div className="flex flex-col items-center rounded-md border border-slate-600 bg-slate-900 px-4 py-2 min-w-[100px]">
        <span className="text-lg font-bold text-slate-100">
          {formatBrier(calibration.avgBrier)}
        </span>
        <span className="mt-0.5 text-[11px] text-slate-500">
          Điểm Brier TB
        </span>
        <span className="text-[10px] text-slate-600 italic">
          càng thấp càng chính xác
        </span>
      </div>

      {/* Đang chờ */}
      <div className="flex flex-col items-center rounded-md border border-slate-600 bg-slate-900 px-4 py-2 min-w-[80px]">
        <span className="text-lg font-bold text-slate-400">
          {calibration.pending}
        </span>
        <span className="mt-0.5 text-[11px] text-slate-500">Đang chờ</span>
      </div>
    </div>
  );
}

/** Outcome filter bar — SSR links that append ?outcome= to trigger re-load. */
function OutcomeFilter({
  activeOutcome,
}: {
  activeOutcome: string | null;
}) {
  const filters: { label: string; value: string | null }[] = [
    { label: "Tất cả", value: null },
    { label: "Đúng", value: "correct" },
    { label: "Sai", value: "wrong" },
    { label: "Đang chờ", value: "pending" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.map(({ label, value }) => {
        const isActive = activeOutcome === value;
        const to =
          value !== null
            ? `/dashboard/prediction-claims?outcome=${value}`
            : "/dashboard/prediction-claims";
        return (
          <NavLink
            key={value ?? "all"}
            to={to}
            reloadDocument
            className={[
              "rounded px-3 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-slate-700 text-slate-100"
                : "text-slate-400 hover:bg-slate-700 hover:text-slate-200",
            ].join(" ")}
          >
            {label}
          </NavLink>
        );
      })}
    </div>
  );
}

/** Price row helper — renders label + value with null-safe "—". */
function PriceRow({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs font-medium text-slate-300 tabular-nums">
        {formatPrice(value)}
      </span>
    </div>
  );
}

/** Single prediction claim card. */
function ClaimCard({ claim }: { claim: PredictionClaim }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 p-4 space-y-3">
      {/* Header row: stock + outcome badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-base font-bold text-slate-100">
            {claim.stock}
          </span>
          <span className="text-xs text-slate-500">{claim.agentId}</span>
        </div>
        <OutcomeBadge outcome={claim.outcome} />
      </div>

      {/* Claim text (Vietnamese) */}
      <p className="text-sm text-slate-300 leading-relaxed">{claim.claimText}</p>

      {/* Direction + confidence row */}
      <div className="flex flex-wrap items-center gap-2">
        <DirectionBadge direction={claim.direction} />
        <span className="text-xs text-slate-500">
          Độ tự tin:{" "}
          <span className="font-medium text-slate-300">
            {formatConfidence(claim.confidence)}
          </span>
        </span>
        <span className="text-xs text-slate-500">
          Ngày chốt:{" "}
          <span className="font-medium text-slate-300">
            {claim.resolutionDate}
          </span>
        </span>
      </div>

      {/* Price grid */}
      <div className="space-y-1.5 rounded border border-slate-700 bg-slate-900 px-3 py-2">
        <PriceRow label="Giá lúc dự báo" value={claim.creationPrice} />
        <PriceRow label="Giá kỳ vọng" value={claim.targetPrice} />
        <PriceRow label="Giá thực tế" value={claim.actualPrice} />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500">Điểm Brier</span>
          <span className="text-xs font-medium text-slate-300 tabular-nums">
            {formatBrier(claim.brierScore)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PredictionClaimsPage() {
  const { calibration, claims, count, generatedAt, outcomeFilter, error } =
    useLoaderData<typeof loader>();

  const isEmpty = !error && claims.length === 0;

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Dự báo AI & Kết quả"
        subtitle="Theo dõi các dự báo thị trường của AI — xem dự báo nào đúng, nào sai, và độ chính xác tổng thể"
        actions={
          <span className="text-xs text-slate-500">
            {count > 0 && (
              <span className="mr-3 font-medium text-slate-300">
                {count} dự báo
              </span>
            )}
            {generatedAt && (
              <span>
                {new Date(generatedAt).toLocaleTimeString("vi-VN")}
              </span>
            )}
          </span>
        }
      />

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="rounded border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-300"
        >
          Không thể tải dữ liệu dự báo AI — {error}
        </div>
      )}

      {/* Calibration banner — always visible even on error (shows zeros) */}
      {!error && (
        <CalibrationBanner calibration={calibration} />
      )}

      {/* Outcome filter */}
      <OutcomeFilter activeOutcome={outcomeFilter} />

      {/* Empty state */}
      {isEmpty && (
        <div className="rounded-lg border border-slate-700 bg-slate-800 px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-400">
            Không có dữ liệu dự báo
          </p>
          <p className="mt-1 text-xs text-slate-600">
            {outcomeFilter
              ? "Thử chọn bộ lọc khác để xem thêm."
              : "Hệ thống chưa ghi nhận dự báo nào. Vui lòng thử lại sau."}
          </p>
        </div>
      )}

      {/* Claim cards grid */}
      {claims.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {claims.map((claim) => (
            <ClaimCard key={claim.id} claim={claim} />
          ))}
        </div>
      )}
    </div>
  );
}
