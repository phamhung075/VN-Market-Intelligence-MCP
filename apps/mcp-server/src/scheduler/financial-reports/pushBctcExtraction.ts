/**
 * Push-BCTC Extraction Helper — Task 1945d
 *
 * Extracted from `server.ts` push-bctc-pdf handler for testability and to
 * implement GAP-B fix: when a PDF is pushed via POST /api/push-bctc-pdf, the
 * original `setImmediate` callback called `fetchParseAndStoreBctc` with only
 * `pdfUrl: sourceUrl || file://...` — no `pdfTextOverride`. This caused:
 *   1. `downloadAndExtractPdf` to try fetching from a geo-blocked SSC URL or
 *      a VPS URL without auth headers, producing empty text.
 *   2. The OCR fallback inside `fetchParseAndStoreBctc` to also fail (no cache).
 *   3. `financial_reports` to never receive a row.
 *
 * Fix: extract text locally via `extractAndStorePdfPagesWithRetry` → read OCR
 * cache → call `fetchParseAndStoreBctc` with `pdfTextOverride`. Identical
 * pattern to `bctcPdfPullJob.triggerExtraction`.
 *
 * Layer: interface/scheduler — dependencies on infrastructure (OCR worker,
 *        logger) and application (fetchParseAndStoreBctc).
 */

import { logger } from "../../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Injectable deps — enables unit testing without real OCR or real DB
// ─────────────────────────────────────────────────────────────────────────────

export interface PushBctcExtractionDeps {
  /**
   * Run OCR extraction for the PDF file and populate the OCR cache.
   * Maps to `extractAndStorePdfPagesWithRetry` in production.
   */
  extractPages: (filePath: string, filename: string, actionCode: string) => Promise<void>;

  /**
   * Read the OCR cache for the given filename.
   * Maps to `getCachedPdfText` in production.
   * Returns null on cache miss.
   */
  getCache: (filename: string) => { text: string; confidence: number } | null;

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

// ─────────────────────────────────────────────────────────────────────────────
// Production deps factory — lazy-loaded so module import never touches LanceDB
// ─────────────────────────────────────────────────────────────────────────────

async function makeProductionDeps(): Promise<PushBctcExtractionDeps> {
  const { extractAndStorePdfPagesWithRetry, getCachedPdfText } = await import(
    "../../infrastructure/fetchers/pdfOcrWorker.js"
  );
  const { fetchParseAndStoreBctc } = await import(
    "../../application/usecases/fetchParseAndStoreBctc.js"
  );

  return {
    extractPages: async (filePath, filename, actionCode) => {
      await extractAndStorePdfPagesWithRetry(filePath, filename, actionCode);
    },
    getCache: (filename) => getCachedPdfText(filename),
    runPipeline: async (params) => fetchParseAndStoreBctc(params),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Core function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract text from a newly-pushed BCTC PDF and run the parse+store pipeline.
 *
 * Steps:
 *   1. Call `extractPages` to populate OCR cache (handles DPI retry internally).
 *   2. Read cache via `getCache` — must be ≥ 100 chars with any confidence.
 *   3. Call `runPipeline` with `pdfTextOverride` so `fetchParseAndStoreBctc`
 *      skips the network download step entirely.
 *
 * Non-fatal — never throws. All errors are logged at WARN level.
 *
 * Used by `server.ts` POST /api/push-bctc-pdf handler (GAP-B fix).
 */
export async function triggerPushBctcExtraction(
  params: PushBctcExtractionParams,
): Promise<void> {
  const { actionCode, year, quarter, filePath, filename, pdfUrl } = params;
  const deps = params.deps ?? (await makeProductionDeps());

  // Step 1: populate OCR cache
  try {
    await deps.extractPages(filePath, filename, actionCode);
  } catch (err) {
    logger.warn("[pushBctcExtraction] OCR extraction failed (non-fatal)", {
      ticker: actionCode,
      filename,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Step 2: read cache
  const cached = deps.getCache(filename);
  if (!cached || cached.text.trim().length < 100) {
    logger.warn("[pushBctcExtraction] OCR cache empty after extraction — pipeline skipped", {
      ticker: actionCode,
      filename,
      confidence: cached?.confidence ?? null,
      chars: cached?.text.trim().length ?? 0,
    });
    return;
  }

  // Step 3: run pipeline with text override (bypasses geo-blocked download)
  try {
    const result = await deps.runPipeline({
      actionCode,
      year,
      quarter,
      pdfTextOverride: cached.text,
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
