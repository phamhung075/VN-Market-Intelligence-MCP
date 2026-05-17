/**
 * 1932c — API market layer tests (TDD step: RED first).
 * Tests: fetchPriceHistory + fetchMacroExternal.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchPriceHistory, fetchMacroExternal, ApiError } from "~/lib/api/client";

function mockFetch(payload: unknown, status = 200) {
  global.fetch = vi.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: () => Promise.resolve(payload),
  } as Response);
}

// --------------------------------------------------------------------------
// fetchPriceHistory
// --------------------------------------------------------------------------

describe("fetchPriceHistory", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("maps price points on happy path", async () => {
    const fixture = [
      { date: "2026-05-16", code: "VN-INDEX", open: 1200, high: 1210, low: 1195, close: 1205, volume: 5000000 },
      { date: "2026-05-17", code: "VN-INDEX", open: 1205, high: 1220, low: 1200, close: 1215, volume: 6000000 },
    ];
    mockFetch(fixture);

    const result = await fetchPriceHistory("VN-INDEX");

    expect(result).toHaveLength(2);
    expect(result[0].close).toBe(1205);
    expect(result[0].code).toBe("VN-INDEX");
    expect(result[1].date).toBe("2026-05-17");
  });

  it("returns empty array on empty response", async () => {
    mockFetch([]);

    const result = await fetchPriceHistory("VN-INDEX");

    expect(result).toEqual([]);
  });

  it("returns empty array when response is not an array", async () => {
    mockFetch({ error: "no data" });

    const result = await fetchPriceHistory("VN-INDEX");

    expect(result).toEqual([]);
  });

  it("filters out items without a close price", async () => {
    mockFetch([
      { date: "2026-05-16", code: "VN-INDEX", close: 1205 },
      { date: "2026-05-17", code: "VN-INDEX" },  // missing close
    ]);

    const result = await fetchPriceHistory("VN-INDEX");

    expect(result).toHaveLength(1);
    expect(result[0].close).toBe(1205);
  });

  it("throws ApiError on non-2xx", async () => {
    mockFetch({}, 500);

    await expect(fetchPriceHistory("VN-INDEX")).rejects.toBeInstanceOf(ApiError);
  });

  it("URL-encodes the ticker code", async () => {
    mockFetch([]);

    await fetchPriceHistory("VN-INDEX");

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("code=VN-INDEX"),
      expect.any(Object),
    );
  });

  it("handles optional fields gracefully", async () => {
    mockFetch([{ date: "2026-05-17", code: "ACB", close: 25000 }]);

    const result = await fetchPriceHistory("ACB");

    expect(result[0].open).toBeUndefined();
    expect(result[0].volume).toBeUndefined();
    expect(result[0].close).toBe(25000);
  });
});

// --------------------------------------------------------------------------
// fetchMacroExternal
// --------------------------------------------------------------------------

describe("fetchMacroExternal", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns macro object on happy path", async () => {
    const fixture = {
      source: "imf",
      fetchedAt: "2026-05-17T06:00:00Z",
      status: "ok",
      indicators: { gdp_growth: 6.8, inflation: 3.2 },
    };
    mockFetch(fixture);

    const result = await fetchMacroExternal();

    expect(result.source).toBe("imf");
    expect(result.status).toBe("ok");
    expect(result.fetchedAt).toBe("2026-05-17T06:00:00Z");
  });

  it("returns unavailable status when response is not an object", async () => {
    mockFetch("unexpected string");

    const result = await fetchMacroExternal();

    expect(result.status).toBe("unavailable");
  });

  it("returns unavailable status when response is null", async () => {
    mockFetch(null);

    const result = await fetchMacroExternal();

    expect(result.status).toBe("unavailable");
  });

  it("throws ApiError on non-2xx", async () => {
    mockFetch({}, 502);

    await expect(fetchMacroExternal()).rejects.toBeInstanceOf(ApiError);
  });

  it("calls correct endpoint", async () => {
    mockFetch({});

    await fetchMacroExternal();

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/macro/external"),
      expect.any(Object),
    );
  });
});
