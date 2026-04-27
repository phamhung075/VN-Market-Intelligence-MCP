Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1352b — Scheduler Job Wrapper Tests: foreignFlowFetcherJob
 *
 * 5 test cases covering the runForeignFlowFetcherJob() wrapper layer:
 *
 *   Case 1: Primary success — fallbackActivated=false, cbState='closed'
 *   Case 2: Cache fallback — fallbackActivated=true, source='cache'
 *   Case 3: All fallbacks exhausted — source='none', warning present
 *   Case 4: Unexpected error in fetchForeignFlowWithFallback — catch path
 *   Case 5: runForeignFlowFetcherJobCron() — recordJobRun rows_written wiring
 *
 * Mock strategy:
 *   - Cases 1-3: pass overrides.fetchFn + optional overrides.cacheStore directly
 *     to runForeignFlowFetcherJob() (forwarded to fetchForeignFlowWithFallback).
 *   - Case 4: mock.module() replaces foreignFlowFetcher.js before dynamic import
 *     of the job module (cache-busted with ?test=C4).
 *   - Case 5: mock.module() to control fetchForeignFlowWithFallback return value,
 *     real in-memory DB for recordJobRun row assertion.
 *
 * Double-dynamic-import risk (architect flag):
 *   circuitBreakerRegistry is imported dynamically inside runForeignFlowFetcherJob
 *   both in the try block AND the catch block. Bun caches module instances so
 *   re-import returns the same singleton — no side-effect risk. Case 4 exercises
 *   the catch-block import path explicitly.
 *
 * @module __tests__/1352b-foreign-flow-fetcher-job-wrapper
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, mock } from "bun:test";
import {
  fetchForeignFlowWithFallback,
  resetFallbackCache,
  resetCircuitBreaker,
  resetLogSpamGuard,
} from "../infrastructure/fetchers/foreignFlowFetcher.js";
import { breakers } from "../infrastructure/circuitBreakerRegistry.js";
import { initDatabase, closeDb, getDb } from "../infrastructure/db/schema.js";
import type { WriteForeignFlowItem } from "../domain/models/shared-types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Real-module captures — imported BEFORE any mock.module() call so they hold
// the genuine implementations. Used in teardown to repair the module registry
// for worker-sibling test files. Pattern: FIX-1290-briefing-no-stale.test.ts.
// ─────────────────────────────────────────────────────────────────────────────
const _realFetchForeignFlowWithFallback = fetchForeignFlowWithFallback;
const _realResetFallbackCache = resetFallbackCache;
const _realResetCircuitBreaker = resetCircuitBreaker;
const _realResetLogSpamGuard = resetLogSpamGuard;

// ─────────────────────────────────────────────────────────────────────────────
// Test Data Builders
// ─────────────────────────────────────────────────────────────────────────────

function mockFlowItem(code = "VNM"): WriteForeignFlowItem {
  return {
    code,
    date: "2026-04-27",
    foreignBuyVol: 2000,
    foreignSellVol: 1500,
    putThroughVol: 0,
  };
}

/** fetchFn that returns a valid VPS payload */
function makePrimaryFetch(items: WriteForeignFlowItem[] = [mockFlowItem()]) {
  return async (_url: string, _opts?: unknown): Promise<Response> =>
    new Response(JSON.stringify({ data: items }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
}

/** fetchFn that throws an AbortError to trigger fallback */
function makeTimeoutFetch() {
  return async (_url: string, _opts?: unknown): Promise<Response> => {
    const err = new Error("AbortError");
    err.name = "AbortError";
    throw err;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite: Cases 1-3 (no module mocking needed)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1352b — runForeignFlowFetcherJob wrapper (Cases 1-3)", () => {
  beforeAll(async () => {
    await initDatabase();
  });

  afterAll(() => {
    closeDb();
  });

  beforeEach(async () => {
    resetFallbackCache();
    await resetCircuitBreaker();
  });

  afterEach(async () => {
    resetFallbackCache();
    await resetCircuitBreaker();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Case 1: Primary success
  // ──────────────────────────────────────────────────────────────────────────

  it("Case 1: primary success — fallbackActivated=false, cbState='closed', ISO timestamp", async () => {
    const { runForeignFlowFetcherJob } = await import(
      "../scheduler/market-data/foreignFlowFetcherJob.js"
    );

    const now = new Date("2026-04-27T08:00:00.000Z");

    const result = await runForeignFlowFetcherJob({
      now: () => now,
      fetchFn: makePrimaryFetch([mockFlowItem("VNM")]),
    });

    expect(result.source).toBe("primary");
    expect(result.fallbackActivated).toBe(false);
    expect(result.cbState).toBe("closed");
    // ISO 8601 format check
    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(result.changes).toBeGreaterThanOrEqual(0);
    expect(result.warning).toBeUndefined();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Case 2: Cache fallback — fallbackActivated=true
  // ──────────────────────────────────────────────────────────────────────────

  it("Case 2: cache fallback — fallbackActivated=true, source='cache', cbState is valid", async () => {
    const { runForeignFlowFetcherJob } = await import(
      "../scheduler/market-data/foreignFlowFetcherJob.js"
    );

    const cacheTimestamp = "2026-04-27T07:00:00Z";
    const now = new Date("2026-04-27T08:00:00Z");

    const mockCacheStore = {
      get: () => ({
        data: [mockFlowItem("HPG")],
        timestamp: cacheTimestamp,
        changes: 3,
        cachedAt: cacheTimestamp,
      }),
    };

    const result = await runForeignFlowFetcherJob({
      now: () => now,
      fetchFn: makeTimeoutFetch(),
      cacheStore: mockCacheStore,
    });

    expect(result.source).toBe("cache");
    expect(result.fallbackActivated).toBe(true);
    expect(["closed", "open", "half-open"]).toContain(result.cbState);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Case 3: All fallbacks exhausted
  // ──────────────────────────────────────────────────────────────────────────

  it("Case 3: all fallbacks exhausted — source='none', fallbackActivated=true, warning present", async () => {
    const { runForeignFlowFetcherJob } = await import(
      "../scheduler/market-data/foreignFlowFetcherJob.js"
    );

    const now = new Date("2026-04-27T09:00:00Z");

    const result = await runForeignFlowFetcherJob({
      now: () => now,
      fetchFn: makeTimeoutFetch(),
      cacheStore: { get: () => null },
    });

    expect(result.source).toBe("none");
    expect(result.fallbackActivated).toBe(true);
    expect(result.warning).toBeDefined();
    expect(result.warning).toContain("all fallbacks unavailable");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite: Case 4 — Unexpected error catch path (mock.module required)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1352b — Case 4: unexpected error catch path", () => {
  it("Case 4: fetchForeignFlowWithFallback throws — catch path returns structured result, does not re-throw", async () => {
    // Replace the fetcher module BEFORE importing the job module.
    // Cache-bust with ?test=C4 so Bun treats this as a fresh module instance
    // with the mocked dependency in place.
    mock.module("../infrastructure/fetchers/foreignFlowFetcher.js", () => ({
      fetchForeignFlowWithFallback: async () => {
        throw new Error("registry corrupted");
      },
      resetFallbackCache: () => {},
      resetCircuitBreaker: async () => {},
      resetLogSpamGuard: () => {},
    }));

    // circuitBreakerRegistry is dynamically imported inside the catch block —
    // use the real registry (it returns 'closed' by default, no need to mock it).
    // This exercises the double-dynamic-import path the architect flagged.

    const { runForeignFlowFetcherJob } = await import(
      "../scheduler/market-data/foreignFlowFetcherJob.js"
    );

    // Must not throw
    const result = await runForeignFlowFetcherJob();

    expect(result.source).toBe("none");
    expect(result.fallbackActivated).toBe(true);
    expect(result.changes).toBe(0);
    expect(result.warning).toBeDefined();
    expect(result.warning).toContain("unexpected error");
    expect(result.warning).toContain("registry corrupted");
    // cbState comes from the real registry — must be a valid value
    expect(["closed", "open", "half-open"]).toContain(result.cbState);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite: Case 5 — runForeignFlowFetcherJobCron recordJobRun wiring
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1352b — Case 5: runForeignFlowFetcherJobCron recordJobRun wiring", () => {
  beforeAll(async () => {
    // Fresh in-memory DB with full schema for cron_job_runs table
    await initDatabase();
  });

  afterAll(() => {
    closeDb();
  });

  it("Case 5: cron wrapper writes rows_written=7 to cron_job_runs for foreignFlowFetcherJob", async () => {
    // Replace the fetcher so runForeignFlowFetcherJob (called internally by
    // runForeignFlowFetcherJobCron with no overrides) returns a controlled result.
    mock.module("../infrastructure/fetchers/foreignFlowFetcher.js", () => ({
      fetchForeignFlowWithFallback: async () => ({
        source: "primary" as const,
        changes: 7,
        timestamp: "2026-04-27T10:00:00Z",
        warning: undefined,
      }),
      resetFallbackCache: () => {},
      resetCircuitBreaker: async () => {},
      resetLogSpamGuard: () => {},
    }));

    const { runForeignFlowFetcherJobCron } = await import(
      "../scheduler/market-data/foreignFlowFetcherJob.js"
    );

    // Run the cron wrapper — it will call getDb() and recordJobRun internally
    await runForeignFlowFetcherJobCron();

    // Query the real in-memory DB to verify the row was written
    const db = getDb();
    type Row = { job_name: string; status: string; rows_written: number | null };
    const row = db
      .prepare<Row, [string]>(
        "SELECT job_name, status, rows_written FROM cron_job_runs WHERE job_name = ? ORDER BY id DESC LIMIT 1",
      )
      .get("foreignFlowFetcherJob");

    expect(row).not.toBeNull();
    expect(row!.job_name).toBe("foreignFlowFetcherJob");
    expect(row!.status).toBe("success");
    expect(row!.rows_written).toBe(7);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Teardown — restore mocked modules to real implementations
//
// mock.module() in Bun 1.x is worker-scoped and permanent for the process
// lifetime. Any file that runs in the same Bun worker after this one will
// inherit these mock registrations. We repair the registry here by
// re-registering the real implementations captured at file top-level,
// ensuring worker-siblings see genuine modules rather than our test stubs.
// ─────────────────────────────────────────────────────────────────────────────
describe("Task 1352b — teardown: restore foreignFlowFetcher module registry", () => {
  afterAll(() => {
    mock.module("../infrastructure/fetchers/foreignFlowFetcher.js", () => ({
      fetchForeignFlowWithFallback: _realFetchForeignFlowWithFallback,
      resetFallbackCache: _realResetFallbackCache,
      resetCircuitBreaker: _realResetCircuitBreaker,
      resetLogSpamGuard: _realResetLogSpamGuard,
    }));
  });

  it("teardown guard: real foreignFlowFetcher.js captured", () => {
    expect(typeof _realFetchForeignFlowWithFallback).toBe("function");
    expect(typeof _realResetFallbackCache).toBe("function");
    expect(typeof _realResetCircuitBreaker).toBe("function");
  });
});
