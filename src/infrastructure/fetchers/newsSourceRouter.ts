/**
 * News Source Router — evaluates VPS health and returns fallback strategy.
 * Stub for TASK-232a (RED test phase).
 * Implementation → TASK-232b.
 */

export interface NewsSourceRouterOptions {
  circuitState: "closed" | "open" | "half-open";
  lastSuccessMinutesAgo: number;
}

export interface FallbackOption {
  type: string;
}

export interface NewsSourceRouterResult {
  shouldUseFallback: boolean;
  fallbacks: FallbackOption[];
  lastVpsHealthCheck: {
    state: string;
  };
}

/**
 * Placeholder implementation for RED test phase.
 */
export function newsSourceRouter(
  vpsState: NewsSourceRouterOptions,
  config: { enableDomesticNewsFallback: boolean },
  cacheArticleCount24h: number
): NewsSourceRouterResult {
  throw new Error("newsSourceRouter not yet implemented (TASK-232b)");
}
