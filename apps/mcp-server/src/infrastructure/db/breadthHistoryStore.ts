/**
 * Infrastructure — Breadth History Store (BREADTH-TIME-SERIES)
 *
 * Database access layer for the market_breadth_history table.
 * READ path: query rows for computation.
 * WRITE path: INSERT OR IGNORE (idempotent, first-write-wins per NFR-BR-2).
 *
 * No try/catch in query functions — errors propagate to the tool handler's
 * catch block (same pattern as foreignRoomStore, marketSentimentStore).
 *
 * DDD layer: infrastructure/db — may import domain types, NOT domain logic.
 *
 * @module infrastructure/db/breadthHistoryStore
 */

import type { Database } from "bun:sqlite";
import type { BreadthRow } from "../../domain/services/market-data/breadthCalculator.js";

// ---------------------------------------------------------------------------
// Row type as returned by SQLite queries
// ---------------------------------------------------------------------------

interface BreadthHistoryDbRow {
  session_date: string;
  advancing:    number;
  declining:    number;
  unchanged:    number;
  ceiling:      number;
  floor:        number;
  total:        number;
}

function toRow(r: BreadthHistoryDbRow): BreadthRow {
  return {
    session_date: r.session_date,
    advancing:    r.advancing,
    declining:    r.declining,
    unchanged:    r.unchanged,
    ceiling:      r.ceiling,
    floor:        r.floor,
    total:        r.total,
  };
}

// ---------------------------------------------------------------------------
// Read functions
// ---------------------------------------------------------------------------

/**
 * Return ALL rows from market_breadth_history, sorted ASC (oldest first).
 * Used for full time-series computation (ADL, McClellan, Zweig).
 */
export function getAllBreadthHistory(db: Database): BreadthRow[] {
  const rows = db.query<BreadthHistoryDbRow, []>(`
    SELECT session_date, advancing, declining, unchanged, ceiling, floor, total
      FROM market_breadth_history
     ORDER BY session_date ASC
  `).all();
  return rows.map(toRow);
}

/**
 * Return the most recent N rows from market_breadth_history, sorted ASC.
 * Used when only the last N rows are needed (e.g. Zweig 14-session window).
 */
export function getRecentBreadthHistory(db: Database, limit: number): BreadthRow[] {
  // Fetch DESC (most recent first), then reverse so caller gets ASC.
  const rows = db.query<BreadthHistoryDbRow, [number]>(`
    SELECT session_date, advancing, declining, unchanged, ceiling, floor, total
      FROM market_breadth_history
     ORDER BY session_date DESC
     LIMIT ?
  `).all(limit);
  return rows.map(toRow).reverse(); // reverse to ASC
}

/**
 * Return the count of rows in market_breadth_history.
 * Used for history_quality classification without fetching all rows.
 */
export function getBreadthHistoryCount(db: Database): number {
  const row = db.query<{ cnt: number }, []>(`
    SELECT COUNT(*) AS cnt FROM market_breadth_history
  `).get();
  return row?.cnt ?? 0;
}

/**
 * Return the earliest session_date stored (accruing_since).
 * Returns null when the table is empty.
 */
export function getAccruingSince(db: Database): string | null {
  const row = db.query<{ min_date: string | null }, []>(`
    SELECT MIN(session_date) AS min_date FROM market_breadth_history
  `).get();
  return row?.min_date ?? null;
}

// ---------------------------------------------------------------------------
// Write function (persister job)
// ---------------------------------------------------------------------------

export interface BreadthInsertRow {
  session_date: string;
  advancing:    number;
  declining:    number;
  unchanged:    number;
  ceiling:      number;
  floor:        number;
  total:        number;
}

/**
 * Insert one breadth row for a trading session.
 * Uses INSERT OR IGNORE — idempotent if the session_date already exists.
 * First write wins (breadth is final when market closes).
 *
 * NFR-BR-1: caller MUST ensure row comes from live fetch, NOT synthetic data.
 * This function does NOT validate the source — the persister job is responsible.
 *
 * @returns true when a new row was inserted; false when row already existed.
 */
export function upsertBreadthRow(db: Database, row: BreadthInsertRow): boolean {
  const result = db.prepare(`
    INSERT OR IGNORE INTO market_breadth_history
      (session_date, advancing, declining, unchanged, ceiling, floor, total)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.session_date,
    row.advancing,
    row.declining,
    row.unchanged,
    row.ceiling,
    row.floor,
    row.total,
  );
  return result.changes > 0;
}
