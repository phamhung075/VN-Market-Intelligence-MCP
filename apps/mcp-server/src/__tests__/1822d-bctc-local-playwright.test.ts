/**
 * Task 1822d-a — BCTC local Playwright smoke tests
 *
 * Verifies that:
 *   1. chromiumFetchPage is injectable: when a mock fetcher returns HTML, the
 *      parsing logic in discoverBctcPdfUrlBrowser extracts the correct PDF URL.
 *   2. When Playwright (chromiumFetchPage) throws, discoverBctcPdfUrlWithBrowser
 *      returns a graceful error result rather than crashing the caller.
 *
 * Real Playwright is never launched here — the browserFetcher parameter is
 * injected so tests remain fast and hermetic.
 */

import { describe, it, expect } from "bun:test";
import { discoverBctcPdfUrlWithBrowser } from "../application/usecases/discoverBctcPdfUrlBrowser.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds minimal HOSE-portal HTML containing a PDF link for the given year/quarter. */
function makeHoseHtml(pdfPath: string, quarter: string, year: number): string {
  return `
<html><body>
<div class="article-list">
  <div class="article-item">
    <p>Báo cáo tài chính ${quarter}/${year} BCTC</p>
    <a href="${pdfPath}">Tải xuống</a>
  </div>
</div>
</body></html>
`.trim();
}

// ---------------------------------------------------------------------------
// Test 1: injectable fetcher — parsing logic works end-to-end
// ---------------------------------------------------------------------------

describe("Task 1822d-a — BCTC local Playwright", () => {
  it("parses a PDF URL from injected HTML without launching a real browser", async () => {
    const expectedPdfUrl = "https://www.hsx.vn/Uploads/2025/bctc-Q1-2025-VNM.pdf";
    const mockHtml = makeHoseHtml(expectedPdfUrl, "Q1", 2025);

    /**
     * Injected fetcher: returns mock HTML for HOSE portal, empty string for
     * HNX/UPCOM portals (ensuring they don't accidentally match).
     */
    const mockFetcher = async (url: string): Promise<string> => {
      if (url.includes("hsx.vn")) return mockHtml;
      return "<html><body></body></html>";
    };

    const result = await discoverBctcPdfUrlWithBrowser("VNM", 2025, "Q1", mockFetcher);

    expect(result.url).toBe(expectedPdfUrl);
    expect(result.source).toBe("HOSE");
    expect(result.confidence).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // Test 2: graceful error when Playwright/fetcher throws
  // ---------------------------------------------------------------------------

  it("returns graceful error result when the browser fetcher throws", async () => {
    const throwingFetcher = async (_url: string): Promise<string> => {
      throw new Error("Playwright unavailable — Target closed");
    };

    // Must not throw — discoverBctcPdfUrlWithBrowser catches per-exchange errors
    const result = await discoverBctcPdfUrlWithBrowser("VCB", 2025, "Q4", throwingFetcher);

    // All three exchanges failed → url should be null, error message set
    expect(result.url).toBeNull();
    expect(result.source).toBeNull();
    expect(result.confidence).toBe(0);
    // At least one exchange reported the error
    expect(result.error).toBeDefined();
    expect(typeof result.error).toBe("string");
  });
});
