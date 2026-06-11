/**
 * Task 1118 — Evidence Accumulator Job
 *
 * Nightly scheduler job (23:00 VN = 16:00 UTC) that:
 * 1. Purges expired evidence fragments (expires_at < now)
 * 2. Reads all active fragments (last 30 days) grouped by stock
 * 3. Computes per-stock weighted evidence scores:
 *    score = sum(magnitude * confidence) / count  (per direction)
 * 4. Upserts results into evidence_scores table
 *
 * Part of the Prediction Engine Phase A (Sprint 057).
 *
 * Layer: scheduler — imports from infrastructure only.
 *
 * @module scheduler/evidenceAccumulatorJob
 */

import type { Database } from "bun:sqlite";
import { logger } from "../../infrastructure/logger.js";
import { getDb } from "../../infrastructure/db/schema.js";
import { recordJobRun } from "../../infrastructure/db/cronJobRunStore.js";
import {
  purgeExpiredFragments,
  getEvidenceFragments,
  upsertEvidenceScore,
  type EvidenceDirection,
} from "../../infrastructure/db/evidenceFragmentStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface EvidenceAccumulatorResult {
  /** Number of distinct stocks for which scores were computed */
  stocks: number;
  /** Number of expired fragment rows deleted before accumulation */
  purged: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core logic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute weighted evidence scores for all stocks with active fragments.
 *
 * Score formula per direction:
 *   score = sum(magnitude * confidence) / count_for_direction
 *
 * This normalises for the number of evidence items in each direction,
 * so a stock with 1 high-confidence bullish fragment doesn't dominate
 * over a stock with 5 moderate bullish fragments.
 *
 * @param db - SQLite database connection (defaults to production singleton)
 * @returns { stocks, purged } summary
 */
export async function runEvidenceAccumulator(
  db?: Database,
): Promise<EvidenceAccumulatorResult> {
  const database = db ?? getDb();

  // Step 1: Purge expired rows to keep the table lean
  const purged = purgeExpiredFragments(database);
  if (purged > 0) {
    logger.info(`[evidence-accumulator] purged ${purged} expired fragments`);
  }

  // Step 2: Get distinct stocks with active fragments (last 30 days)
  const stockRows = database
    .prepare("SELECT DISTINCT stock FROM evidence_fragments WHERE timestamp >= ?")
    .all(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) as { stock: string }[];

  if (stockRows.length === 0) {
    // FAIL-LOUD (FIX-EVIDENCE-PIPELINE-STARVED): an empty evidence_fragments table
    // means the upstream producer (foreignFlowAlertJob / insiderCheckJob) is starved.
    // Throw so recordJobRun stamps status='error' — never stamp success-with-0.
    // This surfaces the starvation in cron_job_runs.error_msg so operators can detect it.
    const errMsg =
      `[evidence-accumulator] evidence_fragments is empty (purged=${purged}) — ` +
      "producer starvation detected; upstream fragment writers are writing 0 rows. " +
      "Check foreignFlowAlertJob / insiderCheckJob cron_job_runs for root cause.";
    logger.warn(errMsg);
    throw new Error(errMsg);
  }

  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  let processedStocks = 0;

  // Step 3: Compute and upsert scores for each stock
  for (const { stock } of stockRows) {
    const fragments = getEvidenceFragments(database, stock, { days: 30 });
    if (fragments.length === 0) continue;

    // Group by direction
    const byDirection: Record<EvidenceDirection, number[]> = {
      bullish: [],
      bearish: [],
      neutral: [],
    };

    for (const frag of fragments) {
      const dir = frag.direction as EvidenceDirection;
      if (byDirection[dir]) {
        byDirection[dir].push(frag.magnitude * frag.confidence);
      }
    }

    // Compute weighted average per direction (0.0 when no fragments for that direction)
    const avg = (values: number[]): number => {
      if (values.length === 0) return 0;
      return values.reduce((sum, v) => sum + v, 0) / values.length;
    };

    const scores = {
      bullish: avg(byDirection.bullish),
      bearish: avg(byDirection.bearish),
      neutral: avg(byDirection.neutral),
      fragmentCount: fragments.length,
    };

    upsertEvidenceScore(database, stock, today, scores);
    processedStocks++;
  }

  logger.info(
    `[evidence-accumulator] done — stocks=${processedStocks}, purged=${purged}`,
    { stocks: processedStocks, purged },
  );

  return { stocks: processedStocks, purged };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cron-callable wrapper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cron wrapper for runEvidenceAccumulator.
 * Wraps with recordJobRun for observability.
 * Called nightly at 23:00 VN (16:00 UTC) from jobs.ts.
 */
export async function runEvidenceAccumulatorJob(): Promise<void> {
  const db = getDb();
  try {
    await recordJobRun(db, "evidenceAccumulatorJob", async () => {
      const result = await runEvidenceAccumulator(db);
      return { rowsWritten: result.stocks };
    });
  } catch (err) {
    logger.error("[evidence-accumulator] unhandled error", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
