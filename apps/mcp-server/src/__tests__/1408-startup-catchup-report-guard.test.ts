/**
 * Task 1408 — startup-catchup: skip eveningSummaryJob when valid report exists
 *              or when it is pre-market-open time (UTC < 02:00 weekday).
 *
 * ACs:
 * (a) catchup skips when valid report exists for today (vnIndex.fetchedAt within
 *     25h AND newsCount > 0) — reportCheckFn returns true → shouldRunCatchup false
 * (b) catchup skips when it is pre-market-open time: UTC hour < 2 on a weekday
 *     AND the window has been reached per UTC date (i.e. the race: container boots
 *     at 23:50 UTC day N, window passed that day, but 00:10 UTC day N+1 is still
 *     pre-market so a new check on day N+1 should not fire until 02:00+)
 *
 * Layer: interface/scheduler — tests shouldRunCatchup exported from jobs.ts
 */

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

let db: Database;
beforeEach(() => {
  db = new Database(":memory:");
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  createCronTable(db);
});

describe("Task 1408 — startup-catchup report guard", () => {
  it("AC-1a: window passed + no cron row + reportCheckFn returns true (valid report) → skips (returns false)", () => {
    // Evening window: 15:30 UTC passed. No cron row. But valid report exists.
    const now = new Date("2026-04-28T16:00:00Z");
    const reportCheckFn = () => true; // valid report exists
    expect(
      shouldRunCatchup(db, "eveningSummaryJob", 15, 30, now, true, reportCheckFn),
    ).toBe(false);
  });

  it("AC-1b: window passed + no cron row + reportCheckFn returns false (stale/missing report) → runs (returns true)", () => {
    // Evening window: 15:30 UTC passed. No cron row. Report is missing or stale.
    const now = new Date("2026-04-28T16:00:00Z");
    const reportCheckFn = () => false; // no valid report
    expect(
      shouldRunCatchup(db, "eveningSummaryJob", 15, 30, now, true, reportCheckFn),
    ).toBe(true);
  });

  it("AC-2: pre-market-open time (UTC 00:38, weekday) + window not reached → skips (window check false)", () => {
    // Container boots at 00:38 UTC Tuesday. 15:30 window NOT reached on this UTC day.
    // This is the exact race from the bug: the job was reaching 15:30 from the
    // previous UTC day but shouldRunCatchup checks >= date('now') (today UTC).
    const now = new Date("2026-04-28T00:38:00Z"); // 00:38 UTC Tuesday
    // No cron row, no report check needed — window not reached returns false
    expect(
      shouldRunCatchup(db, "eveningSummaryJob", 15, 30, now, true),
    ).toBe(false);
  });

  it("AC-3: window passed + no cron row + no reportCheckFn → runs (backward compat)", () => {
    // Existing behavior: no reportCheckFn provided → returns true as before
    const now = new Date("2026-04-28T16:00:00Z");
    expect(
      shouldRunCatchup(db, "eveningSummaryJob", 15, 30, now, true),
    ).toBe(true);
  });

  it("AC-4: reportCheckFn returns true but cron row already exists today → skips (cron-row check wins)", () => {
    // Even if reportCheckFn says valid, if cron row exists today we still skip
    db.prepare(
      `INSERT INTO cron_job_runs (job_name, started_at, status)
       VALUES (?, datetime('now'), 'success')`,
    ).run("eveningSummaryJob");
    const now = new Date("2026-04-28T16:00:00Z");
    const reportCheckFn = () => true;
    expect(
      shouldRunCatchup(db, "eveningSummaryJob", 15, 30, now, true, reportCheckFn),
    ).toBe(false);
  });

  it("AC-5: weekend + reportCheckFn returns false → skips (weekdayOnly wins)", () => {
    // Saturday: even if no valid report and window passed, weekdayOnly blocks it
    const now = new Date("2026-04-26T16:00:00Z"); // Saturday
    const reportCheckFn = () => false;
    expect(
      shouldRunCatchup(db, "eveningSummaryJob", 15, 30, now, true, reportCheckFn),
    ).toBe(false);
  });
});
