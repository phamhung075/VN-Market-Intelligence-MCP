/**
 * Mention Velocity Store — Task 265
 *
 * SQLite adapter for tracking hourly mention velocity per stock.
 *
 * Table: mention_velocity
 *   code          TEXT    — stock ticker
 *   hour          TEXT    — ISO 8601 truncated to hour (e.g. "2026-04-03T10:00:00.000Z")
 *   mention_count INTEGER — total mentions in this hour window
 *   negative_count INTEGER — negative mentions in this hour window
 *   source_count  INTEGER — distinct news sources in this hour window
 *
 * UNIQUE constraint on (code, hour) — upserts increment counts.
 * Auto-delete rows older than 30 days on each recordMention call.
 */

import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface MentionVelocityRecord {
  code: string;
  hour: string;
  mentionCount: number;
  negativeCount: number;
  sourceCount: number;
}

export interface RecordMentionInput {
  code: string;
  hour: string;
  mentionCount: number;
  negativeCount: number;
  sourceCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Table init
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create the mention_velocity table and indexes.
 * Idempotent — safe to call multiple times.
 *
 * @param db - Active bun:sqlite Database instance
 */
export function initMentionVelocityTable(db: Database): void {
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

// ─────────────────────────────────────────────────────────────────────────────
// Store operations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record mentions for a stock in a given hour window.
 *
 * Uses INSERT OR REPLACE with accumulated counts (upsert semantics):
 * if a row already exists for (code, hour), counts are added.
 *
 * Also prunes rows older than 30 days on every call.
 *
 * @param db    - Active bun:sqlite Database instance
 * @param input - Mention data to record
 */
export function recordMention(db: Database, input: RecordMentionInput): void {
  // Upsert: increment counts if row already exists
  db.prepare(`
    INSERT INTO mention_velocity (code, hour, mention_count, negative_count, source_count)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(code, hour) DO UPDATE SET
      mention_count  = mention_count  + excluded.mention_count,
      negative_count = negative_count + excluded.negative_count,
      source_count   = MAX(source_count, excluded.source_count)
  `).run(
    input.code,
    input.hour,
    input.mentionCount,
    input.negativeCount,
    input.sourceCount,
  );

  // Prune entries older than 30 days
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`DELETE FROM mention_velocity WHERE hour < ?`).run(cutoff);
}

/**
 * Retrieve the velocity record for a specific stock and hour.
 *
 * @param db   - Active bun:sqlite Database instance
 * @param code - Stock ticker
 * @param hour - ISO 8601 hour string
 * @returns    MentionVelocityRecord or null if not found
 */
export function getVelocity(
  db: Database,
  code: string,
  hour: string,
): MentionVelocityRecord | null {
  const row = db.prepare(`
    SELECT code, hour, mention_count, negative_count, source_count
    FROM mention_velocity
    WHERE code = ? AND hour = ?
  `).get(code, hour) as {
    code: string;
    hour: string;
    mention_count: number;
    negative_count: number;
    source_count: number;
  } | null;

  if (!row) return null;

  return {
    code: row.code,
    hour: row.hour,
    mentionCount: row.mention_count,
    negativeCount: row.negative_count,
    sourceCount: row.source_count,
  };
}

/**
 * Compute the baseline (rolling average) mention count for a stock.
 *
 * Averages mention_count across all hourly records within the given
 * lookback window (in hours). Returns 1 if no history exists.
 *
 * @param db          - Active bun:sqlite Database instance
 * @param code        - Stock ticker
 * @param lookbackHrs - Hours to look back (e.g. 24 for last 24 hours)
 * @returns           - Average mentions per hour (minimum 1)
 */
export function getBaseline(
  db: Database,
  code: string,
  lookbackHrs: number,
): number {
  const cutoff = new Date(Date.now() - lookbackHrs * 60 * 60 * 1000).toISOString();

  const row = db.prepare(`
    SELECT AVG(mention_count) AS avg_count
    FROM mention_velocity
    WHERE code = ? AND hour >= ?
  `).get(code, cutoff) as { avg_count: number | null } | null;

  const avg = row?.avg_count ?? null;
  return avg !== null && avg > 0 ? avg : 1;
}
