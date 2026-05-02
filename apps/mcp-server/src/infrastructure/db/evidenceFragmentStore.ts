/**
 * Task 1116 — evidenceFragmentStore
 *
 * CRUD helpers for the `evidence_fragments` and `evidence_scores` tables.
 * Part of the Prediction Engine Phase A (Sprint 057).
 *
 * The evidence accumulation store lets analysis agents write directional
 * evidence fragments (bullish/bearish/neutral) for each stock. A nightly
 * job (evidenceAccumulatorJob, Task 1118) aggregates them into evidence_scores.
 *
 * Layer: infrastructure/db — no domain imports. All queries use parameterized
 * bindings only — no string interpolation of user input.
 *
 * @module infrastructure/db/evidenceFragmentStore
 */

import type { Database } from "bun:sqlite";
import { sqlInClause } from "./sqlHelpers.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type EvidenceDirection = "bullish" | "bearish" | "neutral";

/**
 * Input shape for inserting a new evidence fragment.
 * `timestamp` and `expires_at` are computed by the store — callers do not supply them.
 */
export interface EvidenceFragmentInput {
  /** Stock ticker, e.g. "VCB" */
  stock: string;
  /**
   * Type of evidence. Soft enum — no DB constraint.
   * Common values: news_sentiment_macro, news_sentiment_stock, bctc_revenue_growth,
   * bctc_pe_ratio, bctc_debt_equity, price_momentum_5d, price_momentum_20d,
   * kinh_dich_signal.
   */
  evidence_type: string;
  /** Direction of the evidence */
  direction: EvidenceDirection;
  /** Strength of the evidence signal: 0.0 (weak) – 1.0 (strong) */
  magnitude: number;
  /** Confidence in this evidence: 0.0 – 1.0 */
  confidence: number;
  /** Agent that produced this fragment, e.g. "04-market-watcher" */
  source_agent: string;
  /** How many days before this fragment expires. Default: 30 */
  ttl_days?: number;
}

/** Full row from the evidence_fragments table */
export interface EvidenceFragmentRow extends EvidenceFragmentInput {
  id: number;
  /** ISO 8601 UTC — when the fragment was recorded */
  timestamp: string;
  /** ISO 8601 UTC — when the fragment expires (timestamp + ttl_days) */
  expires_at: string;
}

/**
 * Weighted directional scores for a stock on a given day.
 * Each score = sum(magnitude * confidence) / count for that direction.
 */
export interface EvidenceScores {
  /** Weighted average of bullish magnitude * confidence */
  bullish: number;
  /** Weighted average of bearish magnitude * confidence */
  bearish: number;
  /** Weighted average of neutral magnitude * confidence */
  neutral: number;
  /** Total number of fragments included in this score */
  fragmentCount: number;
}

/** Full row from the evidence_scores table */
export interface EvidenceScoreRow extends EvidenceScores {
  id: number;
  stock: string;
  score_date: string;
  computed_at: string;
}

/** Raw SQLite row shape from evidence_fragments */
interface FragmentDbRow {
  id: number;
  stock: string;
  evidence_type: string;
  direction: string;
  magnitude: number;
  confidence: number;
  timestamp: string;
  source_agent: string;
  ttl_days: number;
  expires_at: string;
}

/** Raw SQLite row shape from evidence_scores */
interface ScoreDbRow {
  id: number;
  stock: string;
  score_date: string;
  bullish_score: number;
  bearish_score: number;
  neutral_score: number;
  fragment_count: number;
  computed_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Write helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert a new evidence fragment into `evidence_fragments`.
 *
 * Computes `timestamp` = now (ISO 8601 UTC) and
 * `expires_at` = timestamp + ttl_days days.
 *
 * @returns The inserted row's auto-increment id
 */
export function insertEvidenceFragment(
  db: Database,
  fragment: EvidenceFragmentInput,
): number {
  const ttl = fragment.ttl_days ?? 30;
  const now = new Date();
  const timestamp = now.toISOString();
  const expiresAt = new Date(now.getTime() + ttl * 24 * 60 * 60 * 1000).toISOString();

  const result = db
    .prepare(
      `INSERT INTO evidence_fragments
         (stock, evidence_type, direction, magnitude, confidence, timestamp, source_agent, ttl_days, expires_at)
       VALUES
         (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      fragment.stock,
      fragment.evidence_type,
      fragment.direction,
      fragment.magnitude,
      fragment.confidence,
      timestamp,
      fragment.source_agent,
      ttl,
      expiresAt,
    );

  return result.lastInsertRowid as number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Read helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Options for filtering evidence fragments.
 */
export interface GetFragmentsOptions {
  /** How many days back to look. Default: 30 */
  days?: number;
  /** Filter to specific evidence types. Default: all types */
  evidenceTypes?: string[];
}

/**
 * Retrieve evidence fragments for a stock.
 *
 * Returns rows ordered newest-first (timestamp DESC).
 * Optionally filtered by age window and/or evidence type list.
 *
 * @param db - SQLite database connection
 * @param stock - Stock ticker (e.g. "VCB")
 * @param options - Optional filters
 */
export function getEvidenceFragments(
  db: Database,
  stock: string,
  options: GetFragmentsOptions = {},
): EvidenceFragmentRow[] {
  const days = options.days ?? 30;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const conditions: string[] = ["stock = ?", "timestamp >= ?"];
  const params: (string | number)[] = [stock, cutoff];

  if (options.evidenceTypes && options.evidenceTypes.length > 0) {
    const placeholders = sqlInClause(options.evidenceTypes.length);
    conditions.push(`evidence_type IN (${placeholders})`);
    params.push(...options.evidenceTypes);
  }

  const where = conditions.join(" AND ");
  const rows = db
    .prepare(`SELECT * FROM evidence_fragments WHERE ${where} ORDER BY timestamp DESC`)
    .all(...params) as FragmentDbRow[];

  return rows.map((r) => ({
    id: r.id,
    stock: r.stock,
    evidence_type: r.evidence_type,
    direction: r.direction as EvidenceDirection,
    magnitude: r.magnitude,
    confidence: r.confidence,
    timestamp: r.timestamp,
    source_agent: r.source_agent,
    ttl_days: r.ttl_days,
    expires_at: r.expires_at,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Maintenance helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Delete all evidence fragments whose `expires_at` is in the past.
 *
 * Called by `evidenceAccumulatorJob` before each accumulation run.
 *
 * @returns Number of rows deleted
 */
export function purgeExpiredFragments(db: Database): number {
  const now = new Date().toISOString();
  const result = db
    .prepare("DELETE FROM evidence_fragments WHERE expires_at < ?")
    .run(now);
  return result.changes;
}

// ─────────────────────────────────────────────────────────────────────────────
// Evidence scores
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upsert an evidence score for a (stock, date) pair.
 *
 * Uses INSERT OR REPLACE (UNIQUE constraint on stock + score_date).
 * Replaces the existing row if already computed for that day.
 */
export function upsertEvidenceScore(
  db: Database,
  stock: string,
  scoreDate: string,
  scores: EvidenceScores,
): void {
  const computedAt = new Date().toISOString();
  db.prepare(
    `INSERT OR REPLACE INTO evidence_scores
       (stock, score_date, bullish_score, bearish_score, neutral_score, fragment_count, computed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    stock,
    scoreDate,
    scores.bullish,
    scores.bearish,
    scores.neutral,
    scores.fragmentCount,
    computedAt,
  );
}

/**
 * Return the most recent evidence score row for a stock.
 *
 * @returns `null` if no score exists for this stock
 */
export function getLatestEvidenceScore(
  db: Database,
  stock: string,
): EvidenceScoreRow | null {
  const row = db
    .prepare(
      `SELECT * FROM evidence_scores WHERE stock = ? ORDER BY score_date DESC LIMIT 1`,
    )
    .get(stock) as ScoreDbRow | null;

  if (!row) return null;

  return {
    id: row.id,
    stock: row.stock,
    score_date: row.score_date,
    bullish: row.bullish_score,
    bearish: row.bearish_score,
    neutral: row.neutral_score,
    fragmentCount: row.fragment_count,
    computed_at: row.computed_at,
  };
}
