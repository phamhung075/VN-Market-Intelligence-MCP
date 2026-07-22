/**
 * FIX-CRON-SUNDAY-STARTUP-CATCHUP
 *
 * Root cause (RCA, RAW-verified 2026-07-22 against the live named-volume DB):
 *   node-cron's recoverMissedExecutions (scheduleCron's default) only replays
 *   ticks missed by IN-PROCESS event-loop lag — Scheduler.start() re-seeds
 *   lastCheck/lastExecution fresh from `new Date()` every time a ScheduledTask
 *   is constructed, i.e. every container boot. It can never see a scheduled
 *   time that already passed BEFORE this process existed. A weekly (e.g.
 *   Sunday-only) cron gets exactly ONE window per week — if the container is
 *   down at that exact moment, the whole week is silently lost with no replay,
 *   unlike a daily job (which gets another chance ~24h later, already covered
 *   by the existing task 1430 / 1958a startup-catchup probes).
 *
 *   Live evidence: devTeamHeartbeatJob/predictionOutcomeJob/integrityCheckJob/
 *   bondMaturityPollerJob (all Sunday, timezone:'UTC', early UTC-morning windows
 *   02:00-08:00) last recorded 2026-06-28 and silently skipped 3 consecutive
 *   Sundays (07-05, 07-12, 07-19) even though the container came back up and
 *   ran MANY other crons on 07-19 — its restart (12:31Z) landed AFTER these 4
 *   jobs' windows but BEFORE two sibling Sunday jobs whose window falls later
 *   in the UTC day (patternWatchJob 15:30 UTC, weeklyPortfolioReportJob 16:00
 *   UTC), which is why only those 4 (of the ~9 Sunday jobs) stayed dark —
 *   pure bad luck of restart timing relative to each job's specific window,
 *   not a timezone-string or day-of-week library bug.
 *
 * Fix: shouldRunCatchup() gains a `requiredUtcDay` param (0=Sunday..6=Saturday)
 * so the SAME startup-catchup pattern already used for daily jobs can be
 * applied to weekly ones without firing on the wrong day.
 *
 * ACs:
 *   AC-1: requiredUtcDay matches today + window passed + no row today → true
 *   AC-2: requiredUtcDay does NOT match today → false, even if window passed
 *   AC-3: requiredUtcDay matches + window NOT yet reached → false
 *   AC-4: requiredUtcDay matches + already ran today → false (dedup)
 *   AC-5: requiredUtcDay omitted (undefined) → behaves exactly as before (no
 *         day restriction) — backward compatibility for existing daily callers
 *   AC-6: requiredUtcDay + weekdayOnly=true together (should never both be
 *         needed in practice, but must not crash) — weekdayOnly still applies
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { shouldRunCatchup } from "../scheduler/jobs.js";

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

describe("FIX-CRON-SUNDAY-STARTUP-CATCHUP — shouldRunCatchup requiredUtcDay", () => {
  it("AC-1: Sunday + window passed (07:30 UTC > 07:00) + no row → true", () => {
    // 2026-07-19 is a Sunday
    const now = new Date("2026-07-19T07:30:00Z");
    expect(shouldRunCatchup(db, "devTeamHeartbeatJob", 7, 0, now, false, undefined, 0)).toBe(true);
  });

  it("AC-2: Monday (not the required Sunday) → false even though window passed", () => {
    // 2026-07-20 is a Monday
    const now = new Date("2026-07-20T07:30:00Z");
    expect(shouldRunCatchup(db, "devTeamHeartbeatJob", 7, 0, now, false, undefined, 0)).toBe(false);
  });

  it("AC-2b: Saturday (not the required Sunday) → false", () => {
    // 2026-07-18 is a Saturday
    const now = new Date("2026-07-18T07:30:00Z");
    expect(shouldRunCatchup(db, "devTeamHeartbeatJob", 7, 0, now, false, undefined, 0)).toBe(false);
  });

  it("AC-3: Sunday + window not yet reached (06:59 UTC < 07:00) → false", () => {
    const now = new Date("2026-07-19T06:59:00Z");
    expect(shouldRunCatchup(db, "devTeamHeartbeatJob", 7, 0, now, false, undefined, 0)).toBe(false);
  });

  it("AC-4: Sunday + window passed + already-ran row exists today → false (dedup)", () => {
    insertRunToday(db, "devTeamHeartbeatJob");
    const now = new Date("2026-07-19T07:30:00Z");
    expect(shouldRunCatchup(db, "devTeamHeartbeatJob", 7, 0, now, false, undefined, 0)).toBe(false);
  });

  it("AC-5: requiredUtcDay omitted → unrestricted, matches pre-existing daily behavior", () => {
    // Any day of week — Monday, window passed, no row → true (exactly like task 1430 callers)
    const now = new Date("2026-07-20T07:30:00Z");
    expect(shouldRunCatchup(db, "morningBriefingJob", 7, 0, now)).toBe(true);
  });

  it("AC-6: requiredUtcDay + weekdayOnly=true both set — weekdayOnly still gates first (no crash)", () => {
    // Sunday: weekdayOnly=true rejects weekends regardless of requiredUtcDay
    const now = new Date("2026-07-19T07:30:00Z");
    expect(shouldRunCatchup(db, "someJob", 7, 0, now, true, undefined, 0)).toBe(false);
  });

  it("all 4 Sunday jobs from item 1 independently evaluate true given their own windows", () => {
    const now = new Date("2026-07-19T09:00:00Z"); // past every window (02:00/02:30/07:00/08:00 UTC)
    expect(shouldRunCatchup(db, "integrityCheckJob", 2, 0, now, false, undefined, 0)).toBe(true);
    expect(shouldRunCatchup(db, "bondMaturityPollerJob", 2, 30, now, false, undefined, 0)).toBe(true);
    expect(shouldRunCatchup(db, "devTeamHeartbeatJob", 7, 0, now, false, undefined, 0)).toBe(true);
    expect(shouldRunCatchup(db, "predictionOutcomeJob", 8, 0, now, false, undefined, 0)).toBe(true);
  });
});
