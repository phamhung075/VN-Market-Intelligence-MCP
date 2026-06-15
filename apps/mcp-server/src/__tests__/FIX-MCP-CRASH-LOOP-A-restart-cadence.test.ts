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
 * Test matrix:
 *
 *   Original (count-only, now crash-discriminated):
 *   1. count=1 in window  → no alert (< threshold)
 *   2. count=2, both crashes → alert fires ("2 times")
 *   3. count=3, all crashes  → alert fires ("3 times")
 *   4. count=5, all >4h old  → no alert (outside window)
 *
 *   Deploy discrimination (new):
 *   5. 3 startups in window, all preceded by clean-shutdown → NO alert
 *      (all 3 are deploys — this is the exact false-positive pattern from
 *       2026-06-15 deploys at 05:35, 08:02, 08:42 that paged healthy server)
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

  // ── Original threshold tests (now crash-discriminated) ────────────────────

  it("does NOT send alert when only 1 crash startup row exists in the 4h window", async () => {
    // Predecessor outside window (gives context) → crash (no clean shutdown between them)
    insertStartup(db, nowMinus(5));
    // One crash restart 1h ago (inside window) — no clean shutdown before it
    insertStartup(db, nowMinus(1));

    const result = await runRestartCadenceAlertJob(db, sendFn);

    expect(sendCalls).toHaveLength(0);
    expect(result.alertSent).toBe(false);
    expect(result.restartCount).toBe(1);
  });

  it("sends alert when 2 crash startup rows exist in the 4h window (alert contains '2 times')", async () => {
    // First startup: predecessor exists outside window — no clean shutdown → crash
    insertStartup(db, nowMinus(5));   // predecessor (outside window, no clean shutdown before it)
    insertStartup(db, nowMinus(2));   // crash restart #1 (in window)
    insertStartup(db, nowMinus(1));   // crash restart #2 (in window)
    // No mcpServerCleanShutdown rows written → both are crash restarts

    const result = await runRestartCadenceAlertJob(db, sendFn);

    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0]).toContain("2 times");
    expect(result.alertSent).toBe(true);
    expect(result.restartCount).toBe(2);
  });

  it("sends alert when 3 crash startup rows exist in the 4h window (alert contains '3 times')", async () => {
    // Three crash restarts — no clean-shutdown sentinels anywhere
    insertStartup(db, nowMinus(5));   // predecessor (outside window)
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
    insertStartup(db, nowMinus(5));
    insertStartup(db, nowMinus(6));
    insertStartup(db, nowMinus(7));
    insertStartup(db, nowMinus(8));
    insertStartup(db, nowMinus(9));

    const result = await runRestartCadenceAlertJob(db, sendFn);

    expect(sendCalls).toHaveLength(0);
    expect(result.alertSent).toBe(false);
    expect(result.restartCount).toBe(0);
  });

  // ── Deploy discrimination tests (FIX-MCP-RESTART-ALERT-DEPLOY-DISCRIMINATE) ─

  it("does NOT alert when 3 startups in window are all preceded by clean-shutdown (all deploys)", async () => {
    // This is the exact false-positive pattern from 2026-06-15:
    // 3 intentional force-recreate deploys, each preceded by SIGTERM → clean shutdown.
    // Reproduce: predecessor → clean-shutdown → deploy restart, repeated 3 times.
    insertStartup(db, nowMinus(9));        // boot before the deploy chain
    insertCleanShutdown(db, nowMinus(6));  // SIGTERM before deploy #1
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
    insertStartup(db, nowMinus(5));        // old boot (predecessor for crash)
    // No clean shutdown before 3h restart → crash
    insertStartup(db, nowMinus(3));        // crash restart #1 (in window)
    insertCleanShutdown(db, nowMinus(2.5));// SIGTERM → clean shutdown
    insertStartup(db, nowMinus(2));        // deploy restart #1 (in window, preceded by clean)
    insertCleanShutdown(db, nowMinus(1.5));// SIGTERM → clean shutdown
    insertStartup(db, nowMinus(1));        // deploy restart #2 (in window, preceded by clean)

    const result = await runRestartCadenceAlertJob(db, sendFn);

    expect(sendCalls).toHaveLength(0);
    expect(result.alertSent).toBe(false);
    expect(result.restartCount).toBe(1);
  });

  it("sends alert when 2 crashes + 1 deploy exist in window (crash count 2 >= threshold)", async () => {
    // Two crash restarts and one deploy restart in the window.
    // Alert threshold is 2 → alert fires for the 2 crashes; deploy ignored.
    insertStartup(db, nowMinus(5));        // old boot (predecessor for crash)
    // No clean shutdown before 3.5h restart → crash
    insertStartup(db, nowMinus(3.5));      // crash restart #1 (in window)
    // No clean shutdown before 2.5h restart → crash
    insertStartup(db, nowMinus(2.5));      // crash restart #2 (in window)
    insertCleanShutdown(db, nowMinus(2));  // SIGTERM → clean shutdown
    insertStartup(db, nowMinus(1));        // deploy restart (in window, preceded by clean)

    const result = await runRestartCadenceAlertJob(db, sendFn);

    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0]).toContain("2 times");
    expect(result.alertSent).toBe(true);
    expect(result.restartCount).toBe(2);
  });

  it("does NOT count first in-window startup as crash when it has no predecessor in history", async () => {
    // No predecessor at all — only one startup row exists in the DB (fresh install).
    // Conservative: cannot infer crash without a predecessor → not counted.
    insertStartup(db, nowMinus(1));

    const result = await runRestartCadenceAlertJob(db, sendFn);

    expect(sendCalls).toHaveLength(0);
    expect(result.alertSent).toBe(false);
    expect(result.restartCount).toBe(0);
  });
});
