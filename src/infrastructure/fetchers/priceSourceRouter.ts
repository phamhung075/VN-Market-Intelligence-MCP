/**
 * Price Source Router — evaluates VPS price freshness and returns fallback strategy.
 * Stub for TASK-232a (RED test phase).
 * Implementation → TASK-232b.
 */

export interface PriceSourceRouterOptions {
  circuitState: "closed" | "open" | "half-open";
  lastQuoteMinutesAgo: number;
}

export interface TickerClassification {
  exchange: "HOSE" | "HNX" | "UPCOM";
  majorCap: boolean;
}

export interface PriceSourceRouterResult {
  shouldUseFallback: boolean;
  stalewnessMinutes: number;
  fallbacks: Array<{ type: string }>;
}

/**
 * Placeholder implementation for RED test phase.
 */
export function priceSourceRouter(
  ticker: string,
  vpsState: PriceSourceRouterOptions,
  cachedPrice: { price: number; timestamp: Date } | null,
  classification: TickerClassification
): PriceSourceRouterResult {
  throw new Error("priceSourceRouter not yet implemented (TASK-232b)");
}
