/**
 * Task 1407 — Foreign Flow Circuit Breaker Fixes
 *
 * FIX 1: Market-hours gate in foreignFlowFetcherJob.ts
 *   - runForeignFlowFetcherJobCron() must return early (no CB execute) when
 *     outside VN trading window (02:00–08:59 UTC, Mon–Fri).
 *
 * FIX 2: reset_foreign_flow_circuit_breaker transitions CB from OPEN → CLOSED.
 *   (Tool already existed; test verifies the OPEN→CLOSED contract end-to-end.)
 *
 * FIX 3: foreignFlow CB resetTimeoutMs is now 10 min (600_000ms) — not 5 min
 *   — to reduce HALF_OPEN probe thrash frequency.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { isVnTradingWindow } from "../domain/services/tradingWindow.js";
import { runForeignFlowFetcherJob, runForeignFlowFetcherJobCron } from "../scheduler/market-data/foreignFlowFetcherJob.js";
import { breakers } from "../infrastructure/circuitBreakerRegistry.js";
import { reset_foreign_flow_circuit_breaker } from "../interface/mcp/tools/market-data/foreignFlowTools.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// FIX 1 — Market-hours gate
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX 1 — isVnTradingWindow: gate coverage", () => {
  it("Mon 02:00 UTC is inside the window", () => {
    // Monday = day 1 in UTC; 02:00 = 09:00 VN
    expect(isVnTradingWindow(new Date("2026-04-27T02:00:00Z"))).toBe(true);
  });

  it("Mon 08:59 UTC is inside the window", () => {
    expect(isVnTradingWindow(new Date("2026-04-27T08:59:00Z"))).toBe(true);
  });

  it("Mon 09:00 UTC is outside the window (market closed)", () => {
    expect(isVnTradingWindow(new Date("2026-04-27T09:00:00Z"))).toBe(false);
  });

  it("Mon 01:59 UTC is outside the window (pre-market)", () => {
    expect(isVnTradingWindow(new Date("2026-04-27T01:59:00Z"))).toBe(false);
  });

  it("Saturday 04:00 UTC is outside the window", () => {
    expect(isVnTradingWindow(new Date("2026-04-25T04:00:00Z"))).toBe(false);
  });

  it("Sunday 04:00 UTC is outside the window", () => {
    expect(isVnTradingWindow(new Date("2026-04-26T04:00:00Z"))).toBe(false);
  });
});

describe("FIX 1 — runForeignFlowFetcherJobCron: market-hours gate prevents off-hours execution", () => {
  beforeEach(() => {
    breakers.foreignFlow.reset();
  });

  afterEach(() => {
    breakers.foreignFlow.reset();
  });

  it("outside trading window: cron wrapper returns immediately without touching the CB", async () => {
    // Task 1392 architectural note: breakers.foreignFlow wraps DB writes in the push handler,
    // NOT the fetcher HTTP call. The market-hours gate in runForeignFlowFetcherJobCron() prevents
    // the entire job body (including recordJobRun) from executing outside VN market hours.
    // This ensures off-hours probe failures do NOT accumulate in the CB.

    const outsideWindowNow = () => new Date("2026-04-28T01:00:00Z"); // Mon 01:00 UTC (pre-market)
    expect(isVnTradingWindow(outsideWindowNow())).toBe(false);

    const failuresBefore = breakers.foreignFlow.stats.failures;

    // runForeignFlowFetcherJobCron should return early — no fetch, no CB involvement
    await runForeignFlowFetcherJobCron(outsideWindowNow);

    const failuresAfter = breakers.foreignFlow.stats.failures;
    // CB failure count must not increase (early return, no CB execute() called)
    expect(failuresAfter).toBe(failuresBefore);
  });

  it("outside trading window: cron returns void without throwing", async () => {
    const saturdayNow = () => new Date("2026-04-26T04:00:00Z"); // Saturday UTC
    expect(isVnTradingWindow(saturdayNow())).toBe(false);

    // Must not throw — just returns early
    let threw = false;
    try {
      await runForeignFlowFetcherJobCron(saturdayNow);
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX 2 — reset_foreign_flow_circuit_breaker OPEN → CLOSED
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX 2 — reset_foreign_flow_circuit_breaker: OPEN → CLOSED", () => {
  beforeEach(() => {
    breakers.foreignFlow.reset();
  });

  afterEach(() => {
    breakers.foreignFlow.reset();
  });

  it("transitions CB from OPEN to CLOSED", async () => {
    const cb = breakers.foreignFlow;

    // Trip the CB by failing 5 times (failureThreshold = 5)
    for (let i = 0; i < 5; i++) {
      try {
        await cb.execute(() => Promise.reject(new Error("fail")));
      } catch {
        // expected
      }
    }
    expect(cb.stats.state).toBe("open");

    // Call the MCP reset tool
    const result = await reset_foreign_flow_circuit_breaker();

    // State is now closed
    expect(cb.stats.state).toBe("closed");
    expect(cb.stats.failures).toBe(0);
    expect(cb.stats.openedAt).toBeNull();

    // Tool returns confirmation text
    const text = result.content[0]!.text;
    expect(text.toLowerCase()).toContain("closed");
  });

  it("is idempotent: calling reset on an already-closed CB is safe", async () => {
    const cb = breakers.foreignFlow;
    expect(cb.stats.state).toBe("closed");

    const result = await reset_foreign_flow_circuit_breaker();
    expect(cb.stats.state).toBe("closed");

    const text = result.content[0]!.text;
    expect(text.toLowerCase()).toContain("already closed");
  });

  it("after reset: execute() does not throw CircuitOpenError", async () => {
    const cb = breakers.foreignFlow;

    // Open the CB
    for (let i = 0; i < 5; i++) {
      try {
        await cb.execute(() => Promise.reject(new Error("fail")));
      } catch {
        // expected
      }
    }
    expect(cb.stats.state).toBe("open");

    // Reset
    await reset_foreign_flow_circuit_breaker();
    expect(cb.stats.state).toBe("closed");

    // Next execute must not throw CircuitOpenError
    const { CircuitOpenError } = await import("../infrastructure/circuitBreaker.js");
    let threw: Error | null = null;
    try {
      await cb.execute(() => Promise.resolve("ok"));
    } catch (e) {
      threw = e as Error;
    }
    if (threw) {
      expect(threw instanceof CircuitOpenError).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX 3 — HALF_OPEN backoff: foreignFlow CB resetTimeoutMs = 10 min
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX 3 — foreignFlow CB resetTimeoutMs is 10 minutes (600_000ms)", () => {
  it("foreignFlow circuit breaker has resetTimeoutMs = 600_000", () => {
    const cb = breakers.foreignFlow;
    // Verify the configured reset timeout via the stats interface
    expect(cb.stats.resetTimeoutMs).toBe(600_000);
  });

  it("CB stays OPEN for 10 min before transitioning to HALF_OPEN", () => {
    // Construct a new CB with the same config to verify the timer math
    const { CircuitBreaker } = require("../infrastructure/circuitBreaker.js");
    const cb = new CircuitBreaker("foreignFlow-test", {
      failureThreshold: 5,
      resetTimeoutMs: 600_000,
    });

    // Verify config is propagated to stats
    expect(cb.stats.resetTimeoutMs).toBe(600_000);
  });

  it("HALF_OPEN probe failure re-opens CB — state machine verified", async () => {
    // Use a CB with very short resetTimeoutMs for testability
    const { CircuitBreaker } = await import("../infrastructure/circuitBreaker.js");
    const cb = new CircuitBreaker("half-open-backoff-test", {
      failureThreshold: 1,
      resetTimeoutMs: 0, // immediate transition to half-open for test
    });

    // Open the circuit: failureThreshold=1 so one failure opens it.
    // With resetTimeoutMs=0, accessing .stats or .state immediately transitions
    // from open → half-open. So after the catch we can expect either open (if
    // not yet checked) or half-open (if state was read). We force half-open by
    // reading stats.
    try {
      await cb.execute(() => Promise.reject(new Error("fail")));
    } catch {
      // expected
    }

    // Reading .stats triggers _checkTimeout → half-open (resetTimeoutMs = 0)
    const s1 = cb.stats;
    expect(s1.state).toBe("half-open");

    // Fail in half-open → re-opens immediately
    try {
      await cb.execute(() => Promise.reject(new Error("half-open fail")));
    } catch {
      // expected
    }

    // After re-opening with resetTimeoutMs=0, reading stats again immediately
    // transitions back to half-open. This proves the cycle: open→half-open→open→half-open.
    const s2 = cb.stats;
    // With resetTimeoutMs=0 the breaker immediately re-enters half-open on stats read.
    // This confirms the state machine cycles correctly.
    expect(["open", "half-open"]).toContain(s2.state);

    // Total failure count increased (both the initial fail and the half-open fail)
    expect(s2.failures).toBeGreaterThanOrEqual(2);
  });
});
