/**
 * Infrastructure — SBV (State Bank of Vietnam) Macro Fetcher (Task 028)
 *
 * Fetches macro data for Vietnamese market analysis:
 *
 *   FX rate:        Vietcombank XML API (VCB portal) — live USD/VND transfer rate.
 *   Interest rates: SBV web portal is down; reads configurable fallback values from
 *                   mcp.config.json (sbv.fallbackOvernightRate / sbv.fallbackRefinancingRate)
 *                   or the SBV_OVERNIGHT_RATE / SBV_REFINANCING_RATE env vars.
 *
 * VCB XML API:
 *   URL: https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx?b=68
 *   Parses: <Exrate CurrencyCode="USD" Buy="26,105.00" Transfer="26,135.00" Sell="26,355.00" />
 *   Uses the Transfer rate as the official mid-market rate.
 *
 * Design principles:
 *   - NEVER throws — all errors are caught; affected fields fall back to 0.
 *   - Returns null only if BOTH FX fetch AND interest rate lookup fail entirely.
 *   - Individual failures set the affected numeric fields to 0 while
 *     the successfully fetched / configured fields remain populated.
 *   - Injectable HttpClient for testability (no real HTTP in unit tests).
 *   - VCB base URL overridable via VCB_RATES_URL env var.
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

/**
 * Vietcombank XML exchange rate feed.
 * Overridable via VCB_RATES_URL env var for integration tests.
 */
const VCB_RATES_URL: string =
  Bun.env["VCB_RATES_URL"] ??
  "https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx?b=68";

/**
 * Configurable fallback interest rates.
 * SBV portal is currently down (404); these defaults reflect the last known rates.
 * Override via env vars or mcp.config.json sbv section.
 */
const DEFAULT_OVERNIGHT_RATE = parseFloat(
  Bun.env["SBV_OVERNIGHT_RATE"] || "3.0",
);
const DEFAULT_REFINANCING_RATE = parseFloat(
  Bun.env["SBV_REFINANCING_RATE"] || "4.5",
);
const DEFAULT_DISCOUNT_RATE = parseFloat(
  Bun.env["SBV_DISCOUNT_RATE"] || "1.5",
);
const DEFAULT_MAX_DEPOSIT_RATE = parseFloat(
  Bun.env["SBV_MAX_DEPOSIT_RATE"] || "5.0",
);
const DEFAULT_MAX_LENDING_RATE = parseFloat(
  Bun.env["SBV_MAX_LENDING_RATE"] || "12.0",
);
const DEFAULT_INTERBANK_OVERNIGHT = parseFloat(
  Bun.env["SBV_INTERBANK_OVERNIGHT"] || "4.0",
);

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A snapshot of SBV macro indicators at a point in time.
 *
 * @property overnightRatePct       - SBV overnight interest rate (% per year). 0 if unavailable.
 * @property refinancingRatePct     - SBV refinancing rate (% per year). 0 if unavailable.
 * @property usdVndOfficial         - Official USD/VND exchange rate (Transfer rate). 0 if unavailable.
 * @property discountRatePct        - SBV discount rate (lãi suất chiết khấu, % per year). 0 if unavailable.
 * @property maxDepositRatePct      - SBV max deposit rate cap (trần lãi suất huy động, % per year). 0 if unavailable.
 * @property maxLendingRatePct      - SBV max lending rate cap (trần lãi suất cho vay, % per year). 0 if unavailable.
 * @property interbankOvernightPct  - Interbank overnight rate (lãi suất liên ngân hàng qua đêm, % per year). 0 if unavailable.
 * @property fetchedAt              - ISO 8601 timestamp when this snapshot was captured.
 * @property isEstimate             - DSI-S1-MACRO FR-MAC-2: true when any rate value comes from a
 *                                    hardcoded fallback (env var / config default), not a live SBV portal
 *                                    response. Set to false only when a real portal response is received.
 */
export interface SbvMacroSnapshot {
  /** Overnight interest rate in percent per year (e.g. 4.5 means 4.5%/year). */
  overnightRatePct: number;
  /** Refinancing (tái cấp vốn) rate in percent per year. */
  refinancingRatePct: number;
  /** Official USD/VND exchange rate (Transfer rate from VCB). */
  usdVndOfficial: number;
  /** Discount rate (lãi suất chiết khấu) in percent per year. */
  discountRatePct: number;
  /** Max deposit rate cap (trần lãi suất huy động) in percent per year. */
  maxDepositRatePct: number;
  /** Max lending rate cap (trần lãi suất cho vay) in percent per year. */
  maxLendingRatePct: number;
  /** Interbank overnight rate (lãi suất liên ngân hàng qua đêm) in percent per year. */
  interbankOvernightPct: number;
  /** ISO 8601 timestamp when this data was fetched. */
  fetchedAt: string;
  /**
   * DSI-S1-MACRO FR-MAC-2: true when ANY rate value comes from a hardcoded fallback
   * (env var / config default), not a live SBV portal response.
   * The SBV portal has been permanently 404 since at least 2026. All current writes
   * are from hardcoded defaults → isEstimate defaults to true.
   * Optional for backward compat; absent = true (conservative: treat as estimate).
   */
  isEstimate?: boolean;
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
          Accept: "application/xml, text/xml, */*",
        },
        timeout: 15_000,
        responseType: "text",
      });
      return response.data;
    },
  };
}

// ---------------------------------------------------------------------------
// XML parsing helper — VCB exchange rates
// ---------------------------------------------------------------------------

/**
 * Parses the USD/VND Transfer rate from the Vietcombank XML feed.
 *
 * XML format:
 *   <ExrateList DateTime="3/29/2026 3:44:11 PM">
 *     <Exrate CurrencyCode="USD" CurrencyName="ĐÔLA MỸ"
 *             Buy="26,105.00" Transfer="26,135.00" Sell="26,355.00" />
 *     ...
 *   </ExrateList>
 *
 * Algorithm:
 *   1. Parse XML with cheerio (xmlMode).
 *   2. Find the <Exrate> element with CurrencyCode="USD".
 *   3. Read the Transfer attribute.
 *   4. Strip commas (US thousands separator) before parseFloat.
 *
 * @param xml - Raw XML string from the VCB rates endpoint.
 * @returns Parsed USD/VND Transfer rate as a number, or 0 if not found.
 */
function parseVcbXmlRate(xml: string): number {
  try {
    const $ = cheerio.load(xml, { xmlMode: true });

    // The element selector is case-insensitive to handle different XML renderings
    const exrate = $("Exrate, exrate").filter((_i, el) => {
      const code =
        $(el).attr("CurrencyCode") || $(el).attr("currencycode") || "";
      return code.toUpperCase() === "USD";
    });

    if (exrate.length === 0) {
      logger.debug("[sbv] USD Exrate element not found in VCB XML");
      return 0;
    }

    const transferRaw =
      exrate.attr("Transfer") ||
      exrate.attr("transfer") ||
      exrate.attr("TRANSFER") ||
      "";

    if (!transferRaw) {
      // Fall back to Buy rate if Transfer is absent
      const buyRaw =
        exrate.attr("Buy") || exrate.attr("buy") || exrate.attr("BUY") || "";
      if (!buyRaw) return 0;
      const parsed = parseFloat(buyRaw.replace(/,/g, ""));
      return isNaN(parsed) ? 0 : parsed;
    }

    // Strip US comma thousands separators, then parse
    const cleaned = transferRaw.replace(/,/g, "");
    const value = parseFloat(cleaned);
    return isNaN(value) ? 0 : value;
  } catch (err) {
    logger.warn("[sbv] failed to parse VCB XML", {
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
 * - FX rate: fetched live from the Vietcombank XML API (VCB portal).
 * - Interest rates: read from config fallbacks (SBV portal is currently down).
 *   The fallback values are sourced from SBV_OVERNIGHT_RATE / SBV_REFINANCING_RATE
 *   env vars, defaulting to 3.0% / 4.5% if unset.
 *
 * - FX fetch failure sets usdVndOfficial to 0; rate fallbacks remain.
 * - Returns null only if the FX fetch fails AND rate fallbacks are both 0.
 * - NEVER throws. All errors are caught and logged at warn level.
 * - Honors VCB_RATES_URL env var for URL override (test isolation).
 *
 * @param httpClient - Optional injectable HTTP client. Defaults to axios.
 * @returns SbvMacroSnapshot on success; null if no usable data at all.
 */
export async function fetchSbvRates(
  httpClient?: HttpClient,
): Promise<SbvMacroSnapshot | null> {
  const client = httpClient ?? (await makeDefaultHttpClient());
  const fetchedAt = new Date().toISOString();
  const vcbUrl = Bun.env["VCB_RATES_URL"] ?? VCB_RATES_URL;

  // Read interest rate fallbacks from env / defaults
  const overnightRatePct = Number.isNaN(DEFAULT_OVERNIGHT_RATE)
    ? 0
    : DEFAULT_OVERNIGHT_RATE;
  const refinancingRatePct = Number.isNaN(DEFAULT_REFINANCING_RATE)
    ? 0
    : DEFAULT_REFINANCING_RATE;

  logger.debug("[sbv] fetching VCB exchange rates", { vcbUrl });

  let usdVndOfficial = 0;
  let fxFetchSucceeded = false;

  try {
    const xml = await client.get(vcbUrl);
    usdVndOfficial = parseVcbXmlRate(xml);
    fxFetchSucceeded = true;
    logger.debug("[sbv] VCB FX rate fetched", { usdVndOfficial });
  } catch (err) {
    logger.warn("[sbv] VCB FX fetch failed", {
      url: vcbUrl,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Return null only if FX failed AND interest rate fallbacks are also both 0
  if (!fxFetchSucceeded && overnightRatePct === 0 && refinancingRatePct === 0) {
    logger.warn("[sbv] VCB fetch failed and no rate fallbacks configured — returning null");
    return null;
  }

  const discountRatePct = Number.isNaN(DEFAULT_DISCOUNT_RATE) ? 0 : DEFAULT_DISCOUNT_RATE;
  const maxDepositRatePct = Number.isNaN(DEFAULT_MAX_DEPOSIT_RATE) ? 0 : DEFAULT_MAX_DEPOSIT_RATE;
  const maxLendingRatePct = Number.isNaN(DEFAULT_MAX_LENDING_RATE) ? 0 : DEFAULT_MAX_LENDING_RATE;
  const interbankOvernightPct = Number.isNaN(DEFAULT_INTERBANK_OVERNIGHT) ? 0 : DEFAULT_INTERBANK_OVERNIGHT;

  // DSI-S1-MACRO FR-MAC-2: All interest rate values come from hardcoded env-var fallbacks
  // (SBV portal is permanently 404). Mark isEstimate=true to indicate these are NOT live.
  // If/when a real SBV portal response is received, set isEstimate=false at that site.
  const snapshot: SbvMacroSnapshot = {
    overnightRatePct,
    refinancingRatePct,
    usdVndOfficial,
    discountRatePct,
    maxDepositRatePct,
    maxLendingRatePct,
    interbankOvernightPct,
    fetchedAt,
    isEstimate: true, // always true: SBV portal dead, all rates are env-var constants
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

// ---------------------------------------------------------------------------
// Sentinel-for-missing rate columns — 0 is NOT a valid value for these fields.
// If the fetcher returns 0 for any of these, it means the upstream scrape missed
// the value. We must not overwrite a good prior row with 0.
//
// NOT listed: interbank_overnight_pct — can legitimately be 0 on market close /
// holiday; discount_rate_pct — rarely touched, not a primary DPI concern.
// ---------------------------------------------------------------------------

const SENTINEL_ZERO_COLUMNS = [
  "max_deposit_rate_pct",
  "usd_vnd_official",
  "overnight_rate_pct",
  "refinancing_rate_pct",
  "max_lending_rate_pct",
] as const;

type SentinelColumn = typeof SENTINEL_ZERO_COLUMNS[number];

const SNAPSHOT_FIELD_MAP: Record<SentinelColumn, keyof SbvMacroSnapshot> = {
  max_deposit_rate_pct: "maxDepositRatePct",
  usd_vnd_official:     "usdVndOfficial",
  overnight_rate_pct:   "overnightRatePct",
  refinancing_rate_pct: "refinancingRatePct",
  max_lending_rate_pct: "maxLendingRatePct",
};

/**
 * Checks whether the incoming snapshot has any sentinel-for-missing 0-values
 * that would clobber a good prior row in sbv_rates.
 *
 * Returns the list of column names where the new snapshot has 0 but the prior
 * row has a positive value. An empty array means the write is safe.
 */
function detectZeroOverwriteColumns(
  snapshot: SbvMacroSnapshot,
  priorRow: Record<string, number> | null,
): SentinelColumn[] {
  if (!priorRow) return []; // no prior row — first write, always safe

  const problematic: SentinelColumn[] = [];
  for (const col of SENTINEL_ZERO_COLUMNS) {
    const snapshotValue = snapshot[SNAPSHOT_FIELD_MAP[col]] as number;
    const priorValue = priorRow[col] ?? 0;
    if (snapshotValue <= 0 && priorValue > 0) {
      problematic.push(col);
    }
  }
  return problematic;
}

/**
 * Persists an SBV macro snapshot into SQLite using a dual-table write pattern:
 *
 *   1. `sbv_rates`         — single latest row per source (upsert via INSERT OR REPLACE).
 *   2. `sbv_rates_history` — append-only historical log.
 *
 * Both writes are wrapped in a single SQLite transaction for atomicity.
 *
 * Zero-overwrite guard: if the incoming snapshot has ≤0 for any
 * sentinel-for-missing column (max_deposit_rate_pct, usd_vnd_official,
 * overnight_rate_pct, refinancing_rate_pct, max_lending_rate_pct) AND the
 * prior row already holds a positive value for that column, the entire write
 * is REJECTED. The function returns without touching sbv_rates or
 * sbv_rates_history. The caller (sbvRatesJob) is responsible for logging
 * and alerting before calling this function.
 *
 * First-ever writes (no prior row) are always accepted, even if deposit-rate=0,
 * because there is no good prior value to protect.
 *
 * @param snapshot - The SbvMacroSnapshot to persist.
 * @param db       - Optional Database instance. Defaults to the application singleton.
 * @returns { skipped: true, zeroColumns: string[] } when the write was rejected;
 *          { skipped: false } when the snapshot was persisted normally.
 */
export function storeSbvSnapshot(
  snapshot: SbvMacroSnapshot,
  db?: Database,
): { skipped: boolean; zeroColumns: SentinelColumn[] } {
  const database = db ?? getDb();
  const source = "sbv";

  // Read prior row to check for zero-overwrite risk
  const priorRow = database
    .query<Record<string, number>, [string]>(
      `SELECT max_deposit_rate_pct, usd_vnd_official, overnight_rate_pct,
              refinancing_rate_pct, max_lending_rate_pct
       FROM sbv_rates WHERE source = ?`,
    )
    .get(source) ?? null;

  const zeroColumns = detectZeroOverwriteColumns(snapshot, priorRow);
  if (zeroColumns.length > 0) {
    logger.error(
      `[sbv] storeSbvSnapshot REJECTED — zero-value would overwrite good prior row`,
      { zeroColumns, priorRow, fetchedAt: snapshot.fetchedAt },
    );
    return { skipped: true, zeroColumns };
  }

  // DSI-S1-MACRO FR-MAC-2: include is_estimate column (1=estimate/fallback, 0=live portal).
  // Default to true (1) when the field is absent — conservative: treat as estimate.
  const isEstimateInt = (snapshot.isEstimate ?? true) ? 1 : 0;

  const upsertLatest = database.prepare(`
    INSERT OR REPLACE INTO sbv_rates
      (source, overnight_rate_pct, refinancing_rate_pct, usd_vnd_official,
       discount_rate_pct, max_deposit_rate_pct, max_lending_rate_pct, interbank_overnight_pct,
       fetched_at, is_estimate)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Dedup: only append history if no row exists for the same hour
  const insertHistory = database.prepare(`
    INSERT INTO sbv_rates_history
      (source, overnight_rate_pct, refinancing_rate_pct, usd_vnd_official,
       discount_rate_pct, max_deposit_rate_pct, max_lending_rate_pct, interbank_overnight_pct,
       fetched_at, is_estimate)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    WHERE NOT EXISTS (
      SELECT 1 FROM sbv_rates_history
      WHERE source = ? AND strftime('%Y-%m-%d %H', fetched_at) = strftime('%Y-%m-%d %H', ?)
    )
  `);

  const persist = database.transaction(() => {
    upsertLatest.run(
      source,
      snapshot.overnightRatePct,
      snapshot.refinancingRatePct,
      snapshot.usdVndOfficial,
      snapshot.discountRatePct,
      snapshot.maxDepositRatePct,
      snapshot.maxLendingRatePct,
      snapshot.interbankOvernightPct,
      snapshot.fetchedAt,
      isEstimateInt,
    );
    insertHistory.run(
      source,
      snapshot.overnightRatePct,
      snapshot.refinancingRatePct,
      snapshot.usdVndOfficial,
      snapshot.discountRatePct,
      snapshot.maxDepositRatePct,
      snapshot.maxLendingRatePct,
      snapshot.interbankOvernightPct,
      snapshot.fetchedAt,
      isEstimateInt,
      source,
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

  return { skipped: false, zeroColumns: [] };
}
