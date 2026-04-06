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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Base URL of the SSC public disclosure portal. */
const SSC_BASE_URL = "https://congbothongtin.ssc.gov.vn";

/**
 * Search endpoint path.
 * The portal accepts query parameters:
 *   - keyword : stock action code (e.g. "VCB")
 *   - type    : document category (e.g. "BCTC")
 *   - year    : four-digit year
 */
const SSC_SEARCH_PATH = "/faces/search";

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
          "User-Agent":
            "Mozilla/5.0 (compatible; VN-Market-Intelligence/1.0; +https://github.com/vn-market)",
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
 * entries from the `.tbl-data` table.
 *
 * Table structure assumed:
 *   <table class="tbl-data">
 *     <tbody>
 *       <tr>
 *         <td><a href="...">title</a></td>
 *         <td>DD/MM/YYYY</td>   ← publication date
 *       </tr>
 *     </tbody>
 *   </table>
 *
 * @param html       - Raw HTML page content.
 * @param reportType - Expected report type used for filtering and tagging.
 * @returns Array of matching SscDocument entries.
 */
export function parseSscHtml(
  html: string,
  reportType: "quarterly" | "annual",
): SscDocument[] {
  const $ = cheerio.load(html);
  const docs: SscDocument[] = [];

  $("table.tbl-data tbody tr").each((_idx, row) => {
    const cells = $(row).find("td");
    if (cells.length < 2) return;

    const anchor = $(cells.get(0)).find("a").first();
    const title = anchor.text().trim();
    const href = anchor.attr("href") ?? "";
    const publishedAt = $(cells.get(1)).text().trim();

    // Skip rows with no title or href
    if (!title || !href) return;

    // Filter by report type keyword in the title
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
      const html = await client.get(url);
      const docs = parseSscHtml(html, reportType);

      logger.info("[ssc] parsed documents", {
        actionCode,
        reportType,
        year,
        count: docs.length,
      });

      return docs;
    } catch (err) {
      logger.error("[ssc] failed to fetch/parse SSC portal", {
        actionCode,
        reportType,
        year,
        url,
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  });
}
