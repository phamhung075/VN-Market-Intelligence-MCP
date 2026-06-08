Bun.env["DB_PATH"] = ":memory:";

// src/__tests__/1137-critical-briefing-observability.test.ts
import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

const JOBS_TS = readFileSync(
  resolve(import.meta.dir, "../scheduler/startScheduler.ts"),
  "utf-8",
);

describe("Task 1137 — Critical briefing/cycle jobs wrapped with observability", () => {
  // Task 1839a Phase 2: recordJobRun(getDb(), ...) replaced by jobRunRepo.wrapRun(...)
  // The invariant is preserved: each job must be wrapped for observability.

  it("morningBriefingJob call site uses jobRunRepo.wrapRun", () => {
    // Phase 2 pattern: jobRunRepo.wrapRun('morningBriefingJob', async () => {
    const match = JOBS_TS.match(
      /jobRunRepo\.wrapRun\s*\(\s*['"]morningBriefingJob['"]/,
    );
    expect(match).not.toBeNull();
  });

  it("intelligenceCycleJob call site uses jobRunRepo.wrapRun", () => {
    const match = JOBS_TS.match(
      /jobRunRepo\.wrapRun\s*\(\s*['"]intelligenceCycleJob['"]/,
    );
    expect(match).not.toBeNull();
  });

  it("eveningSummaryJob call site uses jobRunRepo.wrapRun", () => {
    const match = JOBS_TS.match(
      /jobRunRepo\.wrapRun\s*\(\s*['"]eveningSummaryJob['"]/,
    );
    expect(match).not.toBeNull();
  });

  it("alertDigestJob call site uses jobRunRepo.wrapRun", () => {
    const match = JOBS_TS.match(
      /jobRunRepo\.wrapRun\s*\(\s*['"]alertDigestJob['"]/,
    );
    expect(match).not.toBeNull();
  });

  it("intelligenceCycleJob extracts rowsWritten from result", () => {
    // Must use null-safe access on result and extract newsFetched + impactEventsRan
    const match = JOBS_TS.match(
      /intelligenceCycleJob[\s\S]*?rowsWritten[\s\S]*?result\?\.newsFetched/,
    );
    expect(match).not.toBeNull();
  });
});
