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
 *   - Yahoo Finance commodity fetcher        — Task 025
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

// ── Task 023: Reuters / AP News RSS fetcher — DEPRECATED (G5, Phase 1) ───────
// fetchReuters removed — superseded by news-fetch microservice (port 5008).
// See apps/mcp-server/src/_deprecated/fetchers/reuters.ts for rollback reference.

// ── VnEconomy RSS fetcher ───────────────────────────────────────────────────
export { fetchVnEconomy } from "./vneconomy.js";

// ── Trading Economics global news stream ────────────────────────────────────
export { fetchTradingEconomicsStream } from "./tradingEconomicsStream.js";

// ── Task 026: HOSE market data fetcher (VnDirect API) ─────────────────────────
export {
  fetchHosePrices,
  fetchVnIndex,
  fetchFromVnDirectStockPrices,
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
  fetchMacroIndicatorsWithFallback,
  storeMacroIndicators,
  type MacroIndicators,
} from "./tradingEconomics.js";

// ── Task 1798: Trading Economics Playwright/Chromium scraper ──────────────────
export {
  fetchTradingEconomicsChromium,
  playwrightScrape,
  type TeChromiumDeps,
  type TeCacheEntry,
} from "./tradingEconomicsChromium.js";

// ── Task 025: Yahoo Finance commodity fetcher ──────────────────────────────────
export {
  fetchYahooFinancePrices,
  storeCommoditySnapshot,
  type CommoditySnapshot,
} from "./yahooFinance.js";

// ── Task 028: SBV (State Bank of Vietnam) macro fetcher ───────────────────────
export {
  fetchSbvRates,
  storeSbvSnapshot,
  type SbvMacroSnapshot,
} from "./sbv.js";

// ── Task 164: Polymarket REST fetcher ─────────────────────────────────────────
export {
  fetchPolymarkets,
  storePolymarketSnapshot,
  type PolyFetchFn,
} from "./polymarket.js";

// ── Task 1423b: FRED API Fed Funds Rate fetcher ────────────────────────────────
export {
  fetchFedFundsRate,
  type FredHttpClient,
} from "./fredApi.js";

// ── Task 1879a: FRED EFFR + IORB daily series fetcher ────────────────────────
export {
  fetchFredEffrIorb,
  type FredDailyRow,
  type FetchFredEffrIorbResult,
} from "./fredEffrIorb.js";

// ── Task 1910a: FRED ISM Manufacturing sub-component fetcher ─────────────────
export {
  fetchFredIsmSubcomponents,
  buildFredIsmUrl,
  parseFredIsmJson,
  ISM_SERIES,
  type IsmSeriesId,
  type IsmFetchResult,
} from "./fredIsmSubcomponents.js";

// ── Sprint 1813: BCTC discovery HTTP fetch adapter ────────────────────────────
export { bctcHttpFetch } from "./bctcHttpFetcher.js";

// ── FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE: shared bounded-fetch utility ──────────
export {
  withDeadline,
  macroFetch,
  DeadlineError,
  type DegradeEnvelope,
} from "./fetchDeadline.js";
