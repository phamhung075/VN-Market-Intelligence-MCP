// src/__tests__/1221-weekly-portfolio-db-lock.test.ts
Bun.env["DB_PATH"] = ":memory:";
import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { runWeeklyPortfolioReport } from "../scheduler/portfolio/weeklyPortfolioReportJob.js";
import {
  acquireSchedulerLock,
  ensureSchedulerLocksTable,
} from "../infrastructure/db/schedulerLockStore.js";

/**
 * Task 1221 — weeklyPortfolioReportJob: DB-backed lock to prevent concurrent runs on restart.
 *
 * The in-memory `_running` flag resets to false on every server restart.
 * A launchctl restart that fires the Sunday cron within the lock window of the
 * last run can result in duplicate reports. The fix: check scheduler_locks for
 * a fresh lock (acquired within the last 60 minutes) — if found, skip.
 *
 * Production code uses schedulerLockStore.ts / scheduler_locks table (Task 1221).
 */

/** Minimal schema with all tables needed for the lock check and job execution. */
function buildDb(): Database {
  const db = new Database(":memory:");
  ensureSchedulerLocksTable(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS positions (
      code TEXT PRIMARY KEY,
      shares REAL,
      avg_price REAL,
      closed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS portfolio_pnl_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      price REAL NOT NULL,
      snapshot_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS market_prices (
      code TEXT PRIMARY KEY,
      price REAL NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

describe("Task 1221 — weeklyPortfolioReportJob DB-backed lock", () => {
  it("skips execution when a fresh lock exists in scheduler_locks within the last 60 minutes", async () => {
    const db = buildDb();

    // Simulate a prior run that acquired the lock just now (2 minutes ago)
    db.prepare(
      "INSERT INTO scheduler_locks (job_name, acquired_at, released_at) VALUES (?, datetime('now', '-2 minutes'), NULL)"
    ).run("weeklyPortfolioReport");

    let sendCallCount = 0;
    await runWeeklyPortfolioReport({
      db,
      sendFn: async () => { sendCallCount++; },
    });

    // Should have been skipped — fresh lock present, no Telegram send
    expect(sendCallCount).toBe(0);
  });

  it("proceeds when the only lock row is older than 60 minutes (stale lock)", async () => {
    const db = buildDb();

    // Stale lock from 70 minutes ago — should be ignored
    db.prepare(
      "INSERT INTO scheduler_locks (job_name, acquired_at, released_at) VALUES (?, datetime('now', '-70 minutes'), NULL)"
    ).run("weeklyPortfolioReport");

    // Seed one open position so the early-return guard does not fire
    db.prepare("INSERT INTO positions (code, shares, avg_price, closed_at) VALUES (?, ?, ?, NULL)").run("VCB", 100, 80000);

    let sendCallCount = 0;
    await runWeeklyPortfolioReport({
      db,
      sendFn: async () => { sendCallCount++; },
    });

    // Stale lock should be ignored — job should run and send
    expect(sendCallCount).toBe(1);
  });

  it("proceeds when scheduler_locks has no row for this job (never ran)", async () => {
    const db = buildDb();

    // Only a lock for a different job exists; no row for weeklyPortfolioReport
    acquireSchedulerLock(db, "someOtherJob");

    // Seed one open position so the early-return guard does not fire
    db.prepare("INSERT INTO positions (code, shares, avg_price, closed_at) VALUES (?, ?, ?, NULL)").run("VCB", 100, 80000);

    let sendCallCount = 0;
    await runWeeklyPortfolioReport({
      db,
      sendFn: async () => { sendCallCount++; },
    });

    // No lock for this job — job proceeds
    expect(sendCallCount).toBe(1);
  });

  it("proceeds when the lock row belongs to a different job", async () => {
    const db = buildDb();

    // A different job holds a fresh lock — should not affect weeklyPortfolioReport
    db.prepare(
      "INSERT INTO scheduler_locks (job_name, acquired_at, released_at) VALUES (?, datetime('now', '-1 minute'), NULL)"
    ).run("dataAuditJob");

    // Seed one open position so the early-return guard does not fire
    db.prepare("INSERT INTO positions (code, shares, avg_price, closed_at) VALUES (?, ?, ?, NULL)").run("VCB", 100, 80000);

    let sendCallCount = 0;
    await runWeeklyPortfolioReport({
      db,
      sendFn: async () => { sendCallCount++; },
    });

    expect(sendCallCount).toBe(1);
  });

  it("proceeds when scheduler_locks table is empty", async () => {
    const db = buildDb();

    // Seed one open position so the early-return guard does not fire
    db.prepare("INSERT INTO positions (code, shares, avg_price, closed_at) VALUES (?, ?, ?, NULL)").run("VCB", 100, 80000);

    let sendCallCount = 0;
    await runWeeklyPortfolioReport({
      db,
      sendFn: async () => { sendCallCount++; },
    });

    expect(sendCallCount).toBe(1);
  });
});
