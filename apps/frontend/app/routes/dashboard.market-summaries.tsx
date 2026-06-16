/**
 * /dashboard/market-summaries — Lưu trữ Tổng hợp Thị trường.
 *
 * Data source: GET /api/market-summaries (frontend server-side proxy → mcp-server :3000).
 * The proxy route is api.market-summaries.tsx, mirroring the api.prediction-claims.tsx precedent.
 *
 * Dual-mode SSR loader:
 *   ?id=<id>      → DETAIL mode: fetch single report, render full narrative + tables.
 *   (no id)       → LIST mode:   fetch period list, render archive cards with period picker.
 *
 * Endpoint contract (verified live 2026-06-11 — STEP 0 anti-demo invariant):
 *
 * LIST: GET /api/market-summaries?period=<daily|weekly|monthly|quarterly|yearly>&limit=<N>
 *   {
 *     generatedAt: string,
 *     periods: { daily: 76, weekly: 13, monthly: 5, quarterly: 2, yearly: 1 },
 *     items: [ { id, periodType, periodStart, periodEnd, createdAt,
 *                newsCount, alertCount, reportCount,
 *                summaryPreview, keyEventCount, stockCount } ],
 *     count: number
 *   }
 *
 * DETAIL: GET /api/market-summaries?id=<id>
 *   {
 *     generatedAt: string,
 *     item: {
 *       id, periodType, periodStart, periodEnd, createdAt, updatedAt,
 *       summaryText: string,
 *       keyEvents: [ { date: string, title: string, impact: string, direction: "up"|"down"|"" } ],
 *       stockPerformance: [ { symbol, firstPrice, lastPrice, changePct, alertCount } ],
 *       recommendations: [ { symbol, outlook: "bullish"|"bearish"|"neutral", confidence, reasoning } ],
 *       newsCount, alertCount, reportCount
 *     } | null   // item:null when id not found (NOT a 404 — 200 with item:null)
 *   }
 *
 * Named exports (pure helpers for unit tests):
 *   fetchSummaries, PERIOD_LABELS, formatDateRange, formatChangePct,
 *   changePctColorClass, directionArrow, directionArrowColorClass,
 *   outlookLabel, outlookColorClass, filterTickers
 *
 * Decision journal (DJ-GATE-1): New read-only dashboard page.
 * No state mutations, no DB access from frontend — pure HTTP read over proxy.
 * Dual-mode in one route eliminates /dashboard/market-summaries/$id subroute complexity.
 */
import { useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, NavLink, useLoaderData } from "@remix-run/react";
import { PageHeader } from "~/components/PageHeader";
import { safeFetch } from "~/lib/api/fetchUtils";

export const meta: MetaFunction = () => [
  { title: "Lưu trữ Thị trường — VN Market Intelligence" },
];

// ---------------------------------------------------------------------------
// Domain types — matched to GET /api/market-summaries live payload (STEP 0)
// ---------------------------------------------------------------------------

export type PeriodType = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

/** Period counts from the LIST response (always present, never null). */
export interface PeriodCounts {
  daily: number;
  weekly: number;
  monthly: number;
  quarterly: number;
  yearly: number;
}

/** A single item in the LIST response. */
export interface SummaryListItem {
  id: string;
  periodType: PeriodType;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
  newsCount: number;
  alertCount: number;
  reportCount: number;
  summaryPreview: string;
  keyEventCount: number;
  stockCount: number;
}

/** LIST response shape. */
export interface SummaryListDto {
  generatedAt: string;
  periods: PeriodCounts;
  items: SummaryListItem[];
  count: number;
}

/** A key event in the DETAIL response.
 *  Live payload: { date: string, title: string, impact: string, direction: "up"|"down"|"" }
 */
export interface KeyEvent {
  date: string;
  title: string;
  impact: string;
  direction: string; // "up" | "down" | ""
}

/** A stock performance row in the DETAIL response.
 *  Live payload (2026-06-12): { symbol, firstPrice, lastPrice, changePct, alertCount, direction }
 *  direction added by DEV-REAUDIT-4 (mcp-server marketSummaryHandler). Optional for backward compat.
 */
export interface StockPerf {
  symbol: string;
  firstPrice: number;
  lastPrice: number;
  changePct: number;
  alertCount: number;
  direction?: "up" | "down" | "flat";
}

/** A recommendation row in the DETAIL response.
 *  Live payload: { symbol, outlook: "bullish"|"bearish"|"neutral", confidence, reasoning }
 */
export interface Recommendation {
  symbol: string;
  outlook: "bullish" | "bearish" | "neutral";
  confidence: number;
  reasoning: string;
}

/** Full detail item. */
export interface SummaryDetailItem {
  id: string;
  periodType: PeriodType;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
  updatedAt?: string;
  summaryText: string;
  keyEvents: KeyEvent[];
  stockPerformance: StockPerf[];
  recommendations: Recommendation[];
  newsCount: number;
  alertCount: number;
  reportCount: number;
}

/** DETAIL response shape. item is null when id not found. */
export interface SummaryDetailDto {
  generatedAt: string;
  item: SummaryDetailItem | null;
}

// ---------------------------------------------------------------------------
// LoaderData — discriminated union by mode
// ---------------------------------------------------------------------------

export type LoaderData =
  | {
      mode: "list";
      generatedAt: string;
      periods: PeriodCounts;
      items: SummaryListItem[];
      count: number;
      selectedPeriod: PeriodType;
      error: string | null;
    }
  | {
      mode: "detail";
      generatedAt: string;
      item: SummaryDetailItem | null;
      selectedId: string;
      error: string | null;
    };

// ---------------------------------------------------------------------------
// PERIOD_LABELS — exported for tests
// ---------------------------------------------------------------------------

export const PERIOD_LABELS: Record<PeriodType, string> = {
  daily: "Hàng ngày",
  weekly: "Hàng tuần",
  monthly: "Hàng tháng",
  quarterly: "Hàng quý",
  yearly: "Hàng năm",
};

const EMPTY_PERIODS: PeriodCounts = {
  daily: 0,
  weekly: 0,
  monthly: 0,
  quarterly: 0,
  yearly: 0,
};

// ---------------------------------------------------------------------------
// fetchSummaries — exported named helper (tested directly, bypasses Remix loader strip)
// ---------------------------------------------------------------------------

function parseSummaryDetailDto(raw: unknown): SummaryDetailDto {
  const now = new Date().toISOString();
  if (raw === null) {
    return { generatedAt: now, item: null };
  }
  if (typeof raw !== "object" || !("item" in raw)) {
    throw new Error("Unexpected response shape from /api/market-summaries (detail)");
  }
  const dto = raw as SummaryDetailDto;
  return {
    generatedAt: typeof dto.generatedAt === "string" ? dto.generatedAt : now,
    item: dto.item ?? null,
  };
}

function parseSummaryListDto(raw: unknown): SummaryListDto {
  const now = new Date().toISOString();
  if (raw === null) {
    return { generatedAt: now, periods: { ...EMPTY_PERIODS }, items: [], count: 0 };
  }
  if (typeof raw !== "object" || !("items" in raw)) {
    throw new Error("Unexpected response shape from /api/market-summaries (list)");
  }
  const dto = raw as SummaryListDto;
  const items = Array.isArray(dto.items) ? dto.items : [];
  const periods =
    dto.periods !== null &&
    typeof dto.periods === "object" &&
    "daily" in dto.periods
      ? {
          daily: typeof dto.periods.daily === "number" ? dto.periods.daily : 0,
          weekly: typeof dto.periods.weekly === "number" ? dto.periods.weekly : 0,
          monthly: typeof dto.periods.monthly === "number" ? dto.periods.monthly : 0,
          quarterly: typeof dto.periods.quarterly === "number" ? dto.periods.quarterly : 0,
          yearly: typeof dto.periods.yearly === "number" ? dto.periods.yearly : 0,
        }
      : { ...EMPTY_PERIODS };
  return {
    generatedAt: typeof dto.generatedAt === "string" ? dto.generatedAt : now,
    periods,
    items,
    count: typeof dto.count === "number" ? dto.count : items.length,
  };
}

export async function fetchSummaries(
  origin: string,
  params:
    | { id: string }
    | { period?: PeriodType; limit?: number }
): Promise<LoaderData> {
  const isDetail = "id" in params;

  if (isDetail) {
    // DETAIL mode
    const selectedId = params.id;
    const url = `${origin}/api/market-summaries?id=${encodeURIComponent(selectedId)}`;
    const { data, error } = await safeFetch<SummaryDetailDto>(url, parseSummaryDetailDto, {
      label: "dashboard.market-summaries.detail",
    });
    return { mode: "detail", generatedAt: data.generatedAt, item: data.item, selectedId, error };
  } else {
    // LIST mode
    const period = (params as { period?: PeriodType; limit?: number }).period ?? "daily";
    const limit = (params as { period?: PeriodType; limit?: number }).limit;
    const qs = new URLSearchParams({ period });
    if (limit !== undefined) qs.set("limit", String(limit));
    const url = `${origin}/api/market-summaries?${qs.toString()}`;

    const { data, error } = await safeFetch<SummaryListDto>(url, parseSummaryListDto, {
      label: "dashboard.market-summaries.list",
    });
    return {
      mode: "list",
      generatedAt: data.generatedAt,
      periods: data.periods,
      items: data.items,
      count: data.count,
      selectedPeriod: period,
      error,
    };
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  const origin =
    typeof process !== "undefined" && process.env["FRONTEND_ORIGIN"]
      ? process.env["FRONTEND_ORIGIN"]
      : "http://localhost:3001";

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const period = (url.searchParams.get("period") as PeriodType | null) ?? "daily";

  if (id) {
    const data = await fetchSummaries(origin, { id });
    return json<LoaderData>(data);
  } else {
    const data = await fetchSummaries(origin, { period });
    return json<LoaderData>(data);
  }
}

// ---------------------------------------------------------------------------
// Helpers — exported for unit tests
// ---------------------------------------------------------------------------

/**
 * Format a date range string for display.
 * Same start and end → show just one date.
 * Different → show "start → end".
 */
export function formatDateRange(start: string, end: string): string {
  if (!start) return end ?? "";
  if (!end || start === end) return start;
  return `${start} → ${end}`;
}

/**
 * Format changePct with sign and one decimal place.
 * e.g. 0.33 → "+0.3%", -1.5 → "-1.5%", 0 → "0.0%"
 */
export function formatChangePct(pct: number): string {
  const fixed = pct.toFixed(1);
  if (pct > 0) return `+${fixed}%`;
  return `${fixed}%`;
}

/**
 * Map changePct to Tailwind text color class.
 * Positive → green, negative → red, zero → slate.
 */
export function changePctColorClass(pct: number): string {
  if (pct > 0) return "text-emerald-400";
  if (pct < 0) return "text-red-400";
  return "text-slate-400";
}

/**
 * Map stockPerformance direction field to Unicode arrow glyph.
 * "up" → ↑, "down" → ↓, "flat" → —, undefined/unknown → "" (no arrow).
 * NFR-C-4 (REAUDIT-FE-003): direction field supplied by DEV-REAUDIT-4.
 */
export function directionArrow(direction: "up" | "down" | "flat" | undefined): string {
  if (direction === "up") return "↑";
  if (direction === "down") return "↓";
  if (direction === "flat") return "—";
  return "";
}

/**
 * Map stockPerformance direction field to Tailwind text color class.
 * Mirrors changePctColorClass color family: up=emerald, down=red, flat=slate.
 * undefined/unknown → "" (no class — backward compat).
 * NFR-C-4 (REAUDIT-FE-003): direction field supplied by DEV-REAUDIT-4.
 */
export function directionArrowColorClass(direction: "up" | "down" | "flat" | undefined): string {
  if (direction === "up") return "text-emerald-400";
  if (direction === "down") return "text-red-400";
  if (direction === "flat") return "text-slate-400";
  return "";
}

/**
 * Map recommendation outlook to Vietnamese label.
 */
export function outlookLabel(
  outlook: "bullish" | "bearish" | "neutral"
): string {
  switch (outlook) {
    case "bullish":
      return "Tích cực";
    case "bearish":
      return "Tiêu cực";
    case "neutral":
    default:
      return "Trung lập";
  }
}

/**
 * Map recommendation outlook to Tailwind badge class.
 */
export function outlookColorClass(
  outlook: "bullish" | "bearish" | "neutral"
): string {
  switch (outlook) {
    case "bullish":
      return "bg-emerald-900 text-emerald-300 border border-emerald-700";
    case "bearish":
      return "bg-red-900 text-red-300 border border-red-700";
    case "neutral":
    default:
      return "bg-slate-700 text-slate-300 border border-slate-600";
  }
}

/**
 * Filter a list of stocks by query string (case-insensitive symbol match).
 * Empty query → returns original list.
 */
export function filterTickers<T extends { symbol: string }>(
  stocks: T[],
  query: string
): T[] {
  if (!query.trim()) return stocks;
  const q = query.trim().toUpperCase();
  return stocks.filter((s) => s.symbol.toUpperCase().includes(q));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Period type badge. */
function PeriodBadge({ periodType }: { periodType: PeriodType }) {
  return (
    <span className="inline-block rounded bg-slate-700 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-300">
      {PERIOD_LABELS[periodType] ?? periodType}
    </span>
  );
}

/** Count chip — icon label + count. */
function CountChip({
  label,
  count,
  colorClass = "text-slate-400",
}: {
  label: string;
  count: number;
  colorClass?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] font-medium ${colorClass}`}
    >
      {label}:{" "}
      <span className="font-bold text-slate-200">{count}</span>
    </span>
  );
}

/** Period picker — SSR NavLinks that change ?period=. */
function PeriodPicker({
  selected,
  periods,
}: {
  selected: PeriodType;
  periods: PeriodCounts;
}) {
  const items: PeriodType[] = [
    "daily",
    "weekly",
    "monthly",
    "quarterly",
    "yearly",
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((p) => {
        const isActive = selected === p;
        const cnt = periods[p];
        return (
          <NavLink
            key={p}
            to={`/dashboard/market-summaries?period=${p}`}
            reloadDocument
            className={[
              "rounded px-3 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-slate-700 text-slate-100"
                : "text-slate-400 hover:bg-slate-700 hover:text-slate-200",
            ].join(" ")}
          >
            {PERIOD_LABELS[p]} ({cnt})
          </NavLink>
        );
      })}
    </div>
  );
}

/** Summary card in LIST view. */
function SummaryCard({ item }: { item: SummaryListItem }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-base font-bold text-slate-100">
            {formatDateRange(item.periodStart, item.periodEnd)}
          </span>
          <span className="text-xs text-slate-500">
            Tổng hợp:{" "}
            {new Date(item.createdAt).toLocaleString("vi-VN")}
          </span>
        </div>
        <PeriodBadge periodType={item.periodType} />
      </div>

      {/* Preview text */}
      {item.summaryPreview && (
        <p className="text-sm text-slate-400 leading-relaxed line-clamp-3 whitespace-pre-line">
          {item.summaryPreview}
        </p>
      )}

      {/* Chips row */}
      <div className="flex flex-wrap gap-2">
        <CountChip label="Tin tức" count={item.newsCount} />
        <CountChip
          label="Cảnh báo"
          count={item.alertCount}
          colorClass={
            item.alertCount > 0 ? "text-amber-400" : "text-slate-400"
          }
        />
        {item.reportCount > 0 && (
          <CountChip label="Báo cáo" count={item.reportCount} />
        )}
        <CountChip label="Sự kiện" count={item.keyEventCount} />
        <CountChip label="Cổ phiếu" count={item.stockCount} />
      </div>

      {/* Link to detail */}
      <div>
        <Link
          to={`/dashboard/market-summaries?id=${encodeURIComponent(item.id)}`}
          className="inline-block rounded bg-slate-700 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-600 transition-colors"
        >
          Xem chi tiết →
        </Link>
      </div>
    </div>
  );
}

/** Ticker filter + scrollable table for stockPerformance and recommendations. */
function TickerFilteredTable<T extends { symbol: string }>({
  rows,
  renderHeader,
  renderRow,
  emptyLabel,
}: {
  rows: T[];
  renderHeader: () => React.ReactNode;
  renderRow: (row: T, i: number) => React.ReactNode;
  emptyLabel: string;
}) {
  const [query, setQuery] = useState("");
  const filtered = filterTickers(rows, query);

  return (
    <div className="space-y-3">
      {/* Search box */}
      <input
        type="text"
        placeholder="Tìm mã cổ phiếu (VD: VCB, FPT...)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full max-w-xs rounded border border-slate-600 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-slate-400 focus:outline-none"
      />
      {/* Scrollable table */}
      <div className="max-h-96 overflow-y-auto rounded border border-slate-700">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-800 text-left text-xs text-slate-500 uppercase tracking-wide">
            <tr>{renderHeader()}</tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={99}
                  className="px-4 py-6 text-center text-sm text-slate-500"
                >
                  {query
                    ? `Không tìm thấy mã "${query.toUpperCase()}"`
                    : emptyLabel}
                </td>
              </tr>
            ) : (
              filtered.map((row, i) => renderRow(row, i))
            )}
          </tbody>
        </table>
      </div>
      {filtered.length > 0 && (
        <p className="text-xs text-slate-600">
          {filtered.length} / {rows.length} mã
        </p>
      )}
    </div>
  );
}

/** KeyEvents timeline. */
function KeyEventsSection({ events }: { events: KeyEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-slate-500 italic">
        Không có sự kiện nổi bật.
      </p>
    );
  }

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
      {events.map((ev, i) => (
        <div
          key={i}
          className="flex gap-3 rounded border border-slate-700 bg-slate-900 px-3 py-2"
        >
          {/* Direction indicator */}
          <span
            className={[
              "mt-0.5 shrink-0 text-lg leading-none font-bold",
              ev.direction === "up"
                ? "text-emerald-400"
                : ev.direction === "down"
                ? "text-red-400"
                : "text-slate-500",
            ].join(" ")}
            aria-label={
              ev.direction === "up"
                ? "Tăng"
                : ev.direction === "down"
                ? "Giảm"
                : "Trung tính"
            }
          >
            {ev.direction === "up" ? "↑" : ev.direction === "down" ? "↓" : "·"}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-200 leading-snug">
              {ev.title}
            </p>
            {ev.date && (
              <p className="mt-0.5 text-[11px] text-slate-500">
                {new Date(ev.date).toLocaleString("vi-VN")}
              </p>
            )}
            {ev.impact && (
              <p className="mt-0.5 text-xs text-slate-400">{ev.impact}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Section header. */
function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-base font-bold text-slate-100 mb-3">{children}</h2>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MarketSummariesPage() {
  const data = useLoaderData<typeof loader>();

  if (data.mode === "detail") {
    return <DetailView data={data} />;
  }
  return <ListView data={data} />;
}

// ---------------------------------------------------------------------------
// LIST VIEW
// ---------------------------------------------------------------------------

function ListView({
  data,
}: {
  data: Extract<LoaderData, { mode: "list" }>;
}) {
  const { generatedAt, periods, items, count, selectedPeriod, error } = data;
  const isEmpty = !error && items.length === 0;

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Lưu trữ Tổng hợp Thị trường"
        subtitle="Xem lại các bản tổng hợp thị trường hàng ngày, hàng tuần, hàng tháng và hơn thế nữa"
        actions={
          <span className="text-xs text-slate-500">
            {count > 0 && (
              <span className="mr-3 font-medium text-slate-300">
                {count} báo cáo
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
          Không thể tải dữ liệu tổng hợp thị trường — {error}
        </div>
      )}

      {/* Period picker */}
      <PeriodPicker selected={selectedPeriod} periods={periods} />

      {/* Empty state */}
      {isEmpty && (
        <div className="rounded-lg border border-slate-700 bg-slate-800 px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-400">
            Không có dữ liệu tổng hợp cho kỳ này
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Thử chọn kỳ khác để xem thêm.
          </p>
        </div>
      )}

      {/* Report cards grid */}
      {items.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <SummaryCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DETAIL VIEW
// ---------------------------------------------------------------------------

function DetailView({
  data,
}: {
  data: Extract<LoaderData, { mode: "detail" }>;
}) {
  const { item, error } = data;

  return (
    <div className="w-full space-y-6">
      {/* Back link */}
      <div>
        <Link
          to="/dashboard/market-summaries"
          className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          ← Quay lại
        </Link>
      </div>

      <PageHeader
        title={
          item
            ? `Tổng hợp ${PERIOD_LABELS[item.periodType] ?? item.periodType} — ${formatDateRange(item.periodStart, item.periodEnd)}`
            : "Chi tiết báo cáo"
        }
        subtitle={
          item
            ? `Tổng hợp vào: ${new Date(item.createdAt).toLocaleString("vi-VN")}`
            : undefined
        }
      />

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="rounded border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-300"
        >
          Không thể tải chi tiết báo cáo — {error}
        </div>
      )}

      {/* Null item — not found */}
      {!error && item === null && (
        <div className="rounded-lg border border-slate-700 bg-slate-800 px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-400">
            Không tìm thấy báo cáo
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Báo cáo này không tồn tại hoặc đã bị xóa. Vui lòng quay lại danh
            sách.
          </p>
        </div>
      )}

      {/* Full detail */}
      {item !== null && item !== undefined && (
        <div className="space-y-8">
          {/* Activity chips */}
          <div className="flex flex-wrap gap-2">
            <CountChip label="Tin tức" count={item.newsCount} />
            <CountChip
              label="Cảnh báo"
              count={item.alertCount}
              colorClass={
                item.alertCount > 0 ? "text-amber-400" : "text-slate-400"
              }
            />
            {item.reportCount > 0 && (
              <CountChip label="Báo cáo" count={item.reportCount} />
            )}
            <CountChip label="Sự kiện" count={item.keyEvents.length} />
            <CountChip label="Cổ phiếu" count={item.stockPerformance.length} />
          </div>

          {/* Summary text — full narrative */}
          <section>
            <SectionHeader>Nội dung tổng hợp</SectionHeader>
            <div className="rounded border border-slate-700 bg-slate-900 px-4 py-4">
              <p className="whitespace-pre-wrap text-sm text-slate-300 leading-relaxed">
                {item.summaryText}
              </p>
            </div>
          </section>

          {/* Key events timeline */}
          <section>
            <SectionHeader>
              Sự kiện nổi bật ({item.keyEvents.length})
            </SectionHeader>
            <KeyEventsSection events={item.keyEvents} />
          </section>

          {/* Stock performance table */}
          <section>
            <SectionHeader>
              Hiệu suất cổ phiếu ({item.stockPerformance.length})
            </SectionHeader>
            <TickerFilteredTable
              rows={item.stockPerformance}
              emptyLabel="Không có dữ liệu cổ phiếu."
              renderHeader={() => (
                <>
                  <th className="px-3 py-2">Mã CK</th>
                  <th className="px-3 py-2 text-right">Giá đầu kỳ</th>
                  <th className="px-3 py-2 text-right">Giá cuối kỳ</th>
                  <th className="px-3 py-2 text-right">Thay đổi</th>
                  <th className="px-3 py-2 text-right">Cảnh báo</th>
                </>
              )}
              renderRow={(row, i) => (
                <tr
                  key={row.symbol}
                  className={
                    i % 2 === 0
                      ? "bg-slate-800/40"
                      : "bg-slate-900/40"
                  }
                >
                  <td className="px-3 py-2 font-bold text-slate-200">
                    {row.symbol}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                    {row.firstPrice.toLocaleString("vi-VN")}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                    {row.lastPrice.toLocaleString("vi-VN")}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums font-bold ${changePctColorClass(row.changePct)}`}
                  >
                    {row.direction && (
                      <span
                        className={`mr-0.5 ${directionArrowColorClass(row.direction)}`}
                        aria-label={
                          row.direction === "up"
                            ? "Tăng"
                            : row.direction === "down"
                            ? "Giảm"
                            : "Đi ngang"
                        }
                      >
                        {directionArrow(row.direction)}
                      </span>
                    )}
                    {formatChangePct(row.changePct)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                    {row.alertCount > 0 ? (
                      <span className="text-amber-400 font-medium">
                        {row.alertCount}
                      </span>
                    ) : (
                      row.alertCount
                    )}
                  </td>
                </tr>
              )}
            />
          </section>

          {/* Recommendations table */}
          <section>
            <SectionHeader>
              Khuyến nghị ({item.recommendations.length})
            </SectionHeader>
            <TickerFilteredTable
              rows={item.recommendations}
              emptyLabel="Không có khuyến nghị."
              renderHeader={() => (
                <>
                  <th className="px-3 py-2">Mã CK</th>
                  <th className="px-3 py-2">Triển vọng</th>
                  <th className="px-3 py-2 text-right">Độ tin cậy</th>
                  <th className="px-3 py-2">Nhận định</th>
                </>
              )}
              renderRow={(row, i) => (
                <tr
                  key={row.symbol}
                  className={
                    i % 2 === 0
                      ? "bg-slate-800/40"
                      : "bg-slate-900/40"
                  }
                >
                  <td className="px-3 py-2 font-bold text-slate-200">
                    {row.symbol}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${outlookColorClass(row.outlook)}`}
                    >
                      {outlookLabel(row.outlook)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                    {Math.round(row.confidence * 100)}%
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-400 max-w-xs truncate">
                    {row.reasoning}
                  </td>
                </tr>
              )}
            />
          </section>
        </div>
      )}
    </div>
  );
}
