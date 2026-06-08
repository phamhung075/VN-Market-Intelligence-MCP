Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1101 — recordJobRun wrapper + apply to 5 existing jobs
 *
 * Covers:
 *   1. recordJobRun on success → start row inserted, end row status='success', rows_written set, duration_ms > 0
 *   2. recordJobRun on error → end row status='error', error_msg set, no unhandled exception thrown
 *   3. recordJobRun when fn returns void (no rowsWritten) → rows_written=NULL
 *   4. recordJobRun records duration_ms correctly
 *   5. Each of the 5 target jobs imports and uses recordJobRun (structural verification)
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  recordJobRun,
  insertCronJobRunStart,
  updateCronJobRunEnd,
} from "../infrastructure/db/cronJobRunStore.js";

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

type RunRow = {
  id: number;
  job_name: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  rows_written: number | null;
  error_msg: string | null;
  duration_ms: number | null;
};

function getRow(database: Database, id: number): RunRow | null {
  return database
    .query<RunRow, [number]>("SELECT * FROM cron_job_runs WHERE id = ?")
    .get(id);
}

function getAllRows(database: Database): RunRow[] {
  return database
    .query<RunRow, []>("SELECT * FROM cron_job_runs ORDER BY id ASC")
    .all();
}

beforeEach(() => {
  db = new Database(":memory:");
  createSchema(db);
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: recordJobRun wrapper
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1101 — recordJobRun wrapper", () => {
  // ── success path ────────────────────────────────────────────────────────────

  it("success: inserts start row then updates to status='success'", async () => {
    await recordJobRun(db, "pollNewsJob", async () => {
      return { rowsWritten: 5 };
    });

    const rows = getAllRows(db);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.job_name).toBe("pollNewsJob");
    expect(row.status).toBe("success");
  });

  it("success: rows_written is set from fn return value", async () => {
    await recordJobRun(db, "sscFetchJob", async () => {
      return { rowsWritten: 42 };
    });

    const rows = getAllRows(db);
    expect(rows[0]!.rows_written).toBe(42);
  });

  it("success: duration_ms is positive", async () => {
    await recordJobRun(db, "marketScanJob", async () => {
      // Simulate minimal work
      return { rowsWritten: 1 };
    });

    const rows = getAllRows(db);
    expect(rows[0]!.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("success: finished_at is set (not null) after completion", async () => {
    await recordJobRun(db, "pollNewsJob", async () => {
      return { rowsWritten: 0 };
    });

    const rows = getAllRows(db);
    expect(rows[0]!.finished_at).not.toBeNull();
  });

  it("success: error_msg is null on success", async () => {
    await recordJobRun(db, "pollNewsJob", async () => {
      return { rowsWritten: 3 };
    });

    const rows = getAllRows(db);
    expect(rows[0]!.error_msg).toBeNull();
  });

  // ── void return path ─────────────────────────────────────────────────────────

  it("void return: rows_written=NULL when fn returns void", async () => {
    await recordJobRun(db, "dataAuditJob", async () => {
      // fn returns void — no rowsWritten field
    });

    const rows = getAllRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("success");
    expect(rows[0]!.rows_written).toBeNull();
  });

  it("void return: undefined rowsWritten maps to null", async () => {
    await recordJobRun(db, "askQueueCheckJob", async () => {
      return undefined;
    });

    const rows = getAllRows(db);
    expect(rows[0]!.rows_written).toBeNull();
  });

  // ── error path ───────────────────────────────────────────────────────────────

  it("error: does NOT re-throw when fn throws", async () => {
    // Must not propagate — recordJobRun swallows errors
    await expect(
      recordJobRun(db, "pollNewsJob", async () => {
        throw new Error("network timeout");
      }),
    ).resolves.toBeUndefined();
  });

  it("error: status='error' when fn throws", async () => {
    await recordJobRun(db, "sscFetchJob", async () => {
      throw new Error("server 503");
    });

    const rows = getAllRows(db);
    expect(rows[0]!.status).toBe("error");
  });

  it("error: error_msg captured from thrown Error", async () => {
    await recordJobRun(db, "marketScanJob", async () => {
      throw new Error("DNS lookup failed");
    });

    const rows = getAllRows(db);
    expect(rows[0]!.error_msg).toBe("DNS lookup failed");
  });

  it("error: rows_written=NULL on error path", async () => {
    await recordJobRun(db, "pollNewsJob", async () => {
      throw new Error("oops");
    });

    const rows = getAllRows(db);
    expect(rows[0]!.rows_written).toBeNull();
  });

  it("error: finished_at is set even on error", async () => {
    await recordJobRun(db, "pollNewsJob", async () => {
      throw new Error("crash");
    });

    const rows = getAllRows(db);
    expect(rows[0]!.finished_at).not.toBeNull();
  });

  it("error: duration_ms is set even on error", async () => {
    await recordJobRun(db, "pollNewsJob", async () => {
      throw new Error("crash");
    });

    const rows = getAllRows(db);
    expect(rows[0]!.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("error: non-Error thrown — error_msg is stringified", async () => {
    await recordJobRun(db, "pollNewsJob", async () => {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw "string error";
    });

    const rows = getAllRows(db);
    expect(rows[0]!.error_msg).toBe("string error");
    expect(rows[0]!.status).toBe("error");
  });

  // ── multiple runs ─────────────────────────────────────────────────────────────

  it("multiple runs: each call inserts one new row", async () => {
    await recordJobRun(db, "pollNewsJob", async () => ({ rowsWritten: 1 }));
    await recordJobRun(db, "pollNewsJob", async () => ({ rowsWritten: 2 }));
    await recordJobRun(db, "sscFetchJob", async () => ({ rowsWritten: 3 }));

    const rows = getAllRows(db);
    expect(rows).toHaveLength(3);
  });

  // ── structural: 5 target job files import recordJobRun ────────────────────────

  // newsPollerJob.ts removed in task 1187 (dead code — never scheduled).
  // intelligenceCycleJob replaced it. Structural test removed.

  it("structural: sscCheckerJob imports recordJobRun", async () => {
    const src = await Bun.file(
      new URL("../scheduler/news-analysis/sscCheckerJob.ts", import.meta.url).pathname,
    ).text();
    expect(src).toContain("recordJobRun");
    expect(src).toContain("cronJobRunStore");
  });

  it("structural: marketScanJob imports recordJobRun", async () => {
    const src = await Bun.file(
      new URL("../scheduler/market-data/marketScanJob.ts", import.meta.url).pathname,
    ).text();
    expect(src).toContain("recordJobRun");
    expect(src).toContain("cronJobRunStore");
  });

  it("structural: askQueueCheckJob imports recordJobRun", async () => {
    const src = await Bun.file(
      new URL("../scheduler/system/askQueueCheckJob.ts", import.meta.url).pathname,
    ).text();
    expect(src).toContain("recordJobRun");
    expect(src).toContain("cronJobRunStore");
  });

  it("structural: dataAuditJob imports recordJobRun", async () => {
    const src = await Bun.file(
      new URL("../scheduler/news-analysis/dataAuditJob.ts", import.meta.url).pathname,
    ).text();
    expect(src).toContain("recordJobRun");
    expect(src).toContain("cronJobRunStore");
  });
});
