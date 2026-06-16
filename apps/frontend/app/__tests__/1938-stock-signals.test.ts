/**
 * 1938 — fetchStockSignals API layer tests (TDD: RED first).
 * Tests: request shape, response mapping, error handling, empty state.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchStockSignals, ApiError } from "~/lib/api/client";
import type { AgentSignal } from "~/domain/market";

function mockFetch(payload: unknown, status = 200) {
  global.fetch = vi.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: () => Promise.resolve(payload),
  } as Response);
}

const SAMPLE_SIGNAL_ROW = {
  id: 42,
  stock_code: "HPG",
  signal_type: "chain_catalyst",
  direction: "BULLISH",
  confidence_score: 78,
  detail: "Oil price surge → steel sector upside",
  created_at: "2026-05-17 08:30:00",
};

const SAMPLE_SIGNAL: AgentSignal = {
  id: 42,
  stockCode: "HPG",
  signalType: "chain_catalyst",
  direction: "BULLISH",
  confidence: 0.78,
  reasoning: "Oil price surge → steel sector upside",
  createdAt: "2026-05-17 08:30:00",
  // FIX-INFOCARD-DROPDOWN-EXPAND: new fields from StockSignalItem contract
  findingData: null,
  source: null,
};

describe("fetchStockSignals", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls GET /mcp/api/signals/stock/:code", async () => {
    mockFetch({ signals: [SAMPLE_SIGNAL_ROW] });
    await fetchStockSignals("HPG");

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/mcp/api/signals/stock/HPG"),
      expect.objectContaining({ headers: expect.objectContaining({ Accept: "application/json" }) }),
    );
  });

  it("includes limit query param", async () => {
    mockFetch({ signals: [] });
    await fetchStockSignals("VNM", 5);

    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("limit=5");
  });

  it("defaults limit to 10", async () => {
    mockFetch({ signals: [] });
    await fetchStockSignals("VNM");

    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("limit=10");
  });

  it("maps snake_case DB row to AgentSignal domain type", async () => {
    mockFetch({ signals: [SAMPLE_SIGNAL_ROW] });
    const result = await fetchStockSignals("HPG");

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(SAMPLE_SIGNAL);
  });

  it("normalises confidence_score from 0–100 integer to 0.0–1.0 float", async () => {
    mockFetch({ signals: [{ ...SAMPLE_SIGNAL_ROW, confidence_score: 50 }] });
    const result = await fetchStockSignals("HPG");
    expect(result[0].confidence).toBeCloseTo(0.5);
  });

  it("handles missing confidence_score (defaults to 0)", async () => {
    mockFetch({ signals: [{ ...SAMPLE_SIGNAL_ROW, confidence_score: undefined }] });
    const result = await fetchStockSignals("HPG");
    expect(result[0].confidence).toBe(0);
  });

  it("returns empty array when signals list is empty", async () => {
    mockFetch({ signals: [] });
    const result = await fetchStockSignals("XYZ");
    expect(result).toEqual([]);
  });

  it("returns empty array when response has no signals key", async () => {
    mockFetch({});
    const result = await fetchStockSignals("XYZ");
    expect(result).toEqual([]);
  });

  it("throws ApiError on non-2xx response", async () => {
    mockFetch({}, 500);
    await expect(fetchStockSignals("HPG")).rejects.toBeInstanceOf(ApiError);
  });

  it("throws ApiError with correct status on 404", async () => {
    mockFetch({}, 404);
    try {
      await fetchStockSignals("HPG");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(404);
    }
  });

  it("handles payload field instead of detail for reasoning", async () => {
    mockFetch({
      signals: [{ ...SAMPLE_SIGNAL_ROW, detail: undefined, payload: JSON.stringify({ detail: "fallback reason" }) }],
    });
    const result = await fetchStockSignals("HPG");
    expect(result[0].reasoning).toBe("fallback reason");
  });

  it("URL-encodes stock code", async () => {
    mockFetch({ signals: [] });
    await fetchStockSignals("VN-INDEX");

    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain(encodeURIComponent("VN-INDEX"));
  });
});
