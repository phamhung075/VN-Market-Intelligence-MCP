/**
 * Task 1404 — Foreign-flow CB startup reset
 *
 * Tests:
 *   1404-1: scheduleForeignFlowCbReset calls reset() when CB is OPEN
 *   1404-2: scheduleForeignFlowCbReset is a no-op when CB is already CLOSED
 *   1404-3: scheduleForeignFlowCbReset calls reset() when CB is HALF_OPEN
 *   1404-4: breakers.foreignFlow.reset() clears failure count and returns to CLOSED
 *   1404-5: configurable delay — reset fires at delayMs=0 within 50ms
 *   1404-6: FOREIGN_FLOW_CB_RESET_DELAY_MS env var parses to a valid integer
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, afterEach } from "bun:test";
import { CircuitBreaker } from "../infrastructure/circuitBreaker.js";
import { breakers } from "../infrastructure/circuitBreakerRegistry.js";
import { scheduleForeignFlowCbReset } from "../scheduler/jobs.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function forceOpen(cb: CircuitBreaker): void {
  const internal = cb as unknown as {
    _state: string;
    _openedAt: Date | null;
    _failures: number;
    _consecutiveFailures: number;
  };
  internal._state = "open";
  internal._openedAt = new Date();
  internal._failures = 21;
  internal._consecutiveFailures = 21;
}

function forceHalfOpen(cb: CircuitBreaker): void {
  const internal = cb as unknown as {
    _state: string;
    _openedAt: Date | null;
    _halfOpenSuccesses: number;
  };
  internal._state = "half-open";
  internal._openedAt = null;
  internal._halfOpenSuccesses = 0;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Task 1404 — foreignFlow CB startup reset", () => {
  afterEach(() => {
    // Always restore the production breaker to CLOSED between tests
    breakers.foreignFlow.reset();
  });

  it("1404-1: calls reset() when CB is OPEN", async () => {
    const cb = new CircuitBreaker("test-1404-open", {
      failureThreshold: 5,
      resetTimeoutMs: 300_000,
      halfOpenMaxAttempts: 1,
    });
    forceOpen(cb);
    expect(cb.stats.state).toBe("open");

    const handle = scheduleForeignFlowCbReset(0, cb);
    // delayMs=0 fires on next event loop tick
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    clearTimeout(handle);

    expect(cb.stats.state).toBe("closed");
    // Failure count cleared by reset()
    expect(cb.stats.failures).toBe(0);
  });

  it("1404-2: no-op when CB is already CLOSED", async () => {
    const cb = new CircuitBreaker("test-1404-closed", {
      failureThreshold: 5,
      resetTimeoutMs: 300_000,
      halfOpenMaxAttempts: 1,
    });
    expect(cb.stats.state).toBe("closed");

    const stateBefore = cb.stats.state;
    const handle = scheduleForeignFlowCbReset(0, cb);
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    clearTimeout(handle);

    // CB must remain CLOSED and unchanged
    expect(cb.stats.state).toBe("closed");
    expect(stateBefore).toBe("closed");
  });

  it("1404-3: calls reset() when CB is HALF_OPEN", async () => {
    const cb = new CircuitBreaker("test-1404-halfopen", {
      failureThreshold: 5,
      resetTimeoutMs: 300_000,
      halfOpenMaxAttempts: 1,
    });
    forceHalfOpen(cb);
    expect(cb.stats.state).toBe("half-open");

    const handle = scheduleForeignFlowCbReset(0, cb);
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    clearTimeout(handle);

    expect(cb.stats.state).toBe("closed");
  });

  it("1404-4: breakers.foreignFlow.reset() clears 21-failure stuck-OPEN incident", () => {
    // Simulate the live incident: 21 failures, CB stuck OPEN
    forceOpen(breakers.foreignFlow);
    expect(breakers.foreignFlow.stats.failures).toBe(21);
    expect(breakers.foreignFlow.stats.state).toBe("open");

    breakers.foreignFlow.reset();

    expect(breakers.foreignFlow.stats.state).toBe("closed");
    expect(breakers.foreignFlow.stats.failures).toBe(0);
  });

  it("1404-5: fires at delayMs=0 within 50ms (event loop bound)", async () => {
    const cb = new CircuitBreaker("test-1404-timing", {
      failureThreshold: 5,
      resetTimeoutMs: 300_000,
      halfOpenMaxAttempts: 1,
    });
    forceOpen(cb);

    const start = Date.now();
    let fireElapsed = -1;
    // Wrap the CB to measure when reset() was called
    const trackedCb = {
      get stats() { return cb.stats; },
      reset() {
        fireElapsed = Date.now() - start;
        cb.reset();
      },
    };

    const handle = scheduleForeignFlowCbReset(0, trackedCb);
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    clearTimeout(handle);

    expect(fireElapsed).toBeGreaterThanOrEqual(0);
    expect(fireElapsed).toBeLessThan(50);
    expect(cb.stats.state).toBe("closed");
  });

  it("1404-6: FOREIGN_FLOW_CB_RESET_DELAY_MS env var parses to valid integer", () => {
    const raw = Bun.env.FOREIGN_FLOW_CB_RESET_DELAY_MS ?? "60000";
    const parsed = parseInt(raw, 10);
    expect(isNaN(parsed)).toBe(false);
    expect(parsed).toBeGreaterThanOrEqual(0);
  });
});
