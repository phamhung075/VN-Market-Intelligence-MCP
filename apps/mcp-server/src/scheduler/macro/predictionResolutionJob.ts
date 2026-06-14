/**
 * Prediction Resolution Job — Task 1125
 *
 * Daily scheduler job (16:30 UTC, after VN market close) that resolves
 * pending prediction claims by comparing actual prices to claim targets.
 *
 * Algorithm:
 *   1. Fetch all claims where resolution_date <= today AND resolution_outcome IS NULL
 *   2. For each claim: look up close price from daily_ohlcv on resolution_date
 *   3. Evaluate operator: ">", ">=", "<", "<=" against target_price → outcome 0|1
 *   4. Compute brier_score = (outcome - confidence)^2
 *   5. Call resolveClaim(db, id, outcome, actualPrice, brierScore)
 *   6. Retry window: if no OHLCV found and resolution_date <= today - 5 days,
 *      mark claim unresolvable (brier_score = NULL). Otherwise skip (retry tomorrow).
 *
 * Registered in jobs.ts at "30 16 * * *" (16:30 UTC = 23:30 VN time, post-close).
 *
 * Layer: scheduler — imports from infrastructure and domain only.
 *
 * @module scheduler/predictionResolutionJob
 */

import type { Database } from "bun:sqlite";
import { logger } from "../../infrastructure/logger.js";
import { getDb } from "../../infrastructure/db/schema.js";
import { recordJobRun } from "../../infrastructure/db/cronJobRunStore.js";
import { shouldSkipRecoveryReplay } from "../startupHelpers.js";
import {
  resolveClaim,
  type PredictionClaimRow,
} from "../../infrastructure/db/predictionClaimStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PredictionResolutionResult {
  /** Number of claims successfully resolved (outcome 0 or 1) */
  resolved: number;
  /** Number of claims marked unresolvable (past retry window, no price data) */
  unresolvable: number;
  /** Number of claims skipped (no price data, within retry window) */
  skipped: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Number of calendar days past resolution_date before a claim is unresolvable */
const RETRY_WINDOW_DAYS = 5;

/**
 * Evaluates whether actual price confirms the claim's direction.
 *
 * Decision table:
 *   target non-null, bullish  → actual >= target ? 1 : 0
 *   target non-null, bearish  → actual <= target ? 1 : 0
 *   target null, creation non-null, bullish  → actual > creation ? 1 : 0
 *   target null, creation non-null, bearish  → actual < creation ? 1 : 0
 *   target null, creation null   → null (skip — no baseline)
 *   neutral / other direction    → null (skip)
 */
function evaluateOutcome(
  actualPrice: number,
  direction: string,
  targetPrice: number | null,
  creationPrice: number | null,
): 0 | 1 | null {
  if (targetPrice != null) {
    switch (direction) {
      case "bullish":
        return actualPrice >= targetPrice ? 1 : 0;
      case "bearish":
        return actualPrice <= targetPrice ? 1 : 0;
      default:
        return null;
    }
  }
  // Direction-only fallback — requires creation_price as baseline
  if (creationPrice == null) return null;
  switch (direction) {
    case "bullish":
      return actualPrice > creationPrice ? 1 : 0;
    case "bearish":
      return actualPrice < creationPrice ? 1 : 0;
    default:
      return null;
  }
}

/**
 * Fetches claims due for resolution: resolution_date <= today AND unresolved.
 */
function getClaimsDueForResolution(
  db: Database,
  today: string,
): PredictionClaimRow[] {
  const rows = db
    .prepare(
      `SELECT * FROM prediction_claims
       WHERE resolution_outcome IS NULL
         AND resolution_date <= ?
       ORDER BY resolution_date ASC`,
    )
    .all(today) as PredictionClaimRow[];
  return rows;
}

/**
 * Marks a claim as unresolvable (no price data within retry window).
 */
function markClaimUnresolvable(db: Database, id: number): void {
  db.prepare(
    `UPDATE prediction_claims
     SET resolved_at = ?
     WHERE id = ?`,
  ).run(new Date().toISOString(), id);
}

/**
 * Fetches the close price from daily_ohlcv for a given stock and date.
 * Returns null if no row is found.
 */
function getClosePrice(
  db: Database,
  stockCode: string,
  date: string,
): number | null {
  const row = db
    .prepare(
      `SELECT close FROM daily_ohlcv WHERE code = ? AND date = ? LIMIT 1`,
    )
    .get(stockCode, date) as { close: number } | undefined;
  return row?.close ?? null;
}

/**
 * Returns the number of calendar days between two ISO date strings.
 * Result is positive if dateTo > dateFrom.
 */
function daysBetween(dateFrom: string, dateTo: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor(
    (new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / msPerDay,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Core logic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs the prediction resolution pass.
 *
 * Accepts an optional `db` for dependency injection in tests.
 * The function NEVER throws — all errors are caught and logged.
 *
 * @param db - SQLite database connection (defaults to production singleton)
 * @returns    Summary of resolved / unresolvable / skipped claims
 */
export async function runPredictionResolution(
  db?: Database,
): Promise<PredictionResolutionResult> {
  const database = db ?? getDb();
  const today = new Date().toISOString().slice(0, 10);

  const result: PredictionResolutionResult = {
    resolved: 0,
    unresolvable: 0,
    skipped: 0,
  };

  let claims: PredictionClaimRow[];
  try {
    claims = getClaimsDueForResolution(database, today);
  } catch (err) {
    logger.error("[prediction-resolution] failed to fetch pending claims", {
      error: err instanceof Error ? err.message : String(err),
    });
    return result;
  }

  if (claims.length === 0) {
    logger.debug("[prediction-resolution] no pending claims — done");
    return result;
  }

  logger.info(
    `[prediction-resolution] processing ${claims.length} pending claims`,
  );

  for (const claim of claims) {
    try {
      const closePrice = getClosePrice(
        database,
        claim.stock,
        claim.resolution_date,
      );

      if (closePrice === null) {
        // No price data available
        const daysOverdue = daysBetween(claim.resolution_date, today);

        if (daysOverdue > RETRY_WINDOW_DAYS) {
          // Past retry window — mark unresolvable
          markClaimUnresolvable(database, claim.id);
          result.unresolvable++;
          logger.info(
            `[prediction-resolution] unresolvable claim id=${claim.id} stock=${claim.stock} date=${claim.resolution_date} daysOverdue=${daysOverdue}`,
          );
        } else {
          // Within retry window — skip for now
          result.skipped++;
          logger.debug(
            `[prediction-resolution] skipping claim id=${claim.id} stock=${claim.stock} — no OHLCV yet (daysOverdue=${daysOverdue})`,
          );
        }
        continue;
      }

      // Evaluate the claim direction against actual price
      const outcome = evaluateOutcome(
        closePrice,
        claim.direction,
        claim.target_price ?? null,
        claim.creation_price ?? null,   // Sprint 065 — direction-only fallback baseline
      );

      if (outcome === null) {
        // Cannot evaluate (neutral direction or no target_price) — skip
        result.skipped++;
        continue;
      }

      resolveClaim(database, claim.id, outcome, closePrice);
      result.resolved++;

      logger.info(
        `[prediction-resolution] resolved claim id=${claim.id} stock=${claim.stock} direction=${claim.direction} target=${claim.target_price} actual=${closePrice} outcome=${outcome}`,
      );
    } catch (err) {
      logger.error(
        `[prediction-resolution] error processing claim id=${claim.id}`,
        { error: err instanceof Error ? err.message : String(err) },
      );
      result.skipped++;
    }
  }

  logger.info(
    `[prediction-resolution] done — resolved=${result.resolved} unresolvable=${result.unresolvable} skipped=${result.skipped}`,
  );

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cron-callable wrapper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cron wrapper for runPredictionResolution.
 * Wraps with recordJobRun for observability.
 * Called daily at 16:30 UTC (30 16 * * *) from jobs.ts.
 *
 * @idempotency T4 — cron_job_runs recency guard; replay skipped if last success < 90% of daily cadence (21.6h window)
 */
export async function runPredictionResolutionJob(): Promise<void> {
  const db = getDb();

  const DAILY_CADENCE_MS = 86_400_000;
  if (shouldSkipRecoveryReplay(db, "predictionResolutionJob", DAILY_CADENCE_MS)) return;

  try {
    await recordJobRun(db, "predictionResolutionJob", async () => {
      const result = await runPredictionResolution(db);
      return { rowsWritten: result.resolved + result.unresolvable };
    });
  } catch (err) {
    logger.error("[prediction-resolution] unhandled error", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
