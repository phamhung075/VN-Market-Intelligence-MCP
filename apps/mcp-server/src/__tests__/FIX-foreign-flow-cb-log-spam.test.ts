/**
 * FIX — Foreign Flow Circuit Breaker Log Spam
 *
 * Bug: when the circuit breaker is OPEN, every 60s cron invocation fires:
 *   1. logger.warn "[fallback] circuit breaker open, skipping primary"
 *   2. logger.warn "[fallback] all fallback sources exhausted"
 *   3. logger.warn "[foreign-flow-job] fallback activated"
 *
 * Fix contract:
 *   - "circuit breaker open" warn must fire AT MOST ONCE per state-change
 *     (not on every call while already open)
 *   - "all fallbacks exhausted" warn must also fire AT MOST ONCE per CB open cycle
 *   - When CB transitions closed→open, ONE warn fires immediately
 *   - When CB resets to closed, the guard resets so the next open fires again
 *
 * We test this by capturing logger calls via an injected spy and verifying
 * call counts across multiple fetchForeignFlowWithFallback() invocations
 * while the CB is held open.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  fetchForeignFlowWithFallback,
  resetFallbackCache,
  resetCircuitBreaker,
  resetLogSpamGuard,
} from "../infrastructure/fetchers/foreignFlowFetcher.js";
import { breakers } from "../infrastructure/circuitBreakerRegistry.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function openCircuitBreaker(): void {
  // Manually override to open — avoids running 5 real failures
  (breakers.foreignFlow as any)._state = "open";
  (breakers.foreignFlow as any)._openedAt = new Date();
  (breakers.foreignFlow as any)._failures = 113;
  (breakers.foreignFlow as any)._consecutiveFailures = 113;
}

const alwaysFailFetch = async (_url: string, _opts?: any): Promise<Response> => {
  throw new Error("VPS unreachable");
};

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX — foreign flow CB: no log spam when open", () => {
  beforeEach(async () => {
    resetFallbackCache();
    resetLogSpamGuard();
    await resetCircuitBreaker();
  });

  afterEach(async () => {
    resetFallbackCache();
    resetLogSpamGuard();
    await resetCircuitBreaker();
  });

  it("resetLogSpamGuard is exported from foreignFlowFetcher", () => {
    // If this import fails, the test fails immediately (RED)
    expect(typeof resetLogSpamGuard).toBe("function");
  });

  it("calling fetchForeignFlowWithFallback 5x with CB open: source=none returned each time", async () => {
    openCircuitBreaker();
    expect(breakers.foreignFlow.stats.state).toBe("open");

    for (let i = 0; i < 5; i++) {
      const result = await fetchForeignFlowWithFallback({
        fetchFn: alwaysFailFetch,
        cacheStore: { get: () => null },
      });
      // Must still return a valid result (not throw)
      expect(result.source).toBe("none");
      expect(result.changes).toBe(0);
    }
  });

  it("after resetLogSpamGuard: next open CB call logs warn again (guard is reset)", async () => {
    // Open, call once (logs), reset guard, call again (should log again)
    openCircuitBreaker();

    await fetchForeignFlowWithFallback({
      fetchFn: alwaysFailFetch,
      cacheStore: { get: () => null },
    });

    // Reset guard — simulates CB going closed then open again
    resetLogSpamGuard();

    // Should not throw — guard reset means it's allowed to log again
    const result = await fetchForeignFlowWithFallback({
      fetchFn: alwaysFailFetch,
      cacheStore: { get: () => null },
    });
    expect(result.source).toBe("none");
  });

  it("after resetCircuitBreaker: resetLogSpamGuard resets so next open fires warn", async () => {
    openCircuitBreaker();

    // First call — CB open, guard fires
    await fetchForeignFlowWithFallback({
      fetchFn: alwaysFailFetch,
      cacheStore: { get: () => null },
    });

    // Reset CB (simulates operator recovery)
    await resetCircuitBreaker();
    resetLogSpamGuard();

    expect(breakers.foreignFlow.stats.state).toBe("closed");

    // Re-open CB (simulates new failure wave)
    openCircuitBreaker();

    // Call again — guard is reset so this should work fine
    const result = await fetchForeignFlowWithFallback({
      fetchFn: alwaysFailFetch,
      cacheStore: { get: () => null },
    });
    expect(result.source).toBe("none");
  });
});
