// src/__tests__/DPI-3-commodity-delta.test.ts
// Sprint DATA-PIPELINE-INTEGRITY — DPI-3
// Unit tests for computeDelta() helper and storeCommoditySnapshot() delta logic.
//
// AC-1: prevBrent/prevGold fetched from commodity_prices_history before transaction
// AC-2: computeDelta() correctness (various pairs)
// AC-3: upsertMacroPrice ON CONFLICT branch updates change_amt and change_pct
// AC-4: transaction call-sites pass computed deltas (non-hardcoded-0)
// AC-5: first-run tolerance — null prev → delta=0, no error

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { storeCommoditySnapshot } from "../infrastructure/fetchers/yahooFinance.js";
import type { CommoditySnapshot } from "../infrastructure/fetchers/yahooFinance.js";

// ---------------------------------------------------------------------------
// Minimal snapshot builder
// ---------------------------------------------------------------------------

function makeSnapshot(overrides: Partial<CommoditySnapshot> = {}): CommoditySnapshot {
  return {
    brentCrudeUSD:  85.0,
    goldUSDPerOz:   2300.0,
    usdVndRate:     25500,
    fetchedAt:      new Date().toISOString(),
    vix:            18.0,
    sp500:          5100.0,
    shanghaiComp:   3050.0,
    hangSeng:       18500.0,
    dxy:            104.0,
    cnyVndRate:     null, // DSI-INV-1: unavailable, not a live rate
    copperUSD:      4.5,
    silverUSDPerOz: 27.0,
    jpyVndRate:     170.0,
    us10yYield:     4.5,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computeDelta — accessed indirectly through storeCommoditySnapshot()
// We test it by seeding a history row and checking market_prices after store.
// ---------------------------------------------------------------------------

describe("DPI-3 AC-2: computeDelta logic via store round-trip", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });
  afterEach(() => { closeDb(); });

  it("price up from 80 → 100 → change_pct = 25.0", () => {
    const db = getDb();

    // Seed a prior tick into commodity_prices_history (older timestamp)
    const t0 = "2026-05-28T06:00:00.000Z";
    const t1 = "2026-05-29T07:00:00.000Z";

    db.prepare(`
      INSERT INTO commodity_prices_history
        (source, brent_crude_usd, gold_usd_per_oz, usd_vnd_rate,
         vix, sp500, shanghai_comp, hang_seng, dxy, cny_vnd_rate,
         copper_usd, silver_usd_per_oz, jpy_vnd_rate, us10y_yield, fetched_at)
      VALUES ('yahoo', 80, 2000, 25500, 18, 5000, 3000, 18000, 104, 0, 4.5, 27, 170, 4.5, ?)
    `).run(t0);

    const snap = makeSnapshot({ brentCrudeUSD: 100, goldUSDPerOz: 2500, fetchedAt: t1 });
    storeCommoditySnapshot(snap, db);

    const brentRow = db.prepare(`SELECT change_amt, change_pct FROM market_prices WHERE code = 'BRENT'`).get() as
      { change_amt: number; change_pct: number } | null;

    expect(brentRow).not.toBeNull();
    expect(brentRow!.change_amt).toBeCloseTo(20, 5);
    expect(brentRow!.change_pct).toBeCloseTo(25.0, 5);

    const goldRow = db.prepare(`SELECT change_amt, change_pct FROM market_prices WHERE code = 'GOLD'`).get() as
      { change_amt: number; change_pct: number } | null;

    expect(goldRow).not.toBeNull();
    expect(goldRow!.change_amt).toBeCloseTo(500, 5);
    expect(goldRow!.change_pct).toBeCloseTo(25.0, 5);
  });

  it("price unchanged 100 → 100 → change_pct = 0", () => {
    const db = getDb();
    const t0 = "2026-05-29T06:00:00.000Z";
    const t1 = "2026-05-29T07:00:00.000Z";

    db.prepare(`
      INSERT INTO commodity_prices_history
        (source, brent_crude_usd, gold_usd_per_oz, usd_vnd_rate,
         vix, sp500, shanghai_comp, hang_seng, dxy, cny_vnd_rate,
         copper_usd, silver_usd_per_oz, jpy_vnd_rate, us10y_yield, fetched_at)
      VALUES ('yahoo', 100, 2300, 25500, 18, 5000, 3000, 18000, 104, 0, 4.5, 27, 170, 4.5, ?)
    `).run(t0);

    const snap = makeSnapshot({ brentCrudeUSD: 100, goldUSDPerOz: 2300, fetchedAt: t1 });
    storeCommoditySnapshot(snap, db);

    const row = db.prepare(`SELECT change_pct FROM market_prices WHERE code = 'BRENT'`).get() as
      { change_pct: number } | null;
    expect(row!.change_pct).toBeCloseTo(0, 5);
  });
});

// ---------------------------------------------------------------------------
// AC-5: First-run tolerance — no prior history row → deltas default to 0
// ---------------------------------------------------------------------------

describe("DPI-3 AC-5: first-run tolerance — empty history → delta = 0", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });
  afterEach(() => { closeDb(); });

  it("stores BRENT with change_pct = 0 when no prior history exists", () => {
    const db = getDb();
    const snap = makeSnapshot();
    // No prior rows in commodity_prices_history
    expect(() => storeCommoditySnapshot(snap, db)).not.toThrow();

    const row = db.prepare(`SELECT change_amt, change_pct FROM market_prices WHERE code = 'BRENT'`).get() as
      { change_amt: number; change_pct: number } | null;
    expect(row).not.toBeNull();
    expect(row!.change_amt).toBe(0);
    expect(row!.change_pct).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// AC-3: ON CONFLICT updates change_amt and change_pct (not hardcoded 0)
// ---------------------------------------------------------------------------

describe("DPI-3 AC-3: ON CONFLICT branch updates change columns", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });
  afterEach(() => { closeDb(); });

  it("second storeCommoditySnapshot updates change_pct, not keeps stale 0", () => {
    const db = getDb();
    const t0 = "2026-05-27T06:00:00.000Z";
    const t1 = "2026-05-28T07:00:00.000Z";
    const t2 = "2026-05-29T08:00:00.000Z";

    // First snapshot → no history yet, delta=0
    storeCommoditySnapshot(makeSnapshot({ brentCrudeUSD: 80, fetchedAt: t0 }), db);

    // Second snapshot — prior tick in history is t0's row (appended by first store)
    const snap2 = makeSnapshot({ brentCrudeUSD: 100, fetchedAt: t1 });
    storeCommoditySnapshot(snap2, db);

    const row = db.prepare(`SELECT change_pct FROM market_prices WHERE code = 'BRENT'`).get() as
      { change_pct: number } | null;
    // 100 vs 80 = +25%
    expect(row!.change_pct).toBeCloseTo(25.0, 4);

    // Third snapshot — price drops back to 80
    storeCommoditySnapshot(makeSnapshot({ brentCrudeUSD: 80, fetchedAt: t2 }), db);

    const row2 = db.prepare(`SELECT change_pct FROM market_prices WHERE code = 'BRENT'`).get() as
      { change_pct: number } | null;
    // 80 vs 100 = -20%
    expect(row2!.change_pct).toBeCloseTo(-20.0, 4);
  });
});
