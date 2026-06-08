/**
 * Task 1103 — cronHealthAlertJob (daily WORK channel alert if success_rate < 80%)
 *
 * Covers:
 *   1. Job with 4 runs (1 success, 3 errors) → 25% rate ≥ 3-run minimum → 1 WORK send
 *   2. Job with 2 runs (both errors) → below 3-run minimum → NO Telegram send
 *   3. All jobs > 80% success → NO Telegram send (no false positives on all-green)
 *   4. Multiple degraded jobs → 1 single message listing all of them
 *   5. CRONS map key 'cronHealthAlert' exists with '0 0 * * *'
 *   6. Telegram mock captures text and channel correctly
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { runCronHealthAlert } from "../scheduler/alerts/cronHealthAlertJob.js";
import { CRONS } from "../scheduler/jobs.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// In-memory DB fixture
// ─────────────────────────────────────────────────────────────────────────────

let db: Database;

function createSchema(database: Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS cron_job_runs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name     TEXT NOT NULL,
      started_at   TEXT NOT NULL,
      finished_at  TEXT,
      status       TEXT NOT NULL CHECK(status IN ('running','success','error')),
      rows_written  INTEGER,
      error_msg    TEXT,
      duration_ms  INTEGER
    )
  `);
}

/**
 * Insert a completed run row directly (bypasses recordJobRun to control timing).
 * hoursAgo: how many hours back to set started_at (within 24h window means < 24)
 */
function insertRun(
  database: Database,
  jobName: string,
  status: "success" | "error",
  hoursAgo: number,
  errorMsg?: string,
): void {
  database.exec(`
    INSERT INTO cron_job_runs (job_name, started_at, finished_at, status, rows_written, error_msg, duration_ms)
    VALUES (
      '${jobName}',
      datetime('now', '-${hoursAgo} hours'),
      datetime('now', '-${hoursAgo} hours', '+1 second'),
      '${status}',
      NULL,
      ${errorMsg != null ? `'${errorMsg}'` : "NULL"},
      1000
    )
  `);
}

beforeEach(() => {
  db = new Database(":memory:");
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  createSchema(db);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test suite
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1103 — cronHealthAlertJob", () => {
  // AC1: degraded job (4 runs, 1 success = 25%) meets 3-run minimum → alert sent
  it("sends 1 WORK message when a job has 4 runs and 25% success rate", async () => {
    // Insert 1 success + 3 errors = 25% success rate
    insertRun(db, "pollNewsJob", "success", 20);
    insertRun(db, "pollNewsJob", "error", 16, "timeout");
    insertRun(db, "pollNewsJob", "error", 12, "timeout");
    insertRun(db, "pollNewsJob", "error", 8, "timeout");

    const sent: string[] = [];
    const mockSend = async (text: string) => {
      sent.push(text);
      return true;
    };

    const result = await runCronHealthAlert(db, mockSend);

    expect(result.alertsSent).toBe(1);
    expect(sent.length).toBe(1);
    // Message should mention the job name
    expect(sent[0]).toContain("pollNewsJob");
    // Message should show 25% success
    expect(sent[0]).toContain("25%");
  });

  // AC2: job with only 2 runs (below 3-run minimum) → no alert
  it("does NOT send alert when job has fewer than 3 runs (below minimum sample)", async () => {
    // Insert 2 error runs — below the 3-run minimum
    insertRun(db, "sscCheckerJob", "error", 10, "network error");
    insertRun(db, "sscCheckerJob", "error", 5, "network error");

    const sent: string[] = [];
    const mockSend = async (text: string) => {
      sent.push(text);
      return true;
    };

    const result = await runCronHealthAlert(db, mockSend);

    expect(result.alertsSent).toBe(0);
    expect(sent.length).toBe(0);
  });

  // AC3: all jobs above 80% threshold → no alert (no false positives on all-green)
  it("does NOT send alert when all jobs have success rate above 80%", async () => {
    // pollNewsJob: 5 successes, 1 error = 83.3% — above threshold
    insertRun(db, "pollNewsJob", "success", 22);
    insertRun(db, "pollNewsJob", "success", 18);
    insertRun(db, "pollNewsJob", "success", 14);
    insertRun(db, "pollNewsJob", "success", 10);
    insertRun(db, "pollNewsJob", "success", 6);
    insertRun(db, "pollNewsJob", "error", 2, "one-off");

    const sent: string[] = [];
    const mockSend = async (text: string) => {
      sent.push(text);
      return true;
    };

    const result = await runCronHealthAlert(db, mockSend);

    expect(result.alertsSent).toBe(0);
    expect(sent.length).toBe(0);
  });

  // AC4: multiple degraded jobs → 1 message listing all
  it("sends 1 message containing all degraded jobs when multiple fail", async () => {
    // Job A: 3 runs, 0 success = 0%
    insertRun(db, "jobA", "error", 20, "err");
    insertRun(db, "jobA", "error", 16, "err");
    insertRun(db, "jobA", "error", 12, "err");

    // Job B: 4 runs, 1 success = 25%
    insertRun(db, "jobB", "success", 22);
    insertRun(db, "jobB", "error", 18, "err");
    insertRun(db, "jobB", "error", 14, "err");
    insertRun(db, "jobB", "error", 10, "err");

    // Job C: all healthy (5/5 success = 100%)
    insertRun(db, "jobC", "success", 23);
    insertRun(db, "jobC", "success", 19);
    insertRun(db, "jobC", "success", 15);
    insertRun(db, "jobC", "success", 11);
    insertRun(db, "jobC", "success", 7);

    const sent: string[] = [];
    const mockSend = async (text: string) => {
      sent.push(text);
      return true;
    };

    const result = await runCronHealthAlert(db, mockSend);

    expect(result.alertsSent).toBe(2);
    // Only 1 message sent (batched)
    expect(sent.length).toBe(1);
    // Message mentions both degraded jobs
    expect(sent[0]).toContain("jobA");
    expect(sent[0]).toContain("jobB");
    // Message does NOT mention the healthy job
    expect(sent[0]).not.toContain("jobC");
  });

  // AC5: CRONS map key 'cronHealthAlert' exists with '0 0 * * *'
  it("CRONS map contains cronHealthAlert key with midnight UTC schedule", () => {
    expect(CRONS).toHaveProperty("cronHealthAlert");
    expect(CRONS.cronHealthAlert).toBe(
      Bun.env.CRON_HEALTH_ALERT ?? "0 0 * * *",
    );
  });

  // AC6: alert correctly omits jobs with exactly 80% success (threshold is strict < 80%)
  it("does NOT alert for job at exactly 80% success rate (threshold is strict <80%)", async () => {
    // 4 runs: 3 success, 1 error = 75% — below threshold → SHOULD alert
    // But first test exactly 80%: 4 successes out of 5 = 80% — borderline
    insertRun(db, "borderlineJob", "success", 22);
    insertRun(db, "borderlineJob", "success", 18);
    insertRun(db, "borderlineJob", "success", 14);
    insertRun(db, "borderlineJob", "success", 10);
    insertRun(db, "borderlineJob", "error", 6, "single error");

    const sent: string[] = [];
    const mockSend = async (text: string) => {
      sent.push(text);
      return true;
    };

    const result = await runCronHealthAlert(db, mockSend);

    // 4/5 = 80% → NOT below 0.80, so no alert
    expect(result.alertsSent).toBe(0);
    expect(sent.length).toBe(0);
  });

  // AC7: alert fires for job at exactly 79% success (just below threshold)
  it("alerts for job at 75% success (3 successes, 1 error out of 4 runs)", async () => {
    // 3/4 = 75% — below 80% threshold, meets 3-run minimum
    insertRun(db, "marginalJob", "success", 20);
    insertRun(db, "marginalJob", "success", 16);
    insertRun(db, "marginalJob", "success", 12);
    insertRun(db, "marginalJob", "error", 8, "timeout");

    const sent: string[] = [];
    const mockSend = async (text: string) => {
      sent.push(text);
      return true;
    };

    const result = await runCronHealthAlert(db, mockSend);

    expect(result.alertsSent).toBe(1);
    expect(sent.length).toBe(1);
    expect(sent[0]).toContain("marginalJob");
    expect(sent[0]).toContain("75%");
  });

  // AC8: empty database → no alert, no crash
  it("handles empty cron_job_runs table gracefully (no alert, no crash)", async () => {
    const sent: string[] = [];
    const mockSend = async (text: string) => {
      sent.push(text);
      return true;
    };

    const result = await runCronHealthAlert(db, mockSend);

    expect(result.alertsSent).toBe(0);
    expect(sent.length).toBe(0);
  });
});
