/**
 * Infrastructure — Fetchers barrel
 *
 * HTTP scrapers and data fetchers for external services:
 *   - SSC portal (congbothongtin.ssc.gov.vn) — Task 029
 *   - PDF downloader + pdf-parse extractor    — Task 030
 *   - RSS base parser + CafeF fetcher         — Task 021
 *   - VnExpress Finance RSS fetcher           — Task 022
 *   - Reuters / AP News RSS fetcher          — Task 023
 *   - HOSE market data fetcher (VnDirect)    — Task 026
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

// ── Task 021: RSS base parser + CafeF fetcher ─────────────────────────────────
export { parseRssFeed, type RssItem } from "./rss.js";
export { fetchCafeF } from "./cafef.js";

// ── Task 022: VnExpress Finance RSS fetcher ───────────────────────────────────
export { fetchVnExpress } from "./vnexpress.js";

// ── Task 023: Reuters / AP News RSS fetcher ────────────────────────────────────
export { fetchReuters } from "./reuters.js";

// ── Task 026: HOSE market data fetcher (VnDirect API) ─────────────────────────
export {
  fetchHosePrices,
  storeMarketPrices,
  getAvgVolume,
  buildVnDirectUrl,
  parseVnDirectResponse,
  type MarketPrice,
} from "./hose.js";

// ── Task 027: HNX + UPCOM market data fetcher ─────────────────────────────────
export {
  fetchHnxPrices,
  fetchUpcomPrices,
  buildHnxUrl,
  buildUpcomUrl,
  parseHnxResponse,
} from "./hnx.js";

// ── Task 024: Trading Economics macro indicator scraper ────────────────────────
export {
  fetchMacroIndicators,
  storeMacroIndicators,
  type MacroIndicators,
} from "./tradingEconomics.js";
