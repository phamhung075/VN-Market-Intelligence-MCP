/**
 * Task 1916a-mcp-part — bctcHttpFetcher X-API-Key injection
 *
 * Verifies that bctcHttpFetch injects the X-API-Key header when the
 * request URL targets the VPS host (125.212.251.27 or VPS_HOST env var),
 * and does NOT inject it for non-VPS URLs.
 *
 * SPIKE 1916 root cause: Strategy 0 (VPS Playwright /proxy/bctc-discover/:ticker)
 * returned HTTP 401 because bctcHttpFetcher sent no auth header.
 * Fix: detect VPS host in URL → inject X-API-Key: ${Bun.env.VPS_PUSH_API_KEY}.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fetch interceptor — captures headers sent by bctcHttpFetch
// ─────────────────────────────────────────────────────────────────────────────

interface CapturedRequest {
  url: string;
  headers: Record<string, string>;
}

let capturedRequests: CapturedRequest[] = [];
const originalFetch = globalThis.fetch;

function installFetchInterceptor(responseBody: string, status = 200): void {
  // Cast to `typeof globalThis.fetch` to satisfy TypeScript's strict fetch type (which includes `preconnect`).
  // The interceptor only needs to satisfy the fetch call sites in bctcHttpFetch.
  (globalThis as unknown as { fetch: typeof globalThis.fetch }).fetch = Object.assign(
    async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
      const hdrs: Record<string, string> = {};
      if (init?.headers) {
        const h = init.headers as Record<string, string>;
        for (const [k, v] of Object.entries(h)) {
          hdrs[k.toLowerCase()] = v;
        }
      }
      capturedRequests.push({ url, headers: hdrs });
      return new Response(responseBody, { status });
    },
    { preconnect: () => { /* noop */ } },
  ) as typeof globalThis.fetch;
}

function restoreFetch(): void {
  globalThis.fetch = originalFetch;
}

// ─────────────────────────────────────────────────────────────────────────────
// Env setup helpers
// ─────────────────────────────────────────────────────────────────────────────

const VPS_HOST_DEFAULT = "125.212.251.27";
const VPS_HOST_PORT = "8765";
const VPS_URL = `http://${VPS_HOST_DEFAULT}:${VPS_HOST_PORT}/proxy/bctc-discover/DPM?year=2025&quarter=4`;
const NON_VPS_URL = "https://s.cafef.vn/Candles/FinanceInfo.ashx?symbol=DPM&type=5";

describe("Task 1916a — bctcHttpFetch injects X-API-Key for VPS host URLs", () => {
  beforeEach(() => {
    capturedRequests = [];
    // Ensure a test API key is present
    Bun.env["VPS_PUSH_API_KEY"] = "test-api-key-1916a";
    // Ensure VPS_HOST is cleared (tests that need it set will set it)
    delete Bun.env["VPS_HOST"];
  });

  afterEach(() => {
    restoreFetch();
    delete Bun.env["VPS_PUSH_API_KEY"];
    delete Bun.env["VPS_HOST"];
  });

  // AC-1: X-API-Key header sent for VPS host URL (hardcoded IP fallback)
  it("AC-1: sends X-API-Key header when URL contains hardcoded VPS IP", async () => {
    installFetchInterceptor(JSON.stringify({ results: [], error: null }));

    // Re-import to get fresh module with our fetch interceptor active
    const { bctcHttpFetch } = await import("../infrastructure/fetchers/bctcHttpFetcher.js");

    await bctcHttpFetch(VPS_URL, 5000).catch(() => { /* ignore errors */ });

    expect(capturedRequests.length).toBeGreaterThan(0);
    const req = capturedRequests[0]!;
    expect(req.headers["x-api-key"]).toBe("test-api-key-1916a");
  });

  // AC-2: X-API-Key header sent when URL matches VPS_HOST env var
  it("AC-2: sends X-API-Key header when URL matches VPS_HOST env var", async () => {
    Bun.env["VPS_HOST"] = VPS_HOST_DEFAULT;
    installFetchInterceptor(JSON.stringify({ results: [], error: null }));

    const { bctcHttpFetch } = await import("../infrastructure/fetchers/bctcHttpFetcher.js");

    const urlWithEnvHost = `http://${VPS_HOST_DEFAULT}:${VPS_HOST_PORT}/proxy/bctc-discover/VCB?year=2025&quarter=4`;
    await bctcHttpFetch(urlWithEnvHost, 5000).catch(() => { /* ignore errors */ });

    expect(capturedRequests.length).toBeGreaterThan(0);
    const req = capturedRequests[0]!;
    expect(req.headers["x-api-key"]).toBe("test-api-key-1916a");
  });

  // AC-3: X-API-Key NOT sent for non-VPS URLs (no auth header pollution)
  it("AC-3: does NOT send X-API-Key for non-VPS URLs", async () => {
    installFetchInterceptor("<html></html>");

    const { bctcHttpFetch } = await import("../infrastructure/fetchers/bctcHttpFetcher.js");

    await bctcHttpFetch(NON_VPS_URL, 5000).catch(() => { /* ignore errors */ });

    expect(capturedRequests.length).toBeGreaterThan(0);
    const req = capturedRequests[0]!;
    expect(req.headers["x-api-key"]).toBeUndefined();
  });

  // AC-4: No X-API-Key injected when VPS_PUSH_API_KEY is not set (graceful degradation)
  it("AC-4: no X-API-Key header when VPS_PUSH_API_KEY env var is absent", async () => {
    delete Bun.env["VPS_PUSH_API_KEY"];
    installFetchInterceptor(JSON.stringify({ results: [], error: null }));

    const { bctcHttpFetch } = await import("../infrastructure/fetchers/bctcHttpFetcher.js");

    // Even for VPS URL — key absent → no header injected (not an empty string header)
    await bctcHttpFetch(VPS_URL, 5000).catch(() => { /* ignore errors */ });

    expect(capturedRequests.length).toBeGreaterThan(0);
    const req = capturedRequests[0]!;
    expect(req.headers["x-api-key"]).toBeUndefined();
  });

  // AC-5: HTTP 401 from VPS causes bctcHttpFetch to throw (existing behaviour preserved)
  it("AC-5: throws on HTTP 401 from VPS even when key is sent", async () => {
    installFetchInterceptor(JSON.stringify({ error: "Unauthorized" }), 401);

    const { bctcHttpFetch } = await import("../infrastructure/fetchers/bctcHttpFetcher.js");

    await expect(bctcHttpFetch(VPS_URL, 5000)).rejects.toThrow("HTTP 401");
  });

  // AC-6: User-Agent and Accept headers still present alongside X-API-Key (no regression)
  it("AC-6: User-Agent and Accept headers preserved for VPS requests", async () => {
    installFetchInterceptor(JSON.stringify({ results: [], error: null }));

    const { bctcHttpFetch } = await import("../infrastructure/fetchers/bctcHttpFetcher.js");

    await bctcHttpFetch(VPS_URL, 5000).catch(() => { /* ignore errors */ });

    expect(capturedRequests.length).toBeGreaterThan(0);
    const req = capturedRequests[0]!;
    expect(req.headers["user-agent"]).toBeDefined();
    expect(req.headers["accept"]).toBeDefined();
    expect(req.headers["x-api-key"]).toBe("test-api-key-1916a");
  });
});
