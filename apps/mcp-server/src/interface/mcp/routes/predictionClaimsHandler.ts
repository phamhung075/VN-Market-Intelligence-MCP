/**
 * predictionClaimsHandler.ts — GET /api/prediction-claims
 *
 * TASK17-PRED endpoint wave:
 * Serve the AI prediction-accountability / calibration ledger for the
 * "Dự báo AI & Kết quả" frontend page.
 *
 * Source table: prediction_claims.
 * Read path: getAllClaimsForTracker() from predictionClaimStore (infrastructure).
 * This handler ONLY maps + aggregates — no SQL here.
 *
 * Live contract (probed 2026-06-11 against named-volume DB):
 *   7 total claims, agent_id="08-prediction-synthesizer".
 *   Distribution: 3 correct, 1 wrong, 3 pending.
 *   Resolved brier scores: FPT 0.0576, BID 0.0529, VIC 0.0441, FPT(wrong) 0.3969.
 *   hitRate = 3/4 = 0.75; avgBrier = (0.0576+0.0529+0.0441+0.3969)/4 ≈ 0.1379.
 *
 * Outcome mapping:
 *   resolution_outcome NULL  → "pending"
 *   resolution_outcome 1     → "correct"
 *   resolution_outcome 0     → "wrong"
 * NOTE: rows with a past resolution_date but outcome=NULL are "pending" — the
 * resolver could not determine the outcome (e.g. neutral claims, missing price).
 * Do NOT invent a verdict.
 *
 * Query params:
 *   ?limit=N         — default 100, clamped [1, 500]
 *   ?outcome=correct|wrong|pending — optional filter (all claims when absent)
 *
 * Sort: resolution_date DESC, id DESC.
 *
 * Response shape (200 OK):
 *   {
 *     generatedAt: string,                // ISO 8601 server clock
 *     calibration: {
 *       total:    number,                 // all claims in DB (unfiltered)
 *       resolved: number,                 // outcome IS NOT NULL
 *       correct:  number,
 *       wrong:    number,
 *       pending:  number,
 *       hitRate:  number | null,          // correct/resolved; null when resolved=0
 *       avgBrier: number | null,          // mean brier over resolved rows with brier_score; null when none
 *     },
 *     claims: [
 *       {
 *         id:             number,
 *         stock:          string,
 *         agentId:        string,
 *         claimText:      string,
 *         direction:      "bullish"|"bearish"|"neutral",
 *         targetPrice:    number | null,
 *         creationPrice:  number | null,
 *         confidence:     number,
 *         resolutionDate: string,
 *         outcome:        "correct"|"wrong"|"pending",
 *         actualPrice:    number | null,
 *         brierScore:     number | null,
 *         createdAt:      string,
 *         resolvedAt:     string | null,
 *       },
 *       ...
 *     ],
 *     count: number,                      // claims.length (post-filter)
 *   }
 *
 * 200 + empty claims[] when no rows exist (no error).
 * 500 on DB error.
 *
 * DDD Layer: interface — db injected by server.ts (no getDb() here).
 * Imports ONLY from predictionClaimStore (infrastructure/db) — no domain imports.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import {
  getAllClaimsForTracker,
  type PredictionClaimRow,
} from "../../../infrastructure/db/predictionClaimStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ClaimOutcome = "correct" | "wrong" | "pending";

/** One claim item in the response. */
export interface PredictionClaimItem {
  id: number;
  stock: string;
  agentId: string;
  claimText: string;
  direction: "bullish" | "bearish" | "neutral";
  targetPrice: number | null;
  creationPrice: number | null;
  confidence: number;
  resolutionDate: string;
  outcome: ClaimOutcome;
  actualPrice: number | null;
  brierScore: number | null;
  createdAt: string;
  resolvedAt: string | null;
}

/** Calibration summary across all claims (unfiltered). */
export interface CalibrationSummary {
  total: number;
  resolved: number;
  correct: number;
  wrong: number;
  pending: number;
  /** correct / resolved; null when resolved === 0 (guards divide-by-zero). */
  hitRate: number | null;
  /** Mean brier score over resolved rows that have a brier_score; null when none. */
  avgBrier: number | null;
}

/** Full response body for GET /api/prediction-claims. */
export interface PredictionClaimsResponse {
  generatedAt: string;
  calibration: CalibrationSummary;
  claims: PredictionClaimItem[];
  count: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers — exported for testability
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map a raw resolution_outcome integer to a human-readable outcome string.
 * NULL → "pending", 1 → "correct", 0 → "wrong".
 * Exported for unit testing.
 */
export function mapOutcome(resolution_outcome: number | null): ClaimOutcome {
  if (resolution_outcome === null) return "pending";
  if (resolution_outcome === 1) return "correct";
  return "wrong";
}

/**
 * Map a PredictionClaimRow (infrastructure) to a PredictionClaimItem (response).
 * All nullable columns pass through as null — never coerced to 0.
 * Exported for testability.
 */
export function mapClaimRow(row: PredictionClaimRow): PredictionClaimItem {
  return {
    id: row.id,
    stock: row.stock,
    agentId: row.agent_id,
    claimText: row.claim_text,
    direction: row.direction as "bullish" | "bearish" | "neutral",
    targetPrice: row.target_price ?? null,
    creationPrice: row.creation_price ?? null,
    confidence: row.confidence,
    resolutionDate: row.resolution_date,
    outcome: mapOutcome(row.resolution_outcome),
    actualPrice: row.actual_price ?? null,
    brierScore: row.brier_score ?? null,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? null,
  };
}

/**
 * Compute calibration stats across ALL claims (unfiltered — full DB picture).
 *
 * hitRate  = correct / resolved; null when resolved === 0 (no NaN/Infinity).
 * avgBrier = mean brier_score over rows where brier_score IS NOT NULL;
 *            null when no such rows exist.
 *
 * Exported for unit testing.
 */
export function computeCalibration(rows: PredictionClaimRow[]): CalibrationSummary {
  let correct = 0;
  let wrong = 0;
  let pending = 0;
  const brierValues: number[] = [];

  for (const row of rows) {
    if (row.resolution_outcome === null) {
      pending++;
    } else if (row.resolution_outcome === 1) {
      correct++;
    } else {
      wrong++;
    }
    if (row.brier_score !== null) {
      brierValues.push(row.brier_score);
    }
  }

  const resolved = correct + wrong;
  const total = rows.length;

  const hitRate = resolved === 0
    ? null
    : correct / resolved;

  const avgBrier = brierValues.length === 0
    ? null
    : brierValues.reduce((sum, v) => sum + v, 0) / brierValues.length;

  return { total, resolved, correct, wrong, pending, hitRate, avgBrier };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle GET /api/prediction-claims.
 *
 * @param req  - Incoming HTTP request (reads ?limit= and ?outcome= query params)
 * @param res  - HTTP response
 * @param db   - SQLite database instance (injected by server.ts)
 * @param now  - Optional clock override for testability (defaults to new Date())
 */
export function handleGetPredictionClaims(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  now: Date = new Date(),
): void {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");

    // Parse ?limit= param — default 100, clamp [1, 500]
    const limitParam = url.searchParams.get("limit");
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(limitParam ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
    );

    // Parse ?outcome= optional filter
    const outcomeParam = url.searchParams.get("outcome");
    let outcomeFilter: "correct" | "wrong" | "pending" | undefined;
    if (outcomeParam === "correct" || outcomeParam === "wrong" || outcomeParam === "pending") {
      outcomeFilter = outcomeParam;
    }

    // For calibration: always fetch ALL claims (unfiltered) for aggregate stats.
    // The filtered set is what goes into the claims[] response array.
    const allRows = getAllClaimsForTracker(db, MAX_LIMIT);
    const calibration = computeCalibration(allRows);

    // Get the (possibly filtered + limited) claims for the response array
    const claimRows = getAllClaimsForTracker(db, limit, outcomeFilter);
    const claims = claimRows.map(mapClaimRow);

    const body: PredictionClaimsResponse = {
      generatedAt: now.toISOString(),
      calibration,
      claims,
      count: claims.length,
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "db_error",
        detail: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
