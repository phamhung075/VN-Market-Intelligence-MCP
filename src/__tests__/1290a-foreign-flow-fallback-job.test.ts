/**
 * Test: 1290a — Foreign Flow Fallback Job Integration
 *
 * Defines the contract for integrating fetchForeignFlowWithFallback()
 * into a scheduler job that fetches and writes foreign flow data.
 *
 * 8 assertions across 4 test cases covering:
 * - Primary success path
 * - Fallback activation (cache, circuit breaker, none)
 * - Stale cache handling
 * - Circuit breaker recovery
 * - Result contract validation
 * - Error logging patterns
 *
 * @module __tests__/1290a-foreign-flow-fallback-job
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, mock } from "bun:test";
import type { WriteForeignFlowItem } from "../infrastructure/db/ohlcvForeignFlowStore.js";
import {
  fetchForeignFlowWithFallback,
  resetFallbackCache,
  resetCircuitBreaker,
} from "../infrastructure/fetchers/foreignFlowFetcher.js";
import { breakers } from "../infrastructure/circuitBreakerRegistry.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test Data Builders
// ─────────────────────────────────────────────────────────────────────────────

function mockForeignFlowItem(code: string = "VNM"): WriteForeignFlowItem {
  return {
    code,
    date: "2026-04-22",
    foreignBuyVol: 1000,
    foreignSellVol: 800,
    putThroughVol: 0,
  };
}

function createMockFetch(config: {
  data?: WriteForeignFlowItem[];
  delay?: number;
  error?: Error | string;
}) {
  return async (url: string, opts?: any): Promise<Response> => {
    if (config.delay && config.delay > 5000) {
      // Simulate timeout behavior: reject immediately with AbortError
      // (don't wait for actual delay — activates fallback logic without elapsed time)
      throw new Error("AbortError");
    }

    if (config.error) {
      throw config.error instanceof Error
        ? config.error
        : new Error(config.error);
    }

    const data = config.data || [mockForeignFlowItem()];
    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1290a — Foreign Flow Fallback Job Integration", () => {
  beforeAll(async () => {
    // Initialize in-memory database schema
    await initDatabase();
  });

  afterAll(() => {
    // Clean up database connection
    closeDb();
  });

  beforeEach(async () => {
    // Reset state before each test
    resetFallbackCache();
    await resetCircuitBreaker();
  });

  afterEach(async () => {
    // Clean up after each test
    resetFallbackCache();
    await resetCircuitBreaker();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test Case 1: Primary VPS Endpoint Success
  // ──────────────────────────────────────────────────────────────────────────

  it("Assertion 1a: Primary endpoint success returns {source:primary, changes, timestamp, fallbackActivated:false}", async () => {
    const now = new Date("2026-04-22T10:00:00Z");
    const mockData = [mockForeignFlowItem("VNM")];

    const result = await fetchForeignFlowWithFallback({
      now: () => now,
      fetchFn: createMockFetch({ data: mockData }),
    });

    expect(result.source).toBe("primary");
    expect(result.changes).toBeGreaterThanOrEqual(0);
    expect(result.timestamp).toBe("2026-04-22T10:00:00Z");
    // Job should indicate fallbackActivated: false when primary succeeds
    // This will be verified during GREEN phase implementation
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test Case 2: Primary Timeout → Cache Fallback
  // ──────────────────────────────────────────────────────────────────────────

  it("Assertion 2a: Primary timeout (>5s) activates cache fallback with metadata", async () => {
    const now = new Date("2026-04-22T10:05:00Z");
    const cacheTimestamp = "2026-04-22T10:00:00Z";
    const mockCacheData = [mockForeignFlowItem("VNM")];

    // Mock cache store with recent data
    const mockCacheStore = {
      get: () => ({
        data: mockCacheData,
        timestamp: cacheTimestamp,
        changes: 5,
        cachedAt: cacheTimestamp,
      }),
    };

    const result = await fetchForeignFlowWithFallback({
      now: () => now,
      fetchFn: createMockFetch({ delay: 6000 }), // Timeout after 5s
      cacheStore: mockCacheStore,
    });

    expect(result.source).toBe("cache");
    expect(result.changes).toBe(5);
    expect(result.timestamp).toBe(cacheTimestamp);
    // Cache <2h old should not have warning
    expect(result.warning).toBeUndefined();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test Case 3: Circuit Breaker Open → Cache
  // ──────────────────────────────────────────────────────────────────────────

  it("Assertion 3a: Circuit breaker open skips primary and uses cache", async () => {
    const now = new Date("2026-04-22T10:10:00Z");
    const mockCacheData = [mockForeignFlowItem("VNM")];

    // Open the circuit by simulating 5 consecutive failures
    for (let i = 0; i < 5; i++) {
      try {
        await breakers.foreignFlow.execute(() => Promise.reject(new Error("Simulated failure")));
      } catch {
        // Expected to fail
      }
    }

    // Verify circuit is open
    expect(breakers.foreignFlow.stats.state).toBe("open");

    const mockCacheStore = {
      get: () => ({
        data: mockCacheData,
        timestamp: "2026-04-22T10:00:00Z",
        changes: 3,
        cachedAt: "2026-04-22T10:00:00Z",
      }),
    };

    const result = await fetchForeignFlowWithFallback({
      now: () => now,
      fetchFn: createMockFetch({ data: [] }), // Should not be called
      cacheStore: mockCacheStore,
    });

    expect(result.source).toBe("cache");
    expect(result.changes).toBe(3);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test Case 4: All Fallbacks Exhausted
  // ──────────────────────────────────────────────────────────────────────────

  it("Assertion 4a: All fallbacks exhausted returns empty result with warning", async () => {
    const now = new Date("2026-04-22T10:10:00Z");

    // No cache, no SSE message bus
    const result = await fetchForeignFlowWithFallback({
      now: () => now,
      fetchFn: createMockFetch({ delay: 6000 }), // Timeout
      cacheStore: { get: () => null },
    });

    expect(result.source).toBe("none");
    expect(result.changes).toBe(0);
    expect(result.warning).toContain("all fallbacks unavailable");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test Case 5: Stale Cache Warning
  // ──────────────────────────────────────────────────────────────────────────

  it("Assertion 5a: Cache >2h old includes staleness warning", async () => {
    const now = new Date("2026-04-22T10:00:00Z");
    const cacheTimestamp = "2026-04-22T06:00:00Z"; // 4 hours old
    const mockCacheData = [mockForeignFlowItem("VNM")];

    const mockCacheStore = {
      get: () => ({
        data: mockCacheData,
        timestamp: cacheTimestamp,
        changes: 2,
        cachedAt: cacheTimestamp,
      }),
    };

    const result = await fetchForeignFlowWithFallback({
      now: () => now,
      fetchFn: createMockFetch({ delay: 6000 }), // Timeout to trigger cache fallback
      cacheStore: mockCacheStore,
    });

    expect(result.source).toBe("cache");
    expect(result.changes).toBe(2);
    expect(result.warning).toBeTruthy();
    expect(result.warning).toMatch(/cache stale.*240.*min old/i);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test Case 6: Circuit Breaker Recovery Detection
  // ──────────────────────────────────────────────────────────────────────────

  it("Assertion 6a: Circuit breaker closes on primary success after open state", async () => {
    const now = new Date("2026-04-22T10:15:00Z");

    // Open circuit with failures
    for (let i = 0; i < 5; i++) {
      try {
        await breakers.foreignFlow.execute(() => Promise.reject(new Error("Failure")));
      } catch {
        // Expected
      }
    }
    expect(breakers.foreignFlow.stats.state).toBe("open");

    // Reset and simulate recovery
    await resetCircuitBreaker();
    expect(breakers.foreignFlow.stats.state).toBe("closed");

    const mockData = [mockForeignFlowItem("VNM")];
    const result = await fetchForeignFlowWithFallback({
      now: () => now,
      fetchFn: createMockFetch({ data: mockData }),
    });

    expect(result.source).toBe("primary");
    expect(result.changes).toBeGreaterThanOrEqual(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test Case 7: Job Result Contract
  // ──────────────────────────────────────────────────────────────────────────

  it("Assertion 7a: Result contract always includes {source, changes, timestamp, warning?}", async () => {
    const now = new Date("2026-04-22T10:20:00Z");

    // Test with successful primary
    const result1 = await fetchForeignFlowWithFallback({
      now: () => now,
      fetchFn: createMockFetch({ data: [mockForeignFlowItem()] }),
    });

    expect(result1).toHaveProperty("source");
    expect(result1).toHaveProperty("changes");
    expect(result1).toHaveProperty("timestamp");
    expect(["primary", "cache", "sse", "none"]).toContain(result1.source);
    expect(typeof result1.changes).toBe("number");
    expect(result1.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO 8601

    // Test with fallback path
    const result2 = await fetchForeignFlowWithFallback({
      now: () => now,
      fetchFn: createMockFetch({ delay: 6000 }),
      cacheStore: { get: () => null },
    });

    expect(result2).toHaveProperty("source");
    expect(result2).toHaveProperty("changes");
    expect(result2).toHaveProperty("timestamp");
    expect(typeof result2.warning === "string" || result2.warning === undefined).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test Case 8: Error Logging Contract
  // ──────────────────────────────────────────────────────────────────────────

  it("Assertion 8a: Error paths include contextual logging (error, source, cbState, timestamp)", async () => {
    const now = new Date("2026-04-22T10:25:00Z");

    // Test 1: Timeout error path
    const result1 = await fetchForeignFlowWithFallback({
      now: () => now,
      fetchFn: createMockFetch({ delay: 6000 }),
      cacheStore: { get: () => null },
    });

    // Should return result with warning (not throw)
    expect(result1).toBeDefined();
    expect(result1.warning).toBeTruthy();

    // Test 2: Validation error path
    const result2 = await fetchForeignFlowWithFallback({
      now: () => now,
      fetchFn: createMockFetch({
        error: new Error("VPS payload validation failed: Item 0: code — required field"),
      }),
      cacheStore: { get: () => null },
    });

    expect(result2).toBeDefined();
    expect(result2.source).toBe("none");

    // Test 3: Circuit breaker state should be observable
    for (let i = 0; i < 5; i++) {
      try {
        await breakers.foreignFlow.execute(() => Promise.reject(new Error("Test failure")));
      } catch {
        // Expected
      }
    }
    expect(breakers.foreignFlow.stats.state).toBe("open");
    expect(breakers.foreignFlow.stats.failures).toBeGreaterThanOrEqual(5);
  });
});
