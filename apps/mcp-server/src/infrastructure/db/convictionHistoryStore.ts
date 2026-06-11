/**
 * convictionHistoryStore.ts
 *
 * Read-only infrastructure store for the `conviction_history` table.
 * Part of the TASK17-CONVICTION endpoint wave.
 *
 * Table: conviction_history
 *   id INTEGER PRIMARY KEY AUTOINCREMENT
 *   symbol TEXT NOT NULL
 *   date TEXT NOT NULL               -- "YYYY-MM-DD"
 *   peak_score REAL NOT NULL         -- 0.0–1.0 (live range 0.4–0.73)
 *   dominant_signal TEXT             -- NULLABLE: 'bullish' | 'bearish' | 'neutral' | NULL
 *   created_at TEXT NOT NULL         -- ISO8601
 *   UNIQUE INDEX (symbol, date)
 *
 * Live stats (probed 2026-06-11 against named-volume DB):
 *   766 rows, 52 symbols, span 2026-04-01→2026-06-09
 *   peak_score 0.4–0.73
 *   signal distribution: bearish=291 / neutral=286 / bullish=189 / NULL=unknown
 *
 * Layer: infrastructure/db — no domain imports.
 * All queries use parameterized bindings — never string-interpolate user input.
 *
 * @module infrastructure/db/convictionHistoryStore
 */

import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One row from the conviction_history table.
 * dominant_signal is nullable — do NOT coerce NULL to any sentinel value here;
 * the handler is responsible for the "unknown" mapping.
 */
export type ConvictionRow = {
  symbol: string;
  date: string;
  peak_score: number;
  dominant_signal: string | null;
  created_at: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Read helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return all rows from conviction_history, ordered ASC by date then symbol.
 * ORDER BY date ASC, symbol ASC ensures stable sparkline series for the frontend.
 *
 * @param db    - SQLite database instance (injected)
 * @param limit - Max rows to return (default 2000, clamped to [1, 2000] by caller)
 * @returns All conviction_history rows (766 live — well within the default cap)
 */
export function getConvictionHistoryRows(
  db: Database,
  limit = 2000,
): ConvictionRow[] {
  const rows = db
    .prepare(
      `SELECT symbol, date, peak_score, dominant_signal, created_at
       FROM conviction_history
       ORDER BY date ASC, symbol ASC
       LIMIT ?`,
    )
    .all(limit) as ConvictionRow[];
  return rows;
}
