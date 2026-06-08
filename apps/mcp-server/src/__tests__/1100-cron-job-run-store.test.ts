Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1100 — cron_job_runs DDL + cronJobRunStore CRUD helpers
 *
 * Covers:
 *   1. DDL — fresh DB has cron_job_runs table after initDatabase()
 *   2. insertCronJobRunStart returns id, row has status='running'
 *   3. updateCronJobRunEnd sets status='success', rows_written, duration_ms
 *   4. updateCronJobRunEnd with error sets status='error', error_msg
 *   5. purgeOldCronJobRuns deletes old rows, keeps recent ones
 *   6. getCronJobHealthSummary returns correct success_rate, avg_duration
 *   7. getCronJobHealthSummary with jobName filter returns only that job
 *   8. getCronJobHealthSummary with 0 rows returns empty array
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
import {
  insertCronJobRunStart,
  updateCronJobRunEnd,
  purgeOldCronJobRuns,
  getCronJobHealthSummary,
  type CronJobRunRow,
  type CronJobHealthSummary,
} from "../infrastructure/db/cronJobRunStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// In-memory DB fixture with cron_job_runs DDL
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
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_cron_job_runs_job_started
      ON cron_job_runs(job_name, started_at DESC)
  `);
}

beforeEach(() => {
  db = new Database(":memory:");
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  createSchema(db);
});

afterEach(() => {
  db.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. DDL — cron_job_runs table columns exist
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1100 — cron_job_runs DDL", () => {
  it("cron_job_runs table has all required columns", () => {
    const rows = db
      .prepare("PRAGMA table_info(cron_job_runs)")
      .all() as Array<{ name: string }>;

    const cols = rows.map((r) => r.name);
    expect(cols).toContain("id");
    expect(cols).toContain("job_name");
    expect(cols).toContain("started_at");
    expect(cols).toContain("finished_at");
    expect(cols).toContain("status");
    expect(cols).toContain("rows_written");
    expect(cols).toContain("error_msg");
    expect(cols).toContain("duration_ms");
  });

  it("index idx_cron_job_runs_job_started exists", () => {
    const rows = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='index' AND name='idx_cron_job_runs_job_started'`,
      )
      .all() as Array<{ name: string }>;
    expect(rows.length).toBe(1);
    expect(rows[0]!.name).toBe("idx_cron_job_runs_job_started");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. insertCronJobRunStart
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1100 — insertCronJobRunStart", () => {
  it("returns a positive integer id", () => {
    const id = insertCronJobRunStart(db, "pollNewsJob");
    expect(typeof id).toBe("number");
    expect(id).toBeGreaterThan(0);
  });

  it("row has status='running' and started_at set", () => {
    const id = insertCronJobRunStart(db, "pollNewsJob");
    const row = db
      .prepare<CronJobRunRow, [number]>("SELECT * FROM cron_job_runs WHERE id = ?")
      .get(id);
    expect(row).not.toBeNull();
    expect(row!.status).toBe("running");
    expect(row!.job_name).toBe("pollNewsJob");
    expect(typeof row!.started_at).toBe("string");
    expect(row!.started_at.length).toBeGreaterThan(0);
  });

  it("all nullable columns are null on start", () => {
    const id = insertCronJobRunStart(db, "sscFetchJob");
    const row = db
      .prepare<CronJobRunRow, [number]>("SELECT * FROM cron_job_runs WHERE id = ?")
      .get(id);
    expect(row!.finished_at).toBeNull();
    expect(row!.rows_written).toBeNull();
    expect(row!.error_msg).toBeNull();
    expect(row!.duration_ms).toBeNull();
  });

  it("multiple jobs get distinct ids", () => {
    const id1 = insertCronJobRunStart(db, "jobA");
    const id2 = insertCronJobRunStart(db, "jobB");
    const id3 = insertCronJobRunStart(db, "jobA");
    expect(id1).not.toBe(id2);
    expect(id2).not.toBe(id3);
    expect(id1).not.toBe(id3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. updateCronJobRunEnd — success
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1100 — updateCronJobRunEnd (success)", () => {
  it("sets status='success', rows_written, duration_ms", () => {
    const id = insertCronJobRunStart(db, "marketScanJob");
    updateCronJobRunEnd(db, id, "success", 42, null, 1234);

    const row = db
      .prepare<CronJobRunRow, [number]>("SELECT * FROM cron_job_runs WHERE id = ?")
      .get(id);
    expect(row!.status).toBe("success");
    expect(row!.rows_written).toBe(42);
    expect(row!.duration_ms).toBe(1234);
    expect(row!.error_msg).toBeNull();
    expect(row!.finished_at).not.toBeNull();
  });

  it("accepts null rows_written for jobs that don't count rows", () => {
    const id = insertCronJobRunStart(db, "auditJob");
    updateCronJobRunEnd(db, id, "success", null, null, 500);

    const row = db
      .prepare<CronJobRunRow, [number]>("SELECT * FROM cron_job_runs WHERE id = ?")
      .get(id);
    expect(row!.status).toBe("success");
    expect(row!.rows_written).toBeNull();
    expect(row!.duration_ms).toBe(500);
  });

  it("finished_at is set to an ISO-format timestamp", () => {
    const id = insertCronJobRunStart(db, "someJob");
    updateCronJobRunEnd(db, id, "success", 0, null, 100);

    const row = db
      .prepare<CronJobRunRow, [number]>("SELECT * FROM cron_job_runs WHERE id = ?")
      .get(id);
    expect(row!.finished_at).not.toBeNull();
    // SQLite datetime('now') format: 'YYYY-MM-DD HH:MM:SS'
    expect(row!.finished_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. updateCronJobRunEnd — error
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1100 — updateCronJobRunEnd (error)", () => {
  it("sets status='error' and error_msg", () => {
    const id = insertCronJobRunStart(db, "sscFetchJob");
    updateCronJobRunEnd(db, id, "error", null, "Network timeout after 30s", 30000);

    const row = db
      .prepare<CronJobRunRow, [number]>("SELECT * FROM cron_job_runs WHERE id = ?")
      .get(id);
    expect(row!.status).toBe("error");
    expect(row!.error_msg).toBe("Network timeout after 30s");
    expect(row!.duration_ms).toBe(30000);
    expect(row!.rows_written).toBeNull();
    expect(row!.finished_at).not.toBeNull();
  });

  it("stores Vietnamese error messages verbatim", () => {
    const id = insertCronJobRunStart(db, "sscFetchJob");
    const errMsg = "Lỗi kết nối: SSC portal trả về 503";
    updateCronJobRunEnd(db, id, "error", null, errMsg, 5000);

    const row = db
      .prepare<CronJobRunRow, [number]>("SELECT * FROM cron_job_runs WHERE id = ?")
      .get(id);
    expect(row!.error_msg).toBe(errMsg);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. purgeOldCronJobRuns
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1100 — purgeOldCronJobRuns", () => {
  it("deletes rows older than retentionDays, keeps recent ones", () => {
    // Insert old row (35 days ago)
    db.exec(`
      INSERT INTO cron_job_runs (job_name, started_at, status)
      VALUES ('pollNewsJob', datetime('now', '-35 days'), 'success')
    `);
    // Insert recent row (1 day ago)
    db.exec(`
      INSERT INTO cron_job_runs (job_name, started_at, status)
      VALUES ('pollNewsJob', datetime('now', '-1 day'), 'success')
    `);

    const deleted = purgeOldCronJobRuns(db, "pollNewsJob", 30);
    expect(deleted).toBe(1);

    const remaining = db
      .prepare("SELECT COUNT(*) AS c FROM cron_job_runs")
      .get() as { c: number };
    expect(remaining.c).toBe(1);
  });

  it("returns 0 when no rows are old enough to purge", () => {
    db.exec(`
      INSERT INTO cron_job_runs (job_name, started_at, status)
      VALUES ('pollNewsJob', datetime('now', '-5 days'), 'success')
    `);

    const deleted = purgeOldCronJobRuns(db, "pollNewsJob", 30);
    expect(deleted).toBe(0);
  });

  it("only purges rows for the given jobName", () => {
    // Old row for jobA
    db.exec(`
      INSERT INTO cron_job_runs (job_name, started_at, status)
      VALUES ('jobA', datetime('now', '-40 days'), 'success')
    `);
    // Old row for jobB (same age, different name)
    db.exec(`
      INSERT INTO cron_job_runs (job_name, started_at, status)
      VALUES ('jobB', datetime('now', '-40 days'), 'success')
    `);

    const deleted = purgeOldCronJobRuns(db, "jobA", 30);
    expect(deleted).toBe(1);

    // jobB row must survive
    const jobBRow = db
      .prepare("SELECT COUNT(*) AS c FROM cron_job_runs WHERE job_name = 'jobB'")
      .get() as { c: number };
    expect(jobBRow.c).toBe(1);
  });

  it("returns count of all deleted rows (multiple old rows)", () => {
    for (let i = 0; i < 5; i++) {
      db.exec(`
        INSERT INTO cron_job_runs (job_name, started_at, status)
        VALUES ('batchJob', datetime('now', '-${35 + i} days'), 'success')
      `);
    }
    // Add 1 recent row to keep
    db.exec(`
      INSERT INTO cron_job_runs (job_name, started_at, status)
      VALUES ('batchJob', datetime('now', '-1 day'), 'success')
    `);

    const deleted = purgeOldCronJobRuns(db, "batchJob", 30);
    expect(deleted).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. getCronJobHealthSummary — correct aggregations
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1100 — getCronJobHealthSummary (aggregations)", () => {
  it("returns correct success_rate and avg_duration for a job with mixed results", () => {
    // 3 success, 1 error — success_rate = 0.75
    db.exec(`
      INSERT INTO cron_job_runs (job_name, started_at, finished_at, status, duration_ms)
      VALUES
        ('pollNewsJob', datetime('now', '-1 day'), datetime('now', '-1 day', '+1 second'), 'success', 1000),
        ('pollNewsJob', datetime('now', '-2 days'), datetime('now', '-2 days', '+2 second'), 'success', 2000),
        ('pollNewsJob', datetime('now', '-3 days'), datetime('now', '-3 days', '+3 second'), 'success', 3000),
        ('pollNewsJob', datetime('now', '-4 days'), datetime('now', '-4 days', '+4 second'), 'error', 4000)
    `);

    const summary = getCronJobHealthSummary(db, 7);
    expect(summary.length).toBe(1);

    const job = summary[0]!;
    expect(job.job_name).toBe("pollNewsJob");
    expect(job.total_runs_7d).toBe(4);
    expect(job.success_rate_7d).toBeCloseTo(0.75, 5);
    expect(job.avg_duration_ms).toBeCloseTo(2500, 0);
    expect(job.last_status).toBe("success");
    expect(job.last_error).toBeNull();
  });

  it("last_run is the most recent started_at timestamp", () => {
    db.exec(`
      INSERT INTO cron_job_runs (job_name, started_at, status, duration_ms)
      VALUES
        ('sscFetchJob', '2026-04-01 10:00:00', 'success', 500),
        ('sscFetchJob', '2026-04-05 10:00:00', 'success', 600),
        ('sscFetchJob', '2026-04-03 10:00:00', 'success', 700)
    `);

    const summary = getCronJobHealthSummary(db, 30);
    expect(summary.length).toBe(1);
    expect(summary[0]!.last_run).toBe("2026-04-05 10:00:00");
  });

  it("last_error is set when last run was an error", () => {
    db.exec(`
      INSERT INTO cron_job_runs (job_name, started_at, status, error_msg, duration_ms)
      VALUES
        ('sscFetchJob', datetime('now', '-2 days'), 'success', NULL, 400),
        ('sscFetchJob', datetime('now', '-1 day'), 'error', 'Timeout 30s', 30000)
    `);

    const summary = getCronJobHealthSummary(db, 7);
    expect(summary[0]!.last_status).toBe("error");
    expect(summary[0]!.last_error).toBe("Timeout 30s");
  });

  it("excludes rows outside the days window", () => {
    // Rows older than 7 days should not be counted
    db.exec(`
      INSERT INTO cron_job_runs (job_name, started_at, status, duration_ms)
      VALUES
        ('pollNewsJob', datetime('now', '-8 days'), 'success', 1000),
        ('pollNewsJob', datetime('now', '-1 day'),  'success', 2000)
    `);

    const summary = getCronJobHealthSummary(db, 7);
    expect(summary.length).toBe(1);
    expect(summary[0]!.total_runs_7d).toBe(1);
  });

  it("result is sorted by job_name ASC when multiple jobs", () => {
    db.exec(`
      INSERT INTO cron_job_runs (job_name, started_at, status, duration_ms)
      VALUES
        ('zebra', datetime('now', '-1 day'), 'success', 100),
        ('alpha', datetime('now', '-1 day'), 'success', 200),
        ('middle', datetime('now', '-1 day'), 'success', 300)
    `);

    const summary = getCronJobHealthSummary(db, 7);
    expect(summary.length).toBe(3);
    expect(summary[0]!.job_name).toBe("alpha");
    expect(summary[1]!.job_name).toBe("middle");
    expect(summary[2]!.job_name).toBe("zebra");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. getCronJobHealthSummary — jobName filter
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1100 — getCronJobHealthSummary (jobName filter)", () => {
  it("returns only the specified job when jobName is provided", () => {
    db.exec(`
      INSERT INTO cron_job_runs (job_name, started_at, status, duration_ms)
      VALUES
        ('jobA', datetime('now', '-1 day'), 'success', 1000),
        ('jobB', datetime('now', '-1 day'), 'error', 2000),
        ('jobC', datetime('now', '-1 day'), 'success', 3000)
    `);

    const summary = getCronJobHealthSummary(db, 7, "jobB");
    expect(summary.length).toBe(1);
    expect(summary[0]!.job_name).toBe("jobB");
    expect(summary[0]!.last_status).toBe("error");
  });

  it("returns empty array when filtered jobName has no rows in window", () => {
    db.exec(`
      INSERT INTO cron_job_runs (job_name, started_at, status, duration_ms)
      VALUES ('jobA', datetime('now', '-1 day'), 'success', 1000)
    `);

    const summary = getCronJobHealthSummary(db, 7, "nonExistentJob");
    expect(summary).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. getCronJobHealthSummary — empty table
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1100 — getCronJobHealthSummary (empty table)", () => {
  it("returns empty array when no rows exist", () => {
    const summary = getCronJobHealthSummary(db, 7);
    expect(summary).toEqual([]);
  });

  it("returns empty array when all rows are outside the days window", () => {
    db.exec(`
      INSERT INTO cron_job_runs (job_name, started_at, status, duration_ms)
      VALUES ('pollNewsJob', datetime('now', '-60 days'), 'success', 1000)
    `);

    const summary = getCronJobHealthSummary(db, 7);
    expect(summary).toEqual([]);
  });
});
