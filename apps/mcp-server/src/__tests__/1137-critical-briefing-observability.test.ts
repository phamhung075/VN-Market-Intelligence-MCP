Bun.env["DB_PATH"] = ":memory:";

// src/__tests__/1137-critical-briefing-observability.test.ts
import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";

const JOBS_TS = readFileSync(
  resolve(import.meta.dir, "../scheduler/jobs.ts"),
  "utf-8",
);

describe("Task 1137 — Critical briefing/cycle jobs wrapped with recordJobRun", () => {
  it("morningBriefingJob call site uses recordJobRun", () => {
    // Pattern A: recordJobRun(getDb(), 'morningBriefingJob', async () => {
    const match = JOBS_TS.match(
      /recordJobRun\s*\(\s*getDb\s*\(\s*\)\s*,\s*['"]morningBriefingJob['"]/,
    );
    expect(match).not.toBeNull();
  });

  it("intelligenceCycleJob call site uses recordJobRun", () => {
    const match = JOBS_TS.match(
      /recordJobRun\s*\(\s*getDb\s*\(\s*\)\s*,\s*['"]intelligenceCycleJob['"]/,
    );
    expect(match).not.toBeNull();
  });

  it("eveningSummaryJob call site uses recordJobRun", () => {
    const match = JOBS_TS.match(
      /recordJobRun\s*\(\s*getDb\s*\(\s*\)\s*,\s*['"]eveningSummaryJob['"]/,
    );
    expect(match).not.toBeNull();
  });

  it("alertDigestJob call site uses recordJobRun", () => {
    const match = JOBS_TS.match(
      /recordJobRun\s*\(\s*getDb\s*\(\s*\)\s*,\s*['"]alertDigestJob['"]/,
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
