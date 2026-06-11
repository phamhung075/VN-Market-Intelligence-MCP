/**
 * priceHistoryServeHandler.ts — GET /api/price-history/:ticker
 *
 * TASK-17 P2-1a: Serve a clean frontend DTO backed by the live stock-price
 * Go service (port 5000). Backs the "Price & Technical" analyst page.
 *
 * Mirrors macroRegimeHandler.ts pattern exactly:
 *   – Ticker extracted from pathname by server.ts (same pattern as analysis-brief).
 *   – Proxies upstream GET /price/history?code=<TICKER>&days=<N> via HTTP.
 *   – Reshapes into a stable frontend envelope.
 *   – On upstream failure: data_source="unavailable", candles=[], latest=null, 502.
 *   – Never fabricates prices. Never silently fails.
 *
 * Upstream: GET http://stock-price:5000/price/history?code=<TICKER>&days=<N>
 * Env SSOT:  STOCK_PRICE_URL (default: http://localhost:5000)
 *            Resolved via getStockPriceBaseUrl() — same SSOT used by microservice clients.
 *
 * Response shape (200 OK):
 *  {
 *    ticker:       string,           // uppercase ticker, e.g. "VCB"
 *    generated_at: string,           // ISO 8601 server clock
 *    data_source:  "live" | "unavailable",
 *    stale_served: boolean,
 *    count:        number,
 *    latest: {                       // null when <2 candles
 *      date:       string,
 *      close:      number,
 *      change_abs: number | null,    // close - prior_close
 *      change_pct: number | null,    // (close - prior_close) / prior_close * 100
 *    } | null,
 *    candles: Array<{                // ascending by date (oldest→newest)
 *      date:   string,
 *      open:   number,
 *      high:   number,
 *      low:    number,
 *      close:  number,
 *      volume: number,
 *    }>,
 *  }
 *
 * 400 on invalid ticker (empty or non-alnum).
 * 502 on upstream failure (body carries data_source:"unavailable").
 *
 * DDD Layer: interface — imports only getStockPriceBaseUrl from tools/market-data module.
 * No domain imports.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { getStockPriceBaseUrl } from "../tools/market-data/stockPriceHttpClient.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types — upstream history shape
// ─────────────────────────────────────────────────────────────────────────────

interface UpstreamCandle {
  date:    string;
  open:    number;
  high:    number;
  low:     number;
  close:   number;
  volume?: number;
}

interface UpstreamPriceHistory {
  code:    string;
  history: UpstreamCandle[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Types — served envelope
// ─────────────────────────────────────────────────────────────────────────────

export interface PriceHistoryCandle {
  date:   string;
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
}

export interface PriceHistoryLatest {
  date:       string;
  close:      number;
  change_abs: number | null;
  change_pct: number | null;
}

export interface PriceHistoryServeResponse {
  ticker:       string;
  generated_at: string;
  data_source:  "live" | "unavailable";
  stale_served: boolean;
  count:        number;
  latest:       PriceHistoryLatest | null;
  candles:      PriceHistoryCandle[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const HISTORY_TIMEOUT_MS = 8_000;
const DEFAULT_DAYS       = 90;
const MIN_DAYS           = 1;
const MAX_DAYS           = 365;

// Valid ticker: non-empty, uppercase alphanumeric, 1–20 chars
const TICKER_RE = /^[A-Z0-9]{1,20}$/;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Build a safe unavailable envelope — used on upstream failure. */
function unavailableEnvelope(ticker: string, now: Date): PriceHistoryServeResponse {
  return {
    ticker,
    generated_at: now.toISOString(),
    data_source:  "unavailable",
    stale_served: true,
    count:        0,
    latest:       null,
    candles:      [],
  };
}

/** Compute latest block from the last two ascending candles. */
function computeLatest(candles: PriceHistoryCandle[]): PriceHistoryLatest | null {
  if (candles.length < 2) {
    if (candles.length === 1) {
      // One candle — no prior close, so change is null
      const c = candles[0]!;
      return { date: c.date, close: c.close, change_abs: null, change_pct: null };
    }
    return null;
  }
  const last = candles[candles.length - 1]!;
  const prev = candles[candles.length - 2]!;
  const change_abs = last.close - prev.close;
  const change_pct = prev.close > 0
    ? (change_abs / prev.close) * 100
    : null;
  return {
    date:       last.date,
    close:      last.close,
    change_abs,
    change_pct,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Core fetch + reshape — exported for testability
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch upstream price history and reshape to the flat frontend DTO.
 *
 * @param ticker  - Validated uppercase ticker (e.g. "VCB")
 * @param days    - Days to request from upstream (already clamped)
 * @param baseUrl - Override base URL (defaults to getStockPriceBaseUrl())
 * @throws on network error or non-2xx response
 */
export async function fetchAndReshapePriceHistory(
  ticker: string,
  days:   number,
  baseUrl?: string,
): Promise<PriceHistoryServeResponse> {
  const base = baseUrl ?? getStockPriceBaseUrl();
  const url  = `${base}/price/history?code=${encodeURIComponent(ticker)}&days=${days}`;
  const now  = new Date();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HISTORY_TIMEOUT_MS);

  let raw: UpstreamPriceHistory;
  try {
    const resp = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });

    if (!resp.ok) {
      throw new Error(`stock-price /price/history returned ${resp.status}`);
    }

    raw = (await resp.json()) as UpstreamPriceHistory;
  } finally {
    clearTimeout(timer);
  }

  // Sort ascending by date (oldest → newest) so frontend can chart left-to-right
  const rawHistory = Array.isArray(raw.history) ? raw.history : [];
  const sorted = [...rawHistory].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );

  const candles: PriceHistoryCandle[] = sorted.map((c) => ({
    date:   typeof c.date   === "string" ? c.date   : "",
    open:   typeof c.open   === "number" ? c.open   : 0,
    high:   typeof c.high   === "number" ? c.high   : 0,
    low:    typeof c.low    === "number" ? c.low    : 0,
    close:  typeof c.close  === "number" ? c.close  : 0,
    volume: typeof c.volume === "number" ? c.volume : 0,
  }));

  const latest = computeLatest(candles);

  return {
    ticker:       ticker.toUpperCase(),
    generated_at: now.toISOString(),
    data_source:  "live",
    stale_served: false,
    count:        candles.length,
    latest,
    candles,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle GET /api/price-history/:ticker.
 *
 * @param req     - Incoming HTTP request (for query params: days)
 * @param res     - HTTP response
 * @param ticker  - Ticker extracted from URL path segment by server.ts
 * @param baseUrl - Optional upstream base URL override (for tests)
 */
export async function handleGetPriceHistory(
  req:      IncomingMessage,
  res:      ServerResponse,
  ticker:   string,
  baseUrl?: string,
): Promise<void> {
  // ── Validate ticker ─────────────────────────────────────────────────────
  const upperTicker = (ticker ?? "").trim().toUpperCase();
  if (!upperTicker || !TICKER_RE.test(upperTicker)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid_ticker", ticker: ticker ?? "" }));
    return;
  }

  // ── Parse days query param ───────────────────────────────────────────────
  const url       = new URL(req.url ?? "/", "http://localhost");
  const rawDays   = url.searchParams.get("days");
  const parsedDays = rawDays !== null ? parseInt(rawDays, 10) : DEFAULT_DAYS;
  const days = Number.isNaN(parsedDays)
    ? DEFAULT_DAYS
    : Math.max(MIN_DAYS, Math.min(MAX_DAYS, parsedDays));

  // ── Fetch + reshape ──────────────────────────────────────────────────────
  try {
    const body = await fetchAndReshapePriceHistory(upperTicker, days, baseUrl);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  } catch (_err) {
    // Upstream unreachable or non-2xx: degrade honestly, never fabricate.
    const envelope = unavailableEnvelope(upperTicker, new Date());
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify(envelope));
  }
}
