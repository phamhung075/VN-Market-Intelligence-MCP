/**
 * Summary Scheduler Jobs — Task 130 (interface/scheduler layer)
 *
 * Auto-generates periodic intelligence summaries on schedule.
 * All schedules are in GMT+7 (Asia/Ho_Chi_Minh) and fire after other jobs
 * to ensure data is already collected.
 *
 * Schedules:
 *   - Daily   : every day 22:30 GMT+7 (after evening summary at 22:00)
 *   - Weekly  : every Sunday 23:00 GMT+7
 *   - Monthly : 1st of each month at 00:30 GMT+7
 *   - Quarterly: 1st of Jan/Apr/Jul/Oct at 01:00 GMT+7
 *   - Yearly  : Jan 2 at 02:00 GMT+7
 *
 * Layer: interface/scheduler — imports from application/usecases and
 * infrastructure only. Must not import directly from domain/.
 */

import { generatePeriodicSummary, type PeriodType } from "../application/usecases/generatePeriodicSummary.js";
import { logger } from "../infrastructure/logger.js";
import { getDb } from "../infrastructure/db/schema.js"
import { recordJobRun } from "../infrastructure/db/cronJobRunStore.js"
import { scheduleCron } from "./startupHelpers.js"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cron config accepted by registerSummaryJobs.
 * Callers (jobs.ts) pass the canonical CRONS values so there is a single
 * source of truth for the env-var reads.  (task 1092)
 */
export interface SummaryCronConfig {
  /** Daily summary cron expression (CRON_SUMMARY_DAILY) */
  daily: string;
  /** Weekly summary cron expression (CRON_SUMMARY_WEEKLY) */
  weekly: string;
  /** Monthly summary cron expression (CRON_SUMMARY_MONTHLY) */
  monthly: string;
  /** Quarterly summary cron expression (CRON_SUMMARY_QUARTERLY) */
  quarterly: string;
  /** Yearly summary cron expression (CRON_SUMMARY_YEARLY) */
  yearly: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Runner helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run a periodic summary generation with error isolation.
 *
 * @param periodType - Summary period type to generate
 */
export async function runSummaryJob(periodType: PeriodType): Promise<void> {
  const db = getDb()
  await recordJobRun(db, `summaryJob:${periodType}`, async () => {
    const start = Date.now()
    logger.info(`[summaryJob] starting ${periodType} summary generation`)
    const summary = await generatePeriodicSummary(periodType)
    const durationMs = Date.now() - start
    logger.info(`[summaryJob] ${periodType} summary complete`, {
      id: summary.id,
      periodStart: summary.periodStart,
      periodEnd: summary.periodEnd,
      newsCount: summary.newsCount,
      alertCount: summary.alertCount,
      durationMs,
    })
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Exported schedule registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register all periodic summary cron jobs.
 * Called from the main jobs.ts scheduler setup.
 *
 * @param cronConfig - Cron expressions sourced from the canonical CRONS map
 *                     in jobs.ts.  Eliminates the duplicate env-var reads that
 *                     existed when summaryJobs.ts had its own SUMMARY_CRONS
 *                     object.  (task 1092)
 */
export function registerSummaryJobs(cronConfig: SummaryCronConfig): void {
  // Daily summary — 22:30 every day (after evening summary)
  // recoverMissedExecutions: true — if the event loop is stalled at fire time
  // (e.g. startup ohlcv backfill), node-cron replays the missed tick on recovery
  // instead of skipping until the next day (task 1958a).
  scheduleCron(cronConfig.daily, async () => {
    await runSummaryJob("daily");
  }, { timezone: "Asia/Ho_Chi_Minh", recoverMissedExecutions: true });

  // Weekly summary — 23:00 every Sunday
  scheduleCron(cronConfig.weekly, async () => {
    await runSummaryJob("weekly");
  }, { timezone: "Asia/Ho_Chi_Minh" });

  // Monthly summary — 00:30 on the 1st of each month
  scheduleCron(cronConfig.monthly, async () => {
    await runSummaryJob("monthly");
  }, { timezone: "Asia/Ho_Chi_Minh" });

  // Quarterly summary — 01:00 on Jan/Apr/Jul/Oct 1st
  scheduleCron(cronConfig.quarterly, async () => {
    await runSummaryJob("quarterly");
  }, { timezone: "Asia/Ho_Chi_Minh" });

  // Yearly summary — 02:00 on Jan 2nd
  scheduleCron(cronConfig.yearly, async () => {
    await runSummaryJob("yearly");
  }, { timezone: "Asia/Ho_Chi_Minh" });

  logger.info("[summaryJobs] registered 5 periodic summary cron jobs");
}
