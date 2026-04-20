/**
 * Sprint 212 — financial-reports module file move verification
 *
 * RED: fails while files are at layer roots
 * GREEN: passes after files move to financial-reports/ subfolders
 */
import { describe, it, expect } from "bun:test";

describe("Sprint 212 — financial-reports module move", () => {
  it("tools/financial-reports barrel exports registerBctcFullTools", async () => {
    const mod = await import("../interface/mcp/tools/financial-reports/index.js");
    expect(typeof mod.registerBctcFullTools).toBe("function");
  });

  it("tools/financial-reports barrel exports registerEarningsCalendarTools", async () => {
    const mod = await import("../interface/mcp/tools/financial-reports/index.js");
    expect(typeof mod.registerEarningsCalendarTools).toBe("function");
  });

  it("tools/financial-reports barrel exports registerReportTools", async () => {
    const mod = await import("../interface/mcp/tools/financial-reports/index.js");
    expect(typeof mod.registerReportTools).toBe("function");
  });

  it("bctcFullTools resolves from new financial-reports subfolder", async () => {
    const mod = await import("../interface/mcp/tools/financial-reports/bctcFullTools.js");
    expect(typeof mod.registerBctcFullTools).toBe("function");
  });

  it("earningsCalendar resolves from new domain subfolder", async () => {
    const mod = await import("../domain/services/financial-reports/earningsCalendar.js");
    expect(typeof mod.getCurrentDeadline).toBe("function");
  });

  it("bctcOverdueCheckJob resolves from new scheduler subfolder", async () => {
    const mod = await import("../scheduler/financial-reports/bctcOverdueCheckJob.js");
    expect(typeof mod.runBctcOverdueCheck).toBe("function");
  });
});
