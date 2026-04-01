/**
 * Task 029 — SSC Portal Scraper
 *
 * Tests for listSscDocuments() in src/infrastructure/fetchers/ssc.ts
 * All browser interactions are mocked — no real Puppeteer or network traffic.
 *
 * The new implementation uses a BrowserFactory (4th arg) instead of HttpClient.
 * page.evaluate() must return rows in the format:
 *   { code, exchange, title, company, description, date, downloadId }
 * where downloadId becomes the document URL (prefixed with "ssc-adf://").
 *
 * For tests that need an https:// URL we set downloadId to a full https:// URL.
 */

import { describe, it, expect } from "bun:test";
import {
  listSscDocuments,
  type SscDocument,
  type BrowserFactory,
  type SscBrowser,
  type SscBrowserPage,
} from "../infrastructure/fetchers/ssc.js";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/** Raw row shape that page.evaluate() returns in the real implementation. */
interface RawSscRow {
  code: string;
  exchange: string;
  title: string;
  company: string;
  description: string;
  date: string;
  downloadId: string;
}

/**
 * Builds a BrowserFactory mock whose page.evaluate() returns the given rows
 * filtered by the code argument (matches real implementation behaviour).
 */
function makeBrowserFactory(rows: RawSscRow[]): BrowserFactory {
  return async (): Promise<SscBrowser> => {
    const page: SscBrowserPage = {
      async goto() { return null; },
      async waitForSelector() { return null; },
      async click() {},
      async type() {},
      async evaluate<T>(fn: (...args: unknown[]) => T, ...args: unknown[]): Promise<T> {
        // The real code passes (targetCode) as the argument; return matching rows.
        const targetCode = args[0] as string | undefined;
        if (targetCode !== undefined) {
          // Called to extract rows — filter by code like the real DOM scraper does.
          const filtered = rows.filter((r) => r.code === targetCode);
          return filtered as unknown as T;
        }
        // Called for search-button click or other side-effects — no return value needed.
        return undefined as unknown as T;
      },
      keyboard: {
        async press(_key: string): Promise<void> {},
      },
      on(_event: string, _handler: (...args: unknown[]) => void) {},
      async close() {},
    };

    return {
      async newPage(): Promise<SscBrowserPage> {
        return page;
      },
      async close() {},
    };
  };
}

/** A BrowserFactory that always throws (simulates launch failure). */
function failingBrowserFactory(): BrowserFactory {
  return async (): Promise<SscBrowser> => {
    throw new Error("Network timeout");
  };
}

// ---------------------------------------------------------------------------
// Test data — rows as returned by page.evaluate in the real scraper.
// downloadId is set to an https:// URL so URL-absolute assertions pass.
// ---------------------------------------------------------------------------

const QUARTERLY_ROWS: RawSscRow[] = [
  {
    code: "VCB",
    exchange: "HOSE",
    title: "Báo cáo tài chính quý 1/2025 — VCB",
    company: "Ngân hàng TMCP Ngoại thương Việt Nam",
    description: "BCTC quý 1/2025",
    date: "15/04/2025",
    downloadId: "https://congbothongtin.ssc.gov.vn/bctc/vcb-q1-2025.pdf",
  },
  {
    code: "VCB",
    exchange: "HOSE",
    title: "Báo cáo tài chính quý 2/2025 — VCB",
    company: "Ngân hàng TMCP Ngoại thương Việt Nam",
    description: "BCTC quý 2/2025",
    date: "15/07/2025",
    downloadId: "https://congbothongtin.ssc.gov.vn/bctc/vcb-q2-2025.pdf",
  },
  {
    code: "VCB",
    exchange: "HOSE",
    title: "Báo cáo tài chính quý 3/2025 — VCB",
    company: "Ngân hàng TMCP Ngoại thương Việt Nam",
    description: "BCTC quý 3/2025",
    date: "14/10/2025",
    downloadId: "https://congbothongtin.ssc.gov.vn/bctc/vcb-q3-2025.pdf",
  },
];

const ANNUAL_ROWS: RawSscRow[] = [
  {
    code: "VCB",
    exchange: "HOSE",
    title: "Báo cáo tài chính năm 2024 — VCB (kiểm toán)",
    company: "Ngân hàng TMCP Ngoại thương Việt Nam",
    description: "BCTC năm 2024",
    date: "28/03/2025",
    downloadId: "https://congbothongtin.ssc.gov.vn/bctc/vcb-annual-2024.pdf",
  },
];

const MIXED_ROWS: RawSscRow[] = [...QUARTERLY_ROWS, ...ANNUAL_ROWS];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/**
 * Per-test timeout in ms.
 * listSscDocuments has ~5.8 s of hardcoded setTimeout delays (500 + 300 + 5000 ms)
 * for the ADF form interaction, even when a mock browser is used.
 */
const TEST_TIMEOUT = 15_000;

describe("Task 029 — SSC Portal Scraper", () => {
  // ── 1. Returns correct document list ──────────────────────────────────────
  it("returns correct documents from mock browser (quarterly)", async () => {
    const docs = await listSscDocuments(
      "VCB",
      "quarterly",
      2025,
      makeBrowserFactory(QUARTERLY_ROWS),
    );

    expect(docs).toBeArray();
    expect(docs.length).toBeGreaterThanOrEqual(1);
  }, TEST_TIMEOUT);

  // ── 2. Document shape ─────────────────────────────────────────────────────
  it("each document has title, url, publishedAt, and reportType fields", async () => {
    const docs = await listSscDocuments(
      "VCB",
      "quarterly",
      2025,
      makeBrowserFactory(QUARTERLY_ROWS),
    );

    expect(docs.length).toBeGreaterThan(0);
    const doc = docs[0] as SscDocument;
    expect(doc).toHaveProperty("title");
    expect(doc).toHaveProperty("url");
    expect(doc).toHaveProperty("publishedAt");
    expect(doc).toHaveProperty("reportType");
    expect(typeof doc.title).toBe("string");
    expect(typeof doc.url).toBe("string");
    expect(typeof doc.publishedAt).toBe("string");
    expect(typeof doc.reportType).toBe("string");
    expect(doc.title.length).toBeGreaterThan(0);
    expect(doc.url.length).toBeGreaterThan(0);
  }, TEST_TIMEOUT);

  // ── 3. URL is non-empty ───────────────────────────────────────────────────
  it("document URL is a non-empty string", async () => {
    const docs = await listSscDocuments(
      "VCB",
      "quarterly",
      2025,
      makeBrowserFactory(QUARTERLY_ROWS),
    );

    for (const doc of docs) {
      expect(doc.url.length).toBeGreaterThan(0);
    }
  }, TEST_TIMEOUT);

  // ── 4. Empty result when no rows match ────────────────────────────────────
  it("returns empty array when browser returns no rows for the stock code", async () => {
    // Rows belong to a different code — nothing matches "VCB"
    const otherRows: RawSscRow[] = QUARTERLY_ROWS.map((r) => ({
      ...r,
      code: "OTHER",
    }));
    const docs = await listSscDocuments(
      "VCB",
      "quarterly",
      2025,
      makeBrowserFactory(otherRows),
    );

    expect(docs).toBeArray();
    expect(docs.length).toBe(0);
  }, TEST_TIMEOUT);

  // ── 5. Browser launch error returns empty array (graceful degradation) ────
  it("returns empty array and does not throw on browser launch failure", async () => {
    const docs = await listSscDocuments(
      "VCB",
      "quarterly",
      2025,
      failingBrowserFactory(),
    );

    expect(docs).toBeArray();
    expect(docs.length).toBe(0);
  }, TEST_TIMEOUT);

  // ── 6. Filters by report type — quarterly keyword match ──────────────────
  it("filters rows that do not match the quarterly report type keyword", async () => {
    // Mixed rows: some quarterly, one annual
    const docs = await listSscDocuments(
      "VCB",
      "quarterly",
      2025,
      makeBrowserFactory(MIXED_ROWS),
    );

    // Every returned doc should match quarterly keywords (quý / Q[1-4])
    for (const doc of docs) {
      const titleLower = doc.title.toLowerCase();
      const isQuarterly =
        titleLower.includes("quý") ||
        /\bq[1-4]\b/i.test(doc.title);
      expect(isQuarterly).toBe(true);
    }

    // Annual doc must not appear
    const annualAppears = docs.some((d) => d.title.toLowerCase().includes("năm"));
    expect(annualAppears).toBe(false);
  }, TEST_TIMEOUT);

  // ── 7. Filters by report type — annual keyword match ─────────────────────
  it("filters rows that do not match the annual report type keyword", async () => {
    const docs = await listSscDocuments(
      "VCB",
      "annual",
      2025,
      makeBrowserFactory(MIXED_ROWS),
    );

    for (const doc of docs) {
      const titleLower = doc.title.toLowerCase();
      const isAnnual =
        titleLower.includes("năm") ||
        titleLower.includes("annual") ||
        titleLower.includes("niên độ");
      expect(isAnnual).toBe(true);
    }

    const quarterlyAppears = docs.some((d) =>
      d.title.toLowerCase().includes("quý"),
    );
    expect(quarterlyAppears).toBe(false);
  }, TEST_TIMEOUT);

  // ── 8. reportType field set correctly ────────────────────────────────────
  it("sets reportType to 'quarterly' on returned documents when requested", async () => {
    const docs = await listSscDocuments(
      "VCB",
      "quarterly",
      2025,
      makeBrowserFactory(QUARTERLY_ROWS),
    );

    for (const doc of docs) {
      expect(doc.reportType).toBe("quarterly");
    }
  }, TEST_TIMEOUT);

  // ── 9. reportType field set correctly for annual ──────────────────────────
  it("sets reportType to 'annual' on returned documents when requested", async () => {
    const docs = await listSscDocuments(
      "VCB",
      "annual",
      2025,
      makeBrowserFactory(ANNUAL_ROWS),
    );

    for (const doc of docs) {
      expect(doc.reportType).toBe("annual");
    }
  }, TEST_TIMEOUT);

  // ── 10. publishedAt is non-empty string ──────────────────────────────────
  it("parses publishedAt as a non-empty string from the date cell", async () => {
    const docs = await listSscDocuments(
      "VCB",
      "quarterly",
      2025,
      makeBrowserFactory(QUARTERLY_ROWS),
    );

    expect(docs.length).toBeGreaterThan(0);
    for (const doc of docs) {
      expect(doc.publishedAt.trim().length).toBeGreaterThan(0);
    }
  }, TEST_TIMEOUT);
});
