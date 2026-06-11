/**
 * sectorRotationStore.ts
 *
 * Read-only infrastructure store for sector rotation data.
 * Part of the TASK-17 PAGE 9 endpoint wave (GET /api/sector-rotation).
 *
 * Three read helpers — SQL only, no business logic, all params bound with ?:
 *   - getWatchlistSectorMap(db)     → watchlist rows {code, domain, exchange}
 *   - getCurrentPrices(db)          → market_prices rows {code, price, change_pct, updated_at}
 *   - getHistoricalBaseline(db, N)  → per-code oldest price in [now-7d, now-4d] window
 *
 * Live DB shape (probed 2026-06-11):
 *   watchlist:              41 codes, columns (code, domain, exchange)
 *   market_prices:          121 rows, change_pct authoritative 1d %, updated_at 2026-06-11T12:00
 *   market_prices_history:  columns (code, price, volume, fetched_at, exchange)
 *                           PK (code, fetched_at); only 2 trading days deep (2026-06-10→06-11)
 *                           price5dAgo = null for ALL codes today (graceful degradation)
 *
 * Layer: infrastructure/db — no domain imports.
 * All queries use parameterized bindings — never string-interpolate user input.
 *
 * @module infrastructure/db/sectorRotationStore
 */

import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One row from the watchlist table.
 * Provides the sector assignment (domain column) for each stock code.
 */
export type WatchlistSectorRow = {
  code: string;
  domain: string;
  exchange: string;
};

/**
 * One row from market_prices for sector rotation computation.
 * change_pct is the authoritative 1-day % change (same field get_sector_comparison reads).
 */
export type CurrentPriceRow = {
  code: string;
  price: number;
  change_pct: number | null;
  updated_at: string;
};

/**
 * Per-code 5-day-ago price baseline.
 * price5dAgo is null when no history row falls in the [now-7d, now-4d] window.
 * This is the EXPECTED case while market_prices_history is only 2 trading days deep.
 */
export type HistoricalBaselineRow = {
  code: string;
  price5dAgo: number | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Read helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return all rows from the watchlist table.
 * Used to build the codeSectorOverride map (UPPER(code)→domain) so that all
 * 41 watchlist codes are correctly classified even if not in SECTOR_PEERS.
 *
 * @param db - SQLite database instance (injected)
 * @returns All watchlist rows, ordered by code ASC.
 */
export function getWatchlistSectorMap(db: Database): WatchlistSectorRow[] {
  const rows = db
    .prepare(
      `SELECT code, domain, exchange
       FROM watchlist
       ORDER BY code ASC`,
    )
    .all() as WatchlistSectorRow[];
  return rows;
}

/**
 * Return all market_prices rows that have a non-null price.
 * change_pct is the pre-computed 1d % — same authoritative source as
 * get_sector_comparison so both tools agree on the same number.
 *
 * @param db - SQLite database instance (injected)
 * @returns Rows ordered by code ASC.
 */
export function getCurrentPrices(db: Database): CurrentPriceRow[] {
  const rows = db
    .prepare(
      `SELECT code, price, change_pct, updated_at
       FROM market_prices
       WHERE price IS NOT NULL
       ORDER BY code ASC`,
    )
    .all() as CurrentPriceRow[];
  return rows;
}

/**
 * For each code in market_prices (with a non-null price), find the OLDEST
 * price within the window [now - lookbackDays - 3, now - lookbackDays + 3]
 * (a ±3-day tolerance around the ~5-trading-day-ago snapshot).
 *
 * Window bounds are parameterized (no string interpolation).
 * Returns {code, price5dAgo} for every code — price5dAgo is null when no
 * history row falls in the window (the common case while history is only 2
 * trading days deep).
 *
 * As history deepens over coming trading days, this auto-upgrades without
 * any code change: the subquery simply finds the oldest row in the window.
 *
 * @param db          - SQLite database instance (injected)
 * @param lookbackDays - Number of calendar days to look back (default 5)
 * @param now          - Optional clock override for testability (defaults to new Date())
 * @returns Array of {code, price5dAgo} for all codes in market_prices.
 */
export function getHistoricalBaseline(
  db: Database,
  lookbackDays = 5,
  now: Date = new Date(),
): HistoricalBaselineRow[] {
  // Window: [now - (lookbackDays + 3) days, now - (lookbackDays - 3) days]
  // This is a ±3-calendar-day tolerance around the target baseline date.
  // Parameterize both bounds to avoid any string interpolation of user input.
  const toleranceDays = 3;
  const windowStartMs = now.getTime() - (lookbackDays + toleranceDays) * 24 * 60 * 60 * 1000;
  const windowEndMs = now.getTime() - (lookbackDays - toleranceDays) * 24 * 60 * 60 * 1000;

  // ISO 8601 strings for SQLite datetime comparison
  const windowStart = new Date(windowStartMs).toISOString();
  const windowEnd = new Date(windowEndMs).toISOString();

  // Left join: every code in market_prices appears in the result.
  // The correlated subquery picks the OLDEST price in the window per code.
  // COALESCE preserves NULL when no window row exists (expected in early history).
  const rows = db
    .prepare(
      `SELECT
         mp.code,
         (
           SELECT h.price
           FROM market_prices_history h
           WHERE h.code = mp.code
             AND h.fetched_at >= ?
             AND h.fetched_at <= ?
           ORDER BY h.fetched_at ASC
           LIMIT 1
         ) AS price5dAgo
       FROM market_prices mp
       WHERE mp.price IS NOT NULL
       ORDER BY mp.code ASC`,
    )
    .all(windowStart, windowEnd) as HistoricalBaselineRow[];

  return rows;
}
