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
 *       pending: number, excluded: number, hitRate: number|null, avgBrier: number|null
 *     },
 *     claims: [
 *       { id: string, stock: string, agentId: string, claimText: string,
 *         direction: "bullish"|"bearish"|"neutral",
 *         targetPrice: number|null, creationPrice: number|null,
 *         confidence: number, resolutionDate: string,
 *         outcome: "correct"|"wrong"|"pending"|"excluded",
 *         actualPrice: number|null, brierScore: number|null,
 *         createdAt: string, resolvedAt: string|null,
 *         exclusionReason?: string|null }  // OPTIONAL, may be absent on every row — see below
 *     ],
 *     count: number
 *   }
 *
 * CRITICAL null-tolerance:
 *   - hitRate: null when resolved=0 — render "Chưa có", NEVER "0%"
 *   - avgBrier: null when no brier data — render "—", NEVER "0"
 *   - targetPrice / creationPrice / actualPrice / brierScore: nullable → "—"
 *
 * FIX-PREDCLAIM-DASHBOARD-HITRATE-HONESTY (2026-07-25): the calibration
 * banner no longer renders a bare hitRate — see
 * docs/architecture/microservice/frontend/api-reference.md
 * § "Prediction Claims Trust-Surface Context" for the full design. No
 * hitRate recomputation happens client-side — the server figure is echoed
 * verbatim; the page only adds denominator/staleness/breakdown/exclusion
 * context around it. `claims[].exclusionReason` is an OPTIONAL field
 * (producer: FIX-PREDCLAIM-BACKFILL-NULL-CREATIONPRICE deliverable (c), not
 * yet shipped as of this change) — consumed when present, generic fallback
 * (`GENERIC_EXCLUSION_REASON`) otherwise; never assumed present on every row.
 *
 * Named exports: fetchPredictionClaimsData, computeLastScoredAt,
 * formatHitRate, formatHitRateDenominator, formatDispositionBreakdown,
 * describeStaleness, resolveExclusionReason, formatBrier, formatPrice,
 * formatConfidence, directionLabel, directionColorClass, outcomeLabel,
 * outcomeColorClass — pure helpers for unit tests.
 *
 * Decision journal (DJ-GATE-1): This is a new read-only dashboard page.
 * No state mutations, no DB access from frontend — pure HTTP read over proxy.
 */
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { NavLink, useLoaderData } from "@remix-run/react";
import { PageHeader } from "~/components/PageHeader";
import { FreshnessBadge } from "~/components/FreshnessBadge";
import { useFreshnessRevalidator } from "~/lib/hooks/useFreshnessRevalidator";
import { safeFetch } from "~/lib/api/fetchUtils";
import { formatDateOnlyVi, parseDate } from "~/lib/formatDate";

export const meta: MetaFunction = () => [
  { title: "Dự báo AI & Kết quả — VN Market Intelligence" },
];

// ---------------------------------------------------------------------------
// Domain types — matched to GET /api/prediction-claims DTO contract
// ---------------------------------------------------------------------------

export type PredictionDirection = "bullish" | "bearish" | "neutral";
export type PredictionOutcome = "correct" | "wrong" | "pending" | "excluded";

export interface PredictionCalibration {
  total: number;
  resolved: number;
  correct: number;
  wrong: number;
  pending: number;
  /** Claims excluded from accuracy scoring (is_excluded=1, no entry price). */
  excluded: number;
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
  /**
   * FIX-PREDCLAIM-DASHBOARD-HITRATE-HONESTY deliverable (c): machine-readable
   * reason a claim was excluded (produced by FIX-PREDCLAIM-BACKFILL-NULL-CREATIONPRICE
   * deliverable (c), NOT YET SHIPPED as of this change — field is OPTIONAL and
   * may be absent on every row today. Consume when present; fall back to
   * GENERIC_EXCLUSION_REASON when absent/empty. Never assume presence.
   */
  exclusionReason?: string | null;
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
  /**
   * FIX-PREDCLAIM-DASHBOARD-HITRATE-HONESTY deliverable (b): resolvedAt of the
   * most recently SCORED (correct/wrong) claim, derived client-side from an
   * always-unfiltered fetch — see fetchPredictionClaimsData. null when no
   * claim has ever been scored (calibration.resolved === 0).
   */
  lastScoredAt: string | null;
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
  excluded: 0,
  hitRate: null,
  avgBrier: null,
};

function parsePredictionClaimsDto(raw: unknown): PredictionClaimsDto {
  const now = new Date().toISOString();
  if (raw === null) {
    return { generatedAt: now, calibration: { ...EMPTY_CALIBRATION }, claims: [], count: 0 };
  }
  if (typeof raw !== "object" || !("claims" in raw)) {
    throw new Error("Unexpected response shape from /api/prediction-claims");
  }
  const dto = raw as PredictionClaimsDto;
  const claims = Array.isArray(dto.claims) ? dto.claims : [];
  const calibration =
    dto.calibration !== null &&
    typeof dto.calibration === "object" &&
    "total" in dto.calibration
      ? {
          total: typeof dto.calibration.total === "number" ? dto.calibration.total : 0,
          resolved: typeof dto.calibration.resolved === "number" ? dto.calibration.resolved : 0,
          correct: typeof dto.calibration.correct === "number" ? dto.calibration.correct : 0,
          wrong: typeof dto.calibration.wrong === "number" ? dto.calibration.wrong : 0,
          pending: typeof dto.calibration.pending === "number" ? dto.calibration.pending : 0,
          excluded:
            "excluded" in dto.calibration &&
            typeof (dto.calibration as { excluded?: unknown }).excluded === "number"
              ? (dto.calibration as { excluded: number }).excluded
              : 0,
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
  return {
    generatedAt: typeof dto.generatedAt === "string" ? dto.generatedAt : now,
    calibration,
    claims,
    count: typeof dto.count === "number" ? dto.count : claims.length,
  };
}

/**
 * Most recent resolvedAt among SCORED claims (outcome "correct"|"wrong").
 * "excluded" rows also carry a non-null resolvedAt (set by excludeClaim —
 * see predictionClaimStore.ts) but were NEVER scored — they must NOT count
 * as a "last scored" event. "pending" rows have resolvedAt=null by
 * definition. Pure, exported for tests.
 */
export function computeLastScoredAt(claims: PredictionClaim[]): string | null {
  let latest: string | null = null;
  let latestMs = -Infinity;
  for (const c of claims) {
    if (c.outcome !== "correct" && c.outcome !== "wrong") continue;
    const d = parseDate(c.resolvedAt);
    if (!d) continue;
    if (d.getTime() > latestMs) {
      latestMs = d.getTime();
      latest = c.resolvedAt;
    }
  }
  return latest;
}

export async function fetchPredictionClaimsData(
  origin: string,
  params?: { limit?: number; outcome?: string }
): Promise<LoaderData> {
  const buildUrl = (outcome?: string): string => {
    const qs = new URLSearchParams();
    if (params?.limit !== undefined) {
      qs.set("limit", String(params.limit));
    }
    if (outcome !== undefined) {
      qs.set("outcome", outcome);
    }
    const qsStr = qs.toString();
    return `${origin}/api/prediction-claims${qsStr ? `?${qsStr}` : ""}`;
  };

  // Context fetch — ALWAYS unfiltered. calibration is already global
  // server-side regardless of ?outcome=, but the claims[] array is NOT: an
  // outcome-filtered request only returns matching rows, which would starve
  // computeLastScoredAt (needs resolvedAt from correct/wrong rows) whenever
  // the active filter is e.g. "Đang chờ" or "Loại trừ". This unfiltered call
  // is the single source for calibration + lastScoredAt on every filter tab.
  const { data: contextData, error: contextError } = await safeFetch<PredictionClaimsDto>(
    buildUrl(undefined),
    parsePredictionClaimsDto,
    { label: "dashboard.prediction-claims" }
  );

  let displayClaims = contextData.claims;
  let displayCount = contextData.count;
  let error = contextError;

  // Filtered fetch — only when an outcome filter is active, to populate the
  // card grid (server-side filtering, unchanged existing contract).
  if (params?.outcome !== undefined) {
    const { data: filteredData, error: filteredError } = await safeFetch<PredictionClaimsDto>(
      buildUrl(params.outcome),
      parsePredictionClaimsDto,
      { label: "dashboard.prediction-claims" }
    );
    displayClaims = filteredData.claims;
    displayCount = filteredData.count;
    error = contextError ?? filteredError;
  }

  return {
    generatedAt: contextData.generatedAt,
    calibration: contextData.calibration,
    claims: displayClaims,
    count: displayCount,
    outcomeFilter: params?.outcome ?? null,
    lastScoredAt: computeLastScoredAt(contextData.claims),
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

// ---------------------------------------------------------------------------
// FIX-PREDCLAIM-DASHBOARD-HITRATE-HONESTY — trust-surface helpers
// All figures are echoed verbatim from calibration/claims — no hitRate
// recomputation happens here; these only compose CONTEXT around the
// server-supplied number (deliverables a/b/c/d).
// ---------------------------------------------------------------------------

/**
 * Deliverable (a): denominator text shown inline next to the hit-rate badge —
 * e.g. "4 đúng / 2 sai trên 6 dự báo đã chấm điểm". Empty string when
 * resolved=0 (formatHitRate already renders "Chưa có" in that case — an
 * empty "(0 đúng / 0 sai trên 0 dự báo)" denominator would be redundant).
 */
export function formatHitRateDenominator(calibration: PredictionCalibration): string {
  if (calibration.resolved === 0) return "";
  return `${calibration.correct} đúng / ${calibration.wrong} sai trên ${calibration.resolved} dự báo đã chấm điểm`;
}

/**
 * Deliverable (d): full disposition breakdown so the buckets always visibly
 * sum to the total — e.g. "17 tổng = 4 đúng + 2 sai + 5 đang chờ + 6 loại trừ".
 */
export function formatDispositionBreakdown(calibration: PredictionCalibration): string {
  return `${calibration.total} tổng = ${calibration.correct} đúng + ${calibration.wrong} sai + ${calibration.pending} đang chờ + ${calibration.excluded} loại trừ`;
}

/**
 * Deliverable (b): staleness threshold in days. The resolution job runs
 * daily and claim horizons in live data run 5–20 days, so a healthy pipeline
 * produces at least one newly-scored (correct/wrong) claim well inside any
 * 14-day window. Chosen conservatively below the "over a month" (30+ day)
 * outage that motivated this task, so the warning fires long before that.
 */
export const STALE_THRESHOLD_DAYS = 14;

export interface StalenessInfo {
  label: string;
  isStale: boolean;
}

/**
 * Deliverable (b): compose the staleness marker from lastScoredAt (see
 * computeLastScoredAt) — driven entirely by data, never hardcoded.
 * Returns null when no claim has ever been scored (nothing to compare
 * against — the "Chưa có" hit-rate badge already communicates that state).
 */
export function describeStaleness(
  lastScoredAt: string | null,
  now: Date = new Date()
): StalenessInfo | null {
  if (lastScoredAt === null) return null;
  const d = parseDate(lastScoredAt);
  if (!d) return null;

  const ageDays = (now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000);
  const isStale = ageDays > STALE_THRESHOLD_DAYS;
  const dateLabel = formatDateOnlyVi(lastScoredAt);

  const label = isStale
    ? `Chưa có dự báo nào được chấm điểm mới từ ${dateLabel} (${Math.floor(ageDays)} ngày trước)`
    : `Lần chấm điểm gần nhất: ${dateLabel}`;

  return { label, isStale };
}

/**
 * Deliverable (c): generic fallback explanation for an excluded claim, used
 * when the claim carries no machine-readable exclusionReason.
 */
export const GENERIC_EXCLUSION_REASON =
  "Dự báo này không có giá lúc tạo (giá gốc) nên hệ thống không thể xác định đúng hay sai, nên bị loại khỏi tỷ lệ chính xác chung.";

/**
 * Deliverable (c): consume the machine-readable exclusionReason when
 * present and non-empty; fall back to the generic explanation otherwise.
 * Never assume the field is present — it may be absent on every claim.
 */
export function resolveExclusionReason(claim: {
  exclusionReason?: string | null;
}): string {
  const reason = claim.exclusionReason;
  if (typeof reason === "string" && reason.trim().length > 0) {
    return reason;
  }
  return GENERIC_EXCLUSION_REASON;
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
    case "excluded":
      return "Loại trừ";
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
    case "excluded":
      // Distinct from pending (slate): excluded uses zinc — muted, clearly non-actionable.
      return {
        badge: "bg-zinc-800 text-zinc-400 border border-zinc-600",
        text: "text-zinc-500",
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
  lastScoredAt,
}: {
  calibration: PredictionCalibration;
  lastScoredAt: string | null;
}) {
  const denominator = formatHitRateDenominator(calibration);
  const staleness = describeStaleness(lastScoredAt);

  return (
    <div className="space-y-2">
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

        {/* Tỷ lệ đúng — null→"Chưa có", NEVER "0%" — denominator shown inline (a) */}
        <div className="flex flex-col items-center rounded-md border border-slate-600 bg-slate-900 px-4 py-2 min-w-[80px]">
          <span
            className={`text-lg font-bold ${
              calibration.hitRate !== null ? "text-emerald-400" : "text-slate-500"
            }`}
          >
            {formatHitRate(calibration.hitRate)}
          </span>
          <span className="mt-0.5 text-[11px] text-slate-500">Tỷ lệ đúng</span>
          {denominator && (
            <span className="mt-0.5 text-center text-[9px] leading-tight text-slate-600">
              ({denominator})
            </span>
          )}
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

        {/* Loại trừ — only shown when backend emits excluded > 0; tooltip explains why (c) */}
        {calibration.excluded > 0 && (
          <div
            className="flex flex-col items-center rounded-md border border-zinc-600 bg-slate-900 px-4 py-2 min-w-[80px] cursor-help"
            title={GENERIC_EXCLUSION_REASON}
          >
            <span className="text-lg font-bold text-zinc-400">
              {calibration.excluded}
            </span>
            <span className="mt-0.5 text-[11px] text-slate-500">
              Loại trừ <span className="text-slate-600">(?)</span>
            </span>
          </div>
        )}
      </div>

      {/* Disposition breakdown — buckets always visibly sum to the total (d) */}
      <p className="px-1 text-[11px] text-slate-500">{formatDispositionBreakdown(calibration)}</p>

      {/* Staleness marker — driven by data, not prose (b) */}
      {staleness && (
        <p
          className={`px-1 text-xs font-medium ${
            staleness.isStale ? "text-amber-400" : "text-slate-500"
          }`}
        >
          {staleness.isStale && "⚠ "}
          {staleness.label}
        </p>
      )}
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
    { label: "Loại trừ", value: "excluded" },
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

      {/* Loại trừ explanation — point-of-use (c): machine-readable reason
          when present, generic fallback otherwise. Never assumed present. */}
      {claim.outcome === "excluded" && (
        <p className="rounded border border-zinc-700 bg-zinc-900/50 px-2 py-1.5 text-xs text-zinc-400">
          {resolveExclusionReason(claim)}
        </p>
      )}

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
  const { calibration, claims, count, generatedAt, outcomeFilter, lastScoredAt, error } =
    useLoaderData<typeof loader>();
  useFreshnessRevalidator("daily");

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
            <FreshnessBadge dataAsof={generatedAt ?? null} slaTierKey="daily" />
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
        <CalibrationBanner calibration={calibration} lastScoredAt={lastScoredAt} />
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
