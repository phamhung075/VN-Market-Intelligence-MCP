/**
 * Infrastructure — PDF Extractor Microservice Client
 *
 * HTTP client for delegating PDF extraction to the pdf-extractor
 * microservice (Phase 1a). Falls back gracefully when the service
 * is unavailable (returns null so callers can fall through to the
 * existing in-process extraction path).
 *
 * Endpoint: POST http://pdf-extractor:5001/extract (Docker) or http://localhost:5001/extract (local dev)
 *
 * Layer: infrastructure — may use HTTP, never imports from domain/.
 */

import { logger } from "../logger.js";

// Base URL is configurable via environment variable so tests can override it.
// In Docker: set PDF_EXTRACTOR_URL=http://pdf-extractor:5001 in docker-compose.yml.
// In local dev: defaults to http://localhost:5001.
export const PDF_EXTRACTOR_BASE_URL =
  Bun.env.PDF_EXTRACTOR_URL ?? "http://localhost:5001";

export interface PdfExtractorResult {
  documentId: string;
  tables: Array<{
    table_index: number;
    headers: string[];
    rows: string[][];
    page_number: number;
  }>;
  textContent: string;
  ocrConfidence: number;
  status: "success" | "failed";
}

/**
 * Delegate PDF extraction to the pdf-extractor microservice.
 *
 * Returns null when the service is unreachable or returns an error,
 * allowing callers to fall back to the in-process extraction pipeline.
 *
 * @param url       - The PDF URL to extract.
 * @param sourceType - Source type hint ('bctc' | 'weather' | 'utility_bill').
 */
export async function extractViaMicroservice(
  url: string,
  sourceType: "bctc" | "weather" | "utility_bill" = "bctc",
): Promise<PdfExtractorResult | null> {
  try {
    const response = await fetch(`${PDF_EXTRACTOR_BASE_URL}/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, source_type: sourceType }),
      signal: AbortSignal.timeout(120_000), // 2-minute timeout for large PDFs
    });

    if (!response.ok) {
      logger.warn("[pdfExtractorClient] non-OK response", {
        status: response.status,
        url,
      });
      return null;
    }

    const data = (await response.json()) as {
      document_id: string;
      tables: PdfExtractorResult["tables"];
      text_content: string;
      ocr_confidence: number;
      status: "success" | "failed";
    };

    return {
      documentId: data.document_id,
      tables: data.tables ?? [],
      textContent: data.text_content ?? "",
      ocrConfidence: data.ocr_confidence ?? 0,
      status: data.status,
    };
  } catch (err) {
    logger.debug("[pdfExtractorClient] service unavailable — falling back", {
      url,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Check whether the pdf-extractor microservice is reachable.
 *
 * @returns true if GET /health returns HTTP 200 with {status: "ok"}.
 */
export async function checkPdfExtractorHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${PDF_EXTRACTOR_BASE_URL}/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return false;
    const data = (await response.json()) as { status?: string };
    return data.status === "ok";
  } catch {
    return false;
  }
}

// ── FR-3: get_bctc_page_text support ─────────────────────────────────────────

export interface PageTextResult {
  text: string;
  source: "sqlite_ocr" | "mistral_ocr";
}

/**
 * Fetch OCR text for a single page from the pdf-extractor service.
 *
 * Calls GET /api/page-text?filename={filename}&page_number={page_number}.
 * Returns null when service is unreachable or page not found.
 *
 * @param filename    PDF filename (not path) as stored in pdf_extracted_text
 * @param pageNumber  1-indexed page number
 */
export async function getPageText(
  filename: string,
  pageNumber: number,
): Promise<PageTextResult | null> {
  try {
    const url = `${PDF_EXTRACTOR_BASE_URL}/api/page-text?filename=${encodeURIComponent(filename)}&page_number=${pageNumber}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      logger.warn("[pdfExtractorClient.getPageText] non-OK response", {
        status: response.status,
        filename,
        pageNumber,
      });
      return null;
    }

    const data = (await response.json()) as {
      text?: string;
      source?: "sqlite_ocr" | "mistral_ocr";
    };

    if (data.text === undefined) return null;

    return {
      text: data.text,
      source: data.source ?? "sqlite_ocr",
    };
  } catch (err) {
    logger.debug("[pdfExtractorClient.getPageText] service unavailable", {
      filename,
      pageNumber,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ── FR-4: get_bctc_page_image rasterize support ───────────────────────────────

export interface RasterizeResult {
  rasterized: number[];
  paths: string[];
}

/**
 * Trigger on-demand rasterization for specific pages of a report PDF.
 *
 * Calls POST /api/rasterize with { report_id, filename, pages }.
 * Throws on failure so callers can fall back to an error state.
 *
 * @param reportId  Financial report ID
 * @param filename  PDF filename (not path)
 * @param pages     Array of 1-indexed page numbers to rasterize
 */
export async function rasterizePages(
  reportId: string,
  filename: string,
  pages: number[],
): Promise<RasterizeResult> {
  const response = await fetch(`${PDF_EXTRACTOR_BASE_URL}/api/rasterize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ report_id: reportId, filename, pages }),
    signal: AbortSignal.timeout(120_000), // 2-min timeout for rasterization
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "(no body)");
    throw new Error(`rasterize HTTP ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    rasterized?: number[];
    paths?: string[];
  };

  return {
    rasterized: data.rasterized ?? [],
    paths: data.paths ?? [],
  };
}
