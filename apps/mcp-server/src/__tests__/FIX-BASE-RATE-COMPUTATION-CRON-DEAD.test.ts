/**
 * FIX-BASE-RATE-COMPUTATION-CRON-DEAD — baseRateComputationJob ~20-25d stale
 * (evidence_likelihood_ratios last real write 2026-06-28; daily cron running
 * "success" every day since but writing 0 rows).
 *
 * RAW-verified live (docker exec against the production named-volume market.db,
 * 2026-07-23) — TWO distinct findings:
 *
 * 1. GENUINE, REACHABLE BUG (fixed here): `runBaseRateComputationWithDb`
 *    (startupHelpers.ts) wrapped `recordJobRun(db, 'baseRateComputationJob', fn)`
 *    around a default `fn` that called `runBaseRateComputationJob()`
 *    (baseRateComputationJob.ts) — which ITSELF calls `recordJobRun(db,
 *    "baseRateComputationJob", ...)` internally. Exact "double-wrap" anti-pattern
 *    already diagnosed+fixed for `runEvidenceAccumulatorWithDb` (see
 *    EVIDENCE-ACCUM-SILENT-CRON.test.ts) but never applied here. Live proof: 2-3
 *    `cron_job_runs` rows per single daily tick (ids 137899/137900/137902 on
 *    07-19 through 151740/151741/151743 on 07-23) — 1-2 noisy `rows_written=NULL`
 *    rows alongside the 1 real-result row, every day. Correctness was NOT broken
 *    (the T4 dedup guard already no-op'd the second physical tick's real work)
 *    but observability was — a naive reader of `cron_job_runs` sees inflated/
 *    misleading run counts and could mistake a NULL row for "did nothing".
 *
 * 2. UPSTREAM DEPENDENCY GAP (flagged, NOT fixed here — out of zone/scope for a
 *    single S-size task, already tracked): `evidence_fragments` (baseRate's SOLE
 *    input) had a ~21-day silent gap (2026-06-28..07-19) coinciding with a
 *    documented ~19-day restart-storm (see FIX-CRON-SUNDAY-STARTUP-CATCHUP
 *    comment in startScheduler.ts: "the ~19-day server outage happened to end
 *    2026-07-19T12:31Z"; mcpServerStartup recorded 28 boots across 06-28..07-19).
 *    `evidence_fragments` has since recovered (239 rows, earliest 2026-07-19,
 *    fresh through 07-23) but is not yet old enough to clear the job's minimum
 *    5-day resolvability horizon, so `triplesUpserted=0` today is HONEST, not
 *    fabricated. Root-cause of the upstream gap itself is already tracked under
 *    the still-open `FIX-EVIDENCE-PIPELINE-STARVED` backlog row.
 *
 *    Same restart-timing mechanism ALSO explains the outer symptom directly:
 *    baseRateComputationJob's OWN cron_job_runs history shows a real
 *    (rows_written=2) success on 2026-06-28 19:07 UTC, then ZERO rows of any
 *    kind — not even a failed attempt — until 2026-07-19 19:07 UTC. Fixed here
 *    (finding 3 below) with the same defensive startup-catchup probe already
 *    shipped for 5 sibling jobs hit by this exact class
 *    (FIX-CRON-SUNDAY-STARTUP-CATCHUP / FIX-CRON-SSCCHECKERJOB-DEAD-87D item 2).
 *
 * 3. RELIABILITY FIX (fixed here): baseRateComputationJob had no startup-catchup
 *    probe, unlike morningBriefingJob/eveningSummaryJob/franceSummaryJob/
 *    alertDigestJob/summaryJob:daily/dataAuditJob:weekly — added one in
 *    startScheduler.ts using the same shouldRunCatchup() mechanism.
 *
 * Coverage:
 *   T1. Single execution writes exactly ONE cron_job_runs row (double-wrap fixed).
 *   T2. The single row carries the real result (status=success, rows_written=N).
 *   T3. Dedup: fn is NOT called when a success row already exists within the
 *       90%-of-cadence window (T4 guard, replicated into this wrapper).
 *   T4. Dedup: no second cron_job_runs row written on a same-window double-fire.
 *   T5. A stale (>21.6h old) prior success does NOT block a fresh run.
 *   T6. fn default calls runBaseRateComputation(db) directly — single-wrap proof.
 *   T7-T10. shouldRunCatchup() semantics for baseRateComputationJob's daily
 *       19:07 UTC window (window-reached / window-not-reached / dedup / any day).
 *   T11. Source contract — startScheduler.ts wires the baseRateComputationJob
 *        catchup probe via runBaseRateComputationWithDb (not double-wrapped
 *        through jobRunRepo.wrapRun).
 */

// Isolation guard: apps/mcp-server/src/__tests__/034-telegram-notifier.test.ts /
// 1298b-imf-infra.test.ts / 084-tool-market.test.ts document the same class of
// defect — Bun's `mock.module()` is PROCESS-GLOBAL and persists across test
// FILES (not just within the file that called it); FACTORY-SCHEDULER-job-table-
// registry.test.ts calls `mock.module("../scheduler/startupHelpers.js", ...)`
// (stubbing shouldRunCatchup -> () => false and every run*WithDb -> async () =>
// {}) inside its Group B/C/D tests and never restores it. RAW-confirmed live in
// this task: a plain `import { shouldRunCatchup } from "../scheduler/jobs.js"`
// silently resolves to that stub whenever this file runs in the same `bun test`
// process after FACTORY-SCHEDULER's tests fire — same established workaround as
// 034/1298b/084: bypass the mock cache with a `?isolate=` query-busted dynamic
// import of the REAL module, resolved once at module load.
const _real = await import(
  Bun.resolveSync("../scheduler/startupHelpers.js", import.meta.dir) +
    "?isolate=FIX-BASE-RATE-COMPUTATION-CRON-DEAD"
);
const runBaseRateComputationWithDb: typeof import("../scheduler/startupHelpers.js").runBaseRateComputationWithDb =
  _real.runBaseRateComputationWithDb;
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
     VALUES ('baseRateComputationJob', ?, ?)`,
  ).run(ts, status);
}

// ─────────────────────────────────────────────────────────────────────────────
// T1/T2 — Single execution writes exactly ONE cron_job_runs row
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BASE-RATE-COMPUTATION-CRON-DEAD — T1/T2: double-wrap fixed", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDbWithCronTable();
  });

  it("T1: writes exactly one cron_job_runs row (double-wrap regression: was 2-3 rows live)", async () => {
    let callCount = 0;
    await runBaseRateComputationWithDb(db, async () => {
      callCount++;
      return { rowsWritten: 4 };
    });

    const rows = db
      .prepare<{ cnt: number }, []>(
        "SELECT COUNT(*) AS cnt FROM cron_job_runs WHERE job_name='baseRateComputationJob'",
      )
      .get();
    expect(rows?.cnt).toBe(1);
    expect(callCount).toBe(1);
  });

  it("T2: the single row carries the real result (status=success, rows_written=N)", async () => {
    await runBaseRateComputationWithDb(db, async () => ({ rowsWritten: 7 }));

    const row = db
      .prepare<{ status: string; rows_written: number | null }, []>(
        "SELECT status, rows_written FROM cron_job_runs WHERE job_name='baseRateComputationJob'",
      )
      .get();
    expect(row?.status).toBe("success");
    expect(row?.rows_written).toBe(7);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T3/T4 — Dedup: recent success blocks a same-window double fire
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BASE-RATE-COMPUTATION-CRON-DEAD — T3/T4: T4 dedup guard replicated in wrapper", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDbWithCronTable();
  });

  it("T3: fn is NOT called when a success row exists within the cadence window (just now)", async () => {
    insertCronRow(db, "success");

    let callCount = 0;
    await runBaseRateComputationWithDb(db, async () => {
      callCount++;
      return { rowsWritten: 1 };
    });

    expect(callCount).toBe(0);
  });

  it("T4: no second cron_job_runs row written on a same-window double fire", async () => {
    insertCronRow(db, "success");

    await runBaseRateComputationWithDb(db, async () => ({ rowsWritten: 1 }));

    const rows = db
      .prepare<{ cnt: number }, []>(
        "SELECT COUNT(*) AS cnt FROM cron_job_runs WHERE job_name='baseRateComputationJob'",
      )
      .get();
    // Still just the pre-existing row — no NULL/duplicate row from a skipped attempt.
    expect(rows?.cnt).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T5 — Stale prior success does not block a fresh run
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BASE-RATE-COMPUTATION-CRON-DEAD — T5: cross-cadence-window boundary", () => {
  it("T5: a success row older than 90% of the daily cadence (21.6h) does NOT block today's run", async () => {
    const db = makeDbWithCronTable();
    // 30 hours ago — well outside the 21.6h dedup window.
    const oldTs = new Date(Date.now() - 30 * 60 * 60 * 1000)
      .toISOString()
      .replace("T", " ")
      .slice(0, 19);
    insertCronRow(db, "success", oldTs);

    let callCount = 0;
    await runBaseRateComputationWithDb(db, async () => {
      callCount++;
      return { rowsWritten: 2 };
    });

    expect(callCount).toBe(1);
    const rows = db
      .prepare<{ cnt: number }, []>(
        "SELECT COUNT(*) AS cnt FROM cron_job_runs WHERE job_name='baseRateComputationJob'",
      )
      .get();
    expect(rows?.cnt).toBe(2); // old row + fresh row
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T6 — Single-wrap proof: default fn calls the core function directly
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BASE-RATE-COMPUTATION-CRON-DEAD — T6: default fn is single-wrap", () => {
  it("T6: with zero evidence_fragments (real core logic), reports triplesUpserted=0 honestly, one row only", async () => {
    const db = makeDbWithCronTable();
    // Real schema tables the core runBaseRateComputation() queries — empty on purpose.
    db.exec(`
      CREATE TABLE evidence_fragments (
        id INTEGER PRIMARY KEY AUTOINCREMENT, stock TEXT, evidence_type TEXT,
        direction TEXT, timestamp TEXT
      )
    `);
    db.exec(`
      CREATE TABLE evidence_likelihood_ratios (
        id INTEGER PRIMARY KEY AUTOINCREMENT, evidence_type TEXT, direction TEXT,
        horizon_days INTEGER, likelihood_ratio REAL, sample_size INTEGER, last_updated TEXT,
        UNIQUE(evidence_type, direction, horizon_days)
      )
    `);
    db.exec(`CREATE TABLE daily_ohlcv (code TEXT, date TEXT, close REAL)`);

    // Exercise the REAL default fn (no injected fn) — proves single-wrap end-to-end.
    await runBaseRateComputationWithDb(db);

    const row = db
      .prepare<{ status: string; rows_written: number | null }, []>(
        "SELECT status, rows_written FROM cron_job_runs WHERE job_name='baseRateComputationJob'",
      )
      .get();
    expect(row?.status).toBe("success");
    expect(row?.rows_written).toBe(0); // honest zero — no fragments to process
    const rows = db
      .prepare<{ cnt: number }, []>(
        "SELECT COUNT(*) AS cnt FROM cron_job_runs WHERE job_name='baseRateComputationJob'",
      )
      .get();
    expect(rows?.cnt).toBe(1); // not 2 — no self-recording inner Job() call
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T7-T10 — shouldRunCatchup() semantics for the new baseRateComputationJob probe
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BASE-RATE-COMPUTATION-CRON-DEAD — T7-T10: startup-catchup window (daily 19:07 UTC)", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDbWithCronTable();
  });

  it("T7: window reached (19:07 UTC) + no row today → true", () => {
    const now = new Date("2026-07-25T19:07:00Z");
    expect(shouldRunCatchup(db, "baseRateComputationJob", 19, 7, now, false)).toBe(true);
  });

  it("T8: window not yet reached (19:06 UTC) → false", () => {
    const now = new Date("2026-07-25T19:06:00Z");
    expect(shouldRunCatchup(db, "baseRateComputationJob", 19, 7, now, false)).toBe(false);
  });

  it("T9: window reached + already-ran row exists today → false (dedup)", () => {
    insertCronRow(db, "success", new Date().toISOString().replace("T", " ").slice(0, 19));
    const now = new Date();
    expect(
      shouldRunCatchup(db, "baseRateComputationJob", now.getUTCHours(), now.getUTCMinutes(), now, false),
    ).toBe(false);
  });

  it("T10: fires on ANY day of week — daily job, no requiredUtcDay gate (unlike the weekly siblings)", () => {
    // 2026-07-26 is a Sunday — weekly-job catchups (requiredUtcDay) would refuse
    // this day; baseRateComputationJob is daily and must NOT be day-gated.
    const now = new Date("2026-07-26T19:30:00Z");
    expect(shouldRunCatchup(db, "baseRateComputationJob", 19, 7, now, false)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T11 — Source contract: startScheduler.ts wires the catchup probe correctly
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BASE-RATE-COMPUTATION-CRON-DEAD — T11: source contract", () => {
  it("T11: startScheduler.ts wires baseRateComputationJob catchup via runBaseRateComputationWithDb (not double-wrapped)", () => {
    const src = readFileSync(join(import.meta.dir, "../scheduler/startScheduler.ts"), "utf-8");
    expect(src).toContain("runBaseRateComputationWithDb");
    expect(src).toContain("'baseRateComputationJob'");
    expect(src).toMatch(
      /shouldRunCatchup\(\s*db,\s*'baseRateComputationJob',\s*19,\s*7,\s*new Date\(\),\s*false\s*\)/,
    );
    // Must NOT be wrapped a second time via jobRunRepo.wrapRun('baseRateComputationJob', ...)
    // — that would reintroduce the double-recordJobRun bug this task fixed.
    expect(src).not.toMatch(/jobRunRepo\.wrapRun\(\s*'baseRateComputationJob'/);
  });
});
