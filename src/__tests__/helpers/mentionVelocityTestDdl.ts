/**
 * Task 1050 — Test-only DDL helper for mention_velocity
 *
 * `initMentionVelocityTable()` was removed from
 * `src/infrastructure/db/mentionVelocityStore.ts` because its DDL duplicated
 * `schema.ts:initDatabase()`. Tests use this local helper (mirroring the
 * canonical DDL) so in-memory test databases get the table without depending
 * on production `initDatabase()` side effects.
 *
 * Keep this mirrored with `schema.ts:271` (the `mention_velocity` block in
 * `initDatabase`). If you change one, change the other.
 */

import type { Database } from "bun:sqlite";

/** Creates the `mention_velocity` table + indexes if they do not exist. */
export function ensureMentionVelocityTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mention_velocity (
      code           TEXT    NOT NULL,
      hour           TEXT    NOT NULL,
      mention_count  INTEGER NOT NULL DEFAULT 0,
      negative_count INTEGER NOT NULL DEFAULT 0,
      source_count   INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (code, hour)
    );

    CREATE INDEX IF NOT EXISTS idx_mv_code ON mention_velocity(code);
    CREATE INDEX IF NOT EXISTS idx_mv_hour ON mention_velocity(hour);
  `);
}
