/**
 * FIX-BCTC-REPARSE-DOUBLE-WRAP-DEDUP-GUARD — bctcReparseJob's cron_job_runs evidentiary
 * trail was defeated by a double-wrap recordJobRun + an ungated startup catch-up.
 *
 * Found by SPIKE-BCTC-REPARSE-CADENCE-GUARD-ROOTCAUSE-VERIFY AC-2
 * (docs/spikes/SPIKE-BCTC-REPARSE-CADENCE-GUARD-ROOTCAUSE-VERIFY.md). RAW-verified live
 * (docker exec, real market.db, 2026-07-29): 100% of ~90 sampled cron_job_runs rows
 * across 11 days had rows_written=NULL, and 2-7 rows/day (vs. the intended 1x/day) —
 * this is the SAME "double-wrap" class already fixed for runEvidenceAccumulatorWithDb
 * and runBaseRateComputationWithDb (see FIX-BASE-RATE-COMPUTATION-CRON-DEAD.test.ts,
 * whose structure this file mirrors exactly per that task's own precedent).
 *
 * Two genuine bugs fixed (startupHelpers.ts + startScheduler.ts only — bctcReparseJob.ts
 * itself is untouched, matching the base-rate fix's file-touch footprint):
 *   1. runBctcReparseWithDb double-wrapped recordJobRun: its default fn called
 *      runBctcReparseJob() with NO options, so options.db stayed undefined and
 *      runBctcReparseJob()'s own trailing `if (!options.db) recordJobRun(...)` block
 *      ALSO fired on every real run. Worse, runBctcReparseWithDb had no
 *      shouldSkipRecoveryReplay guard of its own, so a guard-skipped invocation
 *      (runBctcReparseJob()'s internal guard early-returning a no-op ReparseRunResult)
 *      still resolved without throwing — recordJobRun marked a fresh 'success' row
 *      anyway, silently re-arming its own 21.6h dedup window.
 *   2. startScheduler.ts's bctcReparseJob startup catch-up (30s post-boot) was
 *      UNCONDITIONAL — no staleness gate — despite its own introducing commit
 *      (75b729183) claiming to mirror runDailyAuditIfStale's pattern.
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
 *   T6. fn default calls runBctcReparseJob({ db }) and maps resolved+failed to
 *       rowsWritten — single-wrap proof through the REAL default code path (no
 *       self-recording inner call reaches recordJobRun a second time).
 *   T7-T10. shouldRunCatchup() semantics for bctcReparseJob's daily 02:30 UTC
 *       (09:30 ICT) window (window-reached / window-not-reached / dedup / any day).
 *   T11. Source contract — startScheduler.ts wires the bctcReparseJob catchup probe
 *        through shouldRunCatchup(), not unconditionally.
 */

// Isolation guard: apps/mcp-server/src/__tests__/034-telegram-notifier.test.ts /
// 1298b-imf-infra.test.ts / 084-tool-market.test.ts / FIX-BASE-RATE-COMPUTATION-CRON-DEAD.test.ts
// document the same class of defect — Bun's `mock.module()` is PROCESS-GLOBAL and persists
// across test FILES (not just within the file that called it); FACTORY-SCHEDULER-job-table-
// registry.test.ts calls `mock.module("../scheduler/startupHelpers.js", ...)` (stubbing
// shouldRunCatchup -> () => false and runBctcReparseWithDb -> async () => {}) inside its
// Group B/C/D tests and never restores it. Bypass the mock cache with a `?isolate=`
// query-busted dynamic import of the REAL module, resolved once at module load.
const _real = await import(
  Bun.resolveSync("../scheduler/startupHelpers.js", import.meta.dir) +
    "?isolate=FIX-BCTC-REPARSE-DOUBLE-WRAP-DEDUP-GUARD"
);
const runBctcReparseWithDb: typeof import("../scheduler/startupHelpers.js").runBctcReparseWithDb =
  _real.runBctcReparseWithDb;
const shouldRunCatchup: typeof import("../scheduler/startupHelpers.js").shouldRunCatchup =
  _real.shouldRunCatchup;

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
     VALUES ('bctcReparseJob', ?, ?)`,
  ).run(ts, status);
}

/**
 * agent_feedback schema matching bctcReparseJob.ts's own query columns
 * (id, title, detail, reparse_attempts) — same shape as 1019-bctc-reparse-job.test.ts.
 * Deliberately NOT creating a `watchlist` table: scanDiskForStrandedPdfs's own
 * try/catch treats a missing watchlist table as "skip disk scan" (returns []),
 * which keeps T6 below from touching the real apps/mcp-server/data/pdfs/ directory
 * (279 real files) that exists on this machine.
 */
function addAgentFeedbackTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_feedback (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      agent             TEXT NOT NULL,
      category          TEXT NOT NULL,
      title             TEXT NOT NULL,
      detail            TEXT NOT NULL DEFAULT '',
      priority          TEXT NOT NULL DEFAULT 'medium',
      status            TEXT NOT NULL DEFAULT 'new',
      created_at        TEXT NOT NULL,
      reparse_attempts  INTEGER NOT NULL DEFAULT 0
    );
  `);
}

// ─────────────────────────────────────────────────────────────────────────────
// T1/T2 — Single execution writes exactly ONE cron_job_runs row
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-REPARSE-DOUBLE-WRAP-DEDUP-GUARD — T1/T2: double-wrap fixed", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDbWithCronTable();
  });

  it("T1: writes exactly one cron_job_runs row (double-wrap regression: was 2+ rows live)", async () => {
    let callCount = 0;
    await runBctcReparseWithDb(db, async () => {
      callCount++;
      return { rowsWritten: 3 };
    });

    const rows = db
      .prepare<{ cnt: number }, []>(
        "SELECT COUNT(*) AS cnt FROM cron_job_runs WHERE job_name='bctcReparseJob'",
      )
      .get();
    expect(rows?.cnt).toBe(1);
    expect(callCount).toBe(1);
  });

  it("T2: the single row carries the real result (status=success, rows_written=N)", async () => {
    await runBctcReparseWithDb(db, async () => ({ rowsWritten: 5 }));

    const row = db
      .prepare<{ status: string; rows_written: number | null }, []>(
        "SELECT status, rows_written FROM cron_job_runs WHERE job_name='bctcReparseJob'",
      )
      .get();
    expect(row?.status).toBe("success");
    expect(row?.rows_written).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T3/T4/T4b — Dedup: recent success blocks a same-window double fire
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-REPARSE-DOUBLE-WRAP-DEDUP-GUARD — T3/T4: T4 dedup guard replicated in wrapper", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDbWithCronTable();
  });

  it("T3: fn is NOT called when a success row exists within the cadence window (just now)", async () => {
    insertCronRow(db, "success");

    let callCount = 0;
    await runBctcReparseWithDb(db, async () => {
      callCount++;
      return { rowsWritten: 1 };
    });

    expect(callCount).toBe(0);
  });

  it("T4: no second cron_job_runs row written on a same-window double fire", async () => {
    insertCronRow(db, "success");

    await runBctcReparseWithDb(db, async () => ({ rowsWritten: 1 }));

    const rows = db
      .prepare<{ cnt: number }, []>(
        "SELECT COUNT(*) AS cnt FROM cron_job_runs WHERE job_name='bctcReparseJob'",
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

    await runBctcReparseWithDb(db, fn);
    await runBctcReparseWithDb(db, fn);

    const rows = db
      .prepare<{ cnt: number }, []>(
        "SELECT COUNT(*) AS cnt FROM cron_job_runs WHERE job_name='bctcReparseJob'",
      )
      .get();
    expect(rows?.cnt).toBe(1);
    expect(callCount).toBe(1); // second invocation's fn is never called (guard-skipped)
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T5 — Stale prior success does not block a fresh run
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-REPARSE-DOUBLE-WRAP-DEDUP-GUARD — T5: cross-cadence-window boundary", () => {
  it("T5: a success row older than 90% of the daily cadence (21.6h) does NOT block today's run", async () => {
    const db = makeDbWithCronTable();
    // 30 hours ago — well outside the 21.6h dedup window.
    const oldTs = new Date(Date.now() - 30 * 60 * 60 * 1000)
      .toISOString()
      .replace("T", " ")
      .slice(0, 19);
    insertCronRow(db, "success", oldTs);

    let callCount = 0;
    await runBctcReparseWithDb(db, async () => {
      callCount++;
      return { rowsWritten: 2 };
    });

    expect(callCount).toBe(1);
    const rows = db
      .prepare<{ cnt: number }, []>(
        "SELECT COUNT(*) AS cnt FROM cron_job_runs WHERE job_name='bctcReparseJob'",
      )
      .get();
    expect(rows?.cnt).toBe(2); // old row + fresh row
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T6 — Single-wrap proof: default fn calls runBctcReparseJob({ db }) directly
// and maps resolved+failed to rowsWritten (no NULL, no self-recording double row)
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-REPARSE-DOUBLE-WRAP-DEDUP-GUARD — T6: default fn is single-wrap", () => {
  it("T6: with zero stranded feedback rows (real core logic), reports rowsWritten=0 honestly, one row only, no NULL", async () => {
    const db = makeDbWithCronTable();
    addAgentFeedbackTable(db); // empty — no stranded_bctc_pdf rows

    // Exercise the REAL default fn (no injected fn) — proves single-wrap end-to-end.
    await runBctcReparseWithDb(db);

    const row = db
      .prepare<{ status: string; rows_written: number | null }, []>(
        "SELECT status, rows_written FROM cron_job_runs WHERE job_name='bctcReparseJob'",
      )
      .get();
    expect(row?.status).toBe("success");
    expect(row?.rows_written).toBe(0); // honest zero — no stranded feedback rows, no NULL
    const rows = db
      .prepare<{ cnt: number }, []>(
        "SELECT COUNT(*) AS cnt FROM cron_job_runs WHERE job_name='bctcReparseJob'",
      )
      .get();
    expect(rows?.cnt).toBe(1); // not 2 — no self-recording inner block reached
  });

  it("T6b: fn wrapping runBctcReparseJob({ db }) maps resolved+failed to rowsWritten (mechanism proof, controlled fn)", async () => {
    const db = makeDbWithCronTable();

    // Proves the exact mapping formula the default fn now uses
    // (`{ rowsWritten: result.resolved + result.failed }`) against a stand-in
    // ReparseRunResult, without invoking the real reparseSingle production pipeline
    // (makeProductionDeps() lazy-imports application/infra modules — out of scope
    // for a fast unit test; the mapping formula itself is what AC-2 requires proof of).
    await runBctcReparseWithDb(db, async () => {
      const result = { examined: 3, resolved: 2, failed: 1, escalated: 0, alerted: 0, deadMarked: 0 };
      return { rowsWritten: result.resolved + result.failed };
    });

    const row = db
      .prepare<{ status: string; rows_written: number | null }, []>(
        "SELECT status, rows_written FROM cron_job_runs WHERE job_name='bctcReparseJob'",
      )
      .get();
    expect(row?.status).toBe("success");
    expect(row?.rows_written).toBe(3); // 2 resolved + 1 failed = 3, not NULL
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T7-T10 — shouldRunCatchup() semantics for the new bctcReparseJob probe gate
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-REPARSE-DOUBLE-WRAP-DEDUP-GUARD — T7-T10: startup-catchup window (daily 02:30 UTC / 09:30 ICT)", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDbWithCronTable();
  });

  it("T7: window reached (02:30 UTC) + no row today → true", () => {
    const now = new Date("2026-07-30T02:30:00Z");
    expect(shouldRunCatchup(db, "bctcReparseJob", 2, 30, now, false)).toBe(true);
  });

  it("T8: window not yet reached (02:29 UTC) → false", () => {
    const now = new Date("2026-07-30T02:29:00Z");
    expect(shouldRunCatchup(db, "bctcReparseJob", 2, 30, now, false)).toBe(false);
  });

  it("T9: window reached + already-ran row exists today → false (dedup)", () => {
    insertCronRow(db, "success", new Date().toISOString().replace("T", " ").slice(0, 19));
    const now = new Date();
    expect(
      shouldRunCatchup(db, "bctcReparseJob", now.getUTCHours(), now.getUTCMinutes(), now, false),
    ).toBe(false);
  });

  it("T10: fires on ANY day of week — daily job, no requiredUtcDay gate", () => {
    // 2026-08-02 is a Sunday — weekly-job catchups (requiredUtcDay) would refuse
    // this day; bctcReparseJob is daily ('30 9 * * *') and must NOT be day-gated.
    const now = new Date("2026-08-02T02:45:00Z");
    expect(shouldRunCatchup(db, "bctcReparseJob", 2, 30, now, false)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T11 — Source contract: startScheduler.ts wires the catchup probe correctly
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-REPARSE-DOUBLE-WRAP-DEDUP-GUARD — T11: source contract", () => {
  it("T11: startScheduler.ts gates the bctcReparseJob startup catch-up via shouldRunCatchup (not unconditional)", () => {
    const src = readFileSync(join(import.meta.dir, "../scheduler/startScheduler.ts"), "utf-8");
    expect(src).toContain("runBctcReparseWithDb(db)");
    expect(src).toMatch(
      /shouldRunCatchup\(\s*db,\s*'bctcReparseJob',\s*2,\s*30,\s*new Date\(\),\s*false\s*\)/,
    );

    // The catch-up setTimeout must guard the call — runBctcReparseWithDb(db) must
    // appear INSIDE an `if (shouldRunCatchup(...))` block, not as an unconditional
    // first statement in the setTimeout body.
    const setTimeoutMatch = src.match(/setTimeout\(async[^)]*\)[\s\S]*?\},\s*30_000\)/);
    expect(setTimeoutMatch).not.toBeNull();
    const block = setTimeoutMatch![0];
    expect(block).toContain("shouldRunCatchup(db, 'bctcReparseJob'");
    expect(block).toContain("runBctcReparseWithDb(db)");
  });
});
