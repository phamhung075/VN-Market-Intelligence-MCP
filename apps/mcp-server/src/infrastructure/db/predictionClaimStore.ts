/**
 * Task 1123 — predictionClaimStore
 *
 * CRUD helpers for the `prediction_claims` table.
 * Part of the Prediction Engine Phase B (Sprint 059).
 *
 * Prediction claims are agent-generated forward assertions (e.g. "VCB will rise
 * 10% in 30 days"). A resolution job resolves them after the resolution_date
 * by comparing actual price against the claim, computing a Brier score for
 * calibration tracking.
 *
 * Brier score = (outcome - confidence)^2
 *   outcome=1 (correct), outcome=0 (incorrect), confidence ∈ [0,1]
 *   Lower is better. A perfectly calibrated agent scores 0.0.
 *
 * Layer: infrastructure/db — no domain imports.
 * All queries use parameterized bindings — never string-interpolate user input.
 *
 * @module infrastructure/db/predictionClaimStore
 */

import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ClaimDirection = "bullish" | "bearish" | "neutral";

/**
 * Input shape for inserting a new prediction claim.
 * `created_at` is computed by the store — callers do not supply it.
 */
export interface PredictionClaimInput {
  /** Stock ticker, e.g. "VCB" */
  stock: string;
  /** Agent that produced this claim, e.g. "04-market-watcher" */
  agent_id: string;
  /** Free-text description of the prediction, e.g. "VCB sẽ tăng 10% trong 30 ngày" */
  claim_text: string;
  /** Directional stance of the prediction */
  direction: ClaimDirection;
  /**
   * Target price in VND (absolute, not percentage).
   * Optional — some claims are directional-only without a specific price target.
   */
  target_price?: number | null;
  /**
   * Price at claim-creation time (close from daily_ohlcv).
   * Nullable — legacy rows inserted before Sprint 065 have NULL.
   */
  creation_price?: number | null;
  /** ISO 8601 date (YYYY-MM-DD) by which the claim should be resolved */
  resolution_date: string;
  /** Agent's stated confidence: 0.0 (no confidence) – 1.0 (certain) */
  confidence: number;
}

/** Full row from the prediction_claims table */
export interface PredictionClaimRow extends PredictionClaimInput {
  id: number;
  /** NULL = pending, 1 = correct, 0 = incorrect */
  resolution_outcome: number | null;
  /** Actual price at resolution time, in VND */
  actual_price: number | null;
  /**
   * Brier score computed at resolution: (outcome - confidence)^2.
   * NULL until the claim is resolved.
   */
  brier_score: number | null;
  /** Sprint 065 — price at claim-creation time. NULL for legacy rows. */
  creation_price: number | null;
  /** ISO 8601 UTC — when the claim was recorded */
  created_at: string;
  /** ISO 8601 UTC — when the claim was resolved. NULL while pending. */
  resolved_at: string | null;
}

/** Raw SQLite row shape from prediction_claims */
interface ClaimDbRow {
  id: number;
  stock: string;
  agent_id: string;
  claim_text: string;
  direction: string;
  target_price: number | null;
  resolution_date: string;
  confidence: number;
  resolution_outcome: number | null;
  actual_price: number | null;
  brier_score: number | null;
  created_at: string;
  resolved_at: string | null;
  creation_price: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function mapRow(r: ClaimDbRow): PredictionClaimRow {
  return {
    id: r.id,
    stock: r.stock,
    agent_id: r.agent_id,
    claim_text: r.claim_text,
    direction: r.direction as ClaimDirection,
    target_price: r.target_price ?? null,
    resolution_date: r.resolution_date,
    confidence: r.confidence,
    resolution_outcome: r.resolution_outcome,
    actual_price: r.actual_price,
    brier_score: r.brier_score,
    creation_price: r.creation_price ?? null,   // Sprint 065
    created_at: r.created_at,
    resolved_at: r.resolved_at,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Write helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert a new prediction claim.
 *
 * Uses INSERT OR IGNORE — duplicate (stock, claim_text, resolution_date) triplets
 * are silently skipped. Returns the new row's id, or 0 if the insert was a no-op.
 *
 * @returns The new row's auto-increment id, or 0 if already exists (IGNORE).
 */
export function insertPredictionClaim(
  db: Database,
  params: PredictionClaimInput,
): number {
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO prediction_claims
         (stock, agent_id, claim_text, direction, target_price,
          resolution_date, confidence, creation_price)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      params.stock,
      params.agent_id,
      params.claim_text,
      params.direction,
      params.target_price ?? null,
      params.resolution_date,
      params.confidence,
      params.creation_price ?? null,
    );

  return result.changes > 0 ? (result.lastInsertRowid as number) : 0;
}

/**
 * Set the outcome of a prediction claim and compute its Brier score.
 *
 * Brier score = (outcome - confidence)^2.
 *
 * @param db         - SQLite database connection
 * @param id         - Row id of the claim to resolve
 * @param outcome    - 1 if the claim was correct, 0 if incorrect
 * @param actualPrice - The observed price at resolution time (in VND)
 */
export function resolveClaim(
  db: Database,
  id: number,
  outcome: 0 | 1,
  actualPrice: number,
): void {
  // Read confidence for Brier score computation
  const row = db
    .prepare("SELECT confidence FROM prediction_claims WHERE id = ?")
    .get(id) as { confidence: number } | null;

  if (!row) return;

  const brierScore = Math.pow(outcome - row.confidence, 2);
  const resolvedAt = new Date().toISOString();

  db.prepare(
    `UPDATE prediction_claims
     SET resolution_outcome = ?,
         actual_price       = ?,
         brier_score        = ?,
         resolved_at        = ?
     WHERE id = ?`,
  ).run(outcome, actualPrice, brierScore, resolvedAt, id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Read helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return pending claims — where resolution_outcome IS NULL and
 * resolution_date >= today (claims not yet due for resolution are excluded
 * only if resolution_date < today).
 *
 * @param db    - SQLite database connection
 * @param stock - Optional stock ticker to filter by. Returns all stocks if omitted.
 * @returns Claims ordered by resolution_date ASC (soonest first)
 */
export function getPendingClaims(
  db: Database,
  stock?: string,
): PredictionClaimRow[] {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  if (stock) {
    const rows = db
      .prepare(
        `SELECT * FROM prediction_claims
         WHERE resolution_outcome IS NULL
           AND resolution_date >= ?
           AND stock = ?
         ORDER BY resolution_date ASC`,
      )
      .all(today, stock) as ClaimDbRow[];
    return rows.map(mapRow);
  }

  const rows = db
    .prepare(
      `SELECT * FROM prediction_claims
       WHERE resolution_outcome IS NULL
         AND resolution_date >= ?
       ORDER BY resolution_date ASC`,
    )
    .all(today) as ClaimDbRow[];
  return rows.map(mapRow);
}

/**
 * Return resolved claims — where resolution_outcome IS NOT NULL.
 *
 * Ordered newest-resolved-first (resolved_at DESC).
 *
 * @param db    - SQLite database connection
 * @param stock - Optional stock ticker to filter by
 * @param limit - Max number of rows to return (default: 50)
 */
export function getResolvedClaims(
  db: Database,
  stock?: string,
  limit = 50,
): PredictionClaimRow[] {
  if (stock) {
    const rows = db
      .prepare(
        `SELECT * FROM prediction_claims
         WHERE resolution_outcome IS NOT NULL
           AND stock = ?
         ORDER BY resolved_at DESC
         LIMIT ?`,
      )
      .all(stock, limit) as ClaimDbRow[];
    return rows.map(mapRow);
  }

  const rows = db
    .prepare(
      `SELECT * FROM prediction_claims
       WHERE resolution_outcome IS NOT NULL
       ORDER BY resolved_at DESC
       LIMIT ?`,
    )
    .all(limit) as ClaimDbRow[];
  return rows.map(mapRow);
}

/**
 * Return all claims (pending + resolved) by a given agent.
 *
 * Ordered by created_at DESC (newest first).
 *
 * @param db      - SQLite database connection
 * @param agentId - Agent identifier, e.g. "04-market-watcher"
 */
export function getClaimsByAgent(
  db: Database,
  agentId: string,
): PredictionClaimRow[] {
  const rows = db
    .prepare(
      `SELECT * FROM prediction_claims
       WHERE agent_id = ?
       ORDER BY created_at DESC`,
    )
    .all(agentId) as ClaimDbRow[];
  return rows.map(mapRow);
}

/**
 * Return ALL claims (resolved + pending) ordered for the calibration tracker:
 * resolution_date DESC, then id DESC (newest due-date first; ties broken by insert order).
 *
 * Used by GET /api/prediction-claims — the "Dự báo AI & Kết quả" accountability ledger.
 *
 * Optional filters:
 *   - outcome: "correct" | "wrong" | "pending" — maps to resolution_outcome 1/0/NULL
 *
 * @param db      - SQLite database connection
 * @param limit   - Max rows to return (default 100, caller should clamp to [1,500])
 * @param outcome - Optional outcome filter ("correct" | "wrong" | "pending")
 */
export function getAllClaimsForTracker(
  db: Database,
  limit = 100,
  outcome?: "correct" | "wrong" | "pending",
): PredictionClaimRow[] {
  if (outcome === "correct") {
    const rows = db
      .prepare(
        `SELECT * FROM prediction_claims
         WHERE resolution_outcome = 1
         ORDER BY resolution_date DESC, id DESC
         LIMIT ?`,
      )
      .all(limit) as ClaimDbRow[];
    return rows.map(mapRow);
  }

  if (outcome === "wrong") {
    const rows = db
      .prepare(
        `SELECT * FROM prediction_claims
         WHERE resolution_outcome = 0
         ORDER BY resolution_date DESC, id DESC
         LIMIT ?`,
      )
      .all(limit) as ClaimDbRow[];
    return rows.map(mapRow);
  }

  if (outcome === "pending") {
    const rows = db
      .prepare(
        `SELECT * FROM prediction_claims
         WHERE resolution_outcome IS NULL
         ORDER BY resolution_date DESC, id DESC
         LIMIT ?`,
      )
      .all(limit) as ClaimDbRow[];
    return rows.map(mapRow);
  }

  // No outcome filter — return all
  const rows = db
    .prepare(
      `SELECT * FROM prediction_claims
       ORDER BY resolution_date DESC, id DESC
       LIMIT ?`,
    )
    .all(limit) as ClaimDbRow[];
  return rows.map(mapRow);
}
