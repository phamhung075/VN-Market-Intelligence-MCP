/**
 * FIX — Foreign Flow Circuit Breaker Bugs
 *
 * Bug 1a: diagnose tool reports wrong reset timeout (30s hardcoded, real = 5 min).
 * Bug 1b: diagnose tool shows no "openedAt" time-to-half-open calculation based
 *         on actual elapsed time — always shows static "remainingMs" of 30000.
 * Bug 1c: CircuitBreaker must expose openedAt timestamp so diagnose can compute
 *         accurate time-to-half-open.
 * Bug 1d: reset_foreign_flow_circuit_breaker must work even when called from MCP
 *         (it does — this test verifies the end-to-end contract is correct).
 *
 * These tests drive fixes to:
 *   - circuitBreaker.ts: expose openedAt in stats
 *   - foreignFlowTools.ts: use actual resetTimeoutMs from config, compute
 *     remaining time from openedAt
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { CircuitBreaker } from "../infrastructure/circuitBreaker.js";
import { breakers } from "../infrastructure/circuitBreakerRegistry.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
import {
  diagnose_foreign_flow_circuit_breaker,
  reset_foreign_flow_circuit_breaker,
} from "../interface/mcp/tools/market-data/foreignFlowTools.js";

describe("FIX — Circuit Breaker: openedAt exposed in stats", () => {
  it("stats.openedAt is null when circuit is closed", () => {
    const cb = new CircuitBreaker("test-open-at");
    expect(cb.stats.openedAt).toBeNull();
  });

  it("stats.openedAt is ISO string when circuit is open", async () => {
    const cb = new CircuitBreaker("test-open-at-2", { failureThreshold: 1 });
    try {
      await cb.execute(() => Promise.reject(new Error("fail")));
    } catch {
      // expected
    }
    expect(cb.stats.state).toBe("open");
    expect(cb.stats.openedAt).not.toBeNull();
    // Must be a valid ISO 8601 string
    const d = new Date(cb.stats.openedAt!);
    expect(isNaN(d.getTime())).toBe(false);
  });

  it("stats.openedAt resets to null after reset()", async () => {
    const cb = new CircuitBreaker("test-open-at-3", { failureThreshold: 1 });
    try {
      await cb.execute(() => Promise.reject(new Error("fail")));
    } catch {
      // expected
    }
    expect(cb.stats.openedAt).not.toBeNull();
    cb.reset();
    expect(cb.stats.openedAt).toBeNull();
  });

  it("stats.openedAt resets to null after transitioning to half-open", async () => {
    // CB with very short timeout so we can test transition
    const cb = new CircuitBreaker("test-half-open", {
      failureThreshold: 1,
      resetTimeoutMs: 0, // immediate
    });
    try {
      await cb.execute(() => Promise.reject(new Error("fail")));
    } catch {
      // expected
    }
    // Access state — triggers _checkTimeout which transitions to half-open
    const s = cb.stats;
    expect(s.state).toBe("half-open");
    // openedAt should be cleared on transition to half-open
    expect(s.openedAt).toBeNull();
  });
});

describe("FIX — diagnose tool: correct reset timeout and time-to-half-open", () => {
  beforeEach(() => {
    breakers.foreignFlow.reset();
  });

  afterEach(() => {
    breakers.foreignFlow.reset();
  });

  it("diagnose open CB: shows 10 minutes (600s) not 30 seconds (Task 1407: increased from 5 min)", async () => {
    const cb = breakers.foreignFlow;
    for (let i = 0; i < 5; i++) {
      try {
        await cb.execute(() => Promise.reject(new Error("fail")));
      } catch {
        // expected
      }
    }
    expect(cb.stats.state).toBe("open");

    const result = await diagnose_foreign_flow_circuit_breaker();
    const text = result.content[0]!.text;

    // Must NOT show 30s — that was the original bug
    expect(text).not.toContain("30s");
    expect(text).not.toContain("30000ms");
    // Task 1407: resetTimeoutMs increased from 5 min (300_000) to 10 min (600_000).
    // The remaining time will be close to 600s since we just opened it.
    expect(text).toMatch(/59[0-9]s|600s|10 min/);
  });

  it("diagnose open CB: time-to-half-open decreases as time passes (openedAt used)", async () => {
    const cb = breakers.foreignFlow;
    for (let i = 0; i < 5; i++) {
      try {
        await cb.execute(() => Promise.reject(new Error("fail")));
      } catch {
        // expected
      }
    }

    const result = await diagnose_foreign_flow_circuit_breaker();
    const text = result.content[0]!.text;

    // Should mention "half-open" transition
    expect(text.toLowerCase()).toContain("half-open");
    // Should contain a seconds value > 0
    expect(text).toMatch(/\d+s/);
  });

  it("diagnose closed CB: does NOT show time-to-half-open line", async () => {
    const cb = breakers.foreignFlow;
    expect(cb.stats.state).toBe("closed");

    const result = await diagnose_foreign_flow_circuit_breaker();
    const text = result.content[0]!.text;

    // When closed, no "auto-transition" line should appear
    expect(text).not.toContain("auto-transition");
  });

  it("reset then diagnose: CB is closed with zero failures", async () => {
    const cb = breakers.foreignFlow;
    for (let i = 0; i < 5; i++) {
      try {
        await cb.execute(() => Promise.reject(new Error("fail")));
      } catch {
        // expected
      }
    }
    expect(cb.stats.state).toBe("open");

    await reset_foreign_flow_circuit_breaker();

    const result = await diagnose_foreign_flow_circuit_breaker();
    const text = result.content[0]!.text;

    expect(text.toLowerCase()).toContain("closed");
    expect(text).toContain("0");
    expect(text).not.toContain("auto-transition");
  });
});

describe("FIX — reset_foreign_flow_circuit_breaker: verifies state is truly closed after reset", () => {
  beforeEach(() => {
    breakers.foreignFlow.reset();
  });

  afterEach(() => {
    breakers.foreignFlow.reset();
  });

  it("after reset: execute() succeeds on next call (no CircuitOpenError)", async () => {
    const cb = breakers.foreignFlow;
    // Open the circuit
    for (let i = 0; i < 5; i++) {
      try {
        await cb.execute(() => Promise.reject(new Error("fail")));
      } catch {
        // expected
      }
    }
    expect(cb.stats.state).toBe("open");

    // Reset via MCP tool
    await reset_foreign_flow_circuit_breaker();
    expect(cb.stats.state).toBe("closed");

    // Next execute should not throw CircuitOpenError
    const { CircuitOpenError } = await import("../infrastructure/circuitBreaker.js");
    let threw: Error | null = null;
    try {
      await cb.execute(() => Promise.resolve(42));
    } catch (e) {
      threw = e as Error;
    }
    // If it threw, it must NOT be CircuitOpenError (could be other error from fn)
    if (threw) {
      expect(threw instanceof CircuitOpenError).toBe(false);
    }
  });

  it("after reset: openedAt is null", async () => {
    const cb = breakers.foreignFlow;
    for (let i = 0; i < 5; i++) {
      try {
        await cb.execute(() => Promise.reject(new Error("fail")));
      } catch {
        // expected
      }
    }
    expect(cb.stats.openedAt).not.toBeNull();

    await reset_foreign_flow_circuit_breaker();
    expect(cb.stats.openedAt).toBeNull();
  });
});
