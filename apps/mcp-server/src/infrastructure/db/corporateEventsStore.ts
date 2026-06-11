/**
 * corporateEventsStore.ts
 *
 * Read-only infrastructure store for the `vnstock_events` table.
 * Part of the TASK17-PAGE13 endpoint wave (GET /api/corporate-events).
 *
 * Table: vnstock_events
 *   id INTEGER PK, code TEXT NOT NULL, event_name TEXT NOT NULL,
 *   event_date TEXT NOT NULL,     -- "YYYY-MM-DD" (string-comparable)
 *   event_type TEXT NOT NULL, description TEXT, fetched_at TEXT,
 *   UNIQUE(code, event_name, event_date)
 *
 * Live stats (probed 2026-06-11 against named-volume DB):
 *   2603 rows, 53 distinct codes, span 2013-06-07 → 2026-06-08
 *   81 events last-30d, 242 last-90d, 841 last-365d
 *   0 future rows — backward-looking recent-activity monitor only.
 *
 * event_type taxonomy (counts):
 *   DDIND 706, DDINS 690, AGME 288, ISS 255, DDRP 213, DIV 203,
 *   AIS 134, EGME 54, OTHE 35, AGMR 7, SUSP 6, NLIS 6
 *
 * Layer: infrastructure/db — no domain imports.
 * All queries use parameterized bindings — NEVER string-interpolate user input.
 *
 * @module infrastructure/db/corporateEventsStore
 */

import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single row from vnstock_events (selected columns only — id/fetched_at excluded).
 */
export type CorporateEventRow = {
  code: string;
  event_name: string;
  event_date: string;
  event_type: string;
  description: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Read helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return all corporate events with event_date >= sinceDate, ordered by
 * event_date DESC, code ASC. A LIMIT is applied to guard against huge result sets.
 *
 * @param db        - SQLite database instance (injected)
 * @param sinceDate - "YYYY-MM-DD" lower bound (parameterized — no interpolation)
 * @param limit     - Maximum row count (caller default 5000)
 * @returns Array of CorporateEventRow
 */
export function getEventsSince(
  db: Database,
  sinceDate: string,
  limit = 5000,
): CorporateEventRow[] {
  const rows = db
    .prepare(
      `SELECT code, event_name, event_date, event_type, description
       FROM vnstock_events
       WHERE event_date >= ?
       ORDER BY event_date DESC, code ASC
       LIMIT ?`,
    )
    .all(sinceDate, limit) as CorporateEventRow[];
  return rows;
}

/**
 * Return corporate events filtered by event_type AND event_date >= sinceDate.
 * Used when ?type= query param is present and maps to a known event_type.
 *
 * @param db        - SQLite database instance (injected)
 * @param sinceDate - "YYYY-MM-DD" lower bound (parameterized)
 * @param eventType - event_type value to filter on (parameterized)
 * @param limit     - Maximum row count (caller default 5000)
 * @returns Array of CorporateEventRow matching the type filter
 */
export function getEventsSinceByType(
  db: Database,
  sinceDate: string,
  eventType: string,
  limit = 5000,
): CorporateEventRow[] {
  const rows = db
    .prepare(
      `SELECT code, event_name, event_date, event_type, description
       FROM vnstock_events
       WHERE event_date >= ? AND event_type = ?
       ORDER BY event_date DESC, code ASC
       LIMIT ?`,
    )
    .all(sinceDate, eventType, limit) as CorporateEventRow[];
  return rows;
}
