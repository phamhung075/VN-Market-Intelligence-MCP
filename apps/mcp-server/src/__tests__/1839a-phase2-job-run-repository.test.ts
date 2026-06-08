/**
 * Task 1839a Phase 2 — SqliteJobRunRepository tests
 *
 * Validates the IJobRunRepository contract against a fresh in-memory SQLite
 * database. Each test creates its own Database instance so there is no
 * cross-test contamination.
 *
 * Min 6 tests per spec AC-8.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { SqliteJobRunRepository } from "../infrastructure/db/repositories/SqliteJobRunRepository.js";

// Minimal schema for cron_job_runs — mirrors the DDL in schema.ts
const CREATE_CRON_JOB_RUNS = `
  CREATE TABLE IF NOT EXISTS cron_job_runs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    job_name     TEXT    NOT NULL,
    started_at   TEXT    NOT NULL,
    finished_at  TEXT,
    status       TEXT    NOT NULL DEFAULT 'running',
    rows_written INTEGER,
    error_msg    TEXT,
    duration_ms  INTEGER
  )
`;

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(CREATE_CRON_JOB_RUNS);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Missing table — graceful degradation
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1839a — SqliteJobRunRepository: missing table", () => {
  it("getLastRuns() returns empty array when table does not exist", () => {
    const db = new Database(":memory:"); // no schema
    const repo = new SqliteJobRunRepository(db);
    expect(repo.getLastRuns("someJob", 5)).toEqual([]);
  });

  it("recordRun() does not throw when table is missing", () => {
    const db = new Database(":memory:"); // no schema
    const repo = new SqliteJobRunRepository(db);
    expect(() =>
      repo.recordRun({
        jobName: "testJob",
        runAt: new Date().toISOString(),
        durationMs: 100,
        status: "ok",
      })
    ).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. recordRun() — happy path
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1839a — SqliteJobRunRepository: recordRun()", () => {
  it("recordRun() then getLastRuns() returns the record", () => {
    const db = makeDb();
    const repo = new SqliteJobRunRepository(db);

    repo.recordRun({
      jobName: "morningBriefingJob",
      runAt: "2026-05-03T08:00:00.000Z",
      durationMs: 250,
      status: "ok",
    });

    const runs = repo.getLastRuns("morningBriefingJob", 10);
    expect(runs.length).toBeGreaterThanOrEqual(1);
    const run = runs[0]!;
    expect(run.jobName).toBe("morningBriefingJob");
    expect(run.status).toBe("ok");
  });

  it("recordRun() with status=fail records error status", () => {
    const db = makeDb();
    const repo = new SqliteJobRunRepository(db);

    repo.recordRun({
      jobName: "alertScanParallelJob",
      runAt: new Date().toISOString(),
      durationMs: 50,
      status: "fail",
      error: "Timeout after 5000ms",
    });

    const runs = repo.getLastRuns("alertScanParallelJob", 5);
    expect(runs.length).toBeGreaterThanOrEqual(1);
    expect(runs[0]!.status).toBe("fail");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. getLastRuns() — limit respected
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1839a — SqliteJobRunRepository: getLastRuns() limit", () => {
  it("getLastRuns(name, 3) returns at most 3 records when 5 exist", () => {
    const db = makeDb();
    const repo = new SqliteJobRunRepository(db);

    for (let i = 0; i < 5; i++) {
      repo.recordRun({
        jobName: "walCheckpointJob",
        runAt: new Date(Date.now() + i * 1000).toISOString(),
        durationMs: 10 + i,
        status: "ok",
      });
    }

    const runs = repo.getLastRuns("walCheckpointJob", 3);
    expect(runs.length).toBeLessThanOrEqual(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. wrapRun() — delegates to recordJobRun
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1839a — SqliteJobRunRepository: wrapRun()", () => {
  it("wrapRun() does not throw when fn resolves", async () => {
    const db = makeDb();
    const repo = new SqliteJobRunRepository(db);

    await expect(
      repo.wrapRun("devTeamHeartbeatJob", async () => { /* no-op */ })
    ).resolves.toBeUndefined();
  });

  it("wrapRun() does not re-throw when fn rejects", async () => {
    const db = makeDb();
    const repo = new SqliteJobRunRepository(db);

    await expect(
      repo.wrapRun("cronHealthAlertJob", async () => {
        throw new Error("simulated job failure");
      })
    ).resolves.toBeUndefined();
  });

  it("wrapRun() records a run row on success", async () => {
    const db = makeDb();
    const repo = new SqliteJobRunRepository(db);

    await repo.wrapRun("macroIndicatorRefreshJob", async () => { /* no-op */ });

    const runs = repo.getLastRuns("macroIndicatorRefreshJob", 5);
    // wrapRun creates a completed row — at least one record should exist
    expect(runs.length).toBeGreaterThanOrEqual(1);
  });
});
