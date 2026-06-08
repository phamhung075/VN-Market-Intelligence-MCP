/**
 * Task 1283a — RED: Foreign Flow Circuit Breaker Diagnostics Tests
 *
 * TDD RED phase — 8 failing test cases covering:
 * 1. diagnose: CB closed state (no failures)
 * 2. diagnose: CB open state (threshold failures)
 * 3. diagnose: error counts + last failure timestamp
 * 4. diagnose: full stats format validation
 * 5. reset: transition from open to closed
 * 6. reset: idempotent (resetting twice is safe)
 * 7. reset: counter resets to zero
 * 8. reset: confirmation message format
 *
 * These tests establish the contract for the circuit breaker diagnostic tools
 * and will drive the GREEN phase implementation.
 *
 * @module __tests__/1283-foreign-flow-diagnostics
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { breakers } from "../infrastructure/circuitBreakerRegistry.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
import {
  diagnose_foreign_flow_circuit_breaker,
  reset_foreign_flow_circuit_breaker,
} from "../interface/mcp/tools/market-data/foreignFlowTools.js";

describe("Task 1283a — Foreign Flow Circuit Breaker Diagnostics", () => {
  // ─────────────────────────────────────────────────────────────────────────
  // Setup / Teardown
  // ─────────────────────────────────────────────────────────────────────────

  beforeEach(() => {
    // Ensure clean state before each test
    breakers.foreignFlow.reset();
  });

  afterEach(() => {
    // Clean up after each test
    breakers.foreignFlow.reset();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test Suite 1: diagnose_foreign_flow_circuit_breaker()
  // ─────────────────────────────────────────────────────────────────────────

  it("diagnose: CB closed state (no failures)", async () => {
    // GIVEN: circuit breaker is in clean/closed state
    expect(breakers.foreignFlow.stats.state).toBe("closed");
    expect(breakers.foreignFlow.stats.failures).toBe(0);

    // WHEN: we diagnose the circuit breaker
    const result = await diagnose_foreign_flow_circuit_breaker();

    // THEN: response should indicate closed state with zero failures
    expect(result).toHaveProperty("content");
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content.length).toBeGreaterThan(0);
    const firstContent = result.content[0];
    expect(firstContent).toBeDefined();
    if (!firstContent) return; // Guard for TypeScript
    expect(firstContent).toHaveProperty("type", "text");
    expect(firstContent).toHaveProperty("text");

    const text = firstContent.text;
    expect(text).toContain("Status");
    expect(text.toLowerCase()).toContain("closed");
    expect(text).toContain("0");
  });

  it("diagnose: CB open state (threshold failures)", async () => {
    // GIVEN: we trigger 5 consecutive failures to open the circuit
    const cb = breakers.foreignFlow;
    for (let i = 0; i < 5; i++) {
      try {
        await cb.execute(() => Promise.reject(new Error("simulated failure")));
      } catch {
        // Expected to fail
      }
    }
    expect(cb.stats.state).toBe("open");
    expect(cb.stats.failures).toBeGreaterThanOrEqual(5);

    // WHEN: we diagnose the open circuit
    const result = await diagnose_foreign_flow_circuit_breaker();

    // THEN: response should indicate open state with failure count
    expect(result).toHaveProperty("content");
    expect(Array.isArray(result.content)).toBe(true);
    const firstContent = result.content[0];
    expect(firstContent).toBeDefined();
    if (!firstContent) return; // Guard for TypeScript
    expect(firstContent).toHaveProperty("type", "text");

    const text = firstContent.text;
    expect(text).toContain("Status");
    expect(text.toLowerCase()).toContain("open");
    expect(text).toContain("5");
  });

  it("diagnose: includes lastFailure timestamp in diagnostics", async () => {
    // GIVEN: we trigger at least one failure to record timestamp
    const cb = breakers.foreignFlow;
    try {
      await cb.execute(() => Promise.reject(new Error("test failure")));
    } catch {
      // Expected to fail
    }
    expect(cb.stats.lastFailure).not.toBeNull();

    // WHEN: we diagnose the circuit
    const result = await diagnose_foreign_flow_circuit_breaker();

    // THEN: response should contain lastFailure timestamp (ISO format or "never failed" message)
    expect(result).toHaveProperty("content");
    const firstContent = result.content[0];
    expect(firstContent).toBeDefined();
    if (!firstContent) return; // Guard for TypeScript
    const text = firstContent.text;
    expect(text).toContain("Last failure");
    // Either contains ISO timestamp (has T and Z, or at least a date pattern)
    // Or explicitly states "never failed"
    const hasTimestamp =
      text.includes("T") ||
      /\d{4}-\d{2}-\d{2}/.test(text) ||
      text.toLowerCase().includes("never");
    expect(hasTimestamp).toBe(true);
  });

  it("diagnose: returns formatted diagnostic text block with all stats", async () => {
    // GIVEN: circuit breaker in a known state
    const cb = breakers.foreignFlow;

    // Trigger some failures to make the state interesting
    for (let i = 0; i < 3; i++) {
      try {
        await cb.execute(() => Promise.reject(new Error("test")));
      } catch {
        // Expected
      }
    }

    // WHEN: we diagnose
    const result = await diagnose_foreign_flow_circuit_breaker();

    // THEN: response contains all diagnostic fields in readable format
    expect(result).toHaveProperty("content");
    const firstContent = result.content[0];
    expect(firstContent).toBeDefined();
    if (!firstContent) return; // Guard for TypeScript
    const text = firstContent.text;

    // Must include all stat fields
    expect(text.toLowerCase()).toContain("status");
    expect(text.toLowerCase()).toContain("failures");
    expect(text.toLowerCase()).toContain("successes");
    expect(text.toLowerCase()).toContain("last failure");
    const hasStateIndicator =
      text.toLowerCase().includes("closed") ||
      text.toLowerCase().includes("open") ||
      text.toLowerCase().includes("half-open");
    expect(hasStateIndicator).toBe(true);

    // Should be human-readable (not just raw JSON)
    expect(text.length).toBeGreaterThan(20);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test Suite 2: reset_foreign_flow_circuit_breaker()
  // ─────────────────────────────────────────────────────────────────────────

  it("reset: transitions circuit from open to closed", async () => {
    // GIVEN: circuit is open due to failures
    const cb = breakers.foreignFlow;
    for (let i = 0; i < 5; i++) {
      try {
        await cb.execute(() => Promise.reject(new Error("fail")));
      } catch {
        // Expected
      }
    }
    expect(cb.stats.state).toBe("open");

    // WHEN: we call reset
    const result = await reset_foreign_flow_circuit_breaker();

    // THEN: circuit should transition to closed
    expect(cb.stats.state).toBe("closed");
    expect(result).toHaveProperty("content");
    const firstContent = result.content[0];
    expect(firstContent).toBeDefined();
    if (!firstContent) return; // Guard for TypeScript
    expect(firstContent).toHaveProperty("type", "text");
  });

  it("reset: returns confirmation message after reset", async () => {
    // GIVEN: circuit is open
    const cb = breakers.foreignFlow;
    for (let i = 0; i < 5; i++) {
      try {
        await cb.execute(() => Promise.reject(new Error("fail")));
      } catch {
        // Expected
      }
    }

    // WHEN: we reset
    const result = await reset_foreign_flow_circuit_breaker();

    // THEN: message should confirm the reset action
    expect(result).toHaveProperty("content");
    const firstContent = result.content[0];
    expect(firstContent).toBeDefined();
    if (!firstContent) return; // Guard for TypeScript
    const text = firstContent.text;
    expect(text.toLowerCase()).toContain("reset");
    expect(text.toLowerCase()).toContain("closed");
  });

  it("reset: idempotent — second reset on already-closed CB is no-op", async () => {
    // GIVEN: circuit is already closed (after manual reset)
    const cb = breakers.foreignFlow;
    cb.reset();
    expect(cb.stats.state).toBe("closed");

    // WHEN: we call reset on already-closed circuit
    const result = await reset_foreign_flow_circuit_breaker();

    // THEN: should still be closed, and message should indicate it was already closed
    expect(cb.stats.state).toBe("closed");
    const firstContent = result.content[0];
    expect(firstContent).toBeDefined();
    if (!firstContent) return; // Guard for TypeScript
    const text = firstContent.text;
    // Should indicate idempotent operation (either "already closed" or similar)
    const idempotentMsg =
      text.toLowerCase().includes("already") ||
      text.toLowerCase().includes("no-op") ||
      text.toLowerCase().includes("already closed");
    expect(idempotentMsg).toBe(true);
  });

  it("reset: resets successes counter to 0 on reset", async () => {
    // GIVEN: we open the circuit and trigger some operations
    const cb = breakers.foreignFlow;
    for (let i = 0; i < 5; i++) {
      try {
        await cb.execute(() => Promise.reject(new Error("fail")));
      } catch {
        // Expected
      }
    }

    // Record stats before reset (should have failure count)
    const beforeReset = cb.stats;
    expect(beforeReset.state).toBe("open");

    // WHEN: we reset the circuit
    await reset_foreign_flow_circuit_breaker();

    // THEN: successes counter must be 0
    const afterReset = cb.stats;
    expect(afterReset.successes).toBe(0);
  });

  it("reset: resets failures counter to 0 on reset", async () => {
    // GIVEN: circuit has accumulated failures
    const cb = breakers.foreignFlow;
    for (let i = 0; i < 5; i++) {
      try {
        await cb.execute(() => Promise.reject(new Error("fail")));
      } catch {
        // Expected
      }
    }
    expect(cb.stats.failures).toBeGreaterThanOrEqual(5);

    // WHEN: we reset
    await reset_foreign_flow_circuit_breaker();

    // THEN: failures counter must be 0
    expect(cb.stats.failures).toBe(0);
  });

  it("reset: confirmation message contains both 'reset' and 'closed' keywords", async () => {
    // GIVEN: circuit is open
    const cb = breakers.foreignFlow;
    for (let i = 0; i < 5; i++) {
      try {
        await cb.execute(() => Promise.reject(new Error("fail")));
      } catch {
        // Expected
      }
    }

    // WHEN: we reset
    const result = await reset_foreign_flow_circuit_breaker();

    // THEN: confirmation message format must contain specific keywords
    expect(result).toHaveProperty("content");
    const firstContent = result.content[0];
    expect(firstContent).toBeDefined();
    if (!firstContent) return; // Guard for TypeScript
    expect(firstContent).toHaveProperty("type", "text");
    const text = firstContent.text;

    expect(text.toLowerCase()).toContain("reset");
    expect(text.toLowerCase()).toContain("closed");
    expect(text.length).toBeGreaterThan(10);
  });
});
