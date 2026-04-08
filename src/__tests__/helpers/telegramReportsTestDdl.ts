/**
 * Task 1035 — Test-only DDL helper for telegram_reports
 *
 * `ensureTelegramReportsTable()` was removed from
 * `src/infrastructure/db/telegramReportStore.ts` because its DDL duplicated
 * `schema.ts:initDatabase()`. Tests use this local helper (mirroring the
 * canonical DDL) so in-memory test databases get the table without depending
 * on production `initDatabase()` side effects.
 *
 * Keep this mirrored with `schema.ts:587` (the `telegram_reports` block in
 * `initDatabase`). If you change one, change the other.
 */

import type { Database } from "bun:sqlite";

/** Creates the `telegram_reports` table + indexes if they do not exist. */
export function ensureTelegramReportsTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS telegram_reports (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id  INTEGER NOT NULL DEFAULT 0,
      text        TEXT    NOT NULL,
      from_agent  TEXT    NOT NULL DEFAULT 'unknown',
      priority    TEXT    NOT NULL DEFAULT 'normal',
      status      TEXT    NOT NULL DEFAULT 'new',
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_telegram_reports_status  ON telegram_reports(status)`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_telegram_reports_created ON telegram_reports(created_at)`,
  );

  // Task 231 — ownership lock columns (idempotent ALTER TABLE)
  try {
    db.exec(`ALTER TABLE telegram_reports ADD COLUMN claimed_by TEXT`);
  } catch (_) {
    /* already exists */
  }
  try {
    db.exec(`ALTER TABLE telegram_reports ADD COLUMN claimed_at TEXT`);
  } catch (_) {
    /* already exists */
  }
}
