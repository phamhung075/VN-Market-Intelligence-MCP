/**
 * Task 1958a — alertDigestJob + summaryJob:daily startup catchup
 *
 * Root cause (RCA):
 *   - Both jobs lack startup-catchup probes in startScheduler.ts
 *   - When the event loop is stalled (heavy startup ops: ohlcv backfill,
 *     vnstock probe, bctcReparseJob zombies), node-cron misses the scheduled
 *     window and skips until the NEXT day (recoverMissedExecutions=false)
 *
 * Fix:
 *   1. Add shouldRunCatchup calls for alertDigestJob (14:00 UTC weekdays)
 *      and summaryJob:daily (15:30 UTC daily) in the startup catchup block
 *   2. Pass recoverMissedExecutions: true to those cron registrations so
 *      event-loop stalls during a running container are also recovered
 *
 * ACs tested here:
 *   AC-1a: alertDigestJob catchup — window reached, no row today → true
 *   AC-1b: alertDigestJob catchup — row exists today → false
 *   AC-1c: alertDigestJob catchup — window not reached → false
 *   AC-1d: alertDigestJob catchup — weekend + weekdayOnly=true → false
 *   AC-2a: summaryJob:daily catchup — window reached, no row → true (any day)
 *   AC-2b: summaryJob:daily catchup — row exists today → false
 *   AC-2c: summaryJob:daily catchup — window not reached → false
 *   AC-2d: summaryJob:daily catchup — Saturday (weekdayOnly=false) → true when window passed
 *   AC-3:  shouldRunCatchup — fail-safe on DB error (existing AC-7 pattern)
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { shouldRunCatchup } from "../scheduler/jobs.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function createCronTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cron_job_runs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name     TEXT NOT NULL,
      started_at   TEXT NOT NULL,
      finished_at  TEXT,
      status       TEXT NOT NULL CHECK(status IN ('running','success','error','crashed')),
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
  createCronTable(db);
});

// ─────────────────────────────────────────────────────────────────────────────
// alertDigestJob catchup tests
// alertDigest fires at 21:00 VN = 14:00 UTC on weekdays (Mon-Fri)
// shouldRunCatchup params: windowUtcHour=14, windowUtcMin=0, weekdayOnly=true
// ─────────────────────────────────────────────────────────────────────────────

describe("1958a — alertDigestJob startup catchup", () => {
  it("AC-1a: window reached (15:00 UTC > 14:00), no row today → returns true", () => {
    // 2026-05-20 is a Wednesday
    const now = new Date("2026-05-20T15:00:00Z");
    expect(shouldRunCatchup(db, "alertDigestJob", 14, 0, now, true)).toBe(true);
  });

  it("AC-1b: window reached, success row exists today → returns false (dedup)", () => {
    insertRunToday(db, "alertDigestJob");
    const now = new Date("2026-05-20T15:00:00Z");
    expect(shouldRunCatchup(db, "alertDigestJob", 14, 0, now, true)).toBe(false);
  });

  it("AC-1c: window not yet reached (13:59 UTC < 14:00 threshold) → returns false", () => {
    const now = new Date("2026-05-20T13:59:00Z");
    expect(shouldRunCatchup(db, "alertDigestJob", 14, 0, now, true)).toBe(false);
  });

  it("AC-1d: exactly at window (14:00:00 UTC) → returns true", () => {
    const now = new Date("2026-05-20T14:00:00Z");
    expect(shouldRunCatchup(db, "alertDigestJob", 14, 0, now, true)).toBe(true);
  });

  it("AC-1e: Saturday + weekdayOnly=true → returns false even when window passed", () => {
    // 2026-05-23 is a Saturday
    const now = new Date("2026-05-23T15:00:00Z");
    expect(shouldRunCatchup(db, "alertDigestJob", 14, 0, now, true)).toBe(false);
  });

  it("AC-1f: Sunday + weekdayOnly=true → returns false", () => {
    // 2026-05-24 is a Sunday
    const now = new Date("2026-05-24T15:00:00Z");
    expect(shouldRunCatchup(db, "alertDigestJob", 14, 0, now, true)).toBe(false);
  });

  it("AC-1g: Monday + weekdayOnly=true + window passed + no row → returns true", () => {
    // 2026-05-25 is a Monday
    const now = new Date("2026-05-25T15:00:00Z");
    expect(shouldRunCatchup(db, "alertDigestJob", 14, 0, now, true)).toBe(true);
  });

  it("AC-1h: row for different job does not suppress alertDigestJob catchup", () => {
    insertRunToday(db, "summaryJob:daily");
    const now = new Date("2026-05-20T15:00:00Z");
    expect(shouldRunCatchup(db, "alertDigestJob", 14, 0, now, true)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// summaryJob:daily catchup tests
// summaryJob:daily fires at 22:30 VN = 15:30 UTC every day (weekdayOnly=false)
// shouldRunCatchup params: windowUtcHour=15, windowUtcMin=30, weekdayOnly=false
// ─────────────────────────────────────────────────────────────────────────────

describe("1958a — summaryJob:daily startup catchup", () => {
  it("AC-2a: window reached (16:00 UTC > 15:30), no row today → returns true", () => {
    const now = new Date("2026-05-20T16:00:00Z");
    expect(shouldRunCatchup(db, "summaryJob:daily", 15, 30, now, false)).toBe(true);
  });

  it("AC-2b: window reached, success row exists today → returns false", () => {
    insertRunToday(db, "summaryJob:daily");
    const now = new Date("2026-05-20T16:00:00Z");
    expect(shouldRunCatchup(db, "summaryJob:daily", 15, 30, now, false)).toBe(false);
  });

  it("AC-2c: window not yet reached (15:29 UTC < 15:30 threshold) → returns false", () => {
    const now = new Date("2026-05-20T15:29:00Z");
    expect(shouldRunCatchup(db, "summaryJob:daily", 15, 30, now, false)).toBe(false);
  });

  it("AC-2d: exactly at window (15:30:00 UTC) → returns true", () => {
    const now = new Date("2026-05-20T15:30:00Z");
    expect(shouldRunCatchup(db, "summaryJob:daily", 15, 30, now, false)).toBe(true);
  });

  it("AC-2e: Saturday + weekdayOnly=false → returns true when window passed (fires every day)", () => {
    // 2026-05-23 is a Saturday — summaryJob:daily fires every day, not just weekdays
    const now = new Date("2026-05-23T16:00:00Z");
    expect(shouldRunCatchup(db, "summaryJob:daily", 15, 30, now, false)).toBe(true);
  });

  it("AC-2f: alertDigestJob row does not suppress summaryJob:daily catchup", () => {
    insertRunToday(db, "alertDigestJob");
    const now = new Date("2026-05-20T16:00:00Z");
    expect(shouldRunCatchup(db, "summaryJob:daily", 15, 30, now, false)).toBe(true);
  });

  it("AC-2g: both jobs can independently have their catchup triggered on same startup", () => {
    // Neither job has a row → both should return true
    const now = new Date("2026-05-20T16:00:00Z");
    const alertDigestShouldRun = shouldRunCatchup(db, "alertDigestJob", 14, 0, now, true);
    const summaryDailyShouldRun = shouldRunCatchup(db, "summaryJob:daily", 15, 30, now, false);
    expect(alertDigestShouldRun).toBe(true);
    expect(summaryDailyShouldRun).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3: DB error safety (applies to both jobs)
// ─────────────────────────────────────────────────────────────────────────────

describe("1958a — shouldRunCatchup DB error safety", () => {
  it("AC-3: DB table missing → returns false without throwing (fail-safe)", () => {
    db.exec("DROP TABLE cron_job_runs");
    const now = new Date("2026-05-20T15:00:00Z");
    expect(() =>
      shouldRunCatchup(db, "alertDigestJob", 14, 0, now, true)
    ).not.toThrow();
    expect(shouldRunCatchup(db, "alertDigestJob", 14, 0, now, true)).toBe(false);
  });
});
