/**
 * Microservice HTTP clients — DDD interface layer
 * Thin adapters delegating to downstream services via HTTP.
 *
 * Services:
 *   - api-gateway (4000): health aggregation, reverse proxy
 *   - stock-price (5000): multi-tier price resolution
 *   - pdf-extractor (5001): BCTC PDF extraction
 *   - rag-service (5002): vector search + temporal decay
 *   - technical-analysis (5003): RSI/MACD/MA/BB compute
 *   - macro-indicators (5004): commodity + SBV score
 *   - kinh-dich-service (5005): hexagram readings
 *   - alert-engine (5006): alert dedup + cooldown + Telegram
 *
 * @module infrastructure/microservices/clients
 */

import { logger } from '../logger.js';

const BASE_URLS = {
  gateway: Bun.env.GATEWAY_URL ?? 'http://localhost:4000',
  stockPrice: Bun.env.STOCK_PRICE_URL ?? 'http://localhost:5000',
  pdfExtractor: Bun.env.PDF_EXTRACTOR_URL ?? 'http://localhost:5001',
  rag: Bun.env.RAG_SERVICE_URL ?? 'http://localhost:5002',
  ta: Bun.env.TA_SERVICE_URL ?? 'http://localhost:5003',
  macro: Bun.env.MACRO_INDICATORS_URL ?? 'http://localhost:5004',
  kinhDich: Bun.env.KINH_DICH_URL ?? 'http://localhost:5005',
  alertEngine: Bun.env.ALERT_ENGINE_URL ?? 'http://localhost:5006',
};

const TIMEOUT_MS = parseInt(Bun.env.MICROSERVICE_TIMEOUT_MS ?? '10000');
const RETRY_COUNT = parseInt(Bun.env.MICROSERVICE_RETRY_COUNT ?? '2');

interface FetchOptions extends RequestInit {
  timeout?: number;
}

/** Fetch with timeout + retry logic */
async function fetchWithRetry(
  url: string,
  options: FetchOptions = {},
  attempt = 0
): Promise<Response> {
  const timeout = options.timeout ?? TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (attempt < RETRY_COUNT && error instanceof Error && error.name === 'AbortError') {
      logger.warn(`[microservice] timeout ${url}, retry ${attempt + 1}/${RETRY_COUNT}`);
      return fetchWithRetry(url, options, attempt + 1);
    }
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Technical Analysis Service
// ─────────────────────────────────────────────────────────────────────────────

export interface ComputeTARequest {
  code: string;
  days?: number;
}

export interface ComputeTAResponse {
  code: string;
  rsi?: number;
  macd?: {
    value: number;
    signal: number;
    histogram: number;
  };
  ma5?: number;
  ma20?: number;
  ma50?: number;
  bb?: {
    upper: number;
    middle: number;
    lower: number;
  };
  trend: 'TANG' | 'GIAM' | 'TREN_DUNG' | 'NEUTRAL';
  /** Number of candles available when the TA service computed indicators.
   * Present when rsi/macd are absent (insufficient history guard). */
  candlesAvailable?: number;
}

export async function computeTAIndicators(req: ComputeTARequest): Promise<ComputeTAResponse> {
  const url = `${BASE_URLS.ta}/indicators`;
  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!response.ok) {
    throw new Error(`[TA Service] ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Macro Indicators Service
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Per-entry shape for a single macro signal in the snapshot.
 *
 * The macro-indicators service returns a keyed object with 6 named signals:
 *   "investment-clock", "oil", "gold", "usdvnd", "carry", "yield"
 *
 * Each entry is a JSON object consumed by the frontend via:
 *   Object.entries(snapshot.signals).map(([key, entry]) =>
 *     entry.direction ?? entry.regime ?? entry.label ?? "")
 *
 * Locked contract: commit 80c776de
 *   apps/macro-indicators/pkg/interface/http/handlers_snapshot_contract_test.go
 */
export interface MacroSignalEntry {
  /** Primary directional signal (e.g. "EXPANSION", "UP", "RISK-OFF"). */
  direction?: string;
  /** Regime label (e.g. "GROWTH", "POSITIVE_CARRY"). */
  regime?: string;
  /** Human-readable label for the indicator. */
  label?: string;
  /** Numeric value for the indicator (when applicable). */
  value?: number;
  /** Unit string for the value (e.g. "score", "%"). */
  unit?: string;
  /** Forward-compat: allow extra fields the server may add in future. */
  [key: string]: unknown;
}

/**
 * MacroSnapshotResponse — aligned with macro-indicators service DTO
 * (apps/macro-indicators/src/application/dtos.ts MacroSnapshotResponse).
 *
 * Historical field aliases (brentPrice, goldPrice, sbvRefinancingRate) are
 * preserved as optional computed getters so callers that reference them
 * continue to work without changes.
 */
export interface MacroSnapshotResponse {
  /** VNINDEX level (null if unavailable) */
  vnIndex: number | null;
  /** Brent/crude oil price in USD/barrel (null if unavailable) */
  oilUsd: number | null;
  /** Gold price in USD/oz (null if unavailable) */
  goldUsd: number | null;
  /** USD/VND exchange rate (null if unavailable) */
  usdVnd: number | null;
  /**
   * Macro price signals — keyed object (NOT an array).
   *
   * Keys: "investment-clock" | "oil" | "gold" | "usdvnd" | "carry" | "yield"
   * Value: MacroSignalEntry (fields: direction, regime, label, value, unit, ...)
   *
   * Frontend consumes via Object.entries(snapshot.signals).
   * An array would produce numeric-index pairs and break indicatorLabel() lookup.
   *
   * Locked contract: commit 80c776de
   *   apps/macro-indicators/.../handlers_snapshot_contract_test.go
   */
  signals: Record<string, MacroSignalEntry>;
  fetchedAt: string;
  // Legacy aliases — populated by getMacroSnapshot() for backward compatibility
  /** @deprecated use oilUsd */
  brentPrice: number;
  /** @deprecated use goldUsd */
  goldPrice: number;
  /** @deprecated use signals or macro_indicators table */
  sbvRefinancingRate: number | null;
  sbvOvernightRate: number | null;
  sbvOfficialRate: number | null;
}

/**
 * MacroExternalResponse — partial shape of /macro/external envelope.
 * Only the fields needed by macroIndicatorRefreshJob are typed here.
 * The full shape is defined in macro-indicators FetchExternalMacroUseCase.
 */
export interface MacroExternalResponse {
  sources: {
    tradingEconomics?: {
      status: string;
      data?: Record<string, { latestValue: string; [key: string]: unknown } | null>;
    };
    imf?: {
      status: string;
      data?: { NGDP_RPCH?: unknown; [key: string]: unknown };
    };
    worldBank?: {
      status: string;
      data?: { gdpGrowthRate?: number | null; [key: string]: unknown };
    };
    [key: string]: unknown;
  };
  fetchedAt: string;
  summary: { ok: number; failed: number; totalLatencyMs: number };
}

/**
 * Calls macro-indicators /external endpoint.
 * Never throws — returns null on any error so callers use COALESCE fallback.
 */
export async function getMacroExternal(): Promise<MacroExternalResponse | null> {
  const url = `${BASE_URLS.macro}/external`;
  try {
    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!response.ok) {
      logger.warn(`[getMacroExternal] non-ok response: ${response.status}`);
      return null;
    }
    return response.json() as Promise<MacroExternalResponse>;
  } catch (err) {
    logger.warn(
      `[getMacroExternal] failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}

export async function getMacroSnapshot(): Promise<MacroSnapshotResponse> {
  const url = `${BASE_URLS.macro}/snapshot`;
  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!response.ok) {
    throw new Error(`[Macro Service] ${response.status}: ${await response.text()}`);
  }
  const raw = await response.json() as {
    vnIndex?: number | null;
    oilUsd?: number | null;
    goldUsd?: number | null;
    usdVnd?: number | null;
    signals?: MacroSnapshotResponse['signals'];
    fetchedAt?: string;
  };

  // Normalise + inject legacy alias fields so macroIndicatorRefreshJob.ts
  // and other callers can use either the new or old field names.
  return {
    vnIndex: raw.vnIndex ?? null,
    oilUsd: raw.oilUsd ?? null,
    goldUsd: raw.goldUsd ?? null,
    usdVnd: raw.usdVnd ?? null,
    signals: raw.signals ?? {},
    fetchedAt: raw.fetchedAt ?? new Date().toISOString(),
    // Legacy aliases
    brentPrice: raw.oilUsd ?? 0,
    goldPrice: raw.goldUsd ?? 0,
    sbvRefinancingRate: null,   // not exposed by macro-service /macro/snapshot
    sbvOvernightRate: null,
    sbvOfficialRate: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stock Price Service
// ─────────────────────────────────────────────────────────────────────────────

export interface FetchPriceRequest {
  code: string;
}

export interface PriceHistoryRequest {
  code: string;
  days?: number;
}

export interface PriceSnapshot {
  code: string;
  price: number;
  timestamp: string;
  source: 'HOSE' | 'HNX' | 'UPCOM' | 'VPS_TIER2' | 'VPS_TIER3';
}

export async function fetchStockPrice(req: FetchPriceRequest): Promise<PriceSnapshot> {
  const url = `${BASE_URLS.stockPrice}/price/fetch`;
  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!response.ok) {
    throw new Error(`[Stock Price Service] ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

/** Go stock-price service /price/history response envelope.
 * Source: apps/stock-price/pkg/application/usecases.go PriceHistoryResponse.
 * DailyOHLCV fields: date, open, high, low, close, volume (no `.price` field).
 */
export interface PriceHistoryEnvelope {
  code: string;
  history: Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }>;
}

export async function getPriceHistory(
  req: PriceHistoryRequest
): Promise<PriceHistoryEnvelope> {
  const url = `${BASE_URLS.stockPrice}/price/history?code=${req.code}&days=${req.days ?? 30}`;
  const response = await fetchWithRetry(url, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`[Stock Price Service] ${response.status}: ${await response.text()}`);
  }
  return response.json() as Promise<PriceHistoryEnvelope>;
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF Extractor Service
// ─────────────────────────────────────────────────────────────────────────────

export interface ExtractPDFRequest {
  url: string;
  code: string;
  year: number;
  quarter: string;
}

export interface ExtractPDFResponse {
  code: string;
  year: number;
  quarter: string;
  extracted_text: string;
  tables: Array<{
    title: string;
    rows: string[][];
  }>;
  extracted_at: string;
}

export async function extractBCTCPDF(req: ExtractPDFRequest): Promise<ExtractPDFResponse> {
  const url = `${BASE_URLS.pdfExtractor}/extract`;
  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!response.ok) {
    throw new Error(`[PDF Extractor] ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// RAG Service
// ─────────────────────────────────────────────────────────────────────────────

export interface SearchRequest {
  query: string;
  limit?: number;
  recency_days?: number;
}

export interface SearchResult {
  id: string;
  headline: string;
  detail: string;
  impact_score: number;
  similarity: number;
  recency_score: number;
  age_days: number;
}

export async function searchRAG(req: SearchRequest): Promise<SearchResult[]> {
  const url = `${BASE_URLS.rag}/search`;
  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!response.ok) {
    throw new Error(`[RAG Service] ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

export interface IndexRequest {
  stock: string;
  headline: string;
  detail: string;
  impact_score: number;
  published_at: string;
}

export async function indexRAG(req: IndexRequest): Promise<{ id: string }> {
  const url = `${BASE_URLS.rag}/index`;
  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!response.ok) {
    throw new Error(`[RAG Service] ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Kinh Dich Service
// ─────────────────────────────────────────────────────────────────────────────

export interface KinhDichReadingResponse {
  stock: string;
  hexagram: number;
  name: string;
  trend: string;
  signal: string;
  confidence: number;
  actionNote: string;
  overallReading: string;
  timestamp: string;
}

export interface KinhDichMarketResponse {
  hexagram: number;
  name: string;
  trend: string;
  signal: string;
  confidence: number;
  timestamp: string;
}

export interface KinhDichHistoryEntry {
  timestamp: string;
  hexagram: number;
  name: string;
  signal: string;
  confidence: number;
}

export interface KinhDichHistoryResponse {
  stock: string;
  days: number;
  total: number;
  readings: KinhDichHistoryEntry[];
  mostFrequent: string;
}

export interface KinhDichTransitionEntry {
  toHexagram: number;
  name: string;
  probability: number;
  count: number;
}

export interface KinhDichTransitionsResponse {
  hexagram: number;
  name: string;
  stock: string;
  transitions: KinhDichTransitionEntry[];
}

export interface KinhDichBacktestResponse {
  stock: string;
  days: number;
  totalReadings: number;
  accuracy: number;
  avgReturn5d: number;
  bestHexagram: { number: number; name: string; winRate: number; count: number } | null;
  worstHexagram: { number: number; name: string; winRate: number; count: number } | null;
}

export interface KinhDichExplainResponse {
  number: number;
  name: string;
  chinese: string;
  upper: string;
  lower: string;
  coreMeaning: string;
  trend: string;
  tradingContext: string;
}

export async function getKinhDichReading(code: string, days = 30): Promise<KinhDichReadingResponse> {
  const url = `${BASE_URLS.kinhDich}/reading/${code}?days=${days}`;
  const response = await fetchWithRetry(url, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`[Kinh Dich Service] ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

export async function getMarketHexagram(): Promise<KinhDichMarketResponse> {
  const url = `${BASE_URLS.kinhDich}/market`;
  const response = await fetchWithRetry(url, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`[Kinh Dich Service] ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

export async function getKinhDichHistory(code: string, days = 30): Promise<KinhDichHistoryResponse> {
  const url = `${BASE_URLS.kinhDich}/readings/${code}/history?days=${days}`;
  const response = await fetchWithRetry(url, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`[Kinh Dich Service] ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

export async function getHexagramTransitions(
  hexagramNumber: number,
  stock = 'VNINDEX',
  topN = 10,
): Promise<KinhDichTransitionsResponse> {
  const url = `${BASE_URLS.kinhDich}/hexagram/${hexagramNumber}/transitions?stock=${stock}&topN=${topN}`;
  const response = await fetchWithRetry(url, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`[Kinh Dich Service] ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

export async function runKinhDichBacktest(code: string, days = 30): Promise<KinhDichBacktestResponse> {
  const url = `${BASE_URLS.kinhDich}/backtest/${code}?days=${days}`;
  const response = await fetchWithRetry(url, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`[Kinh Dich Service] ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

export async function explainHexagram(hexagramNumber: number): Promise<KinhDichExplainResponse> {
  const url = `${BASE_URLS.kinhDich}/hexagram/${hexagramNumber}/explain`;
  const response = await fetchWithRetry(url, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`[Kinh Dich Service] ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Gateway Health
// ─────────────────────────────────────────────────────────────────────────────

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  services: Record<string, 'healthy' | 'unhealthy' | 'unreachable'>;
}

export async function getGatewayHealth(): Promise<HealthStatus> {
  const url = `${BASE_URLS.gateway}/health`;
  const response = await fetchWithRetry(url, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`[Gateway] ${response.status}: ${await response.text()}`);
  }
  return response.json();
}
