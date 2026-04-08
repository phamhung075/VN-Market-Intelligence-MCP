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

import cron from "node-cron";
import { generatePeriodicSummary, type PeriodType } from "../application/usecases/generatePeriodicSummary.js";
import { logger } from "../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Cron expressions (GMT+7 via node-cron timezone option)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Summary cron expressions — single source of truth via env vars.
 * Mirrors the CRONS.summary* keys in jobs.ts so both read from the same
 * CRON_SUMMARY_* env vars and always agree. (task 1023)
 */
export const SUMMARY_CRONS = {
  /** Daily summary: 22:30 every day (CRON_SUMMARY_DAILY) */
  daily: Bun.env.CRON_SUMMARY_DAILY ?? "30 22 * * *",
  /** Weekly summary: 23:00 every Sunday (CRON_SUMMARY_WEEKLY) */
  weekly: Bun.env.CRON_SUMMARY_WEEKLY ?? "0 23 * * 0",
  /** Monthly summary: 00:30 on the 1st of each month (CRON_SUMMARY_MONTHLY) */
  monthly: Bun.env.CRON_SUMMARY_MONTHLY ?? "30 0 1 * *",
  /** Quarterly summary: 01:00 on Jan 1, Apr 1, Jul 1, Oct 1 (CRON_SUMMARY_QUARTERLY) */
  quarterly: Bun.env.CRON_SUMMARY_QUARTERLY ?? "0 1 1 1,4,7,10 *",
  /** Yearly summary: 02:00 on Jan 2 (CRON_SUMMARY_YEARLY) */
  yearly: Bun.env.CRON_SUMMARY_YEARLY ?? "0 2 2 1 *",
};

// ─────────────────────────────────────────────────────────────────────────────
// Runner helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run a periodic summary generation with error isolation.
 *
 * @param periodType - Summary period type to generate
 */
async function runSummaryJob(periodType: PeriodType): Promise<void> {
  const start = Date.now();
  logger.info(`[summaryJob] starting ${periodType} summary generation`);

  try {
    const summary = await generatePeriodicSummary(periodType);
    const durationMs = Date.now() - start;

    logger.info(`[summaryJob] ${periodType} summary complete`, {
      id: summary.id,
      periodStart: summary.periodStart,
      periodEnd: summary.periodEnd,
      newsCount: summary.newsCount,
      alertCount: summary.alertCount,
      durationMs,
    });
  } catch (err) {
    logger.error(`[summaryJob] ${periodType} summary failed`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Exported schedule registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register all periodic summary cron jobs.
 * Called from the main jobs.ts scheduler setup.
 */
export function registerSummaryJobs(): void {
  // Daily summary — 22:30 every day (after evening summary)
  cron.schedule(SUMMARY_CRONS.daily, async () => {
    await runSummaryJob("daily");
  }, { timezone: "Asia/Ho_Chi_Minh" });

  // Weekly summary — 23:00 every Sunday
  cron.schedule(SUMMARY_CRONS.weekly, async () => {
    await runSummaryJob("weekly");
  }, { timezone: "Asia/Ho_Chi_Minh" });

  // Monthly summary — 00:30 on the 1st of each month
  cron.schedule(SUMMARY_CRONS.monthly, async () => {
    await runSummaryJob("monthly");
  }, { timezone: "Asia/Ho_Chi_Minh" });

  // Quarterly summary — 01:00 on Jan/Apr/Jul/Oct 1st
  cron.schedule(SUMMARY_CRONS.quarterly, async () => {
    await runSummaryJob("quarterly");
  }, { timezone: "Asia/Ho_Chi_Minh" });

  // Yearly summary — 02:00 on Jan 2nd
  cron.schedule(SUMMARY_CRONS.yearly, async () => {
    await runSummaryJob("yearly");
  }, { timezone: "Asia/Ho_Chi_Minh" });

  logger.info("[summaryJobs] registered 5 periodic summary cron jobs");
}
