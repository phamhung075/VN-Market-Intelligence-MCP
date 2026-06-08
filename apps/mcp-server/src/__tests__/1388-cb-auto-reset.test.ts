/**
 * Task 1388 — Circuit Breaker Auto-Reset
 *
 * Verifies that the foreignFlow CircuitBreaker auto-closes after a successful
 * half-open probe with no manual intervention required.
 *
 * Key change: foreignFlow breaker uses halfOpenMaxAttempts=1 so a single
 * successful probe after the underlying error is fixed closes the circuit.
 * Previously halfOpenMaxAttempts=2 required 2 consecutive successes, which
 * increased the chance of a failed half-open re-opening the circuit.
 *
 * Tests:
 *   1. halfOpenMaxAttempts=1 closes circuit after single successful probe
 *   2. halfOpenMaxAttempts=1: failed probe re-opens, then success closes
 *   3. foreignFlow registry breaker has halfOpenMaxAttempts=1
 *   4. OPEN→HALF_OPEN transition still fires after resetTimeoutMs
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import { CircuitBreaker } from "../infrastructure/circuitBreaker.js";
import { breakers } from "../infrastructure/circuitBreakerRegistry.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// Helper: force a CB into half-open state by setting internal state directly
function forceHalfOpen(cb: CircuitBreaker): void {
  const internal = cb as unknown as {
    _state: string;
    _openedAt: Date | null;
    _consecutiveFailures: number;
    _halfOpenSuccesses: number;
  };
  internal._state = "half-open";
  internal._openedAt = null;
  internal._halfOpenSuccesses = 0;
}

// Helper: force a CB into open state
function forceOpen(cb: CircuitBreaker, failures = 5): void {
  const internal = cb as unknown as {
    _state: string;
    _openedAt: Date | null;
    _consecutiveFailures: number;
    _failures: number;
  };
  internal._state = "open";
  internal._openedAt = new Date(Date.now() - 999999); // well past resetTimeoutMs
  internal._consecutiveFailures = failures;
  internal._failures = failures;
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1: halfOpenMaxAttempts=1 behaviour
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1388 — halfOpenMaxAttempts=1: single probe auto-closes circuit", () => {
  it("single successful half-open probe closes the circuit", async () => {
    const cb = new CircuitBreaker("test-1388-a", {
      failureThreshold: 5,
      resetTimeoutMs: 300_000,
      halfOpenMaxAttempts: 1,
    });

    forceHalfOpen(cb);
    expect(cb.stats.state).toBe("half-open");

    // Single success → CLOSED (no second probe needed)
    await cb.execute(() => Promise.resolve("db upsert ok"));
    expect(cb.stats.state).toBe("closed");
  });

  it("failed half-open probe re-opens; next successful probe after timeout closes circuit", async () => {
    const cb = new CircuitBreaker("test-1388-b", {
      failureThreshold: 5,
      resetTimeoutMs: 300_000,
      halfOpenMaxAttempts: 1,
    });

    // First half-open: probe fails → re-opens
    forceHalfOpen(cb);
    try { await cb.execute(() => Promise.reject(new Error("still failing"))); } catch { /* expected */ }
    // CB is now open; forceOpen with past openedAt to simulate timeout elapsed
    forceOpen(cb, 10);

    // Next execute() sees openedAt in the past → _checkTimeout fires OPEN→HALF_OPEN
    // then fn() succeeds → halfOpenMaxAttempts=1 → CLOSED
    await cb.execute(() => Promise.resolve("now fixed"));
    expect(cb.stats.state).toBe("closed");
  });

  it("consecutive failures in closed state still trip the breaker", async () => {
    const cb = new CircuitBreaker("test-1388-c", {
      failureThreshold: 3,
      resetTimeoutMs: 300_000,
      halfOpenMaxAttempts: 1,
    });

    for (let i = 0; i < 3; i++) {
      try { await cb.execute(() => Promise.reject(new Error("fail"))); } catch { /* expected */ }
    }
    expect(cb.stats.state).toBe("open");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2: foreignFlow registry breaker config
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1388 — foreignFlow breaker: halfOpenMaxAttempts=1 for fast recovery", () => {
  it("foreignFlow registry breaker has halfOpenMaxAttempts=1", () => {
    const config = (breakers.foreignFlow as unknown as {
      config: { halfOpenMaxAttempts: number; failureThreshold: number; resetTimeoutMs: number };
    }).config;
    expect(config.halfOpenMaxAttempts).toBe(1);
  });

  it("foreignFlow closes after single half-open probe success (production scenario)", async () => {
    const cb = breakers.foreignFlow;
    cb.reset();

    try {
      // Simulate 168-failure scenario: CB is stuck open with old openedAt
      forceOpen(cb, 168);
      // Do NOT read cb.stats.state here — it would trigger _checkTimeout immediately

      // openedAt is well in the past → next execute() triggers OPEN→HALF_OPEN
      // then single success closes it (halfOpenMaxAttempts=1)
      await cb.execute(() => Promise.resolve("upsert ok after DB fix"));
      expect(cb.stats.state).toBe("closed");
    } finally {
      cb.reset();
    }
  });
});
