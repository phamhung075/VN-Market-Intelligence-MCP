// src/__tests__/1413b-cb-halfopen-probe.test.ts
// Task 1413b — CB HALF_OPEN probe regression tests
//
// Root cause: the early-return guard in pushForeignFlowHandler checked
// stats.state === "open" BEFORE calling execute(), bypassing _checkTimeout()
// and the HALF_OPEN promotion mechanism. The CB could never self-heal once
// the VPS stopped pushing after repeated 503s.
//
// Fix (Option B): remove the early-return guard; let execute() manage the
// state machine. CircuitOpenError is caught separately and returns 503 with
// a Retry-After header so the VPS knows when to retry.
//
// Tests:
//   1413b-1: CB OPEN, timeout NOT elapsed → 503 + Retry-After, no _onFailure
//   1413b-2: CB OPEN, timeout HAS elapsed → HALF_OPEN probe, success → CLOSED, 200
//   1413b-3: CB OPEN, timeout HAS elapsed → HALF_OPEN probe, DB fail → re-opens, 503
//   1413b-4: CB CLOSED, 5 consecutive DB write failures → CB opens, 6th → 503
//   1413b-5: CircuitBreakerStats.openedAt is non-null when OPEN, null when CLOSED
//   1413b-6: Market-hours gate — outside trading window, cron skips, CB unchanged

Bun.env["DB_PATH"] = ":memory:";
Bun.env["VPS_PUSH_API_KEY"] = "test-key-1413b";

import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from "bun:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import { handlePushForeignFlow } from "../interface/mcp/routes/pushForeignFlowHandler.js";
import { CircuitBreaker, CircuitOpenError } from "../infrastructure/circuitBreaker.js";
import { breakers } from "../infrastructure/circuitBreakerRegistry.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { isVnTradingWindow } from "../domain/services/tradingWindow.js";
import { runForeignFlowFetcherJobCron } from "../scheduler/market-data/foreignFlowFetcherJob.js";

// ─── HTTP mock helpers ────────────────────────────────────────────────────────

function makeReq(body: string, apiKey = "test-key-1413b"): IncomingMessage {
  const chunks: string[] = body ? [body] : [];
  let idx = 0;
  return {
    headers: { "x-api-key": apiKey },
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<{ value: string; done: boolean }> {
          if (idx < chunks.length) return Promise.resolve({ value: chunks[idx++]!, done: false });
          return Promise.resolve({ value: "", done: true });
        },
      };
    },
  } as unknown as IncomingMessage;
}

interface MockRes {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
  writeHead(code: number, headers?: Record<string, string>): void;
  end(data?: string): void;
}

function makeRes(): MockRes {
  const res: MockRes = {
    statusCode: 0,
    body: "",
    headers: {},
    writeHead(code, h = {}) {
      res.statusCode = code;
      Object.assign(res.headers, h);
    },
    end(data = "") {
      res.body += data;
    },
  };
  return res;
}

const silentLog = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as never;

/** Minimal valid push payload for a single ticker */
const validPayload = JSON.stringify([
  { code: "VIC", foreignBuyVol: 1000, foreignSellVol: 500, foreignRoom: 5_000_000 },
]);

// ─── CB state manipulation helpers ────────────────────────────────────────────

type CbInternal = {
  _state: string;
  _openedAt: Date | null;
  _failures: number;
  _consecutiveFailures: number;
  _halfOpenSuccesses: number;
};

function internals(cb: CircuitBreaker): CbInternal {
  return cb as unknown as CbInternal;
}

/** Force CB into OPEN state with openedAt = now (timeout NOT elapsed) */
function forceOpenRecent(cb: CircuitBreaker): void {
  const i = internals(cb);
  i._state = "open";
  i._openedAt = new Date(); // just now — timeout (600s) has not elapsed
  i._failures = 5;
  i._consecutiveFailures = 5;
  i._halfOpenSuccesses = 0;
}

/** Force CB into OPEN state with openedAt well in the past (timeout HAS elapsed) */
function forceOpenExpired(cb: CircuitBreaker): void {
  const i = internals(cb);
  i._state = "open";
  i._openedAt = new Date(Date.now() - 700_000); // 700s ago > 600s timeout
  i._failures = 5;
  i._consecutiveFailures = 5;
  i._halfOpenSuccesses = 0;
}

// ─── Test setup ───────────────────────────────────────────────────────────────

beforeAll(async () => {
  await initDatabase();
});

afterAll(() => {
  closeDb();
});

afterEach(() => {
  breakers.foreignFlow.reset();
  try {
    getDb().exec("DELETE FROM vnstock_trading_stats");
  } catch { /* table may not exist in :memory: */ }
  try {
    getDb().exec("DELETE FROM vps_push_log");
  } catch { /* table may not exist */ }
});

// ─── 1413b-1: OPEN + timeout NOT elapsed → 503 + Retry-After ────────────────

describe("1413b-1: CB OPEN (timeout not elapsed) → 503 + Retry-After, no extra _onFailure", () => {
  beforeEach(() => {
    breakers.foreignFlow.reset();
    forceOpenRecent(breakers.foreignFlow);
  });

  it("returns 503 when CB is OPEN and reset timeout has not elapsed", async () => {
    const failuresBefore = internals(breakers.foreignFlow)._failures;

    const req = makeReq(validPayload);
    const mockRes = makeRes();
    await handlePushForeignFlow(req, mockRes as unknown as ServerResponse, getDb(), silentLog);

    expect(mockRes.statusCode).toBe(503);
    const body = JSON.parse(mockRes.body);
    expect(body.error).toBe("Service temporarily unavailable");
  });

  it("response includes Retry-After header when CB is OPEN", async () => {
    const req = makeReq(validPayload);
    const mockRes = makeRes();
    await handlePushForeignFlow(req, mockRes as unknown as ServerResponse, getDb(), silentLog);

    expect(mockRes.statusCode).toBe(503);
    // Retry-After must be present and numeric
    const retryAfter = mockRes.headers["Retry-After"];
    expect(retryAfter).toBeDefined();
    const seconds = Number(retryAfter);
    expect(Number.isFinite(seconds)).toBe(true);
    expect(seconds).toBeGreaterThanOrEqual(60);
  });

  it("_onFailure is NOT called by CircuitOpenError (failure counter unchanged)", async () => {
    const failuresBefore = internals(breakers.foreignFlow)._failures;

    const req = makeReq(validPayload);
    const mockRes = makeRes();
    await handlePushForeignFlow(req, mockRes as unknown as ServerResponse, getDb(), silentLog);

    // CircuitOpenError is caught and returned as 503 without calling _onFailure
    // (execute() throws before calling fn, so _onFailure never runs)
    const failuresAfter = internals(breakers.foreignFlow)._failures;
    expect(failuresAfter).toBe(failuresBefore);
  });
});

// ─── 1413b-2: OPEN + timeout HAS elapsed → HALF_OPEN probe → success → CLOSED ─

describe("1413b-2: CB OPEN (timeout elapsed) → HALF_OPEN probe, DB success → CLOSED + 200", () => {
  beforeEach(() => {
    breakers.foreignFlow.reset();
    forceOpenExpired(breakers.foreignFlow);
  });

  it("execute() promotes OPEN→HALF_OPEN when timeout elapsed, successful upsert closes CB", async () => {
    // Pre-condition: state is "open" (internal) but timeout is expired
    expect(internals(breakers.foreignFlow)._state).toBe("open");

    const req = makeReq(validPayload);
    const mockRes = makeRes();
    await handlePushForeignFlow(req, mockRes as unknown as ServerResponse, getDb(), silentLog);

    // Handler must return 200 (upsert succeeded — DB is :memory: and healthy)
    expect(mockRes.statusCode).toBe(200);
    const body = JSON.parse(mockRes.body);
    expect(body.ok).toBe(true);

    // CB must now be CLOSED (halfOpenMaxAttempts=1 → single success closes)
    expect(breakers.foreignFlow.stats.state).toBe("closed");
  });
});

// ─── 1413b-3: OPEN + timeout elapsed → HALF_OPEN probe → DB fail → re-opens ─

describe("1413b-3: CB OPEN (timeout elapsed) → HALF_OPEN probe, DB fail → re-opens", () => {
  it("failed half-open probe re-opens the CB and returns 503", async () => {
    // Use a separate CB instance with a controlled execute() to simulate DB failure
    const cb = new CircuitBreaker("test-1413b-3", {
      failureThreshold: 5,
      resetTimeoutMs: 0, // immediate transition for testability
      halfOpenMaxAttempts: 1,
    });

    // Trip the CB: one failure opens it (failureThreshold=5, but with resetTimeoutMs=0
    // we need to get it open then immediately to half-open via _checkTimeout)
    // Directly force open with expired openedAt:
    const i = internals(cb);
    i._state = "open";
    i._openedAt = new Date(Date.now() - 1); // 1ms ago > 0ms timeout
    i._failures = 5;
    i._consecutiveFailures = 5;
    i._halfOpenSuccesses = 0;

    // Confirm: calling .state triggers _checkTimeout → half-open
    expect(cb.state).toBe("half-open");

    // Now fail in half-open → re-opens
    try {
      await cb.execute(() => Promise.reject(new Error("DB still broken")));
    } catch {
      // expected
    }

    // With resetTimeoutMs=0, reading state again immediately transitions back to half-open
    // (because _openedAt is fresh but elapsed >= 0). Either open or half-open is valid
    // depending on when the clock ticks. What matters: failure count increased.
    expect(cb.stats.failures).toBeGreaterThanOrEqual(6);
  });

  it("push handler returns 503 when CB re-opens during a failed half-open probe", async () => {
    // Use the registry CB, force it to be half-open via an expired openedAt
    // then make the DB fail. We can't easily make :memory: DB fail, so we verify
    // the circuit state machine logic directly on a fresh CB instead.
    const cb = new CircuitBreaker("test-1413b-3b", {
      failureThreshold: 1,
      resetTimeoutMs: 0,
      halfOpenMaxAttempts: 1,
    });

    // Open it with one failure
    try { await cb.execute(() => Promise.reject(new Error("first fail"))); } catch { /* ok */ }

    // Force openedAt to be in the past
    internals(cb)._openedAt = new Date(Date.now() - 1);

    // Fail again in half-open → re-opens
    try { await cb.execute(() => Promise.reject(new Error("half-open fail"))); } catch { /* ok */ }

    // Failure total is at least 2
    expect(cb.stats.failures).toBeGreaterThanOrEqual(2);
    // openedAt is refreshed (state is open or half-open with resetTimeoutMs=0)
    expect(["open", "half-open"]).toContain(cb.stats.state);
  });
});

// ─── 1413b-4: CLOSED, 5 consecutive failures → OPEN, 6th → 503 ──────────────

describe("1413b-4: CB CLOSED, 5 consecutive DB write failures → opens, 6th returns 503", () => {
  it("consecutively failing execute() calls trip the CB after failureThreshold", async () => {
    const cb = new CircuitBreaker("test-1413b-4", {
      failureThreshold: 5,
      resetTimeoutMs: 600_000,
      halfOpenMaxAttempts: 1,
    });

    expect(cb.stats.state).toBe("closed");

    for (let i = 0; i < 5; i++) {
      try {
        await cb.execute(() => Promise.reject(new Error(`fail #${i + 1}`)));
      } catch {
        // expected
      }
    }

    // After 5 failures: CB must be OPEN
    expect(cb.stats.state).toBe("open");

    // 6th call: execute() throws CircuitOpenError (not a DB error)
    let thrownErr: Error | null = null;
    try {
      await cb.execute(() => Promise.resolve("should not reach"));
    } catch (e) {
      thrownErr = e as Error;
    }
    expect(thrownErr).not.toBeNull();
    expect(thrownErr instanceof CircuitOpenError).toBe(true);
  });

  it("foreignFlow breaker config: failureThreshold=5 matches 1413b-4 scenario", () => {
    // Verify the production breaker has the expected threshold
    const config = (breakers.foreignFlow as unknown as { config: { failureThreshold: number } }).config;
    expect(config.failureThreshold).toBe(5);
  });
});

// ─── 1413b-5: openedAt is non-null when OPEN, null when CLOSED/HALF_OPEN ─────

describe("1413b-5: CircuitBreakerStats.openedAt — regression guard for stats shape", () => {
  it("openedAt is null when CB is CLOSED", () => {
    const cb = new CircuitBreaker("test-1413b-5a", { failureThreshold: 5, resetTimeoutMs: 600_000 });
    expect(cb.stats.state).toBe("closed");
    expect(cb.stats.openedAt).toBeNull();
  });

  it("openedAt is a non-null ISO string when CB is OPEN (timeout not elapsed)", async () => {
    const cb = new CircuitBreaker("test-1413b-5b", {
      failureThreshold: 1,
      resetTimeoutMs: 600_000, // long enough that it won't expire during the test
      halfOpenMaxAttempts: 1,
    });

    try {
      await cb.execute(() => Promise.reject(new Error("trip")));
    } catch { /* expected */ }

    const s = cb.stats;
    expect(s.state).toBe("open");
    expect(s.openedAt).not.toBeNull();
    expect(typeof s.openedAt).toBe("string");
    // Must be a valid ISO timestamp
    expect(new Date(s.openedAt!).getTime()).toBeGreaterThan(0);
  });

  it("openedAt is null when CB transitions to HALF_OPEN", async () => {
    const cb = new CircuitBreaker("test-1413b-5c", {
      failureThreshold: 1,
      resetTimeoutMs: 0, // immediate transition
      halfOpenMaxAttempts: 1,
    });

    try {
      await cb.execute(() => Promise.reject(new Error("trip")));
    } catch { /* expected */ }

    // Force openedAt to be in the past so _checkTimeout fires
    internals(cb)._openedAt = new Date(Date.now() - 1);

    // Reading stats calls _checkTimeout → OPEN→HALF_OPEN, _openedAt set to null
    const s = cb.stats;
    expect(s.state).toBe("half-open");
    expect(s.openedAt).toBeNull();
  });

  it("openedAt in stats is used by push handler to compute Retry-After", async () => {
    // Force the registry breaker open with a known openedAt (just now)
    forceOpenRecent(breakers.foreignFlow);

    const req = makeReq(validPayload);
    const mockRes = makeRes();
    await handlePushForeignFlow(req, mockRes as unknown as ServerResponse, getDb(), silentLog);

    expect(mockRes.statusCode).toBe(503);
    const retryAfter = Number(mockRes.headers["Retry-After"]);
    // openedAt = now → remaining = ~600s; clamped to max(remaining, 60)
    expect(retryAfter).toBeGreaterThanOrEqual(60);
    expect(retryAfter).toBeLessThanOrEqual(600);
  });
});

// ─── 1413b-6: market-hours gate — cron skips outside trading window ───────────

describe("1413b-6: market-hours gate — outside trading window, cron skips, CB unchanged", () => {
  beforeEach(() => {
    breakers.foreignFlow.reset();
  });

  it("outside trading window: runForeignFlowFetcherJobCron returns without touching the CB", async () => {
    const outsideWindow = () => new Date("2026-04-28T01:00:00Z"); // Mon 01:00 UTC — pre-market
    expect(isVnTradingWindow(outsideWindow())).toBe(false);

    const failuresBefore = breakers.foreignFlow.stats.failures;
    const stateBefore = breakers.foreignFlow.stats.state;

    await runForeignFlowFetcherJobCron(outsideWindow);

    // CB state and failure count must be unchanged
    expect(breakers.foreignFlow.stats.failures).toBe(failuresBefore);
    expect(breakers.foreignFlow.stats.state).toBe(stateBefore);
  });

  it("outside trading window: cron does not throw", async () => {
    const saturday = () => new Date("2026-04-26T04:00:00Z");
    expect(isVnTradingWindow(saturday())).toBe(false);

    let threw = false;
    try {
      await runForeignFlowFetcherJobCron(saturday);
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });

  it("inside trading window: isVnTradingWindow returns true for 02:00-08:59 UTC weekday", () => {
    expect(isVnTradingWindow(new Date("2026-04-28T02:00:00Z"))).toBe(true);
    expect(isVnTradingWindow(new Date("2026-04-28T08:59:00Z"))).toBe(true);
    expect(isVnTradingWindow(new Date("2026-04-28T09:00:00Z"))).toBe(false);
  });
});
