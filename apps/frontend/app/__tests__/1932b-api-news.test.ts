/**
 * 1932b — API news layer tests (TDD step: RED first).
 * Tests: fetchReutersHeadlines + fetchBloombergHeadlines.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchReutersHeadlines, fetchBloombergHeadlines, ApiError } from "~/lib/api/client";

function mockFetch(payload: unknown, status = 200) {
  global.fetch = vi.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: () => Promise.resolve(payload),
  } as Response);
}

// --------------------------------------------------------------------------
// fetchReutersHeadlines
// --------------------------------------------------------------------------

describe("fetchReutersHeadlines", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("maps headline array on happy path", async () => {
    const fixture = [
      {
        title: "VN-Index rises 1.2%",
        url: "https://reuters.com/vn",
        publishedAt: "2026-05-17T06:00:00Z",
        source: "reuters",
      },
      {
        title: "Fed holds rates",
        url: "https://reuters.com/fed",
        publishedAt: "2026-05-17T05:30:00Z",
        source: "reuters",
      },
    ];
    mockFetch(fixture);

    const result = await fetchReutersHeadlines();

    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("VN-Index rises 1.2%");
    expect(result[0].source).toBe("reuters");
    expect(result[1].publishedAt).toBe("2026-05-17T05:30:00Z");
  });

  it("returns empty array on empty response", async () => {
    mockFetch([]);

    const result = await fetchReutersHeadlines();

    expect(result).toEqual([]);
  });

  it("returns empty array when response is not an array", async () => {
    mockFetch({ message: "no data" });

    const result = await fetchReutersHeadlines();

    expect(result).toEqual([]);
  });

  it("filters out items without a title", async () => {
    mockFetch([
      { title: "Good headline" },
      { url: "https://bad.com" },  // missing title
      { title: "Another good one" },
    ]);

    const result = await fetchReutersHeadlines();

    expect(result).toHaveLength(2);
    expect(result.every((h) => typeof h.title === "string")).toBe(true);
  });

  it("throws ApiError on non-2xx", async () => {
    mockFetch({}, 503);

    await expect(fetchReutersHeadlines()).rejects.toBeInstanceOf(ApiError);
  });

  it("calls correct endpoint", async () => {
    mockFetch([]);

    await fetchReutersHeadlines();

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/news/reuters/headlines"),
      expect.any(Object),
    );
  });
});

// --------------------------------------------------------------------------
// fetchBloombergHeadlines
// --------------------------------------------------------------------------

describe("fetchBloombergHeadlines", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("maps headline array on happy path", async () => {
    const fixture = [
      { title: "Vietnam macro outlook positive", source: "bloomberg" },
    ];
    mockFetch(fixture);

    const result = await fetchBloombergHeadlines();

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Vietnam macro outlook positive");
  });

  it("returns empty array on empty response", async () => {
    mockFetch([]);

    const result = await fetchBloombergHeadlines();

    expect(result).toEqual([]);
  });

  it("returns empty array when response is null-like", async () => {
    mockFetch(null);

    const result = await fetchBloombergHeadlines();

    expect(result).toEqual([]);
  });

  it("throws ApiError on non-2xx", async () => {
    mockFetch({}, 502);

    await expect(fetchBloombergHeadlines()).rejects.toBeInstanceOf(ApiError);
  });

  it("calls correct endpoint", async () => {
    mockFetch([]);

    await fetchBloombergHeadlines();

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/news/bloomberg/headlines"),
      expect.any(Object),
    );
  });
});
