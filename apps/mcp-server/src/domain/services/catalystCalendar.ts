/**
 * Domain — Catalyst Calendar
 *
 * Aggregates upcoming corporate events (vnstock) and BCTC filing deadlines
 * into a unified CatalystEvent list within a configurable look-ahead window.
 *
 * Price impact heuristics:
 *   - dividend      → positive (income for shareholders)
 *   - agm           → neutral  (governance, sometimes surprises)
 *   - share_issuance→ negative (dilutive)
 *   - bctc_deadline → neutral  (disclosure event, impact depends on results)
 *   - other         → neutral
 *
 * Layer: domain/services (pure — no I/O)
 */

import type { VnstockEvent } from "../models/shared-types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CatalystEventType =
  | "dividend"
  | "agm"
  | "share_issuance"
  | "bctc_deadline"
  | "other";

export type PriceImpact = "positive" | "negative" | "neutral";

export interface CatalystEvent {
  code: string;
  eventType: CatalystEventType;
  eventDate: string;
  daysUntil: number;
  description: string;
  priceImpact: PriceImpact;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_WINDOW_DAYS = 30;

// Map known vnstock eventType strings to our canonical types (case-insensitive)
const EVENT_TYPE_MAP: Record<string, CatalystEventType> = {
  dividend: "dividend",
  "cash dividend": "dividend",
  "stock dividend": "dividend",
  "chia co tuc": "dividend",
  "cổ tức": "dividend",

  agm: "agm",
  "annual general meeting": "agm",
  "đại hội cổ đông": "agm",
  "đhcd": "agm",
  "đại hội đồng cổ đông": "agm",

  "share issuance": "share_issuance",
  "rights issue": "share_issuance",
  "stock issuance": "share_issuance",
  "phát hành thêm": "share_issuance",
};

const IMPACT_MAP: Record<CatalystEventType, PriceImpact> = {
  dividend: "positive",
  agm: "neutral",
  share_issuance: "negative",
  bctc_deadline: "neutral",
  other: "neutral",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

function normalizeEventType(raw: string): CatalystEventType {
  const key = raw.toLowerCase().trim();
  return EVENT_TYPE_MAP[key] ?? "other";
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Get all upcoming catalyst events within a look-ahead window.
 *
 * @param events        - Raw events from vnstock (any dates)
 * @param bctcDeadlines - BCTC filing deadline list from earningsCalendar
 * @param today         - ISO date string for "today" (for testability)
 * @param windowDays    - Look-ahead window in days (default: 30)
 * @returns Sorted list of upcoming CatalystEvent objects (ascending daysUntil)
 */
export function getUpcomingCatalysts(
  events: VnstockEvent[],
  bctcDeadlines: Array<{ code: string; deadline: string }>,
  today: string,
  windowDays = DEFAULT_WINDOW_DAYS,
): CatalystEvent[] {
  const result: CatalystEvent[] = [];

  // Process vnstock corporate events
  for (const ev of events) {
    const daysUntil = daysBetween(today, ev.eventDate);
    if (daysUntil < 0 || daysUntil > windowDays) continue;

    const eventType = normalizeEventType(ev.eventType);
    result.push({
      code: ev.code,
      eventType,
      eventDate: ev.eventDate,
      daysUntil,
      description: ev.description || ev.eventName,
      priceImpact: IMPACT_MAP[eventType],
    });
  }

  // Process BCTC deadlines
  for (const bctc of bctcDeadlines) {
    const daysUntil = daysBetween(today, bctc.deadline);
    if (daysUntil < 0 || daysUntil > windowDays) continue;

    result.push({
      code: bctc.code,
      eventType: "bctc_deadline",
      eventDate: bctc.deadline,
      daysUntil,
      description: `BCTC filing deadline`,
      priceImpact: "neutral",
    });
  }

  // Sort by daysUntil ascending
  result.sort((a, b) => a.daysUntil - b.daysUntil);

  return result;
}
