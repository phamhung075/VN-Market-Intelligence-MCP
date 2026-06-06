/**
 * F-3 — Fetch status API layer + domain helpers tests.
 * Sprint: FETCH-OPS-PAGE-TRUTH
 * TDD: RED first — all tests defined before implementation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchFetchStatus, ApiError } from "~/lib/api/client";
import type { FetchStatus, FetchSourceStatus } from "~/domain/market";

function mockFetch(payload: unknown, status = 200) {
  global.fetch = vi.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: () => Promise.resolve(payload),
  } as Response);
}

const FIXTURE_FULL: FetchStatus = {
  sources: [
    { id: "cafef", lastArticleAt: "2026-06-06T04:30:00Z", ageMs: 300000, count24h: 45, status: "fresh" },
    { id: "vnexpress", lastArticleAt: "2026-06-06T03:00:00Z", ageMs: 5400000, count24h: 88, status: "stale" },
    { id: "nld", lastArticleAt: "", ageMs: 0, count24h: 0, status: "no-data" },
  ],
  vpsProxy: {
    news: { last_push: "2026-06-06T04:28:00Z", stale: false, pushes_24h: 120, errors_24h: 0 },
    bctc: { last_push: "2026-06-06T03:00:00Z", stale: true, pushes_24h: 4, errors_24h: 1 },
    prices: { last_push: "2026-06-06T04:20:00Z", stale: false, pushes_24h: 96, errors_24h: 0 },
    sbv: { last_push: "2026-06-06T02:00:00Z", stale: true, pushes_24h: 2, errors_24h: 0 },
    "foreign-flow": { last_push: "2026-06-06T04:00:00Z", stale: false, pushes_24h: 12, errors_24h: 0 },
  },
  bctcPipeline: { pending: 3, done: 120, failed: 2 },
};

// --------------------------------------------------------------------------
// fetchFetchStatus
// --------------------------------------------------------------------------

describe("fetchFetchStatus", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a FetchStatus object on happy path", async () => {
    mockFetch(FIXTURE_FULL);
    const result = await fetchFetchStatus();
    expect(result).toEqual(FIXTURE_FULL);
  });

  it("calls correct endpoint /api/fetch-status", async () => {
    mockFetch(FIXTURE_FULL);
    await fetchFetchStatus();
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/fetch-status"),
      expect.any(Object),
    );
  });

  it("sources array contains expected ids", async () => {
    mockFetch(FIXTURE_FULL);
    const result = await fetchFetchStatus();
    const ids = result.sources.map((s) => s.id);
    expect(ids).toContain("cafef");
    expect(ids).toContain("vnexpress");
  });

  it("throws ApiError on non-2xx", async () => {
    mockFetch({}, 503);
    await expect(fetchFetchStatus()).rejects.toBeInstanceOf(ApiError);
  });

  it("vpsProxy has all 5 expected legs", async () => {
    mockFetch(FIXTURE_FULL);
    const result = await fetchFetchStatus();
    expect(result.vpsProxy).toHaveProperty("news");
    expect(result.vpsProxy).toHaveProperty("bctc");
    expect(result.vpsProxy).toHaveProperty("prices");
    expect(result.vpsProxy).toHaveProperty("sbv");
    expect(result.vpsProxy).toHaveProperty("foreign-flow");
  });

  it("bctcPipeline has pending, done, failed counts", async () => {
    mockFetch(FIXTURE_FULL);
    const result = await fetchFetchStatus();
    expect(typeof result.bctcPipeline.pending).toBe("number");
    expect(typeof result.bctcPipeline.done).toBe("number");
    expect(typeof result.bctcPipeline.failed).toBe("number");
  });

  it("source status enum values are valid", async () => {
    mockFetch(FIXTURE_FULL);
    const result = await fetchFetchStatus();
    const validStatuses = ["fresh", "stale", "no-data"];
    for (const src of result.sources) {
      expect(validStatuses).toContain(src.status);
    }
  });
});

// --------------------------------------------------------------------------
// Domain helpers: formatSourceAge
// --------------------------------------------------------------------------

import { formatSourceAge, sourceStatusColor } from "~/domain/market";

describe("formatSourceAge", () => {
  it("formats sub-minute age as '< 1 min ago'", () => {
    expect(formatSourceAge(30000)).toBe("< 1 min ago");
  });

  it("formats single minute", () => {
    expect(formatSourceAge(90000)).toBe("1 min ago");
  });

  it("formats multiple minutes", () => {
    expect(formatSourceAge(300000)).toBe("5 min ago");
  });

  it("formats exactly 1 hour", () => {
    expect(formatSourceAge(3600000)).toBe("1 h ago");
  });

  it("formats multiple hours", () => {
    expect(formatSourceAge(5400000)).toBe("1.5 h ago");
  });

  it("returns 'no data' for zero ageMs", () => {
    expect(formatSourceAge(0)).toBe("no data");
  });
});

describe("sourceStatusColor", () => {
  it("returns green for fresh", () => {
    const source: FetchSourceStatus = { id: "cafef", lastArticleAt: "", ageMs: 60000, count24h: 10, status: "fresh" };
    expect(sourceStatusColor(source)).toBe("green");
  });

  it("returns amber for stale with ageMs in 2–12h range", () => {
    const source: FetchSourceStatus = { id: "cafef", lastArticleAt: "", ageMs: 4 * 3600000, count24h: 5, status: "stale" };
    expect(sourceStatusColor(source)).toBe("amber");
  });

  it("returns red for stale with ageMs > 12h", () => {
    const source: FetchSourceStatus = { id: "cafef", lastArticleAt: "", ageMs: 13 * 3600000, count24h: 0, status: "stale" };
    expect(sourceStatusColor(source)).toBe("red");
  });

  it("returns grey for no-data status", () => {
    const source: FetchSourceStatus = { id: "nld", lastArticleAt: "", ageMs: 0, count24h: 0, status: "no-data" };
    expect(sourceStatusColor(source)).toBe("grey");
  });
});
