/**
 * Task 1037 — Test-only DDL helper for reputation_scores
 *
 * `initReputationTable()` was removed from
 * `src/infrastructure/db/reputationStore.ts` because its DDL duplicated
 * `schema.ts:initDatabase()`. Tests use this local helper (mirroring the
 * canonical DDL) so in-memory test databases get the table without depending
 * on production `initDatabase()` side effects.
 *
 * Keep this mirrored with `schema.ts:286` (the `reputation_scores` block in
 * `initDatabase`). If you change one, change the other.
 */

import type { Database } from "bun:sqlite";

/** Creates the `reputation_scores` table + indexes if they do not exist. */
export function ensureReputationScoresTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reputation_scores (
      code        TEXT NOT NULL,
      date        TEXT NOT NULL,
      score       REAL NOT NULL,
      trend       TEXT NOT NULL DEFAULT 'stable',
      risk_level  TEXT NOT NULL DEFAULT 'safe',
      computed_at TEXT NOT NULL,
      PRIMARY KEY (code, date)
    );

    CREATE INDEX IF NOT EXISTS idx_rep_code ON reputation_scores(code);
    CREATE INDEX IF NOT EXISTS idx_rep_date ON reputation_scores(date);
  `);
}
