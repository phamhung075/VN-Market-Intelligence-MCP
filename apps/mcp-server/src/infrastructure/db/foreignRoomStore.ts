/**
 * Infrastructure — Foreign Room Store (P0-2-FOREIGN-ROOM-SUITE)
 *
 * Read-side queries on `vnstock_trading_stats` and `foreign_room_events`.
 * Write-side: event upsert helper (used by vnstockFundamentalsJob after sweep).
 *
 * Single writer: mcp-server (market.db). dev-stock-price has ZERO code here.
 *
 * DDD layer: infrastructure/db — may use Database, no domain imports.
 *
 * @module infrastructure/db/foreignRoomStore
 */

import type { Database } from "bun:sqlite";
import type { TradingStatsRow } from "../../domain/services/market-data/foreignRoomAnalyzer.js";

// ---------------------------------------------------------------------------
// Shape types for raw DB rows
// ---------------------------------------------------------------------------

interface RawTradingStatsRow {
  code: string;
  date: string;
  foreign_room: number | null;
  foreign_volume: number | null;
  current_holding_ratio: number | null;
  max_holding_ratio: number | null;
  market_cap_bn: number | null;
}

interface RawEventRow {
  event_type: 'ROOM_FULL' | 'ROOM_REOPEN';
  event_date: string;
  room_remaining_before: number | null;
  room_remaining_after: number | null;
}

interface RawLastEventRow {
  code: string;
  event_type: 'ROOM_FULL' | 'ROOM_REOPEN';
  event_date: string;
}

// ---------------------------------------------------------------------------
// Read: per-ticker history
// ---------------------------------------------------------------------------

/**
 * Return the last `limit` trading stats rows for a ticker, sorted DESC.
 * Returns [] when the ticker has no rows.
 */
export function getTickerHistory(
  db: Database,
  code: string,
  limit = 20,
): TradingStatsRow[] {
  return db
    .prepare<RawTradingStatsRow, [string, number]>(
      `SELECT code, date, foreign_room, foreign_volume,
              current_holding_ratio, max_holding_ratio, market_cap_bn
       FROM vnstock_trading_stats
       WHERE code = ?
       ORDER BY date DESC
       LIMIT ?`,
    )
    .all(code, limit) as TradingStatsRow[];
}

/**
 * Return the latest single row for each distinct code, today's snapshot.
 * Also returns the last N rows per ticker for velocity computation.
 */
export function getAllTickersLatestRows(
  db: Database,
): TradingStatsRow[] {
  // Latest row per ticker
  return db
    .prepare<RawTradingStatsRow, []>(
      `SELECT t.code, t.date, t.foreign_room, t.foreign_volume,
              t.current_holding_ratio, t.max_holding_ratio, t.market_cap_bn
       FROM vnstock_trading_stats t
       INNER JOIN (
         SELECT code, MAX(date) AS max_date
         FROM vnstock_trading_stats
         GROUP BY code
       ) latest ON t.code = latest.code AND t.date = latest.max_date`,
    )
    .all() as TradingStatsRow[];
}

/**
 * Return the last `limit` rows per ticker for all tickers appearing in the
 * latest date's snapshot.
 *
 * Returns rows sorted per (code, date DESC).
 */
export function getAllTickersHistory(
  db: Database,
  rowsPerTicker = 20,
): TradingStatsRow[] {
  // SQLite: use window functions to rank rows per code
  return db
    .prepare<RawTradingStatsRow, [number]>(
      `SELECT code, date, foreign_room, foreign_volume,
              current_holding_ratio, max_holding_ratio, market_cap_bn
       FROM (
         SELECT *,
                ROW_NUMBER() OVER (PARTITION BY code ORDER BY date DESC) AS rn
         FROM vnstock_trading_stats
       ) ranked
       WHERE rn <= ?
       ORDER BY code, date DESC`,
    )
    .all(rowsPerTicker) as TradingStatsRow[];
}

// ---------------------------------------------------------------------------
// Read: market-wide daily velocity series (for z-score computation)
// ---------------------------------------------------------------------------

/**
 * Compute per-session market-wide cap-weighted depletion velocity.
 *
 * For each trading session with ≥2 data points (to allow 5-day lookback),
 * computes the cap-weighted average of per-ticker (room_5d_ago - room_now) / 5.
 *
 * Uses SQLite window function LAG(5) to look back exactly 5 rows per ticker.
 * Only tickers with non-null market_cap_bn and max_holding_ratio > 0 contribute.
 *
 * Returns sessions sorted DESC (newest first), limited to `sessionLimit`.
 */
export function getMarketWideDailyVelocities(
  db: Database,
  sessionLimit = 25,
): Array<{ date: string; cap_wtd_velocity: number }> {
  interface VelocityRow {
    date: string;
    cap_wtd_velocity: number;
  }

  return db
    .prepare<VelocityRow, [number]>(
      `WITH ranked AS (
         SELECT code, date, foreign_room, market_cap_bn, max_holding_ratio,
                LAG(foreign_room, 5) OVER (PARTITION BY code ORDER BY date ASC) AS room_5d_ago
         FROM vnstock_trading_stats
         WHERE market_cap_bn IS NOT NULL
           AND market_cap_bn > 0
           AND max_holding_ratio IS NOT NULL
           AND max_holding_ratio > 0
       ),
       per_session AS (
         SELECT
           date,
           SUM(((room_5d_ago - foreign_room) / 5.0) * market_cap_bn) AS wtd_velocity_sum,
           SUM(market_cap_bn)                                           AS total_cap
         FROM ranked
         WHERE room_5d_ago IS NOT NULL
           AND foreign_room IS NOT NULL
         GROUP BY date
         HAVING total_cap > 0
       )
       SELECT date,
              wtd_velocity_sum / total_cap AS cap_wtd_velocity
       FROM per_session
       ORDER BY date DESC
       LIMIT ?`,
    )
    .all(sessionLimit);
}

// ---------------------------------------------------------------------------
// Read: foreign_room_events
// ---------------------------------------------------------------------------

/**
 * Return the last `limit` events for a given ticker, sorted DESC.
 */
export function getTickerRecentEvents(
  db: Database,
  code: string,
  limit = 5,
): RawEventRow[] {
  // Table might not exist yet on a fresh DB (migration creates it, but guard anyway)
  try {
    return db
      .prepare<RawEventRow, [string, number]>(
        `SELECT event_type, event_date, room_remaining_before, room_remaining_after
         FROM foreign_room_events
         WHERE code = ?
         ORDER BY event_date DESC
         LIMIT ?`,
      )
      .all(code, limit);
  } catch {
    return [];
  }
}

/**
 * Return the most recent ROOM_FULL event per ticker across all codes.
 * Used during event detection to check if a ROOM_REOPEN is plausible.
 */
export function getLastRoomFullPerTicker(db: Database): Record<string, RawLastEventRow> {
  try {
    const rows = db
      .prepare<RawLastEventRow, []>(
        `SELECT code, event_type, event_date
         FROM foreign_room_events
         WHERE event_type = 'ROOM_FULL'
           AND (code, event_date) IN (
             SELECT code, MAX(event_date)
             FROM foreign_room_events
             WHERE event_type = 'ROOM_FULL'
             GROUP BY code
           )`,
      )
      .all();

    const map: Record<string, RawLastEventRow> = {};
    for (const r of rows) {
      map[r.code] = r;
    }
    return map;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Write: foreign_room_events upsert
// ---------------------------------------------------------------------------

export interface ForeignRoomEventInsert {
  code: string;
  event_type: 'ROOM_FULL' | 'ROOM_REOPEN';
  event_date: string;
  room_remaining_before: number | null;
  room_remaining_after: number | null;
}

/**
 * Upsert a foreign room event.
 *
 * Idempotent: UNIQUE(code, event_date, event_type) — re-running over same row
 * is a no-op (INSERT OR IGNORE).
 *
 * Returns true when a new row was inserted, false when it was a no-op.
 */
export function upsertForeignRoomEvent(
  db: Database,
  event: ForeignRoomEventInsert,
): boolean {
  const result = db
    .prepare<unknown, [string, string, string, number | null, number | null]>(
      `INSERT OR IGNORE INTO foreign_room_events
         (code, event_type, event_date, room_remaining_before, room_remaining_after)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      event.code,
      event.event_type,
      event.event_date,
      event.room_remaining_before ?? null,
      event.room_remaining_after ?? null,
    );

  return (result as { changes: number }).changes > 0;
}
