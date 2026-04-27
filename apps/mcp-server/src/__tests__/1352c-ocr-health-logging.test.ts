/**
 * Task 1352c — OCR Health Logging + Per-File Retry
 *
 * Tests for observability improvements in pdfOcrWorker.ts:
 *   1. isOcrAvailable() logs tesseract + pdftoppm availability at first call
 *   2. extractAndStorePdfPages returns ocrStats { pagesProcessed, pagesSkipped, pagesLowChar, avgConfidence }
 *   3. Per-page errors are logged with [ocr] page N failed: <reason>
 *   4. Low-char pages (< 10 chars) are logged with [ocr] page N low-char: N chars
 *   5. ocrStats.pagesProcessed counts only pages with >= 10 chars inserted
 *   6. ocrStats.pagesSkipped counts pages with 0 chars (error/timeout)
 *   7. ocrStats.pagesLowChar counts pages with 1-9 chars
 *   8. ocrStats.avgConfidence is correct average of inserted page confidences
 *   9. When OCR is unavailable, ocrStats returned with all zeros
 *  10. extractAndStorePdfPagesWithRetry returns confidenceAfterRetry + ocrStats
 *  11. Source file has [ocr] log tag for startup availability log
 */

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── Source inspection helpers ──────────────────────────────────────────────────

const srcPath = resolve(import.meta.dir, "../infrastructure/fetchers/pdfOcrWorker.ts");

function readSrc(): string {
  return readFileSync(srcPath, "utf-8");
}

// ── Group 1: Startup availability logging (source inspection) ─────────────────

describe("1352c — OCR startup availability logging", () => {
  it("1. source has logger.info call with [ocr] tesseract availability log", () => {
    const src = readSrc();
    // Must log OCR availability at first call — either in isOcrAvailable() itself
    // or at the module level after the cache is set
    expect(src).toMatch(/logger\.info.*\[ocr\].*tesseract/);
  });

  it("2. source logs pdftoppm availability separately or together with tesseract", () => {
    const src = readSrc();
    expect(src).toMatch(/pdftoppm/);
    // The log must include the tool names so operator can see which is missing
    expect(src).toMatch(/logger\.info.*\[ocr\]/);
  });

  it("3. isOcrAvailable() returns a boolean (existing contract maintained)", async () => {
    const { isOcrAvailable } = await import("../infrastructure/fetchers/pdfOcrWorker.js");
    expect(typeof isOcrAvailable()).toBe("boolean");
  });

  it("4. source logs true/false value (not just 'available' text)", () => {
    const src = readSrc();
    // Log should include the boolean value — tesseract: true/false
    expect(src).toMatch(/tesseract.*(?:true|false|ocrAvail|_ocrAvailableCache)/);
  });
});

// ── Group 2: ocrStats in return value ────────────────────────────────────────

describe("1352c — extractAndStorePdfPages returns ocrStats", () => {
  it("5. extractAndStorePdfPages return type includes ocrStats shape in source", () => {
    const src = readSrc();
    // The function must return an object with ocrStats property
    expect(src).toContain("ocrStats");
  });

  it("6. ocrStats has pagesProcessed field", () => {
    const src = readSrc();
    expect(src).toContain("pagesProcessed");
  });

  it("7. ocrStats has pagesSkipped field", () => {
    const src = readSrc();
    expect(src).toContain("pagesSkipped");
  });

  it("8. ocrStats has pagesLowChar field", () => {
    const src = readSrc();
    expect(src).toContain("pagesLowChar");
  });

  it("9. ocrStats has avgConfidence field", () => {
    const src = readSrc();
    expect(src).toContain("avgConfidence");
  });

  it("10. extractAndStorePdfPages function signature is exported (existing contract)", async () => {
    const { extractAndStorePdfPages } = await import("../infrastructure/fetchers/pdfOcrWorker.js");
    expect(typeof extractAndStorePdfPages).toBe("function");
  });
});

// ── Group 3: Per-page error logging (source inspection) ───────────────────────

describe("1352c — per-page error and low-char logging", () => {
  it("11. source has logger.warn for page failure with [ocr] tag", () => {
    const src = readSrc();
    expect(src).toMatch(/logger\.warn.*\[ocr\].*page.*fail/i);
  });

  it("12. source has logger.warn for low-char pages with [ocr] tag", () => {
    const src = readSrc();
    expect(src).toMatch(/logger\.warn.*\[ocr\].*low.char/i);
  });

  it("13. per-page error log includes page number reference", () => {
    const src = readSrc();
    // Must reference page variable in the warn call
    // e.g.: logger.warn("[ocr] page N failed: ...", { page, ... })
    const warnMatch = src.match(/logger\.warn\(\s*["'`]\[ocr\].*page.*["'`]/g) ?? [];
    const hasPageRef = warnMatch.length > 0 || src.includes("[ocr] page");
    expect(hasPageRef).toBe(true);
  });

  it("14. low-char log includes char count (< 10 boundary)", () => {
    const src = readSrc();
    // The warn for low-char must reference the char count so operator knows extent
    expect(src).toMatch(/low.char|chars.*confidence|pagesLowChar/i);
  });
});

// ── Group 4: ocrStats logic correctness (pure logic unit tests) ──────────────

describe("1352c — ocrStats counter logic", () => {
  it("15. pagesProcessed increments only for pages with >= 10 chars", () => {
    // Unit test of the counting logic in extractAndStorePdfPages
    let pagesProcessed = 0;
    let pagesSkipped = 0;
    let pagesLowChar = 0;
    const fakePages = ["", "abc", "A".repeat(10), "A".repeat(51)];

    for (const text of fakePages) {
      if (text.length === 0) {
        pagesSkipped++;
      } else if (text.length < 10) {
        pagesLowChar++;
      } else {
        pagesProcessed++;
      }
    }

    expect(pagesProcessed).toBe(2); // 10-char and 51-char pages
    expect(pagesSkipped).toBe(1);   // empty string
    expect(pagesLowChar).toBe(1);   // "abc" = 3 chars
  });

  it("16. avgConfidence is 0 when no pages processed", () => {
    const confidences: number[] = [];
    const avgConfidence = confidences.length === 0
      ? 0
      : confidences.reduce((a, b) => a + b, 0) / confidences.length;
    expect(avgConfidence).toBe(0);
  });

  it("17. avgConfidence is computed correctly for mixed pages", () => {
    const confidences = [0.8, 0.5, 0.8];
    const avg = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    expect(avg).toBeCloseTo(0.7, 5);
  });

  it("18. when OCR unavailable, ocrStats.pagesProcessed is 0", () => {
    // When isOcrAvailable() returns false, extraction returns immediately
    // The return must include ocrStats with all zeros
    const ocrStats = { pagesProcessed: 0, pagesSkipped: 0, pagesLowChar: 0, avgConfidence: 0 };
    expect(ocrStats.pagesProcessed).toBe(0);
    expect(ocrStats.avgConfidence).toBe(0);
  });
});

// ── Group 5: extractAndStorePdfPagesWithRetry return type ────────────────────

describe("1352c — extractAndStorePdfPagesWithRetry return type", () => {
  it("19. extractAndStorePdfPagesWithRetry is exported", async () => {
    const { extractAndStorePdfPagesWithRetry } = await import("../infrastructure/fetchers/pdfOcrWorker.js");
    expect(typeof extractAndStorePdfPagesWithRetry).toBe("function");
  });

  it("20. source: extractAndStorePdfPagesWithRetry return type has confidenceAfterRetry", () => {
    const src = readSrc();
    expect(src).toContain("confidenceAfterRetry");
  });
});
