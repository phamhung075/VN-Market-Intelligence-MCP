/**
 * Mention Velocity Store — Task 265 + TASK17-PAGE19
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
 *
 * Read functions (TASK17-PAGE19):
 *   getNewsBuzzWindow — data-anchored 7-day aggregation for GET /api/news-buzz.
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
// Store operations
// ─────────────────────────────────────────────────────────────────────────────
// DDL is canonical in schema.ts:271 via initDatabase(). Tests use
// src/__tests__/helpers/mentionVelocityTestDdl.ts for in-memory setup.

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

// ─────────────────────────────────────────────────────────────────────────────
// TASK17-PAGE19 — News Buzz Window (read path)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One row in the news-buzz leaderboard.
 * Aggregated over the 7-day data-anchored window.
 */
export interface NewsBuzzRow {
  code: string;
  mentions: number;
  negative: number;
  sources: number;
  hoursActive: number;
}

/**
 * Full result of getNewsBuzzWindow.
 * windowStart / windowEnd are the resolved ISO strings from the DB;
 * both are null when the table is empty.
 */
export interface NewsBuzzWindow {
  windowStart: string | null;
  windowEnd: string | null;
  rows: NewsBuzzRow[];
}

/**
 * Aggregate mention_velocity into a news-buzz leaderboard over a data-anchored window.
 *
 * Window contract (data-anchored, NOT now-relative):
 *   windowEnd   = SELECT MAX(hour) FROM mention_velocity
 *   windowStart = datetime(windowEnd, '-<days> days')
 *   Predicate:  hour > windowStart  (exclusive lower bound)
 *
 * Returns {windowStart:null, windowEnd:null, rows:[]} when the table is empty.
 * Rows are ordered mentions DESC, code ASC.
 *
 * @param db   - Active bun:sqlite Database instance
 * @param days - Lookback in days (default 7)
 */
export function getNewsBuzzWindow(db: Database, days = 7): NewsBuzzWindow {
  // Step 1: resolve windowEnd from the data (data-anchored, not clock-anchored)
  const endRow = db.prepare(
    `SELECT MAX(hour) AS window_end FROM mention_velocity`,
  ).get() as { window_end: string | null } | null;

  const windowEnd = endRow?.window_end ?? null;

  // Empty table guard
  if (!windowEnd) {
    return { windowStart: null, windowEnd: null, rows: [] };
  }

  // Step 2: resolve windowStart relative to windowEnd
  const startRow = db.prepare(
    `SELECT datetime(?, '-' || ? || ' days') AS window_start`,
  ).get(windowEnd, days) as { window_start: string } | null;

  const windowStart = startRow?.window_start ?? null;

  if (!windowStart) {
    return { windowStart: null, windowEnd, rows: [] };
  }

  // Step 3: aggregate — STRICTLY GREATER than windowStart (exclusive lower bound)
  const raw = db.prepare(`
    SELECT code,
           SUM(mention_count)  AS mentions,
           SUM(negative_count) AS negative,
           SUM(source_count)   AS sources,
           COUNT(*)            AS hoursActive
    FROM mention_velocity
    WHERE hour > ?
    GROUP BY code
    ORDER BY mentions DESC, code ASC
  `).all(windowStart) as {
    code: string;
    mentions: number;
    negative: number;
    sources: number;
    hoursActive: number;
  }[];

  const rows: NewsBuzzRow[] = raw.map((r) => ({
    code: r.code,
    mentions: r.mentions,
    negative: r.negative,
    sources: r.sources,
    hoursActive: r.hoursActive,
  }));

  return { windowStart, windowEnd, rows };
}

// ─────────────────────────────────────────────────────────────────────────────

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
