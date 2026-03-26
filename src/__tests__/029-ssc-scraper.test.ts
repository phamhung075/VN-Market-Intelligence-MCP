/**
 * Task 029 — SSC Portal Scraper
 *
 * Tests for listSscDocuments() in src/infrastructure/fetchers/ssc.ts
 * All HTTP calls are mocked — no real network traffic.
 */

import { describe, it, expect } from "bun:test";
import {
  listSscDocuments,
  type SscDocument,
  type HttpClient,
} from "../infrastructure/fetchers/ssc.js";

// ---------------------------------------------------------------------------
// Mock HTML helpers
// ---------------------------------------------------------------------------

/**
 * Builds a minimal HTML page that mimics the SSC disclosure portal
 * document-list table format.
 */
function buildMockHtml(rows: Array<{ title: string; href: string; date: string }>): string {
  const rowHtml = rows
    .map(
      (r) => `
      <tr>
        <td><a href="${r.href}">${r.title}</a></td>
        <td>${r.date}</td>
      </tr>`,
    )
    .join("\n");

  return `
<!DOCTYPE html>
<html>
<head><title>SSC — Công bố thông tin</title></head>
<body>
  <table class="tbl-data">
    <thead>
      <tr><th>Tên tài liệu</th><th>Ngày đăng</th></tr>
    </thead>
    <tbody>
      ${rowHtml}
    </tbody>
  </table>
</body>
</html>`;
}

/** A mock HttpClient that always returns the provided HTML body. */
function mockClient(html: string): HttpClient {
  return {
    async get(_url: string): Promise<string> {
      return html;
    },
  };
}

/** A mock HttpClient that always throws a network error. */
function failingClient(): HttpClient {
  return {
    async get(_url: string): Promise<string> {
      throw new Error("Network timeout");
    },
  };
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const QUARTERLY_ROWS = [
  {
    title: "Báo cáo tài chính quý 1/2025 — VCB",
    href: "/bctc/vcb-q1-2025.pdf",
    date: "15/04/2025",
  },
  {
    title: "Báo cáo tài chính quý 2/2025 — VCB",
    href: "/bctc/vcb-q2-2025.pdf",
    date: "15/07/2025",
  },
  {
    title: "Báo cáo tài chính quý 3/2025 — VCB",
    href: "/bctc/vcb-q3-2025.pdf",
    date: "14/10/2025",
  },
];

const ANNUAL_ROWS = [
  {
    title: "Báo cáo tài chính năm 2024 — VCB (kiểm toán)",
    href: "/bctc/vcb-annual-2024.pdf",
    date: "28/03/2025",
  },
];

const MIXED_ROWS = [...QUARTERLY_ROWS, ...ANNUAL_ROWS];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Task 029 — SSC Portal Scraper", () => {
  // ── 1. Returns correct document list ──────────────────────────────────────
  it("returns correct documents from mock HTML (quarterly)", async () => {
    const html = buildMockHtml(QUARTERLY_ROWS);
    const docs = await listSscDocuments("VCB", "quarterly", 2025, mockClient(html));

    expect(docs).toBeArray();
    expect(docs.length).toBeGreaterThanOrEqual(1);
  });

  // ── 2. Document shape ─────────────────────────────────────────────────────
  it("each document has title, url, publishedAt, and reportType fields", async () => {
    const html = buildMockHtml(QUARTERLY_ROWS);
    const docs = await listSscDocuments("VCB", "quarterly", 2025, mockClient(html));

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
  });

  // ── 3. URL is absolute ────────────────────────────────────────────────────
  it("resolves relative hrefs to absolute URLs", async () => {
    const html = buildMockHtml(QUARTERLY_ROWS);
    const docs = await listSscDocuments("VCB", "quarterly", 2025, mockClient(html));

    for (const doc of docs) {
      expect(doc.url).toMatch(/^https?:\/\//);
    }
  });

  // ── 4. Empty result on empty HTML ─────────────────────────────────────────
  it("returns empty array when page has no document rows", async () => {
    const emptyHtml = `
<!DOCTYPE html>
<html><body>
  <table class="tbl-data">
    <thead><tr><th>Tên tài liệu</th><th>Ngày đăng</th></tr></thead>
    <tbody></tbody>
  </table>
</body></html>`;
    const docs = await listSscDocuments("VCB", "quarterly", 2025, mockClient(emptyHtml));

    expect(docs).toBeArray();
    expect(docs.length).toBe(0);
  });

  // ── 5. Network error returns empty array (graceful degradation) ───────────
  it("returns empty array and does not throw on network error", async () => {
    const docs = await listSscDocuments("VCB", "quarterly", 2025, failingClient());

    expect(docs).toBeArray();
    expect(docs.length).toBe(0);
  });

  // ── 6. Filters by report type — quarterly keyword match ──────────────────
  it("filters rows that do not match the quarterly report type keyword", async () => {
    // Mixed rows: some quarterly, one annual
    const html = buildMockHtml(MIXED_ROWS);
    const docs = await listSscDocuments("VCB", "quarterly", 2025, mockClient(html));

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
  });

  // ── 7. Filters by report type — annual keyword match ─────────────────────
  it("filters rows that do not match the annual report type keyword", async () => {
    const html = buildMockHtml(MIXED_ROWS);
    const docs = await listSscDocuments("VCB", "annual", 2025, mockClient(html));

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
  });

  // ── 8. reportType field set correctly ────────────────────────────────────
  it("sets reportType to 'quarterly' on returned documents when requested", async () => {
    const html = buildMockHtml(QUARTERLY_ROWS);
    const docs = await listSscDocuments("VCB", "quarterly", 2025, mockClient(html));

    for (const doc of docs) {
      expect(doc.reportType).toBe("quarterly");
    }
  });

  // ── 9. reportType field set correctly for annual ──────────────────────────
  it("sets reportType to 'annual' on returned documents when requested", async () => {
    const html = buildMockHtml(ANNUAL_ROWS);
    const docs = await listSscDocuments("VCB", "annual", 2025, mockClient(html));

    for (const doc of docs) {
      expect(doc.reportType).toBe("annual");
    }
  });

  // ── 10. publishedAt is non-empty string ──────────────────────────────────
  it("parses publishedAt as a non-empty string from the date cell", async () => {
    const html = buildMockHtml(QUARTERLY_ROWS);
    const docs = await listSscDocuments("VCB", "quarterly", 2025, mockClient(html));

    expect(docs.length).toBeGreaterThan(0);
    for (const doc of docs) {
      expect(doc.publishedAt.trim().length).toBeGreaterThan(0);
    }
  });
});
