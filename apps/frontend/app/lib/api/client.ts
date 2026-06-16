/**
 * Tier 3: API service layer — typed fetch client for api-gateway.
 *
 * ALL backend calls go through api-gateway (env: API_GATEWAY_URL, default port 4000).
 * NEVER import or call microservice ports (5000–5008) directly from this layer.
 *
 * Pattern:
 *   1. Define a domain response type in app/domain/<resource>.ts
 *   2. Add a typed fetch function here
 *   3. Write a Vitest test in app/__tests__/NNN-api-<endpoint>.test.ts FIRST (TDD)
 *   4. Only then wire into a Remix loader
 */

// Cluster C bounded-fetch helpers — safeFetch / safeFetchOrNull with 10s deadline.
// ESM .js extension required per dev-standards coding rule.
import { safeFetch, safeFetchOrNull } from "./fetchUtils.js";

// Server-side: use Docker service name via env (API_GATEWAY_URL=http://api-gateway:4000 in Docker)
// Client-side: never — all API calls must go through Remix loaders (SSR).
// Guard against `process` being undefined when Vite bundles this module into the browser
// chunk (e.g. tree-shaking misses a re-export path). All real call sites live inside Remix
// loader functions which execute on Node, so this fallback is never reachable at runtime.
const API_GATEWAY_URL =
  typeof process !== "undefined" && process.env["API_GATEWAY_URL"]
    ? process.env["API_GATEWAY_URL"]
    : "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Base fetch wrapper. Throws ApiError on non-2xx responses.
 * Use typed wrappers below rather than calling this directly.
 */
export async function apiGet<T>(path: string): Promise<T> {
  const url = `${API_GATEWAY_URL}${path}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new ApiError(
      response.status,
      `GET ${path} failed: ${response.status} ${response.statusText}`,
    );
  }

  return response.json() as Promise<T>;
}

/**
 * Health check — used by the dashboard to surface api-gateway status.
 * Endpoint: GET /health
 */
export interface GatewayHealth {
  status: "ok" | "degraded" | "down";
  services: Record<string, "ok" | "degraded" | "down">;
  timestamp: string;
  latencies?: Record<string, number>;
  checkedAt?: string;
  /**
   * Optional capability map from FOU-3-GW enrichment.
   * Absent when the gateway has no capability prober configured (older payloads).
   * keyed by service short_key (same keys as `services`).
   */
  capabilities?: Record<string, { capability: string; capabilityNote?: string }>;
}

export async function fetchGatewayHealth(): Promise<GatewayHealth> {
  return apiGet<GatewayHealth>("/health");
}

// --------------------------------------------------------------------------
// Service health
// --------------------------------------------------------------------------

import type { ServiceHealth } from "~/domain/health";

/**
 * Per-service health detail.
 * Endpoint: GET /health/:service
 */
export async function fetchServiceHealth(service: string): Promise<ServiceHealth> {
  const raw = await apiGet<unknown>(`/health/${service}`);
  if (raw !== null && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    // Accept both camelCase and snake_case / alternative field names from the gateway.
    const latency =
      typeof obj["latency"] === "number"
        ? obj["latency"]
        : typeof obj["latencyMs"] === "number"
          ? obj["latencyMs"]
          : typeof obj["latency_ms"] === "number"
            ? obj["latency_ms"]
            : undefined;
    const checkedAt =
      typeof obj["checkedAt"] === "string"
        ? obj["checkedAt"]
        : typeof obj["checked_at"] === "string"
          ? obj["checked_at"]
          : typeof obj["timestamp"] === "string"
            ? obj["timestamp"]
            : undefined;
    return {
      service,
      status: isServiceStatus(obj["status"]) ? obj["status"] : "down",
      latency,
      checkedAt,
      error: typeof obj["error"] === "string" ? obj["error"] : undefined,
    };
  }
  return { service, status: "down" };
}

function isServiceStatus(v: unknown): v is "ok" | "degraded" | "down" {
  return v === "ok" || v === "degraded" || v === "down";
}

// --------------------------------------------------------------------------
// News headlines
// --------------------------------------------------------------------------

import type { Headline } from "~/domain/news";

function toHeadline(item: unknown): Headline | null {
  if (item === null || typeof item !== "object") return null;
  const obj = item as Record<string, unknown>;
  // Article (news-fetch) uses `headline`; generic schemas may use `title`.
  const title =
    typeof obj["title"] === "string"
      ? obj["title"]
      : typeof obj["headline"] === "string"
        ? obj["headline"]
        : null;
  if (title === null) return null;
  return {
    title,
    url: typeof obj["url"] === "string" ? obj["url"] : undefined,
    publishedAt: typeof obj["publishedAt"] === "string" ? obj["publishedAt"] : undefined,
    source: typeof obj["source"] === "string" ? obj["source"] : undefined,
    summary: typeof obj["summary"] === "string" ? obj["summary"] : undefined,
  };
}

function parseHeadlines(raw: unknown): Headline[] {
  // Handle FetchResult envelope: { source, articles: Article[], fetchedAt, method, error }
  const items: unknown[] =
    raw !== null && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>)["articles"])
      ? ((raw as Record<string, unknown>)["articles"] as unknown[])
      : Array.isArray(raw)
        ? raw
        : [];
  return items.map(toHeadline).filter((h): h is Headline => h !== null);
}

/**
 * Reuters headlines.
 * Endpoint: GET /news/reuters/headlines
 */
export async function fetchReutersHeadlines(): Promise<Headline[]> {
  const raw = await apiGet<unknown>("/news/reuters/headlines");
  return parseHeadlines(raw);
}

/**
 * Bloomberg headlines.
 * Endpoint: GET /news/bloomberg/headlines
 */
export async function fetchBloombergHeadlines(): Promise<Headline[]> {
  const raw = await apiGet<unknown>("/news/bloomberg/headlines");
  return parseHeadlines(raw);
}

// --------------------------------------------------------------------------
// Fetch status (F-3 — FETCH-OPS-PAGE-TRUTH)
// --------------------------------------------------------------------------

import type { FetchStatus } from "~/domain/market";

/**
 * Aggregated fetch operations status.
 * Endpoint: GET /api/fetch-status
 * Returns: sources[] freshness, vpsProxy health (5 legs), bctcPipeline counts.
 * Client call path: /api/* virtual alias on gateway (NoProbe=true, full path preserved)
 * → mcp-server:3000/api/fetch-status.
 */
export async function fetchFetchStatus(): Promise<FetchStatus> {
  return apiGet<FetchStatus>("/api/fetch-status");
}

// --------------------------------------------------------------------------
// Macro data
// --------------------------------------------------------------------------

import type { MacroData } from "~/domain/market";

/**
 * External macro snapshot.
 * Endpoint: GET /macro/external
 */
export async function fetchMacroExternal(): Promise<MacroData> {
  const raw = await apiGet<unknown>("/macro/external");
  if (raw !== null && typeof raw === "object") {
    return raw as MacroData;
  }
  return { status: "unavailable" };
}

// --------------------------------------------------------------------------
// Price history
// --------------------------------------------------------------------------

import type { PricePoint } from "~/domain/market";

function toPricePoint(item: unknown): PricePoint | null {
  if (item === null || typeof item !== "object") return null;
  const obj = item as Record<string, unknown>;
  if (typeof obj["close"] !== "number") return null;
  return {
    date: typeof obj["date"] === "string" ? obj["date"] : "",
    code: typeof obj["code"] === "string" ? obj["code"] : "",
    open: typeof obj["open"] === "number" ? obj["open"] : undefined,
    high: typeof obj["high"] === "number" ? obj["high"] : undefined,
    low: typeof obj["low"] === "number" ? obj["low"] : undefined,
    close: obj["close"],
    volume: typeof obj["volume"] === "number" ? obj["volume"] : undefined,
  };
}

/**
 * Price history for a ticker.
 * Endpoint: GET /stock/price/history?code=<ticker>&days=<N> (default 30)
 * Response shape: { code: string, history: DailyOHLCV[] }
 */
export async function fetchPriceHistory(code: string, days = 30): Promise<PricePoint[]> {
  const raw = await apiGet<unknown>(`/stock/price/history?code=${encodeURIComponent(code)}&days=${days}`);
  const items: unknown[] =
    raw !== null && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>)["history"])
      ? ((raw as Record<string, unknown>)["history"] as unknown[])
      : Array.isArray(raw)
        ? raw
        : [];
  return items.map(toPricePoint).filter((p): p is PricePoint => p !== null);
}

// --------------------------------------------------------------------------
// Kinh Dich
// --------------------------------------------------------------------------

import type { KinhDichMarket, KinhDichReading, MacroSnapshot } from "~/domain/market";

/**
 * Overall market hexagram reading.
 * Endpoint: GET /kinh-dich/market
 */
export async function fetchKinhDichMarket(): Promise<KinhDichMarket> {
  return apiGet<KinhDichMarket>("/kinh-dich/market");
}

/**
 * Per-stock hexagram reading.
 * Endpoint: GET /kinh-dich/reading/:code
 */
export async function fetchKinhDichReading(code: string): Promise<KinhDichReading> {
  return apiGet<KinhDichReading>(`/kinh-dich/reading/${encodeURIComponent(code)}`);
}

/**
 * Non-fatal per-stock hexagram reading for watchlist tile enrichment (TASK-17).
 * Returns null on any non-2xx response (including 503 ErrInsufficientData) or network failure.
 * Designed for use in parallel Promise.allSettled tile enrichment loops where a missing
 * KD reading must NEVER crash the watchlist page.
 * Endpoint: GET /kinh-dich/reading/:code via API_GATEWAY_URL
 */
export async function fetchKinhDichReadingNonFatal(
  code: string,
): Promise<KinhDichReading | null> {
  const url = `${API_GATEWAY_URL}/kinh-dich/reading/${encodeURIComponent(code)}`;
  return safeFetchOrNull<KinhDichReading>(
    url,
    (raw) => {
      if (raw === null || typeof raw !== "object") return null;
      return raw as KinhDichReading;
    },
    { deadlineMs: 10_000, label: "kdReadingNonFatal" },
    // 10s: best-effort watchlist tile enrichment; faster degrade preserves tile render
  );
}

// --------------------------------------------------------------------------
// Technical Analysis snapshot
// --------------------------------------------------------------------------

import type { TASnapshot } from "~/domain/market";

/**
 * Single-point TA indicators for a stock.
 * Endpoint: POST /ta/ta/indicators
 * Body: { code: string; date: string } — date is today in ISO format (YYYY-MM-DD)
 */
export async function fetchTASnapshot(code: string): Promise<TASnapshot> {
  const today = new Date().toISOString().slice(0, 10);
  const url = `${API_GATEWAY_URL}/ta/ta/indicators`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ code, date: today }),
  });
  if (!response.ok) {
    throw new ApiError(response.status, `POST /ta/ta/indicators failed: ${response.status}`);
  }
  return response.json() as Promise<TASnapshot>;
}

// --------------------------------------------------------------------------
// Stock signals
// --------------------------------------------------------------------------

import type { AgentSignal, SignalAccuracy } from "~/domain/market";

/**
 * Map one raw DB row (snake_case) to an AgentSignal domain object.
 * Handles both the direct `detail` column and the JSON `payload.detail` fallback.
 */
function toAgentSignal(row: unknown): AgentSignal | null {
  if (row === null || typeof row !== "object") return null;
  const obj = row as Record<string, unknown>;

  const id = typeof obj["id"] === "number" ? obj["id"] : null;
  const stockCode = typeof obj["stock_code"] === "string" ? obj["stock_code"] : null;
  if (id === null || stockCode === null) return null;

  const signalType = typeof obj["signal_type"] === "string" ? obj["signal_type"] : "unknown";
  const direction = typeof obj["direction"] === "string" ? obj["direction"] : "NEUTRAL";

  // confidence_score is stored as integer 0–100 in the DB; normalise to 0.0–1.0
  const rawScore = typeof obj["confidence_score"] === "number" ? obj["confidence_score"] : 0;
  const confidence = rawScore / 100;

  // reasoning comes from the top-level `detail` column or falls back to
  // the `payload` JSON field (older rows store it inside the payload blob)
  let reasoning = "";
  if (typeof obj["detail"] === "string") {
    reasoning = obj["detail"];
  } else if (typeof obj["payload"] === "string") {
    try {
      const p = JSON.parse(obj["payload"]) as Record<string, unknown>;
      if (typeof p["detail"] === "string") reasoning = p["detail"];
    } catch { /* leave empty */ }
  }

  const createdAt = typeof obj["created_at"] === "string" ? obj["created_at"] : "";

  return { id, stockCode, signalType, direction, confidence, reasoning, createdAt };
}

/**
 * Parse a raw API response envelope into AgentSignal[].
 * If the response contains an `accuracy` map (Sprint B), attaches the matching
 * accuracy entry to each signal row where signal_type matches a key.
 *
 * Exported so it can be unit-tested without mocking fetch.
 */
export function parseAccuracyFromResponse(
  data: Record<string, unknown>,
): AgentSignal[] {
  const rawItems: unknown[] = Array.isArray(data["signals"])
    ? (data["signals"] as unknown[])
    : [];

  // accuracy map is optional — absent when Sprint B is not yet deployed
  const accuracyMap: Record<string, SignalAccuracy> | null =
    data["accuracy"] !== null &&
    typeof data["accuracy"] === "object" &&
    !Array.isArray(data["accuracy"])
      ? (data["accuracy"] as Record<string, SignalAccuracy>)
      : null;

  return rawItems.map((row) => {
    const signal = toAgentSignal(row);
    if (signal === null) return null;

    if (accuracyMap !== null) {
      const acc = accuracyMap[signal.signalType];
      if (
        acc !== undefined &&
        acc !== null &&
        typeof acc === "object" &&
        "sample_count" in acc
      ) {
        signal.accuracy = acc;
      }
      // if signalType not in map → accuracy stays undefined
    }

    return signal;
  }).filter((s): s is AgentSignal => s !== null);
}

/**
 * Badge colour + label for a given SignalAccuracy.
 *
 * Rules (from Sprint C brief):
 * - sample_count < 3  → grey "New"
 * - accuracy_rate null  → grey "New"
 * - accuracy_rate >= 0.70 → green e.g. "70%"
 * - accuracy_rate 0.40–0.69 → amber e.g. "55%"
 * - accuracy_rate < 0.40 → red "Low"
 *
 * Exported for unit-testing badge logic independently of React.
 */
export function accuracyBadgeProps(acc: SignalAccuracy): {
  color: "green" | "amber" | "red" | "grey";
  label: string;
} {
  if (acc.sample_count < 3 || acc.accuracy_rate === null) {
    return { color: "grey", label: "New" };
  }
  const rate = acc.accuracy_rate;
  if (rate >= 0.7) {
    return { color: "green", label: `${Math.round(rate * 100)}%` };
  }
  if (rate >= 0.4) {
    return { color: "amber", label: `${Math.round(rate * 100)}%` };
  }
  return { color: "red", label: "Low" };
}

/**
 * Per-stock agent signals.
 * Endpoint: GET /mcp/api/signals/stock/:code?limit=10
 * Response shape (Sprint B+): { signals: RawSignalRow[], accuracy?: { [signal_type]: { accuracy_rate, sample_count } } }
 *
 * The call goes through api-gateway: /mcp/* → mcp-server (port 3000).
 * Non-fatal — callers should catch and treat as null on failure.
 */
export async function fetchStockSignals(code: string, limit = 10): Promise<AgentSignal[]> {
  const raw = await apiGet<unknown>(
    `/mcp/api/signals/stock/${encodeURIComponent(code)}?limit=${limit}`,
  );
  if (raw === null || typeof raw !== "object") return [];
  return parseAccuracyFromResponse(raw as Record<string, unknown>);
}

// --------------------------------------------------------------------------
// Watchlist batch prices
// --------------------------------------------------------------------------

/**
 * Lightweight data for a single tile in the watchlist overview grid.
 * Intentionally minimal — close price, direction, change %, signal count.
 * kd is optional: populated by TASK-17 enrichment loop; null = degraded (503 / no data).
 */
export interface WatchlistTileData {
  ticker: string;
  close: number;
  changePct: number;
  direction: "up" | "down" | "flat";
  signalCount: number;
  /** Kinh Dịch reading for this ticker. undefined = not fetched; null = fetch failed / degraded. */
  kd?: KinhDichReading | null;
}

function toWatchlistTileData(ticker: string, raw: unknown): WatchlistTileData | null {
  if (raw === null || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const close = typeof obj["close"] === "number" ? obj["close"] : null;
  if (close === null) return null;
  const changePct = typeof obj["changePct"] === "number" ? obj["changePct"] : 0;
  const rawDir = typeof obj["direction"] === "string" ? obj["direction"] : "";
  const direction: "up" | "down" | "flat" =
    rawDir === "up" ? "up" : rawDir === "down" ? "down" : "flat";
  const signalCount = typeof obj["signalCount"] === "number" ? obj["signalCount"] : 0;
  const resolvedTicker = typeof obj["ticker"] === "string" ? obj["ticker"] : ticker;
  return { ticker: resolvedTicker, close, changePct, direction, signalCount };
}

/**
 * Parse a raw GET /stock/price/batch response into WatchlistTileData map.
 * Handles two shapes: { quotes: Record<ticker, obj> } and flat array.
 * Returns {} on null input or unrecognised shape (parse-null contract for safeFetch).
 */
function parseWatchlistPrices(raw: unknown): Record<string, WatchlistTileData> {
  const result: Record<string, WatchlistTileData> = {};

  if (raw === null) return result;

  // Shape 1: { quotes: Record<ticker, obj> }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    const quotesMap = obj["quotes"];
    if (quotesMap !== null && typeof quotesMap === "object" && !Array.isArray(quotesMap)) {
      for (const [ticker, val] of Object.entries(quotesMap as Record<string, unknown>)) {
        const tile = toWatchlistTileData(ticker, val);
        if (tile) result[ticker] = tile;
      }
      return result;
    }
  }

  // Shape 2: flat array of quote objects
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item !== null && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        const ticker = typeof obj["ticker"] === "string" ? obj["ticker"] : null;
        if (ticker) {
          const tile = toWatchlistTileData(ticker, item);
          if (tile) result[ticker] = tile;
        }
      }
    }
    return result;
  }

  return result;
}

/**
 * Batch lightweight price + signal-count fetch for the watchlist overview grid.
 * Endpoint: GET /stock/price/batch?tickers=VNM,FPT,...
 * Response: { quotes: Record<ticker, { close, changePct, direction }> }
 *   OR flat array of quote objects.
 *
 * Non-fatal: returns {} on any error so the overview degrades gracefully.
 * Bounded by 10s deadline (best-effort enrichment; shorter degrade < tile render block).
 */
export async function fetchWatchlistPrices(
  tickers: string[],
): Promise<Record<string, WatchlistTileData>> {
  if (tickers.length === 0) return {};
  const url = `${API_GATEWAY_URL}/stock/price/batch?tickers=${encodeURIComponent(tickers.join(","))}`;
  const { data } = await safeFetch<Record<string, WatchlistTileData>>(
    url,
    parseWatchlistPrices,
    { deadlineMs: 10_000, label: "watchlistPrices" },
    // 10s: best-effort enrichment; shorter deadline degrades faster without blocking primary page render
  );
  return data;
}

// --------------------------------------------------------------------------
// Cascade signals (macro → stock impact)
// --------------------------------------------------------------------------

/**
 * Fetch cascade-type agent signals for a stock.
 * These show which macro events recently triggered a cascade impact for this stock.
 * Endpoint: GET /mcp/api/signals/stock/:code?limit=5&type=chain_catalyst
 *
 * Reuses the same toAgentSignal mapper as fetchStockSignals.
 * Non-fatal: returns [] on any error.
 * Bounded by 10s deadline (best-effort; shorter degrade < tile render block).
 * NOTE: apiGet call REPLACED by direct safeFetchOrNull to avoid double-deadline.
 */
export async function fetchCascadeSignals(code: string, limit = 5): Promise<AgentSignal[]> {
  const url = `${API_GATEWAY_URL}/mcp/api/signals/stock/${encodeURIComponent(code)}?limit=${limit}&type=chain_catalyst`;
  const result = await safeFetchOrNull<AgentSignal[]>(
    url,
    (raw) => {
      const items: unknown[] =
        raw !== null &&
        typeof raw === "object" &&
        Array.isArray((raw as Record<string, unknown>)["signals"])
          ? ((raw as Record<string, unknown>)["signals"] as unknown[])
          : [];
      return items.map(toAgentSignal).filter((s): s is AgentSignal => s !== null);
    },
    { deadlineMs: 10_000, label: "cascadeSignals" },
  );
  return result ?? [];
}

// --------------------------------------------------------------------------
// Accuracy digest (system-level, Sprint 1945b)
// --------------------------------------------------------------------------

import type { AccuracyDigestStats } from "~/domain/market";

/**
 * System-level accuracy digest.
 * Endpoint: GET /mcp/api/accuracy/digest?days=30
 * Non-fatal — callers should catch and treat as null on failure.
 * Bounded by 10s deadline.
 * NOTE: apiGet call REPLACED by direct safeFetchOrNull to avoid double-deadline.
 */
export async function fetchAccuracyDigest(days = 30): Promise<AccuracyDigestStats | null> {
  const url = `${API_GATEWAY_URL}/mcp/api/accuracy/digest?days=${days}`;
  return safeFetchOrNull<AccuracyDigestStats>(
    url,
    (raw) => {
      if (raw === null || typeof raw !== "object") return null;
      return raw as AccuracyDigestStats;
    },
    { deadlineMs: 10_000, label: "accuracyDigest" },
  );
}

/**
 * Derive UI state from accuracy digest response.
 * Used for state discriminator in AccuracyDigestCard.
 * Extracted for testability (pure function, no React dependency).
 */
export function deriveAccuracyDigestState(
  data: AccuracyDigestStats | null,
): "loading" | "empty" | "all-neutral" | "insufficient-sample" | "partial" | "normal" {
  if (data === null) return "loading";
  if (data.totalResolved === 0 && data.neutralOnlyRows === 0) return "empty";
  if (data.totalResolved === 0 && data.neutralOnlyRows > 0) return "all-neutral";
  if (data.bySignalType.length === 0 && data.totalResolved > 0) return "insufficient-sample";
  if (data.bySignalType.length >= 1 && data.bySignalType.length < 3) return "partial";
  return "normal";
}

/**
 * Colour class for a digest row rate value.
 * Mirrors accuracyBadgeProps() thresholds exactly.
 * Exported for unit-testing independently of React.
 */
export function digestRateColor(rate: number): string {
  if (rate >= 0.7) return "text-green-400";
  if (rate >= 0.4) return "text-amber-400";
  return "text-red-400";
}

// --------------------------------------------------------------------------
// Macro snapshot
// --------------------------------------------------------------------------

/**
 * Macro signals snapshot (oil, gold, FX directions).
 * Endpoint: POST /macro/snapshot
 */
export async function fetchMacroSnapshot(): Promise<MacroSnapshot> {
  const url = `${API_GATEWAY_URL}/macro/snapshot`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: "{}",
  });
  if (!response.ok) {
    throw new ApiError(response.status, `POST /macro/snapshot failed: ${response.status}`);
  }
  return response.json() as Promise<MacroSnapshot>;
}
