/**
 * FIX — BCTC URL Enrichment (29/32 tickers url=MISSING)
 *
 * Root causes:
 *   1. iboard-query.ssc.vn — DNS NXDOMAIN from France (geo-blocked).
 *      All SSC iboard strategy calls silently fail and return [].
 *   2. cafef.vn/vcb/bao-cao-tai-chinh.chn — HTTP 404 (URL pattern wrong).
 *      extractCafefUrls never receives valid HTML.
 *   3. finance.vietstock.vn/VCB/bao-cao-tai-chinh — JS-rendered SPA.
 *      PDF links are not present in the initial HTML response.
 *   All three strategies fail for every ticker → discoverHosePdfUrls always
 *   returns { urls: [], source: null } → enricher never writes source_url.
 *
 * Fix:
 *   - Add SSC_IBOARD_BASE_URL env var to bctcDiscovery.ts so the iboard
 *     calls can be routed through a VPS-side HTTP proxy endpoint.
 *   - Fix the cafef URL pattern: /[ticker]/bao-cao-tai-chinh.chn → 404.
 *     Real cafef URL: /[ticker]/tai-lieu-cong-bo.chn (investor relations).
 *     HOWEVER: cafef also JS-renders its financial docs section.
 *     Real fix: use cafef document API endpoint (s.cafef.vn JSON API).
 *   - bctcQueueEnricherJob: add SSC_IBOARD_BASE_URL injection so the job
 *     can be configured to call a VPS HTTP proxy instead of direct SSC.
 *   - Ensure "MISSING" placeholder source_urls are treated as NULL
 *     (reset to pending so enricher can retry them).
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
// Mock helpers
// ─────────────────────────────────────────────────────────────────────────────

/** SSC iboard mock returning one PDF. */
function mockSscSuccess(ticker: string): HttpFetchFn {
  return async (_url: string, _timeout: number): Promise<string> => {
    return JSON.stringify({
      data: [
        {
          fileUrl: `https://iboard-query.ssc.vn/static/${ticker.toLowerCase()}-bctc-q1.pdf`,
        },
      ],
    });
  };
}

/** Mock that simulates DNS failure (geo-blocked from France). */
async function mockDnsFail(_url: string, _timeout: number): Promise<string> {
  throw new Error("getaddrinfo ENOTFOUND iboard-query.ssc.vn");
}

/** Mock that returns cafef JSON API response with PDF links. */
function mockCafefJsonSuccess(ticker: string): HttpFetchFn {
  return async (_url: string, _timeout: number): Promise<string> => {
    return JSON.stringify({
      Data: [
        {
          Title: `BCTC Q1 2025 ${ticker}`,
          Url: `/data/files/${ticker.toLowerCase()}-bctc-q1-2025.pdf`,
        },
      ],
    });
  };
}

/** Mock returning empty JSON (no PDFs). */
async function mockEmptyJson(_url: string, _timeout: number): Promise<string> {
  return JSON.stringify({ data: [] });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests — discoverHosePdfUrls: SSC_IBOARD_BASE_URL env override
// ─────────────────────────────────────────────────────────────────────────────

// TASK_1944b: SSC strategy permanently removed. _fetchSsc is now a deprecated no-op.
// The SSC_IBOARD_BASE_URL env override is no longer consulted at runtime.
// These tests document the post-removal state.

describe("TASK_1944b — _fetchSsc deprecated no-op (SSC iboard removed)", () => {
  it("_fetchSsc is silently ignored — SSC strategy never invoked", async () => {
    // TASK_1944b: _fetchSsc is accepted for backward-compat but never called.
    const sscCallCount = { n: 0 };
    const mockFetch: HttpFetchFn = async (url, _timeout) => {
      sscCallCount.n++;
      return JSON.stringify({
        data: [{ fileUrl: "https://vps-proxy.example.com/iboard/vcb-bctc.pdf" }],
      });
    };

    const result = await discoverHosePdfUrls("VCB", {
      _fetchSsc: mockFetch,       // deprecated no-op
      _fetchCafef: mockEmptyJson, // deprecated no-op
      _fetchVietstock: mockEmptyJson, // deprecated no-op
    });

    // SSC removed → _fetchSsc never called → no URLs
    expect(sscCallCount.n).toBe(0);
    expect(result.urls).toHaveLength(0);
    expect(result.source).toBeNull();
  });

  it("SSC_IBOARD_BASE_URL env var is no longer consulted (strategy removed)", async () => {
    // TASK_1944b: env var accepted but strategy is dead.
    const prevBase = Bun.env["SSC_IBOARD_BASE_URL"];
    Bun.env["SSC_IBOARD_BASE_URL"] = "https://vps-proxy.example.com/iboard";

    try {
      const result = await discoverHosePdfUrls("VCB", {
        _fetchSsc: async () =>
          JSON.stringify({ data: [{ fileUrl: "https://vps-proxy.example.com/iboard/vcb-bctc.pdf" }] }),
        _fetchCafef: mockEmptyJson,
        _fetchVietstock: mockEmptyJson,
      });

      // No SSC call happens despite env var being set
      expect(result.urls).toHaveLength(0);
      expect(result.source).toBeNull();
    } finally {
      if (prevBase === undefined) {
        delete Bun.env["SSC_IBOARD_BASE_URL"];
      } else {
        Bun.env["SSC_IBOARD_BASE_URL"] = prevBase;
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests — discoverHosePdfUrls: cafef strategy removal (TASK_1916b)
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK_1916b — discoverHosePdfUrls cafef strategy permanently removed", () => {
  it("_fetchCafef is silently ignored -- cafef is never called even when supplied", async () => {
    const cafefCallCount = { n: 0 };

    const cafefMock: HttpFetchFn = async (_url, _timeout) => {
      cafefCallCount.n++;
      return JSON.stringify({
        Data: [{ Url: "/data/files/fpt-bctc-q1-2025.pdf" }],
      });
    };

    // SSC also fails so all active strategies return empty
    const result = await discoverHosePdfUrls("FPT", {
      _fetchSsc: mockDnsFail,
      _fetchCafef: cafefMock,        // passed but must NOT be called
      _fetchVietstock: mockEmptyJson,
    });

    // cafef must NOT have been invoked
    expect(cafefCallCount.n).toBe(0);
    // No PDF found (SSC dead, vietstock empty, cafef skipped)
    expect(result.urls).toHaveLength(0);
    expect(result.source).toBeNull();
  });

  it("returns null source when SSC fails and cafef mock has PDFs (cafef ignored)", async () => {
    // Verify that even when _fetchCafef would succeed, cafef strategy is never activated
    const result = await discoverHosePdfUrls("HPG", {
      _fetchSsc: mockDnsFail,
      _fetchCafef: mockCafefJsonSuccess("HPG"), // would have returned PDFs -- now ignored
      _fetchVietstock: mockEmptyJson,
    });

    expect(result.source).toBeNull();
    expect(result.urls).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests — bctcQueueEnricherJob: MISSING placeholder cleanup
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX — enricher job resets MISSING placeholder source_urls to NULL", () => {
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

  it("items with source_url='MISSING' are treated as NULL (re-queued for enrichment)", async () => {
    // TASK_1944b: SSC removed. Use VPS Playwright mock to populate URLs.
    // Insert items that have MISSING placeholder (legacy bad state)
    testDb.prepare(`
      INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, source_url)
      VALUES (?, ?, ?, ?, ?)
    `).run("BID", 2025, "Q1", "pending", "MISSING");
    testDb.prepare(`
      INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, source_url)
      VALUES (?, ?, ?, ?, ?)
    `).run("BSR", 2025, "Q1", "pending", "MISSING");

    const prev = Bun.env["BCTC_DISCOVER_URL"];
    Bun.env["BCTC_DISCOVER_URL"] = "http://125.212.251.27:8765/proxy/bctc-discover";

    try {
      // Run enricher with VPS mock (SSC removed — use Strategy 1 instead).
      const result = await runBctcQueueEnricherJob({
        db: testDb,
        discoverOptions: {
          _fetchHsx: async () => [],
          _fetchVpsPlaywright: async (_url, _timeout) =>
            JSON.stringify({
              results: [{ url: "https://owa.hnx.vn/bctc/bid-q1-2025.pdf", source: "HNX", confidence: 0.9 }],
              error: null,
            }),
          _fetchSsc: mockSscSuccess("BID"),   // deprecated no-op
          _fetchCafef: mockEmptyJson,          // deprecated no-op
          _fetchVietstock: mockEmptyJson,      // deprecated no-op
        },
      });

      // MISSING items should be discovered (treated as pending with null URL)
      expect(result.itemsProcessed).toBe(2);
      expect(result.urlsPopulated).toBe(2);

      const items = testDb.query(
        "SELECT action_code, source_url FROM bctc_vps_queue ORDER BY action_code"
      ).all() as Array<{ action_code: string; source_url: string | null }>;

      for (const item of items) {
        expect(item.source_url).not.toBeNull();
        expect(item.source_url).not.toBe("MISSING");
        expect(item.source_url).toMatch(/\.pdf$/i);
      }
    } finally {
      if (prev === undefined) delete Bun.env["BCTC_DISCOVER_URL"];
      else Bun.env["BCTC_DISCOVER_URL"] = prev;
    }
  });

  it("items with source_url='/test-*' placeholders are also reset for enrichment", async () => {
    // TASK_1944b: SSC removed. Use VPS Playwright mock to populate URLs.
    testDb.prepare(`
      INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, source_url)
      VALUES (?, ?, ?, ?, ?)
    `).run("DGC", 2025, "Q1", "pending", "/test-dgc-bctc.pdf");

    const prev = Bun.env["BCTC_DISCOVER_URL"];
    Bun.env["BCTC_DISCOVER_URL"] = "http://125.212.251.27:8765/proxy/bctc-discover";

    try {
      // /test-* is a placeholder — should be re-enriched via VPS (SSC removed).
      const result = await runBctcQueueEnricherJob({
        db: testDb,
        discoverOptions: {
          _fetchHsx: async () => [],
          _fetchVpsPlaywright: async (_url, _timeout) =>
            JSON.stringify({
              results: [{ url: "https://owa.hnx.vn/bctc/dgc-q1-2025.pdf", source: "HNX", confidence: 0.9 }],
              error: null,
            }),
          _fetchSsc: mockSscSuccess("DGC"),  // deprecated no-op
          _fetchCafef: mockEmptyJson,         // deprecated no-op
          _fetchVietstock: mockEmptyJson,     // deprecated no-op
        },
      });

      // /test-* placeholder items should be treated as needing enrichment
      expect(result.itemsProcessed).toBe(1);
      expect(result.urlsPopulated).toBe(1);

      const item = testDb.query(
        "SELECT source_url FROM bctc_vps_queue WHERE action_code = 'DGC'"
      ).get() as { source_url: string | null };

      expect(item.source_url).not.toBeNull();
      expect(item.source_url).not.toContain("/test-");
      expect(item.source_url).toMatch(/^https?:\/\//);
    } finally {
      if (prev === undefined) delete Bun.env["BCTC_DISCOVER_URL"];
      else Bun.env["BCTC_DISCOVER_URL"] = prev;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests — bctcQueueEnricherJob: VPS proxy env var injection
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX — enricher job propagates SSC_IBOARD_BASE_URL to discovery", () => {
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

  it("enricher populates source_url when VPS Playwright mock returns PDF", async () => {
    // TASK_1944b: SSC removed. Route enrichment through VPS Playwright mock.
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
              results: [{ url: "https://vps.example.com/vnm-bctc-q1-2025.pdf", source: "HNX", confidence: 0.9 }],
              error: null,
            }),
          _fetchSsc: mockSscSuccess("VNM"),  // deprecated no-op
          _fetchCafef: mockEmptyJson,         // deprecated no-op
          _fetchVietstock: mockEmptyJson,     // deprecated no-op
        },
      });

      expect(result.itemsProcessed).toBe(1);
      expect(result.urlsPopulated).toBe(1);

      const row = testDb.query(
        "SELECT source_url FROM bctc_vps_queue WHERE action_code = 'VNM'"
      ).get() as { source_url: string | null };

      expect(row.source_url).toContain("vnm-bctc-q1-2025.pdf");
    } finally {
      if (prev === undefined) delete Bun.env["BCTC_DISCOVER_URL"];
      else Bun.env["BCTC_DISCOVER_URL"] = prev;
    }
  });
});
