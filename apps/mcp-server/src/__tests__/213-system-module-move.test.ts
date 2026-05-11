/**
 * Sprint 213 — system module file move verification
 *
 * RED: fails while files are at layer roots
 * GREEN: passes after files move to system/ subfolders
 */
import { describe, it, expect } from "bun:test";

describe("Sprint 213 — system module move", () => {
  it("tools/system barrel exports registerSystemTools", async () => {
    const mod = await import("../interface/mcp/tools/system/index.js");
    expect(typeof mod.registerSystemTools).toBe("function");
  });

  it("tools/system barrel exports registerWatchlistTools", async () => {
    const mod = await import("../interface/mcp/tools/system/index.js");
    expect(typeof mod.registerWatchlistTools).toBe("function");
  });

  it("systemTools resolves from new system subfolder path", async () => {
    const mod = await import("../interface/mcp/tools/system/systemTools.js");
    expect(typeof mod.registerSystemTools).toBe("function");
  });

  it("watchlist resolves from new system subfolder path", async () => {
    const mod = await import("../interface/mcp/tools/system/watchlist.js");
    expect(typeof mod.registerWatchlistTools).toBe("function");
  });

  it("askQueueCheckJob resolves from new scheduler/system subfolder", async () => {
    const mod = await import("../scheduler/system/askQueueCheckJob.js");
    expect(typeof mod.runAskQueueCheck).toBe("function");
  });

  it("devTeamHeartbeatJob resolves from new scheduler/system subfolder", async () => {
    const mod = await import("../scheduler/system/devTeamHeartbeatJob.js");
    expect(typeof mod.runDevTeamHeartbeat).toBe("function");
  });
});
