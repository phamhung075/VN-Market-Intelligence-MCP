/**
 * TASK-BCTC-3c — Integration test: hsx.vn Strategy 0 wired into discoverHosePdfUrls
 *
 * Verifies that:
 *   - Strategy 0 (_fetchHsx) fires first and its results are returned with source: "hsx"
 *   - Strategy 1 (VPS Playwright) is never called when Strategy 0 returns URLs
 *   - Strategy 0 returns [] for non-HOSE tickers → Strategy 1 fires (passthrough)
 *   - Strategy 0 not supplied → Strategy 1 fires (backward-compat)
 *   - source: "hsx" shape: urls array, fallbackUrls: [], fallbackSource: null
 *
 * All HTTP calls are mocked — no live network access.
 *
 * Note on exactOptionalPropertyTypes:
 *   tsconfig has exactOptionalPropertyTypes: true. This means optional fields typed
 *   `prop?: T` cannot be assigned `undefined` explicitly. Pattern: either omit the
 *   field entirely, or supply a concrete function (never a variable of type `fn | undefined`).
 *
 * TASK-BCTC-3c (2026-05-15)
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** No-op HttpFetchFn that always returns empty string. */
const nopFetch = async (_url: string, _t: number): Promise<string> => "";

/** Build mock _fetchHsx that returns fixed URLs. */
function mockHsxReturns(urls: string[]) {
  return async (
    _ticker: string,
    _year: number,
    _timeoutMs: number,
  ): Promise<string[]> => urls;
}

/** Mock _fetchHsx that records how many times it was called + its last args. */
function makeHsxSpy(returnValue: string[]) {
  let calls = 0;
  let lastArgs: [string, number, number] | null = null;
  const fn = async (
    ticker: string,
    year: number,
    timeoutMs: number,
  ): Promise<string[]> => {
    calls++;
    lastArgs = [ticker, year, timeoutMs];
    return returnValue;
  };
  return {
    fn,
    callCount: () => calls,
    lastArgs: () => lastArgs,
  };
}

/** Mock _fetchVpsPlaywright that returns fixed URL list. */
function makeVpsSpy(urls: string[]) {
  let calls = 0;
  const fn = async (_url: string, _t: number): Promise<string> => {
    calls++;
    return JSON.stringify({
      results: urls.map((url) => ({ url, source: "ssc-hose", confidence: 0.9 })),
      error: null,
    });
  };
  return { fn, callCount: () => calls };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TASK-BCTC-3c — Strategy 0 (hsx) integration with discoverHosePdfUrls", () => {
  beforeEach(() => {
    // Enable BCTC_DISCOVER_URL so Strategy 1 is eligible when _fetchVpsPlaywright is supplied
    Bun.env["BCTC_DISCOVER_URL"] = "http://vps-mock:8765/proxy/bctc-discover";
  });

  afterEach(() => {
    delete Bun.env["BCTC_DISCOVER_URL"];
  });

  // ── TC-1: Strategy 0 fires first and wins ─────────────────────────────────

  it("TC-1: Strategy 0 fires first — source: hsx returned, VPS never called", async () => {
    const hsxUrls = [
      "https://staticfile.hsx.vn/Uploads/VNM-BCTC-2026-Q1.pdf",
      "https://staticfile.hsx.vn/Uploads/VNM-BCTC-2025-annual.pdf",
    ];
    const hsx = makeHsxSpy(hsxUrls);
    const vps = makeVpsSpy(["https://ssc.example.com/vnm.pdf"]);

    const { discoverHosePdfUrls } = await import(
      "../domain/services/bctcDiscovery.js"
    );

    const result = await discoverHosePdfUrls("VNM", {
      year: 2026,
      _fetchHsx: hsx.fn,
      _fetchVpsPlaywright: vps.fn,
      _fetchSsc: nopFetch,
      _fetchVietstock: nopFetch,
    });

    expect(result.source).toBe("hsx");
    expect(result.urls).toEqual(hsxUrls);
    expect(result.fallbackUrls).toEqual([]);
    expect(result.fallbackSource).toBeNull();
    expect(hsx.callCount()).toBe(1);
    expect(vps.callCount()).toBe(0); // VPS never called when Strategy 0 succeeds
  });

  // ── TC-2: Strategy 0 passes ticker + year + timeout to _fetchHsx ──────────

  it("TC-2: _fetchHsx receives correct ticker, year, and timeout arguments", async () => {
    const hsx = makeHsxSpy(["https://staticfile.hsx.vn/Uploads/HPG-2025.pdf"]);

    const { discoverHosePdfUrls } = await import(
      "../domain/services/bctcDiscovery.js"
    );

    await discoverHosePdfUrls("HPG", {
      year: 2025,
      timeout: 3000,
      _fetchHsx: hsx.fn,
      _fetchSsc: nopFetch,
      _fetchVietstock: nopFetch,
    });

    const args = hsx.lastArgs();
    expect(args).not.toBeNull();
    expect(args![0]).toBe("HPG");
    expect(args![1]).toBe(2025);
    expect(args![2]).toBe(3000); // timeout passed through
  });

  // ── TC-3: Strategy 0 returns [] → Strategy 1 (VPS) fires ─────────────────

  it("TC-3: Strategy 0 returns [] (non-HOSE passthrough) → Strategy 1 fires", async () => {
    const vps = makeVpsSpy(["https://congbothongtin.ssc.gov.vn/acb.pdf"]);

    const { discoverHosePdfUrls } = await import(
      "../domain/services/bctcDiscovery.js"
    );

    const result = await discoverHosePdfUrls("ACB", {
      year: 2025,
      _fetchHsx: mockHsxReturns([]), // ticker not found on hsx → empty
      _fetchVpsPlaywright: vps.fn,
      _fetchSsc: nopFetch,
      _fetchVietstock: nopFetch,
    });

    expect(result.source).toBe("vps-playwright");
    expect(vps.callCount()).toBe(1);
  });

  // ── TC-4: _fetchHsx absent → Strategy 0 skipped, VPS fires ───────────────

  it("TC-4: _fetchHsx not supplied → Strategy 0 skipped, Strategy 1 fires", async () => {
    const vps = makeVpsSpy(["https://congbothongtin.ssc.gov.vn/vnm.pdf"]);

    const { discoverHosePdfUrls } = await import(
      "../domain/services/bctcDiscovery.js"
    );

    // exactOptionalPropertyTypes: omit _fetchHsx entirely (do not pass undefined)
    const result = await discoverHosePdfUrls("VNM", {
      year: 2026,
      _fetchVpsPlaywright: vps.fn,
      _fetchSsc: nopFetch,
      _fetchVietstock: nopFetch,
    });

    expect(result.source).toBe("vps-playwright");
    expect(vps.callCount()).toBe(1);
  });

  // ── TC-5: source: "hsx" — response shape validation ──────────────────────

  it("TC-5: Strategy 0 result shape: source hsx, urls[], fallbackUrls:[], fallbackSource:null", async () => {
    const { discoverHosePdfUrls } = await import(
      "../domain/services/bctcDiscovery.js"
    );

    const result = await discoverHosePdfUrls("FPT", {
      _fetchHsx: mockHsxReturns([
        "https://staticfile.hsx.vn/Uploads/FPT-Q1-2026.pdf",
      ]),
      _fetchSsc: nopFetch,
      _fetchVietstock: nopFetch,
    });

    expect(result.source).toBe("hsx");
    expect(Array.isArray(result.urls)).toBe(true);
    expect(result.urls.length).toBeGreaterThan(0);
    expect(result.urls[0]).toMatch(/staticfile\.hsx\.vn/);
    expect(result.fallbackUrls).toEqual([]);
    expect(result.fallbackSource).toBeNull();
  });

  // ── TC-6: All strategies return [] → source: null ─────────────────────────

  it("TC-6: All strategies return [] → source null (unknown ticker)", async () => {
    const vps = makeVpsSpy([]); // VPS also returns empty

    const { discoverHosePdfUrls } = await import(
      "../domain/services/bctcDiscovery.js"
    );

    const result = await discoverHosePdfUrls("UNKNOWN_TICKER_XYZ", {
      _fetchHsx: mockHsxReturns([]),
      _fetchVpsPlaywright: vps.fn,
      _fetchSsc: nopFetch,
      _fetchVietstock: nopFetch,
    });

    expect(result.source).toBeNull();
    expect(result.urls).toEqual([]);
  });

  // ── TC-7: Strategy 0 URL shape — staticfile.hsx.vn prefix ────────────────

  it("TC-7: hsx URLs must match staticfile.hsx.vn domain pattern", async () => {
    const hsxUrls = [
      "https://staticfile.hsx.vn/Uploads/UploadDocuments/2458538/20260429-VNM-BCTC-Q1.pdf",
      "https://staticfile.hsx.vn/Uploads/UploadDocuments/2440890/20260227-VNM-BCTC-2025.pdf",
    ];

    const { discoverHosePdfUrls } = await import(
      "../domain/services/bctcDiscovery.js"
    );

    const result = await discoverHosePdfUrls("VNM", {
      _fetchHsx: mockHsxReturns(hsxUrls),
      _fetchSsc: nopFetch,
      _fetchVietstock: nopFetch,
    });

    expect(result.source).toBe("hsx");
    for (const url of result.urls) {
      expect(url).toMatch(/^https:\/\/staticfile\.hsx\.vn\//);
    }
  });
});
