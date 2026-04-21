/**
 * BCTC Source Router — evaluates VPS BCTC availability and returns fallback strategy.
 * Stub for TASK-232a (RED test phase).
 * Implementation → TASK-232b.
 */

export interface BctcSourceRouterOptions {
  circuitState: "closed" | "open" | "half-open";
  lastFetchMinutesAgo: number;
  openDurationMinutes: number;
}

export interface BctcSourceRouterConfig {
  enableCongbaoFallback: boolean;
  congbaoMinVpsOpenMinutes: number;
}

export interface BctcSourceRouterResult {
  shouldUseFallback: boolean;
  fallbacks: Array<{ type: string }>;
}

/**
 * Placeholder implementation for RED test phase.
 */
export function bctcSourceRouter(
  ticker: string,
  quarter: string,
  vpsState: BctcSourceRouterOptions,
  cachedReport: unknown,
  config: BctcSourceRouterConfig
): BctcSourceRouterResult {
  throw new Error("bctcSourceRouter not yet implemented (TASK-232b)");
}
