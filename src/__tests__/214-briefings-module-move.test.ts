/**
 * Sprint 214 — briefings module file move verification
 */
import { describe, it, expect } from "bun:test";

describe("Sprint 214 — briefings module move", () => {
  it("tools/briefings barrel exports registerSummaryTools", async () => {
    const mod = await import("../interface/mcp/tools/briefings/index.js");
    expect(typeof mod.registerSummaryTools).toBe("function");
  });

  it("summaryTools resolves from briefings subfolder", async () => {
    const mod = await import("../interface/mcp/tools/briefings/summaryTools.js");
    expect(typeof mod.registerSummaryTools).toBe("function");
  });

  it("morningBriefingJob resolves from scheduler/briefings subfolder", async () => {
    const mod = await import("../scheduler/briefings/morningBriefingJob.js");
    expect(typeof mod.runMorningBriefing).toBe("function");
  });

  it("eveningSummaryJob resolves from scheduler/briefings subfolder", async () => {
    const mod = await import("../scheduler/briefings/eveningSummaryJob.js");
    expect(typeof mod.runEveningSummary).toBe("function");
  });

  it("franceSummaryJob resolves from scheduler/briefings subfolder", async () => {
    const mod = await import("../scheduler/briefings/franceSummaryJob.js");
    expect(typeof mod.runFranceSummary).toBe("function");
  });
});
