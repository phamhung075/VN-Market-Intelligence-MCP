/**
 * Infrastructure — PDF Downloader + Text Extractor
 *
 * Downloads a PDF from a URL (via an injectable HttpClient) and extracts its
 * text content using the pdf-parse library. Returns both the raw text and a
 * confidence score so callers can decide whether the extraction was useful.
 *
 * Layer: infrastructure/fetchers — may use HTTP + pdf-parse, must not import
 * from domain/.
 */

import type { HttpClient } from "./ssc.js";
import { logger } from "../logger.js";

// ---------------------------------------------------------------------------
// Public constants
// ---------------------------------------------------------------------------

/**
 * Minimum number of characters in extracted text that qualifies as
 * "high-confidence" extraction. PDFs with fewer characters are considered
 * scanned images and receive a lower confidence score.
 *
 * Exported so tests can use the same threshold without hard-coding it.
 */
export const PDF_CONFIDENCE_HIGH_THRESHOLD = 200;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Result returned by extractPdfText and downloadAndExtractPdf.
 */
export interface PdfExtractionResult {
  /**
   * The UTF-8 text extracted from the PDF.
   * Empty string when extraction fails or the PDF contains no text.
   */
  text: string;
  /**
   * Extraction confidence in [0, 1].
   *   1.0 — text length exceeds PDF_CONFIDENCE_HIGH_THRESHOLD
   *   0.3 — some text extracted but below the threshold (likely scanned)
   *   0.0 — no text extracted or parse error
   */
  confidence: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Computes a confidence score based on how much text was extracted.
 *
 * @param text - Extracted text string.
 * @returns Confidence in [0, 1].
 */
function computeConfidence(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return 0;
  }
  if (trimmed.length >= PDF_CONFIDENCE_HIGH_THRESHOLD) {
    return 1.0;
  }
  // Below threshold — treat as a scanned/image PDF with minimal text
  return 0.3;
}

// ---------------------------------------------------------------------------
// Core extraction
// ---------------------------------------------------------------------------

/**
 * Extracts text from an in-memory PDF buffer using pdf-parse.
 *
 * Never throws. On any parse error the function returns
 * `{ text: "", confidence: 0 }` so callers can handle gracefully.
 *
 * @param buffer - Raw bytes of the PDF file.
 * @returns PdfExtractionResult with text and confidence score.
 */
export async function extractPdfText(
  buffer: Buffer,
): Promise<PdfExtractionResult> {
  if (!buffer || buffer.length === 0) {
    logger.debug("[pdf] empty buffer — skipping parse");
    return { text: "", confidence: 0 };
  }

  try {
    // Dynamic import keeps the module mockable and avoids loading pdf-parse in
    // environments that don't need it.
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(buffer);
    const text = data.text ?? "";
    const confidence = computeConfidence(text);

    logger.debug("[pdf] extracted text", {
      chars: text.length,
      confidence,
    });

    return { text, confidence };
  } catch (err) {
    logger.warn("[pdf] failed to parse PDF buffer", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { text: "", confidence: 0 };
  }
}

// ---------------------------------------------------------------------------
// Downloader
// ---------------------------------------------------------------------------

/**
 * Creates the default production HTTP client backed by axios.
 * Lazy-imported so tests that inject a mock never load axios.
 */
async function makeDefaultHttpClient(): Promise<HttpClient> {
  const axiosModule = await import("axios");
  const axios = axiosModule.default;

  return {
    async get(url: string): Promise<string> {
      const response = await axios.get<string>(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; VN-Market-Intelligence/1.0; +https://github.com/vn-market)",
          Accept: "application/pdf,*/*",
        },
        timeout: 30_000,
        // Receive raw binary so we can convert it to a Buffer
        responseType: "arraybuffer",
      });
      // axios returns an ArrayBuffer when responseType = 'arraybuffer';
      // the HttpClient interface uses string, so we coerce via latin1 encoding
      // which is a lossless byte-level round-trip to/from Buffer.
      return Buffer.from(response.data as unknown as ArrayBuffer).toString("binary");
    },
  };
}

/**
 * Downloads a PDF from the given URL and extracts its text content.
 *
 * The optional `httpClient` parameter allows tests to inject a mock so no
 * real HTTP requests are made during testing.
 *
 * Never throws. On any error (network, parse) returns
 * `{ text: "", confidence: 0 }`.
 *
 * @param url        - Absolute URL of the PDF to download.
 * @param httpClient - Optional HTTP client; defaults to an axios-backed client.
 * @returns PdfExtractionResult with text and confidence score.
 */
export async function downloadAndExtractPdf(
  url: string,
  httpClient?: HttpClient,
): Promise<PdfExtractionResult> {
  logger.debug("[pdf] downloading PDF", { url });

  try {
    const client = httpClient ?? (await makeDefaultHttpClient());
    const binaryString = await client.get(url);
    // Convert the binary string back to a Buffer for pdf-parse
    const buffer = Buffer.from(binaryString, "binary");

    const result = await extractPdfText(buffer);

    logger.info("[pdf] download + extract complete", {
      url,
      chars: result.text.length,
      confidence: result.confidence,
    });

    return result;
  } catch (err) {
    logger.error("[pdf] failed to download or extract PDF", {
      url,
      error: err instanceof Error ? err.message : String(err),
    });
    return { text: "", confidence: 0 };
  }
}
