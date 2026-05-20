/**
 * Task 1955b — Zombie reap + schema CHECK extension
 *
 * AC-1: reaper happy path — running rows with NULL finished_at become 'crashed'
 * AC-2: reaper idempotence — completed rows (success/error) are not touched
 * AC-3: migration idempotence — fresh DB with old DDL (no 'crashed') migrates cleanly
 *        and the new CHECK accepts 'crashed' inserts
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { reapZombieJobRuns } from "../infrastructure/db/cronJobRunStore.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Build a fresh in-memory DB with the current (new) schema. */
function makeDb(): Database {
  const db = new Database(":memory:");
  initSystemTables(db);
  return db;
}

/** Build a fresh in-memory DB with the OLD cron_job_runs DDL (no 'crashed'). */
function makeOldDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE cron_job_runs (
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
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cron_job_runs_job_started
      ON cron_job_runs(job_name, started_at DESC)
  `);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-1: reaper happy path
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1955b — AC-1: reaper happy path", () => {
  it("marks zombie running rows as crashed, sets finished_at and duration_ms", () => {
    const db = makeDb();

    // Seed 2 zombie rows (status='running', finished_at=NULL, started_at in the past)
    db.exec(`
      INSERT INTO cron_job_runs (job_name, started_at, status)
      VALUES ('vnstockFundamentalsRefresh', '2026-05-18T00:00:00Z', 'running'),
             ('vnstockTradingStatsRefresh', '2026-05-18T01:00:00Z', 'running')
    `);

    const { reaped } = reapZombieJobRuns(db);

    expect(reaped).toBe(2);

    type Row = { status: string; finished_at: string | null; duration_ms: number | null };
    const rows = db
      .query<Row, []>(
        "SELECT status, finished_at, duration_ms FROM cron_job_runs ORDER BY id",
      )
      .all();

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.status).toBe("crashed");
      expect(row.finished_at).not.toBeNull();
      expect(row.duration_ms).not.toBeNull();
      // duration_ms must be a non-negative integer (reaper computes from started_at → now)
      expect(row.duration_ms!).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2: reaper idempotence on completed rows
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1955b — AC-2: reaper leaves completed rows untouched", () => {
  it("does not touch a row with status='success' and a non-null finished_at", () => {
    const db = makeDb();

    // Seed one completed (success) row
    db.exec(`
      INSERT INTO cron_job_runs (job_name, started_at, finished_at, status, duration_ms)
      VALUES ('someJob', '2026-05-18T00:00:00Z', '2026-05-18T00:01:00Z', 'success', 60000)
    `);

    const { reaped } = reapZombieJobRuns(db);

    expect(reaped).toBe(0);

    type Row = { status: string; finished_at: string };
    const row = db
      .query<Row, []>(
        "SELECT status, finished_at FROM cron_job_runs LIMIT 1",
      )
      .get();

    expect(row!.status).toBe("success");
    expect(row!.finished_at).toBe("2026-05-18T00:01:00Z");
  });

  it("does not touch rows with status='error' and non-null finished_at", () => {
    const db = makeDb();

    db.exec(`
      INSERT INTO cron_job_runs (job_name, started_at, finished_at, status, error_msg, duration_ms)
      VALUES ('failedJob', '2026-05-18T02:00:00Z', '2026-05-18T02:01:00Z', 'error', 'timeout', 60000)
    `);

    const { reaped } = reapZombieJobRuns(db);
    expect(reaped).toBe(0);

    type Row = { status: string };
    const row = db.query<Row, []>("SELECT status FROM cron_job_runs LIMIT 1").get();
    expect(row!.status).toBe("error");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3: migration idempotence
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1955b — AC-3: migration idempotence (old DDL → new DDL)", () => {
  it("runs initSystemTables on old DDL without error, preserves existing row, accepts 'crashed'", () => {
    // Start with old DDL (no 'crashed' in CHECK)
    const db = makeOldDb();

    // Insert a baseline row using the old-schema-compatible statuses
    db.exec(`
      INSERT INTO cron_job_runs (job_name, started_at, status)
      VALUES ('baselineJob', '2026-05-18T00:00:00Z', 'success')
    `);

    type Row = { job_name: string; status: string };

    // Verify baseline row before migration
    const before = db.query<Row, []>("SELECT job_name, status FROM cron_job_runs").all();
    expect(before).toHaveLength(1);
    expect(before[0]!.job_name).toBe("baselineJob");

    // Run migration — must not throw
    expect(() => initSystemTables(db)).not.toThrow();

    // Baseline row must still be present after migration
    const after = db.query<Row, []>("SELECT job_name, status FROM cron_job_runs").all();
    expect(after.length).toBeGreaterThanOrEqual(1);
    const baseline = after.find((r) => r.job_name === "baselineJob");
    expect(baseline).toBeDefined();
    expect(baseline!.status).toBe("success");

    // New CHECK must accept 'crashed'
    expect(() => {
      db.exec(`
        INSERT INTO cron_job_runs (job_name, started_at, status)
        VALUES ('crashedJob', '2026-05-18T01:00:00Z', 'crashed')
      `);
    }).not.toThrow();

    // Verify the crashed row was actually inserted
    const crashedRow = db
      .query<Row, []>("SELECT job_name, status FROM cron_job_runs WHERE job_name='crashedJob'")
      .get();
    expect(crashedRow).toBeDefined();
    expect(crashedRow!.status).toBe("crashed");
  });
});
