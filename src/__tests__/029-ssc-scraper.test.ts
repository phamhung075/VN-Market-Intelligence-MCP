/**
 * Task 029 / 303 — SSC Portal Scraper (axios+cheerio rewrite)
 *
 * Tests listSscDocuments() in src/infrastructure/fetchers/ssc.ts. The fetcher
 * uses an injectable HttpClient returning raw HTML — tests mock that client
 * and verify parseSscHtml-backed extraction + report-type filtering.
 *
 * This file replaces the Puppeteer-era BrowserFactory mock harness used by
 * the original task 029 test.
 */

import { describe, it, expect } from "bun:test";
import {
  listSscDocuments,
  type HttpClient,
  type SscDocument,
} from "../infrastructure/fetchers/ssc.js";

// ---------------------------------------------------------------------------
// HTML helpers — build the minimal .tbl-data markup parseSscHtml expects.
// ---------------------------------------------------------------------------

interface SscRow {
  title: string;
  href: string;
  date: string; // DD/MM/YYYY as shown on the portal
}

function buildHtml(rows: SscRow[]): string {
  const trs = rows
    .map(
      (r) => `
        <tr>
          <td><a href="${r.href}">${r.title}</a></td>
          <td>${r.date}</td>
        </tr>`,
    )
    .join("");
  return `
    <html><body>
      <table class="tbl-data">
        <tbody>${trs}</tbody>
      </table>
    </body></html>`;
}

function mockClient(html: string): HttpClient {
  return {
    async get(_url: string): Promise<string> {
      return html;
    },
  };
}

function failingClient(): HttpClient {
  return {
    async get(): Promise<string> {
      throw new Error("Network timeout");
    },
  };
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const QUARTERLY_ROWS: SscRow[] = [
  {
    title: "Báo cáo tài chính quý 1/2025 — VCB",
    href: "https://congbothongtin.ssc.gov.vn/bctc/vcb-q1-2025.pdf",
    date: "15/04/2025",
  },
  {
    title: "Báo cáo tài chính quý 2/2025 — VCB",
    href: "https://congbothongtin.ssc.gov.vn/bctc/vcb-q2-2025.pdf",
    date: "15/07/2025",
  },
  {
    title: "Báo cáo tài chính quý 3/2025 — VCB",
    href: "https://congbothongtin.ssc.gov.vn/bctc/vcb-q3-2025.pdf",
    date: "14/10/2025",
  },
];

const ANNUAL_ROWS: SscRow[] = [
  {
    title: "Báo cáo tài chính năm 2024 — VCB (kiểm toán)",
    href: "https://congbothongtin.ssc.gov.vn/bctc/vcb-annual-2024.pdf",
    date: "28/03/2025",
  },
];

const MIXED_ROWS: SscRow[] = [...QUARTERLY_ROWS, ...ANNUAL_ROWS];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Task 029 / 303 — SSC Portal Scraper (HttpClient rewrite)", () => {
  it("returns documents parsed from mocked HTML (quarterly)", async () => {
    const docs = await listSscDocuments(
      "VCB",
      "quarterly",
      2025,
      mockClient(buildHtml(QUARTERLY_ROWS)),
    );
    expect(docs).toBeArray();
    expect(docs.length).toBe(3);
  });

  it("each document has title, url, publishedAt, and reportType fields", async () => {
    const docs = await listSscDocuments(
      "VCB",
      "quarterly",
      2025,
      mockClient(buildHtml(QUARTERLY_ROWS)),
    );
    const doc = docs[0] as SscDocument;
    expect(doc).toHaveProperty("title");
    expect(doc).toHaveProperty("url");
    expect(doc).toHaveProperty("publishedAt");
    expect(doc).toHaveProperty("reportType");
    expect(typeof doc.title).toBe("string");
    expect(typeof doc.url).toBe("string");
    expect(typeof doc.publishedAt).toBe("string");
    expect(doc.title.length).toBeGreaterThan(0);
    expect(doc.url.length).toBeGreaterThan(0);
  });

  it("preserves the absolute href from the anchor tag", async () => {
    const docs = await listSscDocuments(
      "VCB",
      "quarterly",
      2025,
      mockClient(buildHtml(QUARTERLY_ROWS)),
    );
    for (const doc of docs) {
      expect(doc.url.startsWith("https://")).toBe(true);
    }
  });

  it("returns empty array when no rows match the report type", async () => {
    // Feed only annual rows but request quarterly — expect zero matches.
    const docs = await listSscDocuments(
      "VCB",
      "quarterly",
      2025,
      mockClient(buildHtml(ANNUAL_ROWS)),
    );
    expect(docs).toBeArray();
    expect(docs.length).toBe(0);
  });

  it("returns empty array and does not throw on HTTP failure", async () => {
    const docs = await listSscDocuments(
      "VCB",
      "quarterly",
      2025,
      failingClient(),
    );
    expect(docs).toBeArray();
    expect(docs.length).toBe(0);
  });

  it("filters by quarterly keyword — drops annual rows in mixed set", async () => {
    const docs = await listSscDocuments(
      "VCB",
      "quarterly",
      2025,
      mockClient(buildHtml(MIXED_ROWS)),
    );
    // All three quarterly rows present, annual dropped.
    expect(docs.length).toBe(3);
    for (const doc of docs) {
      const titleLower = doc.title.toLowerCase();
      const isQuarterly =
        titleLower.includes("quý") || /\bq[1-4]\b/i.test(doc.title);
      expect(isQuarterly).toBe(true);
    }
    const annualAppears = docs.some((d) =>
      d.title.toLowerCase().includes("năm"),
    );
    expect(annualAppears).toBe(false);
  });

  it("filters by annual keyword — drops quarterly rows in mixed set", async () => {
    const docs = await listSscDocuments(
      "VCB",
      "annual",
      2025,
      mockClient(buildHtml(MIXED_ROWS)),
    );
    expect(docs.length).toBe(1);
    for (const doc of docs) {
      const titleLower = doc.title.toLowerCase();
      const isAnnual =
        titleLower.includes("năm") || titleLower.includes("niên độ");
      expect(isAnnual).toBe(true);
    }
    const quarterlyAppears = docs.some((d) =>
      d.title.toLowerCase().includes("quý"),
    );
    expect(quarterlyAppears).toBe(false);
  });

  it("tags quarterly documents with reportType='quarterly'", async () => {
    const docs = await listSscDocuments(
      "VCB",
      "quarterly",
      2025,
      mockClient(buildHtml(QUARTERLY_ROWS)),
    );
    for (const doc of docs) {
      expect(doc.reportType).toBe("quarterly");
    }
  });

  it("tags annual documents with reportType='annual'", async () => {
    const docs = await listSscDocuments(
      "VCB",
      "annual",
      2025,
      mockClient(buildHtml(ANNUAL_ROWS)),
    );
    for (const doc of docs) {
      expect(doc.reportType).toBe("annual");
    }
  });

  it("parses publishedAt as a non-empty string from the date cell", async () => {
    const docs = await listSscDocuments(
      "VCB",
      "quarterly",
      2025,
      mockClient(buildHtml(QUARTERLY_ROWS)),
    );
    expect(docs.length).toBeGreaterThan(0);
    for (const doc of docs) {
      expect(doc.publishedAt.trim().length).toBeGreaterThan(0);
    }
    // First row date should round-trip through the parser unchanged.
    expect(docs[0]!.publishedAt).toBe("15/04/2025");
  });
});
