/**
 * Reputation Store — Task 265
 *
 * SQLite adapter for persisting daily reputation scores per stock.
 *
 * Table: reputation_scores
 *   code        TEXT    — stock ticker
 *   date        TEXT    — ISO date string (YYYY-MM-DD)
 *   score       REAL    — EWMA reputation score (0-100)
 *   trend       TEXT    — 'improving' | 'stable' | 'deteriorating'
 *   risk_level  TEXT    — 'safe' | 'watch' | 'warning' | 'danger'
 *   computed_at TEXT    — ISO 8601 timestamp
 *
 * UNIQUE constraint on (code, date) — upserts replace on conflict.
 */

import type { Database } from "bun:sqlite";
import type { ReputationScore, RiskLevel } from "../../domain/services/reputationScorer.js";

// Task 1037 — `initReputationTable()` was removed; the canonical DDL lives
// in `src/infrastructure/db/schema.ts:initDatabase()` and runs at server
// startup. Tests use `src/__tests__/helpers/reputationScoresTestDdl.ts`.

// ─────────────────────────────────────────────────────────────────────────────
// Store operations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Save (upsert) a reputation score for a stock on a given date.
 *
 * If a record already exists for (code, date), it is replaced.
 *
 * @param db   - Active bun:sqlite Database instance
 * @param rep  - ReputationScore to store
 * @param date - Date string in YYYY-MM-DD format
 */
export function saveReputation(
  db: Database,
  rep: ReputationScore,
  date: string,
): void {
  db.prepare(`
    INSERT INTO reputation_scores (code, date, score, trend, risk_level, computed_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(code, date) DO UPDATE SET
      score       = excluded.score,
      trend       = excluded.trend,
      risk_level  = excluded.risk_level,
      computed_at = excluded.computed_at
  `).run(
    rep.stockCode,
    date,
    rep.score,
    rep.trend,
    rep.riskLevel,
    rep.computedAt,
  );
}

/**
 * Retrieve a reputation score for a stock.
 *
 * If `date` is omitted, returns the most recent record.
 * Returns null if no record found.
 *
 * @param db   - Active bun:sqlite Database instance
 * @param code - Stock ticker
 * @param date - Optional date (YYYY-MM-DD). If omitted, returns latest.
 * @returns    ReputationScore or null
 */
export function getReputation(
  db: Database,
  code: string,
  date?: string,
): ReputationScore | null {
  let row: {
    code: string;
    score: number;
    trend: string;
    risk_level: string;
    computed_at: string;
  } | null;

  if (date !== undefined) {
    row = db.prepare(`
      SELECT code, score, trend, risk_level, computed_at
      FROM reputation_scores
      WHERE code = ? AND date = ?
    `).get(code, date) as typeof row;
  } else {
    row = db.prepare(`
      SELECT code, score, trend, risk_level, computed_at
      FROM reputation_scores
      WHERE code = ?
      ORDER BY date DESC
      LIMIT 1
    `).get(code) as typeof row;
  }

  if (!row) return null;

  return {
    stockCode: row.code,
    score: row.score,
    riskLevel: row.risk_level as RiskLevel,
    trend: row.trend as "improving" | "stable" | "deteriorating",
    computedAt: row.computed_at,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK17-PAGE18 — Leaderboard queries
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One row in the latest-snapshot leaderboard.
 * risk_level is mapped to camelCase riskLevel by the store.
 */
export interface ReputationSnapshotRow {
  code: string;
  score: number;
  trend: string;
  riskLevel: string;
  date: string;
}

/**
 * Return all reputation rows at the single latest date (across all tickers).
 * Ordered score DESC, code ASC — matching the leaderboard presentation order.
 * Returns [] when the table is empty (no throw).
 *
 * @param db - Active bun:sqlite Database instance
 * @returns  Array of ReputationSnapshotRow (may be empty)
 */
export function getLatestReputationSnapshot(db: Database): ReputationSnapshotRow[] {
  const rows = db.prepare(`
    SELECT code, score, trend, risk_level, date
    FROM reputation_scores
    WHERE date = (SELECT MAX(date) FROM reputation_scores)
    ORDER BY score DESC, code ASC
  `).all() as Array<{ code: string; score: number; trend: string; risk_level: string; date: string }>;

  return rows.map((r) => ({
    code: r.code,
    score: r.score,
    trend: r.trend,
    riskLevel: r.risk_level,
    date: r.date,
  }));
}

/**
 * One row in the full history result set (all dates, all tickers).
 * Used for per-code sparklines — caller groups by code.
 */
export interface ReputationHistoryRow {
  code: string;
  date: string;
  score: number;
}

/**
 * Return all reputation_scores rows ordered code ASC, date ASC.
 * Used to build per-code sparklines in the leaderboard response.
 * Returns [] when the table is empty (no throw).
 *
 * @param db - Active bun:sqlite Database instance
 * @returns  Array of ReputationHistoryRow (may be empty)
 */
export function getReputationHistory(db: Database): ReputationHistoryRow[] {
  return db.prepare(`
    SELECT code, date, score
    FROM reputation_scores
    ORDER BY code ASC, date ASC
  `).all() as ReputationHistoryRow[];
}
