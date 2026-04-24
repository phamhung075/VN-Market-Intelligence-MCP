/**
 * Sprint 215 — alerts module file move verification
 */
import { describe, it, expect } from "bun:test";

describe("Sprint 215 — alerts module move", () => {
  it("tools/alerts barrel exports registerAlertTools", async () => {
    const mod = await import("../interface/mcp/tools/alerts/index.js");
    expect(typeof mod.registerAlertTools).toBe("function");
  });

  it("alerts.ts resolves from alerts subfolder", async () => {
    const mod = await import("../interface/mcp/tools/alerts/alerts.js");
    expect(typeof mod.registerAlertTools).toBe("function");
  });

  it("alertDigestJob resolves from scheduler/alerts subfolder", async () => {
    const mod = await import("../scheduler/alerts/alertDigestJob.js");
    expect(typeof mod.runAlertDigest).toBe("function");
  });

  it("cronHealthAlertJob resolves from scheduler/alerts subfolder", async () => {
    const mod = await import("../scheduler/alerts/cronHealthAlertJob.js");
    expect(mod.runCronHealthAlert).toBeDefined();
  });
});
