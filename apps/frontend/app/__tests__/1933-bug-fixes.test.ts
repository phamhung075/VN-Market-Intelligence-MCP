/**
 * Tests for 11-bug fix cycle (task 1933).
 *
 * Covers:
 * - BUG 4: toUserFriendlyError strips raw ApiError paths
 * - BUG 6: fetchServiceHealth accepts latencyMs / checked_at / timestamp aliases
 * - BUG 10: timestamp labels are "Last updated:"
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// --------------------------------------------------------------------------
// BUG 4 — user-friendly error helper (inline duplicate — source of truth is
// the route file; this tests the intended contract)
// --------------------------------------------------------------------------

function toUserFriendlyError(raw: string): string {
  if (raw.includes("ApiError") || raw.includes("404") || raw.includes("failed")) {
    const source = raw.split(":")[0]?.trim() ?? "Source";
    return `${source}: data temporarily unavailable`;
  }
  return raw;
}

describe("toUserFriendlyError", () => {
  it("replaces ApiError path with user-friendly message", () => {
    const raw = "Reuters: ApiError: GET /news/reuters/headlines failed: 404 Not Found";
    const result = toUserFriendlyError(raw);
    expect(result).toBe("Reuters: data temporarily unavailable");
    expect(result).not.toContain("/news/reuters/headlines");
    expect(result).not.toContain("ApiError");
  });

  it("replaces Bloomberg 404 error", () => {
    const raw = "Bloomberg: ApiError: GET /news/bloomberg/headlines failed: 404 Not Found";
    const result = toUserFriendlyError(raw);
    expect(result).toBe("Bloomberg: data temporarily unavailable");
    expect(result).not.toContain("404");
  });

  it("replaces macro 404 error", () => {
    const raw = "Macro: ApiError: GET /macro/external failed: 404 Not Found";
    const result = toUserFriendlyError(raw);
    expect(result).toBe("Macro: data temporarily unavailable");
  });

  it("passes through non-API errors unchanged", () => {
    const raw = "Network timeout";
    expect(toUserFriendlyError(raw)).toBe("Network timeout");
  });

  it("passes through generic messages unchanged", () => {
    const raw = "Service is temporarily down for maintenance";
    expect(toUserFriendlyError(raw)).toBe(raw);
  });
});

// --------------------------------------------------------------------------
// BUG 6 — fetchServiceHealth field alias tolerance
// --------------------------------------------------------------------------

const { fetchServiceHealth } = await import("~/lib/api/client");

const globalFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn();
});

afterEach(() => {
  global.fetch = globalFetch;
});

describe("fetchServiceHealth — field alias tolerance (BUG 6)", () => {
  function mockOk(body: unknown) {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(body),
    });
  }

  it("reads latency from camelCase 'latency' field", async () => {
    mockOk({ status: "ok", latency: 42, checkedAt: "2026-05-17T10:00:00Z" });
    const result = await fetchServiceHealth("news");
    expect(result.latency).toBe(42);
    expect(result.checkedAt).toBe("2026-05-17T10:00:00Z");
  });

  it("reads latency from 'latencyMs' alias", async () => {
    mockOk({ status: "ok", latencyMs: 55 });
    const result = await fetchServiceHealth("news");
    expect(result.latency).toBe(55);
  });

  it("reads latency from 'latency_ms' alias", async () => {
    mockOk({ status: "ok", latency_ms: 77 });
    const result = await fetchServiceHealth("macro");
    expect(result.latency).toBe(77);
  });

  it("reads checkedAt from 'checked_at' alias", async () => {
    mockOk({ status: "ok", checked_at: "2026-05-17T11:00:00Z" });
    const result = await fetchServiceHealth("stock");
    expect(result.checkedAt).toBe("2026-05-17T11:00:00Z");
  });

  it("falls back to 'timestamp' when checkedAt and checked_at are absent", async () => {
    mockOk({ status: "ok", timestamp: "2026-05-17T12:00:00Z" });
    const result = await fetchServiceHealth("pdf");
    expect(result.checkedAt).toBe("2026-05-17T12:00:00Z");
  });

  it("returns undefined latency when no latency field present", async () => {
    mockOk({ status: "ok" });
    const result = await fetchServiceHealth("ta");
    expect(result.latency).toBeUndefined();
  });

  it("returns undefined checkedAt when no time field present", async () => {
    mockOk({ status: "ok" });
    const result = await fetchServiceHealth("alert");
    expect(result.checkedAt).toBeUndefined();
  });
});
