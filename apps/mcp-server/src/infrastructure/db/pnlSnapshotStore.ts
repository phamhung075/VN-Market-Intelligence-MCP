/**
 * Task 209 — P&L Snapshot Store (Infrastructure Layer)
 *
 * SQLite CRUD helpers for the `portfolio_pnl_snapshots` table.
 *
 * The table schema is defined in initDatabase() (schema.ts).
 * Upsert semantics: UNIQUE(date, code) — one row per stock per date.
 * Calling savePnlSnapshot() twice on the same date overwrites previous values.
 *
 * @module infrastructure/db/pnlSnapshotStore
 */

import type { Database } from "bun:sqlite";
import type { PositionPnl } from "../../domain/services/portfolioPnlCalculator.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Raw SQLite row from portfolio_pnl_snapshots. */
export interface PnlSnapshotRow {
  id: number;
  date: string;
  code: string;
  shares: number;
  avg_price: number;
  current_price: number | null;
  pnl_pct: number | null;
  pnl_amount: number | null;
  snapshot_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// savePnlSnapshot
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persist (or overwrite) P&L snapshots for a given date.
 *
 * Uses INSERT OR REPLACE so that repeated calls within the same date
 * always reflect the latest prices.
 *
 * @param db    - SQLite Database instance.
 * @param date  - ISO date string YYYY-MM-DD (Vietnam timezone date).
 * @param items - Array of PositionPnl objects from computePortfolioPnl().
 */
export function savePnlSnapshot(
  db: Database,
  date: string,
  items: PositionPnl[],
): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO portfolio_pnl_snapshots
      (date, code, shares, avg_price, current_price, pnl_pct, pnl_amount, snapshot_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  for (const item of items) {
    stmt.run(
      date,
      item.code,
      item.shares,
      item.avgPrice,
      item.currentPrice ?? null,
      item.pnlPct ?? null,
      item.pnlAmount ?? null,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getLatestPnlSnapshot
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retrieve all P&L snapshot rows for a specific date, ordered by code.
 *
 * Returns an empty array when no snapshot exists for the given date.
 *
 * @param db   - SQLite Database instance.
 * @param date - ISO date string YYYY-MM-DD.
 * @returns    - Array of PnlSnapshotRow.
 */
export function getLatestPnlSnapshot(
  db: Database,
  date: string,
): PnlSnapshotRow[] {
  return db
    .prepare<PnlSnapshotRow, [string]>(
      `SELECT * FROM portfolio_pnl_snapshots WHERE date = ? ORDER BY code ASC`,
    )
    .all(date);
}
