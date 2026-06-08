Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1136 — jobs.ts imports + summaryJobs.ts wrap
 *
 * Verifies that:
 * 1. summaryJobs.ts imports recordJobRun from cronJobRunStore
 * 2. summaryJobs.ts imports getDb from schema
 * 3. runSummaryJob body calls recordJobRun (Pattern D)
 * 4. The old bare try/catch swallowing errors is gone
 */

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

const SRC_ROOT = join(import.meta.dir, "..", "scheduler");

const summaryJobsSrc = readFileSync(
  join(SRC_ROOT, "summaryJobs.ts"),
  "utf-8",
);

const jobsSrc = readFileSync(
  join(SRC_ROOT, "startScheduler.ts"),
  "utf-8",
);

describe("Task 1136 — summaryJobs.ts observability wrap", () => {
  it("imports getDb from schema in summaryJobs.ts", () => {
    expect(summaryJobsSrc).toContain('from "../infrastructure/db/schema.js"');
    expect(summaryJobsSrc).toMatch(/import\s*\{[^}]*getDb[^}]*\}/);
  });

  it("imports recordJobRun from cronJobRunStore in summaryJobs.ts", () => {
    expect(summaryJobsSrc).toContain('from "../infrastructure/db/cronJobRunStore.js"');
    expect(summaryJobsSrc).toMatch(/import\s*\{[^}]*recordJobRun[^}]*\}/);
  });

  it("runSummaryJob calls recordJobRun with db and job name", () => {
    expect(summaryJobsSrc).toContain("recordJobRun(db,");
    expect(summaryJobsSrc).toContain("`summaryJob:${periodType}`");
  });

  it("runSummaryJob calls getDb() inside the function body", () => {
    // getDb() must be inside the function, not at module level
    const fnStart = summaryJobsSrc.indexOf("async function runSummaryJob");
    expect(fnStart).toBeGreaterThan(-1);
    const fnChunk = summaryJobsSrc.slice(fnStart, fnStart + 500);
    expect(fnChunk).toContain("getDb()");
  });

  it("runSummaryJob no longer has a bare try/catch that swallows errors", () => {
    // The old pattern was: try { ... } catch (err) { logger.error(...) }
    // After the wrap, the outer try/catch is gone — only recordJobRun's internal one remains
    // We check there is no catch block that calls logger.error inside runSummaryJob
    const fnStart = summaryJobsSrc.indexOf("async function runSummaryJob");
    expect(fnStart).toBeGreaterThan(-1);
    const fnChunk = summaryJobsSrc.slice(fnStart, fnStart + 600);
    // The old swallowing catch had logger.error inside it
    expect(fnChunk).not.toContain("logger.error");
  });
});

describe("Task 1136 — jobs.ts imports (Phase 2 updated)", () => {
  it("imports getDb from infrastructure/db/schema in jobs.ts", () => {
    // getDb() is still used once at the composition root in startScheduler()
    expect(jobsSrc).toContain("../infrastructure/db/schema.js");
    expect(jobsSrc).toMatch(/import\s*\{[^}]*getDb[^}]*\}/);
  });

  it("imports SqliteJobRunRepository from repositories in jobs.ts (Phase 2 pattern)", () => {
    // Task 1839a Phase 2: recordJobRun import replaced by SqliteJobRunRepository
    expect(jobsSrc).toContain("SqliteJobRunRepository");
    expect(jobsSrc).toMatch(/import\s*\{[^}]*SqliteJobRunRepository[^}]*\}/);
  });
});
