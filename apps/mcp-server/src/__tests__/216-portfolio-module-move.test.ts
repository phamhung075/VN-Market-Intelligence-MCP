/**
 * Sprint 216 — portfolio module file move verification
 */
import { describe, it, expect } from "bun:test";

describe("Sprint 216 — portfolio module move", () => {
  it("tools/portfolio barrel exports registerPortfolioTools", async () => {
    const mod = await import("../interface/mcp/tools/portfolio/index.js");
    expect(typeof mod.registerPortfolioTools).toBe("function");
  });

  it("portfolioTools resolves from portfolio subfolder", async () => {
    const mod = await import("../interface/mcp/tools/portfolio/portfolioTools.js");
    expect(typeof mod.registerPortfolioTools).toBe("function");
  });

  it("weeklyPortfolioReportJob resolves from scheduler/portfolio subfolder", async () => {
    const mod = await import("../scheduler/portfolio/weeklyPortfolioReportJob.js");
    expect(typeof mod.runWeeklyPortfolioReport).toBe("function");
  });
});
