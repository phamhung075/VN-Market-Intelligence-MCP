/**
 * Task FIX-SCHEDULER-LOCK-NO-RELEASE-TTL
 *
 * Tests that scheduler_locks rows are always released in a finally{} block and
 * that leaked locks (released_at IS NULL, acquired_at older than 2x cadence)
 * are self-healed by sweepLeakedSchedulerLocks().
 *
 * AC (a): a job that throws mid-run → its scheduler_locks row gets released_at
 *         set in the finally{} path (no permanent leak).
 * AC (b): a pre-existing leaked lock (released_at NULL, acquired_at older than
 *         2x cadence) is auto-expired by the sweep and does NOT block the next
 *         acquire.
 *
 * Uses real schema builder (:memory:) — no hand-rolled DDL.
 */

Bun.env["DB_PATH"] = ":memory:";
import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  ensureSchedulerLocksTable,
  acquireSchedulerLock,
  releaseSchedulerLock,
  sweepLeakedSchedulerLocks,
} from "../infrastructure/db/schedulerLockStore.js";
import { runWeeklyPortfolioReport } from "../scheduler/portfolio/weeklyPortfolioReportJob.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTestDb(): Database {
  const db = new Database(":memory:");
  ensureSchedulerLocksTable(db);
  return db;
}

/** Read the lock row for a given job name. */
function getLockRow(
  db: Database,
  jobName: string,
): { job_name: string; acquired_at: string; released_at: string | null } | null {
  return db
    .prepare(
      "SELECT job_name, acquired_at, released_at FROM scheduler_locks WHERE job_name = ?",
    )
    .get(jobName) as { job_name: string; acquired_at: string; released_at: string | null } | null;
}

// ---------------------------------------------------------------------------
// AC (a): finally{} guarantees release on throw
// ---------------------------------------------------------------------------

describe("FIX-SCHEDULER-LOCK-NO-RELEASE-TTL — AC-a: finally{} release on throw", () => {
  it("lock is released even when the job throws mid-run", async () => {
    const db = makeTestDb();
    // Minimal tables so the lock-acquire path is reached (job will throw during send)
    db.exec(`
      CREATE TABLE IF NOT EXISTS positions (
        code TEXT PRIMARY KEY, shares REAL, avg_price REAL, closed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS market_prices (
        code TEXT PRIMARY KEY, price REAL, change_amt REAL, change_pct REAL, volume REAL, updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS portfolio_pnl_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL, date TEXT NOT NULL, shares REAL, avg_price REAL,
        current_price REAL, pnl_pct REAL, pnl_amount REAL, snapshot_at TEXT,
        UNIQUE(date, code)
      );
      CREATE TABLE IF NOT EXISTS cron_job_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, job_name TEXT NOT NULL,
        started_at TEXT NOT NULL, finished_at TEXT,
        status TEXT NOT NULL, rows_written INTEGER, error_msg TEXT, duration_ms INTEGER
      );
    `);

    // Seed one open position so the job reaches the send step
    db.prepare(
      "INSERT INTO positions (code, shares, avg_price, closed_at) VALUES (?, ?, ?, NULL)",
    ).run("VCB", 100, 80000);

    let lockRowAfterRun: { released_at: string | null } | null = null;

    // sendFn throws mid-run to simulate a crash after lock acquisition
    const throwingFn = async (_text: string): Promise<void> => {
      throw new Error("simulated crash mid-run");
    };

    // Run — should not propagate the error (runWeeklyPortfolioReport swallows errors)
    await runWeeklyPortfolioReport({ db, sendFn: throwingFn });

    // The lock row must exist AND have released_at set (finally{} ran)
    lockRowAfterRun = getLockRow(db, "weeklyPortfolioReport");
    expect(lockRowAfterRun).not.toBeNull();
    expect(lockRowAfterRun!.released_at).not.toBeNull();
  });

  it("lock is also released on the success path", async () => {
    const db = makeTestDb();
    db.exec(`
      CREATE TABLE IF NOT EXISTS positions (
        code TEXT PRIMARY KEY, shares REAL, avg_price REAL, closed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS market_prices (
        code TEXT PRIMARY KEY, price REAL, change_amt REAL, change_pct REAL, volume REAL, updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS portfolio_pnl_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL, date TEXT NOT NULL, shares REAL, avg_price REAL,
        current_price REAL, pnl_pct REAL, pnl_amount REAL, snapshot_at TEXT,
        UNIQUE(date, code)
      );
      CREATE TABLE IF NOT EXISTS cron_job_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, job_name TEXT NOT NULL,
        started_at TEXT NOT NULL, finished_at TEXT,
        status TEXT NOT NULL, rows_written INTEGER, error_msg TEXT, duration_ms INTEGER
      );
    `);

    db.prepare(
      "INSERT INTO positions (code, shares, avg_price, closed_at) VALUES (?, ?, ?, NULL)",
    ).run("FPT", 50, 120000);

    const successFn = async (_text: string): Promise<void> => {
      // no-op success
    };

    await runWeeklyPortfolioReport({ db, sendFn: successFn });

    const row = getLockRow(db, "weeklyPortfolioReport");
    expect(row).not.toBeNull();
    expect(row!.released_at).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AC (b): sweepLeakedSchedulerLocks auto-expires old leaked locks
// ---------------------------------------------------------------------------

describe("FIX-SCHEDULER-LOCK-NO-RELEASE-TTL — AC-b: sweepLeakedSchedulerLocks", () => {
  it("marks a leaked lock as released when acquired_at is older than 2x cadence", () => {
    const db = makeTestDb();
    const CADENCE_MINUTES = 60;

    // Insert a leaked lock: released_at IS NULL, acquired_at 3x cadence ago
    db.prepare(
      "INSERT INTO scheduler_locks (job_name, acquired_at, released_at) VALUES (?, datetime('now', ? || ' minutes'), NULL)",
    ).run("weeklyPortfolioReport", `-${CADENCE_MINUTES * 3}`);

    // Verify the lock is leaked (released_at IS NULL)
    const before = getLockRow(db, "weeklyPortfolioReport");
    expect(before?.released_at).toBeNull();

    // Sweep
    sweepLeakedSchedulerLocks(db, "weeklyPortfolioReport", CADENCE_MINUTES);

    // After sweep: released_at must be set
    const after = getLockRow(db, "weeklyPortfolioReport");
    expect(after?.released_at).not.toBeNull();
  });

  it("does NOT touch a lock that was acquired within 2x cadence (still running)", () => {
    const db = makeTestDb();
    const CADENCE_MINUTES = 60;

    // Insert a lock acquired 30 min ago (within 2x cadence = 120 min threshold)
    db.prepare(
      "INSERT INTO scheduler_locks (job_name, acquired_at, released_at) VALUES (?, datetime('now', '-30 minutes'), NULL)",
    ).run("weeklyPortfolioReport");

    sweepLeakedSchedulerLocks(db, "weeklyPortfolioReport", CADENCE_MINUTES);

    // Should NOT have been swept — still within 2x cadence window
    const after = getLockRow(db, "weeklyPortfolioReport");
    expect(after?.released_at).toBeNull();
  });

  it("does NOT sweep a lock that was already properly released", () => {
    const db = makeTestDb();
    const CADENCE_MINUTES = 60;

    // Insert a properly released lock (released_at IS NOT NULL)
    db.prepare(
      `INSERT INTO scheduler_locks (job_name, acquired_at, released_at)
       VALUES (?, datetime('now', '-200 minutes'), datetime('now', '-195 minutes'))`,
    ).run("weeklyPortfolioReport");

    sweepLeakedSchedulerLocks(db, "weeklyPortfolioReport", CADENCE_MINUTES);

    // released_at should remain unchanged (not reset)
    const after = getLockRow(db, "weeklyPortfolioReport");
    expect(after?.released_at).not.toBeNull();
  });

  it("after sweep, acquireSchedulerLock succeeds (leaked lock no longer blocks)", () => {
    const db = makeTestDb();
    const CADENCE_MINUTES = 60;

    // Insert a leaked lock old enough to be swept
    db.prepare(
      "INSERT INTO scheduler_locks (job_name, acquired_at, released_at) VALUES (?, datetime('now', '-200 minutes'), NULL)",
    ).run("testJob");

    // Without sweep: acquireSchedulerLock sees the lock as stale (> windowMinutes=60) → acquires OK
    // This is the existing freshness-window self-heal. After sweep it should also work.
    sweepLeakedSchedulerLocks(db, "testJob", CADENCE_MINUTES);

    const acquired = acquireSchedulerLock(db, "testJob", CADENCE_MINUTES);
    expect(acquired).toBe(true);
  });

  it("sweeps only the specified job_name, leaving other jobs untouched", () => {
    const db = makeTestDb();
    const CADENCE_MINUTES = 60;

    // Two leaked locks, both old
    db.prepare(
      "INSERT INTO scheduler_locks (job_name, acquired_at, released_at) VALUES (?, datetime('now', '-200 minutes'), NULL)",
    ).run("targetJob");
    db.prepare(
      "INSERT INTO scheduler_locks (job_name, acquired_at, released_at) VALUES (?, datetime('now', '-200 minutes'), NULL)",
    ).run("untouchedJob");

    sweepLeakedSchedulerLocks(db, "targetJob", CADENCE_MINUTES);

    const target = getLockRow(db, "targetJob");
    const untouched = getLockRow(db, "untouchedJob");

    expect(target?.released_at).not.toBeNull();
    expect(untouched?.released_at).toBeNull(); // not swept
  });

  it("is safe to call when no lock row exists (no-op, no throw)", () => {
    const db = makeTestDb();
    expect(() => sweepLeakedSchedulerLocks(db, "nonExistentJob", 60)).not.toThrow();
  });
});
