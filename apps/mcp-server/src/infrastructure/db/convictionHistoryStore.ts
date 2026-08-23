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
 * FIX-GHOSTZONE-CONVICTION-ASC-LIMIT-TRUNCATES-NEWEST (2026-08-23): the store
 * selects the NEWEST `limit` rows by date, never the first `limit` rows in
 * table order — growth of the underlying table does NOT require raising
 * `limit` to keep serving fresh data; only the OLDEST edge of the window
 * moves as new rows are written. The row-count bound stays absolute (matches
 * the client-facing `?limit=` contract, clamped [1, 2000] by the handler) —
 * it does NOT auto-widen to a calendar-day window (see architect brownfield
 * findings, FIX-GHOSTZONE-CONVICTION-ASC-LIMIT-TRUNCATES-NEWEST-BA-spec.md
 * NFR-2, for why a calendar-day window was rejected).
 *
 * Prior bug (root cause, live 2026-08-22): a flat `ORDER BY date ASC LIMIT ?`
 * keeps the OLDEST `limit` rows once the table outgrows `limit` — table grew
 * 766 -> 3942 rows since the 2026-06-11 snapshot below, silently freezing
 * `tradingDate` 64 days stale for every ticker while the writer stayed
 * healthy (33-34 rows/day). Fixed via a two-stage SQL wrap: inner
 * `ORDER BY date DESC LIMIT ?` selects the newest rows, outer
 * `ORDER BY date ASC` restores the RETURN CONTRACT below — the caller
 * (convictionHistoryHandler.ts) depends on ASC input for BOTH
 * `buildSnapshot()`'s per-symbol last-write-wins AND `buildSeries()`'s
 * append-in-received-order sparkline — a raw DESC-only flip (no outer
 * re-wrap) would silently corrupt every symbol's snapshot to its OLDEST
 * score within the window. Do not remove the outer ASC wrap.
 *
 * Historical stats (probed 2026-06-11 against named-volume DB, now stale —
 * kept only as a growth-rate reference point, NOT a "well within cap"
 * claim — that exact framing is what let the truncation regress silently):
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
 * Return the NEWEST `limit` rows from conviction_history, returned ASC by
 * date then symbol (return contract unchanged — see FIX-GHOSTZONE-CONVICTION-
 * ASC-LIMIT-TRUNCATES-NEWEST above; callers depend on ASC input).
 *
 * Two-stage SQL: inner query selects the newest `limit` rows by date
 * (DESC + LIMIT), outer query re-sorts that selected set ASC by (date,
 * symbol) before it reaches the caller. This keeps "which rows are in the
 * window" driven by recency while keeping "what order they arrive in"
 * unchanged from the original contract — a pure adapter (SQL) swap, zero
 * caller-side change.
 *
 * @param db    - SQLite database instance (injected)
 * @param limit - Max rows to return (default 2000, clamped to [1, 2000] by caller)
 * @returns The newest `limit` conviction_history rows, ASC by (date, symbol)
 */
export function getConvictionHistoryRows(
  db: Database,
  limit = 2000,
): ConvictionRow[] {
  const rows = db
    .prepare(
      `SELECT symbol, date, peak_score, dominant_signal, created_at
       FROM (
         SELECT symbol, date, peak_score, dominant_signal, created_at
         FROM conviction_history
         ORDER BY date DESC, symbol ASC
         LIMIT ?
       )
       ORDER BY date ASC, symbol ASC`,
    )
    .all(limit) as ConvictionRow[];
  return rows;
}
