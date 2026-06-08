/**
 * TASK-BCTC-3b — hsxBctcFetcher unit tests
 *
 * Tests the two-call HTTP recipe against api.hsx.vn for BCTC PDF discovery.
 * All HTTP calls are mocked — no live network access.
 *
 * AC-4 test cases:
 *   1. HOSE ticker: ID lookup succeeds → PDFs returned
 *   2. Non-HOSE ticker: empty data.list → returns []
 *   3. HTTP error on call 1 (ID lookup) → returns []
 *   4. HTTP error on call 2 (mediafiles) → returns []
 *   5. filePath with ~ prefix → correctly replaced with https://staticfile.hsx.vn
 *   6. filePath without ~ prefix (edge case) → URL passes through unchanged
 *   + Strategy 0 fires first; Strategy 1 (VPS) fires only when hsx returns []
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";

// ─────────────────────────────────────────────────────────────────────────────
// Fetch interceptor helpers
// ─────────────────────────────────────────────────────────────────────────────

interface MockResponse {
  status: number;
  body: string;
}

/**
 * Multi-URL fetch mock. Maps URL substring patterns to mock responses.
 * First matching key wins.
 */
type UrlMockMap = Record<string, MockResponse>;

let urlMocks: UrlMockMap = {};
const originalFetch = globalThis.fetch;

function installUrlMocks(mocks: UrlMockMap): void {
  urlMocks = mocks;
  (globalThis as unknown as { fetch: typeof globalThis.fetch }).fetch = Object.assign(
    async (input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;

      for (const [pattern, mockResp] of Object.entries(urlMocks)) {
        if (url.includes(pattern)) {
          return new Response(mockResp.body, { status: mockResp.status });
        }
      }
      // No match → fail fast so tests don't silently hit real network
      throw new Error(`[test] Unmocked fetch URL: ${url}`);
    },
    { preconnect: () => { /* noop */ } },
  ) as typeof globalThis.fetch;
}

function restoreFetch(): void {
  globalThis.fetch = originalFetch;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sample fixture data (from live probe 2026-05-15)
// ─────────────────────────────────────────────────────────────────────────────

const VNM_ID = 2281;

const stockLookupResponse = (id: number, code: string) =>
  JSON.stringify({
    data: {
      list: [{ id, code, name: `Test Company ${code}` }],
    },
  });

const emptyStockLookupResponse = JSON.stringify({
  data: { list: [] },
});

const mediafilesResponse = (ticker: string) =>
  JSON.stringify({
    data: {
      list: [
        {
          fileName: `20260227 - ${ticker} - BCTC HOP NHAT 2025 - DA KIEM TOAN.pdf`,
          fileType: ".pdf",
          filePath: `~/Uploads/UploadDocuments/2440890/20260227 - ${ticker} - BCTC.pdf`,
          publishDate: 1735664400,
          time: "2025",
          type: "Nam",
        },
        {
          fileName: `20251101 - ${ticker} - BCTC Q3 2025.pdf`,
          fileType: ".pdf",
          filePath: `~/Uploads/UploadDocuments/2440890/20251101 - ${ticker} - Q3.pdf`,
          publishDate: 1735000000,
          time: "2025",
          type: "Quy",
        },
        {
          // Non-PDF item — should be filtered out
          fileName: `${ticker} - Annual Report.xlsx`,
          fileType: ".xlsx",
          filePath: `~/Uploads/UploadDocuments/2440890/${ticker} - report.xlsx`,
          publishDate: 1735000000,
          time: "2025",
          type: "Nam",
        },
        {
          // Item with no filePath — should be filtered out
          fileName: `${ticker} - Notice.pdf`,
          fileType: ".pdf",
          filePath: "",
          publishDate: 1735000000,
          time: "2025",
          type: "Nam",
        },
      ],
    },
  });

const emptyMediafilesResponse = JSON.stringify({
  data: { list: [] },
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK-BCTC-3b — fetchHsxBctcUrls", () => {
  afterEach(() => {
    restoreFetch();
    urlMocks = {};
    delete Bun.env["HSX_BCTC_ENABLED"];
  });

  // ── TC-ENV: HSX_BCTC_ENABLED=false → immediate [] without any HTTP call ──

  it("TC-ENV: HSX_BCTC_ENABLED=false returns [] without making any HTTP call", async () => {
    Bun.env["HSX_BCTC_ENABLED"] = "false";

    // No mocks installed — any real fetch call would throw
    installUrlMocks({});

    const { fetchHsxBctcUrls } = await import(
      "../infrastructure/fetchers/hsxBctcFetcher.js"
    );

    const urls = await fetchHsxBctcUrls("VNM", 2025, 5000);

    expect(urls).toEqual([]);
  });

  // ── TC-1: HOSE ticker — ID lookup succeeds → PDFs returned ───────────────

  it("TC-1: HOSE ticker — resolves ID and returns PDF URLs", async () => {
    installUrlMocks({
      "/l/api/v1/1/securities/stock": {
        status: 200,
        body: stockLookupResponse(VNM_ID, "VNM"),
      },
      "/m/api/v1/1/mediafiles/5/": {
        status: 200,
        body: mediafilesResponse("VNM"),
      },
    });

    const { fetchHsxBctcUrls } = await import(
      "../infrastructure/fetchers/hsxBctcFetcher.js"
    );

    const urls = await fetchHsxBctcUrls("VNM", 2025, 5000);

    // Should return 2 PDF URLs (xlsx and empty-filePath items filtered out)
    expect(urls.length).toBe(2);
    urls.forEach((url) => {
      expect(url).toMatch(/^https:\/\/staticfile\.hsx\.vn\//);
      expect(url).toMatch(/\.pdf$/);
    });
  });

  // ── TC-2: Non-HOSE ticker — empty list → returns [] ──────────────────────

  it("TC-2: non-HOSE ticker — empty data.list returns []", async () => {
    installUrlMocks({
      "/l/api/v1/1/securities/stock": {
        status: 200,
        body: emptyStockLookupResponse,
      },
    });

    const { fetchHsxBctcUrls } = await import(
      "../infrastructure/fetchers/hsxBctcFetcher.js"
    );

    const urls = await fetchHsxBctcUrls("HNX_TICKER", 2025, 5000);

    expect(urls).toEqual([]);
  });

  // ── TC-3: HTTP error on call 1 → returns [] ───────────────────────────────

  it("TC-3: HTTP 4xx on ID lookup → returns []", async () => {
    installUrlMocks({
      "/l/api/v1/1/securities/stock": {
        status: 404,
        body: "",
      },
    });

    const { fetchHsxBctcUrls } = await import(
      "../infrastructure/fetchers/hsxBctcFetcher.js"
    );

    const urls = await fetchHsxBctcUrls("VNM", 2025, 5000);

    expect(urls).toEqual([]);
  });

  // ── TC-4: HTTP error on call 2 → returns [] ───────────────────────────────

  it("TC-4: HTTP 500 on mediafiles call → returns []", async () => {
    installUrlMocks({
      "/l/api/v1/1/securities/stock": {
        status: 200,
        body: stockLookupResponse(VNM_ID, "VNM"),
      },
      "/m/api/v1/1/mediafiles/5/": {
        status: 500,
        body: "",
      },
    });

    const { fetchHsxBctcUrls } = await import(
      "../infrastructure/fetchers/hsxBctcFetcher.js"
    );

    const urls = await fetchHsxBctcUrls("VNM", 2025, 5000);

    expect(urls).toEqual([]);
  });

  // ── TC-5: filePath with ~ prefix → correctly replaced AND spaces encoded ──
  // B3-SPACE-URLS-FIX (2026-06-07): previously expected raw spaces in the URL
  // (broken behavior). Now expects percent-encoded URL — no literal spaces.

  it("TC-5: filePath tilde prefix → replaced with https://staticfile.hsx.vn AND spaces percent-encoded", async () => {
    installUrlMocks({
      "/l/api/v1/1/securities/stock": {
        status: 200,
        body: stockLookupResponse(VNM_ID, "VNM"),
      },
      "/m/api/v1/1/mediafiles/5/": {
        status: 200,
        body: JSON.stringify({
          data: {
            list: [
              {
                fileName: "VNM - BCTC 2025.pdf",
                fileType: ".pdf",
                filePath:
                  "~/Uploads/UploadDocuments/2440890/20260227 - VNM - BCTC HOP NHAT 2025 - DA KIEM TOAN.pdf",
              },
            ],
          },
        }),
      },
    });

    const { fetchHsxBctcUrls } = await import(
      "../infrastructure/fetchers/hsxBctcFetcher.js"
    );

    const urls = await fetchHsxBctcUrls("VNM", 2025, 5000);

    expect(urls.length).toBe(1);
    // Spaces must be percent-encoded (B3-SPACE-URLS-FIX)
    expect(urls[0]).not.toContain(" ");
    expect(urls[0]).toBe(
      "https://staticfile.hsx.vn/Uploads/UploadDocuments/2440890/20260227%20-%20VNM%20-%20BCTC%20HOP%20NHAT%202025%20-%20DA%20KIEM%20TOAN.pdf",
    );
  });

  // ── TC-6: filePath without ~ prefix → URL passes through ─────────────────

  it("TC-6: filePath without tilde prefix → URL constructed without substitution", async () => {
    installUrlMocks({
      "/l/api/v1/1/securities/stock": {
        status: 200,
        body: stockLookupResponse(VNM_ID, "VNM"),
      },
      "/m/api/v1/1/mediafiles/5/": {
        status: 200,
        body: JSON.stringify({
          data: {
            list: [
              {
                fileName: "VNM - BCTC 2025.pdf",
                fileType: ".pdf",
                filePath: "https://staticfile.hsx.vn/Uploads/already-absolute.pdf",
              },
            ],
          },
        }),
      },
    });

    const { fetchHsxBctcUrls } = await import(
      "../infrastructure/fetchers/hsxBctcFetcher.js"
    );

    const urls = await fetchHsxBctcUrls("VNM", 2025, 5000);

    // No substitution since there is no ~ in the path
    expect(urls.length).toBe(1);
    expect(urls[0]).toBe(
      "https://staticfile.hsx.vn/Uploads/already-absolute.pdf",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Strategy ordering: hsx fires first; VPS fires only when hsx returns []
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK-BCTC-3b — discoverHosePdfUrls strategy ordering", () => {
  beforeEach(() => {
    // Set BCTC_DISCOVER_URL so strategy 1 (VPS Playwright) is eligible
    Bun.env["BCTC_DISCOVER_URL"] =
      "http://125.212.251.27:8765/proxy/bctc-discover";
  });

  afterEach(() => {
    delete Bun.env["BCTC_DISCOVER_URL"];
  });

  it("TC-7: Strategy 0 (hsx) fires first and returns early — VPS never called", async () => {
    let vpsCallCount = 0;

    const mockFetchHsx = async (
      _ticker: string,
      _year: number,
      _timeoutMs: number,
    ): Promise<string[]> => {
      return ["https://staticfile.hsx.vn/Uploads/vnm-bctc-2025.pdf"];
    };

    const mockVpsPlaywright = async (
      _url: string,
      _timeoutMs: number,
    ): Promise<string> => {
      vpsCallCount++;
      return JSON.stringify({
        results: [
          {
            url: "https://vps.example.com/vnm.pdf",
            source: "ssc-hose",
            confidence: 0.9,
          },
        ],
        error: null,
      });
    };

    const { discoverHosePdfUrls } = await import(
      "../domain/services/bctcDiscovery.js"
    );

    const result = await discoverHosePdfUrls("VNM", {
      _fetchHsx: mockFetchHsx,
      _fetchVpsPlaywright: mockVpsPlaywright,
      _fetchSsc: async () => JSON.stringify({ data: [] }),
      _fetchVietstock: async () => "<html></html>",
    });

    expect(result.source).toBe("hsx");
    expect(result.urls.length).toBeGreaterThan(0);
    expect(vpsCallCount).toBe(0);
  });

  it("TC-8: Strategy 0 (hsx) returns [] → Strategy 1 (VPS) fires", async () => {
    let vpsCallCount = 0;

    const mockFetchHsx = async (
      _ticker: string,
      _year: number,
      _timeoutMs: number,
    ): Promise<string[]> => {
      return [];
    };

    const mockVpsPlaywright = async (
      _url: string,
      _timeoutMs: number,
    ): Promise<string> => {
      vpsCallCount++;
      return JSON.stringify({
        results: [
          {
            url: "https://congbothongtin.ssc.gov.vn/vnm-bctc.pdf",
            source: "ssc-hose",
            confidence: 0.9,
          },
        ],
        error: null,
      });
    };

    const { discoverHosePdfUrls } = await import(
      "../domain/services/bctcDiscovery.js"
    );

    const result = await discoverHosePdfUrls("VNM", {
      _fetchHsx: mockFetchHsx,
      _fetchVpsPlaywright: mockVpsPlaywright,
      _fetchSsc: async () => JSON.stringify({ data: [] }),
      _fetchVietstock: async () => "<html></html>",
    });

    expect(result.source).toBe("vps-playwright");
    expect(vpsCallCount).toBe(1);
  });
});
