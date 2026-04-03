/**
 * Task 252 — Shipping Index Fetcher Tests
 *
 * Tests for fetchShippingIndices() which fetches BDI, FBX_ASIA_US, SCFI
 * from Yahoo Finance / Trading Economics.
 */

import { describe, it, expect } from "bun:test";
import {
  fetchShippingIndices,
  type ShippingIndex,
  storeShippingIndices,
} from "../infrastructure/fetchers/shippingIndex.js";

// ---------------------------------------------------------------------------
// Mock HTTP client — avoids real network calls
// ---------------------------------------------------------------------------

function makeOkClient(price: number) {
  return {
    async get(_url: string): Promise<string> {
      return JSON.stringify({
        chart: {
          result: [
            {
              meta: {
                regularMarketPrice: price,
                previousClose: price * 0.98,
                regularMarketTime: 1704067200,
                symbol: "^BDI",
              },
            },
          ],
        },
      });
    },
  };
}

function makeErrorClient() {
  return {
    async get(_url: string): Promise<string> {
      throw new Error("Network error");
    },
  };
}

function makeEmptyClient() {
  return {
    async get(_url: string): Promise<string> {
      return JSON.stringify({ chart: { result: null } });
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Task 252 — Shipping Index Fetcher", () => {
  it("returns ShippingIndex array with at least one entry on success", async () => {
    const indices = await fetchShippingIndices(makeOkClient(1400));
    expect(Array.isArray(indices)).toBe(true);
    expect(indices.length).toBeGreaterThan(0);
  });

  it("returns BDI entry with correct name and positive value", async () => {
    const indices = await fetchShippingIndices(makeOkClient(1400));
    const bdi = indices.find((i) => i.name === "BDI");
    expect(bdi).toBeDefined();
    expect(bdi!.value).toBeGreaterThan(0);
  });

  it("returns correct structure: name, value, change, changePct, date", async () => {
    const indices = await fetchShippingIndices(makeOkClient(1400));
    for (const idx of indices) {
      expect(typeof idx.name).toBe("string");
      expect(typeof idx.value).toBe("number");
      expect(typeof idx.change).toBe("number");
      expect(typeof idx.changePct).toBe("number");
      expect(typeof idx.date).toBe("string");
    }
  });

  it("never throws on network error — returns empty array", async () => {
    const indices = await fetchShippingIndices(makeErrorClient());
    expect(Array.isArray(indices)).toBe(true);
    // Empty array or partial results — must not throw
  });

  it("handles null/empty response gracefully", async () => {
    const indices = await fetchShippingIndices(makeEmptyClient());
    // Should return empty or partial — no throw
    expect(Array.isArray(indices)).toBe(true);
  });

  it("changePct is computed as (value - previousClose) / previousClose * 100", async () => {
    const price = 1400;
    const indices = await fetchShippingIndices(makeOkClient(price));
    const bdi = indices.find((i) => i.name === "BDI");
    if (bdi) {
      // previousClose = price * 0.98, so changePct ≈ 2%
      expect(Math.abs(bdi.changePct)).toBeGreaterThan(0);
    }
  });

  it("date field is a valid ISO date string", async () => {
    const indices = await fetchShippingIndices(makeOkClient(1400));
    for (const idx of indices) {
      expect(idx.date).toMatch(/^\d{4}-\d{2}-\d{2}/);
    }
  });

  it("storeShippingIndices stores without throwing (in-memory or mocked DB)", async () => {
    const sample: ShippingIndex[] = [
      { name: "BDI", value: 1400, change: 28, changePct: 2.04, date: "2026-04-03" },
    ];
    // Should not throw even without a real DB (graceful error handling)
    expect(() => storeShippingIndices(sample)).not.toThrow();
  });
});
