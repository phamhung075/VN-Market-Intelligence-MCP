/**
 * MONEY-RADAR-P0-T2B-INDEX-AXIS-FIX — Test Suite
 *
 * Root cause: getVnIndexDailyCloses() read VNINDEX closes from
 * market_prices_history, which pushPricesHandler.ts hard-deletes below a
 * rolling 24h cutoff (by design — daily_ohlcv already preserves the day
 * summary for 2+ years). Live proof: market_prices_history distinct_days=1,
 * daily_ohlcv distinct_days=754 for code='VNINDEX'. computeIndexReturn needs
 * >=6 distinct days for a 5-day return -> indexReturn5d was permanently null
 * -> D1/D2 divergence detectors could never fire against live data.
 *
 * Fix: getVnIndexDailyCloses() now reads close+date from daily_ohlcv
 * (code='VNINDEX') instead of market_prices_history. OBV axis is untouched
 * (already reads daily_ohlcv correctly).
 *
 * Harness: in-memory SQLite (bun:sqlite) seeded via initDatabase() — same
 * style as MONEY-RADAR-P0-T2-COMPOSITE.test.ts.
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";

import { initDatabase } from "../infrastructure/db/schema.js";
import { getVnIndexDailyCloses } from "../infrastructure/db/moneyRadarStore.js";
import {
  computeIndexReturn,
  computeMarketObvSlope,
  detectD2PriceVsObv,
  type OhlcvBar,
} from "../domain/services/market-data/moneyRadarCalculator.js";

async function makeDb(): Promise<Database> {
  const db = new Database(":memory:");
  await initDatabase(db);
  return db;
}

function dateSeq(n: number, startDay = 1): string[] {
  return Array.from({ length: n }, (_, i) => `2026-06-${String(startDay + i).padStart(2, "0")}`);
}

/** Seed daily_ohlcv rows for one code from an ASC array of {date, close, volume}. */
function seedOhlcv(
  db: Database,
  code: string,
  bars: Array<{ date: string; close: number; volume: number }>,
): void {
  for (const b of bars) {
    db.prepare(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(code, b.date, b.close, b.close, b.close, b.close, b.volume, new Date().toISOString());
  }
}

describe("getVnIndexDailyCloses — reads daily_ohlcv, not market_prices_history (MONEY-RADAR-P0-T2B-INDEX-AXIS-FIX)", () => {
  it("returns >=6 distinct daily closes ASC when daily_ohlcv has 8 seeded VNINDEX days", async () => {
    const db = await makeDb();
    const dates = dateSeq(8);
    seedOhlcv(
      db,
      "VNINDEX",
      dates.map((d, i) => ({ date: d, close: 1000 + i * 5, volume: 0 })),
    );

    const closes = getVnIndexDailyCloses(db, 30);

    expect(closes.length).toBe(8);
    expect(closes.length).toBeGreaterThanOrEqual(6);
    // ASC (oldest first) — the fixture closes are strictly increasing.
    expect(closes).toEqual([1000, 1005, 1010, 1015, 1020, 1025, 1030, 1035]);
  });

  it("ignores market_prices_history entirely — a lone/thin market_prices_history row does not leak in or block daily_ohlcv reads", async () => {
    const db = await makeDb();
    // Simulate the live-proven starvation state: market_prices_history has
    // exactly 1 distinct day (post-24h-cutoff-purge), while daily_ohlcv holds
    // the full history. If the query still read market_prices_history this
    // would collapse to 1 close.
    db.prepare(
      `INSERT INTO market_prices_history (code, price, volume, fetched_at) VALUES ('VNINDEX', ?, 0, ?)`,
    ).run(9999, "2026-06-08T08:00:00Z");

    const dates = dateSeq(8);
    seedOhlcv(
      db,
      "VNINDEX",
      dates.map((d, i) => ({ date: d, close: 1000 + i * 5, volume: 0 })),
    );

    const closes = getVnIndexDailyCloses(db, 30);

    expect(closes.length).toBe(8);
    // The market_prices_history sentinel value (9999) must not appear.
    expect(closes).not.toContain(9999);
  });

  it("computeIndexReturn resolves non-null once >=6 distinct daily_ohlcv closes are available (was permanently null pre-fix)", async () => {
    const db = await makeDb();
    const dates = dateSeq(6, 10);
    seedOhlcv(
      db,
      "VNINDEX",
      dates.map((d, i) => ({ date: d, close: 1000 + i * 5, volume: 0 })),
    );

    const closes = getVnIndexDailyCloses(db, 30);
    const indexReturn5d = computeIndexReturn(closes, 5);

    expect(indexReturn5d).not.toBeNull();
    expect(indexReturn5d).toBeGreaterThan(0);
  });
});

describe("detectD2PriceVsObv fires end-to-end from daily_ohlcv-sourced index axis (AMBER/[D2])", () => {
  it("index up (from daily_ohlcv VNINDEX) + market OBV slope negative -> D2 FIRED", async () => {
    const db = await makeDb();

    const dates = dateSeq(6, 10);
    // VNINDEX rises steadily over the 6-session window -> index_return_5d > 0.
    seedOhlcv(
      db,
      "VNINDEX",
      dates.map((d, i) => ({ date: d, close: 1000 + i * 5, volume: 0 })),
    );

    // Watchlist tickers trend DOWN -> market OBV slope negative.
    const perTickerBars: Record<string, OhlcvBar[]> = {
      DDD: dates.map((d, i) => ({ date: d, close: 100 - i, volume: 100_000 })),
      EEE: dates.map((d, i) => ({ date: d, close: 80 - i, volume: 90_000 })),
    };

    const closes = getVnIndexDailyCloses(db, 30);
    const indexReturn5d = computeIndexReturn(closes, 5);
    const obvSlope = computeMarketObvSlope(perTickerBars, 5);

    expect(indexReturn5d).not.toBeNull();
    expect(indexReturn5d).toBeGreaterThan(0);
    expect(obvSlope.value).not.toBeNull();
    expect(obvSlope.value).toBeLessThan(0);

    const d2 = detectD2PriceVsObv(indexReturn5d, obvSlope.value);

    // This is the assertion that proves D2 fires end-to-end on the
    // daily_ohlcv-sourced index axis — pre-fix this was UNKNOWN forever
    // because indexReturn5d was permanently null.
    expect(d2.status).toBe("FIRED");
    expect(d2.id).toBe("D2");
  });
});
