/**
 * Scheduler Lock Store — Task 1221 (Infrastructure Layer)
 *
 * Provides a DB-backed lock mechanism for cron jobs that must not run
 * concurrently or be double-fired on server restart.
 *
 * Problem:
 *   The in-memory `_running` flag in weeklyPortfolioReportJob (and other jobs)
 *   resets to false on every server restart. If a restart happens exactly at
 *   cron schedule time, the job can fire twice: once from the lingering scheduler
 *   before restart and once immediately after restart when node-cron re-fires.
 *
 * Solution:
 *   A `scheduler_locks` table in SQLite. Before running, the job checks if a
 *   lock exists and is fresh (within the configured window). If fresh → skip.
 *   If stale or absent → acquire the lock and run.
 *
 * Table DDL:
 *   CREATE TABLE IF NOT EXISTS scheduler_locks (
 *     job_name     TEXT PRIMARY KEY,
 *     acquired_at  TEXT NOT NULL DEFAULT (datetime('now')),
 *     released_at  TEXT
 *   )
 *
 * Layer: infrastructure/db — SQLite access only, no domain imports.
 */

import type { Database } from "bun:sqlite";

// ---------------------------------------------------------------------------
// DDL
// ---------------------------------------------------------------------------

/**
 * Create the scheduler_locks table if it doesn't exist.
 * Idempotent — safe to call on every startup.
 */
export function ensureSchedulerLocksTable(db: Database): void {
  // Task 1457: DDL also lives in schema.ts:initDatabase() (canonical audit location).
  // Kept here so callers that build their own DB (e.g. tests, weeklyPortfolioReportJob)
  // can still create the table without going through initDatabase().
  db.exec(`
    CREATE TABLE IF NOT EXISTS scheduler_locks (
      job_name     TEXT PRIMARY KEY,
      acquired_at  TEXT NOT NULL DEFAULT (datetime('now')),
      released_at  TEXT
    )
  `);
}

// ---------------------------------------------------------------------------
// Lock helpers
// ---------------------------------------------------------------------------

/**
 * Check whether a lock for the given job is fresh (within the window).
 *
 * A lock is fresh if:
 *   - A row exists for job_name, AND
 *   - acquired_at is within the last `windowMinutes` minutes
 *
 * Released_at is ignored for the freshness check — a running lock (not yet
 * released) counts as fresh regardless.
 *
 * @param db             - SQLite database
 * @param jobName        - Canonical job name, e.g. "weeklyPortfolioReport"
 * @param windowMinutes  - Lock window in minutes (default 60)
 * @returns              - true if a fresh lock exists
 */
export function isSchedulerLockFresh(
  db: Database,
  jobName: string,
  windowMinutes: number = 60,
): boolean {
  try {
    const row = db
      .prepare(
        `SELECT 1 FROM scheduler_locks
         WHERE job_name = ?
           AND acquired_at >= datetime('now', ? || ' minutes')
         LIMIT 1`,
      )
      .get(jobName, `-${windowMinutes}`) as { 1: number } | null;
    return row !== null;
  } catch {
    return false;
  }
}

/**
 * Attempt to acquire the scheduler lock for the given job.
 *
 * Acquisition succeeds when:
 *   - No lock exists for job_name, OR
 *   - The existing lock is stale (older than `windowMinutes` minutes)
 *
 * On success: upserts the lock row with acquired_at=now, released_at=NULL.
 * On failure (fresh lock exists): returns false without modifying the row.
 *
 * Uses a single parameterized INSERT OR REPLACE guarded by the freshness check.
 * All SQL is parameterized — no string interpolation.
 *
 * @param db             - SQLite database
 * @param jobName        - Canonical job name
 * @param windowMinutes  - Freshness window in minutes (default 60)
 * @returns              - true if acquired, false if a fresh lock blocks acquisition
 */
export function acquireSchedulerLock(
  db: Database,
  jobName: string,
  windowMinutes: number = 60,
): boolean {
  // If a fresh lock exists, refuse acquisition
  if (isSchedulerLockFresh(db, jobName, windowMinutes)) {
    return false;
  }

  // Upsert: either insert new or replace stale lock
  try {
    db.prepare(
      `INSERT OR REPLACE INTO scheduler_locks (job_name, acquired_at, released_at)
       VALUES (?, datetime('now'), NULL)`,
    ).run(jobName);
    return true;
  } catch {
    return false;
  }
}

/**
 * Release the scheduler lock by setting released_at = now.
 *
 * Releasing is advisory — the freshness check uses acquired_at, not released_at.
 * This is intentional: a running job that crashes without releasing its lock
 * will still allow the next scheduled run after the window expires.
 *
 * Does nothing if no lock exists — safe to call unconditionally in finally blocks.
 *
 * @param db      - SQLite database
 * @param jobName - Canonical job name
 */
export function releaseSchedulerLock(db: Database, jobName: string): void {
  try {
    db.prepare(
      `UPDATE scheduler_locks SET released_at = datetime('now')
       WHERE job_name = ?`,
    ).run(jobName);
  } catch {
    // Silently ignore — release is advisory
  }
}

/**
 * Sweep leaked locks: mark as released any lock for `jobName` where
 * released_at IS NULL and acquired_at is older than 2 × cadenceMinutes.
 *
 * This is the self-heal path: if a job died mid-run and never called
 * releaseSchedulerLock (e.g. pre-fix rows or OOM kill bypassing finally{}),
 * the next tick that calls this function will stamp released_at so the
 * lock no longer shows as "leaked".
 *
 * ISO-TEXT datetime guard: uses datetime() comparison, NOT epoch strftime,
 * per feedback_sqlite_iso8601_datetime_strcompare_bypass. The acquired_at
 * column stores datetime('now') ISO strings — datetime() comparisons are
 * safe here.
 *
 * Safe to call unconditionally before acquireSchedulerLock. No-op when
 * no lock exists or no locks match the predicate.
 *
 * @param db              - SQLite database
 * @param jobName         - Canonical job name
 * @param cadenceMinutes  - Nominal cadence of the job; threshold = 2 × cadenceMinutes
 */
export function sweepLeakedSchedulerLocks(
  db: Database,
  jobName: string,
  cadenceMinutes: number,
): void {
  try {
    // Use the same parameterization pattern as isSchedulerLockFresh:
    //   datetime('now', ? || ' minutes') where ? = '-120'
    // This produces datetime('now', '-120 minutes') which SQLite evaluates correctly.
    const thresholdParam = `-${cadenceMinutes * 2}`;
    db.prepare(
      `UPDATE scheduler_locks
          SET released_at = datetime('now')
        WHERE job_name = ?
          AND released_at IS NULL
          AND acquired_at < datetime('now', ? || ' minutes')`,
    ).run(jobName, thresholdParam);
  } catch {
    // Silently ignore — sweep is advisory
  }
}
