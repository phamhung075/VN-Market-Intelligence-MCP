/**
 * 1937 — fetchTASnapshot API layer tests (TDD: RED first).
 * Tests: fetchTASnapshot request shape, response mapping, error handling.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchTASnapshot, ApiError } from "~/lib/api/client";
import type { TASnapshot } from "~/domain/market";

function mockFetch(payload: unknown, status = 200) {
  global.fetch = vi.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: () => Promise.resolve(payload),
  } as Response);
}

const FULL_SNAPSHOT: TASnapshot = {
  code: "FPT",
  rsi: 45.4,
  macd: { line: 0.12, signal: 0.08, histogram: 0.04 },
  movingAverages: { ma5: 72000, ma20: 70000, ma50: 68000 },
  bollingerBands: { upper: 75000, mid: 71000, lower: 67000 },
  trend: "BULLISH",
  computedAt: "2026-05-17T10:00:00Z",
};

describe("fetchTASnapshot", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns TASnapshot on happy path", async () => {
    mockFetch(FULL_SNAPSHOT);
    const result = await fetchTASnapshot("FPT");
    expect(result.code).toBe("FPT");
    expect(result.rsi).toBe(45.4);
    expect(result.trend).toBe("BULLISH");
    expect(result.macd).toEqual({ line: 0.12, signal: 0.08, histogram: 0.04 });
    expect(result.movingAverages.ma20).toBe(70000);
  });

  it("calls POST /ta/ta/indicators with correct body", async () => {
    mockFetch(FULL_SNAPSHOT);
    await fetchTASnapshot("FPT");

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/ta/ta/indicators"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
        body: expect.stringContaining('"code":"FPT"'),
      }),
    );
  });

  it("includes today's date in the request body", async () => {
    mockFetch(FULL_SNAPSHOT);
    const today = new Date().toISOString().slice(0, 10);
    await fetchTASnapshot("VNM");

    const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(callArgs[1].body as string) as { code: string; date: string };
    expect(body.date).toBe(today);
  });

  it("handles null rsi and macd gracefully", async () => {
    mockFetch({ ...FULL_SNAPSHOT, rsi: null, macd: null });
    const result = await fetchTASnapshot("FPT");
    expect(result.rsi).toBeNull();
    expect(result.macd).toBeNull();
  });

  it("throws ApiError on non-2xx response", async () => {
    mockFetch({}, 500);
    await expect(fetchTASnapshot("FPT")).rejects.toBeInstanceOf(ApiError);
  });

  it("throws ApiError with correct status code", async () => {
    mockFetch({}, 404);
    try {
      await fetchTASnapshot("FPT");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(404);
    }
  });
});
