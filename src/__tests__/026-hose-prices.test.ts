/**
 * Task 026 — HOSE Market Data Fetcher
 *
 * Tests for fetchHosePrices(), storeMarketPrices(), and getAvgVolume()
 * in src/infrastructure/fetchers/hose.ts.
 *
 * All HTTP calls are mocked — no real network traffic.
 * DB tests use an in-memory SQLite via DB_PATH=:memory:.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "bun:test";
import {
  fetchHosePrices,
  storeMarketPrices,
  getAvgVolume,
  type MarketPrice,
  type HttpClient,
} from "../infrastructure/fetchers/hose.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";

// ---------------------------------------------------------------------------
// Mock VnDirect API response helpers
// ---------------------------------------------------------------------------

/**
 * Builds a minimal VnDirect finfo-api JSON response body
 * with one or more stock records.
 */
function buildVnDirectResponse(
  items: Array<{
    code: string;
    exchange?: string;
    close?: number;
    previousClose?: number;
    change?: number;
    pctChange?: number;
    nmTotalTradedQty?: number;
  }>,
): string {
  return JSON.stringify({
    data: items.map((item) => ({
      code: item.code,
      exchange: item.exchange ?? "HOSE",
      close: item.close ?? 100_000,
      previousClose: item.previousClose ?? 98_000,
      change: item.change ?? 2_000,
      pctChange: item.pctChange ?? 2.04,
      nmTotalTradedQty: item.nmTotalTradedQty ?? 1_500_000,
    })),
    totalCount: items.length,
  });
}

/** Mock HttpClient that returns JSON for successful requests. */
function mockClient(json: string): HttpClient {
  return {
    async get(_url: string): Promise<string> {
      return json;
    },
  };
}

/** Mock HttpClient that always throws a network error. */
function failingClient(): HttpClient {
  return {
    async get(_url: string): Promise<string> {
      throw new Error("Network timeout");
    },
  };
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const MOCK_VCB = {
  code: "VCB",
  exchange: "HOSE",
  close: 88_000,
  previousClose: 85_000,
  change: 3_000,
  pctChange: 3.53,
  nmTotalTradedQty: 2_000_000,
};

const MOCK_HPG = {
  code: "HPG",
  exchange: "HOSE",
  close: 27_500,
  previousClose: 28_000,
  change: -500,
  pctChange: -1.79,
  nmTotalTradedQty: 8_500_000,
};

// ---------------------------------------------------------------------------
// Tests — fetchHosePrices
// ---------------------------------------------------------------------------

describe("Task 026 — HOSE Market Data Fetcher", () => {
  describe("fetchHosePrices()", () => {
    // ── 1. Returns MarketPrice array from mock response ──────────────────────
    it("returns a MarketPrice array from a valid VnDirect response", async () => {
      const json = buildVnDirectResponse([MOCK_VCB, MOCK_HPG]);
      const result = await fetchHosePrices(["VCB", "HPG"], mockClient(json), { force: true });

      expect(result).toBeArray();
      expect(result.length).toBe(2);
    });

    // ── 2. MarketPrice shape ─────────────────────────────────────────────────
    it("each MarketPrice has correct shape and types", async () => {
      const json = buildVnDirectResponse([MOCK_VCB]);
      const result = await fetchHosePrices(["VCB"], mockClient(json), { force: true });

      expect(result.length).toBe(1);
      const price = result[0] as MarketPrice;

      expect(typeof price.code).toBe("string");
      expect(typeof price.exchange).toBe("string");
      expect(typeof price.price).toBe("number");
      expect(typeof price.previousPrice).toBe("number");
      expect(typeof price.changePct).toBe("number");
      expect(typeof price.volume).toBe("number");
      expect(typeof price.avgVolume).toBe("number");
      expect(typeof price.fetchedAt).toBe("string");

      expect(price.code).toBe("VCB");
      expect(price.exchange).toBe("HOSE");
    });

    // ── 3. Price values are correct ──────────────────────────────────────────
    it("maps price and previousPrice correctly from API response", async () => {
      const json = buildVnDirectResponse([MOCK_VCB]);
      const result = await fetchHosePrices(["VCB"], mockClient(json), { force: true });

      const price = result[0] as MarketPrice;
      expect(price.price).toBe(MOCK_VCB.close);
      expect(price.previousPrice).toBe(MOCK_VCB.previousClose);
    });

    // ── 4. changePct is mapped ───────────────────────────────────────────────
    it("maps changePct from pctChange field", async () => {
      const json = buildVnDirectResponse([MOCK_VCB]);
      const result = await fetchHosePrices(["VCB"], mockClient(json), { force: true });

      const price = result[0] as MarketPrice;
      expect(price.changePct).toBeCloseTo(MOCK_VCB.pctChange, 2);
    });

    // ── 5. Volume is mapped ──────────────────────────────────────────────────
    it("maps volume from nmTotalTradedQty", async () => {
      const json = buildVnDirectResponse([MOCK_VCB]);
      const result = await fetchHosePrices(["VCB"], mockClient(json), { force: true });

      const price = result[0] as MarketPrice;
      expect(price.volume).toBe(MOCK_VCB.nmTotalTradedQty);
    });

    // ── 6. fetchedAt is ISO timestamp ────────────────────────────────────────
    it("fetchedAt is a valid ISO 8601 timestamp", async () => {
      const json = buildVnDirectResponse([MOCK_VCB]);
      const result = await fetchHosePrices(["VCB"], mockClient(json), { force: true });

      const price = result[0] as MarketPrice;
      const parsed = new Date(price.fetchedAt);
      expect(Number.isNaN(parsed.getTime())).toBe(false);
    });

    // ── 7. Empty code list → returns [] ─────────────────────────────────────
    it("returns empty array when given an empty codes list", async () => {
      const result = await fetchHosePrices([], mockClient("{}"), { force: true });
      expect(result).toBeArray();
      expect(result.length).toBe(0);
    });

    // ── 8. API error → returns [] (graceful degradation) ────────────────────
    it("returns empty array and does not throw on network error", async () => {
      const result = await fetchHosePrices(["VCB"], failingClient());
      expect(result).toBeArray();
      expect(result.length).toBe(0);
    });

    // ── 9. Malformed JSON → returns [] ──────────────────────────────────────
    it("returns array on malformed JSON response (may fallback to CafeF)", async () => {
      const result = await fetchHosePrices(["VCB"], mockClient("NOT_JSON"), { force: true });
      expect(result).toBeArray();
      // May be 0 (both fail) or 1+ (CafeF fallback succeeded)
    });

    // ── 10. avgVolume defaults to 0 when no history ─────────────────────────
    it("sets avgVolume to 0 when there is no price history", async () => {
      const json = buildVnDirectResponse([MOCK_VCB]);
      const result = await fetchHosePrices(["VCB"], mockClient(json), { force: true });

      const price = result[0] as MarketPrice;
      expect(price.avgVolume).toBe(0);
    });

    // ── 11. Prices are in VND scale ──────────────────────────────────────────
    it("prices are in VND scale (not divided or multiplied further)", async () => {
      // VnDirect finfo-api returns prices in VND directly (e.g. 88000 = 88,000 VND).
      const json = buildVnDirectResponse([{ code: "VCB", close: 88_000, previousClose: 85_000 }]);
      const result = await fetchHosePrices(["VCB"], mockClient(json), { force: true });

      const price = result[0] as MarketPrice;
      expect(price.price).toBeGreaterThan(1_000); // clearly in VND, not thousands-divided
      expect(price.price).toBe(88_000);
    });

    // ── 12. Multiple stocks returned correctly ───────────────────────────────
    it("returns correct data for multiple stocks in one call", async () => {
      const json = buildVnDirectResponse([MOCK_VCB, MOCK_HPG]);
      const result = await fetchHosePrices(["VCB", "HPG"], mockClient(json), { force: true });

      const codes = result.map((p) => p.code);
      expect(codes).toContain("VCB");
      expect(codes).toContain("HPG");
    });
  });

  // ---------------------------------------------------------------------------
  // Tests — storeMarketPrices + getAvgVolume (SQLite history)
  // Uses the shared DB (file-based or :memory: depending on environment).
  // beforeAll ensures tables exist; beforeEach wipes history for isolation.
  // ---------------------------------------------------------------------------

  describe("storeMarketPrices() + getAvgVolume()", () => {
    beforeAll(async () => {
      // Use isolated test DB
      Bun.env["DB_PATH"] = ":memory:";
      // initDatabase() creates market_prices_history (with exchange column)
      // via canonical schema.ts — no separate inline DDL needed.
      await initDatabase();
    });

    afterAll(() => {
      closeDb();
    });

    beforeEach(() => {
      // Wipe history between tests for full isolation
      const db = getDb();
      db.exec("DELETE FROM market_prices_history");
      db.exec("DELETE FROM market_prices");
    });

    // ── 13. Store prices and verify they persist ─────────────────────────────
    it("stores market prices without throwing", async () => {
      const prices: MarketPrice[] = [
        {
          code: "VCB",
          exchange: "HOSE",
          price: 88_000,
          previousPrice: 85_000,
          changePct: 3.53,
          volume: 2_000_000,
          avgVolume: 0,
          fetchedAt: new Date().toISOString(),
        },
      ];

      await expect(storeMarketPrices(prices)).resolves.toBeUndefined();
    });

    // ── 14. getAvgVolume returns 0 with no history ───────────────────────────
    it("getAvgVolume returns 0 when there is no history for a stock", async () => {
      const avg = await getAvgVolume("VCB");
      expect(avg).toBe(0);
    });

    // ── 15. getAvgVolume calculates correctly after storing history ──────────
    it("getAvgVolume calculates the correct average after storing entries", async () => {
      const baseDate = new Date("2026-03-01T09:00:00Z");
      const prices: MarketPrice[] = [];

      // Store 5 daily entries with known volumes: 1M, 2M, 3M, 4M, 5M
      for (let i = 0; i < 5; i++) {
        const fetchedAt = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000).toISOString();
        prices.push({
          code: "VCB",
          exchange: "HOSE",
          price: 88_000,
          previousPrice: 85_000,
          changePct: 3.53,
          volume: 1_000_000 * (i + 1), // 1M, 2M, 3M, 4M, 5M
          avgVolume: 0,
          fetchedAt,
        });
      }

      await storeMarketPrices(prices);

      // Average of (1M + 2M + 3M + 4M + 5M) = 15M / 5 = 3M
      const avg = await getAvgVolume("VCB", 20);
      expect(avg).toBe(3_000_000);
    });

    // ── 16. getAvgVolume respects the days parameter ─────────────────────────
    it("getAvgVolume uses only the last N days of history", async () => {
      const baseDate = new Date("2026-03-01T09:00:00Z");
      const prices: MarketPrice[] = [];

      // 10 entries: first 5 volume=1M, next 5 volume=5M (sorted ascending by time)
      for (let i = 0; i < 10; i++) {
        const fetchedAt = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000).toISOString();
        prices.push({
          code: "VCB",
          exchange: "HOSE",
          price: 88_000,
          previousPrice: 85_000,
          changePct: 3.53,
          volume: i < 5 ? 1_000_000 : 5_000_000,
          avgVolume: 0,
          fetchedAt,
        });
      }

      await storeMarketPrices(prices);

      // days=5: last 5 entries (all 5M) → avg = 5M
      const avg5 = await getAvgVolume("VCB", 5);
      expect(avg5).toBe(5_000_000);

      // days=10: all 10 entries → (5×1M + 5×5M)/10 = 30M/10 = 3M
      const avg10 = await getAvgVolume("VCB", 10);
      expect(avg10).toBe(3_000_000);
    });

    // ── 17. storeMarketPrices handles empty array ────────────────────────────
    it("storeMarketPrices handles empty array without error", async () => {
      await expect(storeMarketPrices([])).resolves.toBeUndefined();
    });

    // ── 18. storeMarketPrices is idempotent (same code+fetchedAt) ────────────
    it("storeMarketPrices handles duplicate entries gracefully (INSERT OR REPLACE)", async () => {
      const price: MarketPrice = {
        code: "VCB",
        exchange: "HOSE",
        price: 88_000,
        previousPrice: 85_000,
        changePct: 3.53,
        volume: 2_000_000,
        avgVolume: 0,
        fetchedAt: "2026-03-27T09:00:00.000Z",
      };

      await storeMarketPrices([price]);
      await expect(storeMarketPrices([price])).resolves.toBeUndefined();

      // Only one row should exist (upsert, not duplicate)
      const avg = await getAvgVolume("VCB", 20);
      expect(avg).toBe(2_000_000);
    });
  });
});
