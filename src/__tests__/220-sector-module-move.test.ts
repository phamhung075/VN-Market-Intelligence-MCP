/**
 * Sprint 220 — sector module file move verification
 */
import { describe, it, expect } from "bun:test";

describe("Sprint 220 — sector module move", () => {
  it("tools/sector barrel exports registerSectorComparisonTools", async () => {
    const mod = await import("../interface/mcp/tools/sector/index.js");
    expect(typeof mod.registerSectorComparisonTools).toBe("function");
  });

  it("sectorComparisonTools resolves from sector subfolder", async () => {
    const mod = await import("../interface/mcp/tools/sector/sectorComparisonTools.js");
    expect(typeof mod.registerSectorComparisonTools).toBe("function");
  });

  it("crisisTools resolves from sector subfolder", async () => {
    const mod = await import("../interface/mcp/tools/sector/crisisTools.js");
    expect(typeof mod.registerCrisisTools).toBe("function");
  });

  it("pharmaTools resolves from sector subfolder", async () => {
    const mod = await import("../interface/mcp/tools/sector/pharmaTools.js");
    expect(typeof mod.registerPharmaTools).toBe("function");
  });

  it("correlationTools resolves from sector subfolder", async () => {
    const mod = await import("../interface/mcp/tools/sector/correlationTools.js");
    expect(typeof mod.registerCorrelationTools).toBe("function");
  });
});
