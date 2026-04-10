/**
 * Task 1083 — Test-only DDL helper for kinhdich_readings + hexagram_transitions
 *
 * `initHexagramTables()` was removed from
 * `src/infrastructure/db/hexagramStore.ts` because its DDL duplicated
 * `schema.ts:initDatabase()`. Tests use this local helper (mirroring the
 * canonical DDL) so in-memory test databases get the tables without depending
 * on production `initDatabase()` side effects.
 *
 * Keep this mirrored with `schema.ts:779-808` (the `kinhdich_readings` and
 * `hexagram_transitions` blocks in `initDatabase`). If you change one, change
 * the other.
 */

import type { Database } from "bun:sqlite";

/** Creates the hexagram tables + indexes if they do not exist. */
export function initHexagramTables(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS kinhdich_readings (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_code       TEXT NOT NULL,
      timestamp        TEXT NOT NULL DEFAULT (datetime('now')),
      hexagram_number  INTEGER NOT NULL,
      ho_que_number    INTEGER NOT NULL,
      bien_que_number  INTEGER NOT NULL,
      hao_states       TEXT NOT NULL,
      raw_scores       TEXT NOT NULL,
      ngu_hanh_dynamic TEXT,
      trading_signal   TEXT,
      confidence       REAL,
      action_note      TEXT,
      source           TEXT DEFAULT 'manual'
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_kd_readings_code_ts ON kinhdich_readings(stock_code, timestamp)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS hexagram_transitions (
      from_hexagram         INTEGER NOT NULL,
      to_hexagram           INTEGER NOT NULL,
      stock_code            TEXT NOT NULL,
      count                 INTEGER DEFAULT 1,
      total_price_change_5d REAL DEFAULT 0,
      win_count             INTEGER DEFAULT 0,
      last_seen             TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (from_hexagram, to_hexagram, stock_code)
    )
  `);
}
