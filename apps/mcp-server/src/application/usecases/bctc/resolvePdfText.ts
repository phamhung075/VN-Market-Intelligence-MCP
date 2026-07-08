/**
 * FACTORY-APP-split-fetchParseAndStoreBctc — extracted from fetchParseAndStoreBctc.ts.
 *
 * Task 1002 — normaliseFilename (PDF filename normalisation, kept alongside its
 * primary caller below; re-exported from fetchParseAndStoreBctc.ts for the
 * existing external callers: bctcVpsIngestHandler.ts, 1002/1112 test files).
 *
 * Task 293 — resolvePdfText: Step 2 of the BCTC pipeline. Downloads + extracts
 * PDF text, falls back to the OCR cache (or runs OCR now) when pdf-parse text
 * is too short, and — when extraction fails entirely (PDF timeout) — delegates
 * the terminal decision to the Task 1294b news-chain fallback in
 * newsChainFallback.ts. Returns either resolved text to continue the pipeline
 * (Step 3 in fetchParseAndStoreBctc.ts) or a final result for the orchestrator
 * to return immediately (report or null).
 *
 * Arithmetic/behavior is unchanged from the pre-split file — this is a pure
 * relocation into its own module.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";

import { BROWSER_UA } from "../../../infrastructure/fetchers/browserHeaders.js";
import { downloadAndExtractPdf } from "../../../infrastructure/fetchers/pdf.js";
import { breakers } from "../../../infrastructure/circuitBreakerRegistry.js";
import { CircuitOpenError } from "../../../infrastructure/circuitBreaker.js";
import {
  getCachedPdfText,
  extractAndStorePdfPagesWithRetry,
  isOcrAvailable,
} from "../../../infrastructure/fetchers/pdfOcrWorker.js";
import { logger } from "../../../infrastructure/logger.js";
import { tryNewsChainFallback } from "./newsChainFallback.js";

import type { HttpClient } from "../../../infrastructure/fetchers/ssc.js";
import type { FinancialReport } from "../../../../bctc-schema.js";
import type { QuarterString } from "./types.js";

/**
 * Task 1002 — Normalise PDF filename to always include the ticker.
 * Anonymous filenames (e.g. "document.pdf", GUIDs) are replaced with
 * `{ACTIONCODE}_{year}_{quarter}.pdf`. Filenames that already contain the
 * ticker are returned unchanged.
 */
export function normaliseFilename(
  url: string,
  actionCode: string,
  year: number,
  quarter: QuarterString,
): string {
  const canonical = `${actionCode.toUpperCase()}_${year}_${quarter}.pdf`;
  try {
    const raw = basename(decodeURIComponent(new URL(url, "https://example.com").pathname));
    if (raw && raw.toLowerCase().endsWith(".pdf") && raw.toUpperCase().includes(actionCode.toUpperCase())) {
      return raw; // already attributed
    }
  } catch {
    // URL parse failure — use canonical
  }
  return canonical;
}

export interface ResolvePdfTextParams {
  actionCode: string;
  year: number;
  quarter: QuarterString;
  /** SSC document resolved in Step 1 (or the caller-supplied pdfUrl). */
  doc: { url: string; publishedAt?: string };
  sscHttpClient?: HttpClient | undefined;
  pdfHttpClient?: HttpClient | undefined;
  pdfTextOverride?: string | undefined;
  enableBctcFallback: boolean;
  /** Log tag, shared verbatim with the orchestrator's Step 1/3/4 log lines. */
  tag: string;
}

/** Continue the pipeline into Step 3 with resolved text, or return a final result now. */
export type ResolvePdfTextOutcome =
  | { status: "text"; rawText: string; resolvedExtractionMethod: string }
  | {
      status: "final";
      report: (FinancialReport & { fallback?: boolean; extraction_method?: string; confidence?: number; reason?: string }) | null;
    };

/**
 * Step 2 of the BCTC pipeline: download & extract PDF text, OCR cache fallback,
 * and (on total extraction failure) the news-chain fallback terminal decision.
 */
export async function resolvePdfText(params: ResolvePdfTextParams): Promise<ResolvePdfTextOutcome> {
  const { actionCode, year, quarter, doc, pdfHttpClient, pdfTextOverride, enableBctcFallback, tag } = params;

  logger.info(`${tag} step 2: extracting PDF text`);

  let rawText: string;
  let extractionError: Error | null = null;
  // Bug 1352a: track which extraction path succeeded for stamping
  // Values: 'pdf-parse' | 'ocr-200' | 'ocr-300' | 'pdf-override'
  let resolvedExtractionMethod: string = "pdf-parse";

  if (pdfTextOverride !== undefined) {
    // Test shortcut — bypass real PDF extraction and OCR fallback
    rawText = pdfTextOverride;
    resolvedExtractionMethod = "pdf-parse";
  } else {
    // Task 1019: route SSC PDF downloads through breakers.ssc so network
    // timeouts on PDF fetch actually trip the shared SSC breaker. In test mode
    // (pdfHttpClient injected) skip the breaker so tests stay deterministic.
    try {
      const extraction = await downloadAndExtractPdf(
        doc.url,
        pdfHttpClient,
        pdfHttpClient ? undefined : breakers.ssc,
      );
      rawText = extraction.text;
    } catch (err) {
      if (err instanceof CircuitOpenError) {
        // FIX-1267: breaker is OPEN — SSC is currently blocked due to sustained
        // failures. Do not retry. The VPS (vn-bctc-fetch.service) is the
        // authoritative source; it will push the PDF when SSC is reachable.
        logger.warn(`${tag} SSC circuit is OPEN — PDF fetch skipped. PDF will be pushed by VPS when SSC recovers.`);
        return { status: "final", report: null };
      }
      // FIX-1267: timeout errors (ECONNABORTED / ETIMEDOUT) are now re-thrown by
      // downloadAndExtractPdf so they land here as extractionError, enabling the
      // news-chain fallback path below.
      extractionError = err instanceof Error ? err : new Error(String(err));
      rawText = "";
    }

    // ── Task 293: OCR fallback when pdf-parse returns < 100 chars ─────────────
    // Scanned / image-based PDFs produce very little or no text via pdf-parse.
    // In that case consult the OCR cache built by pdfOcrWorker.ts, and if not
    // yet cached + OCR tools are available, run the extraction now.
    if (rawText.trim().length < 100) {
      // Task 1002: normalise filename to always include the ticker
      const filename = normaliseFilename(doc.url, actionCode, year, quarter);

      logger.info(`${tag} pdf-parse returned < 100 chars — checking OCR cache`, { filename });

      let cached = getCachedPdfText(filename);

      if (cached === null && isOcrAvailable() && !pdfHttpClient) {
        // Cache miss and OCR tools present — download PDF to disk and run OCR.
        // Guard: when pdfHttpClient is injected (test mode) skip real-network download.
        logger.info(`${tag} OCR cache miss — downloading and extracting`, { filename });
        try {
          const { default: axios } = await import("axios");

          const pdfDir = join(process.cwd(), "data", "pdfs");
          mkdirSync(pdfDir, { recursive: true });
          const pdfPath = join(pdfDir, filename);

          // Task 1019: wrap the OCR fallback download in breakers.ssc too, so
          // network failures on the secondary fetch path also count against
          // the breaker instead of silently degrading BCTC freshness.
          const resp = await breakers.ssc.execute(() =>
            axios.get<ArrayBuffer>(doc.url, {
              responseType: "arraybuffer",
              timeout: 60_000,
              headers: {
                "User-Agent": BROWSER_UA,
              },
            }),
          );
          writeFileSync(pdfPath, Buffer.from(resp.data));
          // Task 1290: Use retry function for automatic high-DPI re-extraction on low confidence
          // Bug 1352a: capture whether DPI 300 retry ran to stamp extraction_method correctly
          const retryResult = await extractAndStorePdfPagesWithRetry(pdfPath, filename, actionCode);
          // DPI 300 retry runs when phase-1 confidence < 0.2 (see pdfOcrWorker.ts)
          // We infer from the result whether high-DPI was needed
          if (retryResult.confidenceAfterRetry < 0.2) {
            // retry was insufficient even with DPI 300 — stamp ocr-300 to indicate it ran
            resolvedExtractionMethod = "ocr-300";
          } else {
            // Check if original phase-1 was low (would have triggered DPI 300)
            // We approximate: if the retry function ran its phase-2, confidence improved
            resolvedExtractionMethod = "ocr-200";
          }
          cached = getCachedPdfText(filename);
        } catch (err) {
          if (err instanceof CircuitOpenError) {
            logger.debug(`${tag} circuit open — skipping OCR fallback download`, { filename });
          } else {
            logger.warn(`${tag} OCR extraction failed`, {
              filename,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }

      if (cached !== null && cached.confidence >= 0.3) {
        if (cached.confidence < 0.5) {
          logger.warn(`${tag} using OCR cache with low confidence`, {
            filename,
            confidence: cached.confidence,
          });
        } else {
          logger.info(`${tag} using OCR cache`, {
            filename,
            confidence: cached.confidence,
            pages: cached.pages,
          });
        }
        rawText = cached.text;
        // If method was not set by retry path above, this is a cache hit at ocr-200
        if (resolvedExtractionMethod === "pdf-parse") {
          resolvedExtractionMethod = "ocr-200";
        }
      } else if (cached !== null && cached.confidence < 0.3) {
        logger.warn(`${tag} OCR confidence too low — aborting`, {
          filename,
          confidence: cached.confidence,
        });
        return { status: "final", report: null };
      }
      // else: no cache and OCR not available — fall through to empty-text guard
    }
  }

  // Task 1294b: When a real PDF timeout error occurred AND fallback is enabled,
  // try the news chain fallback. Empty text from pdfTextOverride='' or OCR miss
  // without a timeout error is a clean abort — return null directly.
  if (!rawText || rawText.trim().length === 0) {
    // Only attempt news-chain fallback when there was an actual extraction error
    // (i.e. a timeout thrown by the PDF download/parse step).
    if (extractionError) {
      if (!enableBctcFallback) {
        throw extractionError;
      }
      logger.info(`${tag} PDF timeout — attempting news chain fallback`);
      const fallbackResult = await tryNewsChainFallback(actionCode, year, quarter);
      if (fallbackResult.fallback && fallbackResult.report) {
        return { status: "final", report: fallbackResult.report };
      }
      // Fallback was attempted but rejected — return null
      logger.warn(`${tag} PDF extraction fallback rejected: ${fallbackResult.reason}`);
      return { status: "final", report: null };
    }
    // No error (empty override or OCR miss) — clean abort
    logger.warn(`${tag} PDF extraction yielded empty text — aborting`);
    return { status: "final", report: null };
  }

  return { status: "text", rawText, resolvedExtractionMethod };
}
