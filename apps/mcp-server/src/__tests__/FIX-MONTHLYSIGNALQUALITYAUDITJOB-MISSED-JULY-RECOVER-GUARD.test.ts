/**
 * FIX-MONTHLYSIGNALQUALITYAUDITJOB-MISSED-JULY-RECOVER-GUARD — regression tests
 *
 * Defect: monthlySignalQualityAuditJob (cron '0 0 1 * *', UTC) missed the
 * 2026-07-01 and 2026-08-01 fires with zero recovery (RAW-verified live: last
 * real cron_job_runs success 2026-06-01). recoverMissedExecutions: false was the
 * opt-out, but flipping it alone is a PROVEN no-op — node-cron's recovery only
 * replays in-process event-loop stalls and can never bridge a process restart /
 * downtime spanning the fire instant (Scheduler.start() re-seeds lastExecution
 * from boot time). The real fix has three layers, all covered here:
 *
 *   L1 (startup catch-up, per-cadence-period dedup): shouldRunCatchup() gains a
 *      `cadence: 'day' | 'month'` parameter — for 'month', the dedup window is
 *      the current calendar month AND only a status='success' row blocks the
 *      catch-up (an 'error' row is a miss that must be retried on the next boot;
 *      the next natural fire is a month away). Any fire within a calendar month
 *      resolves to the SAME prior-month target, so a success anywhere in the
 *      current month proves the current target is already audited.
 *   L2 (T4 dedup guard inside the job): runMonthlySignalQualityJob() now calls
 *      shouldSkipMonthlyReplay() before sending — a success row for this job
 *      started in the current month ⇒ the current target's Telegram report was
 *      already sent ⇒ skip (never double-send). This is what makes
 *      recoverMissedExecutions: true (L3) safe.
 *   L3 (defence-in-depth): schedulerJobTable.ts flips the registration's
 *      recoverMissedExecutions false → true.
 *
 * Layer: tests — in-memory DB, no real Telegram sends.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  shouldSkipMonthlyReplay,
  shouldRunCatchup,
} from "../scheduler/startupHelpers.js";
import { runMonthlySignalQualityJob } from "../scheduler/audits/monthlySignalQualityJob.js";

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
      status       TEXT NOT NULL CHECK(status IN ('running','success','error')),
      rows_written INTEGER,
      error_msg    TEXT,
      duration_ms  INTEGER
    )
  `);
}

function createJobTables(db: Database): void {
  createCronTable(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS signal_rejections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      stock_code TEXT,
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    ,
    expires_at TEXT NOT NULL DEFAULT (datetime('now', '+1 hour')))
  `);
}

/** First day of the current UTC month, 'YYYY-MM-01' — matches real `new Date()`. */
function currentMonthStart(): string {
  return new Date().toISOString().slice(0, 7) + "-01";
}

/** First day of the previous UTC month. */
function previousMonthStart(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return d.toISOString().slice(0, 7) + "-01";
}

function insertRun(
  db: Database,
  jobName: string,
  startedAt: string,
  status: "success" | "error" | "running",
): void {
  db.prepare(
    `INSERT INTO cron_job_runs (job_name, started_at, status)
     VALUES (?, ?, ?)`,
  ).run(jobName, startedAt, status);
}

// ─────────────────────────────────────────────────────────────────────────────
// Group A — shouldSkipMonthlyReplay (L2 helper, startupHelpers.ts)
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-MONTHLYSIGNALQUALITYAUDITJOB — shouldSkipMonthlyReplay", () => {
  let db: Database;
  beforeEach(() => {
    db = new Database(":memory:");
    createCronTable(db);
  });

  it("A1: success row for the job started this month → true (target already audited)", () => {
    insertRun(db, "monthlySignalQualityAuditJob", `${currentMonthStart()} 00:00:00`, "success");
    expect(shouldSkipMonthlyReplay(db, "monthlySignalQualityAuditJob")).toBe(true);
  });

  it("A2: success row only in the PREVIOUS month → false (new target)", () => {
    insertRun(db, "monthlySignalQualityAuditJob", `${previousMonthStart()} 00:00:00`, "success");
    expect(shouldSkipMonthlyReplay(db, "monthlySignalQualityAuditJob")).toBe(false);
  });

  it("A3: no rows at all → false", () => {
    expect(shouldSkipMonthlyReplay(db, "monthlySignalQualityAuditJob")).toBe(false);
  });

  it("A4: error-status row this month → false (error is a miss — retry, never block)", () => {
    insertRun(db, "monthlySignalQualityAuditJob", `${currentMonthStart()} 00:00:00`, "error");
    expect(shouldSkipMonthlyReplay(db, "monthlySignalQualityAuditJob")).toBe(false);
  });

  it("A5: cron_job_runs table missing → false (fail-open — partial-schema tests proceed)", () => {
    db.exec("DROP TABLE cron_job_runs");
    expect(shouldSkipMonthlyReplay(db, "monthlySignalQualityAuditJob")).toBe(false);
  });

  it("A6: success row for a DIFFERENT job this month → false (per-job dedup)", () => {
    insertRun(db, "someOtherJob", `${currentMonthStart()} 00:00:00`, "success");
    expect(shouldSkipMonthlyReplay(db, "monthlySignalQualityAuditJob")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group B — shouldRunCatchup monthly cadence (L1, startupHelpers.ts)
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-MONTHLYSIGNALQUALITYAUDITJOB — shouldRunCatchup cadence='month'", () => {
  let db: Database;
  beforeEach(() => {
    db = new Database(":memory:");
    createCronTable(db);
  });

  // Pin nowUtc to a fixed mid-month date; the monthly dedup window derives from
  // nowUtc's month, so rows are inserted relative to the pinned month.
  const nowUtc = new Date("2026-08-15T12:00:00Z");

  it("B1: window passed, no row this month → true (missed fire → catch up)", () => {
    expect(shouldRunCatchup(db, "monthlySignalQualityAuditJob", 0, 0, nowUtc, false, undefined, undefined, "month")).toBe(true);
  });

  it("B2: success row this month → false (already audited this target)", () => {
    insertRun(db, "monthlySignalQualityAuditJob", "2026-08-01 00:00:00", "success");
    expect(shouldRunCatchup(db, "monthlySignalQualityAuditJob", 0, 0, nowUtc, false, undefined, undefined, "month")).toBe(false);
  });

  it("B3: success row only in the PREVIOUS month → true (new target, catch up)", () => {
    insertRun(db, "monthlySignalQualityAuditJob", "2026-07-01 00:00:00", "success");
    expect(shouldRunCatchup(db, "monthlySignalQualityAuditJob", 0, 0, nowUtc, false, undefined, undefined, "month")).toBe(true);
  });

  it("B4: ERROR row this month → true (success-only dedup — an error is a miss to retry)", () => {
    insertRun(db, "monthlySignalQualityAuditJob", "2026-08-01 00:00:00", "error");
    expect(shouldRunCatchup(db, "monthlySignalQualityAuditJob", 0, 0, nowUtc, false, undefined, undefined, "month")).toBe(true);
  });

  it("B5: DB error → false (fail-safe — never fire at boot when dedup cannot be verified)", () => {
    db.exec("DROP TABLE cron_job_runs");
    expect(shouldRunCatchup(db, "monthlySignalQualityAuditJob", 0, 0, nowUtc, false, undefined, undefined, "month")).toBe(false);
  });

  it("B6: default cadence ('day') behaviour unchanged — any row today blocks (regression)", () => {
    // day-cadence dedup bound is real date('now') (existing contract), so the
    // blocking row must be stamped at real today, not the pinned nowUtc date.
    insertRun(db, "morningBriefingJob", new Date().toISOString().replace("T", " ").slice(0, 19), "success");
    expect(shouldRunCatchup(db, "morningBriefingJob", 1, 0, nowUtc)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group C — runMonthlySignalQualityJob T4 guard (L2, monthlySignalQualityJob.ts)
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-MONTHLYSIGNALQUALITYAUDITJOB — runMonthlySignalQualityJob T4 dedup guard", () => {
  let db: Database;
  beforeEach(() => {
    db = new Database(":memory:");
    createJobTables(db);
  });

  function makeSendCapture(): { fn: (text: string) => Promise<boolean>; calls: string[] } {
    const calls: string[] = [];
    return {
      fn: async (text: string) => {
        calls.push(text);
        return true;
      },
      calls,
    };
  }

  it("C1: success row for this job started this month → sendFn NOT called (no duplicate Telegram report)", async () => {
    insertRun(db, "monthlySignalQualityAuditJob", `${currentMonthStart()} 00:00:00`, "success");
    const send = makeSendCapture();
    await runMonthlySignalQualityJob(db, send.fn);
    expect(send.calls.length).toBe(0);
  });

  it("C2: no row → sendFn called exactly once (normal fire)", async () => {
    const send = makeSendCapture();
    await runMonthlySignalQualityJob(db, send.fn);
    expect(send.calls.length).toBe(1);
  });

  it("C3: error row this month → sendFn called (error = miss → retry)", async () => {
    insertRun(db, "monthlySignalQualityAuditJob", `${currentMonthStart()} 00:00:00`, "error");
    const send = makeSendCapture();
    await runMonthlySignalQualityJob(db, send.fn);
    expect(send.calls.length).toBe(1);
  });

  it("C4: success row only in the PREVIOUS month → sendFn called (new target)", async () => {
    insertRun(db, "monthlySignalQualityAuditJob", `${previousMonthStart()} 00:00:00`, "success");
    const send = makeSendCapture();
    await runMonthlySignalQualityJob(db, send.fn);
    expect(send.calls.length).toBe(1);
  });

  it("C5: cron_job_runs table missing → sendFn called (fail-open — partial-schema tests proceed)", async () => {
    db.exec("DROP TABLE cron_job_runs");
    const send = makeSendCapture();
    await runMonthlySignalQualityJob(db, send.fn);
    expect(send.calls.length).toBe(1);
  });
});
