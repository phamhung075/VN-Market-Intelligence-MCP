/**
 * Infrastructure — SSC Portal Scraper
 *
 * Fetches and parses the Vietnamese Securities Commission (SSC) disclosure
 * portal at congbothongtin.ssc.gov.vn to list financial reports for a given
 * listed company (identified by stock action code).
 *
 * Layer: infrastructure/fetchers — may use HTTP, must not import domain/.
 */

import * as cheerio from "cheerio";
import { logger } from "../logger.js";
import { breakers } from "../circuitBreakerRegistry.js";
import { CircuitOpenError } from "../circuitBreaker.js";

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
 */
function titleMatchesReportType(
  title: string,
  reportType: "quarterly" | "annual",
): boolean {
  const lower = title.toLowerCase();
  const keywords = reportType === "quarterly" ? QUARTERLY_KEYWORDS : ANNUAL_KEYWORDS;

  return keywords.some((kw) =>
    typeof kw === "string" ? lower.includes(kw) : kw.test(title),
  );
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
export async function listSscDocuments(
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
        // The size guard is SKIPPED when a custom httpClient is injected (test
        // mode) because test fixtures produce small HTML by design — they do not
        // simulate the real portal's JS-shell vs full-page size difference.
        if (!httpClient && html.length < SSC_MIN_CONTENT_BYTES) {
          logger.warn("[ssc] portal_js_only — SSC portal returned short response (JS shell?), no table data", {
            actionCode,
            reportType,
            year,
            url,
            responseBytes: html.length,
            hint: "Task 1035: implement ADF session simulation or alternative BCTC source",
          });
          return [];
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
