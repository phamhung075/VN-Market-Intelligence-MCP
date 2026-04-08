/**
 * Task 1036 — Test-only DDL helper for user_requests
 *
 * `ensureUserRequestsTable()` was removed from
 * `src/infrastructure/db/userRequestStore.ts` because its DDL duplicated
 * `schema.ts:initDatabase()`. Tests use this local helper (mirroring the
 * canonical DDL) so in-memory test databases get the table without depending
 * on production `initDatabase()` side effects.
 *
 * Keep this mirrored with `schema.ts:625` (the `user_requests` block in
 * `initDatabase`). If you change one, change the other.
 */

import type { Database } from "bun:sqlite";

/** Creates the `user_requests` table + index if they do not exist. */
export function ensureUserRequestsTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_requests (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      command     TEXT NOT NULL,
      payload     TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'pending',
      response    TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      answered_at TEXT
    )
  `);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_user_requests_status ON user_requests(status)`,
  );
}
