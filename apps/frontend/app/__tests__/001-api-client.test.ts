/**
 * Tier 3 — API service layer tests.
 * Pattern: mock global fetch, test request shape and response mapping.
 * These tests must be GREEN before any feature component or Remix loader uses the client.
 *
 * TDD entry point: write your test here FIRST (RED), then implement in app/lib/api/client.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchGatewayHealth, ApiError } from "~/lib/api/client";
import type { GatewayHealth } from "~/lib/api/client";

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function mockFetch(payload: unknown, status = 200) {
  global.fetch = vi.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: () => Promise.resolve(payload),
  } as Response);
}

// --------------------------------------------------------------------------
// fetchGatewayHealth
// --------------------------------------------------------------------------

describe("fetchGatewayHealth", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns typed health payload on 200", async () => {
    const fixture: GatewayHealth = {
      status: "ok",
      services: {
        "stock-price": "ok",
        "technical-analysis": "ok",
        "macro-indicators": "ok",
        "pdf-extractor": "degraded",
        "rag-service": "ok",
        "kinh-dich-service": "ok",
        "alert-engine": "ok",
        "news-fetch": "ok",
      },
      timestamp: "2026-05-17T07:00:00.000Z",
    };

    mockFetch(fixture);

    const result = await fetchGatewayHealth();

    expect(result.status).toBe("ok");
    expect(result.services["stock-price"]).toBe("ok");
    expect(result.timestamp).toBe("2026-05-17T07:00:00.000Z");
  });

  it("calls /health endpoint on api-gateway", async () => {
    mockFetch({ status: "ok", services: {}, timestamp: "" });

    await fetchGatewayHealth();

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/health"),
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
  });

  it("throws ApiError on non-2xx response", async () => {
    // mockFetch sets mockResolvedValueOnce — only one call allowed per mock setup.
    // Capture the rejection once and assert both shape and type.
    mockFetch({ error: "service unavailable" }, 503);

    let caught: unknown;
    try {
      await fetchGatewayHealth();
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect(caught).toMatchObject({ status: 503 });
  });
});
