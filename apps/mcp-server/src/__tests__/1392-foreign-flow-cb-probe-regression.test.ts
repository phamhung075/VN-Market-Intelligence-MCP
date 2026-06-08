/**
 * Task 1392 — foreignFlow CB stuck OPEN regression
 *
 * Root cause: fetchForeignFlowWithFallback wraps the GET probe in
 * breakers.foreignFlow.execute(). The VPS has no /foreign-flow GET endpoint
 * (push-only architecture) — every probe hits 404 → throws → _onFailure()
 * → CB re-opens immediately after each half-open window.
 *
 * Fix: the GET fetcher must NOT touch breakers.foreignFlow. CB state is
 * managed exclusively by the push handler (POST /api/push-foreign-flow in
 * server.ts). The fetcher falls back to cache/SSE/none without affecting CB.
 *
 * Tests:
 *   1. (RED before fix) Half-open probe 404 must NOT re-open the CB
 *   2. CB stays closed after GET path returns empty/404
 *   3. CB open state is NOT incremented by GET-path failures
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { breakers } from "../infrastructure/circuitBreakerRegistry.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
import {
  fetchForeignFlowWithFallback,
  resetFallbackCache,
  resetLogSpamGuard,
} from "../infrastructure/fetchers/foreignFlowFetcher.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function forceHalfOpen(cb: typeof breakers.foreignFlow): void {
  const internal = cb as unknown as {
    _state: string;
    _openedAt: Date | null;
    _halfOpenSuccesses: number;
    _consecutiveFailures: number;
    _failures: number;
  };
  internal._state = "half-open";
  internal._openedAt = null;
  internal._halfOpenSuccesses = 0;
  internal._consecutiveFailures = 5;
  internal._failures = 5;
}

/** Fetch that simulates VPS returning 404 (no /foreign-flow GET endpoint) */
const vps404Fetch = async (_url: string, _opts?: unknown): Promise<Response> => {
  return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
};

/** Fetch that simulates VPS unreachable (ECONNREFUSED) */
const vpsUnreachableFetch = async (_url: string, _opts?: unknown): Promise<Response> => {
  throw new Error("connect ECONNREFUSED");
};

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1 — CB must NOT be re-opened by GET-path failures
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1392 — foreignFlow GET probe must NOT affect CB state", () => {
  beforeEach(() => {
    breakers.foreignFlow.reset();
    resetFallbackCache();
    resetLogSpamGuard();
  });

  afterEach(() => {
    breakers.foreignFlow.reset();
  });

  it("CB in half-open: VPS 404 probe must NOT re-open the circuit", async () => {
    forceHalfOpen(breakers.foreignFlow);
    expect(breakers.foreignFlow.stats.state).toBe("half-open");

    const failuresBefore = breakers.foreignFlow.stats.failures;

    await fetchForeignFlowWithFallback({ fetchFn: vps404Fetch });

    // CB must NOT have re-opened — failures counter must not have grown
    expect(breakers.foreignFlow.stats.failures).toBe(failuresBefore);
    // State must remain half-open (not re-opened to 'open')
    expect(breakers.foreignFlow.stats.state).toBe("half-open");
  });

  it("CB in half-open: VPS ECONNREFUSED must NOT re-open the circuit", async () => {
    forceHalfOpen(breakers.foreignFlow);
    const failuresBefore = breakers.foreignFlow.stats.failures;

    await fetchForeignFlowWithFallback({ fetchFn: vpsUnreachableFetch });

    expect(breakers.foreignFlow.stats.failures).toBe(failuresBefore);
    expect(breakers.foreignFlow.stats.state).toBe("half-open");
  });

  it("CB closed: repeated GET failures must NOT open the circuit", async () => {
    expect(breakers.foreignFlow.stats.state).toBe("closed");

    for (let i = 0; i < 10; i++) {
      await fetchForeignFlowWithFallback({ fetchFn: vps404Fetch });
    }

    // CB must stay closed — GET failures are not its concern
    expect(breakers.foreignFlow.stats.state).toBe("closed");
    expect(breakers.foreignFlow.stats.failures).toBe(0);
  });

  it("result source is cache or none when GET path fails (CB unaffected)", async () => {
    const result = await fetchForeignFlowWithFallback({ fetchFn: vps404Fetch });

    // Falls through to fallback chain — source is cache or none, never undefined
    expect(["cache", "none"]).toContain(result.source);
    // CB untouched
    expect(breakers.foreignFlow.stats.state).toBe("closed");
  });
});
