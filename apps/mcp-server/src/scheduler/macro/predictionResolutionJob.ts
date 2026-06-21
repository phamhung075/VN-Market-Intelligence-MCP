/**
 * Prediction Resolution Job — Task 1125 / PRED-RESOLVER-GAP-FIX
 *
 * Daily scheduler job (16:35 UTC, after VN market close) that resolves
 * pending prediction claims by comparing actual prices to claim targets.
 *
 * Algorithm:
 *   1. Fetch all claims where resolution_date <= today AND resolution_outcome IS NULL
 *      AND is_excluded = 0
 *   2. For each claim: look up close price from daily_ohlcv using nearest-trading-day
 *      match (prefer latest bar with date <= resolution_date; fallback: first bar
 *      on/after resolution_date within OHLCV_LOOKFORWARD_DAYS)
 *   3. Evaluate outcome:
 *      - bullish/bearish with target_price: actual >= target ? 1 : 0
 *      - bullish/bearish direction-only: actual vs creation_price
 *      - neutral with creation_price: |actual - creation| / creation < NEUTRAL_BAND_PCT ? 1 : 0
 *      - neutral with creation_price=NULL: excludeClaim (excluded from hitRate)
 *   4. Compute brier_score = (outcome - confidence)^2
 *   5. Call resolveClaim(db, id, outcome, actualPrice) or excludeClaim(db, id)
 *   6. Retry window: if no OHLCV found and resolution_date <= today - RETRY_WINDOW_DAYS,
 *      mark claim unresolvable (brier_score = NULL, is_excluded = 1). Otherwise skip.
 *
 * HARD INVARIANT: no terminal path may leave resolution_outcome NULL once
 * resolved_at is stamped — every resolved claim gets a non-NULL verdict (0/1)
 * OR is_excluded=1 (explicit excluded-from-hitRate status).
 *
 * Registered in jobs.ts at "35 16 * * *" (16:35 UTC = 23:35 VN time, post-close).
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
  excludeClaim,
  type PredictionClaimRow,
} from "../../infrastructure/db/predictionClaimStore.js";
import { NEUTRAL_BAND_PCT } from "../../domain/services/alertThresholds.js";

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
  /** Number of claims marked excluded (neutral with no creation_price) */
  excluded: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Number of calendar days past resolution_date before a claim is unresolvable */
const RETRY_WINDOW_DAYS = 5;

/** Max calendar days to look forward for an OHLCV bar after resolution_date */
const OHLCV_LOOKFORWARD_DAYS = 7;

/**
 * Evaluates whether actual price confirms the claim's direction.
 *
 * Decision table:
 *   target non-null, bullish  → actual >= target ? 1 : 0
 *   target non-null, bearish  → actual <= target ? 1 : 0
 *   target null, creation non-null, bullish  → actual > creation ? 1 : 0
 *   target null, creation non-null, bearish  → actual < creation ? 1 : 0
 *   neutral, creation non-null → |actual - creation| / creation < NEUTRAL_BAND_PCT ? 1 : 0
 *   neutral, creation null     → "excluded" sentinel (caller must call excludeClaim)
 *   target null, creation null, non-neutral → null (caller skips — no baseline)
 *
 * Returns "excluded" string as a sentinel for the neutral+no-creation_price case.
 */
export function evaluateOutcome(
  actualPrice: number,
  direction: string,
  targetPrice: number | null,
  creationPrice: number | null,
): 0 | 1 | "excluded" | null {
  if (targetPrice != null) {
    switch (direction) {
      case "bullish":
        return actualPrice >= targetPrice ? 1 : 0;
      case "bearish":
        return actualPrice <= targetPrice ? 1 : 0;
      case "neutral": {
        // Neutral with explicit target: band around target
        const movePct = Math.abs((actualPrice - targetPrice) / targetPrice) * 100;
        return movePct < NEUTRAL_BAND_PCT ? 1 : 0;
      }
      default:
        return null;
    }
  }

  // Direction-only fallback — requires creation_price as baseline
  if (direction === "neutral") {
    if (creationPrice == null) return "excluded";
    const movePct = Math.abs((actualPrice - creationPrice) / creationPrice) * 100;
    return movePct < NEUTRAL_BAND_PCT ? 1 : 0;
  }

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
 * Fetches claims due for resolution: resolution_date <= today AND unresolved
 * AND not already excluded.
 */
function getClaimsDueForResolution(
  db: Database,
  today: string,
): PredictionClaimRow[] {
  const rows = db
    .prepare(
      `SELECT * FROM prediction_claims
       WHERE resolution_outcome IS NULL
         AND is_excluded = 0
         AND resolution_date <= ?
       ORDER BY resolution_date ASC`,
    )
    .all(today) as PredictionClaimRow[];
  return rows;
}

/**
 * Marks a claim as unresolvable (no price data within retry window).
 * Sets is_excluded=1 so it is excluded from hitRate and not re-picked up.
 *
 * INVARIANT: after this call, is_excluded=1 and resolved_at IS NOT NULL,
 * satisfying the "no terminal NULL without explicit excluded status" contract.
 */
function markClaimUnresolvable(db: Database, id: number): void {
  db.prepare(
    `UPDATE prediction_claims
     SET resolved_at = ?,
         is_excluded = 1
     WHERE id = ?`,
  ).run(new Date().toISOString(), id);
}

/**
 * Fetches the close price from daily_ohlcv using nearest-trading-day matching.
 *
 * Strategy:
 *   1. Prefer the latest bar with date <= resolution_date (prior close on/before)
 *   2. Fallback: first bar with date > resolution_date within OHLCV_LOOKFORWARD_DAYS
 *
 * This resolves the CALENDAR-vs-TRADING-DAY mismatch: when resolution_date falls
 * on a weekend or holiday, the exact-date query returns NULL. Nearest-day matching
 * uses the prior trading day's close (or the next available bar) instead.
 *
 * All parameters are bound — no interpolation.
 *
 * @param db           - SQLite database connection
 * @param stockCode    - Stock ticker, e.g. "VCB"
 * @param resolutionDate - Target date YYYY-MM-DD
 * @returns close price in VND, or null if no OHLCV within lookforward window
 */
export function getClosePriceNearestTradingDay(
  db: Database,
  stockCode: string,
  resolutionDate: string,
): number | null {
  // Leg 1: latest bar on or before resolution_date
  const before = db
    .prepare(
      `SELECT close FROM daily_ohlcv
       WHERE code = ? AND date <= ?
       ORDER BY date DESC
       LIMIT 1`,
    )
    .get(stockCode, resolutionDate) as { close: number } | null;

  if (before !== null) {
    return before.close;
  }

  // Leg 2: first bar strictly after resolution_date (within lookforward window)
  const lookforwardDate = new Date(resolutionDate);
  lookforwardDate.setDate(lookforwardDate.getDate() + OHLCV_LOOKFORWARD_DAYS);
  const lookforwardStr = lookforwardDate.toISOString().slice(0, 10);

  const after = db
    .prepare(
      `SELECT close FROM daily_ohlcv
       WHERE code = ? AND date > ? AND date <= ?
       ORDER BY date ASC
       LIMIT 1`,
    )
    .get(stockCode, resolutionDate, lookforwardStr) as { close: number } | null;

  return after !== null ? after.close : null;
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
 * @returns    Summary of resolved / unresolvable / skipped / excluded claims
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
    excluded: 0,
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
      const closePrice = getClosePriceNearestTradingDay(
        database,
        claim.stock,
        claim.resolution_date,
      );

      if (closePrice === null) {
        // No price data available within lookforward window
        const daysOverdue = daysBetween(claim.resolution_date, today);

        if (daysOverdue > RETRY_WINDOW_DAYS) {
          // Past retry window — mark unresolvable (is_excluded=1 satisfies invariant)
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

      // Evaluate the claim direction against actual price (with neutral-band rule)
      const outcome = evaluateOutcome(
        closePrice,
        claim.direction,
        claim.target_price ?? null,
        claim.creation_price ?? null,
      );

      if (outcome === "excluded") {
        // Neutral claim with no creation_price — exclude from hitRate
        // INVARIANT: excludeClaim sets is_excluded=1 + resolved_at=now (non-NULL)
        excludeClaim(database, claim.id);
        result.excluded++;
        logger.info(
          `[prediction-resolution] excluded claim id=${claim.id} stock=${claim.stock} direction=neutral (no creation_price — cannot score neutral band)`,
        );
        continue;
      }

      if (outcome === null) {
        // Cannot evaluate (unknown direction or no target/creation baseline) — skip
        result.skipped++;
        logger.debug(
          `[prediction-resolution] skipping claim id=${claim.id} stock=${claim.stock} direction=${claim.direction} — no evaluation basis`,
        );
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
    `[prediction-resolution] done — resolved=${result.resolved} unresolvable=${result.unresolvable} skipped=${result.skipped} excluded=${result.excluded}`,
  );

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cron-callable wrapper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cron wrapper for runPredictionResolution.
 * Wraps with recordJobRun for observability.
 * Called daily at 16:35 UTC (35 16 * * *) from jobs.ts.
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
      return { rowsWritten: result.resolved + result.unresolvable + result.excluded };
    });
  } catch (err) {
    logger.error("[prediction-resolution] unhandled error", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
