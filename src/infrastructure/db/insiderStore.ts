/**
 * Insider Transaction Store — Task 249
 *
 * SQLite CRUD helpers for the insider_transactions table.
 *
 * Layer: infrastructure/db — database I/O only, no domain logic
 *
 * Table schema (created by initDatabase in schema.ts):
 *   insider_transactions (
 *     id TEXT PRIMARY KEY,
 *     code TEXT NOT NULL,
 *     insider_name TEXT NOT NULL,
 *     position TEXT NOT NULL,
 *     type TEXT NOT NULL,        -- 'buy' | 'sell' | 'other'
 *     registered_volume INTEGER NOT NULL DEFAULT 0,
 *     executed_volume INTEGER NOT NULL DEFAULT 0,
 *     price REAL NOT NULL DEFAULT 0,
 *     from_date TEXT NOT NULL,
 *     to_date TEXT NOT NULL,
 *     fetched_at TEXT NOT NULL
 *   )
 */

import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface InsiderRow {
  id: string;
  code: string;
  insiderName: string;
  position: string;
  type: "buy" | "sell" | "other";
  registeredVolume: number;
  executedVolume: number;
  price: number;
  fromDate: string;
  toDate: string;
  fetchedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert an insider transaction row.
 * Idempotent: INSERT OR IGNORE skips duplicates by primary key.
 */
export function insertInsiderTransaction(db: Database, row: InsiderRow): void {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO insider_transactions
      (id, code, insider_name, position, type,
       registered_volume, executed_volume, price,
       from_date, to_date, fetched_at)
    VALUES
      ($id, $code, $insiderName, $position, $type,
       $registeredVolume, $executedVolume, $price,
       $fromDate, $toDate, $fetchedAt)
  `);

  stmt.run({
    $id: row.id,
    $code: row.code,
    $insiderName: row.insiderName,
    $position: row.position,
    $type: row.type,
    $registeredVolume: row.registeredVolume,
    $executedVolume: row.executedVolume,
    $price: row.price,
    $fromDate: row.fromDate,
    $toDate: row.toDate,
    $fetchedAt: row.fetchedAt,
  });
}

/**
 * Retrieve insider transactions, optionally filtered by stock code.
 * Results ordered by from_date DESC.
 */
export function getInsiderTransactions(
  db: Database,
  code?: string,
): InsiderRow[] {
  type DbRow = {
    id: string;
    code: string;
    insider_name: string;
    position: string;
    type: string;
    registered_volume: number;
    executed_volume: number;
    price: number;
    from_date: string;
    to_date: string;
    fetched_at: string;
  };

  let rows: DbRow[];
  if (code) {
    const stmt = db.prepare<DbRow, [string]>(
      `SELECT * FROM insider_transactions WHERE code = ? ORDER BY from_date DESC`,
    );
    rows = stmt.all(code) as DbRow[];
  } else {
    const stmt = db.prepare<DbRow, []>(
      `SELECT * FROM insider_transactions ORDER BY from_date DESC`,
    );
    rows = stmt.all() as DbRow[];
  }

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    insiderName: r.insider_name,
    position: r.position,
    type: r.type as "buy" | "sell" | "other",
    registeredVolume: r.registered_volume,
    executedVolume: r.executed_volume,
    price: r.price,
    fromDate: r.from_date,
    toDate: r.to_date,
    fetchedAt: r.fetched_at,
  }));
}

/**
 * Check if a transaction with the given id already exists.
 */
export function hasInsiderTransaction(db: Database, id: string): boolean {
  const stmt = db.prepare<{ count: number }, [string]>(
    `SELECT COUNT(*) as count FROM insider_transactions WHERE id = ?`,
  );
  const result = stmt.get(id) as { count: number } | undefined;
  return (result?.count ?? 0) > 0;
}
