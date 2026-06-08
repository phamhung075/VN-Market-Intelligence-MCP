/**
 * Task 1221 — weeklyPortfolioReportJob: DB-backed lock to prevent concurrent runs on restart
 *
 * The in-memory `_running` flag resets on server restart, allowing double-fire
 * if the restart happens near the cron schedule time. A DB-backed lock persists
 * across restarts and prevents duplicate weekly reports.
 *
 * TDD: Tests written first (RED), then implementation.
 */

Bun.env["DB_PATH"] = ":memory:";
import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import {
  acquireSchedulerLock,
  releaseSchedulerLock,
  isSchedulerLockFresh,
  ensureSchedulerLocksTable,
} from "../infrastructure/db/schedulerLockStore.js";

// ---------------------------------------------------------------------------
// Test DB setup
// ---------------------------------------------------------------------------

function makeTestDb(): Database {
  const db = new Database(":memory:");
  ensureSchedulerLocksTable(db);
  return db;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Task 1221 — Scheduler DB lock", () => {
  // ── ensureSchedulerLocksTable ─────────────────────────────────────────────

  it("creates scheduler_locks table if not present", () => {
    const db = new Database(":memory:");
    ensureSchedulerLocksTable(db);
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='scheduler_locks'").get();
    expect(row).not.toBeNull();
  });

  it("is idempotent — can be called multiple times without error", () => {
    const db = new Database(":memory:");
    expect(() => {
      ensureSchedulerLocksTable(db);
      ensureSchedulerLocksTable(db);
      ensureSchedulerLocksTable(db);
    }).not.toThrow();
  });

  // ── acquireSchedulerLock ──────────────────────────────────────────────────

  it("acquireSchedulerLock returns true when no lock exists", () => {
    const db = makeTestDb();
    const acquired = acquireSchedulerLock(db, "weeklyPortfolioReport");
    expect(acquired).toBe(true);
  });

  it("acquireSchedulerLock writes a lock row with acquired_at set", () => {
    const db = makeTestDb();
    acquireSchedulerLock(db, "weeklyPortfolioReport");
    const row = db.prepare("SELECT * FROM scheduler_locks WHERE job_name = 'weeklyPortfolioReport'").get() as { job_name: string; acquired_at: string; released_at: string | null } | null;
    expect(row).not.toBeNull();
    expect(row!.job_name).toBe("weeklyPortfolioReport");
    expect(typeof row!.acquired_at).toBe("string");
  });

  it("acquireSchedulerLock returns false when fresh lock exists (within 1h)", () => {
    const db = makeTestDb();
    // Simulate a recent lock already acquired
    db.prepare(
      "INSERT INTO scheduler_locks (job_name, acquired_at) VALUES (?, datetime('now'))"
    ).run("weeklyPortfolioReport");

    const acquired = acquireSchedulerLock(db, "weeklyPortfolioReport");
    expect(acquired).toBe(false);
  });

  it("acquireSchedulerLock returns true when existing lock is stale (> 1h ago)", () => {
    const db = makeTestDb();
    // Insert a stale lock (70 minutes ago)
    db.prepare(
      "INSERT INTO scheduler_locks (job_name, acquired_at) VALUES (?, datetime('now', '-70 minutes'))"
    ).run("weeklyPortfolioReport");

    const acquired = acquireSchedulerLock(db, "weeklyPortfolioReport");
    expect(acquired).toBe(true);
  });

  it("acquireSchedulerLock is idempotent for different job names", () => {
    const db = makeTestDb();
    const r1 = acquireSchedulerLock(db, "weeklyPortfolioReport");
    const r2 = acquireSchedulerLock(db, "anotherJob");
    expect(r1).toBe(true);
    expect(r2).toBe(true);
  });

  // ── releaseSchedulerLock ──────────────────────────────────────────────────

  it("releaseSchedulerLock sets released_at on the lock row", () => {
    const db = makeTestDb();
    acquireSchedulerLock(db, "weeklyPortfolioReport");
    releaseSchedulerLock(db, "weeklyPortfolioReport");

    const row = db.prepare("SELECT released_at FROM scheduler_locks WHERE job_name = 'weeklyPortfolioReport'").get() as { released_at: string | null } | null;
    expect(row).not.toBeNull();
    expect(row!.released_at).not.toBeNull();
  });

  it("releaseSchedulerLock does not throw when no lock exists", () => {
    const db = makeTestDb();
    expect(() => releaseSchedulerLock(db, "nonExistentJob")).not.toThrow();
  });

  // ── isSchedulerLockFresh ──────────────────────────────────────────────────

  it("isSchedulerLockFresh returns false when no lock exists", () => {
    const db = makeTestDb();
    expect(isSchedulerLockFresh(db, "weeklyPortfolioReport", 60)).toBe(false);
  });

  it("isSchedulerLockFresh returns true when lock acquired within window", () => {
    const db = makeTestDb();
    db.prepare(
      "INSERT INTO scheduler_locks (job_name, acquired_at) VALUES (?, datetime('now'))"
    ).run("weeklyPortfolioReport");

    expect(isSchedulerLockFresh(db, "weeklyPortfolioReport", 60)).toBe(true);
  });

  it("isSchedulerLockFresh returns false when lock is outside window", () => {
    const db = makeTestDb();
    db.prepare(
      "INSERT INTO scheduler_locks (job_name, acquired_at) VALUES (?, datetime('now', '-120 minutes'))"
    ).run("weeklyPortfolioReport");

    expect(isSchedulerLockFresh(db, "weeklyPortfolioReport", 60)).toBe(false);
  });

  // ── weeklyPortfolioReport integration ────────────────────────────────────

  it("runWeeklyPortfolioReport skips when DB lock is fresh", async () => {
    const db = makeTestDb();

    // Pre-create tables needed by runWeeklyPortfolioReport
    db.exec(`
      CREATE TABLE IF NOT EXISTS positions (id INTEGER PRIMARY KEY, code TEXT, shares INTEGER, avg_price REAL, opened_at TEXT, closed_at TEXT);
      CREATE TABLE IF NOT EXISTS market_prices (code TEXT PRIMARY KEY, price REAL, change_amt REAL, change_pct REAL, volume REAL, updated_at TEXT);
      CREATE TABLE IF NOT EXISTS portfolio_pnl_snapshots (id INTEGER PRIMARY KEY, date TEXT, code TEXT, shares INTEGER, avg_price REAL, current_price REAL, pnl_pct REAL, pnl_amount REAL, snapshot_at TEXT, UNIQUE(date, code));
    `);

    // Insert a fresh lock for the weekly report
    acquireSchedulerLock(db, "weeklyPortfolioReport");

    const { runWeeklyPortfolioReport } = await import(
      "../scheduler/portfolio/weeklyPortfolioReportJob.js"
    );

    let sendCalled = false;
    const sendFn = async (_text: string) => {
      sendCalled = true;
    };

    await runWeeklyPortfolioReport({ db, sendFn });

    // Should have been skipped due to fresh DB lock
    expect(sendCalled).toBe(false);
  });

  it("runWeeklyPortfolioReport runs when DB lock is stale (> 1h)", async () => {
    const db = makeTestDb();

    db.exec(`
      CREATE TABLE IF NOT EXISTS positions (id INTEGER PRIMARY KEY, code TEXT, shares INTEGER, avg_price REAL, opened_at TEXT, closed_at TEXT);
      CREATE TABLE IF NOT EXISTS market_prices (code TEXT PRIMARY KEY, price REAL, change_amt REAL, change_pct REAL, volume REAL, updated_at TEXT);
      CREATE TABLE IF NOT EXISTS portfolio_pnl_snapshots (id INTEGER PRIMARY KEY, date TEXT, code TEXT, shares INTEGER, avg_price REAL, current_price REAL, pnl_pct REAL, pnl_amount REAL, snapshot_at TEXT, UNIQUE(date, code));
    `);

    // Seed one open position so the early-return guard (no positions → skip) does not fire
    db.prepare(
      "INSERT INTO positions (code, shares, avg_price, opened_at) VALUES (?, ?, ?, ?)"
    ).run("VCB", 100, 83000, "2025-01-01T00:00:00Z");

    // Insert a stale lock (70 minutes ago)
    db.prepare(
      "INSERT INTO scheduler_locks (job_name, acquired_at) VALUES (?, datetime('now', '-70 minutes'))"
    ).run("weeklyPortfolioReport");

    const { runWeeklyPortfolioReport } = await import(
      "../scheduler/portfolio/weeklyPortfolioReportJob.js"
    );

    let sendCalled = false;
    const sendFn = async (_text: string) => {
      sendCalled = true;
    };

    await runWeeklyPortfolioReport({ db, sendFn });

    // Should have run (stale lock allows re-execution)
    expect(sendCalled).toBe(true);
  });
});
