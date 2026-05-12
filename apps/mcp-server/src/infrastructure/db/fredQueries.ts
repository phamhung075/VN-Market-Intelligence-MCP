/**
 * FRED DB query helpers — Task 1879b
 *
 * Provides typed query helpers over the `fred_series_daily` table,
 * which stores daily EFFR and IORB values fetched from the FRED API.
 *
 * Schema (owned by schema-macro.ts / 1879a):
 *   fred_series_daily(id, series TEXT, date TEXT, value REAL, fetched_at TEXT)
 *   UNIQUE(series, date)
 *
 * @module infrastructure/db/fredQueries
 */

import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface EffrIorbRow {
  date: string;
  effr: number;
  iorb: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Query
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch paired EFFR + IORB rows for the last `days` calendar days.
 *
 * Uses an INNER JOIN on date to ensure both series are present for the same date.
 * Rows are returned in ASC date order (oldest first).
 *
 * @param db    Bun SQLite Database instance (caller owns lifecycle).
 * @param days  Lookback window in calendar days (default 60).
 * @returns     Array of { date, effr, iorb } sorted ascending.
 */
export function fetchEffrIorbSamples(
  db: Database,
  days: number = 60,
): EffrIorbRow[] {
  const rows = db
    .prepare<EffrIorbRow, [number]>(
      `SELECT
         a.date,
         a.value AS effr,
         b.value AS iorb
       FROM fred_series_daily a
       INNER JOIN fred_series_daily b
         ON a.date = b.date
       WHERE a.series = 'EFFR'
         AND b.series = 'IORB'
         AND a.date >= date('now', '-' || ? || ' days')
       ORDER BY a.date ASC`,
    )
    .all(days);

  return rows;
}
