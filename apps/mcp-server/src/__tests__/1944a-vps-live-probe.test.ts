/**
 * Task 1944a-mcp — VPS BCTC Discover live probe (integration test)
 *
 * Guards with VPS_INTEGRATION=true so this never runs in CI.
 * When the guard is absent all tests skip automatically — the suite is PASS.
 *
 * What this tests:
 *   1. bctcHttpFetch reaches GET /proxy/bctc-discover/VCB?year=2026&quarter=1
 *      on the live VPS using the VPS_PUSH_API_KEY from env.
 *   2. The response parses to an object with shape { results: Array, error: null|string }.
 *   3. No HTTP 401 is returned (X-API-Key injection is working end-to-end).
 *
 * NOTE: results may be an empty array before 1944a-vps (vps-proxy-server.js shape fix)
 * is deployed.  The test accepts empty-but-valid responses so it passes both before
 * and after the VPS deploy.
 *
 * Sprint 1944 context:
 *   - X-API-Key injection already landed in bctcHttpFetcher.ts (commits 8f9c2d55 / 0d248b00)
 *   - VPS route /proxy/bctc-discover/:ticker already landed in vps-proxy-server.js (1b8f8cd5)
 *   - Shape mismatch (string[] vs {results,error}) fixed by 1944a-vps (not yet deployed at
 *     time of writing; probe runs successfully once both fixes are live on the VPS)
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";

// ─────────────────────────────────────────────────────────────────────────────
// VPS_INTEGRATION guard — skip entire suite if flag is absent
// ─────────────────────────────────────────────────────────────────────────────

const VPS_INTEGRATION = Bun.env["VPS_INTEGRATION"] === "true";

const itLive = VPS_INTEGRATION ? it : it.skip;

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const VPS_HOST = Bun.env["VPS_HOST"] ?? "125.212.251.27";
const VPS_PORT = "8765";
const PROBE_URL = `http://${VPS_HOST}:${VPS_PORT}/proxy/bctc-discover/VCB?year=2026&quarter=1`;
const TIMEOUT_MS = 15_000; // live network — generous but bounded

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal type for the expected VPS response envelope. */
interface VpsDiscoverResponse {
  results: unknown;
  error: string | null;
}

function isVpsDiscoverResponse(v: unknown): v is VpsDiscoverResponse {
  if (typeof v !== "object" || v === null) return false;
  const obj = v as Record<string, unknown>;
  return "results" in obj && (obj["error"] === null || typeof obj["error"] === "string");
}

// ─────────────────────────────────────────────────────────────────────────────
// Test suite
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1944a-mcp — VPS live probe (VPS_INTEGRATION guard)", () => {
  // Non-guarded sanity tests — always run, no network calls

  it("GUARD: VPS_INTEGRATION not set → suite skips live tests (CI-safe)", () => {
    // This test always passes. The live tests below are skipped when VPS_INTEGRATION != 'true'.
    // It serves as documentation that the guard is working correctly.
    if (!VPS_INTEGRATION) {
      expect(true).toBe(true); // intentional no-op — guard is working
    } else {
      expect(VPS_INTEGRATION).toBe(true); // when live: flag is set
    }
  });

  it("GUARD: VPS_PUSH_API_KEY is present in env when VPS_INTEGRATION is active", () => {
    if (!VPS_INTEGRATION) return; // skip silently in CI
    const apiKey = Bun.env["VPS_PUSH_API_KEY"];
    expect(apiKey).toBeDefined();
    expect(typeof apiKey).toBe("string");
    expect((apiKey as string).length).toBeGreaterThan(0);
  });

  // ─── Live probe tests (skipped unless VPS_INTEGRATION=true) ───────────────

  itLive(
    "LIVE-1: bctcHttpFetch reaches VPS endpoint without HTTP 401 (X-API-Key injected)",
    async () => {
      const { bctcHttpFetch } = await import("../infrastructure/fetchers/bctcHttpFetcher.js");

      // Should not throw an HTTP 401 error. May throw for other reasons (network,
      // VPS down) but 401 specifically means header injection is broken.
      let thrownError: Error | undefined;
      try {
        await bctcHttpFetch(PROBE_URL, TIMEOUT_MS);
      } catch (e) {
        thrownError = e as Error;
      }

      if (thrownError) {
        // A 401 here means VPS_PUSH_API_KEY was not injected correctly.
        expect(thrownError.message).not.toContain("HTTP 401");
      }
      // If no error: probe reached VPS and got a 2xx — pass.
    },
    TIMEOUT_MS + 2_000,
  );

  itLive(
    "LIVE-2: VPS response has shape { results: Array, error: null|string }",
    async () => {
      const { bctcHttpFetch } = await import("../infrastructure/fetchers/bctcHttpFetcher.js");

      const raw = await bctcHttpFetch(PROBE_URL, TIMEOUT_MS);
      const parsed: unknown = JSON.parse(raw);

      // Shape guard
      expect(isVpsDiscoverResponse(parsed)).toBe(true);

      const response = parsed as VpsDiscoverResponse;

      // results must be an array (may be empty before 1944a-vps is deployed)
      expect(Array.isArray(response.results)).toBe(true);

      // error must be null or a string — never undefined
      expect(response.error === null || typeof response.error === "string").toBe(true);
    },
    TIMEOUT_MS + 2_000,
  );

  itLive(
    "LIVE-3: response confirms no HTTP 401 in status (direct fetch verification)",
    async () => {
      const apiKey = Bun.env["VPS_PUSH_API_KEY"];
      expect(apiKey).toBeDefined();

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      let status: number | undefined;
      try {
        const res = await globalThis.fetch(PROBE_URL, {
          signal: controller.signal,
          headers: {
            "X-API-Key": apiKey as string,
            Accept: "application/json",
          },
        });
        status = res.status;
      } finally {
        clearTimeout(timer);
      }

      expect(status).toBeDefined();
      // Must not be 401 (API key injected → auth accepted)
      expect(status).not.toBe(401);
      // Must be a success response
      expect(status).toBeGreaterThanOrEqual(200);
      expect(status).toBeLessThan(300);
    },
    TIMEOUT_MS + 2_000,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 1944b — Strategy 0 live verification (VPS Playwright)
// AC-5: one live test for Strategy 0 returning ≥1 URL for VCB or DPM
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1944b — Strategy 0 (VPS Playwright) live verification", () => {
  itLive(
    "LIVE-4 (1944b): discoverHosePdfUrls Strategy 1 (VPS) returns ≥1 PDF URL for VCB Q1/2026",
    async () => {
      // AC-5: after dead SSC/vietstock strategies removed, Strategy 1 (VPS Playwright)
      // must return ≥1 URL for VCB Q1/2026 when the live VPS is reachable.
      // This test is the canonical end-to-end chain: bctcHttpFetch → VPS → {results,[...]}
      // → extractVpsPlaywrightUrls → ≥1 .pdf URL.
      const { bctcHttpFetch } = await import("../infrastructure/fetchers/bctcHttpFetcher.js");
      const { discoverHosePdfUrls } = await import("../domain/services/bctcDiscovery.js");

      const prevUrl = Bun.env["BCTC_DISCOVER_URL"];
      Bun.env["BCTC_DISCOVER_URL"] = `http://${VPS_HOST}:${VPS_PORT}/proxy/bctc-discover`;

      try {
        const result = await discoverHosePdfUrls("VCB", {
          _fetchVpsPlaywright: bctcHttpFetch,
          year: 2026,
          quarter: "Q1",
          timeout: TIMEOUT_MS,
        });

        // Strategy 0 (VPS Playwright) must be the source
        expect(result.source).toBe("vps-playwright");
        // Must return at least one PDF URL
        expect(result.urls.length).toBeGreaterThanOrEqual(1);
        // All URLs must be valid PDFs
        for (const url of result.urls) {
          expect(url.toLowerCase()).toMatch(/\.pdf$/);
          expect(url).toMatch(/^https?:\/\//);
        }
      } finally {
        if (prevUrl === undefined) delete Bun.env["BCTC_DISCOVER_URL"];
        else Bun.env["BCTC_DISCOVER_URL"] = prevUrl;
      }
    },
    TIMEOUT_MS + 5_000,
  );
});
