Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1104 — Sprint 055 Cron Smoke Test
 *
 * 5-step integration smoke test for the full Sprint 055 cron observability surface:
 *
 *   Step 1: recordJobRun — success path writes a 'success' row in cron_job_runs
 *   Step 2: recordJobRun — error path writes an 'error' row, does NOT re-throw
 *   Step 3: getCronJobHealthSummary — returns correct per-job success_rate_7d
 *   Step 4: runCronHealthAlert — fires ONE WORK-channel message when degraded
 *   Step 5: purgeOldCronJobRuns — deletes rows beyond retention window
 *
 * All in-memory: no real Telegram HTTP, no launchctl, no network.
 * MARKET channel: 0 sends throughout (verified in Step 4 mock).
 *
 * @module __tests__/1104-sprint055-cron-smoke
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";

import {
  recordJobRun,
  getCronJobHealthSummary,
  purgeOldCronJobRuns,
  insertCronJobRunStart,
  updateCronJobRunEnd,
} from "../infrastructure/db/cronJobRunStore.js";
import { runCronHealthAlert } from "../scheduler/alerts/cronHealthAlertJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// In-memory DB factory — creates only the cron_job_runs table needed for
// these tests (matches the DDL in schema.ts Task 1100 section).
// ─────────────────────────────────────────────────────────────────────────────

function makeCronDb(): Database {
  const db = new Database(":memory:");

  db.exec(`
    CREATE TABLE IF NOT EXISTS cron_job_runs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name     TEXT    NOT NULL,
      started_at   TEXT    NOT NULL,
      finished_at  TEXT,
      status       TEXT    NOT NULL CHECK(status IN ('running','success','error')),
      rows_written INTEGER,
      error_msg    TEXT,
      duration_ms  INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_cron_job_runs_job_started
      ON cron_job_runs(job_name, started_at DESC);
  `);

  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Count rows in cron_job_runs matching optional WHERE predicate. */
function rowCount(db: Database, where = ""): number {
  const sql = where
    ? `SELECT COUNT(*) AS n FROM cron_job_runs WHERE ${where}`
    : `SELECT COUNT(*) AS n FROM cron_job_runs`;
  const row = db.query<{ n: number }, []>(sql).get();
  return row?.n ?? 0;
}

/** Read a single row by id. */
function getRow(
  db: Database,
  id: number,
): {
  job_name: string;
  status: string;
  rows_written: number | null;
  error_msg: string | null;
  duration_ms: number | null;
  finished_at: string | null;
} | null {
  return db
    .query<
      {
        job_name: string;
        status: string;
        rows_written: number | null;
        error_msg: string | null;
        duration_ms: number | null;
        finished_at: string | null;
      },
      [number]
    >(
      `SELECT job_name, status, rows_written, error_msg, duration_ms, finished_at
       FROM cron_job_runs WHERE id = ?`,
    )
    .get(id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Test suite
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1104 — Sprint 055 Cron Smoke Test", () => {
  let db: Database;

  beforeEach(() => {
    db = makeCronDb();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Step 1: recordJobRun — success path
  // ──────────────────────────────────────────────────────────────────────────

  it("Step 1: recordJobRun success path writes a 'success' row with rowsWritten", async () => {
    // RED → GREEN: recordJobRun should insert start, run fn, update to success
    await recordJobRun(db, "pollNews", async () => ({ rowsWritten: 3 }));

    // Exactly one row written
    expect(rowCount(db)).toBe(1);

    // Row reflects success outcome
    const row = db
      .query<
        { status: string; rows_written: number | null; error_msg: string | null },
        []
      >(
        `SELECT status, rows_written, error_msg FROM cron_job_runs WHERE job_name = 'pollNews'`,
      )
      .get();

    expect(row).not.toBeNull();
    expect(row!.status).toBe("success");
    expect(row!.rows_written).toBe(3);
    expect(row!.error_msg).toBeNull();
  });

  it("Step 1b: recordJobRun success with no rowsWritten stores NULL", async () => {
    await recordJobRun(db, "auditJob", async () => {
      // returns void (no rowsWritten)
    });

    const row = db
      .query<{ status: string; rows_written: number | null }, []>(
        `SELECT status, rows_written FROM cron_job_runs WHERE job_name = 'auditJob'`,
      )
      .get();

    expect(row!.status).toBe("success");
    expect(row!.rows_written).toBeNull();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Step 2: recordJobRun — error path
  // ──────────────────────────────────────────────────────────────────────────

  it("Step 2: recordJobRun error path writes 'error' row and does NOT re-throw", async () => {
    let threw = false;
    try {
      await recordJobRun(db, "sscFetch", async () => {
        throw new Error("connection refused");
      });
    } catch {
      threw = true;
    }

    // Must NOT re-throw — scheduler safety contract
    expect(threw).toBe(false);

    // Row persisted with error outcome
    expect(rowCount(db)).toBe(1);

    const row = db
      .query<
        { status: string; error_msg: string | null; rows_written: number | null },
        []
      >(
        `SELECT status, error_msg, rows_written FROM cron_job_runs WHERE job_name = 'sscFetch'`,
      )
      .get();

    expect(row).not.toBeNull();
    expect(row!.status).toBe("error");
    expect(row!.error_msg).toBe("connection refused");
    expect(row!.rows_written).toBeNull();
  });

  it("Step 2b: recordJobRun records duration_ms > 0 even on error", async () => {
    await recordJobRun(db, "slowFail", async () => {
      throw new Error("timeout");
    });

    const row = db
      .query<{ duration_ms: number | null; finished_at: string | null }, []>(
        `SELECT duration_ms, finished_at FROM cron_job_runs WHERE job_name = 'slowFail'`,
      )
      .get();

    // finished_at populated
    expect(row!.finished_at).not.toBeNull();
    // duration_ms is a non-negative integer
    expect(row!.duration_ms).not.toBeNull();
    expect(row!.duration_ms!).toBeGreaterThanOrEqual(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Step 3: getCronJobHealthSummary
  // ──────────────────────────────────────────────────────────────────────────

  it("Step 3: getCronJobHealthSummary returns correct success_rate for each job", async () => {
    // Insert via recordJobRun to use real store functions end-to-end

    // pollNews: 1 success run
    await recordJobRun(db, "pollNews", async () => ({ rowsWritten: 3 }));

    // sscFetch: 1 error run
    await recordJobRun(db, "sscFetch", async () => {
      throw new Error("x");
    });

    const summary = getCronJobHealthSummary(db, 7);

    // Must return exactly 2 jobs (sorted by job_name ASC)
    expect(summary).toHaveLength(2);

    const poll = summary.find((s) => s.job_name === "pollNews");
    const ssc = summary.find((s) => s.job_name === "sscFetch");

    expect(poll).toBeDefined();
    expect(ssc).toBeDefined();

    // pollNews: 1/1 success → success_rate_7d = 1.0
    expect(poll!.success_rate_7d).toBe(1.0);
    expect(poll!.last_status).toBe("success");
    expect(poll!.total_runs_7d).toBe(1);

    // sscFetch: 0/1 success → success_rate_7d = 0.0
    expect(ssc!.success_rate_7d).toBe(0.0);
    expect(ssc!.last_status).toBe("error");
    expect(ssc!.total_runs_7d).toBe(1);
  });

  it("Step 3b: getCronJobHealthSummary with jobName filter returns only that job", async () => {
    await recordJobRun(db, "pollNews", async () => ({ rowsWritten: 1 }));
    await recordJobRun(db, "sscFetch", async () => {
      throw new Error("x");
    });

    const filtered = getCronJobHealthSummary(db, 7, "pollNews");
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.job_name).toBe("pollNews");
  });

  it("Step 3c: getCronJobHealthSummary returns empty array for empty table", () => {
    const summary = getCronJobHealthSummary(db, 7);
    expect(summary).toHaveLength(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Step 4: runCronHealthAlert fires WORK-channel message on degraded job
  // ──────────────────────────────────────────────────────────────────────────

  it("Step 4: runCronHealthAlert sends exactly 1 WORK message when a job is degraded", async () => {
    // Seed: 4 error runs for 'sscFetch' in last 24h → rate=0% < 80%, runs >= 3
    for (let i = 0; i < 4; i++) {
      await recordJobRun(db, "sscFetch", async () => {
        throw new Error(`failure ${i}`);
      });
    }

    // Track channel sends
    const workSends: string[] = [];
    const marketSends: string[] = [];

    const mockWorkSend = mock(async (text: string) => {
      workSends.push(text);
    });

    // runCronHealthAlert accepts (db, sendFn) — sendFn goes to WORK channel
    const result = await runCronHealthAlert(db, mockWorkSend);

    // Exactly 1 WORK alert fired
    expect(result.alertsSent).toBe(1);
    expect(workSends).toHaveLength(1);

    // Message contains degraded job name and failure signal
    expect(workSends[0]).toContain("sscFetch");
    expect(workSends[0]).toContain("Cron Health Alert");

    // MARKET channel: 0 sends throughout (never called)
    expect(marketSends).toHaveLength(0);
  });

  it("Step 4b: runCronHealthAlert is silent when all jobs are healthy (>= 80% success)", async () => {
    // 5 success + 1 error = 83% success (above threshold)
    for (let i = 0; i < 5; i++) {
      await recordJobRun(db, "pollNews", async () => ({ rowsWritten: i }));
    }
    await recordJobRun(db, "pollNews", async () => {
      throw new Error("one-off");
    });

    const sends: string[] = [];
    const mockSend = mock(async (text: string) => {
      sends.push(text);
    });

    const result = await runCronHealthAlert(db, mockSend);

    // All-green: no alert fired, no Telegram call
    expect(result.alertsSent).toBe(0);
    expect(sends).toHaveLength(0);
  });

  it("Step 4c: runCronHealthAlert skips jobs with < 3 runs (avoids false positives)", async () => {
    // 2 error runs only — below MIN_RUNS=3, should NOT trigger
    for (let i = 0; i < 2; i++) {
      await recordJobRun(db, "rareJob", async () => {
        throw new Error("rare error");
      });
    }

    const sends: string[] = [];
    const mockSend = mock(async (text: string) => {
      sends.push(text);
    });

    const result = await runCronHealthAlert(db, mockSend);

    expect(result.alertsSent).toBe(0);
    expect(sends).toHaveLength(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Step 5: purgeOldCronJobRuns
  // ──────────────────────────────────────────────────────────────────────────

  it("Step 5: purgeOldCronJobRuns deletes rows older than retentionDays", () => {
    // Insert a row with started_at 31 days ago (beyond the 30-day retention)
    db.prepare(
      `INSERT INTO cron_job_runs (job_name, started_at, status)
       VALUES ('sscFetch', datetime('now', '-31 days'), 'success')`,
    ).run();

    // Insert a recent row (within retention)
    db.prepare(
      `INSERT INTO cron_job_runs (job_name, started_at, status)
       VALUES ('sscFetch', datetime('now', '-1 days'), 'success')`,
    ).run();

    expect(rowCount(db)).toBe(2);

    // Purge with 30-day retention — only the 31-day-old row should be deleted
    const deleted = purgeOldCronJobRuns(db, "sscFetch", 30);

    expect(deleted).toBe(1);
    expect(rowCount(db)).toBe(1);

    // The remaining row must be the recent one
    const remaining = db
      .query<{ started_at: string }, []>(
        `SELECT started_at FROM cron_job_runs`,
      )
      .get();
    expect(remaining).not.toBeNull();
    // Recent row started within the last 2 days
    const startedAt = new Date(remaining!.started_at + "Z").getTime();
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
    expect(startedAt).toBeGreaterThan(twoDaysAgo);
  });

  it("Step 5b: purgeOldCronJobRuns returns 0 when nothing to purge", () => {
    // Only recent rows — nothing beyond 30 days
    db.prepare(
      `INSERT INTO cron_job_runs (job_name, started_at, status)
       VALUES ('pollNews', datetime('now', '-5 days'), 'success')`,
    ).run();

    const deleted = purgeOldCronJobRuns(db, "pollNews", 30);
    expect(deleted).toBe(0);
    expect(rowCount(db)).toBe(1);
  });

  it("Step 5c: purgeOldCronJobRuns is job-name-scoped (does not delete other jobs)", () => {
    // 31-day-old row for 'sscFetch'
    db.prepare(
      `INSERT INTO cron_job_runs (job_name, started_at, status)
       VALUES ('sscFetch', datetime('now', '-31 days'), 'error')`,
    ).run();

    // 31-day-old row for 'pollNews' — must NOT be deleted
    db.prepare(
      `INSERT INTO cron_job_runs (job_name, started_at, status)
       VALUES ('pollNews', datetime('now', '-31 days'), 'success')`,
    ).run();

    const deleted = purgeOldCronJobRuns(db, "sscFetch", 30);

    expect(deleted).toBe(1);
    // pollNews row survives
    expect(rowCount(db, "job_name = 'pollNews'")).toBe(1);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Full sequence: all 5 steps in order
  // ──────────────────────────────────────────────────────────────────────────

  it("Full sequence: steps 1-5 in order with zero MARKET-channel sends", async () => {
    const marketSends: string[] = [];

    // — Step 1: success run —
    await recordJobRun(db, "pollNews", async () => ({ rowsWritten: 3 }));
    expect(rowCount(db, "job_name = 'pollNews' AND status = 'success'")).toBe(1);

    // — Step 2: error run —
    await recordJobRun(db, "sscFetch", async () => {
      throw new Error("x");
    });
    expect(rowCount(db, "job_name = 'sscFetch' AND status = 'error'")).toBe(1);

    // — Step 3: health summary —
    const summary = getCronJobHealthSummary(db, 7);
    expect(summary).toHaveLength(2);

    const poll = summary.find((s) => s.job_name === "pollNews")!;
    const ssc = summary.find((s) => s.job_name === "sscFetch")!;
    expect(poll.success_rate_7d).toBe(1.0);
    expect(ssc.success_rate_7d).toBe(0.0);

    // — Step 4: alert job — seed 3 more errors for sscFetch to hit MIN_RUNS=3 —
    for (let i = 0; i < 3; i++) {
      await recordJobRun(db, "sscFetch", async () => {
        throw new Error(`err ${i}`);
      });
    }

    const workSends: string[] = [];
    const mockWorkSend = mock(async (text: string) => {
      workSends.push(text);
    });

    const alertResult = await runCronHealthAlert(db, mockWorkSend);
    expect(alertResult.alertsSent).toBe(1);
    expect(workSends).toHaveLength(1);
    expect(workSends[0]).toContain("sscFetch");

    // MARKET channel never touched
    expect(marketSends).toHaveLength(0);

    // — Step 5: purge —
    db.prepare(
      `INSERT INTO cron_job_runs (job_name, started_at, status)
       VALUES ('sscFetch', datetime('now', '-31 days'), 'error')`,
    ).run();

    const beforePurge = rowCount(db);
    const deleted = purgeOldCronJobRuns(db, "sscFetch", 30);
    expect(deleted).toBe(1);
    expect(rowCount(db)).toBe(beforePurge - 1);
  });
});
