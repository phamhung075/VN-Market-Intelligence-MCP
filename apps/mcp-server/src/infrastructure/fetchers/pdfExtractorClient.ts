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
