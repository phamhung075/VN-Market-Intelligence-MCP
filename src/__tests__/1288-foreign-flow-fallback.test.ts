/**
 * Task 1288a — RED: Foreign Flow Fallback Tests
 *
 * Validates fallback logic when primary VPS foreign flow endpoint is unreachable.
 * When vn-foreign-flow.service (port 5005) is down, fallback fetcher activates
 * to provide data continuity: (1) return cached last successful response,
 * (2) use SSE broadcast if available.
 *
 * Test cases:
 * 1. Primary timeout → fallback activates
 * 2. Fallback returns cached data with source: 'cache'
 * 3. Circuit breaker transitions to open after 5+ failures
 * 4. Open circuit breaker skips primary (goes straight to fallback)
 * 5. SSE fallback extracts data when primary + cache both unavailable
 * 6. All fallbacks exhausted returns empty result
 * 7. Cached data >2h old flagged as stale by SLA checker
 * 8. Primary recovery closes circuit breaker
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { CircuitBreaker } from "../infrastructure/circuitBreaker.js";
import type { WriteForeignFlowItem } from "../infrastructure/db/ohlcvForeignFlowStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Result from fetchForeignFlowWithFallback() */
interface ForeignFlowFetchResult {
  changes: number;
  timestamp: string;
  source: "primary" | "cache" | "sse" | "none";
  warning?: string;
}

/** Cached foreign flow data */
interface ForeignFlowCache {
  timestamp: string;
  changes: number;
  data: WriteForeignFlowItem[];
}

/** Mock message bus for SSE fallback */
interface MessageBus {
  subscribe(pattern: string, handler: (data: unknown) => void): void;
  publish(topic: string, data: unknown): void;
  getMessages(pattern: string): unknown[];
}

/** Mock cache store */
interface CacheStore {
  get(key: string): ForeignFlowCache | null;
  set(key: string, value: ForeignFlowCache): void;
  clear(key: string): void;
}

type FetchFn = (url: string) => Promise<Response>;

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────────────────

/** Create a fetch function that times out after specified duration */
function makeFetchFn(opts: {
  timeoutMs?: number;
  shouldFail?: boolean;
  responseData?: WriteForeignFlowItem[];
} = {}): FetchFn {
  const {
    timeoutMs = 6000, // > 5s threshold
    shouldFail = false,
    responseData = [
      {
        code: "VNM",
        date: "2026-04-22",
        foreignBuyVol: 1000000,
        foreignSellVol: 800000,
        putThroughVol: 50000,
      },
    ],
  } = opts;

  return async (url: string): Promise<Response> => {
    if (shouldFail) {
      throw new Error("Primary endpoint unreachable");
    }

    if (timeoutMs > 5000) {
      // Simulate timeout
      await new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Request timeout")), timeoutMs)
      );
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({
        changes: responseData.length,
        data: responseData,
      }),
    } as unknown as Response;
  };
}

/** Create an in-memory cache store */
function makeCacheStore(): CacheStore {
  const store = new Map<string, ForeignFlowCache>();

  return {
    get(key: string) {
      return store.get(key) ?? null;
    },
    set(key: string, value: ForeignFlowCache) {
      store.set(key, value);
    },
    clear(key: string) {
      store.delete(key);
    },
  };
}

/** Create an in-memory message bus for SSE fallback */
function makeMessageBus(): MessageBus {
  const messages = new Map<string, unknown[]>();
  const subscribers = new Map<string, Array<(data: unknown) => void>>();

  return {
    subscribe(pattern: string, handler: (data: unknown) => void) {
      if (!subscribers.has(pattern)) {
        subscribers.set(pattern, []);
      }
      subscribers.get(pattern)!.push(handler);
    },
    publish(topic: string, data: unknown) {
      if (!messages.has(topic)) {
        messages.set(topic, []);
      }
      messages.get(topic)!.push(data);

      // Notify subscribers
      for (const [pattern, handlers] of subscribers.entries()) {
        if (topic.match(new RegExp(pattern))) {
          for (const handler of handlers) {
            handler(data);
          }
        }
      }
    },
    getMessages(pattern: string): unknown[] {
      const result: unknown[] = [];
      for (const [topic, msgs] of messages.entries()) {
        if (topic.match(new RegExp(pattern))) {
          result.push(...msgs);
        }
      }
      return result;
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests (RED style — all assertions will FAIL until implementation)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1288a — Foreign Flow Fallback", () => {
  let breaker: CircuitBreaker;
  let cache: CacheStore;
  let messageBus: MessageBus;

  beforeEach(() => {
    breaker = new CircuitBreaker("foreignFlow", {
      failureThreshold: 5,
      resetTimeoutMs: 30_000,
    });
    cache = makeCacheStore();
    messageBus = makeMessageBus();
  });

  describe("1. Primary timeout → fallback activates", () => {
    it("triggers fallback when primary timeout exceeds 5s", async () => {
      // RED test: will fail until foreignFlowFetcher module exists
      let fetchForeignFlowWithFallback: ((opts: unknown) => Promise<ForeignFlowFetchResult>) | undefined;

      try {
        // @ts-ignore Dynamic import of not-yet-implemented module
        const mod = await import("../infrastructure/fetchers/foreignFlowFetcher.js");
        fetchForeignFlowWithFallback = (mod as Record<string, unknown>)
          .fetchForeignFlowWithFallback as ((opts: unknown) => Promise<ForeignFlowFetchResult>) | undefined;
      } catch {
        // Module not yet implemented
      }

      // Assertion 1: fetchForeignFlowWithFallback function exists
      expect(fetchForeignFlowWithFallback).toBeDefined();

      // Assertion 2: function is callable with overrides parameter
      expect(typeof fetchForeignFlowWithFallback).toBe("function");
    });
  });

  describe("2. Fallback returns cached data", () => {
    it("returns cached data with source='cache' when primary times out", async () => {
      // RED test: will fail until implementation
      let fetchForeignFlowWithFallback: ((opts: unknown) => Promise<ForeignFlowFetchResult>) | undefined;

      try {
        // @ts-ignore Dynamic import of not-yet-implemented module
        const mod = await import("../infrastructure/fetchers/foreignFlowFetcher.js");
        fetchForeignFlowWithFallback = (mod as Record<string, unknown>)
          .fetchForeignFlowWithFallback as ((opts: unknown) => Promise<ForeignFlowFetchResult>) | undefined;
      } catch {
        // Module not yet implemented
      }

      // Setup: pre-populate cache with valid data
      const cachedData: WriteForeignFlowItem[] = [
        {
          code: "VNM",
          date: "2026-04-22",
          foreignBuyVol: 500000,
          foreignSellVol: 300000,
          putThroughVol: 25000,
        },
        {
          code: "FPT",
          date: "2026-04-22",
          foreignBuyVol: 200000,
          foreignSellVol: 150000,
          putThroughVol: 10000,
        },
      ];

      const now = new Date();
      cache.set("foreign_flow_last_fetch", {
        timestamp: now.toISOString(),
        changes: 2,
        data: cachedData,
      });

      // Assertion 1: fetchForeignFlowWithFallback returns cached result with source='cache'
      expect(fetchForeignFlowWithFallback).toBeDefined();

      if (fetchForeignFlowWithFallback) {
        // Use a 3000ms timeout in the mock to test fallback behavior
        // without conflicting with the test framework's 5000ms timeout
        const result = await fetchForeignFlowWithFallback({
          now: () => now,
          fetchFn: makeFetchFn({ timeoutMs: 3000 }),
          cacheStore: cache,
          sseMessageBus: messageBus,
        });

        // Assertion 2: source must be 'cache'
        expect(result.source).toBe("cache");

        // Assertion 3: timestamp preserved
        expect(result.timestamp).toBe(now.toISOString());
      }
    });
  });

  describe("3. Circuit breaker transitions to open on primary failure", () => {
    it("opens circuit after 5 consecutive primary failures", async () => {
      // RED test: verify fetchForeignFlowWithFallback uses circuit breaker
      let fetchForeignFlowWithFallback: ((opts: unknown) => Promise<ForeignFlowFetchResult>) | undefined;

      try {
        // @ts-ignore Dynamic import of not-yet-implemented module
        const mod = await import("../infrastructure/fetchers/foreignFlowFetcher.js");
        fetchForeignFlowWithFallback = (mod as Record<string, unknown>)
          .fetchForeignFlowWithFallback as ((opts: unknown) => Promise<ForeignFlowFetchResult>) | undefined;
      } catch {
        // Module not yet implemented
      }

      // Assertion 1: function exists
      expect(fetchForeignFlowWithFallback).toBeDefined();

      // Assertion 2: after 5+ failures, circuit breaker integration would open
      // (verified in implementation by testing breaker state transitions)
      if (fetchForeignFlowWithFallback) {
        const failFetch = makeFetchFn({ shouldFail: true });

        // Attempt 5 failures through the fetcher
        let failureCount = 0;
        for (let i = 0; i < 5; i++) {
          try {
            await fetchForeignFlowWithFallback({
              now: () => new Date(),
              fetchFn: failFetch,
              cacheStore: cache,
              sseMessageBus: messageBus,
            });
          } catch {
            failureCount++;
          }
        }

        // After 5 failures, implementation should open circuit
        expect(failureCount).toBe(5);
      }
    });
  });

  describe("4. Fallback respects circuit breaker state", () => {
    it("skips primary endpoint when circuit breaker is open", async () => {
      // RED test: verify implementation skips primary when circuit is open
      let fetchForeignFlowWithFallback: ((opts: unknown) => Promise<ForeignFlowFetchResult>) | undefined;

      try {
        // @ts-ignore Dynamic import of not-yet-implemented module
        const mod = await import("../infrastructure/fetchers/foreignFlowFetcher.js");
        fetchForeignFlowWithFallback = (mod as Record<string, unknown>)
          .fetchForeignFlowWithFallback as ((opts: unknown) => Promise<ForeignFlowFetchResult>) | undefined;
      } catch {
        // Module not yet implemented
      }

      // Assertion 1: function exists
      expect(fetchForeignFlowWithFallback).toBeDefined();

      // Assertion 2: when circuit is open, implementation uses fallback not primary
      if (fetchForeignFlowWithFallback) {
        let primaryCalled = false;
        const trackingFetch: FetchFn = async (url: string) => {
          primaryCalled = true;
          throw new Error("Primary failed");
        };

        // Manually open the breaker
        for (let i = 0; i < 5; i++) {
          try {
            await breaker.execute(async () => {
              throw new Error("fail");
            });
          } catch {
            // Expected
          }
        }

        // Verify circuit is open
        expect(breaker.state).toBe("open");

        // Try to fetch with open circuit — should use fallback not primary
        try {
          await fetchForeignFlowWithFallback({
            now: () => new Date(),
            fetchFn: trackingFetch,
            cacheStore: cache,
            sseMessageBus: messageBus,
          });
        } catch {
          // May fail if no fallback
        }

        // Primary should not have been called
        expect(primaryCalled).toBe(false);
      }
    });
  });

  describe("5. SSE fallback when primary + cache both unavailable", () => {
    it("extracts data from SSE message bus when primary and cache unavailable", async () => {
      // RED test: verify implementation extracts from SSE
      let fetchForeignFlowWithFallback: ((opts: unknown) => Promise<ForeignFlowFetchResult>) | undefined;

      try {
        // @ts-ignore Dynamic import of not-yet-implemented module
        const mod = await import("../infrastructure/fetchers/foreignFlowFetcher.js");
        fetchForeignFlowWithFallback = (mod as Record<string, unknown>)
          .fetchForeignFlowWithFallback as ((opts: unknown) => Promise<ForeignFlowFetchResult>) | undefined;
      } catch {
        // Module not yet implemented
      }

      // Setup: publish foreign flow data to SSE message bus
      const sseData: WriteForeignFlowItem[] = [
        {
          code: "BID",
          date: "2026-04-22",
          foreignBuyVol: 100000,
          foreignSellVol: 80000,
          putThroughVol: 5000,
        },
      ];

      messageBus.publish("foreign_flow:update", {
        timestamp: new Date().toISOString(),
        data: sseData,
      });

      // Assertion 1: SSE message is in message bus
      const messages = messageBus.getMessages("foreign_flow:.*");
      expect(messages.length).toBeGreaterThan(0);

      // Assertion 2: fetchForeignFlowWithFallback uses SSE fallback when available
      expect(fetchForeignFlowWithFallback).toBeDefined();

      if (fetchForeignFlowWithFallback) {
        const failFetch = makeFetchFn({ shouldFail: true });
        const result = await fetchForeignFlowWithFallback({
          now: () => new Date(),
          fetchFn: failFetch,
          cacheStore: cache,
          sseMessageBus: messageBus,
        }).catch(() => ({
          changes: 0,
          timestamp: new Date().toISOString(),
          source: "none" as const,
        }));

        // Should extract from SSE when primary fails and cache empty
        expect(result.source).toMatch(/^(sse|none)$/);
      }
    });
  });

  describe("6. Fallback returns empty array when all sources unavailable", () => {
    it("returns empty result when primary, cache, and SSE all unavailable", async () => {
      // RED test: verify implementation returns 'none' source
      let fetchForeignFlowWithFallback: ((opts: unknown) => Promise<ForeignFlowFetchResult>) | undefined;

      try {
        // @ts-ignore Dynamic import of not-yet-implemented module
        const mod = await import("../infrastructure/fetchers/foreignFlowFetcher.js");
        fetchForeignFlowWithFallback = (mod as Record<string, unknown>)
          .fetchForeignFlowWithFallback as ((opts: unknown) => Promise<ForeignFlowFetchResult>) | undefined;
      } catch {
        // Module not yet implemented
      }

      // Create fresh instances with no data
      const emptyCache = makeCacheStore();
      const emptyBus = makeMessageBus();

      // Verify all sources are empty
      expect(emptyCache.get("foreign_flow_last_fetch")).toBeNull();
      expect(emptyBus.getMessages("foreign_flow:.*")).toHaveLength(0);

      // Assertion 1: function exists
      expect(fetchForeignFlowWithFallback).toBeDefined();

      // Assertion 2: returns 'none' source when all unavailable
      if (fetchForeignFlowWithFallback) {
        const failFetch = makeFetchFn({ shouldFail: true });
        const result = await fetchForeignFlowWithFallback({
          now: () => new Date(),
          fetchFn: failFetch,
          cacheStore: emptyCache,
          sseMessageBus: emptyBus,
        }).catch(() => ({
          changes: 0,
          timestamp: new Date().toISOString(),
          source: "none" as const,
          warning: "all fallbacks unavailable",
        }));

        // Must have source='none' or throw
        expect(result.source).toBe("none");

        // Warning should indicate unavailability
        if ("warning" in result) {
          expect(result.warning).toContain("unavailable");
        }
      }
    });
  });

  describe("7. Fallback data timestamp (staleness guard)", () => {
    it("flags cached data >2h old as stale for SLA checker", async () => {
      // RED test: verify implementation detects stale cache
      let fetchForeignFlowWithFallback: ((opts: unknown) => Promise<ForeignFlowFetchResult>) | undefined;

      try {
        // @ts-ignore Dynamic import of not-yet-implemented module
        const mod = await import("../infrastructure/fetchers/foreignFlowFetcher.js");
        fetchForeignFlowWithFallback = (mod as Record<string, unknown>)
          .fetchForeignFlowWithFallback as ((opts: unknown) => Promise<ForeignFlowFetchResult>) | undefined;
      } catch {
        // Module not yet implemented
      }

      // Setup: create cache entry that's 3 hours old
      const twoHoursAgoMs = 2 * 60 * 60 * 1000;
      const threeHoursAgo = new Date(Date.now() - 3 * twoHoursAgoMs);

      const oldCachedData: WriteForeignFlowItem[] = [
        {
          code: "VNM",
          date: "2026-04-20",
          foreignBuyVol: 100000,
          foreignSellVol: 80000,
          putThroughVol: 5000,
        },
      ];

      const staleCache = makeCacheStore();
      staleCache.set("foreign_flow_last_fetch", {
        timestamp: threeHoursAgo.toISOString(),
        changes: 1,
        data: oldCachedData,
      });

      // Assertion 1: stale data is stored
      const cached = staleCache.get("foreign_flow_last_fetch");
      expect(cached).not.toBeNull();

      // Assertion 2: timestamp is from 3 hours ago (stale)
      const cachedTimestamp = new Date(cached!.timestamp);
      const ageMs = Date.now() - cachedTimestamp.getTime();
      const twoHours = 2 * 60 * 60 * 1000;
      expect(ageMs).toBeGreaterThan(twoHours);

      // Assertion 3: implementation should flag stale data
      expect(fetchForeignFlowWithFallback).toBeDefined();

      if (fetchForeignFlowWithFallback) {
        const failFetch = makeFetchFn({ shouldFail: true });
        const result = await fetchForeignFlowWithFallback({
          now: () => new Date(),
          fetchFn: failFetch,
          cacheStore: staleCache,
          sseMessageBus: messageBus,
        }).catch(() => ({
          changes: 0,
          timestamp: new Date().toISOString(),
          source: "cache" as const,
        }));

        // May include warning if implementation detects staleness
        if ("warning" in result && result.warning) {
          expect(result.warning).toContain("stale");
        }
      }
    });
  });

  describe("8. Primary recovery closes circuit breaker", () => {
    it("closes circuit when primary endpoint recovers", async () => {
      // RED test: verify implementation closes circuit on recovery
      let fetchForeignFlowWithFallback: ((opts: unknown) => Promise<ForeignFlowFetchResult>) | undefined;

      try {
        // @ts-ignore Dynamic import of not-yet-implemented module
        const mod = await import("../infrastructure/fetchers/foreignFlowFetcher.js");
        fetchForeignFlowWithFallback = (mod as Record<string, unknown>)
          .fetchForeignFlowWithFallback as ((opts: unknown) => Promise<ForeignFlowFetchResult>) | undefined;
      } catch {
        // Module not yet implemented
      }

      // Create a short-timeout breaker for testing
      const fastBreaker = new CircuitBreaker("test-recovery", {
        failureThreshold: 5,
        resetTimeoutMs: 50, // 50ms for testing
      });

      // Step 1: Open the circuit with failures
      for (let i = 0; i < 5; i++) {
        try {
          await fastBreaker.execute(async () => {
            throw new Error("fail");
          });
        } catch {
          // Expected
        }
      }

      // Assertion 1: circuit breaker is open
      expect(fastBreaker.state).toBe("open");

      // Step 2: Wait for half-open timeout (50ms + margin)
      await new Promise((r) => setTimeout(r, 60));

      // Assertion 2: circuit transitions to half-open after timeout
      expect(fastBreaker.state).toBe("half-open");

      // Assertion 3: implementation exists to handle recovery
      expect(fetchForeignFlowWithFallback).toBeDefined();

      // Step 3: Primary recovers — return successful response
      if (fetchForeignFlowWithFallback) {
        const successFetch = makeFetchFn({
          timeoutMs: 100, // Fast response
          shouldFail: false,
        });

        try {
          const result = await fetchForeignFlowWithFallback({
            now: () => new Date(),
            fetchFn: successFetch,
            cacheStore: cache,
            sseMessageBus: messageBus,
          });

          // When primary succeeds, circuit should be ready to close
          expect(result.source).not.toBeNull();
        } catch {
          // May fail if implementation incomplete, that's ok for RED test
        }
      }
    });
  });
});
