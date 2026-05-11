/**
 * SQLite adapter — Job Run Repository
 *
 * Task 1839a Phase 2 — wraps cronJobRunStore helpers behind IJobRunRepository.
 * Constructor-injects a Database so callers (startScheduler, server) can
 * create one shared instance instead of calling getDb() at every job site.
 *
 * @module infrastructure/db/repositories/SqliteJobRunRepository
 */

import type { Database } from "bun:sqlite";
import type { IJobRunRepository, JobRunRecord } from "../../../domain/repositories/IJobRunRepository.js";
import {
  recordJobRun,
  insertCronJobRunStart,
  updateCronJobRunEnd,
} from "../cronJobRunStore.js";

export class SqliteJobRunRepository implements IJobRunRepository {
  constructor(private readonly db: Database) {}

  /**
   * Record a completed job run (post-hoc — caller has already executed the job).
   * Maps the simple JobRunRecord to the cron_job_runs table columns.
   */
  recordRun(record: JobRunRecord): void {
    try {
      const id = insertCronJobRunStart(this.db, record.jobName);
      const durationMs = record.durationMs ?? 0;
      const status = record.status === "ok" ? "success" : "error";
      updateCronJobRunEnd(
        this.db,
        id,
        status,
        null,
        record.error ?? null,
        durationMs,
      );
    } catch {
      // Table missing or schema mismatch — degrade gracefully
    }
  }

  /**
   * Wrap an async job function: start row → await fn → update row with outcome.
   * Delegates to the existing `recordJobRun` helper so behaviour is identical.
   * NEVER re-throws.
   */
  async wrapRun(
    jobName: string,
    fn: () => Promise<{ rowsWritten?: number } | void>,
  ): Promise<void> {
    return recordJobRun(this.db, jobName, fn);
  }

  /**
   * Return the last N completed runs for a given job, most-recent first.
   * Returns empty array if the table is missing or query fails.
   */
  getLastRuns(jobName: string, limit: number): JobRunRecord[] {
    try {
      type Row = {
        job_name: string;
        started_at: string;
        duration_ms: number | null;
        status: string;
        error_msg: string | null;
      };
      const rows = this.db
        .query<Row, [string, number]>(
          `SELECT job_name, started_at, duration_ms, status, error_msg
           FROM cron_job_runs
           WHERE job_name = ? AND status IN ('success', 'error')
           ORDER BY started_at DESC
           LIMIT ?`,
        )
        .all(jobName, limit);

      return rows.map((r) => {
        const record: import("../../../domain/repositories/IJobRunRepository.js").JobRunRecord = {
          jobName: r.job_name,
          runAt: r.started_at,
          durationMs: r.duration_ms ?? 0,
          status: r.status === "success" ? "ok" : "fail",
        };
        if (r.error_msg != null) {
          record.error = r.error_msg;
        }
        return record;
      });
    } catch {
      return [];
    }
  }
}
