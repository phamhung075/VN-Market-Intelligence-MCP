/**
 * Domain types for VN market data.
 * Tier 1 of DDD: pure TypeScript — ZERO imports from app/lib/api/ or app/components/.
 *
 * These types reflect the api-gateway response shapes; keep in sync with
 * docs/architecture/microservice/frontend/domain-model.md.
 */

/** Direction of a price move — always shown with a delta %, never a bare snapshot. */
export type PriceDirection = "up" | "down" | "flat";

/** HOSE/HNX/UPCOM price colour convention. */
export type MarketColour = "up" | "down" | "ceil" | "floor" | "ref";

/** A single stock quote as returned by api-gateway → stock-price service. */
export interface StockQuote {
  ticker: string;
  exchange: "HOSE" | "HNX" | "UPCOM";
  price: number;         // VND
  priceRef: number;      // reference price (previous close)
  change: number;        // absolute change in VND
  changePct: number;     // percent change, e.g. 2.5 means +2.5%
  direction: PriceDirection;
  colour: MarketColour;
  volume: number;        // shares
  timestamp: string;     // ISO 8601
}

/** Health summary for a single downstream service. */
export type ServiceStatus = "ok" | "degraded" | "down";

/** A single price history data point from GET /price/history */
export interface PricePoint {
  date: string;       // ISO date string e.g. "2026-05-17"
  code: string;       // ticker symbol e.g. "VN-INDEX"
  open?: number;
  high?: number;
  low?: number;
  close: number;      // closing price
  volume?: number;
}

/** A single source entry inside MacroData.sources */
export interface MacroSourceEntry {
  status: "ok" | "failed" | string;
  latencyMs?: number;
  data?: Record<string, unknown>;
  error?: string;
}

/** A flattened row used by MacroPanel for display */
export interface MacroSourceRow {
  name: string;
  status: "ok" | "failed" | string;
  latencyMs?: number;
  error?: string;
}

/** Macro summary counts */
export interface MacroSummary {
  ok: number;
  failed: number;
  totalLatencyMs?: number;
}

/** Macro external data snapshot from GET /macro/external */
export interface MacroData {
  fetchedAt?: string;
  sources?: Record<string, MacroSourceEntry>;
  summary?: MacroSummary;
  /** Legacy fields — kept for backward-compat; real shape uses sources+summary */
  source?: string;
  status?: string;
  indicators?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Flatten MacroData.sources into display rows for MacroPanel.
 * Pure function — safe to use in tests and loaders.
 */
export function parseMacroSources(macro: MacroData | null): MacroSourceRow[] {
  if (!macro?.sources) return [];
  return Object.entries(macro.sources).map(([name, entry]) => ({
    name,
    status: entry.status,
    latencyMs: entry.latencyMs,
    error: entry.error,
  }));
}

// --------------------------------------------------------------------------
// Kinh Dich types
// --------------------------------------------------------------------------

/** Market-level hexagram reading from GET /kinh-dich/market */
export interface KinhDichMarket {
  hexagram: number;
  name: string;
  trend: string;
  signal: string;
  confidence: number;
  timestamp: string;
}

/** Per-stock hexagram reading from GET /kinh-dich/reading/:code */
export interface KinhDichReading extends KinhDichMarket {
  stock: string;
  actionNote?: string;
  overallReading?: string;
}

// --------------------------------------------------------------------------
// Macro snapshot types
// --------------------------------------------------------------------------

export interface MacroSignal {
  indicator: string;
  value: number;
  unit: string;
  direction: "BULLISH" | "BEARISH" | "NEUTRAL" | string;
  impact: "HIGH" | "MEDIUM" | "LOW" | string;
}

/** Macro snapshot from POST /macro/snapshot */
export interface MacroSnapshot {
  vnIndex: number | null;
  oilUsd: number | null;
  goldUsd: number | null;
  usdVnd: number | null;
  signals: MacroSignal[];
  fetchedAt: string;
}

// --------------------------------------------------------------------------
// Technical Analysis types
// --------------------------------------------------------------------------

/** Single-point TA snapshot from POST /ta/ta/indicators */
export interface TASnapshot {
  code: string;
  rsi: number | null;
  macd: { line: number; signal: number; histogram: number } | null;
  movingAverages: { ma5: number | null; ma20: number | null; ma50: number | null };
  bollingerBands: { upper: number; mid: number; lower: number } | null;
  trend: "BULLISH" | "BEARISH" | "NEUTRAL";
  computedAt: string;
}
