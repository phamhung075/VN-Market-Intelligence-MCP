/**
 * Task 1940 — Accuracy badge on StockSignalsPanel
 *
 * Covers:
 * 1. Accuracy map parsed and attached to signal when present
 * 2. Accuracy absent → signal unchanged
 * 3. Badge threshold helpers (≥70 green, 40–69 amber, <40 red, <3 samples grey)
 * 4. Endpoint missing accuracy field → graceful fallback (signals returned clean)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// We test the logic layer (parseAccuracyFromResponse, accuracyBadgeProps) directly.
// fetchStockSignals is tested via mock-fetch.

// ─── helpers under test ───────────────────────────────────────────────────────

// These helpers will be exported from client.ts
import {
  parseAccuracyFromResponse,
  accuracyBadgeProps,
} from "~/lib/api/client";

// ─── 1. parseAccuracyFromResponse: accuracy map attached to each signal ──────

describe("parseAccuracyFromResponse", () => {
  const baseSignals = [
    {
      id: 1,
      stock_code: "VCB",
      signal_type: "chain_catalyst",
      direction: "BULLISH",
      confidence_score: 75,
      detail: "oil → VCB",
      created_at: "2026-05-17 10:00:00",
    },
    {
      id: 2,
      stock_code: "VCB",
      signal_type: "urgent_news",
      direction: "BEARISH",
      confidence_score: 45,
      detail: "rate hike",
      created_at: "2026-05-17 09:00:00",
    },
    {
      id: 3,
      stock_code: "VCB",
      signal_type: "fundamental_validation",
      direction: "NEUTRAL",
      confidence_score: 30,
      detail: "BCTC ok",
      created_at: "2026-05-17 08:00:00",
    },
  ];

  const accuracyMap = {
    chain_catalyst: { accuracy_rate: 0.7, sample_count: 10 },
    urgent_news: { accuracy_rate: 0.37, sample_count: 8 },
    fundamental_validation: { accuracy_rate: null, sample_count: 1 },
  };

  it("attaches accuracy to signals when accuracy map is present", () => {
    const result = parseAccuracyFromResponse(
      { signals: baseSignals, accuracy: accuracyMap, code: "VCB", count: 3 },
    );
    // chain_catalyst row should have accuracy attached
    const chainRow = result.find((s) => s.signalType === "chain_catalyst");
    expect(chainRow).toBeDefined();
    expect(chainRow!.accuracy).toEqual({ accuracy_rate: 0.7, sample_count: 10 });
  });

  it("attaches accuracy to urgent_news signal", () => {
    const result = parseAccuracyFromResponse(
      { signals: baseSignals, accuracy: accuracyMap, code: "VCB", count: 3 },
    );
    const newsRow = result.find((s) => s.signalType === "urgent_news");
    expect(newsRow!.accuracy).toEqual({ accuracy_rate: 0.37, sample_count: 8 });
  });

  it("attaches accuracy with null accuracy_rate when sample_count < 3", () => {
    const result = parseAccuracyFromResponse(
      { signals: baseSignals, accuracy: accuracyMap, code: "VCB", count: 3 },
    );
    const bctcRow = result.find((s) => s.signalType === "fundamental_validation");
    expect(bctcRow!.accuracy).toEqual({ accuracy_rate: null, sample_count: 1 });
  });

  it("leaves accuracy undefined when no match in accuracy map", () => {
    const result = parseAccuracyFromResponse(
      { signals: baseSignals, accuracy: accuracyMap, code: "VCB", count: 3 },
    );
    // All three signal types exist in the map — inject an unmatched one
    const noMatchSignals = [
      {
        id: 4,
        stock_code: "VCB",
        signal_type: "price_anomaly",
        direction: "BULLISH",
        confidence_score: 60,
        detail: "breakout",
        created_at: "2026-05-17 07:00:00",
      },
    ];
    const noMatchResult = parseAccuracyFromResponse(
      { signals: noMatchSignals, accuracy: accuracyMap, code: "VCB", count: 1 },
    );
    expect(noMatchResult[0].accuracy).toBeUndefined();
  });

  it("leaves accuracy undefined on all signals when accuracy field is absent", () => {
    // This is the Sprint B not yet deployed case
    const result = parseAccuracyFromResponse(
      { signals: baseSignals, code: "VCB", count: 3 },
    );
    for (const sig of result) {
      expect(sig.accuracy).toBeUndefined();
    }
  });

  it("returns empty array for empty signals list", () => {
    const result = parseAccuracyFromResponse(
      { signals: [], accuracy: {}, code: "VCB", count: 0 },
    );
    expect(result).toHaveLength(0);
  });

  it("handles non-object accuracy field gracefully (treats as absent)", () => {
    const badInput: Record<string, unknown> = { signals: baseSignals, accuracy: "bad", code: "VCB", count: 3 };
    const result = parseAccuracyFromResponse(badInput);
    for (const sig of result) {
      expect(sig.accuracy).toBeUndefined();
    }
  });
});

// ─── 2. Accuracy absent → signal unchanged ────────────────────────────────────

describe("parseAccuracyFromResponse — accuracy field absent", () => {
  const rawSignal = {
    id: 10,
    stock_code: "HPG",
    signal_type: "chain_catalyst",
    direction: "BULLISH",
    confidence_score: 80,
    detail: "steel demand",
    created_at: "2026-05-17 11:00:00",
  };

  it("returns signal with all base fields intact when accuracy absent", () => {
    const [sig] = parseAccuracyFromResponse({ signals: [rawSignal], code: "HPG", count: 1 });
    expect(sig.id).toBe(10);
    expect(sig.stockCode).toBe("HPG");
    expect(sig.signalType).toBe("chain_catalyst");
    expect(sig.confidence).toBe(0.8);   // normalised from 80
    expect(sig.accuracy).toBeUndefined();
  });
});

// ─── 3. Badge threshold helper ────────────────────────────────────────────────

describe("accuracyBadgeProps", () => {
  it("returns green for accuracy_rate >= 0.70 with sufficient samples", () => {
    const badge = accuracyBadgeProps({ accuracy_rate: 0.70, sample_count: 10 });
    expect(badge.color).toBe("green");
    expect(badge.label).toMatch(/70/);
  });

  it("returns green for accuracy_rate > 0.70", () => {
    const badge = accuracyBadgeProps({ accuracy_rate: 0.85, sample_count: 5 });
    expect(badge.color).toBe("green");
    expect(badge.label).toMatch(/85/);
  });

  it("returns amber for accuracy_rate 0.40–0.69", () => {
    const badge = accuracyBadgeProps({ accuracy_rate: 0.55, sample_count: 7 });
    expect(badge.color).toBe("amber");
    expect(badge.label).toMatch(/55/);
  });

  it("returns amber for accuracy_rate exactly 0.40", () => {
    const badge = accuracyBadgeProps({ accuracy_rate: 0.40, sample_count: 4 });
    expect(badge.color).toBe("amber");
  });

  it("returns red for accuracy_rate < 0.40", () => {
    const badge = accuracyBadgeProps({ accuracy_rate: 0.37, sample_count: 8 });
    expect(badge.color).toBe("red");
    expect(badge.label).toMatch(/Low/i);
  });

  it("returns red for accuracy_rate = 0", () => {
    const badge = accuracyBadgeProps({ accuracy_rate: 0, sample_count: 5 });
    expect(badge.color).toBe("red");
  });

  it("returns grey 'New' for sample_count < 3 regardless of rate", () => {
    const badge = accuracyBadgeProps({ accuracy_rate: 0.9, sample_count: 2 });
    expect(badge.color).toBe("grey");
    expect(badge.label).toMatch(/New/i);
  });

  it("returns grey 'New' for sample_count = 0", () => {
    const badge = accuracyBadgeProps({ accuracy_rate: null, sample_count: 0 });
    expect(badge.color).toBe("grey");
    expect(badge.label).toMatch(/New/i);
  });

  it("returns grey 'New' for null accuracy_rate with sample_count < 3", () => {
    const badge = accuracyBadgeProps({ accuracy_rate: null, sample_count: 1 });
    expect(badge.color).toBe("grey");
    expect(badge.label).toMatch(/New/i);
  });
});

// ─── 4. fetchStockSignals — graceful fallback when accuracy absent ─────────────

describe("fetchStockSignals — endpoint missing accuracy field", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns signals without accuracy field when endpoint returns no accuracy map", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        signals: [
          {
            id: 1,
            stock_code: "VCB",
            signal_type: "chain_catalyst",
            direction: "BULLISH",
            confidence_score: 70,
            detail: "test",
            created_at: "2026-05-17 10:00:00",
          },
        ],
        code: "VCB",
        count: 1,
        // No accuracy field — Sprint B not yet deployed
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { fetchStockSignals } = await import("~/lib/api/client");
    const signals = await fetchStockSignals("VCB", 10);

    expect(signals).toHaveLength(1);
    expect(signals[0].accuracy).toBeUndefined();
    expect(signals[0].signalType).toBe("chain_catalyst");
  });

  it("attaches accuracy when Sprint B accuracy field is present in response", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        signals: [
          {
            id: 2,
            stock_code: "VCB",
            signal_type: "urgent_news",
            direction: "BEARISH",
            confidence_score: 50,
            detail: "rate hike",
            created_at: "2026-05-17 09:00:00",
          },
        ],
        accuracy: {
          urgent_news: { accuracy_rate: 0.62, sample_count: 5 },
        },
        code: "VCB",
        count: 1,
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { fetchStockSignals } = await import("~/lib/api/client");
    const signals = await fetchStockSignals("VCB", 10);

    expect(signals[0].accuracy).toEqual({ accuracy_rate: 0.62, sample_count: 5 });
  });
});
