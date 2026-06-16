/**
 * Domain Models — Shared Types (Task 1320)
 *
 * Pure data shapes shared between domain services and infrastructure fetchers.
 * This file has ZERO imports — all types use only TypeScript built-ins.
 *
 * Ordering rule: dependent types must follow their dependencies.
 *   WeatherEventType → WeatherSeverity → WeatherEvent (satisfies circular guard).
 *
 * Layer: domain/models — may be imported by any layer.
 */

// ---------------------------------------------------------------------------
// Vnstock types (sourced from infrastructure/fetchers/vnstockBridge.ts)
// ---------------------------------------------------------------------------

export interface VnstockIntradayTick {
  code: string;
  /** ISO datetime of the tick */
  time: string;
  /** Price in VND (vnstock raw × 1000) */
  price: number;
  volume: number;
  /** "Buy" | "Sell" | "Unknown" */
  matchType: string;
}

export interface VnstockEvent {
  code: string;
  eventName: string;
  /** ISO date "YYYY-MM-DD" */
  eventDate: string;
  /** "Dividend", "AGM", "Share Issuance", etc. */
  eventType: string;
  description: string;
}

export interface VnstockOrderBook {
  code: string;
  /** Top 10 bid levels (price in VND × 1000) */
  bids: Array<{ price: number; volume: number }>;
  /** Top 10 ask levels (price in VND × 1000) */
  asks: Array<{ price: number; volume: number }>;
  bidTotal: number;
  askTotal: number;
  /** bidTotal / askTotal — > 1 means more buy-side pressure */
  imbalanceRatio: number;
}

// ---------------------------------------------------------------------------
// Shipping index type (sourced from infrastructure/fetchers/shippingIndex.ts)
// ---------------------------------------------------------------------------

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
// Weather types (sourced from infrastructure/fetchers/weatherVn.ts)
// ---------------------------------------------------------------------------

export type WeatherEventType =
  | "typhoon"
  | "flood"
  | "drought"
  | "heat_wave"
  | "cold_snap"
  | "el_nino"
  | "la_nina";

export type WeatherSeverity = "low" | "medium" | "high" | "critical";

export interface WeatherEvent {
  type: WeatherEventType;
  severity: WeatherSeverity;
  /** Affected provinces / regions */
  regions: string[];
  /** ISO date string of forecast */
  forecastDate: string;
  /** Human-readable impact duration, e.g. "48 giờ", "3-5 ngày" */
  impactDuration: string;
  /** Source description text */
  description: string;
}

// ---------------------------------------------------------------------------
// RAG search result (G5b P2-F: canonical domain type; formerly in vectorstore.ts/retriever.ts)
// ---------------------------------------------------------------------------

export interface SearchResult {
  id: string;
  level: string;
  title: string;
  summary: string;
  tags: string[];
  actionCode: string;
  createdAt: string;
  distance: number;
}

// ---------------------------------------------------------------------------
// RSS item (sourced from infrastructure/fetchers/rss.ts)
// ---------------------------------------------------------------------------

export interface RssItem {
  /** Article headline. */
  title: string;
  /** Canonical URL to the full article. */
  url: string;
  /** Publication timestamp as a raw string from the feed. */
  publishedAt: string;
  /** Article summary / description (may contain HTML entities). */
  content: string;
  /**
   * Source identifier set by the caller (e.g. 'cafef').
   * parseRssFeed() always emits '' — callers must set it after parsing.
   */
  source: string;
}

// ---------------------------------------------------------------------------
// Foreign Flow Input Type (Task 1131 / 1566b)
// ---------------------------------------------------------------------------

/**
 * Input item for upsertForeignFlow.
 * Only the four foreign-flow columns are targeted in the DO UPDATE SET clause;
 * price/financial columns written by storeTradingStats are never overwritten.
 */
export interface ForeignFlowUpsertItem {
  code: string;
  /** "YYYY-MM-DD" */
  date: string;
  foreign_volume: number;
  foreign_room: number | null;
  /** Holding ratio as a decimal (0–1). If > 1.0, the function divides by 100. */
  holding_ratio: number | null;
  /** ISO 8601 UTC timestamp. null → server uses SQLite datetime('now'). */
  fetched_at: string | null;
}

/**
 * Data transfer item for writing foreign flow columns to daily_ohlcv.
 * Structured to match WriteForeignFlowItem in ohlcvForeignFlowStore (Task 1503, 1289).
 * These fields correspond to daily_ohlcv table columns.
 *
 * FIX-FOREIGN-FLOW-COVERAGE: foreignBuyValue / foreignSellValue are the VND
 * money-value equivalents of foreignBuyVol / foreignSellVol (from bgapidatafeed
 * fBValue / fSValue fields, in VND). Optional — absent when the upstream API
 * returns null / scientific-notation parse fails.
 */
export interface WriteForeignFlowItem {
  code: string;
  date: string;
  foreignBuyVol: number;
  foreignSellVol: number;
  putThroughVol: number;
  /** VND buy value from bgapidatafeed fBValue (e.g. 154,033,825 VND). Optional. */
  foreignBuyValue?: number | null;
  /** VND sell value from bgapidatafeed fSValue (e.g. 29,197,224 VND). Optional. */
  foreignSellValue?: number | null;
}
