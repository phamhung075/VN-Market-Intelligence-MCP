/**
 * Task 1397c — VN-Index Refresh Job Tests
 *
 * Covers runVnIndexRefreshJob() across 5 cases:
 *
 *   VIR-1: fetchVnIndex returns valid MarketPrice → storeMarketPrices called, stored=1
 *   VIR-2: fetchVnIndex returns null → storeMarketPrices NOT called, skipped=1
 *   VIR-3: fetchVnIndex throws → job resolves without throw, skipped=1
 *   VIR-4: storeMarketPrices called with correct payload (code="VNINDEX")
 *   VIR-5: storeMarketPrices call count = 0 when all codes skipped
 *
 * Mock strategy:
 *   - mock.module() is called ONCE at top level with mutable delegates.
 *   - Per-test behaviour is controlled by mutating _fetchVnIndexImpl and
 *     _storeMarketPricesImpl in beforeEach — no re-calling mock.module().
 *   - No DB interaction — storeMarketPrices is fully mocked throughout.
 *   - No real HTTP calls.
 *
 * Note: DB_PATH is set to :memory: by apps/mcp-server/src/__tests__/setup.ts
 *       preload (Bun.env). This file does not touch SQLite directly.
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { MarketPrice } from "../infrastructure/fetchers/hose.js";

// ─────────────────────────────────────────────────────────────────────────────
// Mutable delegate state
//
// mock.module() is called ONCE. Per-test control is achieved by swapping the
// delegate variables. This avoids re-calling mock.module() per test which can
// race with parallel worker imports in Bun 1.x.
// ─────────────────────────────────────────────────────────────────────────────

let _fetchVnIndexImpl: (code: string) => Promise<MarketPrice | null> =
  async (_code: string) => null;

let _storeMarketPricesImpl: (prices: MarketPrice[]) => Promise<void> =
  async (_prices: MarketPrice[]) => {};

// Capture calls so tests can assert on arguments and invocation count.
const _storeCalls: MarketPrice[][] = [];

mock.module("../infrastructure/fetchers/hose.js", () => ({
  fetchVnIndex: async (code: string) => _fetchVnIndexImpl(code),
  storeMarketPrices: async (prices: MarketPrice[]) => {
    _storeCalls.push(prices);
    return _storeMarketPricesImpl(prices);
  },
}));

// Import SUT AFTER mock.module() registration so Bun's module cache returns
// the mocked version to the job module.
const { runVnIndexRefreshJob } = await import(
  "../scheduler/market-data/vnIndexRefreshJob.js"
);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildMarketPrice(overrides: Partial<MarketPrice> = {}): MarketPrice {
  return {
    code: "VNINDEX",
    exchange: "HOSE",
    price: 1250.5,
    previousPrice: 1245.0,
    changePct: 0.42,
    volume: 500_000,
    avgVolume: 450_000,
    fetchedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1397c — runVnIndexRefreshJob", () => {
  beforeEach(() => {
    // Reset delegates to safe no-ops before each test.
    _fetchVnIndexImpl = async (_code: string) => null;
    _storeMarketPricesImpl = async (_prices: MarketPrice[]) => {};
    // Clear captured calls.
    _storeCalls.length = 0;
  });

  // ── VIR-1: Happy path ────────────────────────────────────────────────────

  it("VIR-1: fetchVnIndex returns valid data — storeMarketPrices called, result.stored=1", async () => {
    const price = buildMarketPrice();
    _fetchVnIndexImpl = async (_code: string) => price;

    const result = await runVnIndexRefreshJob();

    expect(result).toEqual({ fetched: 1, stored: 1, skipped: 0 });
    expect(_storeCalls).toHaveLength(1);
    expect(_storeCalls[0]).toEqual([price]);
  });

  // ── VIR-2: API returns null ──────────────────────────────────────────────

  it("VIR-2: fetchVnIndex returns null — storeMarketPrices NOT called, result.skipped=1", async () => {
    _fetchVnIndexImpl = async (_code: string) => null;

    const result = await runVnIndexRefreshJob();

    expect(result).toEqual({ fetched: 0, stored: 0, skipped: 1 });
    expect(_storeCalls).toHaveLength(0);
  });

  // ── VIR-3: fetchVnIndex throws ───────────────────────────────────────────

  it("VIR-3: fetchVnIndex throws — job resolves without throw, result.skipped=1", async () => {
    _fetchVnIndexImpl = async (_code: string) => {
      throw new Error("timeout");
    };

    // Must not throw
    const result = await runVnIndexRefreshJob();

    expect(result).toEqual({ fetched: 0, stored: 0, skipped: 1 });
    expect(_storeCalls).toHaveLength(0);
  });

  // ── VIR-4: storeMarketPrices receives correct payload ────────────────────

  it("VIR-4: storeMarketPrices called with array containing code='VNINDEX'", async () => {
    const price = buildMarketPrice({ code: "VNINDEX", price: 1250.5, changePct: 0.42 });
    _fetchVnIndexImpl = async (_code: string) => price;

    await runVnIndexRefreshJob();

    expect(_storeCalls).toHaveLength(1);
    const captured = _storeCalls[0]!;
    expect(captured).toHaveLength(1);
    expect(captured[0]!.code).toBe("VNINDEX");
  });

  // ── VIR-5: storeMarketPrices call count = 0 when all codes skipped ───────

  it("VIR-5: storeMarketPrices call count = 0 when fetchVnIndex returns null (full skip)", async () => {
    _fetchVnIndexImpl = async (_code: string) => null;

    await runVnIndexRefreshJob();

    expect(_storeCalls).toHaveLength(0);
  });
});
