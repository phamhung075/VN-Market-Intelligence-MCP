/**
 * SSC Checker Job — Task 104 (interface/scheduler layer)
 *
 * Thin cron wrapper around the `checkSscReports` application use case.
 * Registered in `jobs.ts` at 20:00 Asia/Ho_Chi_Minh daily.
 *
 * A concurrency guard prevents a second invocation from starting while the
 * previous check is still running (SSC portal may be slow at report-drop time).
 *
 * Layer: interface/scheduler — may call application use cases and getDb().
 * Must not import directly from domain/.
 */

import { checkSscReports } from "../application/usecases/checkSscReports.js";
import { logger } from "../infrastructure/logger.js";
import { getDb } from "../infrastructure/db/schema.js";
import { recordJobRun } from "../infrastructure/db/cronJobRunStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Concurrency guard
// ─────────────────────────────────────────────────────────────────────────────

let isRunning = false;

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute one SSC nightly check cycle.
 *
 * Calls `checkSscReports()` with the production SSC fetcher and BCTC pipeline.
 * Logs a structured summary line when the check completes.
 * Skips the check if a previous invocation is still running.
 */
export async function runSscCheck(): Promise<void> {
  if (isRunning) {
    logger.warn("[ssc-check] previous cycle still running — skipped");
    return;
  }

  isRunning = true;

  try {
    const db = getDb();
    // recordJobRun never re-throws — errors are captured in cron_job_runs.error_msg
    await recordJobRun(db, "sscCheckerJob", async () => {
      const result = await checkSscReports();
      logger.info(
        `[ssc-check] cycle complete — ` +
          `checked: ${result.checked}, ` +
          `newReports: ${result.newReports}, ` +
          `alerts: ${result.alerts}, ` +
          `errors: ${result.errors}`,
      );
      return { rowsWritten: result.newReports };
    });
  } catch (err) {
    logger.error("[ssc-check] unhandled error", {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    isRunning = false;
  }
}
