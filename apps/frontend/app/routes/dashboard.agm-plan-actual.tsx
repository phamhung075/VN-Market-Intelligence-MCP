/**
 * /dashboard/agm-plan-actual — Kế hoạch vs Thực hiện (AGM Plan vs Actual).
 *
 * Data source: GET /api/agm-plan-actual (frontend server-side proxy → mcp-server :3000).
 * The proxy route is api.agm-plan-actual.tsx, mirroring the api.foreign-flow.tsx precedent.
 *
 * Endpoint contract (GET /api/agm-plan-actual?year=YYYY&limit=N) — VERIFIED live 2026-06-11:
 *   {
 *     generatedAt: string,
 *     defaultYear: number,        // 2025
 *     availableYears: number[],   // desc, e.g. [2026,2025,2024,...]
 *     items: [
 *       { stockCode: string, year: number,
 *         metrics: [
 *           { ptid: number, label: string,
 *             plan_ty: number|null, actual_ty: number|null,
 *             completion_pct: number|null,
 *             status: "EXCEEDED"|"ON_TRACK"|"BEHIND"|"IN_PROGRESS",
 *             ytd_ty: number|null, ytd_term_id: number|null }
 *         ] }
 *     ],
 *     summary: { year: number, exceeded: number, onTrack: number,
 *                behind: number, inProgress: number, total: number },
 *     count: number
 *   }
 *
 * CRITICAL IN_PROGRESS handling: status==="IN_PROGRESS" means the reporting year
 * is still open. actual_ty and completion_pct WILL BE NULL. Render as "—" /
 * "Đang thực hiện" — NEVER as 0 / 0% / red BEHIND bar.
 *
 * NULL tolerance: plan_ty / actual_ty / completion_pct / ytd_ty all nullable.
 * Always render null as "—", never crash.
 *
 * Named exports: fetchAgmPlanActualData, formatTy, formatPct, formatCompletion,
 * statusLabel, statusColorClass — pure helpers for unit tests.
 */
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useLoaderData, useSearchParams } from "@remix-run/react";
import { PageHeader } from "~/components/PageHeader";

export const meta: MetaFunction = () => [
  { title: "Kế hoạch vs Thực hiện — VN Market Intelligence" },
];

// ---------------------------------------------------------------------------
// Domain types — matched to GET /api/agm-plan-actual DTO contract (live 2026-06-11)
// ---------------------------------------------------------------------------

export type AgmStatus = "EXCEEDED" | "ON_TRACK" | "BEHIND" | "IN_PROGRESS";

export interface AgmMetric {
  ptid: number;
  label: string;
  plan_ty: number | null;
  actual_ty: number | null;
  completion_pct: number | null;
  status: AgmStatus;
  ytd_ty: number | null;
  ytd_term_id: number | null;
}

export interface AgmItem {
  stockCode: string;
  year: number;
  metrics: AgmMetric[];
}

export interface AgmSummary {
  year: number;
  exceeded: number;
  onTrack: number;
  behind: number;
  inProgress: number;
  total: number;
}

export interface AgmPlanActualDto {
  generatedAt: string;
  defaultYear: number;
  availableYears: number[];
  items: AgmItem[];
  summary: AgmSummary;
  count: number;
}

export interface LoaderData {
  generatedAt: string;
  defaultYear: number;
  availableYears: number[];
  items: AgmItem[];
  summary: AgmSummary;
  count: number;
  selectedYear: number;
  error: string | null;
}

// ---------------------------------------------------------------------------
// fetchAgmPlanActualData — exported named helper for unit tests
// ---------------------------------------------------------------------------

const EMPTY_SUMMARY: AgmSummary = {
  year: 0,
  exceeded: 0,
  onTrack: 0,
  behind: 0,
  inProgress: 0,
  total: 0,
};

export async function fetchAgmPlanActualData(
  origin: string,
  params?: { year?: number; limit?: number }
): Promise<Omit<LoaderData, "selectedYear">> {
  let generatedAt = new Date().toISOString();
  let defaultYear = 2025;
  let availableYears: number[] = [];
  let items: AgmItem[] = [];
  let summary: AgmSummary = { ...EMPTY_SUMMARY };
  let count = 0;
  let error: string | null = null;

  try {
    const qs = new URLSearchParams();
    if (params?.year !== undefined) qs.set("year", String(params.year));
    if (params?.limit !== undefined) qs.set("limit", String(params.limit));
    const qsStr = qs.toString();
    const url = `${origin}/api/agm-plan-actual${qsStr ? `?${qsStr}` : ""}`;

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      error = `Upstream returned ${response.status} ${response.statusText}`;
    } else {
      const raw = (await response.json()) as unknown;
      if (raw !== null && typeof raw === "object" && "items" in raw) {
        const dto = raw as AgmPlanActualDto;
        generatedAt =
          typeof dto.generatedAt === "string" ? dto.generatedAt : generatedAt;
        defaultYear =
          typeof dto.defaultYear === "number" ? dto.defaultYear : defaultYear;
        availableYears = Array.isArray(dto.availableYears)
          ? dto.availableYears
          : [];
        items = Array.isArray(dto.items) ? dto.items : [];
        count = typeof dto.count === "number" ? dto.count : items.length;
        summary =
          dto.summary !== null &&
          typeof dto.summary === "object" &&
          "exceeded" in dto.summary
            ? {
                year:
                  typeof dto.summary.year === "number" ? dto.summary.year : 0,
                exceeded:
                  typeof dto.summary.exceeded === "number"
                    ? dto.summary.exceeded
                    : 0,
                onTrack:
                  typeof dto.summary.onTrack === "number"
                    ? dto.summary.onTrack
                    : 0,
                behind:
                  typeof dto.summary.behind === "number"
                    ? dto.summary.behind
                    : 0,
                inProgress:
                  typeof dto.summary.inProgress === "number"
                    ? dto.summary.inProgress
                    : 0,
                total:
                  typeof dto.summary.total === "number"
                    ? dto.summary.total
                    : 0,
              }
            : { ...EMPTY_SUMMARY };
      } else {
        error = "Unexpected response shape from /api/agm-plan-actual";
      }
    }
  } catch (err) {
    error =
      err instanceof Error
        ? err.message
        : "Không thể kết nối tới máy chủ dữ liệu kế hoạch AGM";
  }

  return {
    generatedAt,
    defaultYear,
    availableYears,
    items,
    summary,
    count,
    error,
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const origin =
    typeof process !== "undefined" && process.env["FRONTEND_ORIGIN"]
      ? process.env["FRONTEND_ORIGIN"]
      : "http://localhost:3001";

  const url = new URL(request.url);
  const yearParam = url.searchParams.get("year");

  // We need defaultYear first if no year param; we always fetch and let the
  // server determine the defaultYear from the response.
  const yearNumber = yearParam ? parseInt(yearParam, 10) : undefined;

  const data = await fetchAgmPlanActualData(origin, {
    year: yearNumber,
    limit: 200,
  });

  const selectedYear = yearNumber ?? data.defaultYear;

  return json<LoaderData>({ ...data, selectedYear });
}

// ---------------------------------------------------------------------------
// Formatting helpers — exported for unit tests
// ---------------------------------------------------------------------------

/**
 * Format a nullable TỶ ĐỒNG value with vi-VN thousands separator + " tỷ".
 * null → "—"
 */
export function formatTy(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return `${value.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tỷ`;
}

/**
 * Format a nullable completion percentage (0–100+).
 * null → "—"
 * IN_PROGRESS items should be guarded by the caller — this just formats number.
 */
export function formatPct(pct: number | null): string {
  if (pct === null || pct === undefined) return "—";
  return `${pct.toFixed(1)}%`;
}

/**
 * Format the display of actual completion — null-safe and IN_PROGRESS aware.
 * When pct is null (open year / not reported): returns "Đang thực hiện", NEVER "0%".
 */
export function formatCompletion(
  pct: number | null,
  status: AgmStatus
): string {
  if (status === "IN_PROGRESS" || pct === null || pct === undefined) {
    return "Đang thực hiện";
  }
  return `${pct.toFixed(1)}%`;
}

/**
 * Human-readable Vietnamese label for an AgmStatus.
 */
export function statusLabel(status: AgmStatus): string {
  switch (status) {
    case "EXCEEDED":
      return "Vượt KH";
    case "ON_TRACK":
      return "Đạt";
    case "BEHIND":
      return "Chưa đạt";
    case "IN_PROGRESS":
      return "Đang thực hiện";
    default:
      return status;
  }
}

/**
 * Tailwind colour class set for a given status.
 * Returns an object with badge and bar colour classes.
 */
export function statusColorClass(status: AgmStatus): {
  badge: string;
  bar: string;
  text: string;
} {
  switch (status) {
    case "EXCEEDED":
      return {
        badge: "bg-emerald-900 text-emerald-300 border border-emerald-700",
        bar: "bg-emerald-500",
        text: "text-emerald-400",
      };
    case "ON_TRACK":
      return {
        badge: "bg-teal-900 text-teal-300 border border-teal-700",
        bar: "bg-teal-500",
        text: "text-teal-400",
      };
    case "BEHIND":
      return {
        badge: "bg-red-900 text-red-300 border border-red-700",
        bar: "bg-red-500",
        text: "text-red-400",
      };
    case "IN_PROGRESS":
    default:
      return {
        badge: "bg-slate-700 text-slate-300 border border-slate-600",
        bar: "bg-slate-500",
        text: "text-slate-400",
      };
  }
}

// ---------------------------------------------------------------------------
// Progress bar — visual representation of completion_pct
// IN_PROGRESS: render a subtle pulsing grey bar (indeterminate style).
// ---------------------------------------------------------------------------

function ProgressBar({
  pct,
  status,
}: {
  pct: number | null;
  status: AgmStatus;
}) {
  const colors = statusColorClass(status);

  if (status === "IN_PROGRESS" || pct === null) {
    // Indeterminate / open year — grey bar, no false percentage
    return (
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-700">
        <div className="h-full w-1/3 animate-pulse rounded-full bg-slate-500" />
      </div>
    );
  }

  // Closed-year: clamp display at 120% for overflow bar (EXCEEDED can be >100%)
  const displayPct = Math.min(pct, 120);
  const widthPct = Math.min((displayPct / 120) * 100, 100);

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-700">
      <div
        className={`h-full rounded-full ${colors.bar}`}
        style={{ width: `${widthPct}%` }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatusBadge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: AgmStatus }) {
  const colors = statusColorClass(status);
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${colors.badge}`}
    >
      {statusLabel(status)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// MetricRow — one row per metric (Doanh thu / LN trước thuế / LN sau thuế)
// ---------------------------------------------------------------------------

function MetricRow({ metric }: { metric: AgmMetric }) {
  const colors = statusColorClass(metric.status);
  const isInProgress = metric.status === "IN_PROGRESS";

  return (
    <div className="space-y-1.5 rounded-md border border-slate-700 bg-slate-800/50 p-3">
      {/* Label + status badge row */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-300">
          {metric.label}
        </span>
        <StatusBadge status={metric.status} />
      </div>

      {/* Numbers row: KH | TH | % */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <span className="block text-slate-500">Kế hoạch</span>
          <span className="font-medium text-slate-200">
            {formatTy(metric.plan_ty)}
          </span>
        </div>
        <div>
          <span className="block text-slate-500">Thực hiện</span>
          <span
            className={`font-medium ${isInProgress ? "text-slate-400" : "text-slate-200"}`}
          >
            {isInProgress ? "—" : formatTy(metric.actual_ty)}
          </span>
        </div>
        <div>
          <span className="block text-slate-500">Hoàn thành</span>
          <span className={`font-bold ${colors.text}`}>
            {formatCompletion(metric.completion_pct, metric.status)}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <ProgressBar pct={metric.completion_pct} status={metric.status} />

      {/* YTD context (optional — only shown when ytd_ty is non-null) */}
      {metric.ytd_ty !== null && metric.ytd_ty !== undefined && (
        <p className="text-[11px] text-slate-500">
          Lũy kế:{" "}
          <span className="text-slate-400">{formatTy(metric.ytd_ty)}</span>
          {metric.ytd_term_id !== null && metric.ytd_term_id !== undefined && (
            <span className="ml-1">(kỳ {metric.ytd_term_id})</span>
          )}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StockCard — one card per AGM item
// ---------------------------------------------------------------------------

function StockCard({ item }: { item: AgmItem }) {
  if (item.metrics.length === 0) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
        <p className="text-sm font-bold text-slate-100">{item.stockCode}</p>
        <p className="mt-2 text-xs text-slate-500">Chưa có dữ liệu chỉ tiêu.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
      {/* Header: ticker + year */}
      <div className="mb-3 flex items-center gap-2">
        <span className="text-base font-bold text-slate-100">
          {item.stockCode}
        </span>
        <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
          {item.year}
        </span>
      </div>

      {/* Metrics */}
      <div className="space-y-2">
        {item.metrics.map((m) => (
          <MetricRow key={m.ptid} metric={m} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SummaryBanner — 4 chips: Vượt KH / Đạt / Chưa đạt / Đang thực hiện
// ---------------------------------------------------------------------------

function SummaryBanner({ summary }: { summary: AgmSummary }) {
  const chips = [
    {
      label: "Vượt KH",
      count: summary.exceeded,
      chipClass: "bg-emerald-900 text-emerald-300 border border-emerald-700",
    },
    {
      label: "Đạt",
      count: summary.onTrack,
      chipClass: "bg-teal-900 text-teal-300 border border-teal-700",
    },
    {
      label: "Chưa đạt",
      count: summary.behind,
      chipClass: "bg-red-900 text-red-300 border border-red-700",
    },
    {
      label: "Đang thực hiện",
      count: summary.inProgress,
      chipClass: "bg-slate-700 text-slate-300 border border-slate-600",
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/60 px-5 py-4">
      <span className="text-xs font-medium text-slate-500">
        Năm {summary.year} — {summary.total} chỉ tiêu
      </span>
      {chips.map(({ label, count, chipClass }) => (
        <span
          key={label}
          className={`inline-flex items-center gap-1.5 rounded px-3 py-1 text-sm font-bold ${chipClass}`}
        >
          <span className="tabular-nums">{count}</span>
          <span className="text-xs font-medium">{label}</span>
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// YearSelector — SSR-friendly: submits as GET ?year=YYYY
// ---------------------------------------------------------------------------

function YearSelector({
  availableYears,
  selectedYear,
}: {
  availableYears: number[];
  selectedYear: number;
}) {
  if (availableYears.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-slate-400">Năm:</span>
      {availableYears.map((y) => {
        const isSelected = y === selectedYear;
        return (
          <Form key={y} method="get">
            <input type="hidden" name="year" value={y} />
            <button
              type="submit"
              className={[
                "rounded px-3 py-1 text-sm font-medium transition-colors",
                isSelected
                  ? "bg-slate-600 text-slate-100"
                  : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200",
              ].join(" ")}
            >
              {y}
            </button>
          </Form>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AgmPlanActualPage() {
  const {
    availableYears,
    items,
    summary,
    count,
    generatedAt,
    selectedYear,
    error,
  } = useLoaderData<typeof loader>();

  // useSearchParams for display only (year pill active state is driven by loader selectedYear)
  const [searchParams] = useSearchParams();
  void searchParams; // referenced only via selectedYear from loader

  const isEmpty = !error && items.length === 0;

  // Sort items by stockCode alphabetically for consistent ordering
  const sorted = [...items].sort((a, b) => a.stockCode.localeCompare(b.stockCode));

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Kế hoạch vs Thực hiện"
        subtitle="So sánh mục tiêu doanh thu/lợi nhuận cam kết tại Đại hội cổ đông (ĐHCĐ) với kết quả thực tế đã công bố"
        actions={
          <span className="text-xs text-slate-500">
            {count > 0 && (
              <span className="mr-3 font-medium text-slate-300">
                {count} công ty
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

      {/* Year selector */}
      <YearSelector
        availableYears={availableYears}
        selectedYear={selectedYear}
      />

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="rounded border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-300"
        >
          Không thể tải dữ liệu kế hoạch AGM — {error}
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="rounded-lg border border-slate-700 bg-slate-800 px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-400">
            Không có dữ liệu cho năm này.
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Thử chọn một năm khác từ bộ lọc phía trên.
          </p>
        </div>
      )}

      {/* Summary banner */}
      {!error && !isEmpty && (
        <SummaryBanner summary={summary} />
      )}

      {/* Stock cards grid */}
      {sorted.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((item) => (
            <StockCard key={`${item.stockCode}-${item.year}`} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
