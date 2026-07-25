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
 * Live contract (STALE EXAMPLE CORRECTED 2026-07-25 —
 * FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT deliverable (h); the 2026-06-11
 * snapshot below was superseded by live growth and had been silently read as
 * settled history for 6 weeks — see the task's root_cause in
 * docs/data/orch/orch-state.json for the full live-probe trail):
 *   Per the 2026-07-25T07:11:04Z live probe (PO, curl against the served
 *   endpoint): 17 total claims, agent_id="08-prediction-synthesizer".
 *   Distribution: 4 correct, 2 wrong, 5 pending, 6 excluded.
 *   hitRate = 4/6 = 0.6667 (correct / (correct+wrong), excluded NOT counted).
 *   (Historical snapshot, now stale: 2026-06-11 probe showed 9 total /
 *   3 correct / 3 wrong / 0 pending / 3 excluded / hitRate 0.50.)
 *
 * Outcome mapping:
 *   is_excluded = 1              → "excluded" (takes PRECEDENCE over null check)
 *   resolution_outcome NULL + is_excluded != 1 → "pending"
 *   resolution_outcome 1         → "correct"
 *   resolution_outcome 0         → "wrong"
 * NOTE: rows with is_excluded=1 have creation_price=NULL — the resolver could not
 * evaluate them (no baseline to score against), so they are terminal; do NOT show
 * as "pending". CORRECTED (2026-07-25): these are NOT necessarily "legacy" —
 * live data showed the NEWEST excluded rows (created 2026-06-24..26) sitting
 * alongside the OLDEST scoreable ones (April 2026); the producer defect
 * (evidenceTools.ts gating creation_price capture behind optional
 * direction+expected_move_pct — fixed by FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT)
 * ran continuously from 2026-06-14 until this fix landed, so "excluded" means
 * "no creation_price baseline", not "old". Existing excluded rows are grandfathered
 * (this fix is a write-path guard only — see FIX-PREDCLAIM-BACKFILL-NULL-CREATIONPRICE
 * for the separate, not-yet-decided backfill question).
 *
 * Query params:
 *   ?limit=N                             — default 100, clamped [1, 500]
 *   ?outcome=correct|wrong|pending|excluded — optional filter (all claims when absent)
 *
 * Sort: resolution_date DESC, id DESC.
 *
 * Response shape (200 OK):
 *   {
 *     generatedAt: string,                // ISO 8601 server clock
 *     calibration: {
 *       total:    number,                 // all claims in DB (unfiltered)
 *       resolved: number,                 // outcome IS NOT NULL (correct + wrong)
 *       correct:  number,
 *       wrong:    number,
 *       pending:  number,                 // resolution_outcome NULL AND NOT is_excluded
 *       excluded: number,                 // is_excluded=1 (NEW — FIX-PRED-CLAIMS-EXCLUDED)
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
 *         outcome:        "correct"|"wrong"|"pending"|"excluded",
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

export type ClaimOutcome = "correct" | "wrong" | "pending" | "excluded";

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
  /** FIX-PRED-CLAIMS-EXCLUDED: count of is_excluded=1 rows (legacy neutral, no creation_price). */
  excluded: number;
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
 * Map a raw resolution_outcome integer (and optional is_excluded flag) to a
 * human-readable outcome string.
 *
 * Precedence rules:
 *   is_excluded=1                → "excluded" (TAKES PRECEDENCE over null check)
 *   resolution_outcome NULL + not excluded → "pending"
 *   resolution_outcome 1         → "correct"
 *   resolution_outcome 0         → "wrong"
 *
 * @param resolution_outcome - Raw DB value (NULL / 0 / 1)
 * @param is_excluded        - DB is_excluded column value (1 = excluded; 0/null = not excluded)
 *
 * Exported for unit testing.
 */
export function mapOutcome(
  resolution_outcome: number | null,
  is_excluded?: number | null,
): ClaimOutcome {
  // is_excluded takes precedence — these rows are terminally excluded, not pending.
  if (is_excluded === 1) return "excluded";
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
    outcome: mapOutcome(row.resolution_outcome, row.is_excluded),
    actualPrice: row.actual_price ?? null,
    brierScore: row.brier_score ?? null,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? null,
  };
}

/**
 * Compute calibration stats across ALL claims (unfiltered — full DB picture).
 *
 * Buckets:
 *   excluded = is_excluded=1 (legacy neutral, no creation_price — terminal, not scored)
 *   pending  = resolution_outcome NULL AND NOT is_excluded
 *   correct  = resolution_outcome = 1
 *   wrong    = resolution_outcome = 0
 *   resolved = correct + wrong (excluded NOT counted)
 *
 * hitRate  = correct / resolved; null when resolved === 0 (no NaN/Infinity).
 *            excluded rows do NOT enter the denominator.
 * avgBrier = mean brier_score over rows where brier_score IS NOT NULL;
 *            null when no such rows exist.
 *
 * Exported for unit testing.
 */
export function computeCalibration(rows: PredictionClaimRow[]): CalibrationSummary {
  let correct = 0;
  let wrong = 0;
  let pending = 0;
  let excluded = 0;
  const brierValues: number[] = [];

  for (const row of rows) {
    if (row.is_excluded === 1) {
      // Terminally excluded — NOT pending, NOT scored.
      excluded++;
    } else if (row.resolution_outcome === null) {
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

  return { total, resolved, correct, wrong, pending, excluded, hitRate, avgBrier };
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
    let outcomeFilter: "correct" | "wrong" | "pending" | "excluded" | undefined;
    if (
      outcomeParam === "correct" ||
      outcomeParam === "wrong" ||
      outcomeParam === "pending" ||
      outcomeParam === "excluded"
    ) {
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
