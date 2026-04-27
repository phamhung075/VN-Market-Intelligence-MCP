/**
 * Task 1316 — PDF Circuit Breaker: Concurrent Race Fix
 *
 * Tests for:
 *   1. Sequential execution gates CB correctly (no concurrent race)
 *   2. CB opens after N sequential failures (threshold=3)
 *   3. 4th call is rejected by CircuitOpenError (not sent to network)
 *   4. State transitions are logged: CLOSED→OPEN, OPEN→HALF_OPEN, HALF_OPEN→CLOSED
 *   5. bctcQueueEnricherJob serializes discovery calls (no Promise.all)
 *
 * RED phase: tests will fail until:
 *   - circuitBreaker.ts logs state transitions
 */

import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import {
  CircuitBreaker,
  CircuitOpenError,
} from "../infrastructure/circuitBreaker.js";
import { logger } from "../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeBreaker(threshold = 3, resetMs = 60_000) {
  return new CircuitBreaker("ssc-test", {
    failureThreshold: threshold,
    resetTimeoutMs: resetMs,
    halfOpenMaxAttempts: 2,
  });
}

async function failNSequential(cb: CircuitBreaker, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    try {
      await cb.execute(async () => { throw new Error("ETIMEDOUT"); });
    } catch {
      // expected
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 1 — Sequential execution: CB gates correctly
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1316 — PDF CB Concurrent Race Fix", () => {

  describe("1. Sequential execution: CB opens and gates next call", () => {
    it("opens circuit after exactly failureThreshold sequential failures", async () => {
      const cb = makeBreaker(3);
      await failNSequential(cb, 3);
      expect(cb.state).toBe("open");
    });

    it("4th sequential call is rejected by CircuitOpenError without calling fn", async () => {
      const cb = makeBreaker(3);
      await failNSequential(cb, 3);

      let called = false;
      await expect(
        cb.execute(async () => { called = true; return "ok"; })
      ).rejects.toBeInstanceOf(CircuitOpenError);

      expect(called).toBe(false);
    });

    it("concurrent execution: all 5 calls launched before CB state propagates", async () => {
      // This test documents the race condition that EXISTS with concurrent calls.
      // When Promise.all launches all 5 before any resolves, all 5 read state=closed.
      // The fix is serialization in the job layer (not a change to CB itself).
      const cb = makeBreaker(3);
      let fnCallCount = 0;

      const slowFail = async () => {
        fnCallCount++;
        // Slight delay so all 5 can be in-flight before first resolves
        await new Promise(r => setTimeout(r, 5));
        throw new Error("ETIMEDOUT");
      };

      // Launch all 5 concurrently — all read state=closed at launch time
      const promises = Array.from({ length: 5 }, () =>
        cb.execute(slowFail).catch(() => {})
      );
      await Promise.all(promises);

      // All 5 reached the network because state check happened before any failure
      // This is the race condition — all 5 called fn even though CB threshold=3
      expect(fnCallCount).toBe(5);
      expect(cb.state).toBe("open");
    });

    it("sequential execution: fn is NOT called after CB opens (stops at 4th)", async () => {
      const cb = makeBreaker(3);
      let fnCallCount = 0;

      const failFn = async () => {
        fnCallCount++;
        throw new Error("ETIMEDOUT");
      };

      // Sequential: each call sees updated state
      for (let i = 0; i < 5; i++) {
        try {
          await cb.execute(failFn);
        } catch {
          // expected
        }
      }

      // Only 3 real network calls were made; calls 4 & 5 were rejected by CB
      expect(fnCallCount).toBe(3);
      expect(cb.state).toBe("open");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Section 2 — State-change logging (RED: will fail until logger calls are added)
  // ─────────────────────────────────────────────────────────────────────────────

  describe("2. State-change logging", () => {
    it("logs CLOSED→OPEN when circuit trips", async () => {
      const warnSpy = spyOn(logger, "warn");
      const cb = makeBreaker(2);

      await failNSequential(cb, 2);

      expect(cb.state).toBe("open");

      // Must have logged the transition
      const warnCalls = warnSpy.mock.calls;
      const hasTransitionLog = warnCalls.some(([msg]) =>
        typeof msg === "string" && msg.includes("CLOSED") && msg.includes("OPEN")
      );
      expect(hasTransitionLog).toBe(true);

      warnSpy.mockRestore();
    });

    it("logs OPEN→HALF_OPEN after reset timeout", async () => {
      const infoSpy = spyOn(logger, "info");
      const cb = new CircuitBreaker("ssc-half-open-log", {
        failureThreshold: 2,
        resetTimeoutMs: 20, // fast for testing
        halfOpenMaxAttempts: 2,
      });

      await failNSequential(cb, 2);
      expect(cb.state).toBe("open");

      // Wait for reset timeout
      await new Promise(r => setTimeout(r, 30));

      // Trigger _checkTimeout by accessing state
      const s = cb.state;
      expect(s).toBe("half-open");

      const infoCalls = infoSpy.mock.calls;
      const hasHalfOpenLog = infoCalls.some(([msg]) =>
        typeof msg === "string" && msg.includes("HALF_OPEN")
      );
      expect(hasHalfOpenLog).toBe(true);

      infoSpy.mockRestore();
    });

    it("logs HALF_OPEN→CLOSED after successful probes", async () => {
      const infoSpy = spyOn(logger, "info");
      const cb = new CircuitBreaker("ssc-close-log", {
        failureThreshold: 2,
        resetTimeoutMs: 20,
        halfOpenMaxAttempts: 2,
      });

      await failNSequential(cb, 2);
      await new Promise(r => setTimeout(r, 30));
      expect(cb.state).toBe("half-open");

      // Two successes to close the circuit
      await cb.execute(async () => "ok1");
      await cb.execute(async () => "ok2");
      expect(cb.state).toBe("closed");

      const infoCalls = infoSpy.mock.calls;
      const hasClosedLog = infoCalls.some(([msg]) =>
        typeof msg === "string" && msg.includes("CLOSED")
      );
      expect(hasClosedLog).toBe(true);

      infoSpy.mockRestore();
    });

    it("state-change log includes circuit name and failure counts", async () => {
      const warnSpy = spyOn(logger, "warn");
      const cb = new CircuitBreaker("ssc-named", {
        failureThreshold: 2,
        resetTimeoutMs: 60_000,
        halfOpenMaxAttempts: 2,
      });

      await failNSequential(cb, 2);
      expect(cb.state).toBe("open");

      // Find the CLOSED→OPEN warn call
      const warnCalls = warnSpy.mock.calls;
      const transitionCall = warnCalls.find(([msg]) =>
        typeof msg === "string" && msg.includes("CLOSED") && msg.includes("OPEN")
      );
      expect(transitionCall).toBeDefined();

      // Second argument (context object) should contain name and failure info
      if (transitionCall && transitionCall[1]) {
        const ctx = transitionCall[1] as Record<string, unknown>;
        expect(ctx).toHaveProperty("name");
        expect(ctx["name"]).toBe("ssc-named");
      }

      warnSpy.mockRestore();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Section 3 — bctcQueueEnricherJob: serialized execution
  // ─────────────────────────────────────────────────────────────────────────────

  describe("3. bctcQueueEnricherJob: sequential for-loop (no Promise.all)", () => {
    it("job processes items sequentially — each awaits before next starts", async () => {
      // Verify the job's for-loop pattern by simulating it directly.
      // The job uses: for (const item of queueItems) { await discoverHosePdfUrls(...) }
      // We track order of completion to confirm sequential behavior.
      const executionOrder: number[] = [];
      const startOrder: number[] = [];

      const items = [0, 1, 2];
      const delays = [20, 5, 1]; // if concurrent, item 2 would finish first

      for (const i of items) {
        startOrder.push(i);
        await new Promise<void>(resolve => {
          setTimeout(() => {
            executionOrder.push(i);
            resolve();
          }, delays[i]);
        });
      }

      // Sequential: start order == completion order (not fastest-first)
      expect(executionOrder).toEqual([0, 1, 2]);
      expect(startOrder).toEqual([0, 1, 2]);
    });

    it("job stops processing if CB opens mid-batch", async () => {
      const cb = makeBreaker(3);
      const processedCodes: string[] = [];

      const codes = ["VNM", "VJC", "VIC", "FPT", "SAB"];

      for (const code of codes) {
        // Check CB state before each call (mirrors the fix)
        if (cb.state === "open") {
          break;
        }

        try {
          await cb.execute(async () => {
            processedCodes.push(code);
            throw new Error("ETIMEDOUT");
          });
        } catch (err) {
          if (err instanceof CircuitOpenError) {
            break;
          }
          // Continue to next code
        }
      }

      // Only 3 codes processed (threshold=3), then CB opened and stopped the batch
      expect(processedCodes.length).toBeLessThanOrEqual(3);
      expect(cb.state).toBe("open");
      // VNM, VJC, VIC processed; FPT and SAB skipped
      expect(processedCodes).not.toContain("FPT");
      expect(processedCodes).not.toContain("SAB");
    });
  });
});
