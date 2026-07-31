Bun.env["DB_PATH"] = ":memory:";

/**
 * Task FIX-FOREIGN-FLOW-DEAD-ENDPOINT
 *
 * Root cause: fetchPrimaryVpsEndpoint() GETs http://${VINAHOST_IP}/foreign-flow
 * every market-minute via the production cron path
 * (runForeignFlowFetcherJobCron -> runForeignFlowFetcherJob() -> called with
 * NO overrides). vps-scripts/vps-proxy-server.js has never exposed a
 * /foreign-flow GET route — the VPS is push-only (POST /api/push-foreign-flow,
 * handled by pushForeignFlowHandler.ts, is the sole live write path). The GET
 * therefore 404s silently every minute, wasting a network round trip and
 * warn-logging on every call.
 *
 * Fix: the "primary VPS endpoint" strategy inside fetchForeignFlowWithFallback
 * now only attempts a fetch when the caller explicitly supplies
 * overrides.fetchFn (the function's existing DI seam, already used for `now`).
 * No production caller ever supplies fetchFn (confirmed: only
 * runForeignFlowFetcherJobCron -> runForeignFlowFetcherJob() with no
 * overrides calls this in production) — so the dead GET no longer fires in
 * production. Tests that inject fetchFn (1392-foreign-flow-cb-probe-regression,
 * 1288-foreign-flow-fallback §4, 1290a/1352b primary-success cases) keep
 * exercising fetchPrimaryVpsEndpoint's parse/validate/timeout/CB-noninterference
 * contract unchanged — that DI seam is deliberately preserved rather than
 * deleting fetchPrimaryVpsEndpoint outright, since those tests are live
 * regression coverage for the historical Task 1392 CB-stuck-open incident.
 *
 * This test asserts the NEW invariant: without an injected fetchFn (i.e. the
 * exact shape of the production cron call), fetchForeignFlowWithFallback must
 * never invoke the global `fetch` at all — no network round trip, no
 * /foreign-flow URL construction, no per-minute 404.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import {
  fetchForeignFlowWithFallback,
  resetFallbackCache,
  resetCircuitBreaker,
  resetLogSpamGuard,
} from "../infrastructure/fetchers/foreignFlowFetcher.js";
import { initDatabase, closeDb } from "../infrastructure/db/schema.js";

describe("FIX-FOREIGN-FLOW-DEAD-ENDPOINT — no default global-fetch call to /foreign-flow", () => {
  let originalFetch: typeof globalThis.fetch;
  let fetchCallCount: number;
  let calledUrls: string[];

  beforeAll(async () => {
    await initDatabase();
  });

  afterAll(() => {
    closeDb();
  });

  beforeEach(async () => {
    await resetCircuitBreaker();
    resetFallbackCache();
    resetLogSpamGuard();

    originalFetch = globalThis.fetch;
    fetchCallCount = 0;
    calledUrls = [];
    globalThis.fetch = (async (input: any, init?: any) => {
      fetchCallCount++;
      calledUrls.push(String(input));
      return originalFetch(input, init);
    }) as typeof globalThis.fetch;
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    await resetCircuitBreaker();
    resetFallbackCache();
    resetLogSpamGuard();
  });

  it("production-shaped call (no overrides.fetchFn) never touches global fetch", async () => {
    // Exact shape of the production cron invocation: runForeignFlowFetcherJob()
    // calls fetchForeignFlowWithFallback(overrides) where overrides has no
    // fetchFn — matching runForeignFlowFetcherJobCron's no-args call.
    const result = await fetchForeignFlowWithFallback({});

    expect(fetchCallCount).toBe(0);
    expect(calledUrls).toEqual([]);
    // Falls straight through to fallback chain (cache/sse/none) — never "primary"
    expect(result.source).not.toBe("primary");
  });

  it("call with zero overrides at all (fully production-shaped) never touches global fetch", async () => {
    const result = await fetchForeignFlowWithFallback();

    expect(fetchCallCount).toBe(0);
    expect(result.source).not.toBe("primary");
  });

  it("no /foreign-flow URL is ever constructed against global fetch when fetchFn is not injected", async () => {
    await fetchForeignFlowWithFallback({});
    expect(calledUrls.some((u) => u.includes("/foreign-flow"))).toBe(false);
  });

  it("explicit fetchFn injection still reaches the primary strategy (DI seam preserved for tests)", async () => {
    const injectedFetch = async (_url: string, _opts?: unknown): Promise<Response> =>
      new Response(
        JSON.stringify({
          data: [
            {
              code: "VNM",
              date: "2026-08-01",
              foreignBuyVol: 1000,
              foreignSellVol: 800,
              putThroughVol: 0,
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );

    const result = await fetchForeignFlowWithFallback({ fetchFn: injectedFetch });

    // Global fetch untouched — the injected fetchFn was used instead
    expect(fetchCallCount).toBe(0);
    expect(result.source).toBe("primary");
  });
});
