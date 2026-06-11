/**
 * corporateEventsHandler.ts — GET /api/corporate-events
 *
 * TASK17-PAGE13 endpoint:
 * Serve "Sự kiện doanh nghiệp gần đây" (Recent Corporate Actions Monitor).
 * Backward-looking activity monitor for corporate events in the vnstock_events table.
 * 0 future rows in source table — do NOT imply upcoming events.
 *
 * Source table: vnstock_events (stored-data-only; NO live network calls).
 * Read path: corporateEventsStore (infrastructure) — no SQL in this handler.
 * This handler ONLY maps + aggregates — db injected by server.ts.
 *
 * Live contract (probed 2026-06-11 against named-volume DB):
 *   2603 rows, 53 distinct codes, span 2013-06-07 → 2026-06-08
 *   81 events last-30d, 242 last-90d, 841 last-365d
 *   event_name = English; description = Vietnamese translation (may be NULL/empty)
 *
 * Query params:
 *   ?days=N   — look-back window in days, default 90, clamp [7, 365]
 *   ?type=T   — optional event_type filter (e.g. "DIV", "AGME"); ignored if unknown
 *
 * Response shape (200 OK):
 *   {
 *     generatedAt:  string,       // ISO 8601 server clock
 *     windowDays:   number,       // clamped days param
 *     since:        string,       // "YYYY-MM-DD" lower bound used
 *     asOf:         string,       // max eventDate in window; "" when empty
 *     typeFilter:   string|null,  // applied ?type or null (none/unknown ignored)
 *     events:       EventItem[],  // sorted event_date DESC, code ASC
 *     byType:       ByTypeItem[], // [{eventType, categoryLabel, count}] desc by count
 *     summary:      EventSummary,
 *     count:        number        // events.length
 *   }
 *
 * 200 + empty arrays + zeroed summary when table has no rows in window (NO error).
 * 500 JSON {error:"db_error"} on DB error.
 *
 * DDD Layer: interface — db injected by server.ts (no getDb() here).
 * Imports ONLY from corporateEventsStore (infrastructure/db) — no domain imports.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import {
  getEventsSince,
  getEventsSinceByType,
  type CorporateEventRow,
} from "../../../infrastructure/db/corporateEventsStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_DAYS = 90;
const MIN_DAYS = 7;
const MAX_DAYS = 365;
const EVENTS_ROW_CAP = 5000;
const TOP_ACTIVE_CODES_CAP = 8;

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY_MAP — event_type → { category, categoryLabel }
// ─────────────────────────────────────────────────────────────────────────────

export type EventCategory = "dividend" | "issuance" | "insider" | "meeting" | "other";

export interface CategoryInfo {
  category: EventCategory;
  categoryLabel: string;
}

/** Map from event_type code → category metadata. */
export const CATEGORY_MAP: Record<string, CategoryInfo> = {
  DIV:   { category: "dividend",  categoryLabel: "Cổ tức tiền mặt" },
  ISS:   { category: "issuance",  categoryLabel: "Phát hành cổ phiếu" },
  AIS:   { category: "issuance",  categoryLabel: "Phát hành thêm" },
  NLIS:  { category: "issuance",  categoryLabel: "Niêm yết mới" },
  DDIND: { category: "insider",   categoryLabel: "Giao dịch cổ đông nội bộ" },
  DDINS: { category: "insider",   categoryLabel: "Giao dịch tổ chức liên quan" },
  DDRP:  { category: "insider",   categoryLabel: "Giao dịch người liên quan" },
  AGME:  { category: "meeting",   categoryLabel: "ĐHĐCĐ thường niên" },
  AGMR:  { category: "meeting",   categoryLabel: "Chốt quyền ĐHĐCĐ" },
  EGME:  { category: "meeting",   categoryLabel: "ĐHĐCĐ bất thường" },
  SUSP:  { category: "other",     categoryLabel: "Tạm ngừng giao dịch" },
  OTHE:  { category: "other",     categoryLabel: "Khác" },
};

/** The set of known event_type codes. */
export const KNOWN_EVENT_TYPES: ReadonlySet<string> = new Set(Object.keys(CATEGORY_MAP));

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** One event item in the response. */
export interface EventItem {
  code: string;
  eventType: string;
  category: EventCategory;
  categoryLabel: string;
  title: string;
  detail: string;
  eventDate: string;
}

/** One entry in byType breakdown. */
export interface ByTypeItem {
  eventType: string;
  categoryLabel: string;
  count: number;
}

/** Summary block. */
export interface EventSummary {
  totalEvents: number;
  distinctCodes: number;
  dividend: number;
  issuance: number;
  insider: number;
  meeting: number;
  other: number;
  topActiveCodes: { code: string; count: number }[];
}

/** Full response body for GET /api/corporate-events. */
export interface CorporateEventsResponse {
  generatedAt: string;
  windowDays: number;
  since: string;
  asOf: string;
  typeFilter: string | null;
  events: EventItem[];
  byType: ByTypeItem[];
  summary: EventSummary;
  count: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers — exported for unit testing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classify an event_type into category metadata via CATEGORY_MAP.
 * Unknown types fall back to { category: "other", categoryLabel: <raw type> }.
 *
 * @param eventType - Raw event_type string from the DB row
 * @returns CategoryInfo with category + categoryLabel
 */
export function classifyEvent(eventType: string): CategoryInfo {
  return CATEGORY_MAP[eventType] ?? { category: "other", categoryLabel: eventType };
}

/**
 * Pick the best human-readable detail string.
 * Returns description.trim() when it is non-null and non-empty, else eventName.
 *
 * @param description - Vietnamese description (may be null/empty)
 * @param eventName   - English event_name (always non-empty)
 * @returns Best available detail string
 */
export function pickDetail(description: string | null | undefined, eventName: string): string {
  if (description !== null && description !== undefined) {
    const trimmed = description.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return eventName;
}

/**
 * Map a DB row to an EventItem.
 *
 * @param row - CorporateEventRow from the store
 * @returns EventItem ready for the response
 */
export function mapRowToEvent(row: CorporateEventRow): EventItem {
  const { category, categoryLabel } = classifyEvent(row.event_type);
  return {
    code:          row.code,
    eventType:     row.event_type,
    category,
    categoryLabel,
    title:         row.event_name,
    detail:        pickDetail(row.description, row.event_name),
    eventDate:     row.event_date,
  };
}

/**
 * Build the byType breakdown from a list of EventItems.
 * Returns [{eventType, categoryLabel, count}] sorted descending by count.
 *
 * @param rows - Mapped EventItems
 * @returns ByTypeItem array sorted desc by count
 */
export function buildByType(rows: EventItem[]): ByTypeItem[] {
  const counts = new Map<string, { categoryLabel: string; count: number }>();
  for (const row of rows) {
    const entry = counts.get(row.eventType);
    if (entry) {
      entry.count++;
    } else {
      counts.set(row.eventType, { categoryLabel: row.categoryLabel, count: 1 });
    }
  }
  return Array.from(counts.entries())
    .map(([eventType, { categoryLabel, count }]) => ({ eventType, categoryLabel, count }))
    .sort((a, b) => b.count - a.count || a.eventType.localeCompare(b.eventType));
}

/**
 * Build the summary block from a list of EventItems.
 * Category counts, distinct codes, and top-active codes (≤8) desc by event count.
 *
 * @param rows - Mapped EventItems
 * @returns EventSummary
 */
export function buildSummary(rows: EventItem[]): EventSummary {
  let dividend = 0;
  let issuance = 0;
  let insider  = 0;
  let meeting  = 0;
  let other    = 0;

  const codeCount = new Map<string, number>();

  for (const row of rows) {
    switch (row.category) {
      case "dividend":  dividend++;  break;
      case "issuance":  issuance++;  break;
      case "insider":   insider++;   break;
      case "meeting":   meeting++;   break;
      default:          other++;     break;
    }
    codeCount.set(row.code, (codeCount.get(row.code) ?? 0) + 1);
  }

  const topActiveCodes = Array.from(codeCount.entries())
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
    .slice(0, TOP_ACTIVE_CODES_CAP);

  return {
    totalEvents:    rows.length,
    distinctCodes:  codeCount.size,
    dividend,
    issuance,
    insider,
    meeting,
    other,
    topActiveCodes,
  };
}

/**
 * Compute the "since" date by subtracting `days` from the nowIso timestamp.
 * Returns only the "YYYY-MM-DD" portion (floor) — pure/testable.
 *
 * @param nowIso - ISO 8601 date or datetime string (e.g. new Date().toISOString())
 * @param days   - Number of days to subtract
 * @returns "YYYY-MM-DD" string for the lower bound
 */
export function computeSinceDate(nowIso: string, days: number): string {
  const d = new Date(nowIso);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle GET /api/corporate-events.
 *
 * @param req - Incoming HTTP request (reads ?days= and ?type= query params)
 * @param res - HTTP response
 * @param db  - SQLite database instance (injected by server.ts)
 */
export function handleGetCorporateEvents(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
): void {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");

    // Parse ?days= param — default 90, clamp [7, 365]
    const daysParam = url.searchParams.get("days");
    const daysParsed = daysParam !== null ? parseInt(daysParam, 10) : NaN;
    const daysBase = isNaN(daysParsed) ? DEFAULT_DAYS : daysParsed;
    const windowDays = Math.min(MAX_DAYS, Math.max(MIN_DAYS, daysBase));

    // Parse ?type= param — only accepted if it is a known event_type
    const typeParam = url.searchParams.get("type");
    const typeFilter: string | null =
      typeParam !== null && KNOWN_EVENT_TYPES.has(typeParam) ? typeParam : null;

    // Compute since date
    const since = computeSinceDate(new Date().toISOString(), windowDays);

    // ── Read from store ──────────────────────────────────────────────────────
    let rawRows: CorporateEventRow[];
    if (typeFilter !== null) {
      rawRows = getEventsSinceByType(db, since, typeFilter, EVENTS_ROW_CAP);
    } else {
      rawRows = getEventsSince(db, since, EVENTS_ROW_CAP);
    }

    // 200-on-empty: when no rows, return zeroed envelope
    if (rawRows.length === 0) {
      const emptyBody: CorporateEventsResponse = {
        generatedAt: new Date().toISOString(),
        windowDays,
        since,
        asOf: "",
        typeFilter,
        events:  [],
        byType:  [],
        summary: {
          totalEvents:   0,
          distinctCodes: 0,
          dividend:      0,
          issuance:      0,
          insider:       0,
          meeting:       0,
          other:         0,
          topActiveCodes: [],
        },
        count: 0,
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(emptyBody));
      return;
    }

    // ── Map rows → EventItems (store returns ORDER BY event_date DESC, code ASC) ─
    const events: EventItem[] = rawRows.map(mapRowToEvent);

    // asOf = max eventDate (first item in DESC order)
    const asOf = events[0]?.eventDate ?? "";

    // ── Build byType + summary ───────────────────────────────────────────────
    const byType  = buildByType(events);
    const summary = buildSummary(events);

    const body: CorporateEventsResponse = {
      generatedAt: new Date().toISOString(),
      windowDays,
      since,
      asOf,
      typeFilter,
      events,
      byType,
      summary,
      count: events.length,
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "db_error",
        detail: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
