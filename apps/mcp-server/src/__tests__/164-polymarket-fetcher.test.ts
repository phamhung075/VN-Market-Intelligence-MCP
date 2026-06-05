/**
 * Task 164 — Polymarket REST Fetcher
 *
 * Tests for fetchPolymarkets() in src/infrastructure/fetchers/polymarket.ts.
 *
 * All HTTP calls are mocked via injected fetchFn — no real network traffic.
 * DB tests use an in-memory SQLite via DB_PATH=:memory:.
 */

// Must be set BEFORE importing schema module so the module-level DB_PATH picks it up.
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import {
  fetchPolymarkets,
  storePolymarketSnapshot,
  type PolyFetchFn,
} from "../infrastructure/fetchers/polymarket.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import type { PredictionMarketsConfig } from "../infrastructure/config.js";

// ---------------------------------------------------------------------------
// Test config
// ---------------------------------------------------------------------------

const BASE_CONFIG: PredictionMarketsConfig = {
  enabled: true,
  pollingIntervalMinutes: 30,
  clobApiUrl: "https://clob.polymarket.com",
  gammaApiUrl: "https://gamma-api.polymarket.com",
  probabilityShiftPct: 5,
  volumeSpikeThresholdUsd: 50000,
  minUniqueWallets: 10,
  whaleTradeThresholdUsd: 10000,
  maxMarketsPerPoll: 50,
  rateLimitDelayMs: 0, // no delay in tests
  relevantKeywords: ["fed", "interest rate", "vietnam", "china", "oil"],
  curatedMarketIds: [],
  staleThresholdHours: 24,
};

// ---------------------------------------------------------------------------
// Mock response builders
// ---------------------------------------------------------------------------

/** Builds a minimal CLOB API response body with one or more markets. */
function buildClobResponse(
  items: Array<{
    condition_id: string;
    question: string;
    end_date_iso?: string;
    tokens?: Array<{ outcome: "Yes" | "No"; price: number }>;
    volume?: number;
    volume_24h?: number;
  }>,
): string {
  return JSON.stringify(
    items.map((item) => ({
      condition_id: item.condition_id,
      question: item.question,
      end_date_iso: item.end_date_iso ?? "2026-06-30T00:00:00Z",
      tokens: item.tokens ?? [
        { outcome: "Yes", price: 0.65 },
        { outcome: "No", price: 0.35 },
      ],
      volume: item.volume ?? 1000000,
      volume_24h: item.volume_24h ?? 50000,
    })),
  );
}

/** Builds a minimal Gamma API response body. */
function buildGammaResponse(
  items: Array<{
    id: string;
    conditionId?: string;
    uniqueWalletsCount?: number;
    tags?: Array<{ id: number; label: string }>;
    liquidity?: number;
    lastTradePrice?: number;
  }>,
): string {
  return JSON.stringify(
    items.map((item) => ({
      id: item.id,
      conditionId: item.conditionId ?? item.id,
      uniqueWalletsCount: item.uniqueWalletsCount ?? 150,
      tags: item.tags ?? [{ id: 1, label: "finance" }],
      liquidity: item.liquidity ?? 25000,
      lastTradePrice: item.lastTradePrice ?? 0.65,
    })),
  );
}

/**
 * Creates a mock PolyFetchFn that routes requests by URL prefix.
 * - CLOB URL → returns clobBody
 * - Gamma URL → returns gammaBody
 */
function mockFetch(clobBody: string, gammaBody: string): PolyFetchFn {
  return async (url: string): Promise<string> => {
    if (url.includes("clob.polymarket.com") || url.includes("clob-api.polymarket.com")) {
      return clobBody;
    }
    if (url.includes("gamma-api.polymarket.com")) {
      return gammaBody;
    }
    throw new Error(`Unexpected URL in test: ${url}`);
  };
}

/** A fetchFn that always throws a network error. */
function failingFetch(): PolyFetchFn {
  return async (_url: string): Promise<string> => {
    throw new Error("Network timeout");
  };
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Reset any previous singleton (e.g. from another test file in the same process)
  closeDb();
  await initDatabase();
});

afterAll(() => {
  closeDb();
});

// ---------------------------------------------------------------------------
// Suite 1 — Happy path: CLOB + Gamma enrichment
// ---------------------------------------------------------------------------

describe("Task 164 — fetchPolymarkets — happy path", () => {
  it("returns a PredictionMarket for each relevant CLOB market", async () => {
    const clob = buildClobResponse([
      {
        condition_id: "cond-001",
        question: "Will the Fed cut interest rates in June 2026?",
        tokens: [
          { outcome: "Yes", price: 0.72 },
          { outcome: "No", price: 0.28 },
        ],
        volume: 2000000,
        volume_24h: 80000,
      },
    ]);
    const gamma = buildGammaResponse([
      {
        id: "cond-001",
        uniqueWalletsCount: 300,
        tags: [{ id: 1, label: "fed" }, { id: 2, label: "rates" }],
        liquidity: 50000,
        lastTradePrice: 0.71,
      },
    ]);

    const results = await fetchPolymarkets(BASE_CONFIG, mockFetch(clob, gamma));

    expect(results).toHaveLength(1);
    const market = results[0]!;
    expect(market.id).toBe("cond-001");
    expect(market.question).toContain("Fed");
    expect(market.yesPrice).toBeCloseTo(0.72, 2);
    expect(market.noPrice).toBeCloseTo(0.28, 2);
    expect(market.volume24h).toBe(80000);
    expect(market.volumeTotal).toBe(2000000);
    expect(market.uniqueWalletsCount).toBe(300);
    expect(market.liquidity).toBe(50000);
    expect(market.lastTradePrice).toBeCloseTo(0.71, 2);
    expect(Array.isArray(market.tags)).toBe(true);
    expect(market.tags.length).toBeGreaterThan(0);
    expect(market.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("enriches with Gamma data — tags as string labels", async () => {
    const clob = buildClobResponse([
      {
        condition_id: "cond-002",
        question: "Will Vietnam GDP grow above 6% in 2026?",
      },
    ]);
    const gamma = buildGammaResponse([
      {
        id: "cond-002",
        tags: [{ id: 5, label: "vietnam" }, { id: 6, label: "gdp" }],
        uniqueWalletsCount: 50,
        liquidity: 12000,
        lastTradePrice: 0.60,
      },
    ]);

    const results = await fetchPolymarkets(BASE_CONFIG, mockFetch(clob, gamma));
    expect(results[0]!.tags).toEqual(expect.arrayContaining(["vietnam", "gdp"]));
  });

  it("falls back gracefully when Gamma has no matching entry", async () => {
    const clob = buildClobResponse([
      {
        condition_id: "cond-003",
        question: "Will China impose new tariffs on Vietnam in 2026?",
      },
    ]);
    // Gamma returns empty array — no enrichment data
    const gamma = JSON.stringify([]);

    const results = await fetchPolymarkets(BASE_CONFIG, mockFetch(clob, gamma));
    expect(results).toHaveLength(1);
    expect(results[0]!.uniqueWalletsCount).toBe(0);
    expect(results[0]!.tags).toEqual([]);
    expect(results[0]!.liquidity).toBe(0);
    // lastTradePrice defaults to yesPrice when Gamma missing
    expect(results[0]!.lastTradePrice).toBeCloseTo(results[0]!.yesPrice, 2);
  });

  it("handles Gamma tags as plain string array", async () => {
    const clob = buildClobResponse([
      {
        condition_id: "cond-004",
        question: "Will oil prices exceed $100 per barrel in 2026?",
      },
    ]);
    const gamma = JSON.stringify([
      {
        id: "cond-004",
        tags: ["oil", "energy", "opec"],
        uniqueWalletsCount: 80,
        liquidity: 15000,
        lastTradePrice: 0.40,
      },
    ]);

    const results = await fetchPolymarkets(BASE_CONFIG, mockFetch(clob, gamma));
    expect(results[0]!.tags).toEqual(expect.arrayContaining(["oil", "energy", "opec"]));
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — Keyword + curated ID filtering
// ---------------------------------------------------------------------------

describe("Task 164 — fetchPolymarkets — relevance filtering", () => {
  it("excludes markets that match no keyword and are not curated", async () => {
    const clob = buildClobResponse([
      {
        condition_id: "cond-sport",
        question: "Will Brazil win the FIFA World Cup 2026?",
      },
    ]);
    const gamma = buildGammaResponse([{ id: "cond-sport" }]);

    const results = await fetchPolymarkets(BASE_CONFIG, mockFetch(clob, gamma));
    expect(results).toHaveLength(0);
  });

  it("includes curated market IDs regardless of keywords", async () => {
    const configWithCurated: PredictionMarketsConfig = {
      ...BASE_CONFIG,
      curatedMarketIds: ["cond-curated"],
    };
    const clob = buildClobResponse([
      {
        condition_id: "cond-curated",
        question: "Will the Dolphins win the Super Bowl 2027?",
      },
    ]);
    const gamma = buildGammaResponse([{ id: "cond-curated" }]);

    const results = await fetchPolymarkets(configWithCurated, mockFetch(clob, gamma));
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe("cond-curated");
  });

  it("includes market with keyword match (case-insensitive)", async () => {
    const clob = buildClobResponse([
      {
        condition_id: "cond-fed",
        question: "Will the FED pause rate hikes?",
      },
    ]);
    const gamma = buildGammaResponse([{ id: "cond-fed" }]);

    const results = await fetchPolymarkets(BASE_CONFIG, mockFetch(clob, gamma));
    expect(results).toHaveLength(1);
  });

  it("returns empty array when CLOB returns empty list", async () => {
    const clob = JSON.stringify([]);
    const gamma = JSON.stringify([]);

    const results = await fetchPolymarkets(BASE_CONFIG, mockFetch(clob, gamma));
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — Resilience
// ---------------------------------------------------------------------------

describe("Task 164 — fetchPolymarkets — resilience", () => {
  it("returns empty array (never throws) when CLOB call fails", async () => {
    const results = await fetchPolymarkets(BASE_CONFIG, failingFetch());
    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(0);
  });

  it("continues with empty enrichment when Gamma call fails", async () => {
    // fetchFn succeeds on CLOB but fails on Gamma
    const clobBody = buildClobResponse([
      {
        condition_id: "cond-005",
        question: "Will China GDP slow below 4% in 2026?",
      },
    ]);
    const partialFetch: PolyFetchFn = async (url: string): Promise<string> => {
      if (url.includes("clob") || url.includes("clob-api")) return clobBody;
      throw new Error("Gamma timeout");
    };

    const results = await fetchPolymarkets(BASE_CONFIG, partialFetch);
    // Should return the CLOB market with default Gamma values
    expect(results).toHaveLength(1);
    expect(results[0]!.uniqueWalletsCount).toBe(0);
  });

  it("returns empty array when CLOB returns malformed JSON", async () => {
    const badFetch: PolyFetchFn = async (_url: string): Promise<string> => "not json";
    const results = await fetchPolymarkets(BASE_CONFIG, badFetch);
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — price extraction
// ---------------------------------------------------------------------------

describe("Task 164 — fetchPolymarkets — price extraction", () => {
  it("extracts yesPrice from Yes token", async () => {
    const clob = buildClobResponse([
      {
        condition_id: "price-test",
        question: "Will Vietnam join the Fed?",
        tokens: [
          { outcome: "Yes", price: 0.83 },
          { outcome: "No", price: 0.17 },
        ],
      },
    ]);
    const gamma = buildGammaResponse([{ id: "price-test" }]);

    const results = await fetchPolymarkets(BASE_CONFIG, mockFetch(clob, gamma));
    expect(results[0]!.yesPrice).toBeCloseTo(0.83, 2);
    expect(results[0]!.noPrice).toBeCloseTo(0.17, 2);
  });

  // FDA-1 regression: CLOB market with empty tokens array must be EXCLUDED,
  // not served as a fabricated 0.5 / 0.5 coin-flip.
  it("FDA-1: CLOB market with empty tokens is excluded, not served as 0.5", async () => {
    const clob = JSON.stringify([
      {
        condition_id: "no-tokens",
        question: "Will the Fed raise interest rates?",
        end_date_iso: "2026-12-31T00:00:00Z",
        tokens: [],
        volume: 500000,
        volume_24h: 20000,
      },
    ]);
    // Gamma also has no outcomePrices for this market
    const gamma = buildGammaResponse([{ id: "no-tokens" }]);

    const results = await fetchPolymarkets(BASE_CONFIG, mockFetch(clob, gamma));
    // Market must be excluded entirely — no fabricated 0.5 served
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 5 — storePolymarketSnapshot (SQLite persistence)
// ---------------------------------------------------------------------------

describe("Task 164 — storePolymarketSnapshot — SQLite persistence", () => {
  it("inserts a market into prediction_markets table", async () => {
    const market = {
      id: "store-test-001",
      question: "Will the Fed cut interest rates in Q3 2026?",
      endDate: "2026-09-30T00:00:00Z",
      yesPrice: 0.68,
      noPrice: 0.32,
      volume24h: 75000,
      volumeTotal: 3000000,
      liquidity: 40000,
      lastTradePrice: 0.67,
      uniqueWalletsCount: 200,
      tags: ["fed", "rates"],
      fetchedAt: new Date().toISOString(),
    };

    await storePolymarketSnapshot([market]);

    const db = getDb();
    const row = db.prepare("SELECT * FROM prediction_markets WHERE id = ?").get("store-test-001") as Record<string, unknown> | null;
    expect(row).not.toBeNull();
    expect(row!["question"]).toBe(market.question);
    expect(row!["yes_price"] as number).toBeCloseTo(0.68, 2);
    expect(row!["unique_wallets"] as number).toBe(200);
    expect(row!["tags"]).toBe('["fed","rates"]');
  });

  it("upserts — overwrites on conflict", async () => {
    const market = {
      id: "store-test-002",
      question: "Will China tariff Vietnamese goods in 2026?",
      endDate: "2026-12-31T00:00:00Z",
      yesPrice: 0.40,
      noPrice: 0.60,
      volume24h: 10000,
      volumeTotal: 500000,
      liquidity: 5000,
      lastTradePrice: 0.40,
      uniqueWalletsCount: 30,
      tags: ["china", "trade"],
      fetchedAt: new Date().toISOString(),
    };

    await storePolymarketSnapshot([market]);

    // Update the same market
    const updated = { ...market, yesPrice: 0.55, noPrice: 0.45 };
    await storePolymarketSnapshot([updated]);

    const db = getDb();
    const rows = db.prepare("SELECT * FROM prediction_markets WHERE id = ?").all("store-test-002") as Record<string, unknown>[];
    // Should still be exactly one row (upsert, not duplicate)
    expect(rows).toHaveLength(1);
    expect((rows[0]!["yes_price"] as number)).toBeCloseTo(0.55, 2);
  });

  it("handles empty array gracefully", async () => {
    await expect(storePolymarketSnapshot([])).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Suite 6 — FDA-1 regression: no fabricated 0.5 probabilities
// ---------------------------------------------------------------------------

describe("FDA-1 — no fabricated 0.5 probability on unparseable prices", () => {
  /**
   * Helper: builds a Gamma-only response (CLOB returns empty) so the Gamma-
   * primary path is exercised for price parsing. Gamma items must have volume
   * and active=true to pass all other filters.
   */
  function gammaOnlyFetch(gammaItems: unknown[]): PolyFetchFn {
    return async (url: string): Promise<string> => {
      if (url.includes("clob.polymarket.com") || url.includes("clob-api.polymarket.com")) {
        return JSON.stringify([]); // CLOB empty → triggers Gamma-primary path
      }
      if (url.includes("gamma-api.polymarket.com")) {
        return JSON.stringify(gammaItems);
      }
      throw new Error(`Unexpected URL: ${url}`);
    };
  }

  it("FDA-1-A: Gamma market with missing outcomePrices is excluded (not served as 0.5)", async () => {
    const items = [
      {
        id: "fda1-no-price",
        conditionId: "fda1-no-price",
        question: "Will the Fed cut interest rates in 2026?",
        active: true,
        closed: false,
        endDate: "2027-01-01T00:00:00Z",
        volume: 100000,
        volume24hr: 5000,
        liquidity: 8000,
        // outcomePrices intentionally absent
      },
    ];

    const results = await fetchPolymarkets(BASE_CONFIG, gammaOnlyFetch(items));
    // Must be excluded — no fabricated 0.5
    expect(results).toHaveLength(0);
    const any50 = results.some((m) => m.yesPrice === 0.5 || m.noPrice === 0.5);
    expect(any50).toBe(false);
  });

  it("FDA-1-B: Gamma market with malformed outcomePrices string is excluded (not served as 0.5)", async () => {
    const items = [
      {
        id: "fda1-bad-json",
        conditionId: "fda1-bad-json",
        question: "Will Vietnam GDP exceed 6% in 2026?",
        active: true,
        closed: false,
        endDate: "2027-01-01T00:00:00Z",
        volume: 200000,
        volume24hr: 10000,
        liquidity: 12000,
        outcomePrices: "not-valid-json",
      },
    ];

    const results = await fetchPolymarkets(BASE_CONFIG, gammaOnlyFetch(items));
    expect(results).toHaveLength(0);
    const any50 = results.some((m) => m.yesPrice === 0.5 || m.noPrice === 0.5);
    expect(any50).toBe(false);
  });

  it("FDA-1-C: Gamma market with empty outcomePrices array is excluded (not served as 0.5)", async () => {
    const items = [
      {
        id: "fda1-empty-arr",
        conditionId: "fda1-empty-arr",
        question: "Will China impose oil sanctions in 2026?",
        active: true,
        closed: false,
        endDate: "2027-01-01T00:00:00Z",
        volume: 300000,
        volume24hr: 15000,
        liquidity: 20000,
        outcomePrices: "[]", // valid JSON but empty → no prices
      },
    ];

    const results = await fetchPolymarkets(BASE_CONFIG, gammaOnlyFetch(items));
    expect(results).toHaveLength(0);
    const any50 = results.some((m) => m.yesPrice === 0.5 || m.noPrice === 0.5);
    expect(any50).toBe(false);
  });

  it("FDA-1-D: Gamma market with valid outcomePrices is included with real prices", async () => {
    const items = [
      {
        id: "fda1-valid-price",
        conditionId: "fda1-valid-price",
        question: "Will the Fed cut interest rates in Q3 2026?",
        active: true,
        closed: false,
        endDate: "2027-01-01T00:00:00Z",
        volume: 500000,
        volume24hr: 25000,
        liquidity: 30000,
        outcomePrices: '["0.72","0.28"]',
      },
    ];

    const results = await fetchPolymarkets(BASE_CONFIG, gammaOnlyFetch(items));
    expect(results).toHaveLength(1);
    expect(results[0]!.yesPrice).toBeCloseTo(0.72, 2);
    expect(results[0]!.noPrice).toBeCloseTo(0.28, 2);
  });

  it("FDA-1-E: CLOB market with only one token (no No token) is excluded (not served as 0.5)", async () => {
    // This exercises the extractPrices() null path for a missing No token
    const clob = JSON.stringify([
      {
        condition_id: "fda1-one-token",
        question: "Will the Fed raise interest rates?",
        end_date_iso: "2027-01-01T00:00:00Z",
        tokens: [{ outcome: "Yes", price: 0.65 }], // No token missing
        volume: 400000,
        volume_24h: 20000,
      },
    ]);
    const gamma = buildGammaResponse([{ id: "fda1-one-token" }]);

    const results = await fetchPolymarkets(BASE_CONFIG, mockFetch(clob, gamma));
    // Market must be excluded — no fabricated 0.5 noPrice
    expect(results).toHaveLength(0);
    const any50 = results.some((m) => m.yesPrice === 0.5 || m.noPrice === 0.5);
    expect(any50).toBe(false);
  });
});
