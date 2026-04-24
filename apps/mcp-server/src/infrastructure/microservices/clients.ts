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
  gateway: process.env.GATEWAY_URL ?? 'http://localhost:4000',
  stockPrice: process.env.STOCK_PRICE_URL ?? 'http://localhost:5000',
  pdfExtractor: process.env.PDF_EXTRACTOR_URL ?? 'http://localhost:5001',
  rag: process.env.RAG_SERVICE_URL ?? 'http://localhost:5002',
  ta: process.env.TA_SERVICE_URL ?? 'http://localhost:5003',
  macro: process.env.MACRO_SERVICE_URL ?? 'http://localhost:5004',
  kinhDich: process.env.KINH_DICH_URL ?? 'http://localhost:5005',
  alertEngine: process.env.ALERT_ENGINE_URL ?? 'http://localhost:5006',
};

const TIMEOUT_MS = parseInt(process.env.MICROSERVICE_TIMEOUT_MS ?? '10000');
const RETRY_COUNT = parseInt(process.env.MICROSERVICE_RETRY_COUNT ?? '2');

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
  trend: 'TANG' | 'GIAM' | 'TREN_DUNG';
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

export interface MacroSnapshotResponse {
  vnIndex: number;
  brentPrice: number;
  goldPrice: number;
  usdVnd: number;
  sbvOvernightRate: number;
  sbvRefinancingRate: number;
  sbvOfficialRate: number;
  scores: {
    energySector: number;
    goldSector: number;
    bankingSector: number;
    realEstateSector: number;
    aviationSector: number;
  };
}

export async function getMacroSnapshot(): Promise<MacroSnapshotResponse> {
  const url = `${BASE_URLS.macro}/snapshot`;
  const response = await fetchWithRetry(url, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`[Macro Service] ${response.status}: ${await response.text()}`);
  }
  return response.json();
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

export async function getPriceHistory(
  req: PriceHistoryRequest
): Promise<PriceSnapshot[]> {
  const url = `${BASE_URLS.stockPrice}/price/history?code=${req.code}&days=${req.days ?? 30}`;
  const response = await fetchWithRetry(url, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`[Stock Price Service] ${response.status}: ${await response.text()}`);
  }
  return response.json();
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
  code: string;
  hexagram_number: number;
  hexagram_name: string;
  trend: string;
  next_hexagram?: number;
  next_hexagram_name?: string;
  confidence: number;
}

export async function getKinhDichReading(code: string): Promise<KinhDichReadingResponse> {
  const url = `${BASE_URLS.kinhDich}/reading/${code}?days=30`;
  const response = await fetchWithRetry(url, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`[Kinh Dich Service] ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

export async function getMarketHexagram(): Promise<KinhDichReadingResponse> {
  const url = `${BASE_URLS.kinhDich}/market`;
  const response = await fetchWithRetry(url, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`[Kinh Dich Service] ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Alert Engine Service
// ─────────────────────────────────────────────────────────────────────────────

export interface AlertEvaluateRequest {
  code: string;
  signal_type: string;
  direction?: 'bullish' | 'bearish' | 'neutral';
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

export interface AlertEvaluateResponse {
  alert_id: string;
  code: string;
  fired: boolean;
  reason?: string;
  telegram_sent?: boolean;
}

export async function evaluateAlert(req: AlertEvaluateRequest): Promise<AlertEvaluateResponse> {
  const url = `${BASE_URLS.alertEngine}/evaluate`;
  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!response.ok) {
    throw new Error(`[Alert Engine] ${response.status}: ${await response.text()}`);
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
