/**
 * 1932a — API health layer tests (TDD step: RED first).
 * Tests: fetchGatewayHealth mapping + fetchServiceHealth.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchGatewayHealth, fetchServiceHealth, ApiError } from "~/lib/api/client";

function mockFetch(payload: unknown, status = 200) {
  global.fetch = vi.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: () => Promise.resolve(payload),
  } as Response);
}

// --------------------------------------------------------------------------
// fetchGatewayHealth (extended coverage)
// --------------------------------------------------------------------------

describe("fetchGatewayHealth — 1932a", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("maps services + latencies from /health response", async () => {
    const fixture = {
      status: "ok",
      services: {
        mcp: "ok",
        pdf: "degraded",
        rag: "ok",
      },
      latencies: { mcp: 12, pdf: 450, rag: 30 },
      checkedAt: "2026-05-17T08:00:00.000Z",
      timestamp: "2026-05-17T08:00:00.000Z",
    };
    mockFetch(fixture);

    const result = await fetchGatewayHealth();

    expect(result.status).toBe("ok");
    expect(result.services["pdf"]).toBe("degraded");
    expect(result.latencies?.["mcp"]).toBe(12);
  });

  it("throws ApiError on 503", async () => {
    mockFetch({}, 503);

    await expect(fetchGatewayHealth()).rejects.toBeInstanceOf(ApiError);
  });

  it("returns empty services on minimal valid response", async () => {
    mockFetch({ status: "ok", services: {}, timestamp: "" });

    const result = await fetchGatewayHealth();
    expect(result.services).toEqual({});
  });
});

// --------------------------------------------------------------------------
// fetchServiceHealth
// --------------------------------------------------------------------------

describe("fetchServiceHealth", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("maps status and latency from per-service health", async () => {
    mockFetch({ status: "ok", latency: 25, checkedAt: "2026-05-17T08:00:00Z" });

    const result = await fetchServiceHealth("ta");

    expect(result.service).toBe("ta");
    expect(result.status).toBe("ok");
    expect(result.latency).toBe(25);
  });

  it("returns down status on non-2xx", async () => {
    mockFetch({}, 404);

    await expect(fetchServiceHealth("unknown")).rejects.toBeInstanceOf(ApiError);
  });

  it("returns down status when response shape is unexpected", async () => {
    mockFetch("not-an-object");

    const result = await fetchServiceHealth("weird");

    expect(result.status).toBe("down");
    expect(result.service).toBe("weird");
  });

  it("handles missing latency gracefully", async () => {
    mockFetch({ status: "degraded" });

    const result = await fetchServiceHealth("pdf");

    expect(result.status).toBe("degraded");
    expect(result.latency).toBeUndefined();
  });
});
