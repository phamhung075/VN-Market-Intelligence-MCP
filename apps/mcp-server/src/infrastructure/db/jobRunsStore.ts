/**
 * Re-export recordJobRun from cronJobRunStore for task 240b tests
 *
 * This module provides backward compatibility and serves as an alias
 * to the canonical cron_job_runs store.
 */

export { recordJobRun } from "./cronJobRunStore.js";
export type { CronJobRunStatus, CronJobRunRow, CronJobHealthSummary } from "./cronJobRunStore.js";
