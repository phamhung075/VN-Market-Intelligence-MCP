/**
 * Infrastructure — Foreign Flow Fetcher with Fallback
 *
 * Fetches foreign buy/sell flow data from primary VPS endpoint.
 * On primary timeout/failure, falls back to: cache → SSE → none.
 * Circuit breaker prevents cascade failures (open after 5 failures, 30s reset).
 *
 * Integrates with:
 * - circuitBreakerRegistry (breakers.foreignFlow)
 * - ohlcvForeignFlowStore (writeForeignFlowToOhlcv)
 * - optional SSE message bus for fallback
 *
 * @module infrastructure/fetchers/foreignFlowFetcher
 */

import type { WriteForeignFlowItem } from "../../domain/models/shared-types.js";
import { logger } from "../logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Result of a fetch attempt (primary or fallback).
 */
export interface ForeignFlowFetchResult {
  /** Number of rows written to daily_ohlcv (UPDATE success count) */
  changes: number;
  /** ISO 8601 timestamp of when fetch completed */
  timestamp: string;
  /** Which source provided the data: primary|cache|sse|none */
  source: "primary" | "cache" | "sse" | "none";
  /** Warning if fallback was used (e.g. "all fallbacks unavailable") */
  warning?: string;
}

/**
 * Cached foreign flow response for fallback use.
 * Stored in memory; survives circuit breaker open state.
 */
interface ForeignFlowCache {
  timestamp: string;
  changes: number;
  data: WriteForeignFlowItem[];
  cachedAt?: string;
}

/**
 * Cache Store interface (for dependency injection in tests).
 * Allows tests to mock cache storage.
 */
export interface CacheStore {
  get(key: string): ForeignFlowCache | null;
}

/**
 * SSE Message Bus interface (for dependency injection in tests).
 * Allows tests to mock the Telegram/SSE signal routing.
 */
export interface MessageBus {
  /** Get last N messages (for fallback extraction) */
  getRecentMessages(pattern: string, limit?: number): unknown[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Module State (for cache + telemetry)
// ─────────────────────────────────────────────────────────────────────────────

/** In-memory cache of last successful fetch. */
let lastSuccessCache: ForeignFlowCache | null = null;

/** When primary came back online (for recovery logging). */
let lastRecoveryAt: string | null = null;

/**
 * Log-spam guard: tracks the last CB state that was logged.
 *
 * When the circuit breaker is OPEN, it stays open for up to 5 minutes before
 * transitioning to half-open. Without this guard, the 60s cron would emit
 * "circuit breaker open, skipping primary" and "all fallbacks exhausted" on
 * every single call — 3 warn lines/minute × N hours = severe log noise.
 *
 * Contract: log the "open, skipping primary" warn ONCE when the state
 * transitions to open; suppress it on all subsequent calls while it remains
 * open. Reset when the breaker closes or is manually reset.
 */
let lastLoggedOpenState: boolean = false;

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main entry point: fetch foreign flow data with fallback strategy.
 *
 * Strategy (in order of preference):
 * 1. Primary: VPS endpoint (wrapped in circuit breaker)
 * 2. Fallback: in-memory cache from last successful run
 * 3. Fallback: SSE message bus recent messages (if available)
 * 4. None: return empty result with warning
 *
 * @param overrides Test-only dependency injection
 * @returns ForeignFlowFetchResult with data and source tracking
 */
export async function fetchForeignFlowWithFallback(
  overrides?: {
    now?: () => Date;
    fetchFn?: (url: string, opts?: any) => Promise<Response>;
    sseMessageBus?: MessageBus;
    cacheStore?: CacheStore;
  },
): Promise<ForeignFlowFetchResult> {
  const now = overrides?.now ?? (() => new Date());
  let timestamp = now().toISOString();
  // Format timestamp without unnecessary milliseconds (e.g., ".000Z" → "Z")
  timestamp = timestamp.replace(/\.000Z$/, 'Z');

  // ───────────────────────────────────────────────────────────────────────────
  // Strategy 1: Try primary VPS endpoint (circuit breaker wrapped)
  // ───────────────────────────────────────────────────────────────────────────

  try {
    const { breakers } = await import("../circuitBreakerRegistry.js");

    // If circuit is not open, attempt primary fetch
    if (breakers.foreignFlow.stats.state !== "open") {
      const result = await breakers.foreignFlow.execute(async () => {
        return await fetchPrimaryVpsEndpoint(
          overrides?.fetchFn ?? fetch,
          5000, // timeout: 5 seconds
        );
      });

      if (result && result.length > 0) {
        // Primary succeeded: write to DB and cache the result
        const { writeForeignFlowToOhlcv } = await import("../db/ohlcvForeignFlowStore.js");
        const { changes } = await writeForeignFlowToOhlcv(result);

        lastSuccessCache = {
          timestamp,
          changes,
          data: result,
          cachedAt: timestamp,
        };

        // Log recovery if previously down; reset the log-spam guard
        if (breakers.foreignFlow.stats.state === "closed" && lastRecoveryAt !== timestamp) {
          lastRecoveryAt = timestamp;
          lastLoggedOpenState = false; // allow next open-state to log again
          logger.info("[fallback] primary endpoint recovered", { timestamp });
        }

        return { changes, timestamp, source: "primary" };
      }
    } else {
      // Log ONCE per open-state entry — suppress repeat warn every 60s
      if (!lastLoggedOpenState) {
        lastLoggedOpenState = true;
        logger.warn("[fallback] circuit breaker OPEN — skipping primary (will not repeat until state changes)", {
          failures: breakers.foreignFlow.stats.failures,
        });
      }
    }
  } catch (err) {
    // Primary failed — proceed to fallback
    const errMsg = err instanceof Error ? err.message : String(err);

    // Log validation errors with special handling for diagnostics
    if (errMsg.includes("validation failed")) {
      logger.warn("[fallback] VPS payload schema validation failed", {
        error: errMsg,
        timestamp,
        hint: "Check VPS API response format — schema may have changed",
      });
    } else {
      logger.warn("[fallback] primary endpoint failed", { error: errMsg });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Strategy 2: Use in-memory cache from last successful run
  // ───────────────────────────────────────────────────────────────────────────

  let cache: ForeignFlowCache | null = null;
  if (overrides?.cacheStore) {
    cache = overrides.cacheStore.get("foreign_flow_last_fetch");
  } else {
    cache = lastSuccessCache;
  }

  if (cache && cache.data.length > 0) {
    // Check staleness: if >2h old, flag warning but still use (SLA checker will alert)
    const cacheTimestamp = cache.cachedAt ?? cache.timestamp;
    const cacheAgeMinutes = (Date.parse(timestamp) - Date.parse(cacheTimestamp)) / 60_000;
    const staleness = cacheAgeMinutes > 120 ? ` (${cacheAgeMinutes | 0}min old)` : "";

    logger.info("[fallback] using cached foreign flow", {
      cachedAt: cacheTimestamp,
      changes: cache.changes,
      staleness,
    });

    const result: ForeignFlowFetchResult = {
      changes: cache.changes,
      timestamp: cache.timestamp,
      source: "cache",
    };
    if (cacheAgeMinutes > 120) {
      result.warning = `cache stale: ${cacheAgeMinutes | 0}min old`;
    }
    return result;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Strategy 3: Extract from SSE message bus (if available)
  // ───────────────────────────────────────────────────────────────────────────

  if (overrides?.sseMessageBus) {
    const recentMessages = overrides.sseMessageBus.getRecentMessages("foreign_flow:*", 10);
    if (recentMessages.length > 0) {
      // Extract WriteForeignFlowItem array from most recent message
      const extracted = extractForeignFlowFromSseMessages(recentMessages);
      if (extracted.length > 0) {
        logger.info("[fallback] using SSE broadcast data", {
          itemCount: extracted.length,
        });

        // Deduplicate by (code, date) and write to DB
        const deduped = deduplicateForeignFlowItems(extracted);
        const { writeForeignFlowToOhlcv } = await import("../db/ohlcvForeignFlowStore.js");
        const { changes } = await writeForeignFlowToOhlcv(deduped);

        return {
          changes,
          timestamp,
          source: "sse",
        };
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Strategy 4: All fallbacks exhausted — return empty with warning
  // ───────────────────────────────────────────────────────────────────────────

  // Suppress repeat "exhausted" warn when CB is stuck open — already logged once
  // on the first open-state call. Only log when not already guarded.
  if (!lastLoggedOpenState) {
    logger.warn("[fallback] all fallback sources exhausted, returning empty", {
      timestamp,
    });
  }

  return {
    changes: 0,
    timestamp,
    source: "none",
    warning: "all fallbacks unavailable: check VPS endpoint + cache + SSE",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Fetch Primary VPS Endpoint
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch foreign flow data from primary VPS endpoint (port 5005).
 * Returns parsed WriteForeignFlowItem array or null on parse failure.
 *
 * Endpoint format (expected from VPS):
 *   GET http://vinahost:5005/foreign-flow
 *   Response: { data: WriteForeignFlowItem[] }
 */
async function fetchPrimaryVpsEndpoint(
  fetchFn: (url: string, opts?: any) => Promise<Response>,
  timeoutMs: number,
): Promise<WriteForeignFlowItem[] | null> {
  const vpsIp = Bun.env["VINAHOST_IP"] ?? "localhost:5005";
  const url = `http://${vpsIp}/foreign-flow`;
  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  try {
    // Set up timeout to abort the controller
    timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetchFn(url, {
      signal: controller.signal,
      timeout: timeoutMs,
    });

    if (!response.ok) {
      throw new Error(`VPS returned ${response.status}`);
    }

    const json = (await response.json()) as { data?: unknown };
    if (!Array.isArray(json.data)) {
      throw new Error("Invalid response format: expected .data array");
    }

    // Validate each item with strict schema validator (fail loudly on errors)
    const { validateForeignFlowFetcherPayload } = await import(
      "../../domain/services/market-data/foreignFlowValidator.js"
    );
    const validationResult = validateForeignFlowFetcherPayload(json.data);

    if (validationResult.errors.length > 0) {
      // Fail loudly with diagnostic details
      const errorSummary = validationResult.errors
        .slice(0, 5) // Limit to first 5 errors for readability
        .map((e) => `Item ${e.itemIndex}: ${e.field} — ${e.reason}`)
        .join("; ");
      throw new Error(
        `VPS payload validation failed: ${errorSummary}. Total errors: ${validationResult.errors.length}`,
      );
    }

    // All items validated; return valid items
    return validationResult.valid;
  } catch (err) {
    // Check if it was an abort error (timeout)
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`VPS endpoint timeout (>${timeoutMs}ms)`);
    }
    throw err;
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Extract Foreign Flow Items from SSE Messages
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse SSE messages looking for foreign_flow payloads.
 * SSE format (Telegram relay): { event: "signal:foreign_flow", data: WriteForeignFlowItem[] }
 */
function extractForeignFlowFromSseMessages(messages: unknown[]): WriteForeignFlowItem[] {
  const result: WriteForeignFlowItem[] = [];

  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;

    const m = msg as any;
    if (m.event === "signal:foreign_flow" && Array.isArray(m.data)) {
      for (const item of m.data) {
        if (isValidForeignFlowItem(item)) {
          result.push({
            code: item.code,
            date: item.date,
            foreignBuyVol: item.foreignBuyVol,
            foreignSellVol: item.foreignSellVol,
            putThroughVol: item.putThroughVol ?? 0,
          });
        }
      }
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Dedup Foreign Flow Items by (code, date)
// ─────────────────────────────────────────────────────────────────────────────

function deduplicateForeignFlowItems(items: WriteForeignFlowItem[]): WriteForeignFlowItem[] {
  const seen = new Set<string>();
  const result: WriteForeignFlowItem[] = [];

  for (const item of items) {
    const key = `${item.code}|${item.date}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Validate WriteForeignFlowItem Schema
// ─────────────────────────────────────────────────────────────────────────────

function isValidForeignFlowItem(item: unknown): item is WriteForeignFlowItem {
  if (!item || typeof item !== "object") return false;

  const obj = item as any;
  return (
    typeof obj.code === "string" &&
    typeof obj.date === "string" &&
    typeof obj.foreignBuyVol === "number" &&
    typeof obj.foreignSellVol === "number" &&
    (typeof obj.putThroughVol === "number" || obj.putThroughVol === undefined)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Test-only reset functions
// ─────────────────────────────────────────────────────────────────────────────

export function resetFallbackCache(): void {
  lastSuccessCache = null;
  lastRecoveryAt = null;
}

/**
 * Reset the log-spam guard (test-only + called after CB manual reset).
 * Allows the next CB open-state entry to emit a warn log again.
 */
export function resetLogSpamGuard(): void {
  lastLoggedOpenState = false;
}

/**
 * Reset circuit breaker state (test-only).
 * Used by tests to ensure clean state between test cases.
 */
export async function resetCircuitBreaker(): Promise<void> {
  try {
    const { breakers } = await import("../circuitBreakerRegistry.js");
    breakers.foreignFlow.reset();
  } catch {
    // Ignore import errors in test environment
  }
}
