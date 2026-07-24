/**
 * Infrastructure — UPCOM Exchange Disclosure Fetcher (upcom.hnx.vn)
 *
 * Fetches and parses BCTC disclosure listings from the UPCOM exchange portal
 * (hosted on the HNX subdomain). UPCOM tickers (e.g. VEA) are not listed on
 * HOSE or HNX proper, so this is a distinct fallback source (Task 1111 —
 * Sprint 056).
 *
 * Split out of ssc.ts (FACTORY-INFRA-split-ssc-fetchers, 2026-07-24) —
 * pure structural move, no behavior change. `ssc.ts` re-exports the
 * pre-split public surface so existing call sites are unaffected.
 *
 * Layer: infrastructure/fetchers — may use HTTP, must not import domain/.
 */

import * as cheerio from "cheerio";
import { logger } from "../logger.js";
import type { HttpClient, SscDocument } from "./sscCommon.js";
import { makeDefaultHttpClient } from "./sscCommon.js";

// ---------------------------------------------------------------------------
// Constants
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
