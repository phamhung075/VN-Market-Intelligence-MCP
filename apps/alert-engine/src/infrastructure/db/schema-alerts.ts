/**
 * Alert Engine — Schema Migration: alert outcome columns
 *
 * Adds outcome tracking columns to alert_engine_records.
 * Uses idempotent ALTER TABLE (try/catch on "duplicate column name").
 *
 * Infra layer only — no domain logic.
 */

import type { Database } from 'bun:sqlite';

/** Add a column if it does not exist — swallows "duplicate column name" errors. */
function addColumnIfMissing(db: Database, column: string, definition: string): void {
  try {
    db.exec(`ALTER TABLE alert_engine_records ADD COLUMN ${column} ${definition}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('duplicate column name')) throw err;
  }
}

/**
 * Idempotent migration — adds outcome columns + index to alert_engine_records.
 *
 * New columns:
 *   outcome        TEXT          — 'HIT' | 'MISS' | 'UNKNOWN' | NULL (not yet scored)
 *   outcome_at     TEXT          — ISO timestamp when scored
 *   outcome_detail TEXT          — JSON with scoring context
 *
 * New index:
 *   idx_alerts_outcome_pending ON (outcome) WHERE outcome IS NULL
 */
export function runAlertOutcomeMigration(db: Database): void {
  addColumnIfMissing(db, 'outcome', 'TEXT');
  addColumnIfMissing(db, 'outcome_at', 'TEXT');
  addColumnIfMissing(db, 'outcome_detail', 'TEXT');

  // Partial index — only rows not yet scored
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_alerts_outcome_pending
      ON alert_engine_records(outcome)
      WHERE outcome IS NULL
  `);
}
