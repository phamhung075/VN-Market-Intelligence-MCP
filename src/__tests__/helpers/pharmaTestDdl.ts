/**
 * Task 1090 — Test-only DDL helper for pharma_events
 *
 * `initPharmaStore()` was removed from
 * `src/infrastructure/db/pharmaStore.ts` because its DDL duplicated
 * `schema.ts:initDatabase()`. Tests use this local helper (mirroring the
 * canonical DDL) so in-memory test databases get the table without depending
 * on production `initDatabase()` side effects.
 *
 * Keep this mirrored with `schema.ts:833` (the `pharma_events` block in
 * `initDatabase`). If you change one, change the other.
 */

import type { Database } from "bun:sqlite";

/** Creates the `pharma_events` table + indexes if they do not exist. */
export function initPharmaStore(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pharma_events (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type    TEXT NOT NULL,
      drug_name     TEXT,
      manufacturer  TEXT,
      stock_code    TEXT,
      approval_date TEXT,
      description   TEXT NOT NULL,
      severity      TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_pharma_code ON pharma_events(stock_code);
    CREATE INDEX IF NOT EXISTS idx_pharma_date ON pharma_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_pharma_type ON pharma_events(event_type);
  `);
}
