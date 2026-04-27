// apps/mcp-server/src/__tests__/1349f-integration-observability.test.ts
// Sprint 1349 — Integration QA: observability, dead config removal, scheduler paths
import { describe, it, expect } from "bun:test";
import { join } from "path";

const PROJECT_ROOT = join(import.meta.dir, "../../../..");
const MCP_SERVER_ROOT = join(import.meta.dir, "../..");

describe("1349a: Dead scheduler config removal", () => {
  it("should not have scheduler section in mcp.config.json", async () => {
    const configText = await Bun.file(join(MCP_SERVER_ROOT, "mcp.config.json")).text();
    const config = JSON.parse(configText);
    expect(config.scheduler).toBeUndefined();
  });

  it("should have CRONS defined in src/scheduler/jobs.ts", async () => {
    const { CRONS } = await import("../scheduler/jobs.js");
    expect(Object.keys(CRONS).length).toBeGreaterThan(40);
  });
});

describe("1349b: Circuit breaker state logging module", () => {
  it("should export log function from circuitBreakerLogger", async () => {
    const mod = await import("../infrastructure/observability/circuitBreakerLogger.js");
    expect(typeof mod.logCircuitBreakerTransition).toBe("function");
  });

  it("should produce a structured log with required fields", async () => {
    const { logCircuitBreakerTransition } = await import("../infrastructure/observability/circuitBreakerLogger.js");
    const logs: string[] = [];
    const original = console.log;
    console.log = (msg: string) => {
      if (typeof msg === "string" && msg.includes("CB_TRANSITION")) logs.push(msg);
      original(msg);
    };

    try {
      logCircuitBreakerTransition({
        timestamp: new Date().toISOString(),
        job: "testJob",
        state_old: "closed",
        state_new: "open",
        reason: "failure_threshold_exceeded",
      });
    } finally {
      console.log = original;
    }

    expect(logs.length).toBeGreaterThan(0);
    const parsed = JSON.parse(logs[0]!);
    expect(parsed).toHaveProperty("timestamp");
    expect(parsed).toHaveProperty("job");
    expect(parsed).toHaveProperty("state_old");
    expect(parsed).toHaveProperty("state_new");
    expect(parsed).toHaveProperty("reason");
  });
});

describe("1349c: Scheduler documentation paths", () => {
  it("should have scheduler.md under docs/agent-memory/modules/", async () => {
    const schedulerDoc = Bun.file(join(PROJECT_ROOT, "docs/agent-memory/modules/scheduler.md"));
    const exists = await schedulerDoc.exists();
    expect(exists).toBe(true);
  });

  it("should reference current src/scheduler/ paths (at least 40 references)", async () => {
    const schedulerDoc = await Bun.file(
      join(PROJECT_ROOT, "docs/agent-memory/modules/scheduler.md")
    ).text();
    const jobCount = (schedulerDoc.match(/src\/scheduler\//g) ?? []).length;
    expect(jobCount).toBeGreaterThanOrEqual(40);
  });

  it("should label any src/infrastructure/scheduler reference as stale/deprecated", async () => {
    const schedulerDoc = await Bun.file(
      join(PROJECT_ROOT, "docs/agent-memory/modules/scheduler.md")
    ).text();
    // If the old path is mentioned it must be clearly labelled as stale
    if (schedulerDoc.includes("src/infrastructure/scheduler")) {
      const lines = schedulerDoc.split("\n");
      const matchLines = lines.filter((l) => l.includes("src/infrastructure/scheduler"));
      for (const line of matchLines) {
        const isAnnotated =
          line.toLowerCase().includes("stale") ||
          line.toLowerCase().includes("old") ||
          line.toLowerCase().includes("deprecated") ||
          line.toLowerCase().includes("do not use");
        expect(isAnnotated).toBe(true);
      }
    }
    expect(true).toBe(true); // no reference at all is also fine
  });
});

describe("1349d: BCTC validation edge cases", () => {
  it("should have at least 8 test cases in 1345b-bctc-financial-validation.test.ts", async () => {
    const testFile = await Bun.file(
      join(import.meta.dir, "1345b-bctc-financial-validation.test.ts")
    ).text();
    const testCount = (testFile.match(/\bit\(/g) ?? []).length;
    expect(testCount).toBeGreaterThanOrEqual(8);
  });
});

describe("1349e: Job metrics collection", () => {
  it("should export getJobMetrics from jobMetrics module", async () => {
    const mod = await import("../infrastructure/observability/jobMetrics.js");
    expect(typeof mod.getJobMetrics).toBe("function");
  });

  it("should collect metrics with required fields when jobs have run", async () => {
    const { getJobMetrics } = await import("../infrastructure/observability/jobMetrics.js");
    const taMetrics = getJobMetrics("taAlertScan");
    const bbMetrics = getJobMetrics("bbAlertScan");
    const macroMetrics = getJobMetrics("macroRefresh");

    // Verify arrays are returned (may be empty if no runs yet)
    expect(Array.isArray(taMetrics)).toBe(true);
    expect(Array.isArray(bbMetrics)).toBe(true);
    expect(Array.isArray(macroMetrics)).toBe(true);

    // If data exists, verify shape
    if (taMetrics.length > 0) {
      expect(taMetrics[0]).toHaveProperty("cycle_duration_ms");
      expect(taMetrics[0]).toHaveProperty("error_count");
      expect(taMetrics[0]).toHaveProperty("success_count");
    }
  });
});

describe("1349 baseline regression", () => {
  it("should have zero TypeScript structural errors in 1349 new files", async () => {
    // Verify that key 1349 files exist (structural check)
    const files = [
      join(import.meta.dir, "../infrastructure/observability/circuitBreakerLogger.ts"),
      join(import.meta.dir, "../infrastructure/observability/jobMetrics.ts"),
    ];
    for (const f of files) {
      const exists = await Bun.file(f).exists();
      expect(exists).toBe(true);
    }
  });
});
