// apps/mcp-server/src/__tests__/1329b-imf-conviction-dimension.test.ts
// Note: DB_PATH is set to :memory: by apps/mcp-server/src/__tests__/setup.ts preload (Bun.env)
import { describe, it, expect } from "bun:test";
import { computeConviction } from "../domain/services/convictionScorer.js";

describe("Task 1329d — ConvictionInput/Result types: imfMacro dimension", () => {
  it("ConvictionInput accepts imfMacroScore field", () => {
    // TypeScript compile check — if this compiles, the field exists on the interface
    const result = computeConviction({ code: "VCB", imfMacroScore: 0.5 });
    expect(result).toBeDefined();
  });

  it("ConvictionResult.dimensions includes imfMacro field", () => {
    const result = computeConviction({ code: "VCB" });
    expect(typeof result.dimensions.imfMacro).toBe("number");
  });

  it("imfMacroScore undefined produces dimensions.imfMacro = 0.5 (neutral)", () => {
    const result = computeConviction({ code: "VCB" });
    expect(result.dimensions.imfMacro).toBe(0.5);
  });
});
