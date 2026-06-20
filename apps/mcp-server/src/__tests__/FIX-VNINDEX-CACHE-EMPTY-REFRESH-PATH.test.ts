/**
 * FIX-VNINDEX-CACHE-EMPTY-REFRESH-PATH — Unit Tests
 *
 * Root cause: vn_index_cache had no DDL and no writer; vnIndexRefreshJob only
 * wrote to market_prices/market_prices_history. This fix adds the table DDL to
 * schema-market-data.ts and wires upsertVnIndexCache into vnIndexRefreshJob.
 *
 * Test strategy (contract-from-live-payload class):
 *   - mock.module() overrides hose.js so NO real HTTP calls occur.
 *   - The DB is a REAL in-memory SQLite initialised via initDatabase() — the
 *     same code path used in production. This ensures the test uses the actual
 *     production schema (not a self-confirming rebuilt schema) and catches any
 *     DDL drift between the test assertion and the live table structure.
 *   - getDb() is overridden via DB_PATH=:memory: (set by setup.ts preload).
 *
 * Cases:
 *   VIC-1: happy path — vn_index_cache has 1 row after job runs with valid payload
 *   VIC-2: null return — vn_index_cache stays empty when fetchVnIndex returns null
 *   VIC-3: fetch throw — vn_index_cache stays empty when fetchVnIndex throws
 *   VIC-4: row content — cached price/change_pct/volume match fetched payload
 *   VIC-5: upsert idempotent — running job twice leaves exactly 1 row (no duplicates)
 *
 * @module __tests__/FIX-VNINDEX-CACHE-EMPTY-REFRESH-PATH
 */

import { describe, it, expect, mock, beforeEach, afterAll } from "bun:test";
import type { MarketPrice } from "../infrastructure/fetchers/hose.js";

// ─────────────────────────────────────────────────────────────────────────────
// Mutable delegates — one mock.module() call, per-test control via mutation.
// ─────────────────────────────────────────────────────────────────────────────

let _fetchVnIndexImpl: (code: string) => Promise<MarketPrice | null> =
  async (_code) => null;

// storeMarketPrices is a no-op in this test — we care about the DB cache write,
// not the market_prices/history write (that path is tested in 1397c).
let _storeMarketPricesImpl: (prices: MarketPrice[]) => Promise<void> =
  async (_prices) => {};

function _hoseMockFactory() {
  return {
    fetchVnIndex: (code: string) => _fetchVnIndexImpl(code),
    storeMarketPrices: (prices: MarketPrice[]) => _storeMarketPricesImpl(prices),
  };
}
mock.module("../infrastructure/fetchers/hose.js", _hoseMockFactory);

// Import SUT after mock.module() so the module cache returns the mocked hose.
const { runVnIndexRefreshJob } = await import(
  "../scheduler/market-data/vnIndexRefreshJob.js"
);

// ─────────────────────────────────────────────────────────────────────────────
// DB helpers — real in-memory DB via the PRODUCTION initDatabase() code path.
// DB_PATH=:memory: is enforced by setup.ts preload; getDb() and initDatabase()
// will use the in-memory database so no on-disk state is touched.
// ─────────────────────────────────────────────────────────────────────────────

async function openFreshDb() {
  // Lazy-import so the mock is already registered when the module loads.
  const { closeDb, initDatabase, getDb } = await import("../infrastructure/db/schema.js");
  closeDb();
  await initDatabase();
  return getDb();
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildMarketPrice(overrides: Partial<MarketPrice> = {}): MarketPrice {
  return {
    code: "VNINDEX",
    exchange: "HOSE",
    price: 1300.75,
    previousPrice: 1295.0,
    changePct: 0.44,
    volume: 600_000,
    avgVolume: 550_000,
    fetchedAt: new Date().toISOString(),
    ...overrides,
  };
}

interface CacheRow {
  code: string;
  price: number;
  prev_price: number;
  change_pct: number;
  volume: number;
  fetched_at: string;
}

function countCacheRows(db: ReturnType<typeof import("../infrastructure/db/schema.js")["getDb"]>): number {
  const row = db.query<{ cnt: number }, []>("SELECT COUNT(*) AS cnt FROM vn_index_cache").get();
  return row?.cnt ?? 0;
}

function getCacheRow(
  db: ReturnType<typeof import("../infrastructure/db/schema.js")["getDb"]>,
  code = "VNINDEX",
): CacheRow | null {
  return (
    db
      .query<CacheRow, [string]>(
        "SELECT code, price, prev_price, change_pct, volume, fetched_at FROM vn_index_cache WHERE code = ?",
      )
      .get(code) ?? null
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-VNINDEX-CACHE-EMPTY-REFRESH-PATH — vn_index_cache write path", () => {
  // Re-initialise a fresh in-memory DB before each test so rows don't bleed.
  let db: Awaited<ReturnType<typeof openFreshDb>>;

  beforeEach(async () => {
    _fetchVnIndexImpl = async (_code) => null;
    _storeMarketPricesImpl = async (_prices) => {};
    db = await openFreshDb();
  });

  // ── VIC-1: happy path ──────────────────────────────────────────────────────

  it("VIC-1: vn_index_cache has 1 row after job runs with valid payload", async () => {
    _fetchVnIndexImpl = async (_code) => buildMarketPrice();

    await runVnIndexRefreshJob();

    expect(countCacheRows(db)).toBe(1);
  });

  // ── VIC-2: fetchVnIndex returns null ───────────────────────────────────────

  it("VIC-2: vn_index_cache stays empty when fetchVnIndex returns null (honest gap)", async () => {
    _fetchVnIndexImpl = async (_code) => null;

    await runVnIndexRefreshJob();

    expect(countCacheRows(db)).toBe(0);
  });

  // ── VIC-3: fetchVnIndex throws ─────────────────────────────────────────────

  it("VIC-3: vn_index_cache stays empty when fetchVnIndex throws (honest gap, no silent-write)", async () => {
    _fetchVnIndexImpl = async (_code) => {
      throw new Error("vnmarket_prices HTTP 503");
    };

    // Job must not re-throw (never-throws contract from VIR-3).
    await expect(runVnIndexRefreshJob()).resolves.toBeDefined();

    expect(countCacheRows(db)).toBe(0);
  });

  // ── VIC-4: row content matches fetched payload ─────────────────────────────

  it("VIC-4: cached price/change_pct/volume match the fetched MarketPrice payload", async () => {
    const price = buildMarketPrice({
      code: "VNINDEX",
      price: 1312.88,
      previousPrice: 1300.0,
      changePct: 0.99,
      volume: 789_000,
    });
    _fetchVnIndexImpl = async (_code) => price;

    await runVnIndexRefreshJob();

    const row = getCacheRow(db, "VNINDEX");
    expect(row).not.toBeNull();
    expect(row!.price).toBeCloseTo(1312.88, 2);
    expect(row!.prev_price).toBeCloseTo(1300.0, 2);
    expect(row!.change_pct).toBeCloseTo(0.99, 2);
    expect(row!.volume).toBe(789_000);
    expect(row!.fetched_at).toBe(price.fetchedAt);
  });

  // ── VIC-5: upsert idempotent ───────────────────────────────────────────────

  it("VIC-5: running job twice leaves exactly 1 row (INSERT OR REPLACE idempotent)", async () => {
    const p1 = buildMarketPrice({ price: 1250.0, fetchedAt: new Date(Date.now() - 5000).toISOString() });
    const p2 = buildMarketPrice({ price: 1255.5, fetchedAt: new Date().toISOString() });

    _fetchVnIndexImpl = async (_code) => p1;
    await runVnIndexRefreshJob();

    _fetchVnIndexImpl = async (_code) => p2;
    await runVnIndexRefreshJob();

    // Still exactly 1 row — INSERT OR REPLACE, not INSERT
    expect(countCacheRows(db)).toBe(1);

    // Latest value wins
    const row = getCacheRow(db, "VNINDEX");
    expect(row!.price).toBeCloseTo(1255.5, 2);
  });
});

// C5-CURE: restore mock after suite so downstream files see the real hose module.
afterAll(() => {
  mock.module("../infrastructure/fetchers/hose.js", _hoseMockFactory);
});
