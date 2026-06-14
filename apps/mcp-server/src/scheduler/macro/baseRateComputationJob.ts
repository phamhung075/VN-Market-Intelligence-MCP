/**
 * Task 1122 — baseRateComputationJob
 *
 * Weekly scheduler job (Sunday 19:00 UTC = 02:00 VN Monday) that:
 * 1. Queries distinct (evidence_type, direction) pairs from evidence_fragments
 * 2. For each pair × each horizon in [5, 10, 20]:
 *    a. Counts resolvable fragments older than horizonDays
 *    b. Determines hit rate: did price move ≥ 3% in the expected direction?
 *    c. Computes base rate via computeRollingBaseRate per stock
 *    d. Computes likelihood_ratio = clamp(hit_rate / base_rate)
 *    e. Upserts to evidence_likelihood_ratios via likelihoodRatioStore
 * 3. Rows with sample_size < 10 are upserted with likelihood_ratio = 1.0
 *    (business rule enforced at store layer)
 *
 * Part of the Prediction Engine Phase B (Sprint 059).
 *
 * Layer: scheduler — imports from both domain (baseRateComputer) and
 * infrastructure (likelihoodRatioStore, schema, cronJobRunStore).
 *
 * @module scheduler/baseRateComputationJob
 */

import type { Database } from "bun:sqlite";
import { logger } from "../../infrastructure/logger.js";
import { getDb } from "../../infrastructure/db/schema.js";
import { recordJobRun } from "../../infrastructure/db/cronJobRunStore.js";
import { shouldSkipRecoveryReplay } from "../startupHelpers.js";
import {
  upsertLikelihoodRatio,
  type LikelihoodDirection,
  type HorizonDays,
} from "../../infrastructure/db/likelihoodRatioStore.js";
import {
  computeRollingBaseRate,
  clampLikelihoodRatio,
} from "../../domain/services/baseRateComputer.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BaseRateJobResult {
  /** Total (evidence_type, direction, horizon_days) triples evaluated */
  triplesProcessed: number;
  /** Triples that resulted in a row being upserted */
  triplesUpserted: number;
  /** Triples where sample_size < 10 (stored as likelihood_ratio = 1.0) */
  stocksWithInsufficientSamples: number;
}

/** Raw fragment row shape from evidence_fragments */
interface FragmentRow {
  stock: string;
  evidence_type: string;
  direction: string;
  timestamp: string;
}

/** Raw OHLCV price row for nearest-date lookups */
interface PriceRow {
  close: number;
  date: string;
}

/** Raw pair row from distinct query */
interface PairRow {
  evidence_type: string;
  direction: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const HORIZONS: HorizonDays[] = [5, 10, 20];

/**
 * Get the closing price for a stock on or before a given date.
 * Returns null if no price data is available.
 */
function getClosePriceOnOrBefore(
  db: Database,
  code: string,
  date: string,
): number | null {
  const row = db
    .prepare(
      `SELECT close FROM daily_ohlcv
       WHERE code = ? AND date <= ?
       ORDER BY date DESC LIMIT 1`,
    )
    .get(code, date) as PriceRow | null;
  return row ? row.close : null;
}

/**
 * Get the closing price for a stock on or after a given date.
 * Returns null if no price data is available.
 */
function getClosePriceOnOrAfter(
  db: Database,
  code: string,
  date: string,
): number | null {
  const row = db
    .prepare(
      `SELECT close FROM daily_ohlcv
       WHERE code = ? AND date >= ?
       ORDER BY date ASC LIMIT 1`,
    )
    .get(code, date) as PriceRow | null;
  return row ? row.close : null;
}

/**
 * Add calendar days to an ISO date string (YYYY-MM-DD).
 */
function addDaysToDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Determine whether a price move qualifies as a "hit" given the evidence direction.
 *
 * - bullish: price at horizon > base * 1.03 (more than 3% gain)
 * - bearish: price at horizon < base * 0.97 (more than 3% loss)
 * - neutral: |price at horizon - base| / base > 0.03 (any ±3% move)
 */
function isHit(
  closeBase: number,
  closeHorizon: number,
  direction: LikelihoodDirection,
): boolean {
  const changeFraction = (closeHorizon - closeBase) / closeBase;
  if (direction === "bullish") return changeFraction > 0.03;
  if (direction === "bearish") return changeFraction < -0.03;
  // neutral: any ±3% move counts
  return Math.abs(changeFraction) > 0.03;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core computation logic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Core computation logic (injectable db for testing).
 *
 * Recomputes likelihood ratios for all (evidence_type, direction, horizon_days)
 * triples found in evidence_fragments.
 *
 * Algorithm (per TECH_059 §6):
 * 1. Query distinct (evidence_type, direction) pairs from evidence_fragments.
 * 2. For each pair × each horizon in [5, 10, 20]:
 *    a. Query fragments older than horizonDays (resolvable)
 *    b. For each fragment: look up price at base date and at base + horizonDays
 *    c. Count correct outcomes vs total resolvable
 *    d. Compute base rate per stock, average across stocks
 *    e. likelihood_ratio = clamp(hit_rate / base_rate)
 *    f. Upsert with actual sample_size (store enforces 1.0 if n < 10)
 *
 * @param db  SQLite database connection (defaults to production singleton)
 */
export async function runBaseRateComputation(
  db?: Database,
): Promise<BaseRateJobResult> {
  const database = db ?? getDb();

  const result: BaseRateJobResult = {
    triplesProcessed: 0,
    triplesUpserted: 0,
    stocksWithInsufficientSamples: 0,
  };

  // Step 1: Distinct (evidence_type, direction) pairs from evidence_fragments
  const pairs = database
    .prepare(
      `SELECT DISTINCT evidence_type, direction FROM evidence_fragments
       ORDER BY evidence_type, direction`,
    )
    .all() as PairRow[];

  if (pairs.length === 0) {
    logger.debug("[base-rate-computation] no evidence_fragments found — nothing to compute");
    return result;
  }

  // Step 2: For each pair × horizon
  for (const { evidence_type, direction } of pairs) {
    const dir = direction as LikelihoodDirection;

    for (const horizonDays of HORIZONS) {
      result.triplesProcessed++;

      // Step 2a: Query resolvable fragments (older than horizonDays days)
      const cutoff = new Date(
        Date.now() - horizonDays * 24 * 60 * 60 * 1000,
      ).toISOString();

      const fragments = database
        .prepare(
          `SELECT stock, evidence_type, direction, timestamp
           FROM evidence_fragments
           WHERE evidence_type = ? AND direction = ? AND timestamp < ?`,
        )
        .all(evidence_type, direction, cutoff) as FragmentRow[];

      if (fragments.length === 0) continue;

      // Step 2b-2c: Evaluate each fragment
      let correctOutcomes = 0;
      let resolvableCount = 0;
      const stocksInSet = new Set<string>();

      for (const frag of fragments) {
        const baseDate = frag.timestamp.slice(0, 10); // YYYY-MM-DD
        const horizonDate = addDaysToDate(baseDate, horizonDays);

        const closeBase = getClosePriceOnOrBefore(database, frag.stock, baseDate);
        const closeHorizon = getClosePriceOnOrAfter(database, frag.stock, horizonDate);

        if (closeBase === null || closeHorizon === null) continue;

        resolvableCount++;
        stocksInSet.add(frag.stock);

        if (isHit(closeBase, closeHorizon, dir)) {
          correctOutcomes++;
        }
      }

      if (resolvableCount === 0) continue;

      const hitRate = correctOutcomes / resolvableCount;

      // Step 2d: Average base rate across stocks
      let baseRateSum = 0;
      let stockCount = 0;
      for (const stock of stocksInSet) {
        const baseRate = computeRollingBaseRate(stock, horizonDays, database);
        baseRateSum += baseRate;
        stockCount++;
      }
      const avgBaseRate = stockCount > 0 ? baseRateSum / stockCount : 0;

      // Step 2e: Compute and clamp likelihood ratio
      let likelihoodRatio: number;
      if (avgBaseRate === 0) {
        logger.warn(
          `[base-rate-computation] base_rate=0 for ${evidence_type}/${direction}/${horizonDays} — defaulting to 1.0`,
        );
        likelihoodRatio = 1.0;
      } else {
        likelihoodRatio = clampLikelihoodRatio(hitRate / avgBaseRate);
      }

      // Track insufficient samples
      if (resolvableCount < 10) {
        result.stocksWithInsufficientSamples++;
      }

      // Step 2f: Upsert (store enforces 1.0 for sample_size < 10)
      upsertLikelihoodRatio(database, {
        evidence_type,
        direction: dir,
        horizon_days: horizonDays,
        likelihood_ratio: likelihoodRatio,
        sample_size: resolvableCount,
      });

      result.triplesUpserted++;
    }
  }

  logger.info(
    `[base-rate-computation] done — triplesProcessed=${result.triplesProcessed}, ` +
    `triplesUpserted=${result.triplesUpserted}, ` +
    `insufficientSamples=${result.stocksWithInsufficientSamples}`,
  );

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cron-callable wrapper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cron wrapper for runBaseRateComputation.
 * Wraps with recordJobRun for observability.
 * Called weekly at Sunday 19:00 UTC (02:00 VN Monday) from jobs.ts.
 *
 * @idempotency T4 — cron_job_runs recency guard; replay skipped if last success < 90% of weekly cadence (604.8s window = 6 days 1h12m)
 */
export async function runBaseRateComputationJob(): Promise<void> {
  const db = getDb();

  const WEEKLY_CADENCE_MS = 604_800_000;
  if (shouldSkipRecoveryReplay(db, "baseRateComputationJob", WEEKLY_CADENCE_MS)) return;

  try {
    await recordJobRun(db, "baseRateComputationJob", async () => {
      const result = await runBaseRateComputation(db);
      return { rowsWritten: result.triplesUpserted };
    });
  } catch (err) {
    logger.error("[base-rate-computation] unhandled error", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
