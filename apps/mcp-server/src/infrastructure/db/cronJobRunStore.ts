/**
 * Task 1100 — cron_job_runs CRUD helpers
 *
 * Provides start/end recording and health-summary queries for scheduled jobs.
 * The `cron_job_runs` table DDL is added to `schema.ts` `initDatabase()`.
 *
 * Row lifecycle:
 *   1. `insertCronJobRunStart` → status='running', started_at=now, nullable fields NULL
 *   2. `updateCronJobRunEnd`   → status='success'|'error', finished_at, duration_ms, etc.
 *
 * All SQL uses parameterized bindings only — no string interpolation.
 *
 * @module infrastructure/db/cronJobRunStore
 */

import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Valid status values for a cron_job_runs row. */
export type CronJobRunStatus = "running" | "success" | "error" | "crashed";

/** Raw SQLite row from the cron_job_runs table. */
export interface CronJobRunRow {
  id: number;
  job_name: string;
  started_at: string;
  finished_at: string | null;
  status: CronJobRunStatus;
  rows_written: number | null;
  error_msg: string | null;
  duration_ms: number | null;
}

/**
 * Per-job 7-day health summary returned by `getCronJobHealthSummary`.
 * Sorted by job_name ASC.
 */
export interface CronJobHealthSummary {
  job_name: string;
  /** ISO timestamp of most-recent run start */
  last_run: string;
  /** Status of the most-recent completed run */
  last_status: CronJobRunStatus;
  /** Error message of the most-recent run (null when last run succeeded) */
  last_error: string | null;
  /** Fraction of runs that succeeded in the window: 0.0–1.0 */
  success_rate_7d: number;
  /** Mean duration in milliseconds across all runs in the window */
  avg_duration_ms: number;
  /** Total run count within the window */
  total_runs_7d: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// insertCronJobRunStart
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert a new row marking a cron job as started.
 *
 * Sets `status='running'` and `started_at=datetime('now')`.
 * All other columns are NULL.
 *
 * @param db       Database connection
 * @param jobName  Canonical scheduler job name (e.g. 'pollNewsJob')
 * @returns        The new row's integer id
 */
export function insertCronJobRunStart(db: Database, jobName: string): number {
  const result = db
    .prepare(
      `INSERT INTO cron_job_runs (job_name, started_at, status)
       VALUES (?, datetime('now'), 'running')`,
    )
    .run(jobName);

  return Number(result.lastInsertRowid);
}

// ─────────────────────────────────────────────────────────────────────────────
// updateCronJobRunEnd
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update the row created by `insertCronJobRunStart` when the job completes.
 *
 * Sets `finished_at`, `status`, `rows_written`, `error_msg`, and `duration_ms`.
 * `rows_written` may be null for jobs that do not produce data rows (e.g. audit jobs).
 *
 * @param db          Database connection
 * @param id          Row id returned by `insertCronJobRunStart`
 * @param status      Final status: 'success' | 'error'
 * @param rowsWritten Number of DB rows written, or null
 * @param errorMsg    Error description, or null on success
 * @param durationMs  Elapsed wall-clock milliseconds
 */
export function updateCronJobRunEnd(
  db: Database,
  id: number,
  status: "success" | "error",
  rowsWritten: number | null,
  errorMsg: string | null,
  durationMs: number,
): void {
  db.prepare(
    `UPDATE cron_job_runs
     SET finished_at  = datetime('now'),
         status       = ?,
         rows_written = ?,
         error_msg    = ?,
         duration_ms  = ?
     WHERE id = ?`,
  ).run(status, rowsWritten, errorMsg, durationMs, id);
}

// ─────────────────────────────────────────────────────────────────────────────
// purgeOldCronJobRuns
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Delete rows for `jobName` whose `started_at` is older than `retentionDays`.
 *
 * Returns the number of rows deleted.
 *
 * @param db            Database connection
 * @param jobName       Job name to purge
 * @param retentionDays Rows older than this many days are deleted
 * @returns             Count of rows deleted
 */
export function purgeOldCronJobRuns(
  db: Database,
  jobName: string,
  retentionDays: number,
): number {
  const result = db
    .prepare(
      `DELETE FROM cron_job_runs
       WHERE job_name  = ?
         AND started_at < datetime('now', ? || ' days')`,
    )
    .run(jobName, `-${retentionDays}`);

  return result.changes;
}

// ─────────────────────────────────────────────────────────────────────────────
// reapZombieJobRuns
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mark all orphaned running rows as 'crashed'.
 *
 * A zombie row is one where status='running' AND finished_at IS NULL — it was
 * never closed because the process crashed or was killed before the job
 * completed. Called once after initDatabase(), before any cron registration.
 *
 * Only the reaper writes status='crashed'. `updateCronJobRunEnd` intentionally
 * keeps its status param narrowed to 'success' | 'error'.
 *
 * @param db  Database connection
 * @returns   { reaped: number } — count of rows updated
 */
export function reapZombieJobRuns(db: Database): { reaped: number } {
  const result = db
    .prepare(
      `UPDATE cron_job_runs
       SET status      = 'crashed',
           finished_at = datetime('now'),
           duration_ms = CAST(ROUND(
             (julianday('now') - julianday(started_at)) * 86400000
           ) AS INTEGER)
       WHERE status = 'running'
         AND finished_at IS NULL`,
    )
    .run();

  return { reaped: result.changes };
}

// ─────────────────────────────────────────────────────────────────────────────
// recordJobRun
// ─────────────────────────────────────────────────────────────────────────────

/**
 * High-level wrapper that records a cron job invocation: inserts a start row,
 * awaits the job function, then updates the row with the outcome.
 *
 * Contract:
 *   - NEVER re-throws — errors are captured in `error_msg` so the caller's
 *     cron callback cannot crash the scheduler.
 *   - Returns `undefined` in all cases (success and error).
 *   - When `fn` returns `{ rowsWritten }`, the value is stored; otherwise NULL.
 *
 * @param db      Database connection for CRUD operations
 * @param jobName Canonical scheduler job name (e.g. 'pollNewsJob')
 * @param fn      Async job body — may return `{ rowsWritten?: number }` or void
 */
export async function recordJobRun(
  db: Database,
  jobName: string,
  fn: () => Promise<{ rowsWritten?: number } | void>,
): Promise<void> {
  // Insert start row — if cron_job_runs table is missing (e.g. test DB without
  // full schema), fall back to running fn() without observability so job logic
  // always executes. This makes recordJobRun safe to call from tests that only
  // set up a partial schema.
  let id: number | null = null;
  try {
    id = insertCronJobRunStart(db, jobName);
  } catch {
    // Table missing or other DDL issue — run fn() without recording
    try {
      await fn();
    } catch { /* swallow — observability degraded, not a job failure */ }
    return;
  }

  const startTime = Date.now();
  try {
    const result = await fn();
    const durationMs = Date.now() - startTime;
    const rowsWritten =
      result != null &&
      typeof (result as { rowsWritten?: number }).rowsWritten === "number"
        ? (result as { rowsWritten: number }).rowsWritten
        : null;
    updateCronJobRunEnd(db, id, "success", rowsWritten, null, durationMs);
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;
    const errorMsg = err instanceof Error ? err.message : String(err);
    updateCronJobRunEnd(db, id, "error", null, errorMsg, durationMs);
    // Intentionally NOT re-throwing — recordJobRun swallows errors to prevent
    // a job exception from crashing the node-cron scheduler loop.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getCronJobHealthSummary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return per-job health aggregates for all jobs that have run within `days`.
 *
 * Uses a single SQL query with correlated sub-selects for last_run / last_status /
 * last_error so the summary is computed in one round-trip.
 *
 * @param db      Database connection
 * @param days    Rolling window in days (e.g. 7)
 * @param jobName Optional job-name filter — when supplied only one job is returned
 * @returns       Array of health summaries sorted by job_name ASC
 */
export function getCronJobHealthSummary(
  db: Database,
  days: number,
  jobName?: string,
): CronJobHealthSummary[] {
  /**
   * SQLite sub-query approach:
   * - Main CTE aggregates per-job success_rate, avg_duration, total_runs within window
   * - Correlated sub-selects pull last_run, last_status, last_error from the most
   *   recent row (MAX started_at) for that job
   */
  const nameFilter = jobName != null ? "AND job_name = ?" : "";
  const params: (string | number)[] = jobName != null
    ? [`-${days}`, jobName, `-${days}`, jobName]
    : [`-${days}`, `-${days}`];

  type RawRow = {
    job_name: string;
    last_run: string;
    last_status: string;
    last_error: string | null;
    success_count: number;
    total_runs_7d: number;
    avg_duration_ms: number;
  };

  const rows = db
    .prepare<RawRow, (string | number)[]>(
      `SELECT
         agg.job_name,
         agg.last_run,
         (SELECT status FROM cron_job_runs r2
          WHERE r2.job_name = agg.job_name
            AND r2.started_at = agg.last_run
          LIMIT 1) AS last_status,
         (SELECT error_msg FROM cron_job_runs r3
          WHERE r3.job_name = agg.job_name
            AND r3.started_at = agg.last_run
          LIMIT 1) AS last_error,
         agg.success_count,
         agg.total_runs_7d,
         agg.avg_duration_ms
       FROM (
         SELECT
           job_name,
           MAX(started_at)                                        AS last_run,
           SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END)   AS success_count,
           COUNT(*)                                               AS total_runs_7d,
           COALESCE(AVG(duration_ms), 0)                         AS avg_duration_ms
         FROM cron_job_runs
         WHERE started_at >= datetime('now', ? || ' days')
           ${nameFilter}
         GROUP BY job_name
       ) agg
       -- second filter pass so the correlated sub-selects also stay in window
       WHERE agg.last_run >= datetime('now', ? || ' days')
         ${nameFilter}
       ORDER BY agg.job_name ASC`,
    )
    .all(...params);

  return rows.map((r) => ({
    job_name: r.job_name,
    last_run: r.last_run,
    last_status: r.last_status as CronJobRunStatus,
    last_error: r.last_error,
    success_rate_7d: r.total_runs_7d > 0 ? r.success_count / r.total_runs_7d : 0,
    avg_duration_ms: r.avg_duration_ms,
    total_runs_7d: r.total_runs_7d,
  }));
}
