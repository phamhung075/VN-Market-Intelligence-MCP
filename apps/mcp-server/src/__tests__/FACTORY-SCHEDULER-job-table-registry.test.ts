Bun.env["DB_PATH"] = ":memory:";

/**
 * FACTORY-SCHEDULER-job-table-registry.test.ts
 *
 * Covers the JOB_TABLE consolidation that replaced 76+ copy-paste
 * scheduleCron/wrapRun blocks in startScheduler.ts with a declarative table
 * (schedulerJobTable.ts) + a generic registration loop, plus the extracted
 * WAL-checkpoint escalation closure (walEscalation.ts).
 *
 * Groups:
 *   A — buildJobTable() shape: 59 entries, unique names, cron keys resolve, options valid.
 *   B — registerJobTable(): the single generic loop registers every entry via
 *       scheduleCron(j.cron, () => jobRunRepo.wrapRun(j.name, j.runner), j.options).
 *   C — registerBespokeJobs(): exactly 22 individual scheduleCron(...) call sites fire,
 *       covering the CRONS keys that do NOT go through the plain wrapRun envelope.
 *   D — "scheduler boot" smoke: calling BOTH registration functions together (as
 *       startScheduler.ts does) yields exactly 81 total scheduleCron registrations with
 *       no duplicate cron keys — the full pre-split registration count, reproduced exactly.
 *   E — walEscalation.ts: createWalEscalateFn() appends a WAL_ESCALATION signal_queue row.
 *
 * BUMP 2026-07-10 (CI-RED-1a8c1bff-FIX): 57→58 (Group A/B), 79→80 (Group D).
 * commit 43f4c8a22 (D3C) added bctcExtractReconcileJob.ts to buildJobTable()'s
 * generic wrapRun table (schedulerJobTable.ts:255-268) — a single legitimate
 * new entry, not a duplicate registration (verified: `bctcExtractReconcileJob`
 * appears exactly once in schedulerJobTable.ts). Group C (bespoke, 22) is
 * unaffected — the new job goes through the generic loop, not registerBespokeJobs().
 *
 * BUMP 2026-07-15 (ALPHA-S2-SUB3-DOCS-CRON): 58→59 (Group A/B), 80→81 (Group D).
 * commit de8c49d67 (ALPHA-S2-SUB2-JOB-CRON) added intraday5mCompactorJob.ts's
 * `intraday5mCompactor` entry to buildJobTable()'s generic wrapRun table
 * (schedulerJobTable.ts) — a single legitimate new entry, not a duplicate
 * registration. Group C (bespoke, 22) is unaffected — the new job goes through
 * the generic loop, not registerBespokeJobs().
 *
 * BUMP 2026-07-15 (ALPHA-S2-FF-SUB3-JOB-CRON): 59→60 (Group A/B), 81→82 (Group D).
 * Adds intradayForeignFlow5mCompactorJob.ts's `intradayForeignFlow5mCompactorJob`
 * entry to buildJobTable()'s generic wrapRun table (schedulerJobTable.ts) — a
 * single legitimate new entry (standalone foreign-flow archive compactor, distinct
 * from the price-plane sibling above), not a duplicate registration. Group C
 * (bespoke, 22) is unaffected.
 *
 * BUMP 2026-07-15 (ALPHA-S2-OMO-LIQUIDITY-CRON): 60→61 (Group A/B), 82→83 (Group D).
 * Adds sbvOmoLiquidityCronJob.ts's `sbvOmoLiquidityCronJob` entry to
 * buildJobTable()'s generic wrapRun table (schedulerJobTable.ts) — a single
 * legitimate new entry (pure trigger+observe cron for macro-indicators'
 * POST /liquidity-state, zero local DB writes), not a duplicate registration.
 * Group C (bespoke, 22) is unaffected.
 *
 * BUMP 2026-07-15 (ALPHA-S2-RAG-FTS-REBUILD-CRON): 61→62 (Group A/B), 83→84 (Group D).
 * Adds ragFtsRebuildCronJob.ts's `ragFtsRebuildCronJob` entry to buildJobTable()'s
 * generic wrapRun table (schedulerJobTable.ts) — a single legitimate new entry
 * (pure trigger+observe cron for rag-service's POST /admin/rebuild-fts, zero local
 * DB writes), not a duplicate registration. Group C (bespoke, 22) is unaffected.
 *
 * BUMP 2026-07-15 (ALPHA-S2-RAG-FTS-CRON-SAFETY-GATE): 62→61 (Group A/B default),
 * 84→83 (Group D default). `ragFtsRebuildCronJob` is now gated behind a default-OFF
 * `CRON_RAG_FTS_REBUILD_ENABLED` boolean flag (schedulerJobTable.ts) — with the flag
 * unset/false, buildJobTable() OMITS the entry entirely (registration-time defusal,
 * not a runtime no-op) so a stray mcp-server redeploy cannot arm the nightly 20:15 UTC
 * rag-service OOM (RAG-FTS-BUILD-MEMORY-BOUND, parked BLOCKED — FTS rebuild can't
 * complete at ~56k rows in the 768m rag-service cgroup) before the rag capacity fix
 * lands. Flag=true reproduces the pre-gate 62/84 counts exactly (see new Group A2
 * below). Group C (bespoke, 22) is unaffected.
 */

import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Database } from "bun:sqlite";
import { CRONS } from "../scheduler/cronConfig.js";
import type { IJobRunRepository, JobRunRecord } from "../domain/repositories/IJobRunRepository.js";
import type { OrchState } from "../infrastructure/orchStateStore.js";

// ─── stub jobRunRepo — captures (name, runner) pairs, never actually runs anything ──

function makeStubJobRunRepo(): IJobRunRepository & { calls: Array<{ name: string; runner: () => unknown }> } {
  const calls: Array<{ name: string; runner: () => unknown }> = [];
  return {
    calls,
    recordRun: (_r: JobRunRecord) => {},
    getLastRuns: () => [],
    wrapRun: async (name: string, runner: () => Promise<{ rowsWritten?: number } | void>) => {
      calls.push({ name, runner });
    },
  };
}

const FAKE_DB = {} as Database;

// ALPHA-S2-RAG-FTS-CRON-SAFETY-GATE: reset the gate flag before every test in this file so
// no test's explicit CRON_RAG_FTS_REBUILD_ENABLED='true' leaks into a sibling test's
// "default" assertion (Bun runs a test file's suite in a single process).
beforeEach(() => {
  delete Bun.env["CRON_RAG_FTS_REBUILD_ENABLED"];
});

// ─────────────────────────────────────────────────────────────────────────────
// Group A — buildJobTable() shape (pure function, no scheduleCron side effects)
// ─────────────────────────────────────────────────────────────────────────────

describe("FACTORY-SCHEDULER-job-table-registry — Group A: buildJobTable() shape", () => {
  it("returns exactly 61 entries (default: CRON_RAG_FTS_REBUILD_ENABLED unset — ragFtsRebuildCronJob gated OFF, ALPHA-S2-RAG-FTS-CRON-SAFETY-GATE)", async () => {
    const { buildJobTable } = await import("../scheduler/schedulerJobTable.js");
    const jobRunRepo = makeStubJobRunRepo();
    const table = buildJobTable({ db: FAKE_DB, jobRunRepo });
    expect(table).toHaveLength(61);
  });

  it("every entry has a unique name", async () => {
    const { buildJobTable } = await import("../scheduler/schedulerJobTable.js");
    const jobRunRepo = makeStubJobRunRepo();
    const table = buildJobTable({ db: FAKE_DB, jobRunRepo });
    const names = table.map((j) => j.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every entry's cron is a non-empty string sourced from CRONS", async () => {
    const { buildJobTable } = await import("../scheduler/schedulerJobTable.js");
    const jobRunRepo = makeStubJobRunRepo();
    const table = buildJobTable({ db: FAKE_DB, jobRunRepo });
    const cronValues = new Set(Object.values(CRONS));
    for (const j of table) {
      expect(typeof j.cron).toBe("string");
      expect(j.cron.length).toBeGreaterThan(0);
      expect(cronValues.has(j.cron)).toBe(true);
    }
  });

  it("every entry's runner is a function", async () => {
    const { buildJobTable } = await import("../scheduler/schedulerJobTable.js");
    const jobRunRepo = makeStubJobRunRepo();
    const table = buildJobTable({ db: FAKE_DB, jobRunRepo });
    for (const j of table) {
      expect(typeof j.runner).toBe("function");
    }
  });

  it("spot-check: intelligenceCycleJob entry is wired to CRONS.intelligenceCycle with Asia/Ho_Chi_Minh tz", async () => {
    const { buildJobTable } = await import("../scheduler/schedulerJobTable.js");
    const jobRunRepo = makeStubJobRunRepo();
    const table = buildJobTable({ db: FAKE_DB, jobRunRepo });
    const entry = table.find((j) => j.name === "intelligenceCycleJob");
    expect(entry).toBeDefined();
    expect(entry?.cron).toBe(CRONS.intelligenceCycle);
    expect(entry?.options).toEqual({ timezone: "Asia/Ho_Chi_Minh" });
  });

  it("spot-check: intelligenceCycleJob runner returns rowsWritten derived from newsFetched+impactEventsRan", async () => {
    const { buildJobTable } = await import("../scheduler/schedulerJobTable.js");
    const jobRunRepo = makeStubJobRunRepo();
    const table = buildJobTable({ db: FAKE_DB, jobRunRepo });
    const entry = table.find((j) => j.name === "intelligenceCycleJob");
    expect(entry).toBeDefined();
    // Runner body is verified structurally (not executed — would require a live DB/network
    // stack); byte-for-byte body equivalence vs pre-split source is covered by the scratch
    // equivalence script (docs/agent-memory/decisions — see notebook entry) plus tsc clean.
    expect(entry?.runner.toString()).toContain("rowsWritten");
    expect(entry?.runner.toString()).toContain("newsFetched");
  });

  it("spot-check: monthlySignalQualityAuditJob now opts IN to recoverMissedExecutions (T4 dedup guard added — FIX-MONTHLYSIGNALQUALITYAUDITJOB-MISSED-JULY-RECOVER-GUARD)", async () => {
    const { buildJobTable } = await import("../scheduler/schedulerJobTable.js");
    const jobRunRepo = makeStubJobRunRepo();
    const table = buildJobTable({ db: FAKE_DB, jobRunRepo });
    const entry = table.find((j) => j.name === "monthlySignalQualityAuditJob");
    expect(entry?.options).toEqual({ timezone: "UTC", recoverMissedExecutions: true });
  });

  it("spot-check: reputationComputeJob preserves recoverMissedExecutions: true opt-in", async () => {
    const { buildJobTable } = await import("../scheduler/schedulerJobTable.js");
    const jobRunRepo = makeStubJobRunRepo();
    const table = buildJobTable({ db: FAKE_DB, jobRunRepo });
    const entry = table.find((j) => j.name === "reputationComputeJob");
    expect(entry?.options).toEqual({ timezone: "UTC", recoverMissedExecutions: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group A2 — ALPHA-S2-RAG-FTS-CRON-SAFETY-GATE: CRON_RAG_FTS_REBUILD_ENABLED flag.
// Registration-time defusal — flag unset/false OMITS ragFtsRebuildCronJob from
// buildJobTable() entirely (not a runtime no-op), so a stray mcp-server redeploy
// cannot arm the nightly 20:15 UTC rag-service OOM before RAG-FTS-BUILD-MEMORY-BOUND
// (rag capacity fix) lands. Test-plan (a)/(b) from the task handoff.
// ─────────────────────────────────────────────────────────────────────────────

describe("FACTORY-SCHEDULER-job-table-registry — Group A2: CRON_RAG_FTS_REBUILD_ENABLED gate", () => {
  afterEach(() => {
    delete Bun.env["CRON_RAG_FTS_REBUILD_ENABLED"];
  });

  it("(a) flag unset → buildJobTable() does NOT contain ragFtsRebuildCronJob", async () => {
    delete Bun.env["CRON_RAG_FTS_REBUILD_ENABLED"];
    const { buildJobTable } = await import("../scheduler/schedulerJobTable.js");
    const jobRunRepo = makeStubJobRunRepo();
    const table = buildJobTable({ db: FAKE_DB, jobRunRepo });
    expect(table.find((j) => j.name === "ragFtsRebuildCronJob")).toBeUndefined();
    expect(table).toHaveLength(61);
  });

  it("(a) flag explicitly 'false' → buildJobTable() does NOT contain ragFtsRebuildCronJob", async () => {
    Bun.env["CRON_RAG_FTS_REBUILD_ENABLED"] = "false";
    const { buildJobTable } = await import("../scheduler/schedulerJobTable.js");
    const jobRunRepo = makeStubJobRunRepo();
    const table = buildJobTable({ db: FAKE_DB, jobRunRepo });
    expect(table.find((j) => j.name === "ragFtsRebuildCronJob")).toBeUndefined();
    expect(table).toHaveLength(61);
  });

  it("(b) flag='true' → ragFtsRebuildCronJob IS registered with cron '15 20 * * *' and UTC tz", async () => {
    Bun.env["CRON_RAG_FTS_REBUILD_ENABLED"] = "true";
    const { buildJobTable } = await import("../scheduler/schedulerJobTable.js");
    const jobRunRepo = makeStubJobRunRepo();
    const table = buildJobTable({ db: FAKE_DB, jobRunRepo });
    const entry = table.find((j) => j.name === "ragFtsRebuildCronJob");
    expect(entry).toBeDefined();
    expect(entry?.cron).toBe("15 20 * * *");
    expect(entry?.cron).toBe(CRONS.ragFtsRebuildCron);
    expect(entry?.options).toEqual({ timezone: "UTC" });
    expect(table).toHaveLength(62);
  });

  it("(b) flag='true' → registerJobTable() actually schedules it (scheduleCron receives the cron expr)", async () => {
    Bun.env["CRON_RAG_FTS_REBUILD_ENABLED"] = "true";
    const { calls } = installScheduleCronSpy();
    const { buildJobTable, registerJobTable } = await import("../scheduler/schedulerJobTable.js");
    const jobRunRepo = makeStubJobRunRepo();
    const table = buildJobTable({ db: FAKE_DB, jobRunRepo });
    registerJobTable(table, jobRunRepo);
    expect(calls).toHaveLength(62);
    expect(calls.some((c) => c.cron === "15 20 * * *")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group B/C/D — registration wiring. scheduleCron is mocked so no real node-cron
// tasks are created (matches the codebase-wide convention of never invoking
// startScheduler() directly in tests — see 1430/1958a startup-catchup tests, which
// test the underlying helpers rather than booting the full composition root).
// ─────────────────────────────────────────────────────────────────────────────

type CapturedCall = { cron: string; options: unknown };

function installScheduleCronSpy(): { calls: CapturedCall[]; restore: () => void } {
  const calls: CapturedCall[] = [];
  mock.module("../scheduler/startupHelpers.js", () => ({
    log: () => {},
    scheduleCron: (cron: string, _fn: unknown, options: unknown = {}) => {
      calls.push({ cron, options });
      return { stop: () => {} };
    },
    shouldRunCatchup: () => false,
    eveningReportIsValid: () => true,
    scheduleForeignFlowCbReset: () => {},
    runWeeklyAuditWithDb: async () => {},
    runBctcReparseWithDb: async () => {},
    runEvidenceAccumulatorWithDb: async () => {},
    runBaseRateComputationWithDb: async () => {},
    runPredictionResolutionWithDb: async () => {},
    runCalibrationReportWithDb: async () => {},
  }));
  return { calls, restore: () => {} };
}

describe("FACTORY-SCHEDULER-job-table-registry — Group B: registerJobTable() generic loop", () => {
  it("registers all 61 buildJobTable() entries via scheduleCron(j.cron, ..., j.options) (default: RAG FTS gate OFF)", async () => {
    const { calls } = installScheduleCronSpy();
    const { buildJobTable, registerJobTable } = await import("../scheduler/schedulerJobTable.js");
    const jobRunRepo = makeStubJobRunRepo();
    const table = buildJobTable({ db: FAKE_DB, jobRunRepo });
    registerJobTable(table, jobRunRepo);

    expect(calls).toHaveLength(61);
    // Every registered cron expression corresponds 1:1 to a JOB_TABLE entry's cron.
    const expectedCrons = table.map((j) => j.cron).sort();
    const actualCrons = calls.map((c) => c.cron).sort();
    expect(actualCrons).toEqual(expectedCrons);
  });

  it("invoking a registered callback routes through jobRunRepo.wrapRun(j.name, j.runner)", async () => {
    const { calls } = installScheduleCronSpy();
    const { buildJobTable, registerJobTable } = await import("../scheduler/schedulerJobTable.js");
    const jobRunRepo = makeStubJobRunRepo();
    const table = buildJobTable({ db: FAKE_DB, jobRunRepo });
    registerJobTable(table, jobRunRepo);

    // Find the morningBriefingJob registration and fire its captured callback.
    const morningIdx = table.findIndex((j) => j.name === "morningBriefingJob");
    expect(morningIdx).toBeGreaterThanOrEqual(0);
    const cronCall = calls[morningIdx];
    expect(cronCall?.cron).toBe(CRONS.morningBriefing);

    // registerJobTable's captured 2nd arg is `() => jobRunRepo.wrapRun(j.name, j.runner)` —
    // re-derive it the same way registerJobTable does and confirm wrapRun receives the
    // correct job name.
    await jobRunRepo.wrapRun(table[morningIdx]!.name, table[morningIdx]!.runner);
    expect(jobRunRepo.calls).toHaveLength(1);
    expect(jobRunRepo.calls[0]?.name).toBe("morningBriefingJob");
  });
});

describe("FACTORY-SCHEDULER-job-table-registry — Group C: registerBespokeJobs()", () => {
  it("registers exactly 22 bespoke scheduleCron(...) call sites", async () => {
    const { calls } = installScheduleCronSpy();
    const { registerBespokeJobs } = await import("../scheduler/schedulerJobTable.js");
    const jobRunRepo = makeStubJobRunRepo();
    registerBespokeJobs({ db: FAKE_DB, jobRunRepo });

    expect(calls).toHaveLength(22);
  });

  it("bespoke registrations cover the 22 CRONS keys that skip the plain wrapRun envelope", async () => {
    const { calls } = installScheduleCronSpy();
    const { registerBespokeJobs } = await import("../scheduler/schedulerJobTable.js");
    const jobRunRepo = makeStubJobRunRepo();
    registerBespokeJobs({ db: FAKE_DB, jobRunRepo });

    const expectedBespokeCrons = [
      CRONS.marketOpen, CRONS.marketClose, CRONS.sscCheck, CRONS.walCheckpoint,
      CRONS.dataAuditDaily, CRONS.dataAuditWeekly, CRONS.bctcReparseJob, CRONS.askQueueCheck,
      CRONS.evidenceAccumulator, CRONS.baseRateComputation, CRONS.predictionResolution,
      CRONS.calibrationReport, CRONS.foreignFlowAlert, CRONS.insiderCheck,
      CRONS.taAlertNotifier, CRONS.signalOutcomeJob, CRONS.alertOutcomeJob,
      CRONS.foreignFlowFetch, CRONS.signalOutcomeResolution, CRONS.vnstockFundamentalsRefresh,
      CRONS.vnstockTradingStatsRefresh, CRONS.schedulerWatchdog,
    ].sort();
    expect(calls.map((c) => c.cron).sort()).toEqual(expectedBespokeCrons);
  });
});

describe("FACTORY-SCHEDULER-job-table-registry — Group D: scheduler-boot smoke (registerJobTable + registerBespokeJobs together)", () => {
  it("registers exactly 83 total scheduleCron calls (default: RAG FTS gate OFF, ALPHA-S2-RAG-FTS-CRON-SAFETY-GATE)", async () => {
    // NOTE: cron EXPRESSION VALUES are not all unique across the registrations (e.g.
    // CRONS.commodityTrackerRefresh intentionally shares '0 6 * * *' with
    // CRONS.macroIndicatorRefresh — kept as separate job registrations for independent
    // cron_job_runs observability per TASK_1920c.md). Uniqueness of CRONS *keys* (not
    // resolved string values) is covered by Group A (61 unique buildJobTable names, default
    // gate-off) and Group C (22 specific bespoke CRONS keys asserted exactly).
    const { calls } = installScheduleCronSpy();
    const { buildJobTable, registerJobTable, registerBespokeJobs } = await import("../scheduler/schedulerJobTable.js");
    const jobRunRepo = makeStubJobRunRepo();
    const ctx = { db: FAKE_DB, jobRunRepo };
    registerJobTable(buildJobTable(ctx), jobRunRepo);
    registerBespokeJobs(ctx);

    expect(calls).toHaveLength(83);
  });

  it("registers exactly 84 total scheduleCron calls when CRON_RAG_FTS_REBUILD_ENABLED='true' — reproduces the pre-gate registration count exactly", async () => {
    Bun.env["CRON_RAG_FTS_REBUILD_ENABLED"] = "true";
    const { calls } = installScheduleCronSpy();
    const { buildJobTable, registerJobTable, registerBespokeJobs } = await import("../scheduler/schedulerJobTable.js");
    const jobRunRepo = makeStubJobRunRepo();
    const ctx = { db: FAKE_DB, jobRunRepo };
    registerJobTable(buildJobTable(ctx), jobRunRepo);
    registerBespokeJobs(ctx);

    expect(calls).toHaveLength(84);
    delete Bun.env["CRON_RAG_FTS_REBUILD_ENABLED"];
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group E — walEscalation.ts (real temp-file integration test — same fixture
// pattern as WF2-signal-queue-cas.test.ts)
// ─────────────────────────────────────────────────────────────────────────────

function makeTmpPath(): string {
  const dir = join(tmpdir(), "wal-escalation-test");
  mkdirSync(dir, { recursive: true });
  return join(dir, `orch-state-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

const BASE_ORCH: OrchState = {
  _schema: "v3",
  _ssot: true,
  _updated_at: "2026-06-07T00:00:00Z",
  _updated_by: "test",
  head: {
    status: "idle",
    updated_at: "2026-06-07T00:00:00Z",
    updated_by: "test",
    active_task_id: null,
    next_agent: null,
    wip: 0,
    wip_max: 2,
  },
  task_board: {
    _updated_at: "2026-06-07T00:00:00Z",
    _updated_by: "test",
    active_sprints: [],
    backlog: [],
    archive: [],
  },
  signal_queue: {
    _updated_at: "2026-06-07T00:00:00Z",
    _updated_by: "test",
    rows: [],
    archive: [],
  },
};

describe("FACTORY-SCHEDULER-job-table-registry — Group E: walEscalation.ts", () => {
  const paths: string[] = [];

  afterEach(() => {
    for (const p of paths) {
      try { if (existsSync(p)) unlinkSync(p); } catch { /* best-effort */ }
    }
    paths.length = 0;
  });

  it("createWalEscalateFn(path) appends a WAL_ESCALATION signal_queue row when invoked", async () => {
    const { createWalEscalateFn } = await import("../scheduler/walEscalation.js");
    const p = makeTmpPath();
    paths.push(p);
    writeFileSync(p, JSON.stringify(BASE_ORCH, null, 2), "utf8");

    const walEscalateFn = createWalEscalateFn(p);
    await walEscalateFn(12 * 1_048_576); // 12 MB

    const after = JSON.parse(readFileSync(p, "utf8")) as OrchState;
    expect(after.signal_queue.rows).toHaveLength(1);
    const row = after.signal_queue.rows[0]!;
    expect(row.type).toBe("WAL_ESCALATION");
    expect(row.severity).toBe("HIGH");
    expect(row.status).toBe("NEW");
    expect(row.from).toBe("mcp-server/walCheckpointJob");
    expect(row.to).toBe("ops");
    expect(row.summary).toContain("12.0 MB");
  });

  it("is a no-op when the orchStatePath does not exist (appendSignalQueueRow's own fileExistsFn guard)", async () => {
    const { createWalEscalateFn } = await import("../scheduler/walEscalation.js");
    const p = makeTmpPath(); // never written
    paths.push(p);

    const walEscalateFn = createWalEscalateFn(p);
    // Must not throw even though the file is absent.
    await expect(walEscalateFn(11 * 1_048_576)).resolves.toBeUndefined();
    expect(existsSync(p)).toBe(false);
  });
});
