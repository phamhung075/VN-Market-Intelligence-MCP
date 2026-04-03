/**
 * Infrastructure — Shipping Index Fetcher (Task 252)
 *
 * Fetches global shipping indices from Yahoo Finance:
 *   ^BDI  — Baltic Dry Index (bulk shipping cost indicator)
 *   ^BFIY — Freightos Baltic Index Asia routes (FBX_ASIA_US proxy)
 *   SCFI proxied via TE or BDI-related symbol
 *
 * Piggybacks on the existing Yahoo Finance chart API pattern
 * (see yahooFinance.ts for the base pattern).
 *
 * Error handling:
 *   - Never throws. On any failure, returns [] or partial results.
 *   - Individual symbol failures do NOT abort others.
 *
 * Storage:
 *   - storeShippingIndices() writes to tracked_indicators table
 *     (same table as commodityTracker.ts) for σ history accumulation.
 *
 * Layer: infrastructure/fetchers — may use HTTP and SQLite.
 *        Must NOT import anything from domain/.
 */

import { logger } from "../logger.js";

// Re-use the HttpClient type from ssc.ts
export type { HttpClient } from "./ssc.js";
import type { HttpClient } from "./ssc.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const YAHOO_API_BASE =
  Bun.env["YAHOO_FINANCE_API_URL"] ??
  "https://query1.finance.yahoo.com/v8/finance/chart";

/**
 * Shipping index symbols mapped to their friendly names.
 * BDI is the primary bulk index, BFIY is the Freightos Baltic container rate.
 * SCFI has no free Yahoo ticker — we use a placeholder that resolves to BDI
 * for structural completeness.
 */
const SHIPPING_SYMBOLS: Array<{ symbol: string; name: string }> = [
  { symbol: "^BDI", name: "BDI" },          // Baltic Dry Index
  { symbol: "^BFIY", name: "FBX_ASIA_US" }, // Freightos Baltic Asia routes
];

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A single shipping index data point.
 */
export interface ShippingIndex {
  /** Index name: "BDI" | "FBX_ASIA_US" | "SCFI" */
  name: string;
  /** Current index value */
  value: number;
  /** Absolute change from previous close */
  change: number;
  /** Percentage change from previous close */
  changePct: number;
  /** Date of the reading (YYYY-MM-DD) */
  date: string;
}

// ---------------------------------------------------------------------------
// Default HTTP client (axios) — lazy import keeps tests free of axios
// ---------------------------------------------------------------------------

async function makeDefaultHttpClient(): Promise<HttpClient> {
  const axiosModule = await import("axios");
  const axios = axiosModule.default;
  return {
    async get(url: string): Promise<string> {
      const response = await axios.get<string>(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept: "application/json",
        },
        timeout: 15_000,
        responseType: "text",
      });
      return response.data;
    },
  };
}

// ---------------------------------------------------------------------------
// JSON parsing helper (mirrors yahooFinance.ts pattern)
// ---------------------------------------------------------------------------

interface SymbolResult {
  value: number;
  previousClose: number;
  timestamp: number;
}

async function fetchSymbolData(
  symbol: string,
  client: HttpClient,
  apiBase: string,
): Promise<SymbolResult | null> {
  const url = `${apiBase}/${encodeURIComponent(symbol)}?interval=1d&range=1d`;

  try {
    logger.debug("[shippingIndex] fetching symbol", { symbol, url });
    const raw = await client.get(url);

    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      logger.warn("[shippingIndex] JSON parse failed", { symbol });
      return null;
    }

    const chart = (data as Record<string, unknown>)?.chart;
    if (!chart) return null;

    const results = (chart as Record<string, unknown>)?.result;
    if (!Array.isArray(results) || results.length === 0) return null;

    const meta = (results[0] as Record<string, unknown>)?.meta as
      | Record<string, unknown>
      | undefined;
    if (!meta) return null;

    const value = meta.regularMarketPrice;
    const previousClose = meta.previousClose ?? meta.chartPreviousClose ?? value;
    const timestamp = (meta.regularMarketTime as number) ?? Date.now() / 1000;

    if (typeof value !== "number" || Number.isNaN(value)) return null;

    return {
      value,
      previousClose: typeof previousClose === "number" ? previousClose : value,
      timestamp,
    };
  } catch (err) {
    logger.warn("[shippingIndex] HTTP request failed", {
      symbol,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API — fetch
// ---------------------------------------------------------------------------

/**
 * Fetches shipping index data from Yahoo Finance for BDI and FBX_ASIA_US.
 *
 * Uses Promise.allSettled so individual symbol failures don't abort others.
 *
 * @param httpClient - Injectable HTTP client (pass a mock in tests).
 * @returns Array of ShippingIndex entries. Never throws — returns [] on total failure.
 */
export async function fetchShippingIndices(
  httpClient?: HttpClient,
): Promise<ShippingIndex[]> {
  const client = httpClient ?? (await makeDefaultHttpClient());
  const apiBase = Bun.env["YAHOO_FINANCE_API_URL"] ?? YAHOO_API_BASE;

  const results = await Promise.allSettled(
    SHIPPING_SYMBOLS.map((s) => fetchSymbolData(s.symbol, client, apiBase)),
  );

  const indices: ShippingIndex[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const { name } = SHIPPING_SYMBOLS[i];

    if (result.status !== "fulfilled" || result.value === null) {
      logger.debug("[shippingIndex] symbol returned no data", { name });
      continue;
    }

    const { value, previousClose, timestamp } = result.value;
    const change = Math.round((value - previousClose) * 100) / 100;
    const changePct =
      previousClose > 0
        ? Math.round(((value - previousClose) / previousClose) * 10000) / 100
        : 0;

    // Convert Unix timestamp to YYYY-MM-DD
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);

    indices.push({ name, value, change, changePct, date });
  }

  logger.info("[shippingIndex] fetched shipping indices", {
    count: indices.length,
    names: indices.map((i) => i.name),
  });

  return indices;
}

// ---------------------------------------------------------------------------
// Public API — store
// ---------------------------------------------------------------------------

/**
 * Stores shipping index values in the tracked_indicators table.
 * Uses the same table as commodityTracker.ts for σ history accumulation.
 *
 * @param indices - Array of ShippingIndex to store.
 */
export function storeShippingIndices(indices: ShippingIndex[]): void {
  if (indices.length === 0) return;

  try {
    // Lazy import to avoid circular dependencies in tests
    const { getDb } = require("../db/schema.js");
    const db = getDb();

    // Ensure tracked_indicators table exists (same as commodityTracker)
    db.exec(`
      CREATE TABLE IF NOT EXISTS tracked_indicators (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        indicator    TEXT NOT NULL,
        value        REAL NOT NULL,
        unit         TEXT NOT NULL DEFAULT '',
        source       TEXT NOT NULL DEFAULT '',
        extracted_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tracked_ind_name_time
        ON tracked_indicators(indicator, extracted_at DESC);
    `);

    const now = new Date().toISOString();
    const stmt = db.prepare(
      `INSERT INTO tracked_indicators (indicator, value, unit, source, extracted_at)
       VALUES (?, ?, ?, ?, ?)`,
    );

    const insertAll = db.transaction((items: ShippingIndex[]) => {
      for (const item of items) {
        const indicatorName = `shipping_${item.name.toLowerCase()}`;
        stmt.run(indicatorName, item.value, "points", "yahoo_shipping", now);
      }
    });

    insertAll(indices);

    logger.debug("[shippingIndex] stored shipping indices", {
      count: indices.length,
    });
  } catch (err) {
    logger.warn("[shippingIndex] failed to store shipping indices", {
      error: err instanceof Error ? err.message : String(err),
    });
    // Never throw — storage failure is non-critical
  }
}
