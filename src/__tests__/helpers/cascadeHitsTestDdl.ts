/**
 * Task 1082 — Test-only DDL helper for cascade_rule_hits
 *
 * `ensureCascadeHitsTable()` was removed from
 * `src/infrastructure/db/cascadeHitStore.ts` because its DDL duplicated
 * `schema.ts:initDatabase()`. Tests use this local helper (mirroring the
 * canonical DDL) so in-memory test databases get the table without depending
 * on production `initDatabase()` side effects.
 *
 * Keep this mirrored with `schema.ts:872` (the `cascade_rule_hits` block in
 * `initDatabase`). If you change one, change the other.
 */

import type { Database } from "bun:sqlite";

/** Creates the `cascade_rule_hits` table + indexes if they do not exist. */
export function ensureCascadeHitsTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cascade_rule_hits (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_key         TEXT NOT NULL,
      matched_text     TEXT NOT NULL DEFAULT '',
      affected_sector  TEXT,
      affected_stocks  TEXT,
      hit_at           TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cascade_hits_rule ON cascade_rule_hits(rule_key);
    CREATE INDEX IF NOT EXISTS idx_cascade_hits_at   ON cascade_rule_hits(hit_at);
  `);
}
