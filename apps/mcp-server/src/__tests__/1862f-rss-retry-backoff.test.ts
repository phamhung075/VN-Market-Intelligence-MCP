/**
 * Task 1862f — FIX-HIGH: Reuters/TE RSS errors regression
 *
 * Root cause: default 60s CB reset causes rapid OPEN → HALF_OPEN → probe fail
 * → re-OPEN thrash. Each re-open cycle logs another error. Over 3 cron cycles
 * this produces 3.2x error growth (13 → 42).
 *
 * Fix: exponential backoff on the CircuitBreaker — each re-open from HALF_OPEN
 * multiplies the next resetTimeoutMs by `backoffMultiplier` (capped at
 * `maxResetTimeoutMs`). Reuters and TradingEconomics breakers configured with
 * 15 min base + backoff × 2, capped at 2 hours.
 *
 * Acceptance criteria:
 *   AC-1  backoffMultiplier config is accepted by CircuitBreaker constructor
 *   AC-2  First open (from CLOSED) uses base resetTimeoutMs
 *   AC-3  Re-open from HALF_OPEN doubles resetTimeoutMs (× backoffMultiplier)
 *   AC-4  Repeated re-opens keep doubling up to maxResetTimeoutMs cap
 *   AC-5  Successful close resets backoff state to base resetTimeoutMs
 *   AC-6  reuters breaker has resetTimeoutMs >= 900_000 (15 min) in registry
 *   AC-7  tradingEconomics breaker has resetTimeoutMs >= 900_000 in registry
 *   AC-8  stats.resetTimeoutMs reflects current (possibly backed-off) timeout
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { CircuitBreaker, CircuitOpenError } from "../infrastructure/circuitBreaker.js";
import { breakers, resetAllBreakers } from "../infrastructure/circuitBreakerRegistry.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function failN(breaker: CircuitBreaker, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    try {
      await breaker.execute(async () => { throw new Error("test error"); });
    } catch {
      // expected
    }
  }
}

/** Force CB from OPEN → HALF_OPEN by manipulating its internal clock via
 *  the _forceHalfOpen test helper (injected via nowMs override). */
function forceOpenedAt(breaker: CircuitBreaker, msAgo: number): void {
  // Use the test-only setOpenedAt injection
  (breaker as unknown as { _openedAt: Date | null })._openedAt =
    new Date(Date.now() - msAgo);
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-1: backoffMultiplier config accepted by constructor
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-1: backoffMultiplier config accepted by constructor", () => {
  it("creates circuit breaker with backoffMultiplier and maxResetTimeoutMs", () => {
    const cb = new CircuitBreaker("test-backoff", {
      failureThreshold: 3,
      resetTimeoutMs: 10_000,
      backoffMultiplier: 2,
      maxResetTimeoutMs: 60_000,
    });
    expect(cb.stats.resetTimeoutMs).toBe(10_000);
  });

  it("defaults: no backoffMultiplier means fixed resetTimeoutMs", () => {
    const cb = new CircuitBreaker("test-no-backoff", {
      failureThreshold: 3,
      resetTimeoutMs: 10_000,
    });
    expect(cb.stats.resetTimeoutMs).toBe(10_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2: First open (from CLOSED) uses base resetTimeoutMs
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-2: first CLOSED→OPEN uses base resetTimeoutMs", () => {
  it("stats.resetTimeoutMs unchanged after first open", async () => {
    const cb = new CircuitBreaker("test-ac2", {
      failureThreshold: 3,
      resetTimeoutMs: 10_000,
      backoffMultiplier: 2,
      maxResetTimeoutMs: 60_000,
    });
    await failN(cb, 3);
    expect(cb.stats.state).toBe("open");
    expect(cb.stats.resetTimeoutMs).toBe(10_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3: Re-open from HALF_OPEN doubles resetTimeoutMs
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-3: re-open from HALF_OPEN doubles resetTimeoutMs", () => {
  it("resetTimeoutMs doubles after HALF_OPEN → OPEN re-open", async () => {
    const cb = new CircuitBreaker("test-ac3", {
      failureThreshold: 3,
      resetTimeoutMs: 10_000,
      backoffMultiplier: 2,
      maxResetTimeoutMs: 120_000,
    });

    // Step 1: trip to OPEN
    await failN(cb, 3);
    expect(cb.stats.state).toBe("open");
    expect(cb.stats.resetTimeoutMs).toBe(10_000);

    // Step 2: manually expire the timeout → HALF_OPEN
    forceOpenedAt(cb, 11_000); // 11s ago > 10s timeout
    expect(cb.stats.state).toBe("half-open"); // triggers _checkTimeout

    // Step 3: fail in HALF_OPEN → re-opens with doubled timeout
    try {
      await cb.execute(async () => { throw new Error("probe fail"); });
    } catch { /* expected */ }

    expect(cb.stats.state).toBe("open");
    expect(cb.stats.resetTimeoutMs).toBe(20_000); // 10_000 × 2
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4: Repeated re-opens keep doubling up to maxResetTimeoutMs
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-4: backoff caps at maxResetTimeoutMs", () => {
  it("after 4 re-opens, resetTimeoutMs is capped at maxResetTimeoutMs", async () => {
    const cb = new CircuitBreaker("test-ac4", {
      failureThreshold: 3,
      resetTimeoutMs: 10_000,
      backoffMultiplier: 2,
      maxResetTimeoutMs: 60_000,
    });

    // First open
    await failN(cb, 3);

    // Simulate 4 half-open → re-open cycles
    // Expected progression: 10_000 → 20_000 → 40_000 → 60_000 (capped)
    const expectedTimeouts = [20_000, 40_000, 60_000, 60_000];
    for (const expected of expectedTimeouts) {
      // Force timeout expiry
      forceOpenedAt(cb, cb.stats.resetTimeoutMs + 1_000);
      expect(cb.stats.state).toBe("half-open");
      // Fail the probe
      try {
        await cb.execute(async () => { throw new Error("probe fail"); });
      } catch { /* expected */ }
      expect(cb.stats.state).toBe("open");
      expect(cb.stats.resetTimeoutMs).toBe(expected);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-5: Successful close resets backoff to base resetTimeoutMs
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-5: successful close resets backoff state", () => {
  it("after HALF_OPEN→CLOSED, resetTimeoutMs returns to base value", async () => {
    const cb = new CircuitBreaker("test-ac5", {
      failureThreshold: 3,
      resetTimeoutMs: 10_000,
      backoffMultiplier: 2,
      maxResetTimeoutMs: 60_000,
      halfOpenMaxAttempts: 1,
    });

    // Trip → backoff to 20_000
    await failN(cb, 3);
    forceOpenedAt(cb, 11_000);
    expect(cb.stats.state).toBe("half-open");
    try {
      await cb.execute(async () => { throw new Error("probe fail"); });
    } catch { /* expected */ }
    expect(cb.stats.resetTimeoutMs).toBe(20_000);

    // Now recover: open → half-open → success → closed
    forceOpenedAt(cb, 21_000); // 21s > 20_000ms
    expect(cb.stats.state).toBe("half-open");
    await cb.execute(async () => "ok"); // success probe
    expect(cb.stats.state).toBe("closed");

    // resetTimeoutMs should be back to base
    expect(cb.stats.resetTimeoutMs).toBe(10_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-6 & AC-7: Registry breakers have long reset timeouts
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-6: reuters breaker has resetTimeoutMs >= 900_000 (15 min)", () => {
  beforeEach(() => resetAllBreakers());

  it("breakers.reuters.stats.resetTimeoutMs >= 900_000", () => {
    expect(breakers.reuters.stats.resetTimeoutMs).toBeGreaterThanOrEqual(900_000);
  });
});

describe("AC-7: tradingEconomics breaker has resetTimeoutMs >= 900_000 (15 min)", () => {
  beforeEach(() => resetAllBreakers());

  it("breakers.tradingEconomics.stats.resetTimeoutMs >= 900_000", () => {
    expect(breakers.tradingEconomics.stats.resetTimeoutMs).toBeGreaterThanOrEqual(900_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-8: stats.resetTimeoutMs reflects current backed-off timeout
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-8: stats.resetTimeoutMs reflects current (backed-off) timeout", () => {
  it("stats shows doubled timeout after first HALF_OPEN re-open", async () => {
    const cb = new CircuitBreaker("test-ac8", {
      failureThreshold: 2,
      resetTimeoutMs: 5_000,
      backoffMultiplier: 3,
      maxResetTimeoutMs: 100_000,
      halfOpenMaxAttempts: 1,
    });

    await failN(cb, 2);
    expect(cb.stats.resetTimeoutMs).toBe(5_000);

    forceOpenedAt(cb, 6_000);
    try {
      await cb.execute(async () => { throw new Error("fail"); });
    } catch { /* expected */ }

    // 5_000 × 3 = 15_000
    expect(cb.stats.resetTimeoutMs).toBe(15_000);
    expect(cb.stats.state).toBe("open");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Regression: default (no backoffMultiplier) behavior unchanged
// ─────────────────────────────────────────────────────────────────────────────
describe("Regression: no backoffMultiplier — fixed resetTimeoutMs", () => {
  it("circuit without backoffMultiplier always uses the same resetTimeoutMs", async () => {
    const cb = new CircuitBreaker("test-regression", {
      failureThreshold: 2,
      resetTimeoutMs: 5_000,
      halfOpenMaxAttempts: 1,
    });

    await failN(cb, 2);
    forceOpenedAt(cb, 6_000);
    try {
      await cb.execute(async () => { throw new Error("fail"); });
    } catch { /* expected */ }

    // No backoff — timeout stays at 5_000
    expect(cb.stats.resetTimeoutMs).toBe(5_000);
  });
});
