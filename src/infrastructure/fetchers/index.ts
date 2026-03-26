/**
 * Infrastructure — Fetchers barrel
 *
 * HTTP scrapers and data fetchers for external services:
 *   - SSC portal (congbothongtin.ssc.gov.vn) — Task 029
 *   - PDF downloader + pdf-parse extractor    — Task 030 (pending)
 */

// ── Task 029: SSC portal scraper ─────────────────────────────────────────────
export {
  listSscDocuments,
  buildSscSearchUrl,
  parseSscHtml,
  type SscDocument,
  type HttpClient,
} from "./ssc.js";
