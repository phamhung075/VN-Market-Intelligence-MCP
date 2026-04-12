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
import { logger } from "../infrastructure/logger.js";
import { getDb } from "../infrastructure/db/schema.js";
import { recordJobRun } from "../infrastructure/db/cronJobRunStore.js";
import {
  getPendingClaimsForResolution,
  resolveClaim,
  markClaimUnresolvable,
  type PredictionClaimRow,
} from "../infrastructure/db/predictionClaimStore.js";
import { computeBrierScore } from "../domain/services/baseRateComputer.js";

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
 * Evaluates whether an actual price satisfies the claim's condition.
 *
 * @param actualPrice - Actual closing price
 * @param operator    - Comparison operator: ">" | ">=" | "<" | "<="
 * @param targetPrice - The target price to compare against
 * @returns             1 if condition is true, 0 if false
 */
function evaluateOperator(
  actualPrice: number,
  operator: string,
  targetPrice: number,
): 0 | 1 {
  switch (operator) {
    case ">":
      return actualPrice > targetPrice ? 1 : 0;
    case ">=":
      return actualPrice >= targetPrice ? 1 : 0;
    case "<":
      return actualPrice < targetPrice ? 1 : 0;
    case "<=":
      return actualPrice <= targetPrice ? 1 : 0;
    default:
      return 0;
  }
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
    claims = getPendingClaimsForResolution(database, today);
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
        claim.stock_code,
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
            `[prediction-resolution] unresolvable claim id=${claim.id} stock=${claim.stock_code} date=${claim.resolution_date} daysOverdue=${daysOverdue}`,
          );
        } else {
          // Within retry window — skip for now
          result.skipped++;
          logger.debug(
            `[prediction-resolution] skipping claim id=${claim.id} stock=${claim.stock_code} — no OHLCV yet (daysOverdue=${daysOverdue})`,
          );
        }
        continue;
      }

      // Evaluate the claim condition
      const outcome = evaluateOperator(
        closePrice,
        claim.operator,
        claim.target_price,
      );
      const brierScore = computeBrierScore(outcome, claim.confidence);

      resolveClaim(database, claim.id, outcome, closePrice, brierScore);
      result.resolved++;

      logger.info(
        `[prediction-resolution] resolved claim id=${claim.id} stock=${claim.stock_code} operator=${claim.operator} target=${claim.target_price} actual=${closePrice} outcome=${outcome} brier=${brierScore.toFixed(4)}`,
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
 */
export async function runPredictionResolutionJob(): Promise<void> {
  const db = getDb();
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
