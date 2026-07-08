/**
 * recomputeBctcEval.ts — BLOCK-2 FIX, relocated verbatim
 * (FACTORY-INTERFACE-extract-finalizeBctc-usecase).
 *
 * DDD layer: application (usecases/finalizeBctcRefine).
 *
 * The eval was computed against pre-refine data (stale red for ACB).
 * Recompute inside finalize so the eval reflects the freshly refined rows.
 * Approach: inline recompute (stages 4-6 are fast — DB reads only, no PDF).
 * If threshold loading fails (no thresholds file in test env), skip gracefully.
 *
 * @module application/usecases/finalizeBctcRefine/recomputeBctcEval
 */

import type { Database } from "bun:sqlite";
import { logger } from "../../../infrastructure/logger.js";
import { computeBctcEval, loadBctcEvalThresholds } from "../computeBctcEval.js";

/**
 * recomputeBctcEval — BLOCK-2 main entry.
 * Non-fatal: eval recompute failure must NOT block the finalize response.
 * The table rows and scalar backfill are already committed.
 * Ops can trigger a manual recompute via POST /api/bctc-eval/recompute/{id}.
 */
export async function recomputeBctcEval(db: Database, report_id: string): Promise<void> {
  try {
    const projectRoot = Bun.env["PROJECT_ROOT"] ?? process.cwd();
    const thresholds = loadBctcEvalThresholds(projectRoot);
    await computeBctcEval(db, report_id, thresholds);
    logger.info("[finalize_bctc_refine] bctc_eval recomputed post-refine", { report_id });
  } catch (evalErr) {
    // Non-fatal: eval recompute failure must NOT block the finalize response.
    logger.warn("[finalize_bctc_refine] eval recompute error (non-fatal) — manual recompute available", {
      report_id,
      error: evalErr instanceof Error ? evalErr.message : String(evalErr),
    });
  }
}
