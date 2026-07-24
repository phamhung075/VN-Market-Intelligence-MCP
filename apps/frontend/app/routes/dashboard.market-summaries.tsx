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
 * Named exports (pure helpers for unit tests — re-exported from the domain layer;
 * see FACTORY-FRONTEND-split-market-summaries):
 *   fetchSummaries, PERIOD_LABELS, formatDateRange, formatChangePct,
 *   changePctColorClass, directionArrow, directionArrowColorClass,
 *   outlookLabel, outlookColorClass, filterTickers
 *
 * Decision journal (DJ-GATE-1): New read-only dashboard page.
 * No state mutations, no DB access from frontend — pure HTTP read over proxy.
 * Dual-mode in one route eliminates /dashboard/market-summaries/$id subroute complexity.
 *
 * FACTORY-FRONTEND-split-market-summaries (behavior-preserving refactor): the 9 pure
 * formatter/filter helpers moved verbatim to app/domain/market-summaries/format.ts
 * (re-exported here for backward-compat imports, e.g. the loader test) and the
 * list/detail JSX moved to app/components/market-summaries/*.tsx. This route file
 * is now types + fetchSummaries + loader + a thin page-mode composition.
 */
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { safeFetch } from "~/lib/api/fetchUtils";
import { ListView } from "~/components/market-summaries/ListView";
import { DetailView } from "~/components/market-summaries/DetailView";

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
// Pure formatter/filter helpers — re-exported from the domain layer.
// FACTORY-FRONTEND-split-market-summaries: moved to app/domain/market-summaries/format.ts.
// Re-exported here verbatim for backward-compat call-sites (e.g. the loader test
// imports these names from this route module).
// ---------------------------------------------------------------------------

export {
  PERIOD_LABELS,
  formatDateRange,
  formatChangePct,
  changePctColorClass,
  directionArrow,
  directionArrowColorClass,
  outlookLabel,
  outlookColorClass,
  filterTickers,
} from "~/domain/market-summaries/format";

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
// Page — thin composition over ListView / DetailView
// ---------------------------------------------------------------------------

export default function MarketSummariesPage() {
  const data = useLoaderData<typeof loader>();

  if (data.mode === "detail") {
    return <DetailView data={data} />;
  }
  return <ListView data={data} />;
}
