/**
 * Task 1457 — scheduler_locks DDL added to schema.ts canonical location.
 *
 * Acceptance criteria:
 *   1. initDatabase() alone creates scheduler_locks table (no ensureSchedulerLocksTable call needed)
 *   2. scheduler_locks has correct schema: job_name PK, acquired_at, released_at
 *   3. ensureSchedulerLocksTable remains callable after initDatabase() with no error (API compat)
 *
 * Note: ensureSchedulerLocksTable retains its DDL so existing callers that build
 * their own DB (e.g. weeklyPortfolioReportJob, test 1221) still work. The canonical
 * audit-visible location is now schema.ts:initDatabase().
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import Database from "bun:sqlite";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema";
import { ensureSchedulerLocksTable } from "../infrastructure/db/schedulerLockStore";

beforeAll(async () => {
  Bun.env["DB_PATH"] = ":memory:";
  await initDatabase();
});

afterAll(() => {
  closeDb();
  delete Bun.env["DB_PATH"];
});

describe("Task 1457 — scheduler_locks in schema.ts", () => {
  it("AC-1: initDatabase() alone creates scheduler_locks table", () => {
    const db = getDb();

    const row = db
      .query(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='scheduler_locks'`
      )
      .get() as { name: string } | null;

    expect(row).not.toBeNull();
    expect(row?.name).toBe("scheduler_locks");
  });

  it("AC-2: scheduler_locks has correct columns after initDatabase()", () => {
    const db = getDb();

    const cols = db
      .query(`PRAGMA table_info(scheduler_locks)`)
      .all() as Array<{ name: string; pk: number }>;

    const names = cols.map((c) => c.name);
    expect(names).toContain("job_name");
    expect(names).toContain("acquired_at");
    expect(names).toContain("released_at");

    const pk = cols.find((c) => c.pk === 1);
    expect(pk?.name).toBe("job_name");
  });

  it("AC-3: ensureSchedulerLocksTable is idempotent after initDatabase() — no error", () => {
    const db = getDb();

    // Must not throw even though table already exists (CREATE TABLE IF NOT EXISTS)
    expect(() => ensureSchedulerLocksTable(db)).not.toThrow();
  });
});
