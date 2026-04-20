/**
 * Sprint 217 — macro module file move verification
 */
import { describe, it, expect } from "bun:test";

describe("Sprint 217 — macro module move", () => {
  it("tools/macro barrel exports registerMacroTools", async () => {
    const mod = await import("../interface/mcp/tools/macro/index.js");
    expect(typeof mod.registerMacroTools).toBe("function");
  });

  it("macroTools resolves from macro subfolder", async () => {
    const mod = await import("../interface/mcp/tools/macro/macroTools.js");
    expect(typeof mod.registerMacroTools).toBe("function");
  });

  it("predictionResolutionJob resolves from scheduler/macro subfolder", async () => {
    const mod = await import("../scheduler/macro/predictionResolutionJob.js");
    expect(typeof mod.runPredictionResolution).toBe("function");
  });

  it("calibrationReportJob resolves from scheduler/macro subfolder", async () => {
    const mod = await import("../scheduler/macro/calibrationReportJob.js");
    expect(mod.runCalibrationReport).toBeDefined();
  });
});
