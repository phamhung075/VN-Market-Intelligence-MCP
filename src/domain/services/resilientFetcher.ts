/**
 * Resilient Fetcher — retry + fallback orchestration engine.
 * Stub for TASK-232a (RED test phase).
 * Implementation → TASK-232b.
 */

export interface ResilientFetcherResult {
  success: boolean;
  source: string;  // "primary" | "fallback_N" | "exhausted"
  data?: unknown;
  retriesUsed: number;
  fallbacksAttempted?: number;
  errorLog: Array<{
    source: string;
    attempt?: number;
    error: string;
    backoffMs?: number;
  }>;
}

export interface ResilientFetcherOptions {
  fetcher: () => Promise<unknown>;
  fallbacks?: Array<() => Promise<unknown>>;
  maxRetries?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  timeoutMs?: number;
  context?: {
    serviceName: string;
    agentName: string;
  };
  onExhausted?: (ctx: any) => Promise<void>;
}

/**
 * Placeholder implementation for RED test phase.
 * Returns exhausted result to fail tests until GREEN implementation.
 */
export async function resilientFetcher(
  options: ResilientFetcherOptions
): Promise<ResilientFetcherResult> {
  throw new Error("resilientFetcher not yet implemented (TASK-232b)");
}
