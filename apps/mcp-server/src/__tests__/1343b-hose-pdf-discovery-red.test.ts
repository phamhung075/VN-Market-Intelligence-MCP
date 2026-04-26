// apps/mcp-server/src/__tests__/1343b-hose-pdf-discovery-red.test.ts
// GREEN phase — discoverHosePdfUrls() implemented in 1343c.
// HTTP calls are injected via options._fetchSsc / _fetchCafef / _fetchVietstock
// to avoid real network calls (SSC / cafef are geo-blocked from France).
import { describe, it, expect } from "bun:test";
import { discoverHosePdfUrls } from "../domain/services/bctcDiscovery.js";

// ─────────────────────────────────────────────────────────────────────────────
// Mock fetch helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Simulates an SSC iboard JSON response containing one PDF URL for the ticker.
 */
function mockSscFetch(pdfUrl: string) {
  return async (_url: string, _timeout: number): Promise<string> => {
    return JSON.stringify({
      data: [{ fileUrl: pdfUrl }],
    });
  };
}

/**
 * Simulates a cafef HTML page containing one PDF link.
 */
function mockCafefFetch(pdfUrl: string) {
  return async (_url: string, _timeout: number): Promise<string> => {
    return `<html><body><a href="${pdfUrl}">BCTC 2025</a></body></html>`;
  };
}

/**
 * Simulates a vietstock HTML page containing one PDF link.
 */
function mockVietstockFetch(pdfUrl: string) {
  return async (_url: string, _timeout: number): Promise<string> => {
    return `<html><body><a href="${pdfUrl}">Bao cao tai chinh</a></body></html>`;
  };
}

/** Always rejects — simulates network/geo-block failure. */
async function mockFetchFail(_url: string, _timeout: number): Promise<string> {
  throw new Error("Connection refused (geo-blocked)");
}

/** Always returns empty JSON array — source has no documents for this ticker. */
async function mockFetchEmpty(_url: string, _timeout: number): Promise<string> {
  return JSON.stringify({ data: [] });
}

/** Returns HTML with no PDF links. */
async function mockFetchEmptyHtml(_url: string, _timeout: number): Promise<string> {
  return "<html><body><p>No documents found.</p></body></html>";
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("1343b — HOSE PDF Discovery", () => {

  // Test 1: SSC API returns PDF URLs for HOSE tickers
  it("should discover PDF URLs from SSC for HOSE-listed tickers", async () => {
    const hoseTickersSample = ["BID", "EIB", "FPT", "VCB", "HPG", "VNM", "SBT"];

    for (const ticker of hoseTickersSample) {
      const pdfUrl = `https://iboard-query.ssc.vn/static/${ticker.toLowerCase()}-bctc-q4-2025.pdf`;
      const result = await discoverHosePdfUrls(ticker, {
        _fetchSsc: mockSscFetch(pdfUrl),
        _fetchCafef: mockFetchEmptyHtml,
        _fetchVietstock: mockFetchEmptyHtml,
      });

      expect(result).toBeDefined();
      expect(result.urls?.length).toBeGreaterThan(0);
      expect(result.source).toBe("ssc");
      result.urls?.forEach(url => {
        expect(url).toMatch(/\.pdf$/i);
      });
    }
  });

  // Test 2: Fallback to cafef.vn if SSC fails
  it("should fallback to cafef.vn when SSC returns no results", async () => {
    const ticker = "FPT";
    const cafefPdfUrl = `https://cafef.vn/static/fpt-bctc-q4-2025.pdf`;

    const result = await discoverHosePdfUrls(ticker, {
      _fetchSsc: mockFetchEmpty,   // SSC returns nothing for this ticker
      _fetchCafef: mockCafefFetch(cafefPdfUrl),
      _fetchVietstock: mockFetchEmptyHtml,
    });

    // Primary source should be cafef since SSC returned nothing
    expect(result.source).toBe("cafef");
    expect(result.urls?.length).toBeGreaterThan(0);
    result.urls?.forEach(url => {
      expect(url).toMatch(/\.pdf$/i);
    });
  });

  // Test 3: Source attribution
  it("should include source attribution in result", async () => {
    const ticker = "VCB";
    const pdfUrl = `https://iboard-query.ssc.vn/static/vcb-bctc-q4-2025.pdf`;

    const result = await discoverHosePdfUrls(ticker, {
      _fetchSsc: mockSscFetch(pdfUrl),
      _fetchCafef: mockFetchEmptyHtml,
      _fetchVietstock: mockFetchEmptyHtml,
    });

    expect(result.source).toBeDefined();
    expect(result.source).not.toBeNull();
    expect(["ssc", "cafef", "vietstock"]).toContain(result.source as string);
  });

  // Test 4: Return empty gracefully if all sources fail
  it("should return empty result if all sources fail", async () => {
    const ticker = "FAKE_TICKER";
    const result = await discoverHosePdfUrls(ticker, {
      _fetchSsc: mockFetchFail,
      _fetchCafef: mockFetchFail,
      _fetchVietstock: mockFetchFail,
    });

    expect(result).toEqual({
      urls: [],
      source: null,
      fallbackUrls: [],
      fallbackSource: null,
    });
  });
});
