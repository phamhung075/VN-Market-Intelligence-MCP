/**
 * Task 088 — Legacy Cleanup
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifies that the legacy stubs (src/server.ts and src/tools/) have been
 * removed and that the canonical replacements still export the expected symbols.
 */

import { describe, it, expect } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

// Resolve the project root from this test file's location:
//   src/__tests__/088-*.test.ts  →  ../../  →  project root
const root = join(import.meta.dir, "..", "..");

describe("Task 088 — Remove legacy stubs", () => {
  // ── Absence checks ────────────────────────────────────────────────────────

  it("src/server.ts does not exist", () => {
    const path = join(root, "src", "server.ts");
    expect(existsSync(path)).toBe(false);
  });

  it("src/tools/ directory does not exist", () => {
    const path = join(root, "src", "tools");
    expect(existsSync(path)).toBe(false);
  });

  it("src/tools/watchlist.ts does not exist", () => {
    const path = join(root, "src", "tools", "watchlist.ts");
    expect(existsSync(path)).toBe(false);
  });

  it("src/tools/analysis.ts does not exist", () => {
    const path = join(root, "src", "tools", "analysis.ts");
    expect(existsSync(path)).toBe(false);
  });

  it("src/tools/reports.ts does not exist", () => {
    const path = join(root, "src", "tools", "reports.ts");
    expect(existsSync(path)).toBe(false);
  });

  it("src/tools/alerts.ts does not exist", () => {
    const path = join(root, "src", "tools", "alerts.ts");
    expect(existsSync(path)).toBe(false);
  });

  // ── Presence + export checks ───────────────────────────────────────────────

  it("src/interface/mcp/server.ts exports createBunServer", async () => {
    const mod = await import("../interface/mcp/server.js");
    expect(typeof mod.createBunServer).toBe("function");
  });

  it("src/interface/mcp/tools/index.ts exports registerWatchlistTools", async () => {
    const mod = await import("../interface/mcp/tools/index.js");
    expect(typeof mod.registerWatchlistTools).toBe("function");
  });

  it("src/interface/mcp/tools/index.ts exports registerAnalysisTools", async () => {
    const mod = await import("../interface/mcp/tools/index.js");
    expect(typeof mod.registerAnalysisTools).toBe("function");
  });

  it("src/interface/mcp/tools/index.ts exports registerReportTools", async () => {
    const mod = await import("../interface/mcp/tools/index.js");
    expect(typeof mod.registerReportTools).toBe("function");
  });

  it("src/interface/mcp/tools/index.ts exports registerAlertTools", async () => {
    const mod = await import("../interface/mcp/tools/index.js");
    expect(typeof mod.registerAlertTools).toBe("function");
  });
});
