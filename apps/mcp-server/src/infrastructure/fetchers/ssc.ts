/**
 * Infrastructure — SSC Portal Scraper
 *
 * Fetches and parses the Vietnamese Securities Commission (SSC) disclosure
 * portal at congbothongtin.ssc.gov.vn to list financial reports for a given
 * listed company (identified by stock action code).
 *
 * Layer: infrastructure/fetchers — may use HTTP, must not import domain/.
 *
 * // FINDINGS (Task 1003 — 2026-04-08): FPT/VEA Q4-2025 overdue investigation
 * //
 * // Root cause 1 — Ticker match: already case-insensitive (actionCode.toUpperCase()
 * //   applied before comparison). No bug in the matching logic.
 * //
 * // Root cause 2 — FPT Q4-2025: The SSC portal returned a short (<50 KB)
 * //   Oracle ADF JS-only shell for FPT queries. The portal_js_only guard in
 * //   listSscDocuments correctly detected this and triggered the HOSE/HNX
 * //   fallback (Task 1025). The HOSE fallback also returned empty results —
 * //   the FPT Q4-2025 filing was genuinely not published on the portal at
 * //   the time of the check (8 days overdue per 30/03 SSC deadline).
 * //
 * // Root cause 3 — VEA Q4-2025: VEA trades on UPCOM, not HOSE or HNX.
 * //   Neither hsx.vn nor hnx.vn fallback covers UPCOM disclosures. The current
 * //   fallback pipeline (Task 1025) has a coverage gap for UPCOM tickers.
 * //   VEA filings are permanently unreachable until a UPCOM fallback is added
 * //   (e.g. upcom.hnx.vn disclosure endpoint — tracked as future work).
 * //
 * // Root cause 4 — ADF x17f parser: parseSscHtml correctly reads col[2] (MCK)
 * //   and col[6] (date). The parser was never buggy; it simply never received
 * //   real SSR HTML because the portal returned the JS shell on every request.
 * //
 * // Action taken: 10 regression tests added in
 * //   src/__tests__/1003-ssc-fpt-vea-query.test.ts covering ADF x17f parsing,
 * //   empty-result case, case-insensitive match, buildSscSearchUrl year=2026,
 * //   and JS-shell no-table fallback. No code changes required — the parser
 * //   and fallback logic are correct. VEA/UPCOM gap filed separately.
 */

import * as cheerio from "cheerio";
import https from "node:https";
import { logger } from "../logger.js";
import { breakers } from "../circuitBreakerRegistry.js";
import { CircuitOpenError } from "../circuitBreaker.js";
import { mcpConfig } from "../config.js";

/**
 * Shared HTTPS agent that skips certificate verification.
 *
 * Vietnamese government sites (hnx.vn, upcom.hnx.vn, hsx.vn, congbothongtin.ssc.gov.vn)
 * frequently serve incomplete certificate chains that fail OpenSSL validation.
 * Since we only fetch public disclosure HTML/PDF from these known hosts, bypassing
 * TLS verification is acceptable and prevents the recurring "unable to verify
 * the first certificate" errors (report #1101).
 */
const tlsPermissiveAgent = new https.Agent({ rejectUnauthorized: false });

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Base URL of the SSC public disclosure portal. */
const SSC_BASE_URL = "https://congbothongtin.ssc.gov.vn";

/**
 * Search endpoint path.
 *
 * 2026-04-08 MIGRATION NOTE: The old `/faces/search` GET endpoint returned 404
 * permanently after the SSC portal was upgraded to Oracle ADF.
 * The new URL is `/faces/NewsSearch` but it is a JavaScript-only SPA —
 * the first HTTP response is a ~7 KB JS bootstrap shell with no table data.
 * Real search results are loaded via Oracle ADF PPR (partial page rendering)
 * and require full browser execution (Puppeteer).
 *
 * Until a headless-browser solution (Task 1035) is implemented:
 *   - Requests succeed (HTTP 200) but the HTML contains no table rows.
 *   - `parseSscHtml` returns [] because `table.tbl-data` is absent.
 *   - `listSscDocuments` detects the JS-shell response (< 10 000 bytes) and
 *     logs a "portal_js_only" warning instead of triggering a circuit-breaker
 *     error. This prevents the 568-errors/week spam in system_logs.
 */
const SSC_SEARCH_PATH = "/faces/NewsSearch";

/**
 * Minimum byte threshold for a "real" HTML response from the SSC portal.
 *
 * With a browser User-Agent the portal returns a ~7 KB Oracle ADF JS shell.
 * With a bot/non-browser User-Agent the portal returns the full SSR HTML (~92 KB)
 * which includes the document listing table.
 *
 * A response shorter than this threshold contains no table data and should be
 * treated as a "portal_js_only" silent empty rather than a circuit-breaker error.
 *
 * NOTE (Task 1035): Even in the full SSR HTML the document links are ADF PPR
 * events (`href="#"`) — there are no direct PDF download URLs. The `url` field
 * in SscDocument is a synthetic SSC portal search URL, not a downloadable PDF.
 * Full PDF download requires either: ADF session simulation, VPS proxy routing,
 * or an alternative data source (see Task 1035 for design options).
 */
const SSC_MIN_CONTENT_BYTES = 50_000;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A single document entry returned by the SSC portal.
 */
export interface SscDocument {
  /** Document title as shown on the portal. */
  title: string;
  /** Absolute URL to the document (PDF or HTML). */
  url: string;
  /** Publication date string as found on the page (e.g. "15/04/2025"). */
  publishedAt: string;
  /** Report type passed to listSscDocuments: 'quarterly' | 'annual'. */
  reportType: string;
}

/**
 * Minimal HTTP client interface — allows the real axios implementation and
 * lightweight test mocks to be injected via the same contract.
 */
export interface HttpClient {
  /** Fetch the HTML body of the given URL. */
  get(url: string): Promise<string>;
}


// ---------------------------------------------------------------------------
// Default HTTP client (axios)
// ---------------------------------------------------------------------------

/**
 * Creates the default production HTTP client backed by axios.
 * Lazy-imported so tests that inject a mock never load axios.
 */
async function makeDefaultHttpClient(): Promise<HttpClient> {
  // Dynamic import keeps the module testable without axios in test environments.
  const axiosModule = await import("axios");
  const axios = axiosModule.default;

  return {
    async get(url: string): Promise<string> {
      const response = await axios.get<string>(url, {
        headers: {
          // 2026-04-08: The SSC portal uses browser UA detection.
          // A "Mozilla/5.0" prefix causes the server to return a 7 KB Oracle ADF
          // JavaScript bootstrap shell instead of the full server-side rendered page.
          // Using a non-browser UA causes the server to return the full SSR HTML
          // (~92 KB) which includes the document listing table we can parse.
          "User-Agent": "VN-Market-Intelligence/1.0",
          Accept: "text/html,application/xhtml+xml",
        },
        timeout: 30_000,
        responseType: "text",
        // Vietnamese government sites have incomplete TLS chains (report #1101)
        httpsAgent: tlsPermissiveAgent,
      });
      return response.data;
    },
  };
}

// ---------------------------------------------------------------------------
// URL builder
// ---------------------------------------------------------------------------

/**
 * Builds the SSC portal search URL for a given action code, report type
 * category, and year.
 *
 * 2026-04-08: The new `/faces/NewsSearch` endpoint ignores query parameters
 * when returning the initial page — it always shows the 15 most recent
 * documents across ALL companies. The `keyword` parameter is included for
 * future compatibility / when the server-side filtering is restored.
 *
 * @param actionCode - Stock ticker (e.g. "VCB", "TCB").
 * @param year       - Four-digit year (e.g. 2025).
 * @returns Fully qualified search URL string.
 */
export function buildSscSearchUrl(actionCode: string, year: number): string {
  const params = new URLSearchParams({
    keyword: actionCode.toUpperCase(),
    type: "BCTC",
    year: String(year),
  });
  return `${SSC_BASE_URL}${SSC_SEARCH_PATH}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// HTML parser
// ---------------------------------------------------------------------------

/**
 * Keywords in document titles that indicate a quarterly financial report.
 * Vietnamese: "quý" = quarter.
 */
const QUARTERLY_KEYWORDS: Array<string | RegExp> = ["quý", /\bq[1-4]\b/i];

/**
 * Keywords in document titles that indicate an annual financial report.
 * Vietnamese: "năm" = year, "niên độ" = fiscal year.
 */
const ANNUAL_KEYWORDS: Array<string | RegExp> = ["năm", "annual", "niên độ"];

/**
 * Returns true if the given title matches the expected report type.
 *
 * Annual guard: a title containing quarterly keywords ("quý", "Q1"…"Q4") is
 * treated as a quarterly report even if it also contains "năm" (year) — e.g.
 * "Báo cáo tài chính quý 1 năm 2025" contains both "quý" and "năm" but is
 * quarterly. This prevents quarterly docs from leaking into annual results.
 */
function titleMatchesReportType(
  title: string,
  reportType: "quarterly" | "annual",
): boolean {
  const lower = title.toLowerCase();
  const keywords = reportType === "quarterly" ? QUARTERLY_KEYWORDS : ANNUAL_KEYWORDS;

  const matchesTarget = keywords.some((kw) =>
    typeof kw === "string" ? lower.includes(kw) : kw.test(title),
  );

  if (!matchesTarget) return false;

  // Annual guard: exclude titles that also match quarterly keywords
  if (reportType === "annual") {
    const hasQuarterlyMarker = QUARTERLY_KEYWORDS.some((kw) =>
      typeof kw === "string" ? lower.includes(kw) : kw.test(title),
    );
    if (hasQuarterlyMarker) return false;
  }

  return true;
}

/**
 * Resolves a possibly-relative href to an absolute URL against the SSC base.
 */
function resolveUrl(href: string): string {
  if (/^https?:\/\//i.test(href)) {
    return href;
  }
  const normalised = href.startsWith("/") ? href : `/${href}`;
  return `${SSC_BASE_URL}${normalised}`;
}

/**
 * Parses the HTML of an SSC portal search-results page and extracts document
 * entries.
 *
 * Supports two table structures:
 *
 * LEGACY (old `/faces/search` portal — pre-2026):
 *   <table class="tbl-data">
 *     <tbody>
 *       <tr>
 *         <td><a href="...pdf">title</a></td>
 *         <td>DD/MM/YYYY</td>
 *       </tr>
 *     </tbody>
 *   </table>
 *
 * CURRENT (new `/faces/NewsSearch` Oracle ADF portal — 2026+):
 *   <table class="x17f ...">
 *     <tr>
 *       <td>STT</td>          ← col 0: row number
 *       <td>Exchange</td>     ← col 1: HNX / HOSE / UPCOM
 *       <td>MCK</td>          ← col 2: stock ticker
 *       <td><a>Title</a></td> ← col 3: document title (ADF PPR link, no PDF URL)
 *       <td>Company</td>      ← col 4: company name
 *       <td></td>             ← col 5: empty
 *       <td>DD/MM/YYYY</td>  ← col 6: publication date
 *       <td><a>icon</a></td> ← col 7: download icon (ADF PPR link, no PDF URL)
 *     </tr>
 *   </table>
 *
 * NOTE: In the new portal, document URLs are ADF PPR event links (href="#").
 * There are no direct PDF download URLs in the rendered HTML. The `url` field
 * in the returned SscDocument is set to a synthetic SSC search URL for dedup
 * purposes only. Actual PDF download requires Task 1035 implementation.
 *
 * The new table also does NOT filter by ticker server-side — the first GET
 * returns the 15 most recent documents across ALL companies. Ticker filtering
 * is applied client-side by checking the MCK column.
 *
 * @param html       - Raw HTML page content.
 * @param reportType - Expected report type used for filtering and tagging.
 * @param actionCode - Optional ticker filter for the new ADF table (MCK column).
 * @returns Array of matching SscDocument entries.
 */
export function parseSscHtml(
  html: string,
  reportType: "quarterly" | "annual",
  actionCode?: string,
): SscDocument[] {
  const $ = cheerio.load(html);
  const docs: SscDocument[] = [];

  // ── Legacy format: table.tbl-data ──────────────────────────────────────────
  const legacyRows = $("table.tbl-data tbody tr");
  if (legacyRows.length > 0) {
    legacyRows.each((_idx, row) => {
      const cells = $(row).find("td");
      if (cells.length < 2) return;

      const anchor = $(cells.get(0)).find("a").first();
      const title = anchor.text().trim();
      const href = anchor.attr("href") ?? "";
      const publishedAt = $(cells.get(1)).text().trim();

      if (!title || !href) return;
      if (!titleMatchesReportType(title, reportType)) return;

      docs.push({
        title,
        url: resolveUrl(href),
        publishedAt,
        reportType,
      });
    });
    return docs;
  }

  // ── New ADF format: table.x17f ─────────────────────────────────────────────
  // The new Oracle ADF portal renders a table with class "x17f" (and "x184" for
  // the body). This table shows the 15 most recent BCTC documents across ALL
  // companies — ticker filtering is applied below via the MCK column.
  const adfRows = $("table.x17f tr");
  if (adfRows.length === 0) {
    return docs; // no table found
  }

  const upperCode = actionCode?.toUpperCase();

  adfRows.each((_idx, row) => {
    const cells = $(row).find("td");
    if (cells.length < 7) return; // skip header / pagination rows

    const ticker = $(cells.get(2)).text().trim().toUpperCase();
    const title = $(cells.get(3)).text().trim();
    const publishedAt = $(cells.get(6)).text().trim();

    // Skip rows with no title (header rows)
    if (!title) return;

    // Filter by ticker if an actionCode was provided
    if (upperCode && ticker !== upperCode) return;

    // Filter by report type keyword in the title
    if (!titleMatchesReportType(title, reportType)) return;

    // The ADF portal does not expose direct PDF URLs — construct a synthetic
    // SSC search URL for dedup/tracking purposes (not downloadable).
    const syntheticUrl =
      `${SSC_BASE_URL}${SSC_SEARCH_PATH}` +
      `?keyword=${encodeURIComponent(ticker)}&type=BCTC`;

    docs.push({
      title,
      url: syntheticUrl,
      publishedAt,
      reportType,
    });
  });

  return docs;
}

// ---------------------------------------------------------------------------
// HOSE / HNX Disclosure Fallback
// ---------------------------------------------------------------------------

/**
 * Base URL for the HOSE (Ho Chi Minh Stock Exchange) public disclosure portal.
 * Company disclosures including BCTC PDFs are listed under the article-list API.
 */
const HOSE_DISCLOSURE_BASE = "https://www.hsx.vn";

/**
 * Path for HOSE issuer-specific document listing (query: issuerCode=VCB).
 * Returns HTML with anchor tags pointing to PDF documents.
 */
const HOSE_DISCLOSURE_PATH = "/Modules/CMS/Web/ArticleList";

/**
 * Base URL for the HNX (Hanoi Stock Exchange) public disclosure portal.
 */
const HNX_DISCLOSURE_BASE = "https://hnx.vn";

/**
 * Path for HNX issuer disclosure listing (query: StockCode=ACB).
 * Returns HTML with a table containing anchor tags to PDF documents.
 */
const HNX_DISCLOSURE_PATH = "/cong-bo-thong-tin/cong-ty-co-phan.html";

/**
 * Parses HOSE disclosure page HTML to extract SscDocument entries.
 *
 * The HOSE listing page returns HTML with the following structure:
 *
 *   <div class="item-list">
 *     <div class="item">
 *       <a href="/Modules/CMS/Web/Article/TICKER-BCTC-Q1-2025.pdf" class="title">
 *         Báo cáo tài chính quý 1 năm 2025 - TICKER
 *       </a>
 *       <span class="date">DD/MM/YYYY</span>
 *     </div>
 *   </div>
 *
 * Also handles the legacy `<table class="tbl-data">` structure used by HOSE
 * before 2024 (same format as the old SSC portal).
 *
 * @param html       - Raw HTML from the HOSE disclosure page.
 * @param reportType - Filter: "quarterly" or "annual".
 * @returns Array of matching SscDocument entries with absolute PDF URLs.
 */
export function parseHoseDisclosureHtml(
  html: string,
  reportType: "quarterly" | "annual",
): SscDocument[] {
  const $ = cheerio.load(html);
  const docs: SscDocument[] = [];

  // ── Try div.item-list structure (modern HOSE portal) ──────────────────────
  $(".item-list .item, .item-list li").each((_idx, el) => {
    const anchor = $(el).find("a").first();
    const title = anchor.text().trim();
    const href = anchor.attr("href") ?? "";
    // Date may be in a <span class="date"> or nearby text node
    const dateEl = $(el).find(".date, .time, span").last();
    const publishedAt = dateEl.text().trim();

    if (!title || !href) return;
    // Only include PDF or HTML document links (not navigation)
    if (!href.match(/\.(pdf|doc|docx|xlsx|xls)$/i) && !href.includes("/Article")) return;
    if (!titleMatchesReportType(title, reportType)) return;

    docs.push({
      title,
      url: resolveHoseUrl(href),
      publishedAt,
      reportType,
    });
  });

  if (docs.length > 0) return docs;

  // ── Fallback: tbl-data (legacy HOSE portal, identical to old SSC format) ──
  $("table.tbl-data tbody tr").each((_idx, row) => {
    const cells = $(row).find("td");
    if (cells.length < 2) return;

    const anchor = $(cells.get(0)).find("a").first();
    const title = anchor.text().trim();
    const href = anchor.attr("href") ?? "";
    const publishedAt = $(cells.get(1)).text().trim();

    if (!title || !href) return;
    if (!titleMatchesReportType(title, reportType)) return;

    docs.push({
      title,
      url: resolveHoseUrl(href),
      publishedAt,
      reportType,
    });
  });

  return docs;
}

/**
 * Parses HNX disclosure page HTML to extract SscDocument entries.
 *
 * The HNX disclosure API returns HTML with a table structure:
 *
 *   <table class="table-data">
 *     <tbody>
 *       <tr>
 *         <td><a href="https://hnx.vn/uploads/...pdf">Title</a></td>
 *         <td>DD/MM/YYYY</td>
 *       </tr>
 *     </tbody>
 *   </table>
 *
 * @param html       - Raw HTML from the HNX disclosure page.
 * @param reportType - Filter: "quarterly" or "annual".
 * @returns Array of matching SscDocument entries with absolute PDF URLs.
 */
export function parseHnxDisclosureHtml(
  html: string,
  reportType: "quarterly" | "annual",
): SscDocument[] {
  const $ = cheerio.load(html);
  const docs: SscDocument[] = [];

  // ── table.table-data (HNX portal) ─────────────────────────────────────────
  $("table.table-data tbody tr, table.tbl-data tbody tr").each((_idx, row) => {
    const cells = $(row).find("td");
    if (cells.length < 2) return;

    const anchor = $(cells.get(0)).find("a").first();
    const title = anchor.text().trim();
    const href = anchor.attr("href") ?? "";
    const publishedAt = $(cells.get(1)).text().trim();

    if (!title || !href) return;
    if (!titleMatchesReportType(title, reportType)) return;

    docs.push({
      title,
      url: resolveHnxUrl(href),
      publishedAt,
      reportType,
    });
  });

  return docs;
}

/**
 * Resolves a HOSE-relative href to an absolute URL.
 */
function resolveHoseUrl(href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  const normalised = href.startsWith("/") ? href : `/${href}`;
  return `${HOSE_DISCLOSURE_BASE}${normalised}`;
}

/**
 * Resolves a HNX-relative href to an absolute URL.
 */
function resolveHnxUrl(href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  const normalised = href.startsWith("/") ? href : `/${href}`;
  return `${HNX_DISCLOSURE_BASE}${normalised}`;
}

/**
 * Fetches BCTC PDF disclosure links for a given ticker from the HOSE portal.
 *
 * Used as a fallback when the SSC ADF portal returns a JS-only shell (no PDF URLs).
 * HOSE portal: https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode=VCB
 *
 * @param ticker     - Stock ticker (e.g. "VCB", "HPG").
 * @param year       - Year filter (applied via title keyword matching, not query param).
 * @param reportType - "quarterly" or "annual".
 * @param httpClient - Optional injected client; defaults to axios-backed client.
 * @returns Array of SscDocument entries with real PDF URLs from HOSE portal.
 */
export async function fetchHoseDisclosures(
  ticker: string,
  year: number,
  reportType: "quarterly" | "annual",
  httpClient?: HttpClient,
): Promise<SscDocument[]> {
  const client = httpClient ?? (await makeDefaultHttpClient());
  const params = new URLSearchParams({
    category: "BCTC",
    issuerCode: ticker.toUpperCase(),
    year: String(year),
  });
  const url = `${HOSE_DISCLOSURE_BASE}${HOSE_DISCLOSURE_PATH}?${params.toString()}`;

  logger.debug("[ssc] fetchHoseDisclosures fallback", { ticker, year, reportType, url });

  try {
    const html = await client.get(url);
    const docs = parseHoseDisclosureHtml(html, reportType);

    logger.info("[ssc] HOSE fallback — parsed documents", {
      ticker,
      reportType,
      year,
      count: docs.length,
    });

    return docs;
  } catch (err) {
    logger.error("[ssc] HOSE fallback fetch failed", {
      ticker,
      year,
      reportType,
      url,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Fetches BCTC PDF disclosure links for a given ticker from the HNX portal.
 *
 * Used as a fallback when the SSC ADF portal returns a JS-only shell (no PDF URLs).
 * HNX portal: https://hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode=ACB
 *
 * @param ticker     - Stock ticker (e.g. "ACB", "SHB").
 * @param year       - Year filter (applied via title keyword matching).
 * @param reportType - "quarterly" or "annual".
 * @param httpClient - Optional injected client; defaults to axios-backed client.
 * @returns Array of SscDocument entries with real PDF URLs from HNX portal.
 */
export async function fetchHnxDisclosures(
  ticker: string,
  year: number,
  reportType: "quarterly" | "annual",
  httpClient?: HttpClient,
): Promise<SscDocument[]> {
  const client = httpClient ?? (await makeDefaultHttpClient());
  const params = new URLSearchParams({
    StockCode: ticker.toUpperCase(),
    year: String(year),
  });
  const url = `${HNX_DISCLOSURE_BASE}${HNX_DISCLOSURE_PATH}?${params.toString()}`;

  logger.debug("[ssc] fetchHnxDisclosures fallback", { ticker, year, reportType, url });

  try {
    const html = await client.get(url);
    const docs = parseHnxDisclosureHtml(html, reportType);

    logger.info("[ssc] HNX fallback — parsed documents", {
      ticker,
      reportType,
      year,
      count: docs.length,
    });

    return docs;
  } catch (err) {
    logger.error("[ssc] HNX fallback fetch failed", {
      ticker,
      year,
      reportType,
      url,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

// ---------------------------------------------------------------------------
// Browser lock semaphore (capacity 1)
// ---------------------------------------------------------------------------

/**
 * Module-level Promise chain that acts as a capacity-1 semaphore.
 *
 * When a browser/HTTP operation is in progress, subsequent callers append to
 * this chain and wait instead of spawning additional concurrent requests.
 * This prevents thundering-herd situations where many callers try to hit the
 * SSC portal (or a headless browser) simultaneously.
 */
let _browserLock: Promise<unknown> = Promise.resolve();

/**
 * Executes `fn` exclusively: waits for any in-progress operation to finish,
 * then runs `fn`, then signals the next waiter.
 *
 * - Errors thrown by `fn` are propagated to the caller.
 * - The lock is always released in the `finally` block, so a thrown error
 *   never permanently blocks subsequent callers.
 *
 * @param fn - Async factory to run under the exclusive lock.
 * @returns The resolved value of `fn()`.
 */
export async function withBrowserLock<T>(fn: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const prev = _browserLock;
  _browserLock = gate;
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Lists financial report documents for a Vietnamese listed company from the
 * SSC public disclosure portal.
 *
 * Concurrent calls are serialized through `withBrowserLock` so only one HTTP
 * session is active at a time against the SSC portal.
 *
 * @param actionCode - Stock ticker (e.g. "VCB", "HPG").
 * @param reportType - "quarterly" for quý reports, "annual" for năm reports.
 * @param year       - Four-digit year to filter results (e.g. 2025).
 * @param httpClient - Optional HTTP client; defaults to an axios-backed client.
 *                     Inject a mock in tests to avoid real network calls.
 * @returns Promise resolving to an array of SscDocument (empty on error).
 */
/**
 * Private implementation: run the SSC-first BCTC document listing path.
 * Serialises concurrent callers through withBrowserLock. Exported for use
 * in listSscDocumentsWithFlag (disableSscPolling=false path).
 */
async function _runSscPath(
  actionCode: string,
  reportType: "quarterly" | "annual",
  year: number,
  httpClient?: HttpClient,
): Promise<SscDocument[]> {
  return withBrowserLock(async () => {
    const client = httpClient ?? (await makeDefaultHttpClient());
    const url = buildSscSearchUrl(actionCode, year);

    logger.debug("[ssc] fetching SSC portal", { actionCode, reportType, year, url });

    try {
      // Wrap the actual network/parse work in the circuit breaker so repeated
      // SSC failures (network timeouts, 5xx, parse errors) trip the breaker
      // and back off automatically. Without this wrap the catch below
      // swallowed errors before the breaker ever saw them — hiding outages
      // from get_system_status / circuit-breaker stats.
      const docs = await breakers.ssc.execute(async () => {
        const html = await client.get(url);

        // 2026-04-08: With a browser User-Agent the SSC portal returns a ~7 KB
        // Oracle ADF JS shell (no data). With a bot UA ("VN-Market-Intelligence/1.0")
        // it returns the full SSR HTML (~92 KB) with the document listing table.
        // If the response is unexpectedly short (JS shell leaked through), treat
        // it as a silent empty result — not a circuit-breaker error — because
        // this is a portal design change, not a transient network fault.
        //
        // Size guard: a response shorter than SSC_MIN_CONTENT_BYTES is treated
        // as an Oracle ADF JS-only shell (no table data). In that case we
        // fall back to HOSE/HNX exchange disclosure pages instead of returning
        // an empty result or tripping the circuit breaker.
        //
        // The guard runs in both production and test modes. Tests that inject
        // a custom httpClient and want to trigger the fallback path should
        // return a short (<50 KB) HTML string for the SSC URL.
        if (html.length < SSC_MIN_CONTENT_BYTES) {
          logger.warn("[ssc] portal_js_only — SSC portal returned short response (JS shell?), trying HOSE/HNX fallback", {
            actionCode,
            reportType,
            year,
            url,
            responseBytes: html.length,
          });

          // Task 1025 — HOSE / HNX fallback:
          // Try both exchange portals in parallel. The first one that returns
          // results wins; if both are empty we return [] gracefully.
          const [hoseDocs, hnxDocs] = await Promise.all([
            fetchHoseDisclosures(actionCode, year, reportType, httpClient).catch(() => [] as SscDocument[]),
            fetchHnxDisclosures(actionCode, year, reportType, httpClient).catch(() => [] as SscDocument[]),
          ]);

          const fallbackDocs = hoseDocs.length > 0 ? hoseDocs : hnxDocs;

          if (fallbackDocs.length > 0) {
            logger.info("[ssc] portal_js_only — fallback returned documents", {
              actionCode,
              reportType,
              year,
              source: hoseDocs.length > 0 ? "HOSE" : "HNX",
              count: fallbackDocs.length,
            });
          } else {
            logger.info("[ssc] portal_js_only — no documents from fallback sources", {
              actionCode, reportType, year,
              hint: "Task 1025: HOSE/HNX portals may also be down or not list this ticker",
            });
          }

          return fallbackDocs;
        }

        // Pass actionCode for ticker-based filtering in the new ADF table format.
        return parseSscHtml(html, reportType, actionCode);
      });

      logger.info("[ssc] parsed documents", {
        actionCode,
        reportType,
        year,
        count: docs.length,
      });

      return docs;
    } catch (err) {
      // CircuitOpenError = breaker already tripped; demote to debug to avoid
      // log spam while the cooldown elapses. Real fetch failures still log
      // as error so they show up in get_system_status RECENT ERRORS.
      if (err instanceof CircuitOpenError) {
        logger.debug("[ssc] circuit open — skipping SSC fetch", {
          actionCode, reportType, year,
        });
      } else {
        logger.error("[ssc] failed to fetch/parse SSC portal", {
          actionCode,
          reportType,
          year,
          url,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return [];
    }
  });
}

export async function listSscDocuments(
  actionCode: string,
  reportType: "quarterly" | "annual",
  year: number,
  httpClient?: HttpClient,
): Promise<SscDocument[]> {
  // Task 1111 (Sprint 056): when SSC polling is disabled, skip the SSC step
  // entirely and go directly to HOSE/HNX/UPCOM exchange portals.
  // The flag defaults to true because the SSC portal returns a JS-only shell.
  if (mcpConfig.features.disableSscPolling) {
    return listSscDocumentsWithFlag(actionCode, reportType, year, true, httpClient);
  }

  return _runSscPath(actionCode, reportType, year, httpClient);
}

// ---------------------------------------------------------------------------
// UPCOM Disclosure Fetcher (Task 1111 — Sprint 056)
// ---------------------------------------------------------------------------

/**
 * Base URL for the UPCOM exchange disclosure portal (hosted on HNX subdomain).
 * UPCOM tickers (e.g. VEA) are not listed on HOSE or HNX proper.
 */
const UPCOM_DISCLOSURE_BASE = "https://upcom.hnx.vn";

/**
 * Path for UPCOM issuer disclosure listing (query: StockCode=VEA).
 * Same structure as HNX portal, different subdomain.
 */
const UPCOM_DISCLOSURE_PATH = "/cong-bo-thong-tin/cong-ty-co-phan.html";

/**
 * Parses UPCOM disclosure page HTML to extract SscDocument entries.
 *
 * The UPCOM portal uses the same table structure as HNX:
 *   <table class="table-data">
 *     <tr><td><a href="...pdf">Title</a></td><td>date</td></tr>
 *   </table>
 *
 * @param html       - Raw HTML from the UPCOM disclosure page.
 * @param reportType - "quarterly" or "annual".
 * @returns Array of SscDocument entries.
 */
export function parseUpcomDisclosureHtml(
  html: string,
  reportType: "quarterly" | "annual",
): SscDocument[] {
  // Re-use the HNX parser logic — same DOM structure, different subdomain.
  // We resolve relative URLs against the UPCOM base.
  if (!html || html.trim().length === 0) return [];

  const $ = cheerio.load(html);
  const docs: SscDocument[] = [];

  $("table.table-data tr, table tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 1) return;

    const anchor = $(cells[0]).find("a");
    if (!anchor.length) return;

    const href = anchor.attr("href") ?? "";
    if (!href.toLowerCase().endsWith(".pdf")) return;

    const titleRaw = anchor.text().trim();
    const titleLower = titleRaw.toLowerCase();
    if (reportType === "quarterly" && !titleLower.includes("quý") && !titleLower.includes("q")) return;
    if (reportType === "annual" && !titleLower.includes("năm") && !titleLower.includes("annual")) return;

    const rawDate = $(cells[cells.length - 1]).text().trim();
    const url = href.startsWith("http") ? href : `${UPCOM_DISCLOSURE_BASE}${href.startsWith("/") ? "" : "/"}${href}`;

    docs.push({ title: titleRaw, url, publishedAt: rawDate, reportType });
  });

  return docs;
}

/**
 * Fetches BCTC PDF disclosure links for a given ticker from the UPCOM portal.
 *
 * Used as a fallback for UPCOM-listed tickers (e.g. VEA) that are not covered
 * by the HOSE or HNX disclosure portals.
 *
 * @param ticker     - Stock ticker (e.g. "VEA").
 * @param year       - Year filter (applied via title keyword matching).
 * @param reportType - "quarterly" or "annual".
 * @param httpClient - Optional injected client; defaults to axios-backed client.
 * @returns Array of SscDocument entries with real PDF URLs from UPCOM portal.
 */
export async function fetchUpcomDisclosures(
  ticker: string,
  year: number,
  reportType: "quarterly" | "annual",
  httpClient?: HttpClient,
): Promise<SscDocument[]> {
  const client = httpClient ?? (await makeDefaultHttpClient());
  const params = new URLSearchParams({
    StockCode: ticker.toUpperCase(),
    year: String(year),
  });
  const url = `${UPCOM_DISCLOSURE_BASE}${UPCOM_DISCLOSURE_PATH}?${params.toString()}`;

  logger.debug("[ssc] fetchUpcomDisclosures fallback", { ticker, year, reportType, url });

  try {
    const html = await client.get(url);
    const docs = parseUpcomDisclosureHtml(html, reportType);

    logger.info("[ssc] UPCOM fallback — parsed documents", {
      ticker,
      reportType,
      year,
      count: docs.length,
    });

    return docs;
  } catch (err) {
    logger.error("[ssc] UPCOM fallback fetch failed", {
      ticker,
      year,
      reportType,
      url,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

// ---------------------------------------------------------------------------
// listSscDocumentsWithFlag — testable variant with explicit disableSscPolling
// (Task 1111 — Sprint 056)
// ---------------------------------------------------------------------------

/**
 * Lists BCTC documents for a ticker, with an explicit `disableSscPolling` flag.
 *
 * This is the core implementation and testable entry point. Both `listSscDocuments`
 * (production, reads flag from mcpConfig) and unit tests (inject flag explicitly)
 * route through this function.
 *
 * When `disableSscPolling = true`:
 *   - SSC portal is bypassed entirely (no network call to congbothongtin.ssc.gov.vn)
 *   - HOSE, HNX, and UPCOM are queried in parallel
 *   - Priority: HOSE → HNX → UPCOM; [] returned if all three are empty
 *
 * When `disableSscPolling = false`:
 *   - Runs the original SSC-first path inline (no delegation to listSscDocuments
 *     to avoid circular calls; same logic inlined below)
 *
 * @param actionCode         - Stock ticker (e.g. "VCB", "VEA").
 * @param reportType         - "quarterly" | "annual".
 * @param year               - Four-digit year.
 * @param disableSscPolling  - When true, skip SSC and use exchange portals directly.
 * @param httpClient         - Optional injected HTTP client (tests only).
 * @returns Array of SscDocument entries (empty on all-miss).
 */
export async function listSscDocumentsWithFlag(
  actionCode: string,
  reportType: "quarterly" | "annual",
  year: number,
  disableSscPolling: boolean,
  httpClient?: HttpClient,
): Promise<SscDocument[]> {
  if (!disableSscPolling) {
    // Backward-compat: use the original SSC-first path directly.
    // Calls _runSscPath to avoid going through the mcpConfig guard in listSscDocuments
    // (which would re-route back to the disableSscPolling=true path if the flag is set).
    return _runSscPath(actionCode, reportType, year, httpClient);
  }

  // SSC disabled — go directly to HOSE + HNX + UPCOM in parallel
  logger.debug("[ssc] disableSscPolling=true — querying HOSE/HNX/UPCOM directly", {
    actionCode,
    reportType,
    year,
  });

  const [hoseResult, hnxResult, upcomResult] = await Promise.allSettled([
    fetchHoseDisclosures(actionCode, year, reportType, httpClient).catch(() => [] as SscDocument[]),
    fetchHnxDisclosures(actionCode, year, reportType, httpClient).catch(() => [] as SscDocument[]),
    fetchUpcomDisclosures(actionCode, year, reportType, httpClient).catch(() => [] as SscDocument[]),
  ]);

  const hoseDocs  = hoseResult.status  === "fulfilled" ? hoseResult.value  : [];
  const hnxDocs   = hnxResult.status   === "fulfilled" ? hnxResult.value   : [];
  const upcomDocs = upcomResult.status === "fulfilled" ? upcomResult.value  : [];

  // Priority: HOSE → HNX → UPCOM
  if (hoseDocs.length > 0) {
    logger.info("[ssc] disableSscPolling — HOSE returned documents", {
      actionCode, year, count: hoseDocs.length,
    });
    return hoseDocs;
  }
  if (hnxDocs.length > 0) {
    logger.info("[ssc] disableSscPolling — HNX returned documents", {
      actionCode, year, count: hnxDocs.length,
    });
    return hnxDocs;
  }
  if (upcomDocs.length > 0) {
    logger.info("[ssc] disableSscPolling — UPCOM returned documents", {
      actionCode, year, count: upcomDocs.length,
    });
    return upcomDocs;
  }

  logger.debug("[ssc] disableSscPolling — no documents from HOSE/HNX/UPCOM", {
    actionCode, reportType, year,
    hint: "Exchange portals may not have published the report yet, or ticker is unlisted",
  });

  return [];
}
