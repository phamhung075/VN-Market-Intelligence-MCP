/**
 * Domain Service — Resilient Fetcher Orchestration
 *
 * Pure domain logic for orchestrating retries + fallbacks.
 * No imports from infrastructure or application layers (DDD compliance).
 *
 * @module domain/services/resilientFetcher
 */

export interface ResilientFetcherConfig<T = any> {
  /** Primary fetcher function (e.g., VPS call) */
  fetcher: () => Promise<T>;
  /** Fallback fetcher functions [fallback_1, fallback_2, ...] */
  fallbacks: Array<() => Promise<T>>;
  /** Max retry attempts on primary (default: 3) */
  maxRetries?: number;
  /** Initial backoff in ms (default: 1000) */
  initialBackoffMs?: number;
  /** Maximum backoff in ms (default: 8000) */
  maxBackoffMs?: number;
  /** Per-call timeout in ms (default: 30000) */
  timeoutMs?: number;
  /** Context metadata */
  context: {
    serviceName: string;  // "news" | "prices" | "bctc" | "sbv_rates" | "foreign_flow"
    agentName: string;    // "01-news-scout" | "02-financial-analyst" | "04-market-watcher"
  };
  /** Callback when all retries + fallbacks exhausted */
  onExhausted?: (ctx: ExhaustedContext) => Promise<void>;
}

export interface ResilientFetcherResult<T = any> {
  success: boolean;
  data: T | null;
  source: "primary" | "fallback_1" | "fallback_2" | "exhausted";
  retriesUsed: number;
  totalDurationMs: number;
  errorLog: Array<{
    attempt: number;
    source: string;       // "primary" | "fallback_1" | etc
    error: string;        // error message
    durationMs: number;   // how long this attempt took
  }>;
}

export interface ExhaustedContext {
  serviceName: string;
  agentName: string;
  breakerState: "open" | "half-open" | "closed" | "unknown";
  minutesSinceLastSuccess: number;
  fallbacksAttempted: string[];
  errorLog: any[];
}

/**
 * Orchestrate retries + fallbacks for any async fetcher.
 *
 * Algorithm:
 * 1. Try primary with exponential backoff up to maxRetries times
 * 2. If all primary retries fail, try fallback_1 (no backoff, one attempt)
 * 3. If fallback_1 fails, try fallback_2 (no backoff, one attempt)
 * 4. If all chains exhausted, call onExhausted callback and return exhausted
 * 5. Total operation timeout: 180s (hard stop)
 *
 * @param config Configuration object (see ResilientFetcherConfig)
 * @returns Result object with success/data/source/errorLog
 */
export async function resilientFetcher<T>(
  config: ResilientFetcherConfig<T>
): Promise<ResilientFetcherResult<T>> {
  // ─────────────────────────────────────────────────────────────────────────
  // Setup
  // ─────────────────────────────────────────────────────────────────────────
  const {
    fetcher,
    fallbacks = [],
    maxRetries = 3,
    initialBackoffMs = 1000,
    maxBackoffMs = 8000,
    timeoutMs = 30000,
    context,
    onExhausted,
  } = config;

  const operationStartTime = Date.now();
  const TOTAL_OPERATION_TIMEOUT_MS = 180_000; // 180 seconds
  const errorLog: ResilientFetcherResult["errorLog"] = [];
  let retriesUsed = 0;

  // ─────────────────────────────────────────────────────────────────────────
  // Helper: call fetcher with timeout
  // ─────────────────────────────────────────────────────────────────────────
  async function callWithTimeout<U>(
    fn: () => Promise<U>,
    timeoutMs: number,
    source: string
  ): Promise<{ success: boolean; data: U | null; error?: string; durationMs: number }> {
    const startTime = Date.now();
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), timeoutMs)
      );
      const result = await Promise.race([fn(), timeoutPromise]);
      const durationMs = Date.now() - startTime;
      return { success: true, data: result, durationMs };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : String(error),
        durationMs,
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helper: compute exponential backoff capped at maxBackoffMs
  // ─────────────────────────────────────────────────────────────────────────
  function computeBackoffMs(attemptNumber: number): number {
    const exponential = Math.pow(2, attemptNumber) * initialBackoffMs;
    return Math.min(exponential, maxBackoffMs);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helper: sleep (for backoff)
  // ─────────────────────────────────────────────────────────────────────────
  function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 1: Retry primary fetcher
  // ─────────────────────────────────────────────────────────────────────────
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Check total operation timeout before attempting
    const elapsedMs = Date.now() - operationStartTime;
    if (elapsedMs >= TOTAL_OPERATION_TIMEOUT_MS) {
      break; // Move to fallbacks immediately
    }

    retriesUsed = attempt + 1;
    const result = await callWithTimeout(fetcher, timeoutMs, "primary");

    if (result.success && result.data !== null && result.data !== undefined) {
      return {
        success: true,
        data: result.data,
        source: "primary",
        retriesUsed,
        totalDurationMs: Date.now() - operationStartTime,
        errorLog,
      };
    }

    // Log error
    errorLog.push({
      attempt: attempt + 1,
      source: "primary",
      error: result.error || "Unknown error",
      durationMs: result.durationMs,
    });

    // Backoff before next retry (unless last attempt)
    if (attempt < maxRetries - 1) {
      const backoffMs = computeBackoffMs(attempt);
      await sleep(backoffMs);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 2: Try fallback chain (no backoff between fallbacks)
  // ─────────────────────────────────────────────────────────────────────────
  for (let fbIdx = 0; fbIdx < fallbacks.length; fbIdx++) {
    // Check total operation timeout before attempting
    const elapsedMs = Date.now() - operationStartTime;
    if (elapsedMs >= TOTAL_OPERATION_TIMEOUT_MS) {
      break;
    }

    const fallbackFn = fallbacks[fbIdx];
    if (!fallbackFn) {
      continue; // Skip undefined fallbacks
    }

    const result = await callWithTimeout(
      fallbackFn,
      timeoutMs,
      `fallback_${fbIdx + 1}`
    );

    if (result.success && result.data !== null && result.data !== undefined) {
      return {
        success: true,
        data: result.data,
        source: `fallback_${fbIdx + 1}` as "fallback_1" | "fallback_2",
        retriesUsed,
        totalDurationMs: Date.now() - operationStartTime,
        errorLog,
      };
    }

    // Log error
    errorLog.push({
      attempt: fbIdx + 1,
      source: `fallback_${fbIdx + 1}`,
      error: result.error || "Unknown error",
      durationMs: result.durationMs,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 3: All exhausted — call callback and return exhausted
  // ─────────────────────────────────────────────────────────────────────────
  const exhaustedResult: ResilientFetcherResult<T> = {
    success: false,
    data: null,
    source: "exhausted",
    retriesUsed,
    totalDurationMs: Date.now() - operationStartTime,
    errorLog,
  };

  // Call onExhausted callback if provided
  if (onExhausted) {
    try {
      await onExhausted({
        serviceName: context.serviceName,
        agentName: context.agentName,
        breakerState: "unknown",       // Domain doesn't know circuit state; caller provides if needed
        minutesSinceLastSuccess: -1,   // Caller provides if needed
        fallbacksAttempted: fallbacks.map((_, i) => `fallback_${i + 1}`),
        errorLog,
      });
    } catch (error) {
      // Log but don't re-throw (escalation is not blocking)
      console.error("[resilientFetcher] onExhausted callback failed:", error);
    }
  }

  return exhaustedResult;
}
