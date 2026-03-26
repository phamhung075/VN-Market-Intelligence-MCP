/**
 * Infrastructure — Fetchers barrel
 *
 * HTTP scrapers and data fetchers for external services:
 *   - SSC portal (congbothongtin.ssc.gov.vn) — Task 029
 *   - PDF downloader + pdf-parse extractor    — Task 030
 */

// ── Task 029: SSC portal scraper ─────────────────────────────────────────────
export {
  listSscDocuments,
  buildSscSearchUrl,
  parseSscHtml,
  type SscDocument,
  type HttpClient,
} from "./ssc.js";

// ── Task 030: PDF downloader + text extractor ─────────────────────────────────
export {
  extractPdfText,
  downloadAndExtractPdf,
  PDF_CONFIDENCE_HIGH_THRESHOLD,
  type PdfExtractionResult,
} from "./pdf.js";
