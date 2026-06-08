/**
 * Task 1218 — BCTC VPS queue: populate source_hints with actual PDF URLs
 *
 * When building the BCTC fetch queue for the VPS proxy, the queue items
 * should include the actual PDF URL discovered via listSscDocuments in
 * source_hints so the VPS can fetch directly without re-discovery.
 *
 * TDD: Tests written first (RED), then implementation.
 */

Bun.env["DB_PATH"] = ":memory:";
import { describe, it, expect } from "bun:test";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
import {
  enrichQueueWithPdfUrls,
  buildQueueSourceHints,
  type BctcQueueItem,
  type SscDocumentLookup,
} from "../application/usecases/bctcQueueEnricher.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_ITEM: BctcQueueItem = {
  action_code: "VCB",
  period_year: 2025,
  period_quarter: "Q1",
  source_url: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Task 1218 — BCTC queue PDF URL enrichment", () => {
  // ── enrichQueueWithPdfUrls ────────────────────────────────────────────────

  it("sets source_url from listDocs when a PDF URL is found", async () => {
    const listDocs: SscDocumentLookup = async (code, _quarter, _year) => {
      if (code === "VCB") return [{ url: "https://ssc.gov.vn/vcb-q1-2025.pdf" }];
      return [];
    };

    const items = [{ ...BASE_ITEM }];
    const enriched = await enrichQueueWithPdfUrls(items, listDocs);

    expect(enriched[0]!.source_url).toBe("https://ssc.gov.vn/vcb-q1-2025.pdf");
  });

  it("leaves source_url null when listDocs returns empty array", async () => {
    const listDocs: SscDocumentLookup = async () => [];

    const items = [{ ...BASE_ITEM }];
    const enriched = await enrichQueueWithPdfUrls(items, listDocs);

    expect(enriched[0]!.source_url).toBeNull();
  });

  it("uses already-stored source_url without calling listDocs again", async () => {
    let callCount = 0;
    const listDocs: SscDocumentLookup = async () => {
      callCount++;
      return [{ url: "https://ssc.gov.vn/vcb-new.pdf" }];
    };

    const items = [{ ...BASE_ITEM, source_url: "https://ssc.gov.vn/vcb-existing.pdf" }];
    const enriched = await enrichQueueWithPdfUrls(items, listDocs);

    // Should not call listDocs for items that already have source_url
    expect(callCount).toBe(0);
    expect(enriched[0]!.source_url).toBe("https://ssc.gov.vn/vcb-existing.pdf");
  });

  it("handles multiple items — enriches each independently", async () => {
    const listDocs: SscDocumentLookup = async (code) => {
      if (code === "VCB") return [{ url: "https://ssc.gov.vn/vcb.pdf" }];
      if (code === "FPT") return [{ url: "https://ssc.gov.vn/fpt.pdf" }];
      return [];
    };

    const items = [
      { action_code: "VCB", period_year: 2025, period_quarter: "Q1", source_url: null },
      { action_code: "FPT", period_year: 2025, period_quarter: "Q1", source_url: null },
      { action_code: "HPG", period_year: 2025, period_quarter: "Q1", source_url: null },
    ];

    const enriched = await enrichQueueWithPdfUrls(items, listDocs);

    expect(enriched[0]!.source_url).toBe("https://ssc.gov.vn/vcb.pdf");
    expect(enriched[1]!.source_url).toBe("https://ssc.gov.vn/fpt.pdf");
    expect(enriched[2]!.source_url).toBeNull(); // HPG had no docs
  });

  it("does not throw when listDocs throws — leaves source_url null", async () => {
    const listDocs: SscDocumentLookup = async () => {
      throw new Error("SSC portal unavailable");
    };

    const items = [{ ...BASE_ITEM }];
    const enriched = await enrichQueueWithPdfUrls(items, listDocs);

    expect(enriched[0]!.source_url).toBeNull();
  });

  it("uses the first document URL when listDocs returns multiple", async () => {
    const listDocs: SscDocumentLookup = async () => [
      { url: "https://ssc.gov.vn/first.pdf" },
      { url: "https://ssc.gov.vn/second.pdf" },
    ];

    const items = [{ ...BASE_ITEM }];
    const enriched = await enrichQueueWithPdfUrls(items, listDocs);

    expect(enriched[0]!.source_url).toBe("https://ssc.gov.vn/first.pdf");
  });

  // ── buildQueueSourceHints ────────────────────────────────────────────────

  it("includes pdfUrl as first hint when source_url is set", () => {
    const item: BctcQueueItem = { ...BASE_ITEM, source_url: "https://ssc.gov.vn/vcb.pdf" };
    const hints = buildQueueSourceHints(item);

    expect(hints[0]).toBe("https://ssc.gov.vn/vcb.pdf");
  });

  it("does not include null pdfUrl in hints", () => {
    const item: BctcQueueItem = { ...BASE_ITEM, source_url: null };
    const hints = buildQueueSourceHints(item);

    // Should still have fallback hints
    expect(hints.length).toBeGreaterThan(0);
    // No null values in hints
    expect(hints.every((h) => typeof h === "string" && h.length > 0)).toBe(true);
  });

  it("includes fallback portal URLs after pdfUrl", () => {
    const item: BctcQueueItem = { ...BASE_ITEM, source_url: "https://ssc.gov.vn/vcb.pdf" };
    const hints = buildQueueSourceHints(item);

    // Should have pdfUrl + at least one fallback
    expect(hints.length).toBeGreaterThan(1);
    // First is pdfUrl
    expect(hints[0]).toBe("https://ssc.gov.vn/vcb.pdf");
    // Rest are fallback URLs
    expect(hints.slice(1).some((h) => h.includes("congbothongtin") || h.includes("hsx.vn") || h.includes("hnx.vn"))).toBe(true);
  });

  it("returns only fallback hints when source_url is null", () => {
    const item: BctcQueueItem = { ...BASE_ITEM, source_url: null };
    const hints = buildQueueSourceHints(item);

    // All hints should be fallback portal URLs
    expect(hints.every((h) => h.includes("congbothongtin") || h.includes("hsx.vn") || h.includes("hnx.vn") || h.includes("upcom"))).toBe(true);
  });

  it("buildQueueSourceHints uses action_code in fallback URLs", () => {
    const item: BctcQueueItem = { action_code: "HPG", period_year: 2025, period_quarter: "Q2", source_url: null };
    const hints = buildQueueSourceHints(item);

    expect(hints.some((h) => h.includes("HPG"))).toBe(true);
  });
});
