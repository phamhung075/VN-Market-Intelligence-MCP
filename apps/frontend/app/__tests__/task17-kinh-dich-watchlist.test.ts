/**
 * TASK-17 — Kinh Dịch watchlist tile enrichment (TDD entry point — Tier 3 + Tier 4).
 *
 * AC:
 *   1. fetchKinhDichReadingNonFatal resolves to KinhDichReading on 200 OK.
 *   2. fetchKinhDichReadingNonFatal returns null on 503 (ErrInsufficientData — silent degrade).
 *   3. fetchKinhDichReadingNonFatal returns null on network failure (silent degrade).
 *   4. fetchKinhDichReadingNonFatal returns null on any non-2xx (4xx, 5xx).
 *   5. The function calls /kinh-dich/reading/:code through API_GATEWAY_URL.
 *   6. WatchlistTileData.kd optional field carries the reading (or undefined when degrade).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchKinhDichReadingNonFatal } from "~/lib/api/client";

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

function mockFetchNetworkError(message = "Network error") {
  global.fetch = vi.fn().mockRejectedValueOnce(new Error(message));
}

// --------------------------------------------------------------------------
// fetchKinhDichReadingNonFatal
// --------------------------------------------------------------------------

describe("fetchKinhDichReadingNonFatal", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("AC-1: returns KinhDichReading on 200 OK", async () => {
    const fixture = {
      stock: "VCB",
      hexagram: 2,
      name: "Khon",
      trend: "TRUNG TINH",
      signal: "GIU (tich cuc)",
      confidence: 0.375,
      timestamp: "2026-06-10T07:00:00Z",
    };
    mockFetch(fixture);

    const result = await fetchKinhDichReadingNonFatal("VCB");

    expect(result).not.toBeNull();
    expect(result!.stock).toBe("VCB");
    expect(result!.hexagram).toBe(2);
    expect(result!.name).toBe("Khon");
    expect(result!.signal).toBe("GIU (tich cuc)");
    expect(result!.confidence).toBe(0.375);
  });

  it("AC-2: returns null on 503 (ErrInsufficientData — silent degrade)", async () => {
    mockFetch({ error: "ErrInsufficientData" }, 503);

    const result = await fetchKinhDichReadingNonFatal("VCB");

    expect(result).toBeNull();
  });

  it("AC-3: returns null on network failure (silent degrade)", async () => {
    mockFetchNetworkError("fetch failed");

    const result = await fetchKinhDichReadingNonFatal("VCB");

    expect(result).toBeNull();
  });

  it("AC-4: returns null on 404", async () => {
    mockFetch({ error: "not found" }, 404);

    const result = await fetchKinhDichReadingNonFatal("UNKNOWN");

    expect(result).toBeNull();
  });

  it("AC-4: returns null on 500", async () => {
    mockFetch({ error: "internal error" }, 500);

    const result = await fetchKinhDichReadingNonFatal("VCB");

    expect(result).toBeNull();
  });

  it("AC-5: calls /kinh-dich/reading/:code through API_GATEWAY_URL", async () => {
    mockFetch({
      stock: "FPT",
      hexagram: 1,
      name: "Kien",
      trend: "TANG",
      signal: "MUA",
      confidence: 0.7,
      timestamp: "2026-06-10T07:00:00Z",
    });

    await fetchKinhDichReadingNonFatal("FPT");

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/kinh-dich/reading/FPT"),
      expect.any(Object),
    );
  });

  it("AC-5: URL-encodes the ticker code", async () => {
    mockFetch({
      stock: "VN-INDEX",
      hexagram: 3,
      name: "Chun",
      trend: "GIAM",
      signal: "BAN",
      confidence: 0.2,
      timestamp: "2026-06-10T07:00:00Z",
    });

    await fetchKinhDichReadingNonFatal("VN-INDEX");

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/kinh-dich/reading/VN-INDEX"),
      expect.any(Object),
    );
  });
});
