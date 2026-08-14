/**
 * FIX-BCTC-REPARSE-PERIOD-KEY-SYSTEMATICALLY-STALE-100PCT-QUARANTINE
 *
 * bctcReparseJob fired after a 40h gap and quarantined 19/19 attempts on
 * period-mismatch — in every case the supplied period was EARLIER than the
 * document content's own period (e.g. FRT 2024-Q1 supplied vs 2024-Q4 content;
 * DIG 2025-Q1 supplied vs 2026-Q1 content). Root cause (po/triage, row status_note):
 * `reparseSingleWithOcrFallback` derives its "supplied" period ENTIRELY from
 * `parseYearQuarterFromFilename(payload.filename)` — the stale queue row's own
 * filename, established whenever the PDF was first flagged stranded — and never
 * re-derives it from the actual extracted document text at reparse time. By the
 * time the job (finally) fires, the on-disk file/tiered fetch can resolve to a
 * LATER filing than what the stale filename encodes, so `parseBctcReport`'s
 * (correct, must-not-weaken) `checkPeriodContentConsistency` guard refuses to
 * store under either key — 0% completion rate, backlog never drains.
 *
 * Fix: after text extraction, call the existing pure domain function
 * `extractPeriodFromContent(rawText)` (already used by the write-time guard
 * itself, periodContentExtractor.ts) and prefer its (year, quarter) signal over
 * the filename-derived one when confident. Falls back to the filename-derived
 * period when content is inconclusive (poor OCR / no boundary dates) — same
 * "cannot determine" negative control the write-time guard already applies, so
 * a poor-OCR filing is not newly blocked by this change.
 *
 * Acceptance:
 *   AC-1 (RED before fix): pipeline is called with the STALE filename-derived
 *     period even though the extracted text confidently indicates a later one.
 *   AC-2 (GREEN after fix): pipeline is called with the CONTENT-derived period
 *     when extractPeriodFromContent finds a confident signal.
 *   AC-3: when content is inconclusive, pipeline still receives the
 *     filename-derived period (unchanged fallback behaviour, no regression).
 *   AC-4: verification gate — a bctcReparseJob run stores >0 rows and reports
 *     zero pipeline failures when every stranded row's real content period is
 *     resolvable (mirrors reparse_run_stores_at_least_one_row_no_period_mismatch).
 */

import { describe, it, expect } from "bun:test";
import { reparseSingleWithOcrFallback, type ReparseDeps } from "../scheduler/financial-reports/bctcReparseJob.js";
import type { PdfExtractorResult } from "../infrastructure/fetchers/pdfExtractorClient.js";

interface CapturedPeriod {
  year: number | null;
  quarter: string | null;
}

// Real BCTC PDFs repeat "Tại ngày DD/MM/YYYY" (balance sheet as-of date) and
// "Từ ngày DD/MM/YYYY đến ngày DD/MM/YYYY" (income/cash-flow period range)
// multiple times. extractPeriodFromContent() (periodContentExtractor.ts)
// requires >= 3 occurrences of the SAME (year, quarter) boundary pair with a
// clear plurality. 31/12/2024 = day 31, month 12 -> Q4 boundary.
const Q4_2024_CONTENT_TEXT =
  "BAO CAO TAI CHINH HOP NHAT\n" +
  "Tại ngày 31/12/2024\n" +
  "Từ ngày 01/10/2024 đến ngày 31/12/2024\n" +
  "Bảng cân đối kế toán tại ngày 31/12/2024\n" +
  "Tổng tài sản: 1,000,000,000\n";

function makeDeps(overrides: Partial<ReparseDeps>): ReparseDeps {
  return {
    extractViaService: async () => null,
    extractText: async () => ({ text: "", confidence: 0 }),
    getOcrCache: () => null,
    pipeline: async () => ({ id: "fake-id" }),
    fileExists: () => true,
    readFile: () => Buffer.from("fake-pdf"),
    insertFallbackRecord: async () => {},
    ...overrides,
  };
}

describe("FIX-BCTC-REPARSE-PERIOD-KEY-SYSTEMATICALLY-STALE-100PCT-QUARANTINE", () => {
  it("AC-2: uses the content-derived period, not the stale filename-derived period, when content is confident", async () => {
    const captured: CapturedPeriod = { year: null, quarter: null };

    const deps = makeDeps({
      // Tier 1b: service extraction succeeds and returns Q4-2024 content text,
      // even though the queue row's filename encodes 31.03.2024 (Q1-2024).
      extractViaService: async (): Promise<PdfExtractorResult | null> => ({
        status: "success",
        documentId: "test-doc",
        tables: [],
        textContent: Q4_2024_CONTENT_TEXT,
        ocrConfidence: 0.9,
      }),
      pipeline: async (params) => {
        captured.year = params.year;
        captured.quarter = params.quarter;
        return { id: "fake-id" };
      },
    });

    const result = await reparseSingleWithOcrFallback(
      {
        ticker: "FRT",
        // Filename period (Q1-2024) is stale — content above is really Q4-2024.
        filename: "BCTC FRT 31.03.2024 - HOP NHAT - VN.pdf",
        filePath: "/fake/BCTC FRT 31.03.2024 - HOP NHAT - VN.pdf",
      },
      deps,
    );

    expect(result).toBe(true);
    expect(captured.year).toBe(2024);
    expect(captured.quarter).toBe("Q4"); // content-derived, NOT the stale "Q1"
  });

  it("AC-3: falls back to the filename-derived period when content is inconclusive (no regression)", async () => {
    const captured: CapturedPeriod = { year: null, quarter: null };

    const deps = makeDeps({
      extractViaService: async (): Promise<PdfExtractorResult | null> => ({
        status: "success",
        documentId: "test-doc",
        tables: [],
        // No repeated quarter-boundary date pattern anywhere — inconclusive.
        textContent: "A".repeat(200),
        ocrConfidence: 0.9,
      }),
      pipeline: async (params) => {
        captured.year = params.year;
        captured.quarter = params.quarter;
        return { id: "fake-id" };
      },
    });

    const result = await reparseSingleWithOcrFallback(
      {
        ticker: "FRT",
        filename: "BCTC FRT 31.03.2024 - HOP NHAT - VN.pdf",
        filePath: "/fake/BCTC FRT 31.03.2024 - HOP NHAT - VN.pdf",
      },
      deps,
    );

    expect(result).toBe(true);
    expect(captured.year).toBe(2024);
    expect(captured.quarter).toBe("Q1"); // unchanged fallback — filename-derived
  });
});
