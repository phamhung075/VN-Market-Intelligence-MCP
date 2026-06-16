/**
 * Infrastructure — HOSE Market Data Fetcher (Task 026)
 *
 * Fetches live price and volume data for Vietnamese stocks listed on HOSE
 * from the VnDirect finfo-api (v4).
 *
 * Primary endpoint:
 *   GET https://finfo-api.vndirect.com.vn/v4/stocks?q=code:VCB,HPG&size=100
 *
 * The API returns prices directly in VND (e.g. 88000 = 88,000 VND).
 * No multiplication factor is needed.
 *
 * Price history is persisted in the `market_prices_history` SQLite table.
 * `getAvgVolume()` computes the N-day average volume from that table.
 *
 * Layer: infrastructure/fetchers — may use HTTP and SQLite, must not import domain/.
 */

import { logger } from "../logger.js";
import { getDb } from "../db/schema.js";
import type { HttpClient } from "./ssc.js";
import { globalRateLimiter } from "../../domain/services/rateLimiter.js";
import { VN_OFFSET_MS } from "../../domain/services/timeConstants.js";
import { BROWSER_UA } from "./browserHeaders.js";

// Re-export HttpClient so consumers can import it directly from this module.
export type { HttpClient } from "./ssc.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Base URL for VnDirect finfo-api v4 (legacy — often unavailable). */
const VNDIRECT_API_BASE = "https://finfo-api.vndirect.com.vn/v4";

/**
 * Base URL for VnDirect api-finfo v4 (reliable alternative).
 * Endpoint: /v4/stock_prices — returns OHLCV for HOSE, HNX, and UPCOM.
 */
const VNDIRECT_STOCK_PRICES_BASE = "https://api-finfo.vndirect.com.vn/v4";

/** Maximum number of stocks per single API request. */
const VNDIRECT_MAX_PAGE_SIZE = 100;

// ---------------------------------------------------------------------------
// Trading session check + exponential backoff
// ---------------------------------------------------------------------------

/**
 * Returns true when the current time (GMT+7) falls within a reasonable window
 * around Vietnamese stock market trading hours on a weekday.
 *
 * Window: Monday–Friday, 08:30–16:00 GMT+7 (30 min buffer each side of 09:00–15:30).
 * Returns false on weekends — VnDirect API tends to be unavailable / returns stale data.
 */
export function isTradingSession(now?: Date): boolean {
  const date = now ?? new Date();
  const gmt7 = new Date(date.getTime() + VN_OFFSET_MS);
  const dayOfWeek = gmt7.getUTCDay(); // 0=Sun … 6=Sat
  if (dayOfWeek < 1 || dayOfWeek > 5) return false;
  const totalMinutes = gmt7.getUTCHours() * 60 + gmt7.getUTCMinutes();
  // 08:30 = 510, 16:00 = 960
  return totalMinutes >= 510 && totalMinutes <= 960;
}

/** Consecutive failure counter for exponential backoff. */
let _consecutiveFailures = 0;
/** Timestamp (ms) before which all fetches are skipped. */
let _backoffUntil = 0;
/** Maximum backoff delay: 30 minutes. */
const MAX_BACKOFF_MS = 30 * 60 * 1000;

/**
 * Reset backoff state (for testing or after manual successful fetch).
 * @internal
 */
export function resetBackoff(): void {
  _consecutiveFailures = 0;
  _backoffUntil = 0;
}

function recordFailure(): void {
  _consecutiveFailures++;
  if (_consecutiveFailures >= 3) {
    // Exponential backoff: 1min, 2min, 4min, 8min, … capped at 30min
    const delayMs = Math.min(
      (2 ** (_consecutiveFailures - 3)) * 60_000,
      MAX_BACKOFF_MS,
    );
    _backoffUntil = Date.now() + delayMs;
    logger.warn("[hose] entering backoff after consecutive failures", {
      failures: _consecutiveFailures,
      backoffMs: delayMs,
    });
  }
}

function recordSuccess(): void {
  if (_consecutiveFailures > 0) {
    logger.info("[hose] VnDirect recovered after failures", {
      previousFailures: _consecutiveFailures,
    });
  }
  _consecutiveFailures = 0;
  _backoffUntil = 0;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A real-time price and volume snapshot for a single stock.
 *
 * @property code          - Stock ticker (e.g. "VCB", "HPG")
 * @property exchange      - Exchange identifier (always 'HOSE' for this fetcher)
 * @property price         - Current/close price in VND
 * @property previousPrice - Previous close price in VND
 * @property changePct     - Percentage change from previous close (e.g. 3.53 = +3.53%)
 * @property volume        - Today's total traded volume (number of shares)
 * @property avgVolume     - N-day average daily volume; 0 if insufficient history
 * @property fetchedAt     - ISO 8601 timestamp when this data was fetched
 */
export interface MarketPrice {
  code: string;
  exchange: string;
  price: number;
  previousPrice: number;
  changePct: number;
  volume: number;
  /** 20-day average daily volume. 0 if no history is available. */
  avgVolume: number;
  fetchedAt: string;
}

/**
 * FIX-MARKET-BREADTH-MISSING + FIX-MARKET-LIQUIDITY-MISSING-TOOL:
 * Market breadth and liquidity data from VnDirect vnmarket_prices endpoint.
 * All breadth fields are from HOSE (VNINDEX composite).
 * Turnover values are in tỷ đồng (divided by 1e9 at parse time).
 */
export interface MarketBreadthAndLiquidity {
  date: string;
  /** Session time string (HH:MM:SS) from API */
  sessionTime: string;
  // Breadth (FIX-MARKET-BREADTH-MISSING)
  /** Number of HOSE stocks with price increase (mã tăng) */
  advances: number;
  /** Number of HOSE stocks with price decrease (mã giảm) */
  declines: number;
  /** Number of HOSE stocks unchanged (mã đứng) */
  noChange: number;
  /** Number of HOSE stocks with no trades (mã không khớp) */
  noTrade: number;
  /** Number of HOSE stocks at ceiling price (mã trần) */
  ceilingStocks: number;
  /** Number of HOSE stocks at floor price (mã sàn) */
  floorStocks: number;
  // Liquidity / turnover (FIX-MARKET-LIQUIDITY-MISSING-TOOL)
  /** Total HOSE turnover in tỷ đồng (nmValue + ptValue) */
  totalTurnoverBn: number;
  /** Order-match turnover only in tỷ đồng */
  nmTurnoverBn: number;
  /** Put-through turnover in tỷ đồng */
  ptTurnoverBn: number;
  /** Pct change of total turnover vs prior session (computed from size=2 query, or null) */
  turnoverDeltaPct: number | null;
  /** Direction of turnover change vs prior session */
  turnoverDirection: "up" | "down" | "flat" | null;
  /** Total accumulated volume (shares) */
  accumulatedVol: number;
  fetchedAt: string;
}

// ---------------------------------------------------------------------------
// VnDirect API response types (internal)
// ---------------------------------------------------------------------------

/** A single stock record as returned by VnDirect finfo-api v4. */
interface VnDirectStockRecord {
  code?: string;
  exchange?: string;
  /** Close/current price in VND */
  close?: number;
  /** Previous close price in VND */
  previousClose?: number;
  /** Price change in VND */
  change?: number;
  /** Percentage change */
  pctChange?: number;
  /** Total traded quantity (shares) */
  nmTotalTradedQty?: number;
}

/** Top-level shape of the VnDirect API response. */
interface VnDirectResponse {
  data?: VnDirectStockRecord[];
  totalCount?: number;
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
          "User-Agent": BROWSER_UA,
          Accept: "application/json",
        },
        timeout: 5_000,
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
 * Builds the VnDirect finfo-api URL for a list of stock codes.
 *
 * Example:
 *   buildVnDirectUrl(["VCB", "HPG"])
 *   → "https://finfo-api.vndirect.com.vn/v4/stocks?q=code:VCB,HPG&size=100"
 *
 * @param codes - Array of stock tickers (uppercase).
 * @returns Fully qualified API URL string.
 */
export function buildVnDirectUrl(codes: string[]): string {
  const codeList = codes.map((c) => c.toUpperCase()).join(",");
  const params = new URLSearchParams({
    q: `code:${codeList}`,
    size: String(VNDIRECT_MAX_PAGE_SIZE),
  });
  return `${VNDIRECT_API_BASE}/stocks?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Response parser
// ---------------------------------------------------------------------------

/**
 * Parses the raw JSON string from VnDirect into an array of VnDirectStockRecord.
 *
 * @param json - Raw JSON string from the API.
 * @returns Parsed stock records. Empty array on parse error.
 */
export function parseVnDirectResponse(json: string): VnDirectStockRecord[] {
  try {
    const parsed: unknown = JSON.parse(json);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("data" in parsed)
    ) {
      return [];
    }

    const response = parsed as VnDirectResponse;
    if (!Array.isArray(response.data)) {
      return [];
    }

    return response.data;
  } catch {
    return [];
  }
}

/**
 * Maps a VnDirectStockRecord to a MarketPrice.
 *
 * VnDirect returns prices in VND directly (e.g. 88000 = 88,000 VND).
 * avgVolume is always 0 here — it is populated by a separate history query.
 *
 * @param record    - Raw API record.
 * @param fetchedAt - ISO 8601 timestamp for this fetch.
 * @returns MarketPrice or null if the record lacks a stock code.
 */
function recordToMarketPrice(
  record: VnDirectStockRecord,
  fetchedAt: string,
): MarketPrice | null {
  if (!record.code) return null;

  return {
    code: record.code,
    exchange: record.exchange ?? "HOSE",
    price: record.close ?? 0,
    previousPrice: record.previousClose ?? 0,
    changePct: record.pctChange ?? 0,
    volume: record.nmTotalTradedQty ?? 0,
    avgVolume: 0, // populated separately via getAvgVolume()
    fetchedAt,
  };
}

// ---------------------------------------------------------------------------
// SQLite history helpers
// ---------------------------------------------------------------------------

/**
 * Persists an array of MarketPrice snapshots into the `market_prices_history`
 * table. Uses INSERT OR REPLACE to handle duplicate (code, fetched_at) pairs
 * gracefully.
 *
 * Also updates the `market_prices` snapshot table (latest price per stock).
 *
 * Note: `market_prices_history` (with exchange column) is created by
 * initDatabase() in src/infrastructure/db/schema.ts — no inline DDL needed.
 *
 * @param prices - Array of MarketPrice snapshots to persist.
 */
export async function storeMarketPrices(prices: MarketPrice[]): Promise<void> {
  if (prices.length === 0) return;

  const db = getDb();

  const insertHistory = db.prepare(`
    INSERT OR REPLACE INTO market_prices_history (code, price, volume, exchange, fetched_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const upsertLatest = db.prepare(`
    INSERT OR REPLACE INTO market_prices (code, price, change_pct, volume, exchange, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  // Run all inserts in a single transaction for performance
  const insertAll = db.transaction((rows: MarketPrice[]) => {
    for (const p of rows) {
      insertHistory.run(p.code, p.price, p.volume, p.exchange, p.fetchedAt);
      upsertLatest.run(p.code, p.price, p.changePct, p.volume, p.exchange, p.fetchedAt);
    }
  });

  insertAll(prices);

  logger.debug("[hose] stored market prices", { count: prices.length });
}

/**
 * Calculates the average daily volume for a stock over the last N days
 * by querying the `market_prices_history` table.
 *
 * Returns 0 if there are no rows for the stock in the history table.
 *
 * @param code - Stock ticker (e.g. "VCB").
 * @param days - Number of most-recent history rows to average. Defaults to 20.
 * @returns Average volume over the last `days` entries, or 0 if no data.
 */
export async function getAvgVolume(code: string, days = 20): Promise<number> {
  const db = getDb();

  const row = db
    .query<{ avg_volume: number | null }, [string, number]>(`
      SELECT AVG(volume) AS avg_volume
      FROM (
        SELECT volume
        FROM market_prices_history
        WHERE code = ?
        ORDER BY fetched_at DESC
        LIMIT ?
      )
    `)
    .get(code, days);

  return row?.avg_volume ?? 0;
}

// ---------------------------------------------------------------------------
// VN-Index dedicated endpoint — api-finfo.vndirect.com.vn/v4/vnmarket_prices
// ---------------------------------------------------------------------------

/** VnDirect vnmarket_prices API returns index data (VNINDEX, HNX-INDEX, etc.). */
const VNDIRECT_VNMARKET_URL =
  "https://api-finfo.vndirect.com.vn/v4/vnmarket_prices";

/** Shape of the vnmarket_prices API response. */
interface VnMarketPriceRecord {
  code?: string;
  close?: number;
  open?: number;
  high?: number;
  low?: number;
  change?: number;
  pctChange?: number;
  accumulatedVol?: number;
  // FIX-MARKET-BREADTH-MISSING: breadth fields
  advances?: number;
  declines?: number;
  noChange?: number;
  noTrade?: number;
  ceilingStocks?: number;
  floorStocks?: number;
  // FIX-MARKET-LIQUIDITY-MISSING-TOOL: turnover fields (raw VND)
  accumulatedVal?: number;
  nmVolume?: number;
  nmValue?: number;
  ptVolume?: number;
  ptValue?: number;
  valChgPctCr1d?: number;
  date?: string;
}

/**
 * Fetches VN-Index (or other index) data from VnDirect vnmarket_prices API.
 * This endpoint is separate from the stock-price endpoint and reliably returns
 * index values even when the stock endpoint is down.
 *
 * @param indexCode - Index code, e.g. "VNINDEX"
 * @returns MarketPrice or null if unavailable.
 */
export async function fetchVnIndex(
  indexCode = "VNINDEX",
): Promise<MarketPrice | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const url = `${VNDIRECT_VNMARKET_URL}?sort=date&q=code:${encodeURIComponent(indexCode)}&size=1&page=1`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`vnmarket_prices HTTP ${response.status}`);
    }

    const json = (await response.json()) as {
      data?: VnMarketPriceRecord[];
    };
    const rec = json.data?.[0];
    if (!rec?.code || rec.close == null) return null;

    const fetchedAt = new Date().toISOString();
    const prevPrice =
      rec.change != null ? rec.close - rec.change : rec.close;

    return {
      code: rec.code,
      exchange: "HOSE",
      price: rec.close,
      previousPrice: prevPrice,
      changePct:
        rec.pctChange != null
          ? Math.round(rec.pctChange * 100) / 100
          : 0,
      volume: rec.accumulatedVol ?? 0,
      avgVolume: 0,
      fetchedAt,
    };
  } catch (err) {
    logger.debug("[hose] vnmarket_prices fetch failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// FIX-MARKET-BREADTH-MISSING + FIX-MARKET-LIQUIDITY-MISSING-TOOL
// Fetch market breadth + liquidity from the same vnmarket_prices endpoint.
// Uses size=2 so we can compute delta vs prior session from two rows.
// ---------------------------------------------------------------------------

/**
 * Fetches HOSE market breadth (advances/declines/etc.) and liquidity (turnover in tỷ đồng)
 * from the VnDirect vnmarket_prices endpoint.
 *
 * The same URL already polled by fetchVnIndex() — zero extra network cost.
 * size=2 returns today + yesterday for delta computation.
 *
 * @param indexCode - Index code (default: "VNINDEX" = HOSE composite)
 * @returns MarketBreadthAndLiquidity or null if unavailable
 */
export async function fetchVnIndexBreadthAndLiquidity(
  indexCode = "VNINDEX",
): Promise<MarketBreadthAndLiquidity | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const url = `${VNDIRECT_VNMARKET_URL}?sort=date&q=code:${encodeURIComponent(indexCode)}&size=2&page=1`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`vnmarket_prices breadth HTTP ${response.status}`);
    }

    const json = (await response.json()) as {
      data?: VnMarketPriceRecord[];
    };

    const today = json.data?.[0];
    const yesterday = json.data?.[1];

    if (!today?.code) return null;

    // Turnover in tỷ đồng
    const totalTurnoverBn = today.accumulatedVal != null ? today.accumulatedVal / 1e9 : 0;
    const nmTurnoverBn = today.nmValue != null ? today.nmValue / 1e9 : 0;
    const ptTurnoverBn = today.ptValue != null ? today.ptValue / 1e9 : 0;

    // Delta vs prior session
    let turnoverDeltaPct: number | null = null;
    let turnoverDirection: "up" | "down" | "flat" | null = null;

    if (yesterday?.accumulatedVal != null && yesterday.accumulatedVal > 0 && today.accumulatedVal != null) {
      const delta = ((today.accumulatedVal - yesterday.accumulatedVal) / yesterday.accumulatedVal) * 100;
      turnoverDeltaPct = Math.round(delta * 100) / 100;
      turnoverDirection = delta > 0.5 ? "up" : delta < -0.5 ? "down" : "flat";
    }

    const fetchedAt = new Date().toISOString();

    return {
      date: today.date ?? fetchedAt.slice(0, 10),
      sessionTime: fetchedAt.slice(11, 19),
      // Breadth — cast float→int (API returns floats like 179.0)
      advances: Math.round(today.advances ?? 0),
      declines: Math.round(today.declines ?? 0),
      noChange: Math.round(today.noChange ?? 0),
      noTrade: Math.round(today.noTrade ?? 0),
      ceilingStocks: Math.round(today.ceilingStocks ?? 0),
      floorStocks: Math.round(today.floorStocks ?? 0),
      // Liquidity
      totalTurnoverBn: Math.round(totalTurnoverBn * 100) / 100,
      nmTurnoverBn: Math.round(nmTurnoverBn * 100) / 100,
      ptTurnoverBn: Math.round(ptTurnoverBn * 100) / 100,
      turnoverDeltaPct,
      turnoverDirection,
      accumulatedVol: today.accumulatedVol ?? 0,
      fetchedAt,
    };
  } catch (err) {
    logger.debug("[hose] vnmarket_prices breadth/liquidity fetch failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// CafeF fallback — banggia.cafef.vn returns all HOSE stocks as JSON
// ---------------------------------------------------------------------------

/** CafeF banggia endpoint (returns all HOSE stocks, ~109 KB). */
const CAFEF_BANGGIA_URL = "https://banggia.cafef.vn/stockhandler.ashx?index=1";

/** Shape of a single stock in CafeF banggia response. */
interface CafefStockRecord {
  /** Stock code */
  a: string;
  /** Reference / previous close price (×1000 VND) */
  b: number;
  /** Current / last matched price (×1000 VND) */
  l: number;
  /** Change from reference (×1000 VND) */
  k: number;
  /** Total volume */
  totalvolume: number;
}

/**
 * Fetches HOSE prices from CafeF banggia endpoint.
 * Returns only the requested codes. Prices are converted to VND (×1000).
 */
async function fetchFromCafef(
  codes: string[],
  fetchedAt: string,
): Promise<MarketPrice[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(CAFEF_BANGGIA_URL, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`CafeF HTTP ${response.status}`);
    }

    const data: CafefStockRecord[] = await response.json();
    const codeSet = new Set(codes.map((c) => c.toUpperCase()));
    const prices: MarketPrice[] = [];

    for (const rec of data) {
      if (!codeSet.has(rec.a)) continue;
      const price = rec.l * 1000;       // CafeF returns ×1000 VND
      const prevPrice = rec.b * 1000;
      const changePct = prevPrice > 0 ? ((price - prevPrice) / prevPrice) * 100 : 0;

      prices.push({
        code: rec.a,
        exchange: "HOSE",
        price,
        previousPrice: prevPrice,
        changePct: Math.round(changePct * 100) / 100,
        volume: rec.totalvolume ?? 0,
        avgVolume: 0,
        fetchedAt,
      });
    }

    return prices;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// VnDirect stock_prices fallback — api-finfo.vndirect.com.vn (works for all exchanges)
// ---------------------------------------------------------------------------

/** Shape of a single record from the stock_prices API. */
interface VnDirectStockPriceRecord {
  code?: string;
  floor?: string;
  close?: number;
  open?: number;
  high?: number;
  low?: number;
  basicPrice?: number;
  change?: number;
  pctChange?: number;
  nmVolume?: number;
  date?: string;
}

/**
 * Fetches stock prices from the reliable VnDirect stock_prices API.
 * This endpoint works for HOSE, HNX, and UPCOM simultaneously.
 *
 * Endpoint: GET /v4/stock_prices?sort=date&q=code:{CODES}~date:gte:{TODAY}&size={N}
 */
export async function fetchFromVnDirectStockPrices(
  codes: string[],
  fetchedAt: string,
  exchange = "HOSE",
): Promise<MarketPrice[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const codeList = codes.map((c) => c.toUpperCase()).join(",");
    const url = `${VNDIRECT_STOCK_PRICES_BASE}/stock_prices?sort=date&q=code:${codeList}~date:gte:${today}&size=${codes.length * 2}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`stock_prices HTTP ${response.status}`);
    }

    const json = (await response.json()) as { data?: VnDirectStockPriceRecord[] };
    if (!Array.isArray(json.data)) return [];

    // Only keep the latest date per code
    const latestByCode = new Map<string, VnDirectStockPriceRecord>();
    for (const rec of json.data) {
      if (!rec.code) continue;
      const existing = latestByCode.get(rec.code);
      if (!existing || (rec.date && existing.date && rec.date > existing.date)) {
        latestByCode.set(rec.code, rec);
      }
    }

    const prices: MarketPrice[] = [];
    for (const rec of latestByCode.values()) {
      if (!rec.code || rec.close == null) continue;
      const prevPrice = rec.change != null ? rec.close - rec.change : (rec.basicPrice ?? rec.close);

      prices.push({
        code: rec.code,
        exchange: rec.floor ?? exchange,
        price: rec.close * 1000,        // stock_prices returns ×1000 VND
        previousPrice: prevPrice * 1000,
        changePct: rec.pctChange != null ? Math.round(rec.pctChange * 100) / 100 : 0,
        volume: rec.nmVolume ?? 0,
        avgVolume: 0,
        fetchedAt,
      });
    }

    return prices;
  } catch (err) {
    logger.debug("[hose] VnDirect stock_prices fallback failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetches live price and volume data for a list of HOSE-listed stocks.
 *
 * Strategy: VnDirect legacy (5s) → VnDirect stock_prices (10s) → CafeF banggia (10s).
 *
 * - Returns an empty array immediately if `codes` is empty.
 * - Returns an empty array (without throwing) on any network or parse error.
 * - `avgVolume` is always 0 in the returned records; call `getAvgVolume()`
 *   separately after storing history if you need the rolling average.
 *
 * @param codes      - List of stock tickers to fetch (e.g. ["VCB", "HPG"]).
 * @param httpClient - Optional HTTP client; defaults to an axios-backed client.
 *                     Inject a mock in tests to avoid real network calls.
 * @param options    - Optional flags: `force` bypasses market-hours + backoff guards.
 * @returns Promise resolving to an array of MarketPrice (empty on error).
 */
export async function fetchHosePrices(
  codes: string[],
  httpClient?: HttpClient,
  options?: { force?: boolean },
): Promise<MarketPrice[]> {
  if (codes.length === 0) {
    logger.debug("[hose] no codes requested — returning empty");
    return [];
  }

  const force = options?.force ?? false;

  // Guard 1: Skip outside trading session (weekends + off-hours)
  if (!force && !isTradingSession()) {
    logger.debug("[hose] market closed — skipping fetch", { codes });
    return [];
  }

  // Guard 2: Rate limit — skip if called too soon (bypassed in test mode via httpClient)
  if (!httpClient && !globalRateLimiter.canCall("api-finfo.vndirect.com.vn")) {
    logger.debug("[hose] rate-limited — skipping fetch", {
      waitMs: globalRateLimiter.getWaitMs("api-finfo.vndirect.com.vn"),
    });
    return [];
  }
  if (!httpClient) globalRateLimiter.recordCall("api-finfo.vndirect.com.vn");

  // Guard 3: Exponential backoff after consecutive failures
  if (!force && Date.now() < _backoffUntil) {
    const remainingSec = Math.round((_backoffUntil - Date.now()) / 1000);
    logger.debug("[hose] in backoff period — skipping fetch", {
      codes,
      remainingSec,
      consecutiveFailures: _consecutiveFailures,
    });
    return [];
  }

  const fetchedAt = new Date().toISOString();

  // --- Strategy: VnDirect legacy (5s) → VnDirect stock_prices (10s) → CafeF (10s) ---

  // Source 1: VnDirect legacy finfo-api (often down, 5s fail-fast)
  try {
    const client = httpClient ?? (await makeDefaultHttpClient());
    const url = buildVnDirectUrl(codes);

    logger.debug("[hose] trying VnDirect legacy", { codes });
    const json = await client.get(url);
    const records = parseVnDirectResponse(json);

    const prices: MarketPrice[] = [];
    for (const record of records) {
      const price = recordToMarketPrice(record, fetchedAt);
      if (price !== null) prices.push(price);
    }

    if (prices.length > 0) {
      logger.info("[hose] fetched from VnDirect legacy", {
        requested: codes.length,
        received: prices.length,
      });
      recordSuccess();
      return prices;
    }
  } catch {
    logger.debug("[hose] VnDirect legacy unavailable, trying stock_prices");
  }

  // Source 2: VnDirect stock_prices API (reliable, works for all exchanges)
  // Skip when an httpClient is injected (test mode — don't make real network calls).
  if (!httpClient) {
    try {
      const prices = await fetchFromVnDirectStockPrices(codes, fetchedAt, "HOSE");
      if (prices.length > 0) {
        logger.info("[hose] fetched from VnDirect stock_prices", {
          requested: codes.length,
          received: prices.length,
        });
        recordSuccess();
        return prices;
      }
    } catch {
      logger.debug("[hose] VnDirect stock_prices failed, trying CafeF");
    }
  }

  // Source 3: CafeF banggia (HOSE stocks only)
  // Skip when an httpClient is injected (test mode — don't make real network calls).
  if (!httpClient) {
    try {
      const prices = await fetchFromCafef(codes, fetchedAt);
      if (prices.length > 0) {
        logger.info("[hose] fetched from CafeF fallback", {
          requested: codes.length,
          received: prices.length,
        });
        recordSuccess();
        return prices;
      }
    } catch (err) {
      logger.warn("[hose] CafeF fallback also failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Source 4: vnstock Python bridge (last resort — slowest but most reliable)
  if (!httpClient) {
    try {
      const { fetchVnstockPrices } = await import("./vnstockBridge.js");
      const vnPrices = await fetchVnstockPrices(codes);
      if (vnPrices.length > 0) {
        // Resolve exchange from watchlist DB if available
        const exchangeMap = new Map<string, string>();
        try {
          const rows = getDb()
            .prepare<{ code: string; exchange: string }, []>(
              "SELECT code, exchange FROM watchlist",
            )
            .all();
          for (const r of rows) exchangeMap.set(r.code, r.exchange);
        } catch { /* best-effort */ }

        const prices: MarketPrice[] = vnPrices.map((p) => ({
          code: p.code,
          price: p.close,
          previousPrice: p.open,
          changePct: p.changePct,
          volume: p.volume,
          avgVolume: 0,
          exchange: exchangeMap.get(p.code) ?? "HOSE",
          fetchedAt,
        }));
        logger.info("[hose] fetched from vnstock bridge (tier 4)", {
          requested: codes.length,
          received: prices.length,
        });
        recordSuccess();
        return prices;
      }
    } catch (err) {
      logger.warn("[hose] vnstock bridge also failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // All 4 sources failed
  const onlyIndex = codes.every((c) => c.toUpperCase().includes("INDEX"));
  if (!onlyIndex) {
    recordFailure();
    logger.error("[hose] all 4 price sources failed", {
      codes,
      consecutiveFailures: _consecutiveFailures,
    });
  } else {
    logger.debug("[hose] index-only request — stock sources don't have index data", { codes });
  }
  return [];
}
