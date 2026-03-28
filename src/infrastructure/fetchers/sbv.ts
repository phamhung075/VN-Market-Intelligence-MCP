/**
 * Infrastructure — SBV (State Bank of Vietnam) Macro Fetcher (Task 028)
 *
 * Fetches macro data from the State Bank of Vietnam public portal:
 *   - Interest rates: https://www.sbv.gov.vn/en/home/rm/ir
 *     Parses overnight rate and refinancing rate from an HTML table.
 *   - Exchange rates: https://www.sbv.gov.vn/en/home/rm/ex
 *     Parses the official USD/VND exchange rate from an HTML table.
 *
 * Design principles:
 *   - NEVER throws — all errors are caught; affected fields fall back to 0.
 *   - Returns null only if BOTH pages fail (no usable data at all).
 *   - Individual page failures set the affected numeric fields to 0 while
 *     the successfully fetched fields remain populated.
 *   - Injectable HttpClient for testability (no real HTTP in unit tests).
 *   - Base URL overridable via SBV_BASE_URL env var.
 *
 * Layer: infrastructure/fetchers — may use HTTP and SQLite, must not import domain/.
 */

import * as cheerio from "cheerio";
import { Database } from "bun:sqlite";
import { logger } from "../logger.js";
import { getDb } from "../db/schema.js";
import type { HttpClient } from "./ssc.js";

// Re-export HttpClient so consumers can import it directly from this module.
export type { HttpClient } from "./ssc.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default SBV base URL — overridable via SBV_BASE_URL env var for tests. */
const SBV_BASE_URL: string =
  Bun.env["SBV_BASE_URL"] ?? "https://www.sbv.gov.vn";

/** Path for the interest rate page. */
const SBV_RATES_PATH = "/en/home/rm/ir";

/** Path for the exchange rate page. */
const SBV_FX_PATH = "/en/home/rm/ex";

/**
 * Bilingual label arrays for interest rate matching.
 * Case-insensitive substring match against table cell text content.
 */
const OVERNIGHT_LABELS = ["overnight", "qua đêm", "qua dem"];
const REFINANCING_LABELS = ["refinancing", "tái cấp vốn", "tai cap von", "refinance"];

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A snapshot of SBV macro indicators at a point in time.
 *
 * @property overnightRatePct   - SBV overnight interest rate (% per year). 0 if unavailable.
 * @property refinancingRatePct - SBV refinancing rate (% per year). 0 if unavailable.
 * @property usdVndOfficial     - Official USD/VND exchange rate. 0 if unavailable.
 * @property fetchedAt          - ISO 8601 timestamp when this snapshot was captured.
 */
export interface SbvMacroSnapshot {
  /** Overnight interest rate in percent per year (e.g. 4.5 means 4.5%/year). */
  overnightRatePct: number;
  /** Refinancing (tái cấp vốn) rate in percent per year. */
  refinancingRatePct: number;
  /** Official USD/VND exchange rate (e.g. 24000 means 24,000 VND per 1 USD). */
  usdVndOfficial: number;
  /** ISO 8601 timestamp when this data was fetched. */
  fetchedAt: string;
}

// ---------------------------------------------------------------------------
// Default HTTP client (axios)
// ---------------------------------------------------------------------------

/**
 * Creates the default production HTTP client backed by axios.
 * Lazy-imported so tests that inject a mock never load axios.
 */
async function makeDefaultHttpClient(): Promise<HttpClient> {
  const axiosModule = await import("axios");
  const axios = axiosModule.default;

  return {
    async get(url: string): Promise<string> {
      const response = await axios.get<string>(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; VN-Market-Intelligence/1.0; +https://github.com/vn-market)",
          "Accept-Language": "en",
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
 * Parses the interest rate (overnight and refinancing) from the SBV /rm/ir page.
 *
 * Strategy:
 * 1. Load HTML with cheerio.
 * 2. Iterate all <tr> elements.
 * 3. For each row, check if the first <td> text matches one of the bilingual label arrays.
 * 4. Extract the numeric value from the second <td>.
 *
 * @param html - Raw HTML string from the SBV interest rate page.
 * @returns Object with overnightRatePct and refinancingRatePct (0 if not found).
 */
function parseInterestRates(html: string): {
  overnightRatePct: number;
  refinancingRatePct: number;
} {
  let overnightRatePct = 0;
  let refinancingRatePct = 0;

  try {
    const $ = cheerio.load(html);

    $("tr").each((_i, row) => {
      const cells = $(row).find("td");
      if (cells.length < 2) return;

      const labelText = $(cells[0]).text().trim().toLowerCase();
      const valueText = $(cells[1]).text().trim();

      const numericValue = parseFloat(valueText);
      if (isNaN(numericValue)) return;

      if (OVERNIGHT_LABELS.some((label) => labelText.includes(label))) {
        overnightRatePct = numericValue;
      } else if (REFINANCING_LABELS.some((label) => labelText.includes(label))) {
        refinancingRatePct = numericValue;
      }
    });
  } catch (err) {
    logger.warn("[sbv] failed to parse interest rates HTML", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return { overnightRatePct, refinancingRatePct };
}

/**
 * Converts a Vietnamese-formatted number string to a JavaScript number.
 *
 * Vietnamese FX rates use dots as thousand separators and optionally commas
 * as decimal separators:
 *   "24.000"      → 24000  (24 thousand)
 *   "24.150,00"   → 24150  (24 thousand, 150 — comma decimal stripped)
 *
 * Algorithm:
 *   1. Strip all dot characters (thousand separators).
 *   2. Replace comma with dot (decimal separator normalization).
 *   3. Parse with parseFloat.
 *
 * @param raw - Raw numeric string from the HTML cell.
 * @returns Parsed number, or 0 if parsing fails.
 */
function parseVietnameseFxRate(raw: string): number {
  try {
    // Strip thousand-separator dots, then normalize decimal comma
    const normalized = raw.replace(/\./g, "").replace(",", ".");
    const value = parseFloat(normalized);
    return isNaN(value) ? 0 : value;
  } catch {
    return 0;
  }
}

/**
 * Parses the USD/VND official exchange rate from the SBV /rm/ex page.
 *
 * Strategy:
 * 1. Load HTML with cheerio.
 * 2. Find the first <tr> whose first <td> text is "USD" (case-insensitive).
 * 3. Read the "Transfer" rate (4th <td>) as the official mid-rate.
 *    Falls back to "Buy" rate (2nd <td>) if Transfer column is absent.
 *
 * @param html - Raw HTML string from the SBV exchange rate page.
 * @returns Parsed USD/VND rate, or 0 if not found.
 */
function parseFxRate(html: string): number {
  try {
    const $ = cheerio.load(html);

    let usdVndOfficial = 0;

    $("tr").each((_i, row) => {
      const cells = $(row).find("td");
      if (cells.length < 2) return;

      const currencyText = $(cells[0]).text().trim().toUpperCase();
      if (currencyText !== "USD") return;

      // Prefer Transfer rate (index 3), fall back to Sell (index 2), then Buy (index 1)
      const transferText =
        cells.length >= 4
          ? $(cells[3]).text().trim()
          : cells.length >= 3
          ? $(cells[2]).text().trim()
          : $(cells[1]).text().trim();

      const parsed = parseVietnameseFxRate(transferText);
      if (parsed > 0) {
        usdVndOfficial = parsed;
      }

      return false; // stop after first USD row (cheerio uses false to break each)
    });

    return usdVndOfficial;
  } catch (err) {
    logger.warn("[sbv] failed to parse FX rates HTML", {
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Public API — fetchSbvRates
// ---------------------------------------------------------------------------

/**
 * Fetches the current SBV macro snapshot: overnight rate, refinancing rate,
 * and official USD/VND exchange rate.
 *
 * - Hits two SBV pages concurrently: /en/home/rm/ir and /en/home/rm/ex.
 * - Individual page failures set affected fields to 0; the other fields
 *   remain populated from the successful page.
 * - Returns null only if BOTH pages fail entirely (no usable data).
 * - NEVER throws. All errors are caught and logged at warn level.
 * - Honors SBV_BASE_URL env var for URL override (test isolation).
 *
 * @param httpClient - Optional injectable HTTP client. Defaults to axios.
 * @returns SbvMacroSnapshot if at least one page succeeded; null if both failed.
 */
export async function fetchSbvRates(
  httpClient?: HttpClient,
): Promise<SbvMacroSnapshot | null> {
  const client = httpClient ?? (await makeDefaultHttpClient());
  const fetchedAt = new Date().toISOString();
  const baseUrl = Bun.env["SBV_BASE_URL"] ?? SBV_BASE_URL;

  const ratesUrl = `${baseUrl}${SBV_RATES_PATH}`;
  const fxUrl = `${baseUrl}${SBV_FX_PATH}`;

  logger.debug("[sbv] fetching rates", { ratesUrl, fxUrl });

  let ratesResult: { overnightRatePct: number; refinancingRatePct: number } | null = null;
  let fxResult: number | null = null;

  // Fetch interest rates page
  try {
    const html = await client.get(ratesUrl);
    ratesResult = parseInterestRates(html);
    logger.debug("[sbv] interest rates fetched", {
      overnightRatePct: ratesResult.overnightRatePct,
      refinancingRatePct: ratesResult.refinancingRatePct,
    });
  } catch (err) {
    logger.warn("[sbv] interest rate page fetch failed", {
      url: ratesUrl,
      error: err instanceof Error ? err.message : String(err),
    });
    // ratesResult stays null → will be set to 0 values
  }

  // Fetch FX rates page
  try {
    const html = await client.get(fxUrl);
    fxResult = parseFxRate(html);
    logger.debug("[sbv] FX rate fetched", { usdVndOfficial: fxResult });
  } catch (err) {
    logger.warn("[sbv] FX page fetch failed", {
      url: fxUrl,
      error: err instanceof Error ? err.message : String(err),
    });
    // fxResult stays null → will be set to 0
  }

  // If BOTH pages failed → return null
  if (ratesResult === null && fxResult === null) {
    logger.warn("[sbv] both pages failed — returning null");
    return null;
  }

  const snapshot: SbvMacroSnapshot = {
    overnightRatePct: ratesResult?.overnightRatePct ?? 0,
    refinancingRatePct: ratesResult?.refinancingRatePct ?? 0,
    usdVndOfficial: fxResult ?? 0,
    fetchedAt,
  };

  logger.info("[sbv] macro snapshot fetched", {
    overnightRatePct: snapshot.overnightRatePct,
    refinancingRatePct: snapshot.refinancingRatePct,
    usdVndOfficial: snapshot.usdVndOfficial,
  });

  return snapshot;
}

// ---------------------------------------------------------------------------
// Public API — storeSbvSnapshot
// ---------------------------------------------------------------------------

/**
 * Persists an SBV macro snapshot into SQLite using a dual-table write pattern:
 *
 *   1. `sbv_rates`         — single latest row per source (upsert via INSERT OR REPLACE).
 *   2. `sbv_rates_history` — append-only historical log.
 *
 * Both writes are wrapped in a single SQLite transaction for atomicity.
 *
 * @param snapshot - The SbvMacroSnapshot to persist.
 * @param db       - Optional Database instance. Defaults to the application singleton.
 */
export function storeSbvSnapshot(
  snapshot: SbvMacroSnapshot,
  db?: Database,
): void {
  const database = db ?? getDb();
  const source = "sbv";

  const upsertLatest = database.prepare(`
    INSERT OR REPLACE INTO sbv_rates
      (source, overnight_rate_pct, refinancing_rate_pct, usd_vnd_official, fetched_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertHistory = database.prepare(`
    INSERT INTO sbv_rates_history
      (source, overnight_rate_pct, refinancing_rate_pct, usd_vnd_official, fetched_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const persist = database.transaction(() => {
    upsertLatest.run(
      source,
      snapshot.overnightRatePct,
      snapshot.refinancingRatePct,
      snapshot.usdVndOfficial,
      snapshot.fetchedAt,
    );
    insertHistory.run(
      source,
      snapshot.overnightRatePct,
      snapshot.refinancingRatePct,
      snapshot.usdVndOfficial,
      snapshot.fetchedAt,
    );
  });

  persist();

  logger.debug("[sbv] snapshot stored", {
    source,
    overnightRatePct: snapshot.overnightRatePct,
    refinancingRatePct: snapshot.refinancingRatePct,
    usdVndOfficial: snapshot.usdVndOfficial,
    fetchedAt: snapshot.fetchedAt,
  });
}
