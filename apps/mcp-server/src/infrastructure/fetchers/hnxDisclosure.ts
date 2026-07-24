/**
 * Infrastructure — HNX Exchange Disclosure Fetcher (hnx.vn)
 *
 * Fetches and parses BCTC disclosure listings from the HNX (Hanoi Stock
 * Exchange) public portal. Used as a fallback when the SSC ADF portal
 * (sscPortal.ts) returns a JS-only shell with no PDF URLs.
 *
 * Split out of ssc.ts (FACTORY-INFRA-split-ssc-fetchers, 2026-07-24) —
 * pure structural move, no behavior change. `ssc.ts` re-exports the
 * pre-split public surface so existing call sites are unaffected.
 *
 * Note: intentionally NOT named `hnx.ts` — that filename is already taken by
 * the unrelated HNX/UPCOM market-prices fetcher (src/infrastructure/fetchers/hnx.ts).
 *
 * Layer: infrastructure/fetchers — may use HTTP, must not import domain/.
 */

import * as cheerio from "cheerio";
import { logger } from "../logger.js";
import type { HttpClient, SscDocument } from "./sscCommon.js";
import { makeDefaultHttpClient, titleMatchesReportType } from "./sscCommon.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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
 * Resolves a HNX-relative href to an absolute URL.
 */
function resolveHnxUrl(href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  const normalised = href.startsWith("/") ? href : `/${href}`;
  return `${HNX_DISCLOSURE_BASE}${normalised}`;
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
