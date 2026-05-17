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

/** Macro external data snapshot from GET /macro/external */
export interface MacroData {
  source?: string;
  fetchedAt?: string;
  status?: string;
  indicators?: Record<string, unknown>;
  [key: string]: unknown;
}
