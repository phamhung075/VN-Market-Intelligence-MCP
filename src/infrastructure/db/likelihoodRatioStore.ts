/**
 * Task 1121 — likelihoodRatioStore
 *
 * CRUD helpers for the `evidence_likelihood_ratios` table.
 * Part of the Prediction Engine Phase B (Sprint 059).
 *
 * Stores per-(evidence_type, direction, horizon_days) likelihood ratios
 * computed by the base rate computation job (Task 1122).
 *
 * Business rule: if sample_size < 10, likelihood_ratio is always stored as 1.0
 * (neutral prior) — not enough data for a statistically meaningful estimate.
 *
 * Layer: infrastructure/db — no domain imports. All queries use parameterized
 * bindings only — no string interpolation of user input.
 *
 * @module infrastructure/db/likelihoodRatioStore
 */

import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Valid direction values matching the DB CHECK constraint */
export type LikelihoodDirection = "bullish" | "bearish" | "neutral";

/** Valid horizon values matching the DB CHECK constraint */
export type HorizonDays = 5 | 10 | 20;

/** Full row from the evidence_likelihood_ratios table */
export interface LikelihoodRatioRow {
  id: number;
  evidence_type: string;
  direction: LikelihoodDirection;
  horizon_days: HorizonDays;
  likelihood_ratio: number;
  sample_size: number;
  last_updated: string;
}

/** Input shape for upserting a likelihood ratio */
export interface UpsertLikelihoodRatioInput {
  evidence_type: string;
  direction: LikelihoodDirection;
  horizon_days: HorizonDays;
  /** Computed likelihood ratio — will be stored as 1.0 if sample_size < 10 */
  likelihood_ratio: number;
  sample_size: number;
}

/** Raw SQLite row shape from evidence_likelihood_ratios */
interface RatioDbRow {
  id: number;
  evidence_type: string;
  direction: string;
  horizon_days: number;
  likelihood_ratio: number;
  sample_size: number;
  last_updated: string;
}

/** Raw SQLite row for distinct pair queries */
interface PairDbRow {
  evidence_type: string;
  direction: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Write helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upsert a likelihood ratio row.
 *
 * Uses INSERT OR REPLACE on UNIQUE(evidence_type, direction, horizon_days).
 *
 * Business rule: if sample_size < 10, stores likelihood_ratio = 1.0 with the
 * actual sample_size value. This enforces the minimum-sample guard at the
 * persistence layer so callers (baseRateComputationJob) do not need to implement
 * it separately.
 *
 * @param db    SQLite database connection
 * @param input Upsert input data
 */
export function upsertLikelihoodRatio(
  db: Database,
  input: UpsertLikelihoodRatioInput,
): void {
  const lastUpdated = new Date().toISOString();
  // Business rule: insufficient sample → neutral prior
  const ratioToStore = input.sample_size < 10 ? 1.0 : input.likelihood_ratio;

  db.prepare(
    `INSERT OR REPLACE INTO evidence_likelihood_ratios
       (evidence_type, direction, horizon_days, likelihood_ratio, sample_size, last_updated)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    input.evidence_type,
    input.direction,
    input.horizon_days,
    ratioToStore,
    input.sample_size,
    lastUpdated,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Read helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get all likelihood ratio rows for a given evidence_type and direction.
 *
 * Returns one row per horizon_days (5, 10, 20) that exists.
 * Returns [] if no rows exist yet (first run before any data).
 *
 * @param db           SQLite database connection
 * @param evidenceType Evidence type string (e.g. "news_sentiment_macro")
 * @param direction    Direction filter
 */
export function getLikelihoodRatios(
  db: Database,
  evidenceType: string,
  direction: LikelihoodDirection,
): LikelihoodRatioRow[] {
  const rows = db
    .prepare(
      `SELECT * FROM evidence_likelihood_ratios
       WHERE evidence_type = ? AND direction = ?
       ORDER BY horizon_days ASC`,
    )
    .all(evidenceType, direction) as RatioDbRow[];

  return rows.map((r) => ({
    id: r.id,
    evidence_type: r.evidence_type,
    direction: r.direction as LikelihoodDirection,
    horizon_days: r.horizon_days as HorizonDays,
    likelihood_ratio: r.likelihood_ratio,
    sample_size: r.sample_size,
    last_updated: r.last_updated,
  }));
}

/**
 * Get the likelihood ratio for a specific (evidence_type, direction, horizon_days) triple.
 *
 * Returns 1.0 (neutral prior) in two cases:
 * - No row exists yet for this triple (first run, no data)
 * - The stored row has sample_size < 10 (insufficient data guard)
 *
 * Never throws — callers rely on this being safe.
 *
 * @param db           SQLite database connection
 * @param evidenceType Evidence type string
 * @param direction    Direction
 * @param horizonDays  Horizon in trading days: 5 | 10 | 20
 * @returns            Likelihood ratio in [0.1, 5.0] range, or 1.0 if unavailable
 */
export function getLikelihoodRatio(
  db: Database,
  evidenceType: string,
  direction: LikelihoodDirection,
  horizonDays: HorizonDays,
): number {
  try {
    const row = db
      .prepare(
        `SELECT likelihood_ratio, sample_size FROM evidence_likelihood_ratios
         WHERE evidence_type = ? AND direction = ? AND horizon_days = ?`,
      )
      .get(evidenceType, direction, horizonDays) as
      | { likelihood_ratio: number; sample_size: number }
      | null;

    if (!row) return 1.0;
    // Double-check: if sample_size < 10, return neutral prior regardless of stored value
    if (row.sample_size < 10) return 1.0;
    return row.likelihood_ratio;
  } catch {
    // Defensive: never throw even if table is missing in some edge case
    return 1.0;
  }
}

/**
 * Return all distinct (evidence_type, direction) pairs currently in the table.
 *
 * Used by baseRateComputationJob to enumerate what needs recomputation.
 * Returns an empty array if the table has no rows yet.
 *
 * @param db SQLite database connection
 */
export function getAllEvidenceTypePairs(
  db: Database,
): Array<{ evidence_type: string; direction: string }> {
  const rows = db
    .prepare(
      `SELECT DISTINCT evidence_type, direction
       FROM evidence_likelihood_ratios
       ORDER BY evidence_type, direction`,
    )
    .all() as PairDbRow[];

  return rows.map((r) => ({
    evidence_type: r.evidence_type,
    direction: r.direction,
  }));
}
