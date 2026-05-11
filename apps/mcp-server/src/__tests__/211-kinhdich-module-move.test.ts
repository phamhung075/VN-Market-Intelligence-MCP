/**
 * Sprint 211 — kinhdich module file move verification
 *
 * RED: fails while kinhDichTools.ts is at tools/ root (barrel imports "../kinhDichTools.js")
 * GREEN: passes after file moves to kinhdich/ subfolder + barrel updated to "./kinhDichTools.js"
 */
import { describe, it, expect } from "bun:test";

describe("Sprint 211 — kinhdich module move", () => {
  it("tools/kinhdich barrel exports registerKinhDichTools as a function", async () => {
    const mod = await import("../interface/mcp/tools/kinhdich/index.js");
    expect(typeof mod.registerKinhDichTools).toBe("function");
  });

  it("top-level tools barrel still exports registerKinhDichTools", async () => {
    const mod = await import("../interface/mcp/tools/index.js");
    expect(typeof mod.registerKinhDichTools).toBe("function");
  });

  it("domain/services barrel exports appendKinhDich from kinhDich subfolder", async () => {
    const mod = await import("../domain/services/index.js");
    expect(typeof mod.appendKinhDich).toBe("function");
  });

  it("kinhDichWrapper re-export resolves through kinhDich/kinhDichWrapper path", async () => {
    // Direct import of the wrapper from its new location
    const mod = await import("../domain/services/kinhDich/kinhDichWrapper.js");
    expect(typeof mod.appendKinhDich).toBe("function");
  });

  it("kinhDichTools resolves from new kinhdich subfolder path", async () => {
    // Direct import of the tool from its new location
    const mod = await import("../interface/mcp/tools/kinhdich/kinhDichTools.js");
    expect(typeof mod.registerKinhDichTools).toBe("function");
  });
});
