/**
 * /dashboard/corporate-events — Sự kiện doanh nghiệp gần đây.
 *
 * Data source: GET /api/corporate-events (frontend server-side proxy → mcp-server :3000).
 * The proxy route is api.corporate-events.tsx, mirroring the api.sector-cascade.tsx precedent.
 *
 * HONEST FRAMING (load-bearing): this is a BACKWARD-LOOKING recent-activity monitor.
 * The source table has 0 future rows. Do NOT label it a calendar / "sắp tới" / upcoming.
 * Frame as "hoạt động gần đây" / "đã công bố". asOf is the most-recent event date in window.
 *
 * Endpoint contract (GET /api/corporate-events?days=90) — VERIFIED live 2026-06-11:
 *   {
 *     generatedAt: string (ISO),
 *     windowDays: number,      // clamped [7,365], default 90
 *     since: string ("YYYY-MM-DD"),
 *     asOf: string ("YYYY-MM-DD"; "" when empty),
 *     typeFilter: string|null,
 *     events: [{
 *       code, eventType, category, categoryLabel, title, detail, eventDate
 *     }],  // sorted eventDate DESC, code ASC
 *     byType: [{eventType, categoryLabel, count}],  // desc by count, tie eventType ASC
 *     summary: {
 *       totalEvents, distinctCodes, dividend, issuance, insider, meeting, other,
 *       topActiveCodes: [{code,count}]
 *     },
 *     count: number
 *   }
 *
 * category ∈ {dividend, issuance, insider, meeting, other}
 * categoryLabel is Vietnamese (e.g. "Cổ tức tiền mặt", "Phát hành cổ phiếu",
 *   "Giao dịch cổ đông nội bộ", "ĐHĐCĐ thường niên", "Khác")
 * event_name (title) is ENGLISH; detail is Vietnamese when available else falls back to English title.
 *
 * Named exports (for unit tests):
 *   fetchCorporateEventsData, categoryColorClass, CATEGORY_FILTER_OPTIONS,
 *   ALLOWED_DAYS_VALUES, clampDays, filterEvents
 *
 * Decision journal (DJ-GATE-1): New read-only dashboard page (TASK17-PAGE13).
 * Named-export helper pattern: Remix strips loader in jsdom; named helpers bypass that.
 * ?days= forwarded through proxy to upstream (default 90).
 * Category filter is CLIENT-SIDE (from events[].category field) — no server param.
 * Lookback window selector triggers SSR round-trip via anchor links.
 * BACKWARD-LOOKING: source table has 0 future rows — no "sắp tới" / "upcoming" framing.
 */
import { useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link, useLocation } from "@remix-run/react";
import { PageHeader } from "~/components/PageHeader";

export const meta: MetaFunction = () => [
  { title: "Sự kiện doanh nghiệp gần đây — VN Market Intelligence" },
];

// ---------------------------------------------------------------------------
// Domain types — matched to GET /api/corporate-events live payload
// ---------------------------------------------------------------------------

export type EventCategory =
  | "dividend"
  | "issuance"
  | "insider"
  | "meeting"
  | "other";

export interface CorporateEvent {
  code: string;
  eventType: string;
  category: EventCategory;
  categoryLabel: string;
  title: string;
  detail: string;
  eventDate: string;
}

export interface ByTypeEntry {
  eventType: string;
  categoryLabel: string;
  count: number;
}

export interface TopActiveCode {
  code: string;
  count: number;
}

export interface CorporateEventsSummary {
  totalEvents: number;
  distinctCodes: number;
  dividend: number;
  issuance: number;
  insider: number;
  meeting: number;
  other: number;
  topActiveCodes: TopActiveCode[];
}

export interface CorporateEventsDto {
  generatedAt: string;
  windowDays: number;
  since: string;
  asOf: string;
  stale?: boolean;
  staleByDays?: number;
  typeFilter: string | null;
  events: CorporateEvent[];
  byType: ByTypeEntry[];
  summary: CorporateEventsSummary;
  count: number;
}

// ---------------------------------------------------------------------------
// LoaderData
// ---------------------------------------------------------------------------

export interface LoaderData {
  generatedAt: string;
  windowDays: number;
  since: string;
  asOf: string;
  stale: boolean;
  staleByDays: number;
  typeFilter: string | null;
  events: CorporateEvent[];
  byType: ByTypeEntry[];
  summary: CorporateEventsSummary;
  count: number;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Helpers — exported for unit tests
// ---------------------------------------------------------------------------

/**
 * Allowed ?days= values for the lookback window selector.
 * Upstream clamps [7,365]; we expose a curated whitelist.
 */
export const ALLOWED_DAYS_VALUES: number[] = [30, 90, 180, 365];

/**
 * Clamp a requested days value to the nearest allowed whitelist entry.
 * Falls back to 90 (default) if the value is not in the whitelist.
 */
export function clampDays(raw: string | null): number {
  if (raw === null) return 90;
  const parsed = parseInt(raw, 10);
  if (!isNaN(parsed) && ALLOWED_DAYS_VALUES.includes(parsed)) return parsed;
  return 90;
}

/**
 * Category filter option definitions.
 * "all" means no filter — show all categories.
 */
export const CATEGORY_FILTER_OPTIONS: Array<{
  value: EventCategory | "all";
  label: string;
}> = [
  { value: "all", label: "Tất cả" },
  { value: "dividend", label: "Cổ tức" },
  { value: "issuance", label: "Phát hành" },
  { value: "insider", label: "Nội bộ" },
  { value: "meeting", label: "ĐHĐCĐ" },
  { value: "other", label: "Khác" },
];

/**
 * Map category to Tailwind badge CSS class.
 * Colors are category-specific for quick visual scanning.
 */
export function categoryColorClass(category: EventCategory | string): string {
  switch (category) {
    case "dividend":
      return "bg-emerald-900 text-emerald-300 border border-emerald-700";
    case "issuance":
      return "bg-blue-900 text-blue-300 border border-blue-700";
    case "insider":
      return "bg-amber-900 text-amber-300 border border-amber-700";
    case "meeting":
      return "bg-purple-900 text-purple-300 border border-purple-700";
    case "other":
    default:
      return "bg-slate-700 text-slate-300 border border-slate-600";
  }
}

/**
 * Filter events[] by category value.
 * "all" → returns all events.
 * Other values → returns events matching that category.
 */
export function filterEvents(
  events: CorporateEvent[],
  category: EventCategory | "all",
): CorporateEvent[] {
  if (category === "all") return events;
  return events.filter((e) => e.category === category);
}

// ---------------------------------------------------------------------------
// fetchCorporateEventsData — exported named helper for unit tests
// (Remix strips loader in jsdom; named helper bypasses that)
// ---------------------------------------------------------------------------

const EMPTY_SUMMARY: CorporateEventsSummary = {
  totalEvents: 0,
  distinctCodes: 0,
  dividend: 0,
  issuance: 0,
  insider: 0,
  meeting: 0,
  other: 0,
  topActiveCodes: [],
};

export async function fetchCorporateEventsData(
  origin: string,
  days?: number,
): Promise<LoaderData> {
  let generatedAt = new Date().toISOString();
  let windowDays = days ?? 90;
  let since = "";
  let asOf = "";
  let stale = false;
  let staleByDays = 0;
  let typeFilter: string | null = null;
  let events: CorporateEvent[] = [];
  let byType: ByTypeEntry[] = [];
  let summary: CorporateEventsSummary = { ...EMPTY_SUMMARY };
  let count = 0;
  let error: string | null = null;

  try {
    const urlObj = new URL(`${origin}/api/corporate-events`);
    if (days !== undefined) {
      urlObj.searchParams.set("days", String(days));
    }
    const url = urlObj.toString();

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      error = `Upstream returned ${response.status} ${response.statusText}`;
    } else {
      const raw = (await response.json()) as unknown;
      if (raw !== null && typeof raw === "object" && "events" in raw) {
        const dto = raw as CorporateEventsDto;
        generatedAt =
          typeof dto.generatedAt === "string" ? dto.generatedAt : generatedAt;
        windowDays =
          typeof dto.windowDays === "number" ? dto.windowDays : windowDays;
        since = typeof dto.since === "string" ? dto.since : "";
        asOf = typeof dto.asOf === "string" ? dto.asOf : "";
        stale = typeof dto.stale === "boolean" ? dto.stale : false;
        staleByDays = typeof dto.staleByDays === "number" ? dto.staleByDays : 0;
        typeFilter =
          typeof dto.typeFilter === "string" ? dto.typeFilter : null;
        events = Array.isArray(dto.events) ? dto.events : [];
        byType = Array.isArray(dto.byType) ? dto.byType : [];
        count = typeof dto.count === "number" ? dto.count : events.length;

        if (
          dto.summary !== null &&
          typeof dto.summary === "object" &&
          "totalEvents" in dto.summary
        ) {
          const s = dto.summary;
          summary = {
            totalEvents:
              typeof s.totalEvents === "number" ? s.totalEvents : 0,
            distinctCodes:
              typeof s.distinctCodes === "number" ? s.distinctCodes : 0,
            dividend: typeof s.dividend === "number" ? s.dividend : 0,
            issuance: typeof s.issuance === "number" ? s.issuance : 0,
            insider: typeof s.insider === "number" ? s.insider : 0,
            meeting: typeof s.meeting === "number" ? s.meeting : 0,
            other: typeof s.other === "number" ? s.other : 0,
            topActiveCodes: Array.isArray(s.topActiveCodes)
              ? s.topActiveCodes
              : [],
          };
        }
      } else {
        error = "Unexpected response shape from /api/corporate-events";
      }
    }
  } catch (err) {
    error =
      err instanceof Error
        ? err.message
        : "Không thể kết nối tới máy chủ dữ liệu sự kiện doanh nghiệp";
  }

  return {
    generatedAt,
    windowDays,
    since,
    asOf,
    stale,
    staleByDays,
    typeFilter,
    events,
    byType,
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
  const daysParam = url.searchParams.get("days");
  const days = clampDays(daysParam);

  const data = await fetchCorporateEventsData(origin, days);
  return json<LoaderData>(data);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Category badge */
function CategoryBadge({ category, label }: { category: string; label: string }) {
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${categoryColorClass(category)}`}
    >
      {label}
    </span>
  );
}

/** Lookback window day-selector — SSR round-trip via anchor links */
function DaysSelector({
  windowDays,
  currentPath,
}: {
  windowDays: number;
  currentPath: string;
}) {
  // Strip existing ?days= param from path so we can attach fresh values.
  const basePath = currentPath.split("?")[0] ?? currentPath;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-slate-400">Khoảng thời gian:</span>
      {ALLOWED_DAYS_VALUES.map((d) => {
        const isSelected = d === windowDays;
        const href = `${basePath}?days=${d}`;
        return (
          <Link
            key={d}
            to={href}
            className={[
              "rounded px-3 py-1 text-sm font-medium transition-colors",
              isSelected
                ? "bg-slate-600 text-slate-100"
                : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200",
            ].join(" ")}
            aria-current={isSelected ? "page" : undefined}
          >
            {d} ngày
          </Link>
        );
      })}
    </div>
  );
}

/** byType breakdown row */
function ByTypeRow({ entry }: { entry: ByTypeEntry }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-slate-700 last:border-0 py-1.5 px-3">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs text-slate-300 truncate">
          {entry.categoryLabel}
        </span>
        <span className="text-[10px] text-slate-600 font-mono truncate">
          ({entry.eventType})
        </span>
      </div>
      <span className="text-xs font-semibold tabular-nums text-slate-200 shrink-0">
        {entry.count}
      </span>
    </div>
  );
}

/** One event row in the event list */
function EventRow({ event }: { event: CorporateEvent }) {
  return (
    <div className="border-b border-slate-700 last:border-0 px-4 py-3 flex items-start gap-3">
      {/* Code badge */}
      <span className="inline-block shrink-0 rounded bg-slate-700 px-2 py-0.5 text-xs font-mono font-bold text-slate-200 mt-0.5">
        {event.code}
      </span>
      {/* Category badge */}
      <div className="shrink-0 mt-0.5">
        <CategoryBadge category={event.category} label={event.categoryLabel} />
      </div>
      {/* Detail / title text */}
      <p className="flex-1 text-sm text-slate-200 leading-relaxed min-w-0">
        {event.detail || event.title}
      </p>
      {/* eventDate — right-aligned */}
      <span className="shrink-0 text-xs tabular-nums text-slate-500 whitespace-nowrap mt-0.5">
        {event.eventDate}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CorporateEventsPage() {
  const {
    windowDays,
    since,
    asOf,
    stale,
    staleByDays,
    events,
    byType,
    summary,
    count,
    error,
  } = useLoaderData<typeof loader>();

  const { pathname, search } = useLocation();
  const currentPath = pathname + search;

  // Client-side category filter state — does NOT trigger SSR round-trip.
  const [activeCategory, setActiveCategory] = useState<EventCategory | "all">("all");

  const isEmpty = !error && count === 0;

  // Apply client-side category filter.
  const filteredEvents = filterEvents(events, activeCategory);

  // Category filter counts from summary (server-computed).
  const categoryCounts: Record<EventCategory | "all", number> = {
    all: summary.totalEvents,
    dividend: summary.dividend,
    issuance: summary.issuance,
    insider: summary.insider,
    meeting: summary.meeting,
    other: summary.other,
  };

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Sự kiện doanh nghiệp gần đây"
        subtitle={
          `Hoạt động đã công bố trong ${windowDays} ngày gần đây` +
          (since ? ` (từ ${since}` + (asOf ? ` đến ${asOf})` : ")") : "")
        }
        actions={
          <span className="text-xs text-slate-500 text-right">
            {summary.distinctCodes > 0 && (
              <span className="block font-medium text-slate-300">
                {summary.distinctCodes} mã · {summary.totalEvents} sự kiện
              </span>
            )}
            {asOf && (
              <span className="block text-slate-600">
                Cập nhật tới: {asOf}
              </span>
            )}
          </span>
        }
      />

      {/* Lookback window selector */}
      <DaysSelector windowDays={windowDays} currentPath={currentPath} />

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="rounded border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-300"
        >
          Không thể tải dữ liệu sự kiện doanh nghiệp — {error}
        </div>
      )}

      {/* Stale data warning banner */}
      {!error && stale && (
        <div
          role="status"
          className="rounded border border-amber-700 bg-amber-950 px-4 py-3 text-sm text-amber-300"
        >
          Dữ liệu đã cũ {staleByDays} ngày — có thể không cập nhật
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="rounded-lg border border-slate-700 bg-slate-800 px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-400">
            Không có sự kiện trong khoảng thời gian này
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Thử mở rộng khoảng thời gian bằng bộ chọn phía trên.
          </p>
        </div>
      )}

      {/* Main content — only shown when no error and data present */}
      {!error && !isEmpty && (
        <>
          {/* byType breakdown */}
          {byType.length > 0 && (
            <div className="rounded-lg border border-slate-700 bg-slate-900">
              <p className="px-3 pt-2.5 pb-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                Phân loại sự kiện
              </p>
              {byType.map((entry) => (
                <ByTypeRow key={entry.eventType} entry={entry} />
              ))}
            </div>
          )}

          {/* topActiveCodes chips */}
          {summary.topActiveCodes.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                Mã hoạt động nhiều nhất
              </p>
              <div className="flex flex-wrap gap-2">
                {summary.topActiveCodes.map(({ code, count: c }) => (
                  <span
                    key={code}
                    className="inline-flex items-center gap-1 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs"
                  >
                    <span className="font-mono font-semibold text-slate-200">
                      {code}
                    </span>
                    <span className="tabular-nums text-slate-500">{c}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Category filter tabs — CLIENT-SIDE */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-slate-400 mr-1">
              Lọc:
            </span>
            {CATEGORY_FILTER_OPTIONS.map(({ value, label }) => {
              const isActive = activeCategory === value;
              const c = categoryCounts[value];
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setActiveCategory(value)}
                  className={[
                    "inline-flex items-center gap-1 rounded px-3 py-1 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-slate-600 text-slate-100"
                      : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200",
                  ].join(" ")}
                  aria-pressed={isActive}
                >
                  {label}
                  {c > 0 && (
                    <span
                      className={`tabular-nums text-xs ${isActive ? "text-slate-300" : "text-slate-600"}`}
                    >
                      {c}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Event list */}
          {filteredEvents.length > 0 ? (
            <div className="rounded-lg border border-slate-700 bg-slate-800">
              {filteredEvents.map((event, idx) => (
                <EventRow key={`${event.code}-${event.eventType}-${event.eventDate}-${idx}`} event={event} />
              ))}
            </div>
          ) : (
            /* Empty filtered state */
            <div className="rounded-lg border border-slate-700 bg-slate-800 px-6 py-8 text-center">
              <p className="text-sm font-medium text-slate-400">
                Không có sự kiện trong danh mục này.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
