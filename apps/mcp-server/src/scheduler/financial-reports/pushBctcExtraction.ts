/**
 * Push-BCTC Extraction Helper — Task 1945d / 1954c
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
 * Layer: interface/scheduler — dependencies on infrastructure (pdfExtractorClient,
 *        logger) and application (fetchParseAndStoreBctc).
 */

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
   */
  extractViaService: (url: string) => Promise<PdfExtractorResult | null>;

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

  return {
    // 1954c: service is the extraction owner — replace OCR pattern
    extractViaService: async (url: string) => extractViaMicroservice(url, "bctc"),
    runPipeline: async (params) => fetchParseAndStoreBctc(params),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Core function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract text from a newly-pushed BCTC PDF and run the parse+store pipeline.
 *
 * 1954c (G5b) steps:
 *   1. Call `extractViaService(pdfUrl)` — delegates to pdf-extractor microservice.
 *      On success: service result textContent used as pdfTextOverride.
 *      On service null: log warn + return (no silent fail, no OCR fallback).
 *   2. Call `runPipeline` with `pdfTextOverride` so `fetchParseAndStoreBctc`
 *      skips the network download step entirely.
 *
 * Non-fatal — never throws. All errors are logged at WARN level.
 *
 * Used by `server.ts` POST /api/push-bctc-pdf handler (GAP-B fix / 1954c).
 */
export async function triggerPushBctcExtraction(
  params: PushBctcExtractionParams,
): Promise<void> {
  const { actionCode, year, quarter, pdfUrl } = params;
  const deps = params.deps ?? (await makeProductionDeps());

  // Step 1: call pdf-extractor service (1954c — service is extraction owner)
  let serviceResult;
  try {
    serviceResult = await deps.extractViaService(pdfUrl);
  } catch (err) {
    logger.warn("[pushBctcExtraction] service call threw (non-fatal)", {
      ticker: actionCode,
      pdfUrl,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  if (!serviceResult || serviceResult.textContent.trim().length < 100) {
    logger.warn("[pushBctcExtraction] service returned null or too-short text — pipeline skipped", {
      ticker: actionCode,
      pdfUrl,
      textLength: serviceResult?.textContent.trim().length ?? 0,
    });
    return;
  }

  // Step 2: run pipeline with text override from service result
  try {
    const result = await deps.runPipeline({
      actionCode,
      year,
      quarter,
      pdfTextOverride: serviceResult.textContent,
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
