/**
 * Infrastructure — HOSE Exchange Disclosure Fetcher (hsx.vn)
 *
 * Fetches and parses BCTC disclosure listings from the HOSE (Ho Chi Minh
 * Stock Exchange) public portal. Used as a fallback when the SSC ADF portal
 * (sscPortal.ts) returns a JS-only shell with no PDF URLs.
 *
 * Split out of ssc.ts (FACTORY-INFRA-split-ssc-fetchers, 2026-07-24) —
 * pure structural move, no behavior change. `ssc.ts` re-exports the
 * pre-split public surface so existing call sites are unaffected.
 *
 * Note: intentionally NOT named `hose.ts` — that filename is already taken by
 * the unrelated HOSE market-prices fetcher (src/infrastructure/fetchers/hose.ts).
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
 * Resolves a HOSE-relative href to an absolute URL.
 */
function resolveHoseUrl(href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  const normalised = href.startsWith("/") ? href : `/${href}`;
  return `${HOSE_DISCLOSURE_BASE}${normalised}`;
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
