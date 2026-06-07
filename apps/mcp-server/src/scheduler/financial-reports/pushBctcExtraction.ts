/**
 * Push-BCTC Extraction Helper — Task 1945d / 1954c / FIX-CTG-3-STEP-C
 *
 * Extracted from `server.ts` push-bctc-pdf handler for testability.
 *
 * 1945d: Original fix — replaced the old `setImmediate → fetchParseAndStoreBctc`
 * (which had no pdfTextOverride) with local OCR extraction → pdfTextOverride.
 *
 * 1954c (G5b): Consolidation — replaces the OCR-based extraction pattern
 * (`extractAndStorePdfPagesWithRetry` + `getCachedPdfText`) with a single
 * HTTP call to the pdf-extractor microservice via `pdfExtractorClient.extractViaMicroservice`.
 * The service is now the single extraction owner for all 4 BCTC callers.
 *
 * FIX-CTG-3-STEP-C: Three-tier local-file fallback for geo-blocked push URLs.
 *   When extractViaService(pdfUrl) returns null (e.g. hsx.vn is geo-blocked from
 *   the extraction service), fall back to:
 *   Tier 2: extractViaService(file://${filePath}) — reads from local disk, not remote.
 *   Tier 3: extractText(readFile(filePath)) — direct pdf-parse from local buffer.
 *   This closes the "status=fetching, financial_reports empty" bug where the push
 *   handler saved the PDF to disk but extraction silently failed on the remote URL.
 *
 * Layer: interface/scheduler — dependencies on infrastructure (pdfExtractorClient,
 *        logger) and application (fetchParseAndStoreBctc).
 */

import { existsSync } from "node:fs";
import { logger } from "../../infrastructure/logger.js";
import type { PdfExtractorResult } from "../../infrastructure/fetchers/pdfExtractorClient.js";

// ─────────────────────────────────────────────────────────────────────────────
// Injectable deps — enables unit testing without real HTTP or real DB
// ─────────────────────────────────────────────────────────────────────────────

export interface PushBctcExtractionDeps {
  /**
   * Delegate PDF extraction to the pdf-extractor microservice.
   * 1954c: replaces extractPages + getCache (OCR pattern).
   * Returns null when service unavailable or returns error.
   * Maps to `extractViaMicroservice` from pdfExtractorClient in production.
   * Called for the remote pdfUrl (Tier 2) and file:// fallback (old Tier 2).
   */
  extractViaService: (url: string) => Promise<PdfExtractorResult | null>;

  /**
   * FEAT-PDF-EXTRACTOR-LOCAL-INPUT: delegate PDF extraction using the shared-volume
   * pdf_path (POST /extract body: {pdf_path, source_type} — NO url key).
   * Tier 1 — attempted first when filePath is non-empty.
   * Returns null when service unavailable or extraction fails.
   * Maps to `extractViaMicroservice(url="", ..., pdfPath)` from pdfExtractorClient.
   * Optional — when absent, Tier 1 is skipped and Tier 2 (URL mode) is attempted.
   */
  extractViaServicePdfPath?: (pdfPath: string) => Promise<PdfExtractorResult | null>;

  /**
   * Run the full BCTC parse+store pipeline.
   * Maps to `fetchParseAndStoreBctc` in production.
   */
  runPipeline: (params: {
    actionCode: string;
    year: number;
    quarter: "Q1" | "Q2" | "Q3" | "Q4";
    pdfTextOverride: string;
    pdfUrl: string;
  }) => Promise<{ id: string } | null>;

  /**
   * FIX-CTG-3-STEP-C Tier 3: extract text from a PDF buffer via pdf-parse.
   * Called when both service calls (remote URL + file://) return null/short text.
   * Optional — if absent, Tier 3 is skipped.
   * Maps to `extractPdfText` from infrastructure/fetchers/pdf.ts in production.
   */
  extractText?: (buf: Buffer) => Promise<{ text: string; confidence: number }>;

  /**
   * FIX-CTG-3-STEP-C Tier 3: read a local file into a Buffer.
   * Called to obtain the PDF buffer before passing to extractText.
   * Optional — if absent, Tier 3 is skipped.
   * Maps to `readFileSync` in production.
   */
  readFile?: (path: string) => Buffer;
}

export interface PushBctcExtractionParams {
  actionCode: string;
  year: number;
  quarter: "Q1" | "Q2" | "Q3" | "Q4";
  filePath: string;
  filename: string;
  pdfUrl: string;
  deps?: PushBctcExtractionDeps;
}

// Retain PushBctcExtractionParams for backward compatibility with server.ts callers.
// The filePath/filename params are still accepted but no longer used for OCR extraction
// (1954c): extraction is now delegated to the service via pdfUrl.

// ─────────────────────────────────────────────────────────────────────────────
// Production deps factory — lazy-loaded so module import never touches LanceDB
// ─────────────────────────────────────────────────────────────────────────────

async function makeProductionDeps(): Promise<PushBctcExtractionDeps> {
  const { extractViaMicroservice } = await import(
    "../../infrastructure/fetchers/pdfExtractorClient.js"
  );
  const { fetchParseAndStoreBctc } = await import(
    "../../application/usecases/fetchParseAndStoreBctc.js"
  );
  const { extractPdfText } = await import(
    "../../infrastructure/fetchers/pdf.js"
  );
  const { readFileSync } = await import("node:fs");

  return {
    // 1954c: service is the extraction owner — replace OCR pattern
    extractViaService: async (url: string) => extractViaMicroservice(url, "bctc"),
    // FEAT-PDF-EXTRACTOR-LOCAL-INPUT: Tier 1 — pdf_path body mode (no url key)
    extractViaServicePdfPath: async (pdfPath: string) => extractViaMicroservice("", "bctc", pdfPath),
    runPipeline: async (params) => fetchParseAndStoreBctc(params),
    // FIX-CTG-3-STEP-C Tier 3: direct pdf-parse fallback when service unavailable
    extractText: async (buf: Buffer) => extractPdfText(buf),
    readFile: (path: string) => readFileSync(path),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Core function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract text from a newly-pushed BCTC PDF and run the parse+store pipeline.
 *
 * FEAT-PDF-EXTRACTOR-LOCAL-INPUT three-tier extraction (updated from FIX-CTG-3-STEP-C):
 *
 *   Tier 1: extractViaServicePdfPath(filePath) — pdf_path body mode (no url key).
 *           Service reads from the shared volume directly → real OCR, no 401.
 *           Called when filePath is non-empty and the dep is wired.
 *   Tier 2: extractViaService(pdfUrl) — remote URL (hsx.vn / VPS source URL).
 *           Attempted when Tier 1 is absent or returns null/short text.
 *           May fail when the extraction service cannot reach a geo-blocked URL.
 *   Tier 3: extractText(readFile(filePath)) — direct pdf-parse fallback.
 *           Called when both service tiers return null/short AND extractText/readFile deps
 *           are provided. Minimum confidence guard: text must be >= 100 chars.
 *
 * Pipeline is called iff at least one tier yields text >= 100 chars.
 * Non-fatal — never throws. All errors are logged at WARN level.
 *
 * Used by `server.ts` POST /api/push-bctc-pdf handler.
 */
export async function triggerPushBctcExtraction(
  params: PushBctcExtractionParams,
): Promise<void> {
  const { actionCode, year, quarter, filePath, pdfUrl } = params;
  const deps = params.deps ?? (await makeProductionDeps());

  let rawText: string | null = null;

  // ── Tier 1: pdf-extractor service with pdf_path (shared volume) ───────────
  // FEAT-PDF-EXTRACTOR-LOCAL-INPUT: when filePath is non-empty and the dep is wired,
  // send {pdf_path, source_type} (no url key) so the service reads from the
  // shared volume directly. This bypasses HTTP fetch entirely — no 401 from VPS URLs,
  // real OCR pipeline for scanned PDFs.
  if (filePath && deps.extractViaServicePdfPath) {
    try {
      const serviceResult = await deps.extractViaServicePdfPath(filePath);
      if (serviceResult && serviceResult.textContent.trim().length >= 100) {
        rawText = serviceResult.textContent;
        logger.info("[pushBctcExtraction] Tier 1 (pdf_path) succeeded", {
          ticker: actionCode,
          filePath,
          chars: serviceResult.textContent.length,
        });
      } else {
        logger.info("[pushBctcExtraction] Tier 1 (pdf_path) null/short — trying Tier 2 (remote URL)", {
          ticker: actionCode,
          filePath,
          textLength: serviceResult?.textContent.trim().length ?? 0,
        });
      }
    } catch (err) {
      logger.warn("[pushBctcExtraction] Tier 1 (pdf_path) threw — trying Tier 2 (remote URL)", {
        ticker: actionCode,
        filePath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── Tier 2: pdf-extractor service with remote/source URL ──────────────────
  if (rawText === null) {
    try {
      const serviceResult = await deps.extractViaService(pdfUrl);
      if (serviceResult && serviceResult.textContent.trim().length >= 100) {
        rawText = serviceResult.textContent;
        logger.info("[pushBctcExtraction] Tier 2 (remote URL) succeeded", {
          ticker: actionCode,
          pdfUrl,
          chars: serviceResult.textContent.length,
        });
      } else {
        logger.info("[pushBctcExtraction] Tier 2 (remote URL) null/short — trying Tier 3 (pdf-parse)", {
          ticker: actionCode,
          pdfUrl,
          textLength: serviceResult?.textContent.trim().length ?? 0,
        });
      }
    } catch (err) {
      logger.warn("[pushBctcExtraction] Tier 2 threw — trying Tier 3 (pdf-parse)", {
        ticker: actionCode,
        pdfUrl,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── Tier 3: direct pdf-parse fallback ─────────────────────────────────────
  // Used when both service tiers fail and filePath+extractText deps are available.
  if (rawText === null && filePath && deps.extractText && deps.readFile) {
    try {
      const buf = deps.readFile(filePath);
      const { text, confidence } = await deps.extractText(buf);
      if (text && text.trim().length >= 100) {
        rawText = text;
        logger.info("[pushBctcExtraction] Tier 3 (pdf-parse) succeeded", {
          ticker: actionCode,
          filePath,
          chars: text.length,
          confidence,
        });
      } else {
        logger.warn("[pushBctcExtraction] all 3 tiers exhausted — pipeline skipped", {
          ticker: actionCode,
          filePath,
          chars: text?.trim().length ?? 0,
          confidence,
        });
      }
    } catch (err) {
      logger.warn("[pushBctcExtraction] Tier 3 threw — pipeline skipped", {
        ticker: actionCode,
        filePath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } else if (rawText === null) {
    logger.warn("[pushBctcExtraction] all tiers failed — pipeline skipped", {
      ticker: actionCode,
      pdfUrl,
      filePath: filePath || "(none)",
    });
  }

  if (rawText === null) return;

  // ── Run pipeline with text override ───────────────────────────────────────
  try {
    const result = await deps.runPipeline({
      actionCode,
      year,
      quarter,
      pdfTextOverride: rawText,
      pdfUrl,
    });
    if (result) {
      logger.info("[pushBctcExtraction] pipeline complete", {
        ticker: actionCode,
        year,
        quarter,
        id: result.id,
      });
    } else {
      logger.warn("[pushBctcExtraction] pipeline returned null", {
        ticker: actionCode,
        year,
        quarter,
      });
    }
  } catch (err) {
    logger.warn("[pushBctcExtraction] pipeline threw (non-fatal)", {
      ticker: actionCode,
      year,
      quarter,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
