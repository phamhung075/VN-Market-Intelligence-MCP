/**
 * Task 1880b — Pyramid Tier domain unit tests + MCP smoke test
 *
 * TDD RED phase: written before implementation exists.
 * All tests must pass after pyramidTier.ts is created.
 *
 * Domain: classifyPyramidTier(assetClass: string)
 * MCP:    get_pyramid_tier handler (inline smoke test via investmentClockTools.ts)
 */

import { describe, it, expect } from "bun:test";
import { classifyPyramidTier } from "../domain/services/macro/pyramidTier.js";

// ─────────────────────────────────────────────────────────────────────────────
// Domain unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyPyramidTier — exact matches", () => {
  it("TC-1: 'cash' → tier=cash", () => {
    const result = classifyPyramidTier("cash");
    expect(result.tier).toBe("cash");
  });

  it("TC-2: 'VN equity' → tier=equity", () => {
    const result = classifyPyramidTier("VN equity");
    expect(result.tier).toBe("equity");
  });

  it("TC-3: 'government bond' → tier=bonds", () => {
    const result = classifyPyramidTier("government bond");
    expect(result.tier).toBe("bonds");
  });

  it("TC-4: 'gold' → tier=alt", () => {
    const result = classifyPyramidTier("gold");
    expect(result.tier).toBe("alt");
  });

  it("TC-5: 'crypto' → tier=speculative", () => {
    const result = classifyPyramidTier("crypto");
    expect(result.tier).toBe("speculative");
  });
});

describe("classifyPyramidTier — normalization", () => {
  it("TC-6: 'CRYPTO' (uppercase) → tier=speculative (case-insensitive)", () => {
    const result = classifyPyramidTier("CRYPTO");
    expect(result.tier).toBe("speculative");
  });

  it("TC-7: '  VN Equity  ' (whitespace + mixed case) → tier=equity", () => {
    const result = classifyPyramidTier("  VN Equity  ");
    expect(result.tier).toBe("equity");
  });
});

describe("classifyPyramidTier — unknown input", () => {
  it("TC-8: 'exotic_derivative_xyz' → tier=null, reason=unknown_asset_class", () => {
    const result = classifyPyramidTier("exotic_derivative_xyz");
    expect(result.tier).toBeNull();
    expect(result.reason).toBe("unknown_asset_class");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Additional coverage for other static map entries
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyPyramidTier — full static map coverage", () => {
  it("'money market' → cash", () => {
    expect(classifyPyramidTier("money market").tier).toBe("cash");
  });

  it("'t-bill' → cash", () => {
    expect(classifyPyramidTier("t-bill").tier).toBe("cash");
  });

  it("'corporate bond' → bonds", () => {
    expect(classifyPyramidTier("corporate bond").tier).toBe("bonds");
  });

  it("'bond' → bonds", () => {
    expect(classifyPyramidTier("bond").tier).toBe("bonds");
  });

  it("'equity' → equity", () => {
    expect(classifyPyramidTier("equity").tier).toBe("equity");
  });

  it("'stock' → equity", () => {
    expect(classifyPyramidTier("stock").tier).toBe("equity");
  });

  it("'reit' → alt", () => {
    expect(classifyPyramidTier("reit").tier).toBe("alt");
  });

  it("'commodity' → alt", () => {
    expect(classifyPyramidTier("commodity").tier).toBe("alt");
  });

  it("'futures' → alt", () => {
    expect(classifyPyramidTier("futures").tier).toBe("alt");
  });

  it("'private equity' → alt", () => {
    expect(classifyPyramidTier("private equity").tier).toBe("alt");
  });

  it("'nft' → speculative", () => {
    expect(classifyPyramidTier("nft").tier).toBe("speculative");
  });

  it("'warrant' → speculative", () => {
    expect(classifyPyramidTier("warrant").tier).toBe("speculative");
  });

  it("'penny stock' → speculative", () => {
    expect(classifyPyramidTier("penny stock").tier).toBe("speculative");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Return shape validation
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyPyramidTier — return shape", () => {
  it("known input includes tier_description", () => {
    const result = classifyPyramidTier("equity");
    expect(result.tier).toBe("equity");
    expect(typeof result.tier_description).toBe("string");
    expect(result.tier_description!.length).toBeGreaterThan(0);
  });

  it("unknown input has no tier_description", () => {
    const result = classifyPyramidTier("unknown_xyz");
    expect(result.tier).toBeNull();
    // tier_description should be absent or undefined for unknown
    expect(result.tier_description).toBeUndefined();
  });
});
