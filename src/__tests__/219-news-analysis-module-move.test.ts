/**
 * Sprint 219 — news-analysis module file move verification
 */
import { describe, it, expect } from "bun:test";

describe("Sprint 219 — news-analysis module move", () => {
  it("tools/news-analysis barrel exports registerAnalysisTools", async () => {
    const mod = await import("../interface/mcp/tools/news-analysis/index.js");
    expect(typeof mod.registerAnalysisTools).toBe("function");
  });

  it("analysis.ts resolves from news-analysis subfolder", async () => {
    const mod = await import("../interface/mcp/tools/news-analysis/analysis.js");
    expect(typeof mod.registerAnalysisTools).toBe("function");
  });

  it("sourceHealthTools resolves from news-analysis subfolder", async () => {
    const mod = await import("../interface/mcp/tools/news-analysis/sourceHealthTools.js");
    expect(mod.globalSourceTracker).toBeDefined();
  });

  it("intelligenceCycleJob resolves from scheduler/news-analysis subfolder", async () => {
    const mod = await import("../scheduler/news-analysis/intelligenceCycleJob.js");
    expect(typeof mod.runIntelligenceCycle).toBe("function");
  });

  it("dataAuditJob resolves from scheduler/news-analysis subfolder", async () => {
    const mod = await import("../scheduler/news-analysis/dataAuditJob.js");
    expect(mod.runDailyAudit).toBeDefined();
  });
});
