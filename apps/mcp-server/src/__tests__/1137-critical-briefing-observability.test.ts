Bun.env["DB_PATH"] = ":memory:";

// src/__tests__/1137-critical-briefing-observability.test.ts
import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";

const JOBS_TS = readFileSync(
  resolve(import.meta.dir, "../scheduler/startScheduler.ts"),
  "utf-8",
);

// FACTORY-SCHEDULER-job-table-registry: morningBriefingJob / eveningSummaryJob /
// alertDigestJob's REGULAR cron registration moved to schedulerJobTable.ts (buildJobTable
// JOB_TABLE entries, wrapped generically by registerJobTable's single
// `jobRunRepo.wrapRun(j.name, j.runner)` loop). Those 3 job names remain discoverable in
// startScheduler.ts too because the untouched startup-catchup setTimeout probe (task 1430 /
// 1958a) has its OWN literal `jobRunRepo.wrapRun('xJob', ...)` call for each — a second,
// independent observability call site. intelligenceCycleJob has no startup-catchup probe,
// so its checks read schedulerJobTable.ts directly.
const JOB_TABLE_TS = readFileSync(
  resolve(import.meta.dir, "../scheduler/schedulerJobTable.ts"),
  "utf-8",
);

describe("Task 1137 — Critical briefing/cycle jobs wrapped with observability", () => {
  // Task 1839a Phase 2: recordJobRun(getDb(), ...) replaced by jobRunRepo.wrapRun(...)
  // The invariant is preserved: each job must be wrapped for observability.

  it("morningBriefingJob call site uses jobRunRepo.wrapRun", () => {
    // Phase 2 pattern: jobRunRepo.wrapRun('morningBriefingJob', async () => {
    // (startup-catchup probe in startScheduler.ts — see JOB_TABLE_TS comment above)
    const match = JOBS_TS.match(
      /jobRunRepo\.wrapRun\s*\(\s*['"]morningBriefingJob['"]/,
    );
    expect(match).not.toBeNull();
  });

  it("intelligenceCycleJob call site is registered via the JOB_TABLE (generic jobRunRepo.wrapRun loop)", () => {
    // FACTORY-SCHEDULER-job-table-registry: registerJobTable() wraps EVERY buildJobTable()
    // entry in jobRunRepo.wrapRun(j.name, j.runner) generically — so proving the entry
    // exists (name + correct cron key) proves the observability invariant structurally.
    const match = JOB_TABLE_TS.match(
      /name:\s*['"]intelligenceCycleJob['"][\s\S]*?cron:\s*CRONS\.intelligenceCycle/,
    );
    expect(match).not.toBeNull();
  });

  it("eveningSummaryJob call site uses jobRunRepo.wrapRun", () => {
    // (startup-catchup probe in startScheduler.ts — see JOB_TABLE_TS comment above)
    const match = JOBS_TS.match(
      /jobRunRepo\.wrapRun\s*\(\s*['"]eveningSummaryJob['"]/,
    );
    expect(match).not.toBeNull();
  });

  it("alertDigestJob call site uses jobRunRepo.wrapRun", () => {
    // (startup-catchup probe in startScheduler.ts — see JOB_TABLE_TS comment above)
    const match = JOBS_TS.match(
      /jobRunRepo\.wrapRun\s*\(\s*['"]alertDigestJob['"]/,
    );
    expect(match).not.toBeNull();
  });

  it("intelligenceCycleJob extracts rowsWritten from result", () => {
    // Must use null-safe access on result and extract newsFetched + impactEventsRan
    const match = JOB_TABLE_TS.match(
      /intelligenceCycleJob[\s\S]*?rowsWritten[\s\S]*?result\?\.newsFetched/,
    );
    expect(match).not.toBeNull();
  });
});
