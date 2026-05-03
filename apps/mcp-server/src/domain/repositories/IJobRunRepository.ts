/**
 * Domain interface — Job Run Repository (Port)
 *
 * Task 1839a Phase 2 — provides the port for recording scheduler job
 * execution results and querying run history.
 *
 * Implementations live in infrastructure/db/repositories/.
 *
 * @module domain/repositories/IJobRunRepository
 */

/** Record for a completed job run. */
export interface JobRunRecord {
  jobName: string;
  runAt: string;
  durationMs: number;
  status: "ok" | "fail";
  error?: string;
}

export interface IJobRunRepository {
  /** Record a completed job run. */
  recordRun(record: JobRunRecord): void;

  /**
   * Wrap an async job function: inserts a start row, awaits the function,
   * then updates the row with the outcome.
   *
   * Mirrors the behaviour of the existing `recordJobRun(db, name, fn)` helper
   * so call sites in startScheduler can migrate mechanically.
   *
   * NEVER re-throws — errors are captured so the cron loop cannot crash.
   */
  wrapRun(
    jobName: string,
    fn: () => Promise<{ rowsWritten?: number } | void>,
  ): Promise<void>;

  /** Return the last N runs for a given job, most-recent first. */
  getLastRuns(jobName: string, limit: number): JobRunRecord[];
}
