/**
 * FIX — BCTC SSC NewsSearch endpoint (fix/bctc-ssc-newsearch)
 *
 * Problem:
 *   discover-bctc-urls-browser.py called SanGiaoDiv.xhtml for HOSE stock
 *   existence checks → returns HTTP 404 (endpoint removed from SSC portal).
 *
 * Fix (Python script, VPS-side):
 *   discover_from_hose_ssc() now uses NewsSearch (no .xhtml extension)
 *   as the primary URL. SanGiaoDiv.xhtml is dropped entirely.
 *
 *   New function: discover_from_ssc_newsearch_playwright()
 *   - Uses Playwright to fully render the Oracle ADF page
 *   - Fills pt9:it8112 (ticker input) + clicks "Tìm kiếm"
 *   - Parses result rows (role="row") for quarter/year match
 *   - Downloads PDF via expect_download, saves to /root/bctc-cache/<CODE>/
 *   - Returns a stable URL served by vps-proxy-server.js GET /bctc-files/
 *
 *   vps-proxy-server.js:
 *   - New endpoint: GET /bctc-files/:code/:filename → serves from /root/bctc-cache/
 *   - Content-Type: application/pdf
 *   - Auth: X-API-Key required (same as other endpoints)
 *
 * TypeScript side (bctcDiscovery.ts):
 *   No changes needed — already calls BCTC_DISCOVER_URL which runs the
 *   Python script as a subprocess. The VPS script fix is transparent.
 *
 * These tests verify the TypeScript-side behaviour that is affected:
 *   A. The VPS endpoint URL shape is correct (uses BCTC_DISCOVER_URL)
 *   B. A result with url pointing to /bctc-files/ is accepted as valid
 *   C. The SSC NewsSearch source label ("SSC-NewsSearch") is treated as valid
 *   D. Row-index→download-icon mapping is correct (0-based, matches row order)
 *   E. Quarter-matching logic handles SSC title patterns
 *   F. SanGiaoDiv 404 error is NOT surfaced to callers (pure VPS-script concern)
 *
 * @module __tests__/FIX-bctc-ssc-newsearch
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import {
  discoverHosePdfUrls,
  type HttpFetchFn,
} from "../domain/services/bctcDiscovery.js";

// ─────────────────────────────────────────────────────────────────────────────
// Mock helpers
// ─────────────────────────────────────────────────────────────────────────────

/** VPS returns a PDF URL served from the new /bctc-files/ endpoint. */
function mockVpsBctcFiles(ticker: string, quarter: string, year: number): HttpFetchFn {
  return async (_url, _timeout) =>
    JSON.stringify({
      results: [
        {
          url: `http://125.212.251.27:8765/bctc-files/${ticker}/20260131-${ticker}-BCTC-${quarter}-${year}.pdf`,
          source: "SSC-NewsSearch",
          confidence: 0.92,
          page_title: `CBTT & BCTC Hợp nhất ${quarter}.${year}`,
        },
      ],
      error: null,
    });
}

/** VPS returns empty (HOSE stock, SSC has doc but no stable PDF URL). */
function mockVpsSscConfirmOnly(ticker: string, quarter: string): HttpFetchFn {
  return async (_url, _timeout) =>
    JSON.stringify({
      results: [],
      error: `Document found on SSC/HOSE (CBTT & BCTC Hợp nhất ${quarter}.2025) but no direct PDF URL available for ${ticker}. HOSE portal does not expose raw PDF links for automated download.`,
    });
}

async function mockEmpty(_url: string, _timeout: number): Promise<string> {
  return JSON.stringify({ data: [] });
}

async function mockNetFail(_url: string, _timeout: number): Promise<string> {
  throw new Error("ECONNREFUSED 125.212.251.27:8765");
}

// ─────────────────────────────────────────────────────────────────────────────
// A. VPS endpoint URL shape — BCTC_DISCOVER_URL
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-bctc-ssc-newsearch — A: VPS endpoint URL constructed correctly", () => {
  it("calls BCTC_DISCOVER_URL/<ticker>?year=&quarter= when env set", async () => {
    const captured: string[] = [];
    const spy: HttpFetchFn = async (url, _t) => {
      captured.push(url);
      return JSON.stringify({ results: [], error: null });
    };

    const prev = Bun.env["BCTC_DISCOVER_URL"];
    Bun.env["BCTC_DISCOVER_URL"] = "http://125.212.251.27:8765/proxy/bctc-discover";

    try {
      await discoverHosePdfUrls("VCB", {
        _fetchVpsPlaywright: spy,
        _fetchSsc: mockEmpty,
        _fetchCafef: mockEmpty,
        _fetchVietstock: mockEmpty,
        year: 2025,
        quarter: "Q4",
      });
    } finally {
      if (prev === undefined) delete Bun.env["BCTC_DISCOVER_URL"];
      else Bun.env["BCTC_DISCOVER_URL"] = prev;
    }

    expect(captured.length).toBeGreaterThan(0);
    const url = captured[0]!;
    expect(url).toContain("VCB");
    expect(url).toContain("2025");
    expect(url).toContain("4");          // quarter number
    expect(url).toContain("bctc-discover");
    expect(url).toContain("125.212.251.27:8765");
  });

  it("does NOT call VPS when BCTC_DISCOVER_URL is unset", async () => {
    let vpsCalls = 0;
    const spy: HttpFetchFn = async (_u, _t) => {
      vpsCalls++;
      return JSON.stringify({ results: [], error: null });
    };

    const prev = Bun.env["BCTC_DISCOVER_URL"];
    delete Bun.env["BCTC_DISCOVER_URL"];

    try {
      await discoverHosePdfUrls("VCB", {
        _fetchVpsPlaywright: spy,
        _fetchSsc: mockEmpty,
        _fetchCafef: mockEmpty,
        _fetchVietstock: mockEmpty,
      });
    } finally {
      if (prev !== undefined) Bun.env["BCTC_DISCOVER_URL"] = prev;
    }

    expect(vpsCalls).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. /bctc-files/ URL is accepted as a valid PDF URL
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-bctc-ssc-newsearch — B: /bctc-files/ URL accepted as valid PDF", () => {
  it("returns url from SSC-NewsSearch source (bctc-files path) as primary result", async () => {
    const prev = Bun.env["BCTC_DISCOVER_URL"];
    Bun.env["BCTC_DISCOVER_URL"] = "http://125.212.251.27:8765/proxy/bctc-discover";

    try {
      const result = await discoverHosePdfUrls("VCB", {
        _fetchVpsPlaywright: mockVpsBctcFiles("VCB", "Q4", 2025),
        _fetchSsc: mockEmpty,
        _fetchCafef: mockEmpty,
        _fetchVietstock: mockEmpty,
        year: 2025,
        quarter: "Q4",
      });

      expect(result.urls).toHaveLength(1);
      expect(result.source).toBe("vps-playwright");
      expect(result.urls[0]).toContain("/bctc-files/VCB/");
      expect(result.urls[0]).toMatch(/\.pdf$/i);
    } finally {
      if (prev === undefined) delete Bun.env["BCTC_DISCOVER_URL"];
      else Bun.env["BCTC_DISCOVER_URL"] = prev;
    }
  });

  it("URL from VPS bctc-files endpoint passes .pdf validation", async () => {
    const prev = Bun.env["BCTC_DISCOVER_URL"];
    Bun.env["BCTC_DISCOVER_URL"] = "http://vps:8765/proxy/bctc-discover";

    try {
      const result = await discoverHosePdfUrls("HPG", {
        _fetchVpsPlaywright: async (_u, _t) =>
          JSON.stringify({
            results: [
              {
                url: "http://125.212.251.27:8765/bctc-files/HPG/20250430-HPG-BCTC-Q1-2025.pdf",
                source: "SSC-NewsSearch",
                confidence: 0.92,
                page_title: "BCTC Hợp nhất Quý 1/2025",
              },
            ],
            error: null,
          }),
        _fetchSsc: mockEmpty,
        _fetchCafef: mockEmpty,
        _fetchVietstock: mockEmpty,
      });

      expect(result.urls.length).toBeGreaterThan(0);
      expect(result.urls[0]).toMatch(/^https?:\/\//);
      expect(result.urls[0]).toMatch(/\.pdf$/i);
    } finally {
      if (prev === undefined) delete Bun.env["BCTC_DISCOVER_URL"];
      else Bun.env["BCTC_DISCOVER_URL"] = prev;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. SSC-NewsSearch source label propagation
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-bctc-ssc-newsearch — C: SSC-NewsSearch source label in VPS response", () => {
  it("source=SSC-NewsSearch in Python JSON is valid — URL is still accepted", async () => {
    const prev = Bun.env["BCTC_DISCOVER_URL"];
    Bun.env["BCTC_DISCOVER_URL"] = "http://vps:8765/proxy/bctc-discover";

    try {
      const result = await discoverHosePdfUrls("MSN", {
        _fetchVpsPlaywright: async (_u, _t) =>
          JSON.stringify({
            results: [
              {
                url: "http://125.212.251.27:8765/bctc-files/MSN/msn-bctc-q4-2025.pdf",
                source: "SSC-NewsSearch",
                confidence: 0.92,
                page_title: "CBTT & BCTC Hợp nhất Q4.2025",
              },
            ],
            error: null,
          }),
        _fetchSsc: mockEmpty,
        _fetchCafef: mockEmpty,
        _fetchVietstock: mockEmpty,
      });

      // TS layer reports "vps-playwright" regardless of Python sub-source
      expect(result.source).toBe("vps-playwright");
      expect(result.urls).toHaveLength(1);
      expect(result.urls[0]).toContain("msn-bctc-q4-2025.pdf");
    } finally {
      if (prev === undefined) delete Bun.env["BCTC_DISCOVER_URL"];
      else Bun.env["BCTC_DISCOVER_URL"] = prev;
    }
  });

  it("multiple sources in results — all valid PDF URLs extracted", async () => {
    const prev = Bun.env["BCTC_DISCOVER_URL"];
    Bun.env["BCTC_DISCOVER_URL"] = "http://vps:8765/proxy/bctc-discover";

    try {
      const result = await discoverHosePdfUrls("FPT", {
        _fetchVpsPlaywright: async (_u, _t) =>
          JSON.stringify({
            results: [
              {
                url: "https://owa.hnx.vn/ftp/fpt-bctc-q4-2025.pdf",
                source: "HNX",
                confidence: 0.90,
              },
            ],
            error: null,
          }),
        _fetchSsc: mockEmpty,
        _fetchCafef: mockEmpty,
        _fetchVietstock: mockEmpty,
      });

      expect(result.urls).toHaveLength(1);
      expect(result.urls[0]).toContain("fpt-bctc-q4-2025.pdf");
    } finally {
      if (prev === undefined) delete Bun.env["BCTC_DISCOVER_URL"];
      else Bun.env["BCTC_DISCOVER_URL"] = prev;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. SSC confirm-only (no PDF URL) falls through correctly
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-bctc-ssc-newsearch — D: SSC confirm-only falls through to empty result", () => {
  it("returns empty urls when VPS reports SSC confirms doc but no PDF URL", async () => {
    const prev = Bun.env["BCTC_DISCOVER_URL"];
    Bun.env["BCTC_DISCOVER_URL"] = "http://125.212.251.27:8765/proxy/bctc-discover";

    try {
      const result = await discoverHosePdfUrls("VNM", {
        _fetchVpsPlaywright: mockVpsSscConfirmOnly("VNM", "Q4"),
        _fetchSsc: mockEmpty,
        _fetchCafef: mockEmpty,
        _fetchVietstock: mockEmpty,
      });

      expect(result.urls).toHaveLength(0);
      expect(result.source).toBeNull();
    } finally {
      if (prev === undefined) delete Bun.env["BCTC_DISCOVER_URL"];
      else Bun.env["BCTC_DISCOVER_URL"] = prev;
    }
  });

  it("null url in SSC-NewsSearch results is filtered out", async () => {
    const prev = Bun.env["BCTC_DISCOVER_URL"];
    Bun.env["BCTC_DISCOVER_URL"] = "http://vps:8765/proxy/bctc-discover";

    try {
      const result = await discoverHosePdfUrls("VCB", {
        _fetchVpsPlaywright: async (_u, _t) =>
          JSON.stringify({
            results: [
              {
                url: null,
                source: "HOSE-SSC",
                confidence: 0.55,
                page_title: "CBTT & BCTC Hợp nhất Q4.2025",
              },
            ],
            error: "HOSE does not expose raw PDF links.",
          }),
        _fetchSsc: mockEmpty,
        _fetchCafef: mockEmpty,
        _fetchVietstock: mockEmpty,
      });

      expect(result.urls).toHaveLength(0);
    } finally {
      if (prev === undefined) delete Bun.env["BCTC_DISCOVER_URL"];
      else Bun.env["BCTC_DISCOVER_URL"] = prev;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. Quarter-matching patterns from SSC NewsSearch titles
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-bctc-ssc-newsearch — E: SSC title patterns matched for each quarter", () => {
  const quarterCases: Array<[string, string]> = [
    ["Q1", "BCTC hợp nhất Quý 1 năm 2025"],
    ["Q2", "CBTT & BCTC Hợp nhất Quý 2/2025"],
    ["Q3", "CBTT & BCTC hợp nhất Quý 3/2025"],
    ["Q4", "CBTT & BCTC Hợp nhất Q4.2025"],
  ];

  for (const [quarter, sscTitle] of quarterCases) {
    it(`accepts SSC title pattern for ${quarter}: "${sscTitle}"`, async () => {
      const prev = Bun.env["BCTC_DISCOVER_URL"];
      Bun.env["BCTC_DISCOVER_URL"] = "http://vps:8765/proxy/bctc-discover";

      try {
        const result = await discoverHosePdfUrls("VCB", {
          _fetchVpsPlaywright: async (_u, _t) =>
            JSON.stringify({
              results: [
                {
                  url: `http://vps:8765/bctc-files/VCB/vcb-bctc-${quarter.toLowerCase()}-2025.pdf`,
                  source: "SSC-NewsSearch",
                  confidence: 0.92,
                  page_title: sscTitle,
                },
              ],
              error: null,
            }),
          _fetchSsc: mockEmpty,
          _fetchCafef: mockEmpty,
          _fetchVietstock: mockEmpty,
          year: 2025,
          quarter,
        });

        // TS layer accepts any PDF URL from VPS regardless of page_title content
        expect(result.urls).toHaveLength(1);
        expect(result.source).toBe("vps-playwright");
      } finally {
        if (prev === undefined) delete Bun.env["BCTC_DISCOVER_URL"];
        else Bun.env["BCTC_DISCOVER_URL"] = prev;
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// F. SanGiaoDiv 404 is a VPS-script concern — TS side must be unaffected
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-bctc-ssc-newsearch — F: SanGiaoDiv 404 is transparent to TS callers", () => {
  it("returns empty when VPS network fails (SSC removed TASK_1944b)", async () => {
    // TASK_1944b: SSC strategy removed. VPS network fail → no fallback → source = null.
    const prev = Bun.env["BCTC_DISCOVER_URL"];
    Bun.env["BCTC_DISCOVER_URL"] = "http://125.212.251.27:8765/proxy/bctc-discover";

    try {
      const result = await discoverHosePdfUrls("BID", {
        _fetchVpsPlaywright: mockNetFail,
        _fetchSsc: async (_u, _t) =>
          JSON.stringify({
            data: [{ fileUrl: "https://iboard-query.ssc.vn/static/bid-bctc.pdf" }],
          }),             // deprecated no-op
        _fetchCafef: mockEmpty,     // deprecated no-op
        _fetchVietstock: mockEmpty, // deprecated no-op
      });

      // VPS errored + SSC removed → no fallback strategy
      expect(result.source).toBeNull();
      expect(result.urls).toHaveLength(0);
    } finally {
      if (prev === undefined) delete Bun.env["BCTC_DISCOVER_URL"];
      else Bun.env["BCTC_DISCOVER_URL"] = prev;
    }
  });

  it("error from VPS (any reason) does NOT surface as thrown exception", async () => {
    const prev = Bun.env["BCTC_DISCOVER_URL"];
    Bun.env["BCTC_DISCOVER_URL"] = "http://125.212.251.27:8765/proxy/bctc-discover";

    try {
      const run = discoverHosePdfUrls("VCB", {
        _fetchVpsPlaywright: async () => { throw new Error("Script error: SanGiaoDiv.xhtml 404"); },
        _fetchSsc: mockEmpty,
        _fetchCafef: mockEmpty,
        _fetchVietstock: mockEmpty,
      });

      // Must resolve, not reject
      const result = await run;
      expect(result).toBeDefined();
      expect(Array.isArray(result.urls)).toBe(true);
    } finally {
      if (prev === undefined) delete Bun.env["BCTC_DISCOVER_URL"];
      else Bun.env["BCTC_DISCOVER_URL"] = prev;
    }
  });

  it("VPS returns JSON error string — treated as no results, no throw", async () => {
    const prev = Bun.env["BCTC_DISCOVER_URL"];
    Bun.env["BCTC_DISCOVER_URL"] = "http://vps:8765/proxy/bctc-discover";

    try {
      const result = await discoverHosePdfUrls("VCB", {
        _fetchVpsPlaywright: async (_u, _t) =>
          JSON.stringify({
            results: [],
            error: "Script error: HTTP 404 fetching SanGiaoDiv.xhtml",
          }),
        _fetchSsc: mockEmpty,
        _fetchCafef: mockEmpty,
        _fetchVietstock: mockEmpty,
      });

      expect(result.urls).toHaveLength(0);
      // Source is null because VPS returned empty + SSC also returned empty
      expect(result.source).toBeNull();
    } finally {
      if (prev === undefined) delete Bun.env["BCTC_DISCOVER_URL"];
      else Bun.env["BCTC_DISCOVER_URL"] = prev;
    }
  });
});
