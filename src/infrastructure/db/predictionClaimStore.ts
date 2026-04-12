/**
 * Prediction Claim Store — Task 1125
 *
 * CRUD helpers for the `prediction_claims` SQLite table.
 * Supports the prediction resolution scheduler job.
 *
 * The prediction_claims table stores agent predictions about future stock
 * prices. Each claim has:
 *   - A stock_code and target_price
 *   - An operator (">", ">=", "<", "<=") for the evaluation condition
 *   - A confidence score [0.0, 1.0]
 *   - A resolution_date (when to check actual vs target price)
 *   - resolution_outcome (1=true, 0=false, -1=unresolvable, NULL=pending)
 *   - brier_score (set after resolution, NULL if unresolvable)
 *
 * Layer: infrastructure/db — may be imported by scheduler and interface layers.
 *
 * @module infrastructure/db/predictionClaimStore
 */

import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Valid operators for evaluating actual_price vs target_price */
export type ClaimOperator = ">" | ">=" | "<" | "<=";

/** A prediction claim row from SQLite */
export interface PredictionClaimRow {
  id: number;
  stock_code: string;
  claim_text: string;
  target_price: number;
  operator: ClaimOperator;
  confidence: number;
  resolution_date: string;
  resolution_outcome: number | null;
  actual_price: number | null;
  brier_score: number | null;
  created_at: string;
  resolved_at: string | null;
  source_agent: string;
}

/** Input to insert a new prediction claim */
export interface InsertPredictionClaimInput {
  stockCode: string;
  claimText: string;
  targetPrice: number;
  operator: ClaimOperator;
  confidence: number;
  resolutionDate: string;
  sourceAgent?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// DDL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ensures the prediction_claims table exists.
 * Idempotent — safe to call multiple times.
 */
export function ensurePredictionClaimsTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS prediction_claims (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_code          TEXT    NOT NULL,
      claim_text          TEXT    NOT NULL,
      target_price        REAL    NOT NULL,
      operator            TEXT    NOT NULL CHECK(operator IN ('>','>=','<','<=')),
      confidence          REAL    NOT NULL CHECK(confidence BETWEEN 0.0 AND 1.0),
      resolution_date     TEXT    NOT NULL,
      resolution_outcome  INTEGER,
      actual_price        REAL,
      brier_score         REAL,
      created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
      resolved_at         TEXT,
      source_agent        TEXT    NOT NULL DEFAULT 'unknown'
    )
  `);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_pc_stock ON prediction_claims(stock_code)`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_pc_resolution ON prediction_claims(resolution_date)`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_pc_pending ON prediction_claims(resolution_date, resolution_outcome)`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inserts a new prediction claim into the database.
 *
 * @param db    - SQLite database connection
 * @param input - Claim data
 * @returns       The auto-generated row id
 */
export function insertPredictionClaim(
  db: Database,
  input: InsertPredictionClaimInput,
): number {
  const result = db
    .prepare(
      `INSERT INTO prediction_claims
        (stock_code, claim_text, target_price, operator, confidence, resolution_date, source_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.stockCode,
      input.claimText,
      input.targetPrice,
      input.operator,
      input.confidence,
      input.resolutionDate,
      input.sourceAgent ?? "unknown",
    );
  return result.lastInsertRowid as number;
}

/**
 * Fetches all pending prediction claims where:
 *   - resolution_date <= today (due or overdue)
 *   - resolution_outcome IS NULL (not yet resolved)
 *
 * @param db    - SQLite database connection
 * @param today - ISO date string "YYYY-MM-DD" (defaults to today)
 * @returns       Array of pending claim rows, ordered by resolution_date ASC
 */
export function getPendingClaimsForResolution(
  db: Database,
  today?: string,
): PredictionClaimRow[] {
  const resolveDate = today ?? new Date().toISOString().slice(0, 10);
  return db
    .prepare(
      `SELECT * FROM prediction_claims
       WHERE resolution_date <= ?
         AND resolution_outcome IS NULL
       ORDER BY resolution_date ASC`,
    )
    .all(resolveDate) as PredictionClaimRow[];
}

/**
 * Resolves a prediction claim with the actual outcome and price.
 *
 * Sets:
 *   - resolution_outcome: 1 (true) or 0 (false)
 *   - actual_price: actual closing price on resolution date
 *   - brier_score: (outcome - confidence)^2
 *   - resolved_at: current timestamp
 *
 * @param db          - SQLite database connection
 * @param id          - Prediction claim row id
 * @param outcome     - 1 if the condition was true, 0 if false
 * @param actualPrice - The actual closing price on the resolution date
 * @param brierScore  - Computed brier score for this prediction
 */
export function resolveClaim(
  db: Database,
  id: number,
  outcome: 0 | 1,
  actualPrice: number,
  brierScore: number,
): void {
  db.prepare(
    `UPDATE prediction_claims
     SET resolution_outcome = ?,
         actual_price       = ?,
         brier_score        = ?,
         resolved_at        = datetime('now')
     WHERE id = ?`,
  ).run(outcome, actualPrice, brierScore, id);
}

/**
 * Marks a prediction claim as unresolvable when no price data is available
 * after the retry window has passed. Sets resolved_at but leaves brier_score NULL.
 *
 * Uses resolution_outcome = -1 as a sentinel to indicate "unresolvable".
 *
 * @param db - SQLite database connection
 * @param id - Prediction claim row id
 */
export function markClaimUnresolvable(db: Database, id: number): void {
  db.prepare(
    `UPDATE prediction_claims
     SET resolution_outcome = -1,
         brier_score        = NULL,
         resolved_at        = datetime('now')
     WHERE id = ?`,
  ).run(id);
}
