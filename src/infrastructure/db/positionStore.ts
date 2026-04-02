/**
 * Task 179 — Position Store
 *
 * SQLite CRUD helpers for the `positions` table.
 *
 * All prices in VND (not million VND — positions use raw VND to match
 * the market_prices table which stores raw VND prices).
 *
 * @module infrastructure/db/positionStore
 */

import { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Raw SQLite row from the positions table. */
export interface PositionRow {
  id: number;
  code: string;
  shares: number;
  avg_price: number;
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
}

/** Enriched position with live P&L data. */
export interface PositionWithPnl {
  id: number;
  code: string;
  shares: number;
  /** Average purchase price in VND. */
  avgPrice: number;
  openedAt: string;
  notes: string | null;
  /** Latest price from market_prices table, or null if unavailable. */
  currentPrice: number | null;
  /** Total cost basis = shares × avgPrice. */
  costBasis: number;
  /** Current market value = shares × currentPrice (0 if no price). */
  currentValue: number;
  /** Unrealized P&L amount in VND (0 if no current price). */
  unrealizedPnl: number;
  /** Unrealized P&L as a percentage of cost basis (0 if no current price). */
  unrealizedPnlPct: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// upsertPosition
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert or update a position.
 *
 * Upsert logic: if a row with the same `code` already exists (open or closed),
 * update shares, avg_price, and notes. The UNIQUE(code) constraint drives the
 * ON CONFLICT clause.
 *
 * @throws {Error} if shares <= 0 or avgPrice <= 0.
 */
export function upsertPosition(
  db: Database,
  opts: { code: string; shares: number; avgPrice: number; notes?: string },
): void {
  const { code, shares, avgPrice, notes } = opts;

  if (shares <= 0) {
    throw new Error(`[upsertPosition] shares must be > 0, got ${shares}`);
  }
  if (avgPrice <= 0) {
    throw new Error(`[upsertPosition] avgPrice must be > 0, got ${avgPrice}`);
  }

  db.prepare(
    `INSERT INTO positions (code, shares, avg_price, opened_at, notes)
     VALUES (?, ?, ?, datetime('now'), ?)
     ON CONFLICT(code) DO UPDATE SET
       shares    = excluded.shares,
       avg_price = excluded.avg_price,
       notes     = COALESCE(excluded.notes, positions.notes),
       closed_at = NULL`,
  ).run(code.toUpperCase(), shares, avgPrice, notes ?? null);
}

// ─────────────────────────────────────────────────────────────────────────────
// listOpenPositions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return all open positions (closed_at IS NULL) enriched with live P&L data
 * from the market_prices table.
 *
 * If no market price is available for a stock, currentPrice is null and
 * unrealizedPnl / unrealizedPnlPct are returned as 0.
 */
export function listOpenPositions(db: Database): PositionWithPnl[] {
  const rows = db
    .prepare<PositionRow & { current_price: number | null }, []>(
      `SELECT p.*, mp.price AS current_price
       FROM positions p
       LEFT JOIN market_prices mp ON mp.code = p.code
       WHERE p.closed_at IS NULL
       ORDER BY p.opened_at ASC`,
    )
    .all();

  return rows.map((r) => {
    const costBasis = r.shares * r.avg_price;
    const currentPrice = r.current_price ?? null;
    const currentValue = currentPrice != null ? r.shares * currentPrice : 0;
    const unrealizedPnl = currentPrice != null ? currentValue - costBasis : 0;
    const unrealizedPnlPct =
      currentPrice != null && costBasis > 0
        ? (unrealizedPnl / costBasis) * 100
        : 0;

    return {
      id: r.id,
      code: r.code,
      shares: r.shares,
      avgPrice: r.avg_price,
      openedAt: r.opened_at,
      notes: r.notes,
      currentPrice,
      costBasis,
      currentValue,
      unrealizedPnl,
      unrealizedPnlPct,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// closePosition
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mark a position as closed by setting `closed_at = datetime('now')`.
 *
 * @returns true if the position existed and was closed, false otherwise.
 */
export function closePosition(db: Database, code: string): boolean {
  const result = db
    .prepare(
      `UPDATE positions SET closed_at = datetime('now')
       WHERE code = ? AND closed_at IS NULL`,
    )
    .run(code.toUpperCase());

  return result.changes > 0;
}
