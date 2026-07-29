/**
 * CorporateEventsZone — stock-scoped corporate events panel.
 *
 * Fetches the full corporate events universe from /api/corporate-events client-side
 * (via Remix useFetcher → api.corporate-events.tsx proxy → mcp-server :3000).
 * No per-stock server param exists — filtering is CLIENT-SIDE on event.code field.
 *
 * Usage (in /dashboard/analysis or any AnalysisHub zone host):
 *   <CorporateEventsZone stock="VCB" />
 *
 * Props:
 *   stock: string — UPPERCASE stock ticker code matching event.code in the payload.
 *
 * Named exports for unit tests (Remix loader-strip bypass pattern):
 *   filterStockEvents(events, stock) → CorporateEvent[]
 *   deriveSortedCategories(events) → string[]
 *
 * BACKWARD-LOOKING: source table has 0 future rows.
 * Do NOT label this "sắp tới" / "upcoming" / "lịch sự kiện".
 *
 * Sprint: FRONTEND-ANALYSIS-HUB-CONSOLIDATION
 * Task:   FE-AHUB-W2-CORPEVENTS-ZONE
 *
 * Decision journal (DJ-CORPZONE-1):
 *   Client-side filter on event.code chosen because api.corporate-events has
 *   no per-code query param. Fetches once on mount (full universe ~90 days),
 *   re-filters when stock prop changes — zero re-fetch overhead per tab switch.
 *   useFetcher preferred over useEffect+fetch to stay within Remix patterns
 *   and benefit from built-in state machine (idle → loading → idle).
 */
import { useEffect } from "react";
import { useFetcher } from "@remix-run/react";
import { FreshnessBadge } from "~/components/FreshnessBadge";
import {
  categoryColorClass,
  type CorporateEvent,
  type EventCategory,
} from "~/routes/dashboard.corporate-events";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CorporateEventsZoneProps {
  /** UPPERCASE stock ticker code, e.g. "VCB", "FPT". */
  stock: string;
}

/**
 * Minimal shape from the /api/corporate-events proxy response used by this zone.
 * (Subset of the full LoaderData to keep the dependency surface small.)
 */
interface FetcherData {
  events: CorporateEvent[];
  generatedAt: string;
  count: number;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Pure helpers — exported for unit tests (Remix-strip bypass pattern)
// ---------------------------------------------------------------------------

/**
 * filterStockEvents — filter events[] to rows where event.code === stock.
 * Client-side filter that replaces the missing per-code server param.
 * Case-sensitive: stock MUST be UPPERCASE to match API payload codes.
 */
export function filterStockEvents(
  events: CorporateEvent[],
  stock: string,
): CorporateEvent[] {
  return events.filter((e) => e.code === stock);
}

/**
 * deriveSortedCategories — extract distinct category values from the given
 * events and return them sorted A-Z.
 * Used to show a compact summary of what categories the stock has activity in.
 */
export function deriveSortedCategories(events: CorporateEvent[]): string[] {
  return [...new Set(events.map((e) => e.category))].sort();
}

// ---------------------------------------------------------------------------
// Sub-components (local — not exported)
// ---------------------------------------------------------------------------

/** Category badge — replicates the standalone page badge. */
function CategoryBadge({
  category,
  label,
}: {
  category: string;
  label: string;
}) {
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${categoryColorClass(category as EventCategory)}`}
    >
      {label}
    </span>
  );
}

/** One event row in the zone event list. */
function ZoneEventRow({ event }: { event: CorporateEvent }) {
  return (
    <div className="border-b border-slate-700 last:border-0 px-3 py-2.5 flex items-start gap-2.5">
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
// Component
// ---------------------------------------------------------------------------

/**
 * CorporateEventsZone — renders hoạt động gần đây (recent corporate activity)
 * for a single stock code. Fetches the full universe once on mount and filters
 * client-side. Safe to mount in any AnalysisHub zone host without SSR round-trips.
 */
export function CorporateEventsZone({ stock }: CorporateEventsZoneProps) {
  const fetcher = useFetcher<FetcherData>();

  // Load full universe once on mount. The filter is client-side on event.code.
  // Using deps [] intentionally: the full universe never changes per-stock;
  // filterStockEvents re-runs on each render when stock prop changes.
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data === undefined) {
      fetcher.load("/api/corporate-events?days=90");
    }
  }, []);

  const loading =
    fetcher.state === "loading" || fetcher.state === "submitting";
  const error = fetcher.data?.error ?? null;
  const allEvents: CorporateEvent[] = fetcher.data?.events ?? [];
  const generatedAt = fetcher.data?.generatedAt ?? null;

  // Client-side filter — the key operation of this zone.
  const stockEvents = filterStockEvents(allEvents, stock);

  // ---------------------------------------------------------------------------
  // Render states
  // ---------------------------------------------------------------------------

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900">
      {/* Zone header */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-2 border-b border-slate-700">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
          Sự kiện doanh nghiệp
        </p>
        {generatedAt && (
          <FreshnessBadge dataAsof={generatedAt} slaTierKey="weekly" />
        )}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="px-3 py-4">
          <div className="animate-pulse space-y-2">
            <div className="h-3 rounded bg-slate-700 w-3/4" />
            <div className="h-3 rounded bg-slate-700 w-1/2" />
            <div className="h-3 rounded bg-slate-700 w-5/6" />
          </div>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div
          role="alert"
          className="px-3 py-3 text-xs text-red-300 bg-red-950 border-t border-red-800"
        >
          Không thể tải dữ liệu — {error}
        </div>
      )}

      {/* Initial/idle state before first fetch completes */}
      {!loading && !error && fetcher.data === undefined && (
        <div className="px-3 py-4">
          <div className="animate-pulse space-y-2">
            <div className="h-3 rounded bg-slate-700 w-2/3" />
            <div className="h-3 rounded bg-slate-700 w-1/2" />
          </div>
        </div>
      )}

      {/* Empty state — data loaded but no events for this stock */}
      {!loading && !error && fetcher.data !== undefined && stockEvents.length === 0 && (
        <div className="px-3 py-6 text-center">
          <p className="text-sm text-slate-500">
            Không có sự kiện gần đây cho <span className="font-mono font-semibold text-slate-400">{stock}</span>
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Trong 90 ngày gần đây
          </p>
        </div>
      )}

      {/* Event list */}
      {!loading && !error && stockEvents.length > 0 && (
        <>
          {/* Stock event count summary */}
          <div className="px-3 py-1.5 border-b border-slate-700">
            <span className="text-xs text-slate-500">
              <span className="font-mono font-semibold text-slate-300">{stock}</span>
              {" · "}{stockEvents.length} sự kiện trong 90 ngày gần đây
            </span>
          </div>
          {/* Event rows */}
          {stockEvents.map((event, idx) => (
            <ZoneEventRow
              key={`${event.code}-${event.eventType}-${event.eventDate}-${idx}`}
              event={event}
            />
          ))}
        </>
      )}
    </div>
  );
}
