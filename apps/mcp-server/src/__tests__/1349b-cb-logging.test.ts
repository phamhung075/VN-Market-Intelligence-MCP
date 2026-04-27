/**
 * Task 1349b — Circuit Breaker State Logging + Metrics
 *
 * Tests that CB transitions are logged via logCircuitBreakerTransition:
 *   - Function is exported and callable
 *   - Log output includes required fields: timestamp, job, state_old, state_new, reason
 *   - All 3 canonical transitions: closed→open, open→half-open, half-open→closed
 *   - JSON format on stdout
 *   - CB class calls logger on each transition (via spy)
 *   - No silent failures: logger always emits regardless of CB error path
 */

import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import {
  logCircuitBreakerTransition,
  type CBTransition,
} from "../infrastructure/observability/circuitBreakerLogger.js";
import { CircuitBreaker } from "../infrastructure/circuitBreaker.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeBreaker(name = "test", opts?: { failureThreshold?: number; resetTimeoutMs?: number }) {
  return new CircuitBreaker(name, {
    failureThreshold: opts?.failureThreshold ?? 3,
    resetTimeoutMs: opts?.resetTimeoutMs ?? 50,
    halfOpenMaxAttempts: 2,
  });
}

async function failN(breaker: CircuitBreaker, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    try {
      await breaker.execute(async () => { throw new Error("boom"); });
    } catch {
      // expected
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// Part 1: logCircuitBreakerTransition unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1349b — logCircuitBreakerTransition", () => {
  it("is exported as a function", () => {
    expect(typeof logCircuitBreakerTransition).toBe("function");
  });

  it("emits JSON with level=INFO and type=CB_TRANSITION", () => {
    const lines: string[] = [];
    const spy = spyOn(console, "log").mockImplementation((line: string) => {
      lines.push(line);
    });

    const transition: CBTransition = {
      timestamp: "2026-04-27T10:00:00.000Z",
      job: "foreignFlow",
      state_old: "closed",
      state_new: "open",
      reason: "error_threshold_exceeded",
      error_count: 5,
      reset_timeout_ms: 300_000,
    };
    logCircuitBreakerTransition(transition);

    spy.mockRestore();
    expect(lines.length).toBeGreaterThanOrEqual(1);
    const parsed = JSON.parse(lines[lines.length - 1]);
    expect(parsed.level).toBe("INFO");
    expect(parsed.type).toBe("CB_TRANSITION");
  });

  it("output includes all required fields: timestamp, job, state_old, state_new, reason", () => {
    const lines: string[] = [];
    const spy = spyOn(console, "log").mockImplementation((line: string) => {
      lines.push(line);
    });

    logCircuitBreakerTransition({
      timestamp: "2026-04-27T10:00:00.000Z",
      job: "pdfDownload",
      state_old: "closed",
      state_new: "open",
      reason: "error_threshold_exceeded",
    });

    spy.mockRestore();
    const parsed = JSON.parse(lines[lines.length - 1]);
    expect(parsed.timestamp).toBe("2026-04-27T10:00:00.000Z");
    expect(parsed.job).toBe("pdfDownload");
    expect(parsed.state_old).toBe("closed");
    expect(parsed.state_new).toBe("open");
    expect(parsed.reason).toBe("error_threshold_exceeded");
  });

  it("closed→open transition is logged correctly", () => {
    const lines: string[] = [];
    const spy = spyOn(console, "log").mockImplementation((line: string) => {
      lines.push(line);
    });

    logCircuitBreakerTransition({
      timestamp: new Date().toISOString(),
      job: "reutersFallback",
      state_old: "closed",
      state_new: "open",
      reason: "error_threshold_exceeded",
      error_count: 5,
      reset_timeout_ms: 300_000,
    });

    spy.mockRestore();
    const parsed = JSON.parse(lines[lines.length - 1]);
    expect(parsed.state_old).toBe("closed");
    expect(parsed.state_new).toBe("open");
    expect(parsed.error_count).toBe(5);
    expect(parsed.reset_timeout_ms).toBe(300_000);
  });

  it("open→half-open transition is logged correctly", () => {
    const lines: string[] = [];
    const spy = spyOn(console, "log").mockImplementation((line: string) => {
      lines.push(line);
    });

    logCircuitBreakerTransition({
      timestamp: new Date().toISOString(),
      job: "foreignFlow",
      state_old: "open",
      state_new: "half-open",
      reason: "reset_timeout_elapsed",
      reset_timeout_ms: 300_000,
    });

    spy.mockRestore();
    const parsed = JSON.parse(lines[lines.length - 1]);
    expect(parsed.state_old).toBe("open");
    expect(parsed.state_new).toBe("half-open");
    expect(parsed.reason).toBe("reset_timeout_elapsed");
  });

  it("half-open→closed transition is logged correctly", () => {
    const lines: string[] = [];
    const spy = spyOn(console, "log").mockImplementation((line: string) => {
      lines.push(line);
    });

    logCircuitBreakerTransition({
      timestamp: new Date().toISOString(),
      job: "foreignFlow",
      state_old: "half-open",
      state_new: "closed",
      reason: "half_open_probes_passed",
    });

    spy.mockRestore();
    const parsed = JSON.parse(lines[lines.length - 1]);
    expect(parsed.state_old).toBe("half-open");
    expect(parsed.state_new).toBe("closed");
    expect(parsed.reason).toBe("half_open_probes_passed");
  });

  it("optional fields (error_count, reset_timeout_ms, metrics) are included when provided", () => {
    const lines: string[] = [];
    const spy = spyOn(console, "log").mockImplementation((line: string) => {
      lines.push(line);
    });

    logCircuitBreakerTransition({
      timestamp: new Date().toISOString(),
      job: "newsapi",
      state_old: "closed",
      state_new: "open",
      reason: "error_threshold_exceeded",
      error_count: 3,
      reset_timeout_ms: 60_000,
      metrics: { consecutiveFailures: 3, totalSuccesses: 10 },
    });

    spy.mockRestore();
    const parsed = JSON.parse(lines[lines.length - 1]);
    expect(parsed.error_count).toBe(3);
    expect(parsed.reset_timeout_ms).toBe(60_000);
    expect(parsed.metrics.consecutiveFailures).toBe(3);
    expect(parsed.metrics.totalSuccesses).toBe(10);
  });

  it("does not throw when called with minimal required fields", () => {
    expect(() => {
      logCircuitBreakerTransition({
        timestamp: new Date().toISOString(),
        job: "cafef",
        state_old: "closed",
        state_new: "open",
        reason: "error_threshold_exceeded",
      });
    }).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Part 2: CircuitBreaker class emits transitions via logger
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1349b — CircuitBreaker emits CB_TRANSITION logs", () => {
  it("closed→open transition emits CB_TRANSITION log when threshold exceeded", async () => {
    const lines: string[] = [];
    const spy = spyOn(console, "log").mockImplementation((line: string) => {
      lines.push(line);
    });

    const cb = makeBreaker("test-open", { failureThreshold: 3 });
    await failN(cb, 3);

    spy.mockRestore();
    const cbLines = lines.filter((l) => {
      try { return JSON.parse(l).type === "CB_TRANSITION"; } catch { return false; }
    });
    expect(cbLines.length).toBeGreaterThanOrEqual(1);
    const transition = JSON.parse(cbLines[0]);
    expect(transition.state_old).toBe("closed");
    expect(transition.state_new).toBe("open");
  });

  it("open→half-open transition emits CB_TRANSITION log after reset timeout", async () => {
    const lines: string[] = [];
    const cb = makeBreaker("test-halfopen", { failureThreshold: 2, resetTimeoutMs: 50 });
    await failN(cb, 2); // opens circuit

    // Wait for reset timeout to elapse
    await sleep(60);

    const spy = spyOn(console, "log").mockImplementation((line: string) => {
      lines.push(line);
    });

    // Access state — triggers _checkTimeout → half-open transition
    const _ = cb.state;

    spy.mockRestore();
    const cbLines = lines.filter((l) => {
      try { return JSON.parse(l).type === "CB_TRANSITION"; } catch { return false; }
    });
    expect(cbLines.length).toBeGreaterThanOrEqual(1);
    const transition = JSON.parse(cbLines[0]);
    expect(transition.state_old).toBe("open");
    expect(transition.state_new).toBe("half-open");
  });

  it("half-open→closed transition emits CB_TRANSITION log after enough successes", async () => {
    const lines: string[] = [];
    const cb = makeBreaker("test-close", { failureThreshold: 2, resetTimeoutMs: 50 });
    await failN(cb, 2); // opens circuit
    await sleep(60);
    const _ = cb.state; // triggers half-open

    const spy = spyOn(console, "log").mockImplementation((line: string) => {
      lines.push(line);
    });

    // 2 successes in half-open → close
    await cb.execute(async () => "ok");
    await cb.execute(async () => "ok");

    spy.mockRestore();
    const cbLines = lines.filter((l) => {
      try { return JSON.parse(l).type === "CB_TRANSITION"; } catch { return false; }
    });
    expect(cbLines.length).toBeGreaterThanOrEqual(1);
    const closedLog = cbLines.find((l) => JSON.parse(l).state_new === "closed");
    expect(closedLog).toBeDefined();
    const parsed = JSON.parse(closedLog!);
    expect(parsed.state_old).toBe("half-open");
    expect(parsed.state_new).toBe("closed");
  });
});
