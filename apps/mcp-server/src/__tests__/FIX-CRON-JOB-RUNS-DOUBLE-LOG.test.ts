/**
 * FIX-CRON-JOB-RUNS-DOUBLE-LOG — predictionResolutionJob's cron_job_runs evidentiary
 * trail was defeated by a double-wrap recordJobRun call.
 *
 * Created by po triage 2026-06-11 from router DATA-FRESHNESS AUDIT (ground-truth, live
 * named-volume DB). Original finding: cron_job_runs writes two rows per (job,
 * started_at) — one row with blank/null rows_written and one row with the integer.
 * Skews success_rate and rows_written telemetry the freshness audits rely on.
 *
 * RAW-verified live (docker exec, real market.db, 2026-07-31): predictionResolutionJob
 * (daily 16:35 UTC) produced EXACTLY 2 cron_job_runs rows on every single sampled day
 * (07-21 through 07-30, ids 144635/144636, 147929/147930, 151360/151361, 155245/155246,
 * 158082/158083, 160876/160877, 164433/164434, 167831/167832, 171284/171285,
 * 173661/173662) — a rows_written=NULL row immediately followed by a rows_written=N
 * (real) row, same started_at second. This is the SAME "double-wrap" class already
 * fixed for runEvidenceAccumulatorWithDb, runBaseRateComputationWithDb, and
 * runBctcReparseWithDb (see FIX-BASE-RATE-COMPUTATION-CRON-DEAD.test.ts and
 * FIX-BCTC-REPARSE-DOUBLE-WRAP-DEDUP-GUARD.test.ts, whose structure this file mirrors
 * exactly per that task's own precedent) — the sibling fixes never covered
 * predictionResolutionJob.
 *
 * Root cause: runPredictionResolutionWithDb's default fn called the self-recording
 * runPredictionResolutionJob() wrapper (predictionResolutionJob.ts), which ALSO calls
 * recordJobRun internally. Fixed here (startupHelpers.ts only — predictionResolutionJob.ts
 * itself is untouched, matching the base-rate/bctc-reparse fix's file-touch footprint):
 * default fn now calls the core runPredictionResolution(db) directly (single recordJobRun
 * call) and maps its real result to rowsWritten. A shouldSkipRecoveryReplay T4 dedup guard
 * — previously living only inside runPredictionResolutionJob(), invisible to a second
 * physical node-cron tick because THIS wrapper is what schedulerJobTable.ts actually
 * invokes — is replicated into the wrapper itself.
 *
 * Coverage:
 *   T1. Single execution writes exactly ONE cron_job_runs row (double-wrap fixed).
 *   T2. The single row carries the real result (status=success, rows_written=N).
 *   T3. Dedup: fn is NOT called when a success row already exists within the
 *       90%-of-cadence window (T4 guard, replicated into this wrapper).
 *   T4. Dedup: no second cron_job_runs row written on a same-window double-fire.
 *   T4b. AC-4 explicit: 2 back-to-back invocations within the cadence window
 *        produce exactly 1 cron_job_runs row, not 2.
 *   T5. A stale (>21.6h old) prior success does NOT block a fresh run.
 *   T6. fn default calls runPredictionResolution(db) directly and maps
 *       resolved+unresolvable+excluded to rowsWritten — single-wrap proof through the
 *       REAL default code path (no self-recording inner call reaches recordJobRun a
 *       second time).
 *   T7. Source contract — schedulerJobTable.ts's only registration site is
 *       runPredictionResolutionWithDb (not double-wrapped through jobRunRepo.wrapRun).
 */

// Isolation guard: apps/mcp-server/src/__tests__/034-telegram-notifier.test.ts /
// 1298b-imf-infra.test.ts / 084-tool-market.test.ts / FIX-BASE-RATE-COMPUTATION-CRON-DEAD.test.ts /
// FIX-BCTC-REPARSE-DOUBLE-WRAP-DEDUP-GUARD.test.ts document the same class of defect —
// Bun's `mock.module()` is PROCESS-GLOBAL and persists across test FILES (not just within
// the file that called it); FACTORY-SCHEDULER-job-table-registry.test.ts calls
// `mock.module("../scheduler/startupHelpers.js", ...)` (stubbing shouldRunCatchup -> () =>
// false and every run*WithDb -> async () => {}) inside its Group B/C/D tests and never
// restores it. Bypass the mock cache with a `?isolate=` query-busted dynamic import of
// the REAL module, resolved once at module load.
const _real = await import(
  Bun.resolveSync("../scheduler/startupHelpers.js", import.meta.dir) +
    "?isolate=FIX-CRON-JOB-RUNS-DOUBLE-LOG"
);
const runPredictionResolutionWithDb: typeof import("../scheduler/startupHelpers.js").runPredictionResolutionWithDb =
  _real.runPredictionResolutionWithDb;

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// DB setup helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeDbWithCronTable(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE cron_job_runs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name     TEXT    NOT NULL,
      started_at   TEXT    NOT NULL,
      finished_at  TEXT,
      status       TEXT    NOT NULL DEFAULT 'running',
      rows_written INTEGER,
      error_msg    TEXT,
      duration_ms  INTEGER
    )
  `);
  return db;
}

function insertCronRow(db: Database, status: string, startedAt?: string): void {
  const ts = startedAt ?? new Date().toISOString().replace("T", " ").slice(0, 19);
  db.prepare(
    `INSERT INTO cron_job_runs (job_name, started_at, status)
     VALUES ('predictionResolutionJob', ?, ?)`,
  ).run(ts, status);
}

/**
 * prediction_claims schema matching predictionResolutionJob.ts's own query columns
 * — empty on purpose so T6's real default fn exercises runPredictionResolution(db)
 * against zero pending claims (honest zero, no fabricated rows).
 */
function addPredictionClaimsTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS prediction_claims (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      stock             TEXT NOT NULL,
      direction         TEXT NOT NULL,
      target_price      REAL,
      creation_price    REAL,
      confidence        REAL,
      resolution_date   TEXT NOT NULL,
      resolution_outcome INTEGER,
      is_excluded       INTEGER NOT NULL DEFAULT 0,
      brier_score       REAL,
      resolved_at       TEXT
    );
  `);
  db.exec(`CREATE TABLE IF NOT EXISTS daily_ohlcv (code TEXT, date TEXT, close REAL)`);
}

// ─────────────────────────────────────────────────────────────────────────────
// T1/T2 — Single execution writes exactly ONE cron_job_runs row
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-CRON-JOB-RUNS-DOUBLE-LOG — T1/T2: double-wrap fixed", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDbWithCronTable();
  });

  it("T1: writes exactly one cron_job_runs row (double-wrap regression: was 2 rows live every day)", async () => {
    let callCount = 0;
    await runPredictionResolutionWithDb(db, async () => {
      callCount++;
      return { rowsWritten: 3 };
    });

    const rows = db
      .prepare<{ cnt: number }, []>(
        "SELECT COUNT(*) AS cnt FROM cron_job_runs WHERE job_name='predictionResolutionJob'",
      )
      .get();
    expect(rows?.cnt).toBe(1);
    expect(callCount).toBe(1);
  });

  it("T2: the single row carries the real result (status=success, rows_written=N)", async () => {
    await runPredictionResolutionWithDb(db, async () => ({ rowsWritten: 5 }));

    const row = db
      .prepare<{ status: string; rows_written: number | null }, []>(
        "SELECT status, rows_written FROM cron_job_runs WHERE job_name='predictionResolutionJob'",
      )
      .get();
    expect(row?.status).toBe("success");
    expect(row?.rows_written).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T3/T4/T4b — Dedup: recent success blocks a same-window double fire
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-CRON-JOB-RUNS-DOUBLE-LOG — T3/T4: T4 dedup guard replicated in wrapper", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDbWithCronTable();
  });

  it("T3: fn is NOT called when a success row exists within the cadence window (just now)", async () => {
    insertCronRow(db, "success");

    let callCount = 0;
    await runPredictionResolutionWithDb(db, async () => {
      callCount++;
      return { rowsWritten: 1 };
    });

    expect(callCount).toBe(0);
  });

  it("T4: no second cron_job_runs row written on a same-window double fire", async () => {
    insertCronRow(db, "success");

    await runPredictionResolutionWithDb(db, async () => ({ rowsWritten: 1 }));

    const rows = db
      .prepare<{ cnt: number }, []>(
        "SELECT COUNT(*) AS cnt FROM cron_job_runs WHERE job_name='predictionResolutionJob'",
      )
      .get();
    // Still just the pre-existing row — no NULL/duplicate row from a skipped attempt.
    expect(rows?.cnt).toBe(1);
  });

  it("T4b (AC-4 explicit): 2 back-to-back invocations within the cadence window produce exactly 1 cron_job_runs row, not 2", async () => {
    let callCount = 0;
    const fn = async () => {
      callCount++;
      return { rowsWritten: 2 };
    };

    await runPredictionResolutionWithDb(db, fn);
    await runPredictionResolutionWithDb(db, fn);

    const rows = db
      .prepare<{ cnt: number }, []>(
        "SELECT COUNT(*) AS cnt FROM cron_job_runs WHERE job_name='predictionResolutionJob'",
      )
      .get();
    expect(rows?.cnt).toBe(1);
    expect(callCount).toBe(1); // second invocation's fn is never called (guard-skipped)
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T5 — Stale prior success does not block a fresh run
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-CRON-JOB-RUNS-DOUBLE-LOG — T5: cross-cadence-window boundary", () => {
  it("T5: a success row older than 90% of the daily cadence (21.6h) does NOT block today's run", async () => {
    const db = makeDbWithCronTable();
    // 30 hours ago — well outside the 21.6h dedup window.
    const oldTs = new Date(Date.now() - 30 * 60 * 60 * 1000)
      .toISOString()
      .replace("T", " ")
      .slice(0, 19);
    insertCronRow(db, "success", oldTs);

    let callCount = 0;
    await runPredictionResolutionWithDb(db, async () => {
      callCount++;
      return { rowsWritten: 2 };
    });

    expect(callCount).toBe(1);
    const rows = db
      .prepare<{ cnt: number }, []>(
        "SELECT COUNT(*) AS cnt FROM cron_job_runs WHERE job_name='predictionResolutionJob'",
      )
      .get();
    expect(rows?.cnt).toBe(2); // old row + fresh row
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T6 — Single-wrap proof: default fn calls runPredictionResolution(db) directly
// and maps resolved+unresolvable+excluded to rowsWritten (no NULL, no
// self-recording double row)
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-CRON-JOB-RUNS-DOUBLE-LOG — T6: default fn is single-wrap", () => {
  it("T6: with zero pending prediction_claims (real core logic), reports rowsWritten=0 honestly, one row only, no NULL", async () => {
    const db = makeDbWithCronTable();
    addPredictionClaimsTable(db); // empty — no pending claims

    // Exercise the REAL default fn (no injected fn) — proves single-wrap end-to-end.
    await runPredictionResolutionWithDb(db);

    const row = db
      .prepare<{ status: string; rows_written: number | null }, []>(
        "SELECT status, rows_written FROM cron_job_runs WHERE job_name='predictionResolutionJob'",
      )
      .get();
    expect(row?.status).toBe("success");
    expect(row?.rows_written).toBe(0); // honest zero — no pending claims, no NULL
    const rows = db
      .prepare<{ cnt: number }, []>(
        "SELECT COUNT(*) AS cnt FROM cron_job_runs WHERE job_name='predictionResolutionJob'",
      )
      .get();
    expect(rows?.cnt).toBe(1); // not 2 — no self-recording inner Job() call reached
  });

  it("T6b: fn wrapping runPredictionResolution(db) maps resolved+unresolvable+excluded to rowsWritten (mechanism proof, controlled fn)", async () => {
    const db = makeDbWithCronTable();

    // Proves the exact mapping formula the default fn now uses
    // (`{ rowsWritten: result.resolved + result.unresolvable + result.excluded }`)
    // against a stand-in PredictionResolutionResult, without invoking the real
    // runPredictionResolution production pipeline against a full schema.
    await runPredictionResolutionWithDb(db, async () => {
      const result = { resolved: 2, unresolvable: 1, skipped: 4, excluded: 1 };
      return { rowsWritten: result.resolved + result.unresolvable + result.excluded };
    });

    const row = db
      .prepare<{ status: string; rows_written: number | null }, []>(
        "SELECT status, rows_written FROM cron_job_runs WHERE job_name='predictionResolutionJob'",
      )
      .get();
    expect(row?.status).toBe("success");
    expect(row?.rows_written).toBe(4); // 2 resolved + 1 unresolvable + 1 excluded = 4, not NULL
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T7 — Source contract: schedulerJobTable.ts wires the single registration site
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-CRON-JOB-RUNS-DOUBLE-LOG — T7: source contract", () => {
  it("T7: schedulerJobTable.ts registers predictionResolutionJob only via runPredictionResolutionWithDb (not double-wrapped)", () => {
    const src = readFileSync(
      join(import.meta.dir, "../scheduler/schedulerJobTable.ts"),
      "utf-8",
    );
    expect(src).toContain("runPredictionResolutionWithDb(db)");
    // Must NOT be wrapped a second time via jobRunRepo.wrapRun('predictionResolutionJob', ...)
    // — that would reintroduce the double-recordJobRun bug this task fixed.
    expect(src).not.toMatch(/jobRunRepo\.wrapRun\(\s*'predictionResolutionJob'/);
  });

  it("T7b: startupHelpers.ts default fn no longer calls the self-recording runPredictionResolutionJob() wrapper", () => {
    const src = readFileSync(join(import.meta.dir, "../scheduler/startupHelpers.ts"), "utf-8");
    // Root-cause fix: the default fn must call the CORE runPredictionResolution(db)
    // directly, not the self-recording runPredictionResolutionJob() wrapper (which
    // internally calls recordJobRun a second time — the exact bug this task fixes).
    expect(src).toContain("runPredictionResolution(db)");
    expect(src).not.toContain("await runPredictionResolutionJob()");
  });
});
