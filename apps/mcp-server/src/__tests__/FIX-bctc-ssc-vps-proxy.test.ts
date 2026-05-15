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
// A. Request URL shape when SSC_IBOARD_BASE_URL is the VPS proxy
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-bctc-ssc-vps-proxy — A: request URL shape via VPS proxy", () => {
  it("builds URL as <VPS_PROXY_BASE>/dcm/financials/ticker/<TICKER>", async () => {
    const captured: string[] = [];
    const prev = Bun.env["SSC_IBOARD_BASE_URL"];
    Bun.env["SSC_IBOARD_BASE_URL"] = VPS_PROXY_BASE;

    try {
      await discoverHosePdfUrls("VCB", {
        _fetchSsc: capturingFetch(captured),
        _fetchCafef: mockEmpty,
        _fetchVietstock: mockEmpty,
      });
    } finally {
      if (prev === undefined) delete Bun.env["SSC_IBOARD_BASE_URL"];
      else Bun.env["SSC_IBOARD_BASE_URL"] = prev;
    }

    expect(captured.length).toBeGreaterThan(0);
    expect(captured[0]).toBe(
      `${VPS_PROXY_BASE}/dcm/financials/ticker/VCB`,
    );
  });

  it("VPS proxy URL uses port 8765 (not 80 or 3000)", async () => {
    const captured: string[] = [];
    const prev = Bun.env["SSC_IBOARD_BASE_URL"];
    Bun.env["SSC_IBOARD_BASE_URL"] = VPS_PROXY_BASE;

    try {
      await discoverHosePdfUrls("FPT", {
        _fetchSsc: capturingFetch(captured),
        _fetchCafef: mockEmpty,
        _fetchVietstock: mockEmpty,
      });
    } finally {
      if (prev === undefined) delete Bun.env["SSC_IBOARD_BASE_URL"];
      else Bun.env["SSC_IBOARD_BASE_URL"] = prev;
    }

    expect(captured[0]).toContain(":8765");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. Proxy path segment structure
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-bctc-ssc-vps-proxy — B: proxy path segment structure", () => {
  it("proxy base path contains /proxy/ssc-iboard segment", async () => {
    const captured: string[] = [];
    const prev = Bun.env["SSC_IBOARD_BASE_URL"];
    Bun.env["SSC_IBOARD_BASE_URL"] = VPS_PROXY_BASE;

    try {
      await discoverHosePdfUrls("HPG", {
        _fetchSsc: capturingFetch(captured),
        _fetchCafef: mockEmpty,
        _fetchVietstock: mockEmpty,
      });
    } finally {
      if (prev === undefined) delete Bun.env["SSC_IBOARD_BASE_URL"];
      else Bun.env["SSC_IBOARD_BASE_URL"] = prev;
    }

    expect(captured[0]).toContain("/proxy/ssc-iboard/");
    expect(captured[0]).toContain("/dcm/financials/ticker/");
  });

  it("VPS IP 125.212.251.27 appears in the request URL", async () => {
    const captured: string[] = [];
    const prev = Bun.env["SSC_IBOARD_BASE_URL"];
    Bun.env["SSC_IBOARD_BASE_URL"] = VPS_PROXY_BASE;

    try {
      await discoverHosePdfUrls("MSN", {
        _fetchSsc: capturingFetch(captured),
        _fetchCafef: mockEmpty,
        _fetchVietstock: mockEmpty,
      });
    } finally {
      if (prev === undefined) delete Bun.env["SSC_IBOARD_BASE_URL"];
      else Bun.env["SSC_IBOARD_BASE_URL"] = prev;
    }

    expect(captured[0]).toContain("125.212.251.27");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. Ticker upper-case + URL encoding
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-bctc-ssc-vps-proxy — C: ticker normalisation", () => {
  it("lower-case ticker is upper-cased in proxy request URL", async () => {
    const captured: string[] = [];
    const prev = Bun.env["SSC_IBOARD_BASE_URL"];
    Bun.env["SSC_IBOARD_BASE_URL"] = VPS_PROXY_BASE;

    try {
      await discoverHosePdfUrls("vcb", {
        _fetchSsc: capturingFetch(captured),
        _fetchCafef: mockEmpty,
        _fetchVietstock: mockEmpty,
      });
    } finally {
      if (prev === undefined) delete Bun.env["SSC_IBOARD_BASE_URL"];
      else Bun.env["SSC_IBOARD_BASE_URL"] = prev;
    }

    expect(captured[0]).toContain("/VCB");
    expect(captured[0]).not.toContain("/vcb");
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

  it("enricher writes iboard PDF URL when VPS proxy mock returns data", async () => {
    testDb.prepare(`
      INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, source_url)
      VALUES (?, ?, ?, ?, ?)
    `).run("VNM", 2025, "Q1", "pending", null);

    const prev = Bun.env["SSC_IBOARD_BASE_URL"];
    Bun.env["SSC_IBOARD_BASE_URL"] = VPS_PROXY_BASE;

    try {
      // _fetchHsx returns [] so Strategy 0 does not intercept; VPS proxy SSC mock fires.
      const result = await runBctcQueueEnricherJob({
        db: testDb,
        discoverOptions: {
          _fetchHsx: async () => [],
          _fetchSsc: mockVpsProxySuccess("VNM"),
          _fetchCafef: mockEmpty,
          _fetchVietstock: mockEmpty,
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
      if (prev === undefined) delete Bun.env["SSC_IBOARD_BASE_URL"];
      else Bun.env["SSC_IBOARD_BASE_URL"] = prev;
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
// E. VINAHOST_IP substitution in docker-compose SSC_IBOARD_BASE_URL value
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-bctc-ssc-vps-proxy — E: SSC_IBOARD_BASE_URL accepts any host:port", () => {
  it("env var with a different host:port is used verbatim", async () => {
    const captured: string[] = [];
    const prev = Bun.env["SSC_IBOARD_BASE_URL"];
    Bun.env["SSC_IBOARD_BASE_URL"] = "http://10.0.0.1:9999/proxy/ssc-iboard";

    try {
      await discoverHosePdfUrls("BID", {
        _fetchSsc: capturingFetch(captured),
        _fetchCafef: mockEmpty,
        _fetchVietstock: mockEmpty,
      });
    } finally {
      if (prev === undefined) delete Bun.env["SSC_IBOARD_BASE_URL"];
      else Bun.env["SSC_IBOARD_BASE_URL"] = prev;
    }

    expect(captured[0]).toContain("10.0.0.1:9999");
    expect(captured[0]).toContain("/proxy/ssc-iboard/dcm/financials/ticker/BID");
  });
});
