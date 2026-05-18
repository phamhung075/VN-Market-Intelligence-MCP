/**
 * FIX — BCTC SSC geo-block: route iboard calls through VPS HTTP proxy
 *
 * Problem:
 *   bctcQueueEnricherJob calls discoverHosePdfUrls() which hits
 *   iboard-query.ssc.vn directly from Docker on macOS (France).
 *   That domain is NXDOMAIN outside Vietnam — all SSC calls silently fail.
 *
 * Fix:
 *   1. VPS-side Node.js proxy server at port 8765, endpoint
 *      GET /proxy/ssc-iboard/:ticker → forwards to iboard-query.ssc.vn
 *   2. docker-compose.yml: SSC_IBOARD_BASE_URL=http://125.212.251.27:8765/proxy/ssc-iboard
 *   3. discoverHosePdfUrls already reads SSC_IBOARD_BASE_URL at call-time.
 *
 * These tests verify:
 *   A. When SSC_IBOARD_BASE_URL points at a VPS proxy the request URL is
 *      constructed as <base>/dcm/financials/ticker/<TICKER> (existing behaviour,
 *      but now regression-tested with the real proxy URL shape).
 *   B. The proxy path segment structure is correct for the forwarding rule:
 *      /proxy/ssc-iboard replaces https://iboard-query.ssc.vn so the VPS appends
 *      /dcm/financials/ticker/<TICKER> correctly.
 *   C. Ticker is upper-cased and URL-encoded when building the iboard request.
 *   D. When the VPS proxy returns the iboard JSON the enricher writes source_url.
 *   E. VINAHOST_IP env var is resolved in SSC_IBOARD_BASE_URL construction.
 *
 * @module __tests__/FIX-bctc-ssc-vps-proxy
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import type { Database } from "bun:sqlite";
import { Database as SqliteDatabase } from "bun:sqlite";

import { initDatabase, closeDb } from "../infrastructure/db/schema.js";
import {
  discoverHosePdfUrls,
  type HttpFetchFn,
} from "../domain/services/bctcDiscovery.js";
import { runBctcQueueEnricherJob } from "../scheduler/financial-reports/bctcQueueEnricherJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Real VPS proxy base URL shape used in docker-compose. */
const VPS_PROXY_BASE = "http://125.212.251.27:8765/proxy/ssc-iboard";

/** Mock that simulates a VPS proxy forwarding to iboard-query.ssc.vn. */
function mockVpsProxySuccess(ticker: string): HttpFetchFn {
  return async (_url: string, _timeout: number): Promise<string> => {
    return JSON.stringify({
      data: [
        {
          fileUrl: `https://iboard-query.ssc.vn/dcm/financials/static/${ticker.toLowerCase()}-bctc-q1.pdf`,
        },
      ],
    });
  };
}

/** Mock that returns empty (no PDFs found). */
async function mockEmpty(_url: string, _timeout: number): Promise<string> {
  return JSON.stringify({ data: [] });
}

/** Capture the URL the production code would request from the proxy. */
function capturingFetch(urls: string[]): HttpFetchFn {
  return async (url, _timeout) => {
    urls.push(url);
    return JSON.stringify({ data: [] });
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// A. TASK_1944b: SSC strategy removed — _fetchSsc is never called
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-bctc-ssc-vps-proxy — A/B/C: SSC removed (TASK_1944b) — _fetchSsc never invoked", () => {
  it("_fetchSsc is never called even when SSC_IBOARD_BASE_URL is set (strategy removed)", async () => {
    // TASK_1944b: SSC strategy permanently removed. SSC_IBOARD_BASE_URL is no longer consulted.
    const captured: string[] = [];
    const prev = Bun.env["SSC_IBOARD_BASE_URL"];
    Bun.env["SSC_IBOARD_BASE_URL"] = VPS_PROXY_BASE;

    try {
      await discoverHosePdfUrls("VCB", {
        _fetchSsc: capturingFetch(captured),  // deprecated no-op
        _fetchCafef: mockEmpty,               // deprecated no-op
        _fetchVietstock: mockEmpty,           // deprecated no-op
      });
    } finally {
      if (prev === undefined) delete Bun.env["SSC_IBOARD_BASE_URL"];
      else Bun.env["SSC_IBOARD_BASE_URL"] = prev;
    }

    // SSC strategy removed → capturingFetch never called
    expect(captured.length).toBe(0);
  });

  it("result is empty when only SSC mock is provided (SSC removed — no active strategy)", async () => {
    // TASK_1944b: SSC removed. Without VPS/hsx injectables → source = null.
    const prev = Bun.env["SSC_IBOARD_BASE_URL"];
    Bun.env["SSC_IBOARD_BASE_URL"] = VPS_PROXY_BASE;

    try {
      const result = await discoverHosePdfUrls("FPT", {
        _fetchSsc: mockVpsProxySuccess("FPT"), // deprecated no-op
        _fetchCafef: mockEmpty,                // deprecated no-op
        _fetchVietstock: mockEmpty,            // deprecated no-op
      });

      expect(result.source).toBeNull();
      expect(result.urls).toHaveLength(0);
    } finally {
      if (prev === undefined) delete Bun.env["SSC_IBOARD_BASE_URL"];
      else Bun.env["SSC_IBOARD_BASE_URL"] = prev;
    }
  });

  it("lower-case ticker passed to VPS Playwright (ticker normalisation preserved)", async () => {
    // Verify ticker upper-casing still works in the VPS Playwright path.
    const capturedVps: string[] = [];
    const prev = Bun.env["BCTC_DISCOVER_URL"];
    Bun.env["BCTC_DISCOVER_URL"] = "http://125.212.251.27:8765/proxy/bctc-discover";

    try {
      await discoverHosePdfUrls("vcb", {
        _fetchVpsPlaywright: async (url, _timeout) => {
          capturedVps.push(url);
          return JSON.stringify({ results: [], error: null });
        },
        _fetchSsc: mockEmpty,     // deprecated no-op
        _fetchCafef: mockEmpty,   // deprecated no-op
        _fetchVietstock: mockEmpty, // deprecated no-op
      });
    } finally {
      if (prev === undefined) delete Bun.env["BCTC_DISCOVER_URL"];
      else Bun.env["BCTC_DISCOVER_URL"] = prev;
    }

    expect(capturedVps[0]).toContain("VCB");
    expect(capturedVps[0]).not.toContain("/vcb/");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. End-to-end: VPS proxy returns iboard JSON → enricher writes source_url
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-bctc-ssc-vps-proxy — D: enricher writes source_url via VPS proxy", () => {
  let testDb: Database;

  beforeEach(async () => {
    closeDb();
    testDb = new SqliteDatabase(":memory:");
    testDb.exec("PRAGMA foreign_keys = ON");
    testDb.exec("PRAGMA journal_mode = WAL");
    await initDatabase(testDb);
    testDb.exec("DELETE FROM bctc_vps_queue");
  });

  afterEach(() => {
    try { testDb.close(); } catch { /* ignore */ }
    closeDb();
  });

  it("enricher writes PDF URL via VPS Playwright mock (SSC removed TASK_1944b)", async () => {
    // TASK_1944b: SSC removed. Route through VPS Playwright mock instead.
    testDb.prepare(`
      INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, source_url)
      VALUES (?, ?, ?, ?, ?)
    `).run("VNM", 2025, "Q1", "pending", null);

    const prev = Bun.env["BCTC_DISCOVER_URL"];
    Bun.env["BCTC_DISCOVER_URL"] = "http://125.212.251.27:8765/proxy/bctc-discover";

    try {
      const result = await runBctcQueueEnricherJob({
        db: testDb,
        discoverOptions: {
          _fetchHsx: async () => [],
          _fetchVpsPlaywright: async (_url, _timeout) =>
            JSON.stringify({
              results: [{ url: "https://owa.hnx.vn/ftp/vnm-bctc-q1.pdf", source: "HNX", confidence: 0.9 }],
              error: null,
            }),
          _fetchSsc: mockVpsProxySuccess("VNM"), // deprecated no-op
          _fetchCafef: mockEmpty,                 // deprecated no-op
          _fetchVietstock: mockEmpty,             // deprecated no-op
        },
      });

      expect(result.itemsProcessed).toBe(1);
      expect(result.urlsPopulated).toBe(1);

      const row = testDb.query(
        "SELECT source_url FROM bctc_vps_queue WHERE action_code = 'VNM'"
      ).get() as { source_url: string | null };

      expect(row.source_url).not.toBeNull();
      expect(row.source_url).toMatch(/\.pdf$/i);
      expect(row.source_url).toContain("vnm-bctc-q1.pdf");
    } finally {
      if (prev === undefined) delete Bun.env["BCTC_DISCOVER_URL"];
      else Bun.env["BCTC_DISCOVER_URL"] = prev;
    }
  });

  // TASK_1916b: cafef strategy permanently removed. Updated: when SSC proxy returns
  // empty and vietstock also returns empty, enricher populates 0 URLs (no cafef fallback).
  it("enricher does NOT fall back to cafef when VPS proxy returns empty (cafef removed in TASK_1916b)", async () => {
    testDb.prepare(`
      INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, source_url)
      VALUES (?, ?, ?, ?, ?)
    `).run("HPG", 2025, "Q1", "pending", null);

    const cafefSpy: HttpFetchFn = async (_url, _timeout) => {
      // This mock would succeed -- but cafef is no longer called (TASK_1916b)
      return JSON.stringify({
        Data: [{ Url: "/data/files/hpg-bctc-q1-2025.pdf" }],
      });
    };

    const prev = Bun.env["SSC_IBOARD_BASE_URL"];
    Bun.env["SSC_IBOARD_BASE_URL"] = VPS_PROXY_BASE;

    try {
      // _fetchHsx returns [] so Strategy 0 does not intercept; cafef spy verifies
      // cafef is still never called (TASK_1916b: cafef permanently removed from chain).
      const result = await runBctcQueueEnricherJob({
        db: testDb,
        discoverOptions: {
          _fetchHsx: async () => [],
          _fetchSsc: mockEmpty,       // proxy returns nothing
          _fetchCafef: cafefSpy,      // deprecated no-op -- cafef never called
          _fetchVietstock: mockEmpty, // vietstock also empty
        },
      });

      // cafef is no longer in the strategy chain -- 0 URLs populated
      expect(result.urlsPopulated).toBe(0);

      const row = testDb.query(
        "SELECT source_url FROM bctc_vps_queue WHERE action_code = 'HPG'"
      ).get() as { source_url: string | null };

      expect(row.source_url).toBeNull();
    } finally {
      if (prev === undefined) delete Bun.env["SSC_IBOARD_BASE_URL"];
      else Bun.env["SSC_IBOARD_BASE_URL"] = prev;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. TASK_1944b: SSC_IBOARD_BASE_URL no longer consulted — strategy removed
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-bctc-ssc-vps-proxy — E: SSC_IBOARD_BASE_URL no longer consulted (TASK_1944b)", () => {
  it("SSC_IBOARD_BASE_URL has no effect — _fetchSsc never called regardless of env var", async () => {
    // TASK_1944b: SSC strategy removed. SSC_IBOARD_BASE_URL env var is inert.
    const captured: string[] = [];
    const prev = Bun.env["SSC_IBOARD_BASE_URL"];
    Bun.env["SSC_IBOARD_BASE_URL"] = "http://10.0.0.1:9999/proxy/ssc-iboard";

    try {
      await discoverHosePdfUrls("BID", {
        _fetchSsc: capturingFetch(captured),  // deprecated no-op
        _fetchCafef: mockEmpty,               // deprecated no-op
        _fetchVietstock: mockEmpty,           // deprecated no-op
      });
    } finally {
      if (prev === undefined) delete Bun.env["SSC_IBOARD_BASE_URL"];
      else Bun.env["SSC_IBOARD_BASE_URL"] = prev;
    }

    // SSC strategy gone → capturingFetch never called → no URLs
    expect(captured.length).toBe(0);
  });
});
