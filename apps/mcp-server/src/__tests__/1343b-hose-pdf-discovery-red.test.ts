// apps/mcp-server/src/__tests__/1343b-hose-pdf-discovery-red.test.ts
// RED phase — discoverHosePdfUrls() does NOT exist yet (implemented in 1343c)
// All 4 tests must fail until 1343c provides the implementation.
import { describe, it, expect } from "bun:test";
import { discoverHosePdfUrls } from "../domain/services/bctcDiscovery.js";

describe("1343b — HOSE PDF Discovery RED", () => {

  // RED Test 1: SSC API returns PDF URLs for HOSE tickers
  it("should discover PDF URLs from SSC for HOSE-listed tickers", async () => {
    const hoseTickersSample = ["BID", "EIB", "FPT", "VCB", "HPG", "VNM", "SBT"];

    for (const ticker of hoseTickersSample) {
      const result = await discoverHosePdfUrls(ticker);
      expect(result).toBeDefined();
      expect(result.urls?.length).toBeGreaterThan(0); // RED: will fail — function not implemented
      expect(result.source).toBe("ssc");
      result.urls?.forEach(url => {
        expect(url).toMatch(/\.pdf$/i);
      });
    }
  });

  // RED Test 2: Fallback to cafef.vn if SSC fails
  it("should fallback to cafef.vn when SSC returns no results", async () => {
    const ticker = "FPT";
    const result = await discoverHosePdfUrls(ticker);

    if (!result.urls || result.urls.length === 0) {
      // Expect cafef fallback
      expect(result.fallbackSource).toBe("cafef");
      expect(result.fallbackUrls?.length).toBeGreaterThan(0); // RED: will fail — function not implemented
    }
  });

  // RED Test 3: Source attribution
  it("should include source attribution in result", async () => {
    const ticker = "VCB";
    const result = await discoverHosePdfUrls(ticker);

    expect(result.source).toBeDefined();
    expect(["ssc", "cafef", "vietstock"]).toContain(result.source);
  });

  // RED Test 4: Return empty gracefully if no source works
  it("should return empty result if all sources fail", async () => {
    const ticker = "FAKE_TICKER";
    const result = await discoverHosePdfUrls(ticker);

    expect(result).toEqual({
      urls: [],
      source: null,
      fallbackUrls: [],
      fallbackSource: null
    });
  });
});
