/**
 * TASK_1916b: cafef.vn Strategy 2 removal verification
 *
 * AC-1: Strategy 2 (cafef.vn FinanceInfo.ashx) cleanly removed.
 *   - All 3 replacement candidates (cafef HTML, VNDirect API, SSC via VPS) dead
 *     from France as of 2026-05-14 investigation. See SPIKE_1916.
 *   - Strategy 0 (VPS Playwright) remains primary.
 *
 * Tests:
 *   1. DPM, VCB, HPG — Strategy 0 (VPS) returns PDFs → source = "vps-playwright"
 *   2. DPM, VCB, HPG — SSC succeeds → source = "ssc" (strategy 1 still works)
 *   3. _fetchCafef is never invoked even when all active strategies return empty
 *   4. Strategy removal does not break the "all fail → null" contract
 *   5. Regression: SSC fallback under VPS primary still works
 */

import { describe, it, expect } from "bun:test";
import {
  discoverHosePdfUrls,
  type HttpFetchFn,
} from "../domain/services/bctcDiscovery.js";

// ─────────────────────────────────────────────────────────────────────────────
// Mock helpers
// ─────────────────────────────────────────────────────────────────────────────

function mockVpsPdfResponse(ticker: string): HttpFetchFn {
  return async (_url, _timeout) =>
    JSON.stringify({
      results: [
        {
          url: `https://vps.example.com/bctc/${ticker.toLowerCase()}-q4-2025.pdf`,
          source: "ssc-hose",
          confidence: 0.9,
        },
      ],
      error: null,
    });
}

function mockSscPdfResponse(ticker: string): HttpFetchFn {
  return async (_url, _timeout) =>
    JSON.stringify({
      data: [
        {
          fileUrl: `https://iboard-proxy.example.com/${ticker.toLowerCase()}-bctc.pdf`,
        },
      ],
    });
}

async function mockFail(_url: string, _timeout: number): Promise<string> {
  throw new Error("ENOTFOUND / geo-blocked");
}

async function mockEmpty(_url: string, _timeout: number): Promise<string> {
  return JSON.stringify({ data: [] });
}

async function mockEmptyHtml(_url: string, _timeout: number): Promise<string> {
  return "<html><body>No documents</body></html>";
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-1a: Strategy 0 (VPS Playwright) succeeds for DPM, VCB, HPG
// ─────────────────────────────────────────────────────────────────────────────

describe("1916b AC-1a — Strategy 0 (VPS) returns PDFs for DPM/VCB/HPG", () => {
  const tickers = ["DPM", "VCB", "HPG"];

  for (const ticker of tickers) {
    it(`${ticker} — VPS strategy returns ≥1 PDF URL`, async () => {
      // Simulate BCTC_DISCOVER_URL being set by providing _fetchVpsPlaywright
      // The real env var gate is bypassed via injectable (ports pattern)
      const origUrl = typeof Bun !== "undefined" ? Bun.env["BCTC_DISCOVER_URL"] : undefined;
      if (typeof Bun !== "undefined") {
        Bun.env["BCTC_DISCOVER_URL"] = "http://125.212.251.27:8765/proxy/bctc-discover";
      }

      try {
        const result = await discoverHosePdfUrls(ticker, {
          _fetchVpsPlaywright: mockVpsPdfResponse(ticker),
          _fetchSsc: mockEmpty,
          _fetchVietstock: mockEmptyHtml,
        });

        expect(result.source).toBe("vps-playwright");
        expect(result.urls.length).toBeGreaterThan(0);
        result.urls.forEach((url) => {
          expect(url).toMatch(/^https?:\/\//);
          expect(url.toLowerCase()).toMatch(/\.pdf$/);
        });
      } finally {
        if (typeof Bun !== "undefined") {
          if (origUrl === undefined) {
            delete Bun.env["BCTC_DISCOVER_URL"];
          } else {
            Bun.env["BCTC_DISCOVER_URL"] = origUrl;
          }
        }
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-1b: Strategy 1 (SSC) succeeds for DPM, VCB, HPG (VPS absent)
// ─────────────────────────────────────────────────────────────────────────────

describe("1916b AC-1b — Strategy 1 (SSC) returns PDFs for DPM/VCB/HPG when VPS absent", () => {
  const tickers = ["DPM", "VCB", "HPG"];

  for (const ticker of tickers) {
    it(`${ticker} — SSC strategy returns ≥1 PDF URL`, async () => {
      // No _fetchVpsPlaywright → strategy 0 skipped (BCTC_DISCOVER_URL absent scenario)
      const result = await discoverHosePdfUrls(ticker, {
        _fetchSsc: mockSscPdfResponse(ticker),
        _fetchCafef: mockEmpty,        // deprecated, must be ignored
        _fetchVietstock: mockEmptyHtml,
      });

      expect(result.source).toBe("ssc");
      expect(result.urls.length).toBeGreaterThan(0);
      result.urls.forEach((url) => {
        expect(url).toMatch(/^https?:\/\//);
        expect(url.toLowerCase()).toMatch(/\.pdf$/);
      });
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2: No regression — _fetchCafef is never invoked
// ─────────────────────────────────────────────────────────────────────────────

describe("1916b AC-2 — cafef fetch function is never invoked", () => {
  const tickers = ["DPM", "VCB", "HPG"];

  for (const ticker of tickers) {
    it(`${ticker} — _fetchCafef call count = 0`, async () => {
      let cafefCallCount = 0;
      const spyCafef: HttpFetchFn = async (_url, _timeout) => {
        cafefCallCount++;
        return JSON.stringify({ Data: [{ Url: `/fake/${ticker}-bctc.pdf` }] });
      };

      // Both SSC and vietstock fail — if cafef were still live it would succeed
      await discoverHosePdfUrls(ticker, {
        _fetchSsc: mockFail,
        _fetchCafef: spyCafef,   // spy — should NOT be called
        _fetchVietstock: mockEmptyHtml,
      });

      expect(cafefCallCount).toBe(0);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2 continued: "all fail" contract preserved
// ─────────────────────────────────────────────────────────────────────────────

describe("1916b AC-2 — all-strategies-fail returns null source (contract preserved)", () => {
  it("returns { urls: [], source: null } when VPS/SSC/vietstock all fail", async () => {
    const result = await discoverHosePdfUrls("DPM", {
      _fetchSsc: mockFail,
      _fetchCafef: mockEmpty,      // deprecated no-op
      _fetchVietstock: mockEmptyHtml,
    });

    expect(result).toEqual({
      urls: [],
      source: null,
      fallbackUrls: [],
      fallbackSource: null,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Regression: VPS primary with SSC fallback
// ─────────────────────────────────────────────────────────────────────────────

describe("1916b regression — VPS primary with SSC fallback chain", () => {
  it("VPS wins, SSC is stored as fallback (not cafef)", async () => {
    const origUrl = typeof Bun !== "undefined" ? Bun.env["BCTC_DISCOVER_URL"] : undefined;
    if (typeof Bun !== "undefined") {
      Bun.env["BCTC_DISCOVER_URL"] = "http://125.212.251.27:8765/proxy/bctc-discover";
    }

    try {
      const result = await discoverHosePdfUrls("VCB", {
        _fetchVpsPlaywright: mockVpsPdfResponse("VCB"),
        _fetchSsc: mockSscPdfResponse("VCB"),
        _fetchCafef: mockEmpty,  // deprecated
        _fetchVietstock: mockEmptyHtml,
      });

      expect(result.source).toBe("vps-playwright");
      expect(result.urls.length).toBeGreaterThan(0);
      // Fallback should be SSC, not cafef
      expect(result.fallbackSource).toBe("ssc");
      expect(result.fallbackUrls?.length).toBeGreaterThan(0);
    } finally {
      if (typeof Bun !== "undefined") {
        if (origUrl === undefined) {
          delete Bun.env["BCTC_DISCOVER_URL"];
        } else {
          Bun.env["BCTC_DISCOVER_URL"] = origUrl;
        }
      }
    }
  });

  it("SSC wins, vietstock fallback attempted (cafef no longer in chain)", async () => {
    const result = await discoverHosePdfUrls("HPG", {
      _fetchSsc: mockSscPdfResponse("HPG"),
      _fetchCafef: mockEmpty,
      _fetchVietstock: mockEmptyHtml,  // vietstock has nothing
    });

    expect(result.source).toBe("ssc");
    expect(result.urls.length).toBeGreaterThan(0);
    // fallbackSource is null (vietstock returned nothing, cafef no longer tried)
    expect(result.fallbackSource).toBeNull();
  });
});
