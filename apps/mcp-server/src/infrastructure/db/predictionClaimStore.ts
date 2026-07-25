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
import { z } from "zod";
import { sendTelegramBug } from "../notifiers/telegram.js";

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
   * Type kept nullable for structural compatibility with legacy rows /
   * PredictionClaimRow — but FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT
   * (2026-07-25) added a store-boundary Zod contract to insertPredictionClaim()
   * that REFUSES (throws) any insert where this resolves to null/undefined.
   * A claim with no creation-time baseline price can never be resolved (the
   * resolver has nothing to compare actual_price against) — legacy NULL rows
   * pre-date this contract and remain readable, but no NEW insert can create one.
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
  /**
   * PRED-RESOLVER-GAP-FIX — 1 if this claim is excluded from hitRate/Brier scoring.
   * Used for legacy neutral claims where creation_price=NULL and no band can be computed.
   * Excluded claims have resolved_at set but resolution_outcome stays NULL.
   * Defaults to 0 (not excluded) for rows that predate this column.
   */
  is_excluded?: number;
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
  /** PRED-RESOLVER-GAP-FIX: 0 = normal, 1 = excluded from hitRate */
  is_excluded: number | null;
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
    is_excluded: r.is_excluded ?? 0,             // PRED-RESOLVER-GAP-FIX
    created_at: r.created_at,
    resolved_at: r.resolved_at,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Write-door contract (FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT, 2026-07-25)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert-time contract for prediction_claims — enforced at the domain/
 * infrastructure STORE boundary per
 * docs/architecture-briefs/2026-07-25-input-validation-coverage-blueprint.md
 * §1.4 (Class-A / Point-2: server write-door, `SomeSchema.strict().safeParse()`
 * at the store — NEVER only in the interface/mcp/tools/ handler — so any
 * caller of insertPredictionClaim, present or future, is covered).
 *
 * creation_price is REQUIRED (a finite number, never null/undefined): a claim
 * without a creation-time baseline price can never be resolved — the resolver
 * (predictionResolutionJob) has nothing to compare actual_price against, so
 * the row is permanently unscoreable. 100% of claims minted since 2026-06-14
 * had creation_price=NULL for exactly this reason (a caller-side conditional
 * that only looked up the price when two OPTIONAL params happened to be
 * supplied together). This schema makes the write itself refuse ANY insert
 * that would persist a scoreless claim, regardless of caller.
 *
 * `.strict()` — reject unknown keys (blueprint §3 default for every new schema).
 */
const PredictionClaimInsertSchema = z
  .object({
    stock: z.string().min(1),
    agent_id: z.string().min(1),
    claim_text: z.string().min(1),
    direction: z.enum(["bullish", "bearish", "neutral"]),
    target_price: z.number().nullable().optional(),
    creation_price: z
      .number({
        required_error:
          "creation_price is required — a claim without a creation-time baseline price can never be scored",
        invalid_type_error:
          "creation_price must be a finite number (null is not accepted) — a claim without a creation-time baseline price can never be scored",
      })
      .finite(),
    resolution_date: z.string().min(1),
    confidence: z.number().min(0).max(1),
  })
  .strict();

/**
 * Format a Zod validation failure using the blueprint §2 canonical
 * descriptive-error contract (per-field field/problem/expected/originalValue).
 * Merged shape per §2: agentSignalTools.ts's top-line-message pattern +
 * foreignFlowValidator's {field, reason, originalValue} + the
 * SSOT-zod-validation-directive auto-fix contract (path/problem/expected/fix).
 *
 * The full `ValidationRejection` envelope (surface/class/rejectedAt/errors[])
 * and the shared `write_rejections` audit sink are IVC-A2 scope (not yet
 * built) — this local formatter emits the same per-field wording so it is a
 * drop-in match once that shared module lands.
 */
function formatWriteRejection(
  surface: string,
  error: z.ZodError,
  candidate: Record<string, unknown>,
): string {
  const lines = error.issues.map((issue, i) => {
    const field = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    const originalValue = field in candidate ? candidate[field] : undefined;
    const expected = issue.code === "invalid_type" ? issue.expected : undefined;
    const suffix = expected
      ? ` (expected: ${expected}, got: ${JSON.stringify(originalValue)})`
      : ` (got: ${JSON.stringify(originalValue)})`;
    return `[${i + 1}] ${field}: ${issue.message}${suffix}`;
  });

  return `${surface} rejected — invalid or missing required fields:\n${lines.join("\n")}\n\nFix and retry.`;
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
 * Write-door contract (FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT): throws
 * a descriptive Error (see formatWriteRejection) when `params` fails
 * PredictionClaimInsertSchema — in practice this means a null/undefined/non-finite
 * `creation_price`. Callers that already wrap this in try/catch (e.g. the
 * non-fatal chain-synthesis auto-claim path) degrade gracefully; the MCP tool
 * handler's existing try/catch surfaces the message directly to the caller.
 *
 * @returns The new row's auto-increment id, or 0 if already exists (IGNORE).
 * @throws {Error} when params fails the insert-time write-door contract.
 */
export function insertPredictionClaim(
  db: Database,
  params: PredictionClaimInput,
): number {
  const parsed = PredictionClaimInsertSchema.safeParse(params);
  if (!parsed.success) {
    const rejectionMessage = formatWriteRejection(
      "predictionClaimStore.insertPredictionClaim",
      parsed.error,
      params as unknown as Record<string, unknown>,
    );
    // Fail-loud (docs/protocols/fail-loud-protocol.md): throw AND alert — never
    // fall back to silently writing null. Fire-and-forget (not awaited): this
    // function is a widely-used synchronous store call (~30 call sites incl.
    // tests); sendTelegramBug already "never throws" by its own contract
    // (best-effort — missing env config silently no-ops), so a synchronous
    // dispatch-then-throw gives the caller the immediate rejection while the
    // alert lands independently, matching the non-fatal-notification pattern
    // already used elsewhere in this codebase (e.g. chain-synthesis claim
    // insert, SLA monitor direct alerts).
    void sendTelegramBug(rejectionMessage).catch(() => {});
    throw new Error(rejectionMessage);
  }

  const result = db
    .prepare(
      `INSERT OR IGNORE INTO prediction_claims
         (stock, agent_id, claim_text, direction, target_price,
          resolution_date, confidence, creation_price)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      parsed.data.stock,
      parsed.data.agent_id,
      parsed.data.claim_text,
      parsed.data.direction,
      parsed.data.target_price ?? null,
      parsed.data.resolution_date,
      parsed.data.confidence,
      parsed.data.creation_price,
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

/**
 * Mark a prediction claim as excluded from hitRate/Brier scoring.
 *
 * Used for legacy neutral claims where creation_price=NULL and no neutral-band
 * evaluation is possible. Sets is_excluded=1 and resolved_at=now so the claim
 * is no longer picked up by the pending-claims query.
 *
 * HARD INVARIANT: after this call, resolved_at IS NOT NULL and is_excluded=1 —
 * satisfying the "no terminal path leaves outcome NULL without explicit excluded
 * status" contract from PRED-RESOLVER-GAP-FIX.
 *
 * @param db - SQLite database connection
 * @param id - Row id of the claim to exclude
 */
export function excludeClaim(db: Database, id: number): void {
  const resolvedAt = new Date().toISOString();
  db.prepare(
    `UPDATE prediction_claims
     SET is_excluded = 1,
         resolved_at = ?
     WHERE id = ?`,
  ).run(resolvedAt, id);
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
 * Return ALL claims (resolved + pending + excluded) ordered for the calibration tracker:
 * resolution_date DESC, then id DESC (newest due-date first; ties broken by insert order).
 *
 * Used by GET /api/prediction-claims — the "Dự báo AI & Kết quả" accountability ledger.
 *
 * Optional filters:
 *   - outcome: "correct" | "wrong" | "pending" | "excluded"
 *     Maps to:
 *       correct  → resolution_outcome = 1
 *       wrong    → resolution_outcome = 0
 *       pending  → resolution_outcome IS NULL AND (is_excluded IS NULL OR is_excluded = 0)
 *       excluded → is_excluded = 1
 *
 * @param db      - SQLite database connection
 * @param limit   - Max rows to return (default 100, caller should clamp to [1,500])
 * @param outcome - Optional outcome filter ("correct" | "wrong" | "pending" | "excluded")
 */
export function getAllClaimsForTracker(
  db: Database,
  limit = 100,
  outcome?: "correct" | "wrong" | "pending" | "excluded",
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
    // Tighten: exclude is_excluded=1 rows — they are NOT pending even though
    // resolution_outcome IS NULL (they are terminally excluded, not awaiting resolution).
    const rows = db
      .prepare(
        `SELECT * FROM prediction_claims
         WHERE resolution_outcome IS NULL
           AND (is_excluded IS NULL OR is_excluded = 0)
         ORDER BY resolution_date DESC, id DESC
         LIMIT ?`,
      )
      .all(limit) as ClaimDbRow[];
    return rows.map(mapRow);
  }

  if (outcome === "excluded") {
    // PRED-RESOLVER-GAP-FIX consumer: return terminally excluded legacy claims.
    const rows = db
      .prepare(
        `SELECT * FROM prediction_claims
         WHERE is_excluded = 1
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
