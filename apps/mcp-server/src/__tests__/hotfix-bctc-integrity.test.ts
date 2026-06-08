/**
 * hotfix-bctc-integrity — Tests for two critical BCTC extraction bugs
 *
 * Bug 1 (cross-ticker contamination):
 *   makeProductionDeps().triggerExtraction in bctcPdfPullJob.ts was a stub that
 *   called runBctcReparseJob with reparseFn = (payload) => payload.filePath ===
 *   params.filePath. This returned true without doing any extraction, causing
 *   runBctcReparseJob to mark agent_feedback rows as 'resolved' with zero work.
 *   When the real daily bctcReparseJob ran next, it fell to disk-scan and called
 *   fetchParseAndStoreBctc with pdfUrl: "file:///..." — which axios cannot handle.
 *
 * Bug 2 (FPT / any ticker silent failure):
 *   reparseSingleWithOcrFallback passed pdfUrl: "file:///..." to pipeline.
 *   fetchParseAndStoreBctc → downloadAndExtractPdf → axios fails on file:// URLs,
 *   returns { text: "", confidence: 0 }, and the function returns null silently.
 *   No error was logged at the call site, so FPT data never appeared.
 *
 * Fix contract (tested here via injectable deps):
 *   1. reparseSingleWithOcrFallback passes pdfTextOverride (not pdfUrl alone)
 *      to the pipeline when text was successfully extracted from the local file.
 *   2. The pipeline dep must receive the text extracted from the correct file,
 *      not a file:// URL that bypasses text extraction.
 *   3. Each ticker's pipeline call receives its own actionCode — never a shared one.
 *
 * Layer: interface/scheduler tests — injectable deps only, no real I/O.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
import {
  reparseSingleWithOcrFallback,
  type ReparseDeps,
} from "../scheduler/financial-reports/bctcReparseJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeDeps(overrides: Partial<ReparseDeps> = {}): ReparseDeps {
  return {
    // 1954c Tier 1: service returns null → falls through to pdf-parse Tier 2
    extractViaService: async (_url) => null,
    extractText: async (_buf) => ({ text: "dummy text ".repeat(20), confidence: 0.9 }),
    getOcrCache: (_filename) => null,
    pipeline: async (_params) => ({ id: "test-report-id" }),
    fileExists: (_path) => true,
    readFile: (_path) => Buffer.alloc(1024, 0x25),
    insertFallbackRecord: async (_payload) => {},
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bug 1: pipeline receives correct ticker-bound actionCode for each call
// ─────────────────────────────────────────────────────────────────────────────

describe("hotfix-bctc-integrity — Bug 1: actionCode is always ticker-bound", () => {
  it("passes payload.ticker as actionCode — not a shared variable across calls", async () => {
    const pipelineCalls: string[] = [];

    const deps = makeDeps({
      pipeline: async (params) => {
        pipelineCalls.push(params.actionCode);
        return { id: "ok" };
      },
    });

    // Two tickers processed sequentially — as disk-scan does
    await reparseSingleWithOcrFallback(
      { ticker: "VCB", filename: "VCB_2025_Q1.pdf", filePath: "/data/pdfs/VCB_2025_Q1.pdf" },
      deps,
    );
    await reparseSingleWithOcrFallback(
      { ticker: "HPG", filename: "HPG_2025_Q1.pdf", filePath: "/data/pdfs/HPG_2025_Q1.pdf" },
      deps,
    );

    expect(pipelineCalls).toEqual(["VCB", "HPG"]);
  });

  it("does not reuse actionCode from a previous ticker across 4 sequential calls", async () => {
    const seen: string[] = [];

    const deps = makeDeps({
      pipeline: async (params) => {
        seen.push(params.actionCode);
        return { id: "r-" + params.actionCode };
      },
    });

    for (const ticker of ["VCB", "HPG", "FPT", "VNM"]) {
      await reparseSingleWithOcrFallback(
        { ticker, filename: `${ticker}_2025_Q1.pdf`, filePath: `/data/pdfs/${ticker}_2025_Q1.pdf` },
        deps,
      );
    }

    expect(seen).toEqual(["VCB", "HPG", "FPT", "VNM"]);
    expect(new Set(seen).size).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug 1: extraction must actually run (not be a stub returning true)
// ─────────────────────────────────────────────────────────────────────────────

describe("hotfix-bctc-integrity — Bug 1: extraction runs before pipeline", () => {
  it("calls extractText before calling pipeline (not a stub)", async () => {
    let extractCalled = false;
    let pipelineCalled = false;

    const deps = makeDeps({
      extractText: async (_buf) => {
        extractCalled = true;
        return { text: "real extracted text from VCB pdf ".repeat(5), confidence: 0.9 };
      },
      pipeline: async (_params) => {
        pipelineCalled = true;
        return { id: "vcb-report" };
      },
    });

    const result = await reparseSingleWithOcrFallback(
      { ticker: "VCB", filename: "VCB_2025_Q1.pdf", filePath: "/data/pdfs/VCB_2025_Q1.pdf" },
      deps,
    );

    expect(extractCalled).toBe(true);
    expect(pipelineCalled).toBe(true);
    expect(result).toBe(true);
  });

  it("returns false without calling pipeline when file does not exist", async () => {
    let pipelineCalled = false;

    const deps = makeDeps({
      fileExists: (_path) => false,
      pipeline: async (_params) => {
        pipelineCalled = true;
        return { id: "should-not-run" };
      },
    });

    const result = await reparseSingleWithOcrFallback(
      { ticker: "VCB", filename: "VCB_2025_Q1.pdf", filePath: "/data/pdfs/VCB_2025_Q1.pdf" },
      deps,
    );

    expect(result).toBe(false);
    expect(pipelineCalled).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug 2: pipeline params must carry extracted text so file:// is never passed
//        as the sole source to downloadAndExtractPdf
// ─────────────────────────────────────────────────────────────────────────────

describe("hotfix-bctc-integrity — Bug 2: pdfTextOverride is always populated", () => {
  it("pipeline receives populated pdfTextOverride when pdf-parse succeeds", async () => {
    let capturedParams: Parameters<ReparseDeps["pipeline"]>[0] | null = null;

    const extractedText = "FPT financial data revenue profit equity ".repeat(10);

    const deps = makeDeps({
      extractText: async (_buf) => ({ text: extractedText, confidence: 0.88 }),
      pipeline: async (params) => {
        capturedParams = params;
        return { id: "fpt-report" };
      },
    });

    await reparseSingleWithOcrFallback(
      { ticker: "FPT", filename: "FPT_2025_Q1.pdf", filePath: "/data/pdfs/FPT_2025_Q1.pdf" },
      deps,
    );

    expect(capturedParams).not.toBeNull();
    // pdfTextOverride must be set — this ensures downloadAndExtractPdf is bypassed
    // and the file:// URL never reaches axios
    expect(typeof capturedParams!.pdfTextOverride).toBe("string");
    expect(capturedParams!.pdfTextOverride!.length).toBeGreaterThan(0);
    expect(capturedParams!.pdfTextOverride).toBe(extractedText);
  });

  it("pipeline receives OCR cache text as pdfTextOverride when pdf-parse yields < 100 chars", async () => {
    let capturedParams: Parameters<ReparseDeps["pipeline"]>[0] | null = null;

    const cachedText = "cached OCR text for FPT financial report ".repeat(5);

    const deps = makeDeps({
      extractText: async (_buf) => ({ text: "short", confidence: 0.0 }),
      getOcrCache: (_filename) => ({ text: cachedText, pages: 3, confidence: 0.75 }),
      pipeline: async (params) => {
        capturedParams = params;
        return { id: "fpt-from-cache" };
      },
    });

    const result = await reparseSingleWithOcrFallback(
      { ticker: "FPT", filename: "FPT_2025_Q1.pdf", filePath: "/data/pdfs/FPT_2025_Q1.pdf" },
      deps,
    );

    expect(result).toBe(true);
    expect(capturedParams!.pdfTextOverride).toBe(cachedText);
  });

  it("pdfUrl in pipeline params still carries the local file path for source stamping", async () => {
    let capturedParams: Parameters<ReparseDeps["pipeline"]>[0] | null = null;

    const deps = makeDeps({
      extractText: async (_buf) => ({ text: "VCB balance sheet ".repeat(10), confidence: 0.9 }),
      pipeline: async (params) => {
        capturedParams = params;
        return { id: "vcb-report" };
      },
    });

    await reparseSingleWithOcrFallback(
      { ticker: "VCB", filename: "VCB_2025_Q1.pdf", filePath: "/data/pdfs/VCB_2025_Q1.pdf" },
      deps,
    );

    // pdfUrl carries the path so source.pdfPath can be stamped in the DB
    expect(capturedParams!.pdfUrl).toContain("VCB_2025_Q1.pdf");
    // pdfTextOverride is also set — this is what prevents the file:// URL
    // from reaching downloadAndExtractPdf
    expect(capturedParams!.pdfTextOverride).toBeDefined();
    expect(capturedParams!.pdfTextOverride!.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug 2: silent failure path is visible
// ─────────────────────────────────────────────────────────────────────────────

describe("hotfix-bctc-integrity — Bug 2: failures are not silently swallowed", () => {
  it("returns false when both pdf-parse and OCR cache yield unusable text", async () => {
    const deps = makeDeps({
      extractText: async (_buf) => ({ text: "", confidence: 0.0 }),
      getOcrCache: (_filename) => null,
    });

    const result = await reparseSingleWithOcrFallback(
      { ticker: "FPT", filename: "FPT_2025_Q1.pdf", filePath: "/data/pdfs/FPT_2025_Q1.pdf" },
      deps,
    );

    // Must return false — not silently succeed
    expect(result).toBe(false);
  });

  it("calls insertFallbackRecord for FPT when all extraction paths fail", async () => {
    let fallbackTicker: string | null = null;
    let fallbackYear: number | null = null;
    let fallbackQuarter: string | null = null;

    const deps = makeDeps({
      extractText: async (_buf) => ({ text: "x", confidence: 0.0 }),
      getOcrCache: (_filename) => ({ text: "y", pages: 1, confidence: 0.05 }),
      insertFallbackRecord: async (payload) => {
        fallbackTicker = payload.ticker;
        fallbackYear = payload.year;
        fallbackQuarter = payload.quarter;
      },
    });

    await reparseSingleWithOcrFallback(
      { ticker: "FPT", filename: "FPT_2025_Q1.pdf", filePath: "/data/pdfs/FPT_2025_Q1.pdf" },
      deps,
    );

    expect(fallbackTicker as unknown as string).toBe("FPT");
    expect(fallbackYear as unknown as number).toBe(2025);
    expect(fallbackQuarter as unknown as string).toBe("Q1");
  });

  it("does not call insertFallbackRecord for VCB when extraction succeeds", async () => {
    let fallbackCalled = false;

    const deps = makeDeps({
      extractText: async (_buf) => ({ text: "VCB revenue profit ".repeat(10), confidence: 0.9 }),
      insertFallbackRecord: async (_payload) => {
        fallbackCalled = true;
      },
    });

    const result = await reparseSingleWithOcrFallback(
      { ticker: "VCB", filename: "VCB_2025_Q1.pdf", filePath: "/data/pdfs/VCB_2025_Q1.pdf" },
      deps,
    );

    expect(result).toBe(true);
    expect(fallbackCalled).toBe(false);
  });
});
