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

import { checkSscReports } from "../../application/usecases/checkSscReports.js";
import { logger } from "../../infrastructure/logger.js";
import { getDb } from "../../infrastructure/db/schema.js";
import { recordJobRun } from "../../infrastructure/db/cronJobRunStore.js";
import { mcpConfig } from "../../infrastructure/config.js";
import { shouldSkipRecoveryReplay } from "../startupHelpers.js";

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
  // Task 1281-fix: VPS-only architecture guard.
  // The local server (France IP) must NOT attempt to download BCTC PDFs directly.
  // All BCTC acquisition is handled exclusively by vn-bctc-fetch.service on the
  // Vinahost VPS (Vietnam IP). Skipping prevents x5 "Network timeout" errors at startup.
  if (!mcpConfig.features.enableLocalBctcFetch) {
    logger.debug("[ssc-check] ENABLE_LOCAL_BCTC_FETCH=false — skipping (VPS-only mode)");
    return;
  }

  if (isRunning) {
    logger.warn("[ssc-check] previous cycle still running — skipped");
    return;
  }

  isRunning = true;

  try {
    const db = getDb();

    // T4 dedup guard: skip if already ran within daily cadence window
    // @idempotency T4 — cron_job_runs recency guard; replay skipped if last success < 90% of daily cadence (21.6h window)
    const DAILY_CADENCE_MS = 86_400_000;
    if (shouldSkipRecoveryReplay(db, "sscCheckerJob", DAILY_CADENCE_MS)) { isRunning = false; return; }

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
