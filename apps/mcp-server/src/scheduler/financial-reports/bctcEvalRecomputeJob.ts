/**
 * bctcEvalRecomputeJob.ts — Nightly BCTC eval recompute cron
 *
 * Runs at 22:02 UTC (off-market) — cron: "2 22 * * *"
 * Override via env: CRON_BCTC_EVAL_RECOMPUTE
 *
 * Sweeps all reports where any bctc_eval_results row has an outdated
 * detector_version and recomputes stages 4-6 for each.
 *
 * Stages 1-3 are owned by pdf-extractor side (not recomputed here).
 *
 * Uses wrapRun() pattern from startScheduler.ts.
 * Layer: interface/scheduler — depends on application + infrastructure.
 */

import { logger } from "../../infrastructure/logger.js";
import { getDb } from "../../infrastructure/db/schema.js";
import {
  getStaleReportIds,
  getCurrentDetectorVersion,
} from "../../infrastructure/db/bctcEvalStore.js";
import {
  computeBctcEval,
  loadBctcEvalThresholds,
} from "../../application/usecases/computeBctcEval.js";
import { resolve } from "node:path";

// ─── Result type ──────────────────────────────────────────────────────────────

export interface BctcEvalRecomputeResult {
  stale_found: number;
  recomputed: number;
  failed: number;
  detector_version: string;
}

// ─── Job runner ───────────────────────────────────────────────────────────────

/**
 * runBctcEvalRecomputeJob — sweeps stale eval rows and recomputes stages 4-6.
 *
 * Called by startScheduler.ts wrapped in jobRunRepo.wrapRun().
 * Returns rowsWritten = recomputed * 3 (3 stages per report).
 */
export async function runBctcEvalRecomputeJob(): Promise<BctcEvalRecomputeResult> {
  const db = getDb();
  const projectRoot = resolve(process.cwd());

  // Load thresholds SSOT — fail-loud if file missing
  const thresholds = loadBctcEvalThresholds(projectRoot);
  const currentVersion = getCurrentDetectorVersion();

  const staleReportIds = getStaleReportIds(db);
  const staleFound = staleReportIds.length;

  if (staleFound === 0) {
    logger.info(
      `[bctc-eval-recompute] No stale reports found (detector_version=${currentVersion})`,
    );
    return {
      stale_found: 0,
      recomputed: 0,
      failed: 0,
      detector_version: currentVersion,
    };
  }

  logger.info(
    `[bctc-eval-recompute] Found ${staleFound} stale reports to recompute`,
  );

  let recomputed = 0;
  let failed = 0;

  for (const reportId of staleReportIds) {
    try {
      const result = await computeBctcEval(db, reportId, thresholds);
      logger.info(
        `[bctc-eval-recompute] ${reportId}: overall_status=${result.overall_status}`,
      );
      recomputed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[bctc-eval-recompute] Failed for ${reportId}: ${msg}`);
      failed++;
    }
  }

  logger.info(
    `[bctc-eval-recompute] Done. recomputed=${recomputed}, failed=${failed}`,
  );

  return {
    stale_found: staleFound,
    recomputed,
    failed,
    detector_version: currentVersion,
  };
}
