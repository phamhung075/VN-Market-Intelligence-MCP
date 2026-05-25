// G5-DEBT: live caller found — deprecation deferred to Phase 2.
// P1-G audit (2026-05-25): 2 live callers found:
//   - bctcReparseJob.ts:extractPdfText (Tier 2 local fallback after HTTP) → KEEP
//   - fetchParseAndStoreBctc.ts:downloadAndExtractPdf (architect-frozen 1954c) → KEEP
// These are legitimate local fallbacks in the 3-tier extraction pipeline.
// Phase 2 G5 task: remove local fallback paths after pdf-extractor service is proven stable.
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
import type { CircuitBreaker } from "../circuitBreaker.js";
import { CircuitOpenError } from "../circuitBreaker.js";
import type { PdfExtractorResult } from "./pdfExtractorClient.js";

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

/**
 * Confidence threshold below which the pybctc microservice fallback is
 * triggered. When pdf-parse returns confidence < this value (i.e. the PDF is
 * likely scanned or table-heavy), the microservice is consulted for better
 * extraction. Exported so tests can reference the same constant.
 */
export const PDF_MICROSERVICE_FALLBACK_THRESHOLD = 0.5;

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
  /**
   * Which extraction strategy produced this result.
   * Present only when the pybctc microservice fallback was used.
   *   'pybctc_tables' — microservice returned at least one table
   *   'pybctc_text'   — microservice returned text-only (no tables)
   * Absent (undefined) when pdf-parse or OCR produced the result.
   */
  extraction_method?: "pybctc_tables" | "pybctc_text";
}

/**
 * Port: injectable microservice client for PDF extraction (Task 1352b).
 *
 * Allows tests to inject a mock without making real HTTP calls to the
 * pybctc pdf-extractor service. The default production implementation
 * delegates to extractViaMicroservice() from pdfExtractorClient.ts.
 */
export interface PdfMicroserviceClient {
  /**
   * Ask the pybctc microservice to extract text + tables from a PDF URL.
   * Returns null when the service is unavailable or returns an error.
   */
  extract(
    url: string,
    sourceType: "bctc" | "weather" | "utility_bill",
  ): Promise<PdfExtractorResult | null>;
}

// ---------------------------------------------------------------------------
// OCR fallback (Tesseract via pdftoppm + stdin pipe)
// ---------------------------------------------------------------------------

/**
 * OCR a scanned PDF buffer using pdftoppm + tesseract (Vietnamese + English).
 * Uses stdin piping to work around a known leptonica file-reading bug on macOS.
 *
 * Task 292 / FR-2: DPI raised from 150 to 200 for better OCR accuracy
 * on dense Vietnamese number tables.
 *
 * @deprecated 1954c (G5b) — in-process Tesseract OCR is now owned by the
 * pdf-extractor microservice (port 5001). This function is kept to avoid
 * breaking any remaining test imports but is no longer called in production.
 * Scheduled for removal once all callers have been confirmed migrated.
 *
 * @param buffer - Raw PDF bytes
 * @param totalPages - Total number of pages in the PDF
 * @returns Extracted text from OCR, or empty string on failure
 */
async function ocrPdfBuffer(buffer: Buffer, totalPages: number): Promise<string> {
  try {
    const { execFile, spawn } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { join } = await import("node:path");

    const execFileAsync = promisify(execFile);

    // Check if required tools are available (async)
    try { await execFileAsync("which", ["pdftoppm"]); } catch { return ""; }
    try { await execFileAsync("which", ["tesseract"]); } catch { return ""; }

    // Write PDF to a temp file (pdftoppm needs a file path)
    const tmpDir = `/tmp/ocr-${Date.now()}`;
    mkdirSync(tmpDir, { recursive: true });
    const tmpPdf = join(tmpDir, "input.pdf");
    writeFileSync(tmpPdf, buffer);

    // OCR key pages (first 30 or all, whichever is fewer)
    const maxPages = Math.min(totalPages || 30, 30);
    const allText: string[] = [];

    for (let page = 1; page <= maxPages; page++) {
      try {
        // Async pipe: pdftoppm stdout → tesseract stdin
        // DPI 200 (Task 292 / FR-2 — was 150)
        const pageText = await new Promise<string>((resolve) => {
          const ppm = spawn("nice", [
            "-n", "19", "pdftoppm",
            "-f", String(page), "-l", String(page), "-r", "200", tmpPdf,
          ]);
          const tess = spawn("nice", [
            "-n", "19", "tesseract", "stdin", "stdout", "-l", "vie+eng",
          ]);

          const ppmChunks: Buffer[] = [];
          const tessChunks: Buffer[] = [];
          let resolved = false;

          function done(text: string) {
            if (!resolved) { resolved = true; resolve(text); }
          }

          ppm.stdout.on("data", (chunk: Buffer) => {
            ppmChunks.push(chunk);
            tess.stdin.write(chunk);
          });
          ppm.stderr.on("data", () => {});
          ppm.on("close", (code) => {
            if (code !== 0 || ppmChunks.length === 0) { tess.kill(); done(""); return; }
            tess.stdin.end();
          });
          ppm.on("error", () => { tess.kill(); done(""); });

          tess.stdout.on("data", (chunk: Buffer) => tessChunks.push(chunk));
          tess.stderr.on("data", () => {});
          tess.on("close", () => done(Buffer.concat(tessChunks).toString("utf-8").trim()));
          tess.on("error", () => done(""));

          // Per-page safety timeout (45s)
          setTimeout(() => { ppm.kill(); tess.kill(); done(""); }, 45_000);
        });

        if (pageText.length > 10) {
          allText.push(pageText);
        }
      } catch {
        // Skip pages that fail OCR
      }

      // Yield 2 seconds between pages to keep server responsive
      await new Promise(r => setTimeout(r, 2000));
    }

    // Cleanup
    try {
      const { rmSync } = await import("node:fs");
      rmSync(tmpDir, { recursive: true });
    } catch { /* ignore */ }

    return allText.join("\n\n--- Page Break ---\n\n");
  } catch (err) {
    logger.warn("[pdf] OCR fallback failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return "";
  }
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

/**
 * Lazy-load the production microservice client so tests that inject a mock
 * never load the real pdfExtractorClient (which uses globalThis.fetch).
 */
async function makeDefaultMicroserviceClient(): Promise<PdfMicroserviceClient> {
  const { extractViaMicroservice } = await import("./pdfExtractorClient.js");
  return { extract: extractViaMicroservice };
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
 * Pipeline (1954c — service-first inversion):
 *   1. Attempt extraction via pybctc microservice (port 5001) — PRIMARY path.
 *      On success: return service result with extraction_method stamped.
 *   2. If service returns null (unavailable / timeout):
 *      Download via httpClient (default: axios) + extract via pdf-parse — FALLBACK path.
 *
 * The optional `httpClient` parameter allows tests to inject a mock so no
 * real HTTP requests are made during testing.
 *
 * The optional `microserviceClient` parameter (ports pattern, Task 1352b)
 * allows tests to inject a mock pybctc client. Defaults to the real
 * extractViaMicroservice() from pdfExtractorClient.ts.
 *
 * Never throws. On any error (network, parse) returns
 * `{ text: "", confidence: 0 }`.
 *
 * @param url                - Absolute URL of the PDF to download.
 * @param httpClient         - Optional HTTP client; defaults to an axios-backed client.
 * @param breaker            - Optional circuit breaker for the HTTP download.
 * @param microserviceClient - Optional pybctc client; defaults to pdfExtractorClient.
 * @returns PdfExtractionResult with text, confidence, and optional extraction_method.
 */
export async function downloadAndExtractPdf(
  url: string,
  httpClient?: HttpClient,
  breaker?: CircuitBreaker,
  microserviceClient?: PdfMicroserviceClient,
): Promise<PdfExtractionResult> {
  logger.debug("[pdf] downloading PDF", { url });

  try {
    // ── Step 1: Service-first extraction (1954c G5b inversion) ───────────────
    // Try the pybctc microservice FIRST. If it succeeds, return immediately —
    // no HTTP download or pdf-parse needed.
    try {
      const msClient =
        microserviceClient ?? (await makeDefaultMicroserviceClient());
      const microResult = await msClient.extract(url, "bctc");

      if (microResult !== null && microResult.status === "success") {
        const hasTables = microResult.tables.length > 0;
        const extraction_method = hasTables ? "pybctc_tables" : "pybctc_text";

        logger.info("[pdf] pybctc microservice extraction used (primary)", {
          url,
          extraction_method,
          tables: microResult.tables.length,
          chars: microResult.textContent.length,
          confidence: microResult.ocrConfidence,
        });

        return {
          text: microResult.textContent,
          confidence: microResult.ocrConfidence,
          extraction_method,
        };
      }

      logger.debug(
        "[pdf] pybctc returned null or failed — falling through to pdf-parse",
        { url },
      );
    } catch (msErr) {
      logger.debug(
        "[pdf] pybctc call threw — falling through to pdf-parse",
        {
          url,
          error: msErr instanceof Error ? msErr.message : String(msErr),
        },
      );
    }

    // ── Step 2: pdf-parse fallback (service unavailable) ─────────────────────
    const client = httpClient ?? (await makeDefaultHttpClient());

    // Task 1019: route the HTTP download through the circuit breaker (when
    // provided) so network-level failures are actually recorded against the
    // source breaker. Without this wrap the outer catch below swallowed
    // timeouts before breakers.ssc ever saw them.
    const binaryString = breaker
      ? await breaker.execute(() => client.get(url))
      : await client.get(url);
    // Convert the binary string back to a Buffer for pdf-parse
    const buffer = Buffer.from(binaryString, "binary");

    const result = await extractPdfText(buffer);

    logger.info("[pdf] download + extract complete (pdf-parse fallback)", {
      url,
      chars: result.text.length,
      confidence: result.confidence,
    });

    return result;
  } catch (err) {
    // FIX-1267: re-throw CircuitOpenError so callers (fetchParseAndStoreBctc)
    // can detect the open circuit and log/handle it explicitly instead of
    // treating it as a silent empty-text result.
    if (err instanceof CircuitOpenError) {
      throw err;
    }

    if (err instanceof Error) {
      const axiosCode = (err as Error & { code?: string }).code;

      // FIX-1267: axios timeout errors carry code='ECONNABORTED' or code='ETIMEDOUT'
      // (not name='TimeoutError' as previously checked). Re-throw so the circuit
      // breaker failure is visible to callers and the fallback path can fire.
      if (axiosCode === "ECONNABORTED" || axiosCode === "ETIMEDOUT") {
        throw err;
      }

      // Task 1294b (legacy): keep re-throwing native TimeoutError too, for
      // environments that use the fetch API instead of axios.
      if (err.name === "TimeoutError") {
        throw err;
      }
    }

    logger.error("[pdf] failed to download or extract PDF", {
      url,
      error: err instanceof Error ? err.message : String(err),
    });
    return { text: "", confidence: 0 };
  }
}
