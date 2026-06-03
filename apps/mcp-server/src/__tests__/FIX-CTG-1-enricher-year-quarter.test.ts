/**
 * FIX-CTG-1 — Enricher year/quarter forwarding + fetcher quarter filtering
 *
 * Three DoD test cases:
 *
 *   TC-A: Enricher SELECT includes period_year/period_quarter and forwards them
 *         to discoverHosePdfUrls — the injectable _fetchHsx receives the row's
 *         own year and quarter, NOT the current-year/Q4 default.
 *
 *   TC-B: fetchHsxBctcUrls quarter filter selects Q1 items only from a mixed-
 *         quarter list (Q1 + Q3 + Q4 items all in the same API response).
 *
 *   TC-C: fetchHsxBctcUrls ranks "hop nhat" (consolidated) above a "CV CBTT"
 *         cover-letter entry when both are in the same quarter bucket.
 *
 * All HTTP calls are mocked — no live network access.
 *
 * Root-cause context: bctcQueueEnricherJob previously selected only
 * (id, action_code, attempts), defaulting to year=currentYear / quarter="Q4".
 * This corrupted Q3-2025 and Q2-2025 CTG queue rows with a Q1-2026 hsx.vn URL.
 * (See docs/architecture-briefs/2026-06-03-bctc-ctg-attachment-fetch-spike.md §3.)
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import type { Database } from "bun:sqlite";
import { Database as SqliteDatabase } from "bun:sqlite";

import { initDatabase, closeDb } from "../infrastructure/db/schema.js";
import { runBctcQueueEnricherJob } from "../scheduler/financial-reports/bctcQueueEnricherJob.js";
import { fetchHsxBctcUrls } from "../infrastructure/fetchers/hsxBctcFetcher.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fetch interceptor (for TC-B and TC-C)
// ─────────────────────────────────────────────────────────────────────────────

interface MockResponse {
  status: number;
  body: string;
}

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
      throw new Error(`[test] Unmocked fetch URL: ${url}`);
    },
    { preconnect: () => { /* noop */ } },
  ) as typeof globalThis.fetch;
}

function restoreFetch(): void {
  globalThis.fetch = originalFetch;
}

// ─────────────────────────────────────────────────────────────────────────────
// DB helpers (for TC-A)
// ─────────────────────────────────────────────────────────────────────────────

function insertQueueItem(
  db: Database,
  code: string,
  year: number,
  quarter: string,
  sourceUrl: string | null = null,
): void {
  db.prepare(`
    INSERT OR REPLACE INTO bctc_vps_queue
      (action_code, period_year, period_quarter, status, source_url)
    VALUES (?, ?, ?, 'pending', ?)
  `).run(code, year, quarter, sourceUrl);
}

function getQueueItem(
  db: Database,
  code: string,
): { source_url: string | null; status: string } | undefined {
  return db.query(
    `SELECT source_url, status FROM bctc_vps_queue WHERE action_code = ? LIMIT 1`,
  ).get(code) as any;
}

// ─────────────────────────────────────────────────────────────────────────────
// hsx.vn fixture responses (mirroring real API shape from spike evidence)
// ─────────────────────────────────────────────────────────────────────────────

const CTG_ID = 2351;

const stockLookupBody = JSON.stringify({
  data: { list: [{ id: CTG_ID, code: "CTG", name: "CTG Company" }] },
});

/**
 * Mixed-quarter mediafiles response for year=2025.
 * Contains Q1, Q3, Q4 items — shape matches real hsx.vn API (time="MM.YYYY").
 */
const mixedQuarterMediafilesBody = JSON.stringify({
  data: {
    list: [
      // Q4 2025 — hop nhat
      {
        fileName: "20260130 - CTG - BCTC hop nhat Quy IV.2025 va giai trinh_signed.pdf",
        fileType: ".pdf",
        filePath: "~/Uploads/UploadDocuments/2436209/20260130-CTG-Q4-2025.pdf",
        time: "04.2025",
        type: "Quý",
      },
      // Q1 2025 — hop nhat (target for TC-B)
      {
        fileName: "20250429 - CTG - BCTC hop nhat Quy 1.2025_signed.pdf",
        fileType: ".pdf",
        filePath: "~/Uploads/FinancialReport/192/20250429-CTG-Q1-2025-hop-nhat.pdf",
        time: "01.2025",
        type: "Quý",
      },
      // Q3 2025 — hop nhat
      {
        fileName: "20251030 - CTG - BCTC hop nhat Quy 3.2025 va giai trinh_signed.pdf",
        fileType: ".pdf",
        filePath: "~/Uploads/UploadDocuments/2414988/20251030-CTG-Q3-2025.pdf",
        time: "03.2025",
        type: "Quý",
      },
      // Annual 2025
      {
        fileName: "20260331 - CTG - BCTC hop nhat kiem toan nam 2025_signed.pdf",
        fileType: ".pdf",
        filePath: "~/Uploads/UploadDocuments/2448737/20260331-CTG-nam-2025.pdf",
        time: "2025",
        type: "Năm",
      },
      // Non-PDF — must be filtered out
      {
        fileName: "CTG - Spreadsheet.xlsx",
        fileType: ".xlsx",
        filePath: "~/Uploads/Something/ctg.xlsx",
        time: "01.2025",
        type: "Quý",
      },
    ],
  },
});

/**
 * Mixed-content Q1 response: one "hop nhat" (consolidated) + one "CV CBTT" cover letter
 * for the same quarter. Used in TC-C.
 */
const q1MixedContentMediafilesBody = JSON.stringify({
  data: {
    list: [
      // Cover letter — should rank BELOW hop nhat (TC-C)
      {
        fileName: "CV CBTT BCTC Quy I.2026 VI.pdf",
        fileType: ".pdf",
        filePath: "~/Uploads/Something/CV_CBTT_BCTC_Quy_I.2026_VI.pdf",
        time: "01.2026",
        type: "Quý",
      },
      // Full consolidated statement — should rank FIRST (TC-C)
      {
        fileName: "20260428 - CTG - BCTC hop nhat Quy I.2026 va giai trinh_signed.pdf",
        fileType: ".pdf",
        filePath: "~/Uploads/UploadDocuments/2457879/20260428-CTG-hop-nhat-Q1-2026.pdf",
        time: "01.2026",
        type: "Quý",
      },
    ],
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-A: Enricher passes row's period_year/period_quarter to discoverHosePdfUrls
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-CTG-1 TC-A — enricher forwards period_year/period_quarter from queue row", () => {
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

  it("forwards period_year=2025 and period_quarter=Q3 from a Q3-2025 queue row to _fetchHsx", async () => {
    insertQueueItem(testDb, "CTG", 2025, "Q3");

    // Capture what year/quarter the injectable actually receives
    const captured: Array<{ ticker: string; year: number; quarter: string | undefined }> = [];

    const result = await runBctcQueueEnricherJob({
      db: testDb,
      discoverOptions: {
        _fetchHsx: async (ticker, year, _timeout, quarter) => {
          captured.push({ ticker, year, quarter });
          // Return a valid URL so the enricher writes it to the row
          return [`https://staticfile.hsx.vn/test/${ticker}-${year}-${quarter}.pdf`];
        },
      },
    });

    expect(result.itemsProcessed).toBe(1);
    expect(result.urlsPopulated).toBe(1);

    // The injectable must have been called with the ROW's year and quarter
    expect(captured.length).toBe(1);
    expect(captured[0]!.ticker).toBe("CTG");
    expect(captured[0]!.year).toBe(2025);
    expect(captured[0]!.quarter).toBe("Q3");

    // The written source_url must reference the correct year/quarter
    const row = getQueueItem(testDb, "CTG");
    expect(row?.source_url).toContain("2025-Q3");
  });

  it("forwards period_year=2026 and period_quarter=Q1 from a Q1-2026 queue row", async () => {
    insertQueueItem(testDb, "CTG", 2026, "Q1");

    const captured: Array<{ year: number; quarter: string | undefined }> = [];

    await runBctcQueueEnricherJob({
      db: testDb,
      discoverOptions: {
        _fetchHsx: async (_ticker, year, _timeout, quarter) => {
          captured.push({ year, quarter });
          return ["https://staticfile.hsx.vn/test/dummy.pdf"];
        },
      },
    });

    expect(captured.length).toBe(1);
    expect(captured[0]!.year).toBe(2026);
    expect(captured[0]!.quarter).toBe("Q1");
  });

  it("two rows with different quarters each receive their own year/quarter", async () => {
    insertQueueItem(testDb, "CTG", 2025, "Q2");
    insertQueueItem(testDb, "CTG2", 2024, "Q4");

    const captured: Map<string, { year: number; quarter: string | undefined }> = new Map();

    await runBctcQueueEnricherJob({
      db: testDb,
      discoverOptions: {
        _fetchHsx: async (ticker, year, _timeout, quarter) => {
          captured.set(ticker, { year, quarter });
          return ["https://staticfile.hsx.vn/test/dummy.pdf"];
        },
      },
    });

    expect(captured.get("CTG")).toEqual({ year: 2025, quarter: "Q2" });
    expect(captured.get("CTG2")).toEqual({ year: 2024, quarter: "Q4" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-B: fetchHsxBctcUrls quarter filter returns only Q1 items from mixed-quarter list
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-CTG-1 TC-B — fetchHsxBctcUrls quarter filter", () => {
  afterEach(() => {
    restoreFetch();
    urlMocks = {};
    delete Bun.env["HSX_BCTC_ENABLED"];
  });

  it("returns only Q1 items from a response containing Q1, Q3, Q4 and annual items", async () => {
    installUrlMocks({
      "/l/api/v1/1/securities/stock": { status: 200, body: stockLookupBody },
      "/m/api/v1/1/mediafiles/5/":    { status: 200, body: mixedQuarterMediafilesBody },
    });

    const urls = await fetchHsxBctcUrls("CTG", 2025, 5000, "Q1");

    // Only the Q1 item should be returned (time="01.2025")
    expect(urls.length).toBe(1);
    expect(urls[0]).toContain("CTG-Q1-2025-hop-nhat");
    expect(urls[0]).toMatch(/^https:\/\/staticfile\.hsx\.vn\//);
  });

  it("returns only Q3 items from the same mixed-quarter list", async () => {
    installUrlMocks({
      "/l/api/v1/1/securities/stock": { status: 200, body: stockLookupBody },
      "/m/api/v1/1/mediafiles/5/":    { status: 200, body: mixedQuarterMediafilesBody },
    });

    const urls = await fetchHsxBctcUrls("CTG", 2025, 5000, "Q3");

    expect(urls.length).toBe(1);
    expect(urls[0]).toContain("CTG-Q3-2025");
  });

  it("returns [] when no items match the requested quarter", async () => {
    installUrlMocks({
      "/l/api/v1/1/securities/stock": { status: 200, body: stockLookupBody },
      "/m/api/v1/1/mediafiles/5/":    { status: 200, body: mixedQuarterMediafilesBody },
    });

    // Q2 2025 is not present in the fixture
    const urls = await fetchHsxBctcUrls("CTG", 2025, 5000, "Q2");

    expect(urls).toEqual([]);
  });

  it("returns all PDF items (no filtering) when quarter is omitted", async () => {
    installUrlMocks({
      "/l/api/v1/1/securities/stock": { status: 200, body: stockLookupBody },
      "/m/api/v1/1/mediafiles/5/":    { status: 200, body: mixedQuarterMediafilesBody },
    });

    // No quarter → all valid PDFs returned (xlsx and empty-filePath filtered by existing logic)
    const urls = await fetchHsxBctcUrls("CTG", 2025, 5000);

    // 4 valid PDF items (Q4 hop nhat + Q1 hop nhat + Q3 hop nhat + annual)
    expect(urls.length).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-C: fetchHsxBctcUrls prefers "hop nhat" over a "CV CBTT" cover-letter entry
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-CTG-1 TC-C — fetchHsxBctcUrls prefers hop nhat over CV CBTT", () => {
  afterEach(() => {
    restoreFetch();
    urlMocks = {};
    delete Bun.env["HSX_BCTC_ENABLED"];
  });

  it("returns hop nhat PDF first when same-quarter list contains both hop nhat and CV CBTT", async () => {
    installUrlMocks({
      "/l/api/v1/1/securities/stock": { status: 200, body: stockLookupBody },
      "/m/api/v1/1/mediafiles/5/":    { status: 200, body: q1MixedContentMediafilesBody },
    });

    const urls = await fetchHsxBctcUrls("CTG", 2026, 5000, "Q1");

    // Both items are Q1 2026, but hop nhat must rank first
    expect(urls.length).toBe(2);
    expect(urls[0]).toContain("hop-nhat-Q1-2026");
    // Cover letter must be second, not first
    expect(urls[1]).toContain("CV_CBTT");
  });

  it("selects only the hop nhat PDF when quarter-filtered to a single best match", async () => {
    // Response with only hop nhat for Q1 2026 (cover letter filtered by a stricter caller)
    const hopNhatOnlyBody = JSON.stringify({
      data: {
        list: [
          {
            fileName: "20260428 - CTG - BCTC hop nhat Quy I.2026 va giai trinh_signed.pdf",
            fileType: ".pdf",
            filePath: "~/Uploads/UploadDocuments/2457879/20260428-CTG-hop-nhat-Q1-2026.pdf",
            time: "01.2026",
            type: "Quý",
          },
        ],
      },
    });

    installUrlMocks({
      "/l/api/v1/1/securities/stock": { status: 200, body: stockLookupBody },
      "/m/api/v1/1/mediafiles/5/":    { status: 200, body: hopNhatOnlyBody },
    });

    const urls = await fetchHsxBctcUrls("CTG", 2026, 5000, "Q1");

    expect(urls.length).toBe(1);
    expect(urls[0]).toBe(
      "https://staticfile.hsx.vn/Uploads/UploadDocuments/2457879/20260428-CTG-hop-nhat-Q1-2026.pdf",
    );
  });
});
