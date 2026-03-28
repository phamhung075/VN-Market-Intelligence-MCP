/**
 * Infrastructure — Trading Economics Macro Indicator Scraper (Task 024)
 *
 * Scrapes the Trading Economics Vietnam indicators page to extract macro
 * economic data: GDP Growth Rate, Inflation Rate (CPI), and Interest Rate.
 *
 * URL: https://tradingeconomics.com/vietnam/indicators
 * Overridable via Bun.env["TRADING_ECONOMICS_BASE_URL"].
 *
 * Design decisions:
 *   - Injectable HttpClient for testability (same pattern as ssc.ts / hose.ts).
 *   - Never throws — all errors are caught and result in null fields.
 *   - Each indicator parsed independently (one failure does not affect others).
 *   - storeMacroIndicators() uses INSERT OR REPLACE for upsert semantics.
 *
 * Layer: infrastructure/fetchers — may use HTTP and SQLite; must not import domain/.
 */

import * as cheerio from "cheerio";
import { Database } from "bun:sqlite";
import { logger } from "../logger.js";
import { getDb } from "../db/schema.js";
import type { HttpClient } from "./ssc.js";

// Re-export HttpClient for consumers that import from this module directly.
export type { HttpClient } from "./ssc.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default base URL — overridable via env for tests and staging. */
const DEFAULT_BASE_URL = "https://tradingeconomics.com";

/** Path to the Vietnam macro indicators page. */
const VIETNAM_INDICATORS_PATH = "/vietnam/indicators";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Macro economic indicators for a given country.
 *
 * All numeric fields are raw percentages (e.g. 4.5 = 4.5%).
 * A `null` value means the data was not found or could not be parsed.
 */
export interface MacroIndicators {
  /** Country identifier (e.g. "vietnam"). */
  country: string;
  /** Inflation Rate / CPI in percent. */
  cpi: number | null;
  /** GDP Growth Rate in percent. */
  gdpGrowth: number | null;
  /** Central bank interest rate in percent. */
  interestRate: number | null;
  /** ISO 8601 timestamp when this data was fetched. */
  fetchedAt: string;
}

// ---------------------------------------------------------------------------
// Default HTTP client (axios — lazy import)
// ---------------------------------------------------------------------------

async function makeDefaultHttpClient(): Promise<HttpClient> {
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
        timeout: 15_000,
        responseType: "text",
      });
      return response.data;
    },
  };
}

// ---------------------------------------------------------------------------
// HTML parsing helpers
// ---------------------------------------------------------------------------

/**
 * Label strings to search for in the Trading Economics HTML table.
 * The page uses these exact strings (in English) to label each indicator row.
 */
const INDICATOR_LABELS = {
  cpi: ["inflation rate", "cpi"],
  gdpGrowth: ["gdp growth rate", "gdp growth"],
  interestRate: ["interest rate"],
} as const;

/**
 * Parses a single numeric indicator value from an HTML table.
 *
 * Strategy:
 *   1. Find a <td> whose text (case-insensitive) matches one of the labels.
 *   2. The value is in the immediately following <td> sibling, or the next
 *      <td> in the same <tr> that contains a bare decimal/integer number.
 *   3. Strip the "%" suffix and any whitespace, then parseFloat().
 *   4. Return null if parseFloat returns NaN.
 *
 * Wrapped in try/catch so a parse failure on one indicator does not affect
 * parsing of the others.
 *
 * @param $ - Loaded cheerio instance.
 * @param labels - Array of lowercase label strings to search for.
 * @returns Parsed number, or null if not found / non-numeric.
 */
function parseIndicatorValue(
  $: cheerio.CheerioAPI,
  labels: readonly string[],
): number | null {
  try {
    // Use an array as a mutable container so TypeScript does not narrow
    // the variable to 'never' inside nested cheerio each() callbacks.
    const found: string[] = [];

    // Walk every <td> in the document and match against label strings.
    $("td").each((_idx, el) => {
      if (found.length > 0) return; // already found

      const cellText = $(el).text().trim().toLowerCase();

      // Check if this cell contains one of the indicator label strings.
      const matched = labels.some(
        (label) => cellText === label || cellText.includes(label),
      );

      if (!matched) return;

      // Try to find the value in the next <td> sibling within the same row.
      const nextTd = $(el).nextAll("td").first();
      if (nextTd.length > 0) {
        found.push(nextTd.text().trim());
        return;
      }

      // Fallback: look at all <td> cells in the same <tr>.
      const row = $(el).closest("tr");
      row.find("td").each((_i, cell) => {
        if (found.length > 0) return;
        if (cell === el) return; // skip label cell itself
        const raw = $(cell).text().trim();
        // Accept only cells that start with a digit, minus sign, or decimal point.
        if (/^[-\d.]/.test(raw)) {
          found.push(raw);
        }
      });
    });

    if (found.length === 0 || found[0] === undefined) return null;

    // Strip "%" suffix, whitespace, and any non-numeric trailing chars.
    const cleaned = found[0].replace(/%/g, "").trim();
    // Extract leading numeric portion (handles "7.40 Q4 2024" style strings)
    const numMatch = cleaned.match(/^[-\d.]+/);
    if (!numMatch) return null;

    const parsed = parseFloat(numMatch[0]);
    return isNaN(parsed) ? null : parsed;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API — fetchMacroIndicators
// ---------------------------------------------------------------------------

/**
 * Scrapes the Trading Economics Vietnam indicators page and returns the three
 * key macro indicators.
 *
 * @param httpClient - Optional injectable HTTP client.
 *                     Reads `Bun.env["TRADING_ECONOMICS_BASE_URL"]` to
 *                     override the base URL (useful in tests).
 * @returns MacroIndicators — never throws; null fields on failure.
 */
export async function fetchMacroIndicators(
  httpClient?: HttpClient,
): Promise<MacroIndicators> {
  const baseUrl =
    Bun.env["TRADING_ECONOMICS_BASE_URL"] ?? DEFAULT_BASE_URL;
  const url = `${baseUrl}${VIETNAM_INDICATORS_PATH}`;
  const fetchedAt = new Date().toISOString();

  const nullResult: MacroIndicators = {
    country: "vietnam",
    cpi: null,
    gdpGrowth: null,
    interestRate: null,
    fetchedAt,
  };

  let html: string;

  try {
    const client = httpClient ?? (await makeDefaultHttpClient());
    logger.debug("[tradingEconomics] fetching macro indicators", { url });
    html = await client.get(url);
  } catch (err) {
    logger.error("[tradingEconomics] HTTP fetch failed", {
      url,
      error: err instanceof Error ? err.message : String(err),
    });
    return nullResult;
  }

  try {
    const $ = cheerio.load(html);

    // Parse each indicator independently — one failure does not affect others.
    const cpi = parseIndicatorValue($, INDICATOR_LABELS.cpi);
    const gdpGrowth = parseIndicatorValue($, INDICATOR_LABELS.gdpGrowth);
    const interestRate = parseIndicatorValue($, INDICATOR_LABELS.interestRate);

    logger.info("[tradingEconomics] parsed macro indicators", {
      cpi,
      gdpGrowth,
      interestRate,
    });

    return {
      country: "vietnam",
      cpi,
      gdpGrowth,
      interestRate,
      fetchedAt,
    };
  } catch (err) {
    logger.error("[tradingEconomics] HTML parse failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return nullResult;
  }
}

// ---------------------------------------------------------------------------
// Public API — storeMacroIndicators
// ---------------------------------------------------------------------------

/**
 * Upserts macro indicators into the `macro_indicators` SQLite table.
 *
 * Uses INSERT OR REPLACE which handles the UNIQUE(country) constraint by
 * replacing the existing row when the country already exists.
 *
 * @param indicators - Data to persist.
 * @param db         - Optional database instance (defaults to `getDb()`).
 */
export function storeMacroIndicators(
  indicators: MacroIndicators,
  db?: Database,
): void {
  const database = db ?? getDb();

  database
    .query(
      `INSERT OR REPLACE INTO macro_indicators
         (country, cpi, gdp_growth, interest_rate, fetched_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      indicators.country,
      indicators.cpi,
      indicators.gdpGrowth,
      indicators.interestRate,
      indicators.fetchedAt,
    );

  logger.debug("[tradingEconomics] stored macro indicators", {
    country: indicators.country,
  });
}
