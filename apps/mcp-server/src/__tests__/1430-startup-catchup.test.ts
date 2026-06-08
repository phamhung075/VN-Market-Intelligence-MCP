import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { shouldRunCatchup } from "../scheduler/jobs.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

function createCronTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cron_job_runs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name     TEXT NOT NULL,
      started_at   TEXT NOT NULL,
      finished_at  TEXT,
      status       TEXT NOT NULL CHECK(status IN ('running','success','error')),
      rows_written INTEGER,
      error_msg    TEXT,
      duration_ms  INTEGER
    )
  `);
}

function insertRunToday(db: Database, jobName: string): void {
  db.prepare(
    `INSERT INTO cron_job_runs (job_name, started_at, status)
     VALUES (?, datetime('now'), 'success')`
  ).run(jobName);
}

let db: Database;
beforeEach(() => {
  db = new Database(":memory:");
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  createCronTable(db);
});

describe("shouldRunCatchup", () => {
  it("AC-1: morning window passed, no row — returns true", () => {
    const now = new Date("2026-04-18T03:00:00Z"); // 03:00 UTC > 01:00 threshold
    expect(shouldRunCatchup(db, "morningBriefingJob", 1, 0, now)).toBe(true);
  });

  it("AC-2: morning window passed, row exists — returns false", () => {
    insertRunToday(db, "morningBriefingJob");
    const now = new Date("2026-04-18T03:00:00Z");
    expect(shouldRunCatchup(db, "morningBriefingJob", 1, 0, now)).toBe(false);
  });

  it("AC-3: morning window not yet reached — returns false", () => {
    const now = new Date("2026-04-18T00:30:00Z"); // 00:30 UTC < 01:00
    expect(shouldRunCatchup(db, "morningBriefingJob", 1, 0, now)).toBe(false);
  });

  it("AC-4: evening window passed, no row — returns true", () => {
    const now = new Date("2026-04-18T16:00:00Z"); // 16:00 UTC > 15:30 threshold
    expect(shouldRunCatchup(db, "eveningSummaryJob", 15, 30, now)).toBe(true);
  });

  it("AC-5: evening window not yet reached (15:29) — returns false", () => {
    const now = new Date("2026-04-18T15:29:00Z");
    expect(shouldRunCatchup(db, "eveningSummaryJob", 15, 30, now)).toBe(false);
  });

  it("AC-6: evening window exactly 15:30 — returns true", () => {
    const now = new Date("2026-04-18T15:30:00Z");
    expect(shouldRunCatchup(db, "eveningSummaryJob", 15, 30, now)).toBe(true);
  });

  it("AC-7: DB error — returns false without throwing", () => {
    // Drop table to force query error
    db.exec("DROP TABLE cron_job_runs");
    const now = new Date("2026-04-18T03:00:00Z");
    expect(() =>
      shouldRunCatchup(db, "morningBriefingJob", 1, 0, now)
    ).not.toThrow();
    expect(shouldRunCatchup(db, "morningBriefingJob", 1, 0, now)).toBe(false);
  });

  it("AC-8: row for different job — does not block morningBriefingJob", () => {
    insertRunToday(db, "eveningSummaryJob");
    const now = new Date("2026-04-18T03:00:00Z");
    expect(shouldRunCatchup(db, "morningBriefingJob", 1, 0, now)).toBe(true);
  });

  it("AC-9: france window passed (10:00 UTC > 09:00 threshold), no row — returns true", () => {
    const now = new Date("2026-04-18T10:00:00Z");
    expect(shouldRunCatchup(db, "franceSummaryJob", 9, 0, now)).toBe(true);
  });

  it("AC-10: france window not yet reached (08:00 UTC < 09:00 threshold) — returns false", () => {
    const now = new Date("2026-04-18T08:00:00Z");
    expect(shouldRunCatchup(db, "franceSummaryJob", 9, 0, now)).toBe(false);
  });

  it("AC-11: Saturday + weekdayOnly=true — returns false even if window passed", () => {
    // 2026-04-19 is a Saturday (getUTCDay() === 6)
    const now = new Date("2026-04-19T03:00:00Z");
    expect(shouldRunCatchup(db, "morningBriefingJob", 1, 0, now, true)).toBe(false);
  });

  it("AC-12: Monday + weekdayOnly=true + window passed + no row — returns true", () => {
    // 2026-04-20 is a Monday (getUTCDay() === 1)
    const now = new Date("2026-04-20T03:00:00Z");
    expect(shouldRunCatchup(db, "morningBriefingJob", 1, 0, now, true)).toBe(true);
  });
});
