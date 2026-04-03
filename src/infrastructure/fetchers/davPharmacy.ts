/**
 * DAV Pharmacy Fetcher — Task 269
 *
 * Scrapes the Cục Quản lý Dược (DAV) website (dav.gov.vn) for:
 *   - New drug registrations / marketing authorisations
 *   - Drug price ceiling changes
 *
 * Design:
 *   - Uses Cheerio for HTML parsing (no headless browser needed)
 *   - Injects manufacturer → stock code mapping from pharmaEventMapper
 *   - Never throws: all errors are caught and logged, returns []
 *   - HttpClient is injected for testability (avoid real network in tests)
 *
 * Layer: infrastructure/fetchers — may NOT import from domain/ business logic.
 *        (Manufacturer→stock mapping is duplicated here to keep the boundary clean.)
 */

import * as cheerio from "cheerio";
import { logger } from "../logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/** Injectable HTTP client interface (same pattern as ssc.ts). */
export interface HttpClient {
  get(url: string): Promise<string>;
}

/**
 * A drug approval record returned by the DAV fetcher.
 *
 * @property drugName            - Drug name / trade name
 * @property manufacturer        - Manufacturer name as listed by DAV
 * @property registrationNumber  - DAV registration number (e.g. SD-1234/24)
 * @property approvalDate        - ISO date string or empty string
 * @property category            - Drug category: generic | branded | biosimilar | unknown
 * @property relatedStocks       - Stock codes inferred from manufacturer name
 */
export interface DrugApproval {
  drugName: string;
  manufacturer: string;
  registrationNumber: string;
  approvalDate: string;
  category: "generic" | "branded" | "biosimilar" | "unknown";
  relatedStocks: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Primary DAV drug registration listing URL */
const DAV_BASE_URL = "https://dav.gov.vn";
const DAV_DRUG_REGISTRY_URL = `${DAV_BASE_URL}/thuoc-trong-nuoc/thuoc-duoc-cap-so-dang-ky.html`;

/**
 * Manufacturer keyword → stock code mapping (infrastructure-layer copy).
 * Kept in sync with pharmaEventMapper.ts — lower-case keys for matching.
 */
const MANUFACTURER_STOCK_MAP: Record<string, string> = {
  "dược hậu giang": "DHG",
  "hậu giang": "DHG",
  dhg: "DHG",
  imexpharm: "IMP",
  "dược bình định": "DBD",
  bidiphar: "DBD",
  pymepharco: "PME",
  traphaco: "TRA",
  "dược phẩm opc": "OPC",
  opc: "OPC",
};

// ─────────────────────────────────────────────────────────────────────────────
// Default HTTP client
// ─────────────────────────────────────────────────────────────────────────────

async function makeDefaultHttpClient(): Promise<HttpClient> {
  const axiosModule = await import("axios");
  const axios = axiosModule.default;

  return {
    async get(url: string): Promise<string> {
      const response = await axios.get<string>(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,*/*",
          "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
        },
        timeout: 20_000,
        responseType: "text",
      });
      return response.data;
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Infer stock codes from a manufacturer name string.
 */
function inferStocks(manufacturer: string): string[] {
  const lower = manufacturer.toLowerCase();
  const found = new Set<string>();
  for (const [keyword, code] of Object.entries(MANUFACTURER_STOCK_MAP)) {
    if (lower.includes(keyword)) {
      found.add(code);
    }
  }
  return Array.from(found);
}

/**
 * Infer drug category from row text.
 */
function inferCategory(text: string): DrugApproval["category"] {
  const lower = text.toLowerCase();
  if (lower.includes("generic") || lower.includes("thuốc generic")) return "generic";
  if (lower.includes("biosimilar") || lower.includes("sinh học tương tự")) return "biosimilar";
  if (lower.includes("branded") || lower.includes("biệt dược")) return "branded";
  return "generic"; // DAV mostly lists generics
}

/**
 * Parse drug approvals from an HTML table (DAV standard structure).
 */
function parseApprovalTable($: ReturnType<typeof cheerio.load>): DrugApproval[] {
  const results: DrugApproval[] = [];

  $("table tbody tr").each((_i, row) => {
    const cells = $(row).find("td");
    if (cells.length < 3) return;

    // Typical DAV table column order:
    // [0] registration_number [1] drug_name [2] manufacturer [3] approval_date [4] category?
    const registrationNumber = $(cells[0]).text().trim();
    const drugName = $(cells[1]).text().trim();
    const manufacturer = $(cells[2]).text().trim();
    const approvalDate = $(cells[3])?.text().trim() ?? "";
    const categoryText = $(cells[4])?.text().trim() ?? "";

    if (!drugName || !manufacturer) return;

    const relatedStocks = inferStocks(manufacturer);
    if (relatedStocks.length === 0) return; // Only track watchlist-relevant stocks

    results.push({
      drugName,
      manufacturer,
      registrationNumber,
      approvalDate,
      category: inferCategory(categoryText),
      relatedStocks,
    });
  });

  return results;
}

/**
 * Fallback: scan news-style items on the DAV page for pharma company mentions.
 * Used when the structured table is absent or returns no tracked stocks.
 */
function parseNewsItems($: ReturnType<typeof cheerio.load>): DrugApproval[] {
  const results: DrugApproval[] = [];

  $(".news-item, article, .content-item").each((_i, item) => {
    const text = $(item).text();
    const relatedStocks = inferStocks(text);
    if (relatedStocks.length === 0) return;

    const title = $(item).find("h1, h2, h3, .title").first().text().trim();
    if (!title) return;

    results.push({
      drugName: title,
      manufacturer: relatedStocks.join(", "),
      registrationNumber: "",
      approvalDate: "",
      category: "unknown",
      relatedStocks,
    });
  });

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch and parse DAV drug approval announcements.
 *
 * @param httpClient - Optional HTTP client for test injection; defaults to axios.
 * @returns Array of DrugApproval records. Empty on error.
 */
export async function fetchDavPharmacy(httpClient?: HttpClient): Promise<DrugApproval[]> {
  const client = httpClient ?? (await makeDefaultHttpClient());

  logger.debug("[davPharmacy] fetching DAV drug registry", {
    url: DAV_DRUG_REGISTRY_URL,
  });

  try {
    const html = await client.get(DAV_DRUG_REGISTRY_URL);

    if (!html || html.trim().length === 0) {
      logger.warn("[davPharmacy] empty response from DAV");
      return [];
    }

    const $ = cheerio.load(html);

    // Primary: structured table
    const tableResults = parseApprovalTable($);
    if (tableResults.length > 0) {
      logger.info("[davPharmacy] parsed drug approvals from table", {
        count: tableResults.length,
      });
      return tableResults;
    }

    // Fallback: news-style items
    const newsResults = parseNewsItems($);
    if (newsResults.length > 0) {
      logger.info("[davPharmacy] parsed drug mentions from news items", {
        count: newsResults.length,
      });
      return newsResults;
    }

    logger.info("[davPharmacy] no tracked pharma stocks found in DAV page");
    return [];
  } catch (err) {
    logger.error("[davPharmacy] failed to fetch DAV registry", {
      url: DAV_DRUG_REGISTRY_URL,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
