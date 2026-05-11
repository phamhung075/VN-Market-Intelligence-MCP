/**
 * Sprint 218 — market-data module file move verification
 */
import { describe, it, expect } from "bun:test";

describe("Sprint 218 — market-data module move", () => {
  it("tools/market-data barrel exports registerMarketTools", async () => {
    const mod = await import("../interface/mcp/tools/market-data/index.js");
    expect(typeof mod.registerMarketTools).toBe("function");
  });

  it("marketTools resolves from market-data subfolder", async () => {
    const mod = await import("../interface/mcp/tools/market-data/marketTools.js");
    expect(typeof mod.registerMarketTools).toBe("function");
  });

  it("foreignFlowTools resolves from market-data subfolder", async () => {
    const mod = await import("../interface/mcp/tools/market-data/foreignFlowTools.js");
    expect(typeof mod.registerForeignFlowTools).toBe("function");
  });

  it("marketScanJob resolves from scheduler/market-data subfolder", async () => {
    const mod = await import("../scheduler/market-data/marketScanJob.js");
    expect(typeof mod.runMarketScan).toBe("function");
  });

  it("taAlertNotifierJob resolves from scheduler/market-data subfolder", async () => {
    const mod = await import("../scheduler/market-data/taAlertNotifierJob.js");
    expect(mod.runTaAlertNotifier).toBeDefined();
  });
});
