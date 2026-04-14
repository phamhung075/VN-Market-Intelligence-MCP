// src/__tests__/1221-weekly-portfolio-db-lock.test.ts
process.env["DB_PATH"] = ":memory:";
import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { runWeeklyPortfolioReport } from "../scheduler/weeklyPortfolioReportJob.js";

/**
 * Task 1221 — weeklyPortfolioReportJob: DB-backed lock to prevent concurrent runs on restart.
 *
 * The in-memory `_running` flag resets to false on every server restart.
 * A launchctl restart that fires Sunday cron twice within seconds of each other
 * can result in two concurrent runs. The fix: check cron_job_runs for a
 * 'running' row that started within the last 6 hours — if found, skip.
 */

/** Minimal schema with just the tables needed for the lock check. */
function buildDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS cron_job_runs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name    TEXT NOT NULL,
      started_at  TEXT NOT NULL,
      finished_at TEXT,
      status      TEXT NOT NULL DEFAULT 'running',
      rows_written INTEGER,
      error_msg   TEXT,
      duration_ms INTEGER
    );
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
  it("skips execution when a 'running' row exists in cron_job_runs within the last 6 hours", async () => {
    const db = buildDb();

    // Simulate a prior run that is still 'running' (started 2 minutes ago)
    db.exec(`
      INSERT INTO cron_job_runs (job_name, started_at, status)
      VALUES ('weeklyPortfolioReportJob', datetime('now', '-2 minutes'), 'running')
    `);

    let sendCallCount = 0;
    await runWeeklyPortfolioReport({
      db,
      sendFn: async () => { sendCallCount++; },
    });

    // Should have been skipped — no Telegram send
    expect(sendCallCount).toBe(0);
  });

  it("proceeds when the only running row is older than 6 hours (stale lock)", async () => {
    const db = buildDb();

    // Stale lock from 7 hours ago — should be ignored
    db.exec(`
      INSERT INTO cron_job_runs (job_name, started_at, status)
      VALUES ('weeklyPortfolioReportJob', datetime('now', '-7 hours'), 'running')
    `);

    let sendCallCount = 0;
    await runWeeklyPortfolioReport({
      db,
      sendFn: async () => { sendCallCount++; },
    });

    // Stale lock should be ignored — job should run and send
    expect(sendCallCount).toBe(1);
  });

  it("proceeds when cron_job_runs has no running row for this job", async () => {
    const db = buildDb();

    // Only a completed run (status='success') exists
    db.exec(`
      INSERT INTO cron_job_runs (job_name, started_at, finished_at, status)
      VALUES ('weeklyPortfolioReportJob', datetime('now', '-1 hour'), datetime('now', '-58 minutes'), 'success')
    `);

    let sendCallCount = 0;
    await runWeeklyPortfolioReport({
      db,
      sendFn: async () => { sendCallCount++; },
    });

    // Completed run should not block — job proceeds
    expect(sendCallCount).toBe(1);
  });

  it("proceeds when the running row belongs to a different job", async () => {
    const db = buildDb();

    // Different job is running — should not affect weeklyPortfolioReportJob
    db.exec(`
      INSERT INTO cron_job_runs (job_name, started_at, status)
      VALUES ('dataAuditJob:daily', datetime('now', '-1 minute'), 'running')
    `);

    let sendCallCount = 0;
    await runWeeklyPortfolioReport({
      db,
      sendFn: async () => { sendCallCount++; },
    });

    expect(sendCallCount).toBe(1);
  });

  it("proceeds when cron_job_runs table is empty", async () => {
    const db = buildDb();

    let sendCallCount = 0;
    await runWeeklyPortfolioReport({
      db,
      sendFn: async () => { sendCallCount++; },
    });

    expect(sendCallCount).toBe(1);
  });
});
