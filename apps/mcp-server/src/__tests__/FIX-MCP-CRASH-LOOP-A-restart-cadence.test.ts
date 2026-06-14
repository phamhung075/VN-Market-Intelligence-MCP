/**
 * FIX-MCP-CRASH-LOOP A-1 — Restart-cadence alert guardrail
 *
 * Unit tests for runRestartCadenceAlertJob().
 * All 4 tests use an in-memory SQLite database with the minimal
 * cron_job_runs schema so the job can execute without infrastructure.
 *
 * Test matrix:
 *   1. count=1 in window  → no alert
 *   2. count=2 in window  → alert fires ("2 times")
 *   3. count=3 in window  → alert fires ("3 times")
 *   4. count=5 but all >4h old → no alert (all outside window)
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  runRestartCadenceAlertJob,
  STARTUP_JOB_NAME,
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

  it("does NOT send alert when only 1 startup row exists in the 4h window", async () => {
    // One startup 1h ago (inside window).
    insertStartup(db, nowMinus(1));

    const result = await runRestartCadenceAlertJob(db, sendFn);

    expect(sendCalls).toHaveLength(0);
    expect(result.alertSent).toBe(false);
    expect(result.restartCount).toBe(1);
  });

  it("sends alert when 2 startup rows exist in the 4h window (alert contains '2 times')", async () => {
    // Two startups 1h and 2h ago (both inside window).
    insertStartup(db, nowMinus(1));
    insertStartup(db, nowMinus(2));

    const result = await runRestartCadenceAlertJob(db, sendFn);

    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0]).toContain("2 times");
    expect(result.alertSent).toBe(true);
    expect(result.restartCount).toBe(2);
  });

  it("sends alert when 3 startup rows exist in the 4h window (alert contains '3 times')", async () => {
    // Three startups 0.5h, 1.5h, and 2.5h ago (all inside window).
    insertStartup(db, nowMinus(0.5));
    insertStartup(db, nowMinus(1.5));
    insertStartup(db, nowMinus(2.5));

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
});
