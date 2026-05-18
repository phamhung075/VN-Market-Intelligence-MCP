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

  // Test 1: VPS Playwright returns PDF URLs for HOSE tickers (TASK_1944b: SSC removed)
  it("should discover PDF URLs via VPS Playwright for HOSE-listed tickers", async () => {
    // TASK_1944b: SSC strategy removed. Use VPS Playwright mock instead.
    const hoseTickersSample = ["BID", "EIB", "FPT", "VCB", "HPG", "VNM", "SBT"];

    const prevUrl = Bun.env["BCTC_DISCOVER_URL"];
    Bun.env["BCTC_DISCOVER_URL"] = "http://125.212.251.27:8765/proxy/bctc-discover";

    try {
      for (const ticker of hoseTickersSample) {
        const pdfUrl = `https://owa.hnx.vn/ftp/${ticker.toLowerCase()}-bctc-q4-2025.pdf`;
        const result = await discoverHosePdfUrls(ticker, {
          _fetchVpsPlaywright: async (_url, _timeout) =>
            JSON.stringify({
              results: [{ url: pdfUrl, source: "HNX", confidence: 0.9 }],
              error: null,
            }),
          _fetchSsc: mockSscFetch(pdfUrl),    // deprecated no-op
          _fetchCafef: mockFetchEmptyHtml,     // deprecated no-op
          _fetchVietstock: mockFetchEmptyHtml, // deprecated no-op
        });

        expect(result).toBeDefined();
        expect(result.urls?.length).toBeGreaterThan(0);
        expect(result.source).toBe("vps-playwright");
        result.urls?.forEach(url => {
          expect(url).toMatch(/\.pdf$/i);
        });
      }
    } finally {
      if (prevUrl === undefined) delete Bun.env["BCTC_DISCOVER_URL"];
      else Bun.env["BCTC_DISCOVER_URL"] = prevUrl;
    }
  });

  // Test 2: TASK_1916b -- cafef.vn strategy permanently removed.
  // When SSC returns nothing and vietstock also returns nothing, result is null.
  // _fetchCafef is now a no-op (deprecated backward-compat field, never called).
  it("should return null source when SSC and vietstock both return no results (cafef removed in TASK_1916b)", async () => {
    const ticker = "FPT";
    // _fetchCafef is now ignored (deprecated no-op) -- pass any value
    const result = await discoverHosePdfUrls(ticker, {
      _fetchSsc: mockFetchEmpty,           // SSC returns nothing
      _fetchCafef: mockFetchEmptyHtml,     // ignored (deprecated)
      _fetchVietstock: mockFetchEmptyHtml, // vietstock also returns nothing
    });

    // cafef is no longer tried -- result has no PDF URLs
    expect(result.source).toBeNull();
    expect(result.urls).toHaveLength(0);
  });

  // Test 3: Source attribution (TASK_1944b: SSC/vietstock removed — only hsx/vps-playwright valid)
  it("should include source attribution from VPS Playwright in result", async () => {
    // TASK_1944b: SSC/cafef/vietstock removed. Only hsx and vps-playwright are live sources.
    const ticker = "VCB";
    const pdfUrl = `https://owa.hnx.vn/ftp/vcb-bctc-q4-2025.pdf`;

    const prevUrl = Bun.env["BCTC_DISCOVER_URL"];
    Bun.env["BCTC_DISCOVER_URL"] = "http://125.212.251.27:8765/proxy/bctc-discover";

    try {
      const result = await discoverHosePdfUrls(ticker, {
        _fetchVpsPlaywright: async (_url, _timeout) =>
          JSON.stringify({
            results: [{ url: pdfUrl, source: "HNX", confidence: 0.9 }],
            error: null,
          }),
        _fetchSsc: mockSscFetch(pdfUrl),    // deprecated no-op
        _fetchCafef: mockFetchEmptyHtml,     // deprecated no-op
        _fetchVietstock: mockFetchEmptyHtml, // deprecated no-op
      });

      expect(result.source).toBeDefined();
      expect(result.source).not.toBeNull();
      expect(["hsx", "vps-playwright"]).toContain(result.source as string);
    } finally {
      if (prevUrl === undefined) delete Bun.env["BCTC_DISCOVER_URL"];
      else Bun.env["BCTC_DISCOVER_URL"] = prevUrl;
    }
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
