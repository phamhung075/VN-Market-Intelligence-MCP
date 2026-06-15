/**
 * FIX-MCP-CRASH-LOOP A-1 — Restart-cadence alert guardrail
 * FIX-MCP-RESTART-ALERT-DEPLOY-DISCRIMINATE — Deploy vs crash discrimination
 *
 * Unit tests for runRestartCadenceAlertJob().
 * All tests use an in-memory SQLite database with the minimal
 * cron_job_runs schema so the job can execute without infrastructure.
 *
 * Deploy vs crash discrimination (added FIX-MCP-RESTART-ALERT-DEPLOY-DISCRIMINATE):
 *   A startup is classified as a CRASH restart when NO mcpServerCleanShutdown
 *   row exists between the preceding startup and the current one.
 *   A startup preceded by a clean-shutdown sentinel is classified as a DEPLOY
 *   and does NOT count toward the alert threshold.
 *
 * Bootstrap guard (added FIX-MCP-RESTART-ALERT-DEPLOY-DISCRIMINATE migration):
 *   When zero mcpServerCleanShutdown rows exist anywhere in the DB, the
 *   discriminator is not yet bootstrapped — absence-of-sentinel cannot be read
 *   as crash evidence for pre-fix history.  Return silent immediately.
 *   When evaluating a (prev, current) gap, skip if prev < firstCleanShutdown
 *   (the writer may not have existed then).
 *
 * Test matrix:
 *
 *   Bootstrap guard (new — the defect case this task fixes):
 *   9. 3 startups in window, ZERO clean-shutdown rows anywhere → NO alert
 *      (exact 2026-06-15 rollout pattern: 05:35 / 08:02 / 08:42 pre-fix history)
 *  10. In-window startups exist, firstCleanShutdown > all predecessors
 *      (every predecessor pre-dates the writer) → NO alert
 *
 *   Original (count-only, now crash-discriminated — require bootstrap sentinel):
 *   1. count=1 in window  → no alert (< threshold)
 *   2. count=2, both crashes → alert fires ("2 times")
 *   3. count=3, all crashes  → alert fires ("3 times")
 *   4. count=5, all >4h old  → no alert (outside window)
 *
 *   Deploy discrimination (new):
 *   5. 3 startups in window, all preceded by clean-shutdown → NO alert
 *      (all 3 are deploys)
 *   6. 3 startups in window, 1 crash + 2 deploys → NO alert (only 1 crash < threshold)
 *   7. 3 startups in window, 2 crashes + 1 deploy → alert fires ("2 times")
 *   8. First startup in window has no predecessor → conservative: not counted as crash
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  runRestartCadenceAlertJob,
  STARTUP_JOB_NAME,
  CLEAN_SHUTDOWN_JOB_NAME,
} from "../scheduler/system/restartCadenceAlertJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Create a minimal in-memory SQLite with the cron_job_runs schema. */
function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS cron_job_runs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name    TEXT    NOT NULL,
      started_at  TEXT    NOT NULL,
      finished_at TEXT,
      status      TEXT    NOT NULL DEFAULT 'running',
      rows_written INTEGER,
      error_msg   TEXT,
      duration_ms INTEGER
    )
  `);
  return db;
}

/**
 * Insert a startup sentinel row.
 *
 * @param db         - in-memory db
 * @param startedAt  - ISO datetime string (SQLite format: "YYYY-MM-DD HH:MM:SS")
 */
function insertStartup(db: Database, startedAt: string): void {
  db.prepare(
    `INSERT INTO cron_job_runs (job_name, started_at, status)
     VALUES (?, ?, 'success')`,
  ).run(STARTUP_JOB_NAME, startedAt);
}

/**
 * Insert a clean-shutdown sentinel row (written by SIGTERM handler).
 *
 * @param db         - in-memory db
 * @param startedAt  - ISO datetime string (SQLite format: "YYYY-MM-DD HH:MM:SS")
 */
function insertCleanShutdown(db: Database, startedAt: string): void {
  db.prepare(
    `INSERT INTO cron_job_runs (job_name, started_at, status)
     VALUES (?, ?, 'success')`,
  ).run(CLEAN_SHUTDOWN_JOB_NAME, startedAt);
}

/**
 * Return an ISO datetime string offset from now by `offsetHours`.
 * Negative offset = in the past.
 */
function nowMinus(offsetHours: number): string {
  const ms = Date.now() - offsetHours * 60 * 60 * 1000;
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("runRestartCadenceAlertJob", () => {
  let db: Database;
  let sendCalls: string[];
  let sendFn: (text: string) => Promise<boolean>;

  beforeEach(() => {
    db = makeDb();
    sendCalls = [];
    sendFn = async (text: string) => {
      sendCalls.push(text);
      return true;
    };
  });

  // ── Bootstrap guard tests (migration boundary — the defect this task fixes) ─

  it("does NOT alert on rollout when all in-window startups predate the first clean-shutdown sentinel (bootstrap null)", async () => {
    // This is the EXACT 2026-06-15 rollout pattern:
    // 3 startups written by pre-fix containers that had no clean-shutdown handler.
    // Zero mcpServerCleanShutdown rows exist anywhere in the DB.
    // The bootstrap guard must return silent immediately — absence-of-sentinel
    // is not crash evidence when the writer has never existed.
    insertStartup(db, "2026-06-15 05:35:43");  // pre-fix startup #1
    insertStartup(db, "2026-06-15 08:02:47");  // pre-fix startup #2
    insertStartup(db, "2026-06-15 08:42:54");  // pre-fix startup #3 (newest = "now")
    // NO mcpServerCleanShutdown rows anywhere

    const result = await runRestartCadenceAlertJob(db, sendFn);

    expect(sendCalls).toHaveLength(0);
    expect(result.alertSent).toBe(false);
    expect(result.restartCount).toBe(0);
  });

  it("does NOT alert when clean-shutdown rows exist but every in-window predecessor pre-dates firstCleanShutdown", async () => {
    // Bootstrap has happened (firstCleanShutdown is NOT null), but all
    // in-window (prev, current) gaps have a prev that is older than
    // firstCleanShutdown.  The writer did not exist during those gaps →
    // absence-of-sentinel is not crash evidence → skip → no alert.
    //
    // Timeline (relative to now):
    //   -7h: startup A (predecessor for B — pre-dates firstCleanShutdown at -5h)
    //   -5h: FIRST clean-shutdown ever (bootstraps the discriminator)
    //   -3h: startup B (in window; predecessor A is at -7h < firstCleanShutdown at -5h → skip)
    //   -2h: startup C (in window; predecessor B is at -3h < firstCleanShutdown at -5h? NO: -3h > -5h)
    // Wait — B's predecessor is A (-7h) which IS < firstCS (-5h) → B is skipped.
    // C's predecessor is B (-3h) which IS > firstCS (-5h) AND no clean-shutdown
    // between B(-3h) and C(-2h) → C IS a crash. We want only the skipped case.
    //
    // Revised: seed 2 startups where BOTH predecessors are before firstCS.
    //   -8h: startup A
    //   -6h: startup B  ← predecessor A is at -8h < firstCS(-5h) → skip
    //   -5h: FIRST clean-shutdown (firstCS anchor)
    //   -3h: startup C  ← predecessor B is at -6h < firstCS(-5h) → skip
    //   C is the only in-window startup (window = last 4h, so -4h cutoff).
    //   predecessor B at -6h < firstCS at -5h → skip → restartCount = 0.
    insertStartup(db, nowMinus(8));           // startup A (deep history)
    insertStartup(db, nowMinus(6));           // startup B (predecessor for C)
    insertCleanShutdown(db, nowMinus(5));     // FIRST ever clean-shutdown (bootstrap anchor)
    insertStartup(db, nowMinus(3));           // startup C (in window; prev=B at -6h < firstCS at -5h → skip)

    const result = await runRestartCadenceAlertJob(db, sendFn);

    expect(sendCalls).toHaveLength(0);
    expect(result.alertSent).toBe(false);
    expect(result.restartCount).toBe(0);
  });

  // ── Original threshold tests (steady-state, after bootstrap) ─────────────
  // These tests seed an early clean-shutdown anchor to pass the bootstrap guard,
  // ensuring crash classification is active for the in-window startups.

  it("does NOT send alert when only 1 crash startup row exists in the 4h window", async () => {
    // Bootstrap anchor: firstCleanShutdown at -6h (before all startups below).
    insertCleanShutdown(db, nowMinus(6));  // firstCleanShutdown anchor
    // Predecessor outside window (gives context).
    insertStartup(db, nowMinus(5));        // predecessor; prev >= firstCS(-6h) ✓
    // One crash restart 1h ago (inside window) — no clean shutdown between -5h and -1h.
    insertStartup(db, nowMinus(1));        // crash restart (in window)

    const result = await runRestartCadenceAlertJob(db, sendFn);

    expect(sendCalls).toHaveLength(0);
    expect(result.alertSent).toBe(false);
    expect(result.restartCount).toBe(1);
  });

  it("sends alert when 2 crash startup rows exist in the 4h window (alert contains '2 times')", async () => {
    // Bootstrap anchor: firstCleanShutdown at -6h (before all startups below).
    insertCleanShutdown(db, nowMinus(6));  // firstCleanShutdown anchor
    // predecessor at -5h >= firstCS(-6h) → crash classification active.
    insertStartup(db, nowMinus(5));   // predecessor (outside window)
    insertStartup(db, nowMinus(2));   // crash restart #1 (in window, no clean shutdown before it)
    insertStartup(db, nowMinus(1));   // crash restart #2 (in window, no clean shutdown before it)
    // No mcpServerCleanShutdown rows between the startups → both are crash restarts.

    const result = await runRestartCadenceAlertJob(db, sendFn);

    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0]).toContain("2 times");
    expect(result.alertSent).toBe(true);
    expect(result.restartCount).toBe(2);
  });

  it("sends alert when 3 crash startup rows exist in the 4h window (alert contains '3 times')", async () => {
    // Bootstrap anchor: firstCleanShutdown at -6h (before all startups below).
    insertCleanShutdown(db, nowMinus(6));  // firstCleanShutdown anchor
    // Three crash restarts — no clean-shutdown sentinels between any of them.
    insertStartup(db, nowMinus(5));   // predecessor (outside window); >= firstCS(-6h) ✓
    insertStartup(db, nowMinus(2.5)); // crash #1 (in window)
    insertStartup(db, nowMinus(1.5)); // crash #2 (in window)
    insertStartup(db, nowMinus(0.5)); // crash #3 (in window)

    const result = await runRestartCadenceAlertJob(db, sendFn);

    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0]).toContain("3 times");
    expect(result.alertSent).toBe(true);
    expect(result.restartCount).toBe(3);
  });

  it("does NOT send alert when all startup rows are older than 4h (outside window)", async () => {
    // Five startups all older than 4h (outside the sliding window).
    // Bootstrap anchor present but irrelevant — no in-window rows to evaluate.
    insertCleanShutdown(db, nowMinus(10)); // bootstrap anchor
    insertStartup(db, nowMinus(9));
    insertStartup(db, nowMinus(6));
    insertStartup(db, nowMinus(7));
    insertStartup(db, nowMinus(8));
    insertStartup(db, nowMinus(5));

    const result = await runRestartCadenceAlertJob(db, sendFn);

    expect(sendCalls).toHaveLength(0);
    expect(result.alertSent).toBe(false);
    expect(result.restartCount).toBe(0);
  });

  // ── Deploy discrimination tests (FIX-MCP-RESTART-ALERT-DEPLOY-DISCRIMINATE) ─

  it("does NOT alert when 3 startups in window are all preceded by clean-shutdown (all deploys)", async () => {
    // 3 intentional force-recreate deploys, each preceded by SIGTERM → clean shutdown.
    // Reproduce: predecessor → clean-shutdown → deploy restart, repeated 3 times.
    // Bootstrap is naturally satisfied because clean-shutdown rows exist.
    insertStartup(db, nowMinus(9));        // boot before the deploy chain
    insertCleanShutdown(db, nowMinus(6));  // SIGTERM before deploy #1 (also firstCS anchor)
    insertStartup(db, nowMinus(5.5));      // deploy restart #1 (in window? no, >4h)
    insertCleanShutdown(db, nowMinus(5));  // SIGTERM before deploy #2
    insertStartup(db, nowMinus(3.5));      // deploy restart #2 (in window, clean → deploy)
    insertCleanShutdown(db, nowMinus(3));  // SIGTERM before deploy #3
    insertStartup(db, nowMinus(2));        // deploy restart #3 (in window, clean → deploy)
    insertCleanShutdown(db, nowMinus(1.5));// SIGTERM before deploy #4
    insertStartup(db, nowMinus(1));        // deploy restart #4 (in window, clean → deploy)

    const result = await runRestartCadenceAlertJob(db, sendFn);

    expect(sendCalls).toHaveLength(0);
    expect(result.alertSent).toBe(false);
    expect(result.restartCount).toBe(0);
  });

  it("does NOT alert when 1 crash + 2 deploys exist in window (crash count 1 < threshold)", async () => {
    // One crash restart and two deploy restarts in the window.
    // Alert threshold is 2 crash-restarts → no alert with only 1 crash.
    // Bootstrap anchor: the first clean-shutdown at -2.5h.
    // predecessor at -5h < firstCS(-2.5h) → skip for the crash at -3h.
    // Wait: the crash at -3h has predecessor at -5h. If firstCS is -2.5h,
    // then -5h < -2.5h → the crash gap is skipped.
    // We need firstCS BEFORE the crash predecessor to count it as a crash.
    // Fix: seed firstCS at -6h so predecessor(-5h) >= firstCS(-6h) → crash active.
    insertCleanShutdown(db, nowMinus(6));   // firstCS anchor — before all startups
    insertStartup(db, nowMinus(5));         // old boot (predecessor for crash); >= firstCS ✓
    // No clean shutdown before 3h restart → crash
    insertStartup(db, nowMinus(3));         // crash restart #1 (in window)
    insertCleanShutdown(db, nowMinus(2.5)); // SIGTERM → clean shutdown
    insertStartup(db, nowMinus(2));         // deploy restart #1 (in window, preceded by clean)
    insertCleanShutdown(db, nowMinus(1.5)); // SIGTERM → clean shutdown
    insertStartup(db, nowMinus(1));         // deploy restart #2 (in window, preceded by clean)

    const result = await runRestartCadenceAlertJob(db, sendFn);

    expect(sendCalls).toHaveLength(0);
    expect(result.alertSent).toBe(false);
    expect(result.restartCount).toBe(1);
  });

  it("sends alert when 2 crashes + 1 deploy exist in window (crash count 2 >= threshold)", async () => {
    // Two crash restarts and one deploy restart in the window.
    // Alert threshold is 2 → alert fires for the 2 crashes; deploy ignored.
    // Bootstrap anchor at -6h so predecessor(-5h) >= firstCS(-6h) → crash active.
    insertCleanShutdown(db, nowMinus(6));   // firstCS anchor
    insertStartup(db, nowMinus(5));         // old boot (predecessor for crash); >= firstCS ✓
    // No clean shutdown before 3.5h restart → crash
    insertStartup(db, nowMinus(3.5));       // crash restart #1 (in window)
    // No clean shutdown before 2.5h restart → crash
    insertStartup(db, nowMinus(2.5));       // crash restart #2 (in window)
    insertCleanShutdown(db, nowMinus(2));   // SIGTERM → clean shutdown
    insertStartup(db, nowMinus(1));         // deploy restart (in window, preceded by clean)

    const result = await runRestartCadenceAlertJob(db, sendFn);

    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0]).toContain("2 times");
    expect(result.alertSent).toBe(true);
    expect(result.restartCount).toBe(2);
  });

  it("does NOT count first in-window startup as crash when it has no predecessor in history", async () => {
    // No predecessor at all — only one startup row exists in the DB (fresh install).
    // Conservative: cannot infer crash without a predecessor → not counted.
    // Bootstrap guard returns early here anyway (no clean-shutdown rows).
    insertStartup(db, nowMinus(1));

    const result = await runRestartCadenceAlertJob(db, sendFn);

    expect(sendCalls).toHaveLength(0);
    expect(result.alertSent).toBe(false);
    expect(result.restartCount).toBe(0);
  });
});
