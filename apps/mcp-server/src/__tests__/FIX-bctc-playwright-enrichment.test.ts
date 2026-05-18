/**
 * FIX — BCTC Playwright Enrichment (fix/bctc-playwright-enrichment)
 *
 * iboard-query.ssc.vn is NXDOMAIN — dead domain, not geo-blocked.
 * Fix: Add a new primary discovery strategy that calls the VPS
 * `/proxy/bctc-discover/:ticker` endpoint, which runs the Playwright
 * Python script (`discover-bctc-urls-browser.py`) as a subprocess.
 *
 * The Python script returns:
 *   { results: [{ url: "https://...", source: "HNX"|"UPCOM", confidence: 0.9 }], error: null }
 *
 * New env var: BCTC_DISCOVER_URL (e.g. http://125.212.251.27:8765/proxy/bctc-discover)
 *
 * Strategy order after fix:
 *   0. VPS Playwright endpoint (BCTC_DISCOVER_URL) — primary, highest confidence
 *   1. SSC iboard JSON API  — fallback via SSC_IBOARD_BASE_URL
 *   2. cafef.vn JSON API    — fallback 2
 *   3. vietstock.vn scrape  — fallback 3
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
// Mock helpers — Python script output shape
// ─────────────────────────────────────────────────────────────────────────────

/** VPS Playwright endpoint mock — returns Python script JSON output. */
function mockVpsPlaywrightSuccess(ticker: string, source = "HNX"): HttpFetchFn {
  return async (_url, _timeout) =>
    JSON.stringify({
      results: [
        {
          url: `https://owa.hnx.vn/ftp/${ticker.toLowerCase()}-bctc-q4-2025.pdf`,
          source,
          confidence: 0.9,
          page_title: `BCTC Q4 2025 ${ticker}`,
        },
      ],
      error: null,
    });
}

/** VPS endpoint mock — HOSE stock, no PDF URL (Python returns empty results). */
function mockVpsPlaywrightHoseNoUrl(ticker: string): HttpFetchFn {
  return async (_url, _timeout) =>
    JSON.stringify({
      results: [],
      error: `Document found on SSC/HOSE (BCTC Q4 2025 ${ticker}) but no direct PDF URL available. HOSE portal does not expose raw PDF links for automated download.`,
    });
}

/** VPS endpoint mock — network error (VPS unreachable). */
async function mockVpsNetworkFail(_url: string, _timeout: number): Promise<string> {
  throw new Error("ECONNREFUSED 125.212.251.27:8765");
}

/** VPS endpoint mock — returns empty results (no match found). */
async function mockVpsPlaywrightEmpty(_url: string, _timeout: number): Promise<string> {
  return JSON.stringify({
    results: [],
    error: "No PDF found for FAKE 2025 Q4. If HOSE-listed: portal is broken.",
  });
}

/** SSC iboard mock returning one PDF (used as fallback). */
function mockSscSuccess(ticker: string): HttpFetchFn {
  return async (_url, _timeout) =>
    JSON.stringify({
      data: [{ fileUrl: `https://iboard-query.ssc.vn/static/${ticker.toLowerCase()}-bctc.pdf` }],
    });
}

async function mockEmpty(_url: string, _timeout: number): Promise<string> {
  return JSON.stringify({ data: [] });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests — discoverHosePdfUrls: VPS Playwright endpoint as primary strategy
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX — discoverHosePdfUrls uses BCTC_DISCOVER_URL as primary strategy", () => {
  it("returns pdf URL from VPS Playwright endpoint when BCTC_DISCOVER_URL is set", async () => {
    const capturedUrls: string[] = [];

    const vpsProxy: HttpFetchFn = async (url, timeout) => {
      capturedUrls.push(url);
      return mockVpsPlaywrightSuccess("SHB")("", timeout);
    };

    const prev = Bun.env["BCTC_DISCOVER_URL"];
    Bun.env["BCTC_DISCOVER_URL"] = "http://125.212.251.27:8765/proxy/bctc-discover";

    try {
      const result = await discoverHosePdfUrls("SHB", {
        _fetchVpsPlaywright: vpsProxy,
        _fetchSsc: mockEmpty,
        _fetchCafef: mockEmpty,
        _fetchVietstock: mockEmpty,
      });

      // Must call VPS endpoint with ticker + year + quarter params
      expect(capturedUrls.length).toBeGreaterThan(0);
      expect(capturedUrls[0]).toContain("125.212.251.27");
      expect(capturedUrls[0]).toContain("SHB");

      expect(result.urls.length).toBeGreaterThan(0);
      expect(result.source).toBe("vps-playwright");
      expect(result.urls[0]).toMatch(/\.pdf$/i);
      expect(result.urls[0]).toContain("owa.hnx.vn");
    } finally {
      if (prev === undefined) delete Bun.env["BCTC_DISCOVER_URL"];
      else Bun.env["BCTC_DISCOVER_URL"] = prev;
    }
  });

  it("skips VPS Playwright strategy when BCTC_DISCOVER_URL is not set", async () => {
    // TASK_1944b: SSC strategy removed. When VPS is not configured and hsx not supplied,
    // all strategies are skipped → source = null.
    const vpsCallCount = { n: 0 };
    const vpsMock: HttpFetchFn = async (url, timeout) => {
      vpsCallCount.n++;
      return mockVpsPlaywrightSuccess("VCB")("", timeout);
    };

    const prevDiscover = Bun.env["BCTC_DISCOVER_URL"];
    delete Bun.env["BCTC_DISCOVER_URL"];

    try {
      const result = await discoverHosePdfUrls("VCB", {
        _fetchVpsPlaywright: vpsMock,
        _fetchSsc: mockSscSuccess("VCB"),   // deprecated no-op
        _fetchCafef: mockEmpty,              // deprecated no-op
        _fetchVietstock: mockEmpty,          // deprecated no-op
      });

      // VPS strategy skipped (no BCTC_DISCOVER_URL) + SSC/vietstock removed → no result
      expect(vpsCallCount.n).toBe(0);
      expect(result.source).toBeNull();
      expect(result.urls).toHaveLength(0);
    } finally {
      if (prevDiscover !== undefined) Bun.env["BCTC_DISCOVER_URL"] = prevDiscover;
    }
  });

  it("returns empty when VPS Playwright returns empty results (SSC removed TASK_1944b)", async () => {
    // TASK_1944b: SSC strategy removed. VPS empty + no other live strategy → source = null.
    const prev = Bun.env["BCTC_DISCOVER_URL"];
    Bun.env["BCTC_DISCOVER_URL"] = "http://125.212.251.27:8765/proxy/bctc-discover";

    try {
      const result = await discoverHosePdfUrls("FAKE", {
        _fetchVpsPlaywright: mockVpsPlaywrightEmpty,
        _fetchSsc: mockSscSuccess("FAKE"),  // deprecated no-op
        _fetchCafef: mockEmpty,              // deprecated no-op
        _fetchVietstock: mockEmpty,          // deprecated no-op
      });

      // SSC removed → all strategies exhausted → null
      expect(result.source).toBeNull();
      expect(result.urls).toHaveLength(0);
    } finally {
      if (prev === undefined) delete Bun.env["BCTC_DISCOVER_URL"];
      else Bun.env["BCTC_DISCOVER_URL"] = prev;
    }
  });

  it("returns empty when VPS Playwright endpoint is unreachable (SSC removed TASK_1944b)", async () => {
    // TASK_1944b: SSC strategy removed. VPS network fail + no other live strategy → source = null.
    const prev = Bun.env["BCTC_DISCOVER_URL"];
    Bun.env["BCTC_DISCOVER_URL"] = "http://125.212.251.27:8765/proxy/bctc-discover";

    try {
      const result = await discoverHosePdfUrls("ACB", {
        _fetchVpsPlaywright: mockVpsNetworkFail,
        _fetchSsc: mockSscSuccess("ACB"),  // deprecated no-op
        _fetchCafef: mockEmpty,             // deprecated no-op
        _fetchVietstock: mockEmpty,         // deprecated no-op
      });

      // VPS unreachable + SSC removed → no fallback → null
      expect(result.source).toBeNull();
      expect(result.urls).toHaveLength(0);
    } finally {
      if (prev === undefined) delete Bun.env["BCTC_DISCOVER_URL"];
      else Bun.env["BCTC_DISCOVER_URL"] = prev;
    }
  });

  it("returns empty when VPS returns HOSE no-url error (no PDF directly discoverable)", async () => {
    const prev = Bun.env["BCTC_DISCOVER_URL"];
    Bun.env["BCTC_DISCOVER_URL"] = "http://125.212.251.27:8765/proxy/bctc-discover";

    try {
      const result = await discoverHosePdfUrls("VNM", {
        _fetchVpsPlaywright: mockVpsPlaywrightHoseNoUrl("VNM"),
        _fetchSsc: mockEmpty,
        _fetchCafef: mockEmpty,
        _fetchVietstock: mockEmpty,
      });

      // HOSE stock — VPS confirms doc but no PDF URL
      expect(result.urls).toHaveLength(0);
      expect(result.source).toBeNull();
    } finally {
      if (prev === undefined) delete Bun.env["BCTC_DISCOVER_URL"];
      else Bun.env["BCTC_DISCOVER_URL"] = prev;
    }
  });

  it("VPS Playwright URL is constructed with ticker, year, quarter params", async () => {
    const capturedUrls: string[] = [];

    const vpsProxy: HttpFetchFn = async (url, _timeout) => {
      capturedUrls.push(url);
      return JSON.stringify({ results: [], error: null });
    };

    const prev = Bun.env["BCTC_DISCOVER_URL"];
    Bun.env["BCTC_DISCOVER_URL"] = "http://125.212.251.27:8765/proxy/bctc-discover";

    try {
      await discoverHosePdfUrls("PVS", {
        _fetchVpsPlaywright: vpsProxy,
        _fetchSsc: mockEmpty,
        _fetchCafef: mockEmpty,
        _fetchVietstock: mockEmpty,
        year: 2025,
        quarter: "Q4",
      });

      expect(capturedUrls.length).toBeGreaterThan(0);
      const url = capturedUrls[0]!;
      expect(url).toContain("PVS");
      expect(url).toContain("2025");
      expect(url).toContain("4"); // quarter number
    } finally {
      if (prev === undefined) delete Bun.env["BCTC_DISCOVER_URL"];
      else Bun.env["BCTC_DISCOVER_URL"] = prev;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests — VPS proxy response parsing
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX — extractVpsPlaywrightUrls parses Python script JSON output", () => {
  it("extracts url from results array when pdf url present", async () => {
    const prev = Bun.env["BCTC_DISCOVER_URL"];
    Bun.env["BCTC_DISCOVER_URL"] = "http://vps:8765/proxy/bctc-discover";

    try {
      const result = await discoverHosePdfUrls("ACB", {
        _fetchVpsPlaywright: async (_url, _timeout) =>
          JSON.stringify({
            results: [
              { url: "https://owa.hnx.vn/ftp/acb-bctc-q1-2025.pdf", source: "HNX", confidence: 0.9 },
            ],
            error: null,
          }),
        _fetchSsc: mockEmpty,
        _fetchCafef: mockEmpty,
        _fetchVietstock: mockEmpty,
      });

      expect(result.urls).toHaveLength(1);
      expect(result.urls[0]).toBe("https://owa.hnx.vn/ftp/acb-bctc-q1-2025.pdf");
      expect(result.source).toBe("vps-playwright");
    } finally {
      if (prev === undefined) delete Bun.env["BCTC_DISCOVER_URL"];
      else Bun.env["BCTC_DISCOVER_URL"] = prev;
    }
  });

  it("ignores results with null url (HOSE-SSC confirmation only)", async () => {
    const prev = Bun.env["BCTC_DISCOVER_URL"];
    Bun.env["BCTC_DISCOVER_URL"] = "http://vps:8765/proxy/bctc-discover";

    try {
      const result = await discoverHosePdfUrls("VCB", {
        _fetchVpsPlaywright: async (_url, _timeout) =>
          JSON.stringify({
            results: [
              { url: null, source: "HOSE-SSC", confidence: 0.55 },
            ],
            error: "Document found on SSC/HOSE but no direct PDF URL.",
          }),
        _fetchSsc: mockEmpty,
        _fetchCafef: mockEmpty,
        _fetchVietstock: mockEmpty,
      });

      // null url must not make it into result.urls
      expect(result.urls).toHaveLength(0);
    } finally {
      if (prev === undefined) delete Bun.env["BCTC_DISCOVER_URL"];
      else Bun.env["BCTC_DISCOVER_URL"] = prev;
    }
  });

  it("handles non-PDF url in results gracefully (filters it out)", async () => {
    const prev = Bun.env["BCTC_DISCOVER_URL"];
    Bun.env["BCTC_DISCOVER_URL"] = "http://vps:8765/proxy/bctc-discover";

    try {
      const result = await discoverHosePdfUrls("ACB", {
        _fetchVpsPlaywright: async (_url, _timeout) =>
          JSON.stringify({
            results: [
              { url: "https://hnx.vn/page/acb", source: "HNX", confidence: 0.5 },
            ],
            error: null,
          }),
        _fetchSsc: mockEmpty,
        _fetchCafef: mockEmpty,
        _fetchVietstock: mockEmpty,
      });

      // Non-PDF URLs must be filtered
      expect(result.urls.filter(u => !u.toLowerCase().endsWith(".pdf"))).toHaveLength(0);
    } finally {
      if (prev === undefined) delete Bun.env["BCTC_DISCOVER_URL"];
      else Bun.env["BCTC_DISCOVER_URL"] = prev;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests — bctcQueueEnricherJob: uses VPS Playwright strategy
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX — bctcQueueEnricherJob uses VPS Playwright when BCTC_DISCOVER_URL set", () => {
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

  it("populates source_url via VPS Playwright proxy endpoint", async () => {
    testDb.prepare(`
      INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, source_url)
      VALUES (?, ?, ?, ?, ?)
    `).run("SHB", 2025, "Q4", "pending", null);

    const prev = Bun.env["BCTC_DISCOVER_URL"];
    Bun.env["BCTC_DISCOVER_URL"] = "http://125.212.251.27:8765/proxy/bctc-discover";

    try {
      const result = await runBctcQueueEnricherJob({
        db: testDb,
        discoverOptions: {
          _fetchHsx: async () => [],
          _fetchVpsPlaywright: mockVpsPlaywrightSuccess("SHB"),
          _fetchSsc: mockEmpty,
          _fetchCafef: mockEmpty,
          _fetchVietstock: mockEmpty,
        },
      });

      expect(result.itemsProcessed).toBe(1);
      expect(result.urlsPopulated).toBe(1);

      const row = testDb.query(
        "SELECT source_url FROM bctc_vps_queue WHERE action_code = 'SHB'"
      ).get() as { source_url: string | null };

      expect(row.source_url).not.toBeNull();
      expect(row.source_url).toMatch(/\.pdf$/i);
      expect(row.source_url).toContain("owa.hnx.vn");
    } finally {
      if (prev === undefined) delete Bun.env["BCTC_DISCOVER_URL"];
      else Bun.env["BCTC_DISCOVER_URL"] = prev;
    }
  });

  it("populates no source_url when VPS Playwright fails (SSC removed TASK_1944b)", async () => {
    // TASK_1944b: SSC strategy removed. VPS failure → no fallback → item stays pending.
    testDb.prepare(`
      INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, source_url)
      VALUES (?, ?, ?, ?, ?)
    `).run("ACB", 2025, "Q4", "pending", null);

    const prev = Bun.env["BCTC_DISCOVER_URL"];
    Bun.env["BCTC_DISCOVER_URL"] = "http://125.212.251.27:8765/proxy/bctc-discover";

    try {
      const result = await runBctcQueueEnricherJob({
        db: testDb,
        discoverOptions: {
          _fetchHsx: async () => [],
          _fetchVpsPlaywright: mockVpsNetworkFail,
          _fetchSsc: mockSscSuccess("ACB"),  // deprecated no-op
          _fetchCafef: mockEmpty,             // deprecated no-op
          _fetchVietstock: mockEmpty,         // deprecated no-op
        },
      });

      // VPS fails + SSC removed → 0 URLs → source_url stays null
      expect(result.itemsProcessed).toBe(1);
      expect(result.urlsPopulated).toBe(0);

      const row = testDb.query(
        "SELECT source_url FROM bctc_vps_queue WHERE action_code = 'ACB'"
      ).get() as { source_url: string | null };

      expect(row.source_url).toBeNull();
    } finally {
      if (prev === undefined) delete Bun.env["BCTC_DISCOVER_URL"];
      else Bun.env["BCTC_DISCOVER_URL"] = prev;
    }
  });
});
