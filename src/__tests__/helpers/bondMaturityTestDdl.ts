/**
 * Task 1089 — Test-only DDL helper for bond_maturity
 *
 * `ensureBondMaturityTable()` was removed from
 * `src/infrastructure/db/bondMaturityStore.ts` because its DDL duplicated
 * `schema.ts:initDatabase()`. Tests use this local helper (mirroring the
 * canonical DDL) so in-memory test databases get the table without depending
 * on production `initDatabase()` side effects.
 *
 * Keep this mirrored with `schema.ts:814` (the `bond_maturity` block in
 * `initDatabase`). If you change one, change the other.
 */

import type { Database } from "bun:sqlite";

/** Creates the `bond_maturity` table + indexes if they do not exist. */
export function ensureBondMaturityTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bond_maturity (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      issuer           TEXT NOT NULL,
      issuer_code      TEXT NOT NULL UNIQUE,
      amount_billion   REAL NOT NULL,
      maturity_date    TEXT NOT NULL,
      coupon_rate      REAL,
      status           TEXT NOT NULL DEFAULT 'upcoming',
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_bond_maturity_date ON bond_maturity(maturity_date);
    CREATE INDEX IF NOT EXISTS idx_bond_maturity_code ON bond_maturity(issuer_code);
  `);
}
