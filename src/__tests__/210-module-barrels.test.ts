// src/__tests__/210-module-barrels.test.ts
// Task 1538 — Module barrel index.ts public contracts
// Note: DB_PATH is set to :memory: by src/__tests__/setup.ts preload (Bun.env)
import { describe, it, expect } from "bun:test";

describe("Task 210 — Module Barrel Exports", () => {
  it("market-data barrel exports register functions", async () => {
    const mod = await import("../interface/mcp/tools/market-data/index.js");
    expect(typeof mod.registerMarketTools).toBe("function");
    expect(typeof mod.registerForeignFlowTools).toBe("function");
    expect(typeof mod.registerPriceHistoryTools).toBe("function");
    expect(typeof mod.registerTechnicalIndicatorTools).toBe("function");
    expect(typeof mod.registerInsiderTools).toBe("function");
  });

  it("financial-reports barrel exports register functions", async () => {
    const mod = await import(
      "../interface/mcp/tools/financial-reports/index.js"
    );
    expect(typeof mod.registerBctcFullTools).toBe("function");
    expect(typeof mod.registerEarningsCalendarTools).toBe("function");
    expect(typeof mod.registerReportTools).toBe("function");
  });

  it("news-analysis barrel exports register functions", async () => {
    const mod = await import(
      "../interface/mcp/tools/news-analysis/index.js"
    );
    expect(typeof mod.registerAnalysisTools).toBe("function");
    expect(typeof mod.registerCascadeMetricsTools).toBe("function");
    expect(typeof mod.registerCascadeOutcomeTools).toBe("function");
  });

  it("alerts barrel exports register functions", async () => {
    const mod = await import("../interface/mcp/tools/alerts/index.js");
    expect(typeof mod.registerAlertTools).toBe("function");
    expect(typeof mod.registerPipelineHealthTools).toBe("function");
    expect(typeof mod.registerAlertMuteTools).toBe("function");
  });

  it("portfolio barrel exports register functions", async () => {
    const mod = await import("../interface/mcp/tools/portfolio/index.js");
    expect(typeof mod.registerPortfolioTools).toBe("function");
    expect(typeof mod.registerPerformanceTools).toBe("function");
    expect(typeof mod.registerRebalancingTools).toBe("function");
  });

  it("briefings barrel exports register functions", async () => {
    const mod = await import("../interface/mcp/tools/briefings/index.js");
    expect(typeof mod.registerSummaryTools).toBe("function");
    expect(typeof mod.registerMarketMessageTools).toBe("function");
  });

  it("macro barrel exports register functions", async () => {
    const mod = await import("../interface/mcp/tools/macro/index.js");
    expect(typeof mod.registerMacroTools).toBe("function");
    expect(typeof mod.registerPredictionTools).toBe("function");
    expect(typeof mod.registerCalibrationTools).toBe("function");
  });

  it("sector barrel exports register functions", async () => {
    const mod = await import("../interface/mcp/tools/sector/index.js");
    expect(typeof mod.registerSectorComparisonTools).toBe("function");
    expect(typeof mod.registerSectorRotationTools).toBe("function");
    expect(typeof mod.registerCorrelationTools).toBe("function");
    expect(typeof mod.registerBondMaturityTools).toBe("function");
  });

  it("kinhdich barrel exports register function", async () => {
    const mod = await import("../interface/mcp/tools/kinhdich/index.js");
    expect(typeof mod.registerKinhDichTools).toBe("function");
  });

  it("system barrel exports register functions", async () => {
    const mod = await import("../interface/mcp/tools/system/index.js");
    expect(typeof mod.registerSystemTools).toBe("function");
    expect(typeof mod.registerVpsProxyTools).toBe("function");
    expect(typeof mod.registerAskQueueTools).toBe("function");
    expect(typeof mod.registerWatchlistTools).toBe("function");
  });

  it("top-level tools barrel re-exports all sub-barrels", async () => {
    const mod = await import("../interface/mcp/tools/index.js");
    // market-data
    expect(typeof mod.registerMarketTools).toBe("function");
    // financial-reports
    expect(typeof mod.registerBctcFullTools).toBe("function");
    // news-analysis
    expect(typeof mod.registerCascadeOutcomeTools).toBe("function");
    // alerts
    expect(typeof mod.registerPipelineHealthTools).toBe("function");
    // portfolio
    expect(typeof mod.registerPortfolioTools).toBe("function");
    // briefings
    expect(typeof mod.registerSummaryTools).toBe("function");
    // macro
    expect(typeof mod.registerMacroTools).toBe("function");
    // sector
    expect(typeof mod.registerSectorComparisonTools).toBe("function");
    // kinhdich
    expect(typeof mod.registerKinhDichTools).toBe("function");
    // system
    expect(typeof mod.registerSystemTools).toBe("function");
  });

  it("domain services barrel exports known services", async () => {
    const mod = await import("../domain/services/index.js");
    expect(typeof mod.detectSignals).toBe("function");
    expect(typeof mod.generateAlerts).toBe("function");
    expect(typeof mod.normalizeNews).toBe("function");
    expect(typeof mod.buildCausalChain).toBe("function");
    expect(typeof mod.computeRebalancing).toBe("function");
  });

  it("scheduler barrel exports from jobs", async () => {
    const mod = await import("../scheduler/index.js");
    expect(typeof mod.startScheduler).toBe("function");
    expect(typeof mod.CRONS).toBe("object");
  });
});
