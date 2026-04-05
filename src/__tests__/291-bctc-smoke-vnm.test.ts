/**
 * Task 291 — Integration smoke test: VNM real PDF extraction
 *
 * Validates that Tasks 287 (balance sheet unit detection + row-code guard)
 * and 288 (income statement NFC + ASCII fallback) correctly parse the actual
 * VNM consolidated annual report PDF (BCTC 31.12.2025).
 *
 * Skip conditions (not failure):
 * 1. PDF file does not exist at the expected path.
 * 2. PDF is image-based (scanned) — pdf-parse returns only whitespace.
 *    Scanned PDFs require OCR; this test covers only text-layer PDFs.
 */

import { describe, it, expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import pdfParse from "pdf-parse";
import { extractBalanceSheet } from "../domain/services/balanceSheetExtractor.js";
import { extractIncomeStatement } from "../domain/services/incomeStatementExtractor.js";

// ---------------------------------------------------------------------------
// PDF path — resolved to absolute for portability
// ---------------------------------------------------------------------------
const PDF_PATH = resolve(
  "/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP",
  "data/pdfs/BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf",
);
const PDF_EXISTS = existsSync(PDF_PATH);

// ---------------------------------------------------------------------------
// Shared extracted text — parsed once, reused across all test cases.
// PDF_HAS_TEXT is set to false when the PDF is scanned (image-only).
// ---------------------------------------------------------------------------
let pdfText = "";
let PDF_HAS_TEXT = false;

async function loadPdfText(): Promise<string> {
  if (pdfText !== "" || !PDF_EXISTS) return pdfText;
  const buffer = readFileSync(PDF_PATH);
  const data = await pdfParse(buffer);
  pdfText = data.text;
  // A scanned PDF produces only whitespace — no usable text layer.
  PDF_HAS_TEXT = pdfText.replace(/\s/g, "").length > 100;
  if (!PDF_HAS_TEXT) {
    console.warn(
      "[291-smoke] PDF appears to be image-based (scanned). " +
        "Non-whitespace chars: " +
        pdfText.replace(/\s/g, "").length +
        ". Smoke test assertions will be skipped.",
    );
  }
  return pdfText;
}

// Eagerly load so PDF_HAS_TEXT is populated before skipIf evaluates.
// In Bun test, top-level await works in ESM.
if (PDF_EXISTS) {
  await loadPdfText();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// shouldRun is true only when the PDF exists AND has a text layer.
// Evaluated after the top-level await above so PDF_HAS_TEXT is accurate.
const shouldRun = PDF_EXISTS && PDF_HAS_TEXT;

describe("Task 291 — VNM consolidated PDF smoke test", () => {
  it.skipIf(!shouldRun)(
    "balance sheet: totalAssets in valid range (50M–70M triệu đồng)",
    async () => {
      const text = await loadPdfText();
      const bs = extractBalanceSheet(text);

      console.log("[smoke] totalAssets =", bs.totalAssets);
      console.log("[smoke] totalLiabilitiesAndEquity =", bs.totalLiabilitiesAndEquity);
      console.log("[smoke] equity.total =", bs.equity.total);
      console.log("[smoke] totalLiabilities =", bs.totalLiabilities);

      // FR-6 assertion 1: totalAssets must be in the VNM plausible range
      // ~50,000 – 70,000 tỷ → 50,000,000 – 70,000,000 triệu đồng
      expect(bs.totalAssets).toBeGreaterThanOrEqual(50_000_000);
      expect(bs.totalAssets).toBeLessThanOrEqual(70_000_000);

      // FR-6 assertion 2: balance equation — totalLiabilitiesAndEquity ≈ totalAssets
      // Accept within 1% tolerance (rounding/pagination differences)
      if (bs.totalLiabilitiesAndEquity > 0) {
        const deviation =
          Math.abs(bs.totalLiabilitiesAndEquity - bs.totalAssets) / bs.totalAssets;
        expect(deviation).toBeLessThan(0.01);
      }
    },
  );

  it.skipIf(!shouldRun)(
    "income statement: netRevenue, grossProfit, netProfit all > 0",
    async () => {
      const text = await loadPdfText();
      const is = extractIncomeStatement(text);

      console.log("[smoke] netRevenue =", is.netRevenue);
      console.log("[smoke] grossProfit =", is.grossProfit);
      console.log("[smoke] netProfit =", is.netProfit);
      console.log("[smoke] eps =", is.eps);

      // FR-6 assertion 3: core income fields must be non-zero
      // (all zeros would indicate the diacritics / pattern-matching bug)
      expect(is.netRevenue).toBeGreaterThan(0);
      expect(is.grossProfit).toBeGreaterThan(0);
      expect(is.netProfit).toBeGreaterThan(0);
    },
  );

  it.skipIf(!shouldRun)(
    "balance sheet: no magnitude bug — totalAssets not in billions/trillions",
    async () => {
      const text = await loadPdfText();
      const bs = extractBalanceSheet(text);

      // Magnitude bug: if unit detection fails and multiplier=1000 is applied
      // when it should be 1, totalAssets would be ~60,000,000,000 (60 trillion).
      // This assertion catches that regression.
      expect(bs.totalAssets).toBeLessThan(1_000_000_000); // < 1 quadrillion triệu
    },
  );

  it("PDF file accessibility check (always runs)", () => {
    // This test always runs and documents the PDF state for CI diagnostics.
    if (!PDF_EXISTS) {
      console.log("[291-smoke] PDF absent — extraction tests skipped. Path:", PDF_PATH);
    } else if (!PDF_HAS_TEXT) {
      console.log(
        "[291-smoke] PDF is image-based (scanned, no text layer) — " +
          "extraction tests skipped. Replace with a text-layer PDF to enable smoke tests.",
      );
    } else {
      console.log("[291-smoke] PDF has text layer — extraction tests ran.");
    }
    // Always passes — just a diagnostic.
    expect(true).toBe(true);
  });
});
