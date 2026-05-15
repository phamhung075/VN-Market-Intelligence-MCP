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

describe("FIX — discoverHosePdfUrls uses SSC_IBOARD_BASE_URL env override", () => {
  it("SSC strategy builds URL from SSC_IBOARD_BASE_URL when set", async () => {
    const capturedUrls: string[] = [];

    const mockFetch: HttpFetchFn = async (url, _timeout) => {
      capturedUrls.push(url);
      return JSON.stringify({
        data: [{ fileUrl: "https://vps-proxy.example.com/iboard/vcb-bctc.pdf" }],
      });
    };

    // Override env var to simulate VPS proxy routing
    const originalBase = Bun.env["SSC_IBOARD_BASE_URL"];
    Bun.env["SSC_IBOARD_BASE_URL"] = "https://vps-proxy.example.com/iboard";

    try {
      const result = await discoverHosePdfUrls("VCB", {
        _fetchSsc: mockFetch,
        _fetchCafef: mockEmptyJson,
        _fetchVietstock: mockEmptyJson,
      });

      // The fetch URL must use SSC_IBOARD_BASE_URL, not the hardcoded domain
      expect(capturedUrls.length).toBeGreaterThan(0);
      expect(capturedUrls[0]).toContain("vps-proxy.example.com/iboard");
      expect(result.urls.length).toBeGreaterThan(0);
      expect(result.source).toBe("ssc");
    } finally {
      if (originalBase === undefined) {
        delete Bun.env["SSC_IBOARD_BASE_URL"];
      } else {
        Bun.env["SSC_IBOARD_BASE_URL"] = originalBase;
      }
    }
  });

  it("falls back to hardcoded iboard domain when SSC_IBOARD_BASE_URL not set", async () => {
    const capturedUrls: string[] = [];

    const mockFetch: HttpFetchFn = async (url, _timeout) => {
      capturedUrls.push(url);
      throw new Error("ENOTFOUND");
    };

    delete Bun.env["SSC_IBOARD_BASE_URL"];

    const result = await discoverHosePdfUrls("VCB", {
      _fetchSsc: mockFetch,
      _fetchCafef: mockEmptyJson,
      _fetchVietstock: mockEmptyJson,
    });

    expect(capturedUrls.length).toBeGreaterThan(0);
    expect(capturedUrls[0]).toContain("iboard-query.ssc.vn");
    expect(result.urls).toHaveLength(0);
    expect(result.source).toBeNull();
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
    // Insert items that have MISSING placeholder (legacy bad state)
    testDb.prepare(`
      INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, source_url)
      VALUES (?, ?, ?, ?, ?)
    `).run("BID", 2025, "Q1", "pending", "MISSING");
    testDb.prepare(`
      INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, source_url)
      VALUES (?, ?, ?, ?, ?)
    `).run("BSR", 2025, "Q1", "pending", "MISSING");

    // Run enricher with a mock that will succeed if items are treated as NULL.
    // _fetchHsx returns [] to ensure Strategy 0 does not intercept so SSC mock fires.
    const result = await runBctcQueueEnricherJob({
      db: testDb,
      discoverOptions: {
        _fetchHsx: async () => [],
        _fetchSsc: mockSscSuccess("BID"),
        _fetchCafef: mockEmptyJson,
        _fetchVietstock: mockEmptyJson,
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
  });

  it("items with source_url='/test-*' placeholders are also reset for enrichment", async () => {
    testDb.prepare(`
      INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, source_url)
      VALUES (?, ?, ?, ?, ?)
    `).run("DGC", 2025, "Q1", "pending", "/test-dgc-bctc.pdf");

    // /test-* is a placeholder — should be re-enriched.
    // _fetchHsx returns [] so Strategy 0 does not intercept; SSC mock fires.
    const result = await runBctcQueueEnricherJob({
      db: testDb,
      discoverOptions: {
        _fetchHsx: async () => [],
        _fetchSsc: mockSscSuccess("DGC"),
        _fetchCafef: mockEmptyJson,
        _fetchVietstock: mockEmptyJson,
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

  it("enricher populates source_url when mock SSC via VPS returns PDF", async () => {
    testDb.prepare(`
      INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, source_url)
      VALUES (?, ?, ?, ?, ?)
    `).run("VNM", 2025, "Q1", "pending", null);

    const vpsProxyMock: HttpFetchFn = async (_url, _timeout) => {
      return JSON.stringify({
        data: [{ fileUrl: "https://vps.example.com/vnm-bctc-q1-2025.pdf" }],
      });
    };

    // _fetchHsx returns [] so Strategy 0 does not intercept; VPS proxy SSC mock fires.
    const result = await runBctcQueueEnricherJob({
      db: testDb,
      discoverOptions: {
        _fetchHsx: async () => [],
        _fetchSsc: vpsProxyMock,
        _fetchCafef: mockEmptyJson,
        _fetchVietstock: mockEmptyJson,
      },
    });

    expect(result.itemsProcessed).toBe(1);
    expect(result.urlsPopulated).toBe(1);

    const row = testDb.query(
      "SELECT source_url FROM bctc_vps_queue WHERE action_code = 'VNM'"
    ).get() as { source_url: string | null };

    expect(row.source_url).toContain("vnm-bctc-q1-2025.pdf");
  });
});
