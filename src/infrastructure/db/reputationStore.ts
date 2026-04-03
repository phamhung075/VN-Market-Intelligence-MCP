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

// ─────────────────────────────────────────────────────────────────────────────
// Table init
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create the reputation_scores table and indexes.
 * Idempotent — safe to call multiple times.
 *
 * @param db - Active bun:sqlite Database instance
 */
export function initReputationTable(db: Database): void {
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
