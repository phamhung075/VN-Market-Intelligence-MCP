Bun.env["DB_PATH"] = ":memory:";
// src/__tests__/1390-ohlcv-volume-unit.test.ts
// Task 1390 — TDD RED: OHLCV aggregator volume should be MAX(volume) from ticks,
// not COUNT(*) of ticks.
//
// Bug: daily_ohlcv.volume was set to the number of intraday price-snapshot polls
// (e.g. 519 fetches → 519) instead of the cumulative traded volume from the last
// tick (e.g. MAX(volume) = 5,194,900 shares).
// Effect: VIC volume displayed as 519.5K instead of 5,194.9K (10× underreported).

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { runOhlcvDailyAggregator } from "../scheduler/market-data/ohlcvDailyAggregatorJob.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

const NOW_MS = Date.parse("2026-04-17T09:00:00.000Z");
const VN_DATE = "2026-04-17";
const WINDOW_START = "2026-04-16T17:00:00.000Z"; // VN midnight UTC
const TICK_1 = "2026-04-16T17:30:00.000Z";
const TICK_2 = "2026-04-16T20:00:00.000Z";
const TICK_3 = "2026-04-17T08:00:00.000Z";

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE watchlist (code TEXT PRIMARY KEY);
    CREATE TABLE market_prices_history (
      code TEXT, price REAL, volume REAL, exchange TEXT, fetched_at TEXT,
      PRIMARY KEY (code, fetched_at)
    );
    CREATE TABLE daily_ohlcv (
      code TEXT, date TEXT, open REAL, high REAL, low REAL, close REAL,
      volume REAL, updated_at TEXT,
      PRIMARY KEY (code, date)
    );
  `);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

describe("Task 1390 — OHLCV volume = MAX(volume), not COUNT(*) of ticks", () => {
  it("AC-1: volume stored is MAX(volume) from ticks, not tick count", async () => {
    const db = makeDb();
    db.prepare("INSERT INTO watchlist VALUES (?)").run("VIC");

    // Simulate 3 intraday snapshots with cumulative HOSE volume (in shares)
    // Each snapshot's volume grows as market hours progress
    db.prepare(
      "INSERT INTO market_prices_history (code, price, volume, exchange, fetched_at) VALUES (?, ?, ?, ?, ?)"
    ).run("VIC", 44000, 1_500_000, "HOSE", TICK_1);
    db.prepare(
      "INSERT INTO market_prices_history (code, price, volume, exchange, fetched_at) VALUES (?, ?, ?, ?, ?)"
    ).run("VIC", 44200, 3_200_000, "HOSE", TICK_2);
    db.prepare(
      "INSERT INTO market_prices_history (code, price, volume, exchange, fetched_at) VALUES (?, ?, ?, ?, ?)"
    ).run("VIC", 44100, 5_194_900, "HOSE", TICK_3); // end-of-day cumulative

    const result = await runOhlcvDailyAggregator({
      db: () => db,
      nowMsFn: () => NOW_MS,
      sendWorkFn: async () => true,
    });

    expect(result.rowsWritten).toBe(1);

    const row = db
      .prepare("SELECT volume FROM daily_ohlcv WHERE code = ? AND date = ?")
      .get("VIC", VN_DATE) as { volume: number } | undefined;

    expect(row).toBeDefined();
    // Must be 5,194,900 (MAX of tick volumes) — NOT 3 (tick count)
    expect(row!.volume).toBe(5_194_900);
  });

  it("AC-2: VHM — MAX(volume) across many ticks returns correct end-of-day total", async () => {
    const db = makeDb();
    db.prepare("INSERT INTO watchlist VALUES (?)").run("VHM");

    // 5 ticks — only the last has the full cumulative volume
    const ticks = [
      ["2026-04-16T17:30:00.000Z", 900_000],
      ["2026-04-16T18:30:00.000Z", 2_100_000],
      ["2026-04-16T20:00:00.000Z", 4_500_000],
      ["2026-04-17T06:00:00.000Z", 7_800_000],
      ["2026-04-17T08:00:00.000Z", 9_348_000], // final cumulative
    ] as const;

    for (const [ts, vol] of ticks) {
      db.prepare(
        "INSERT INTO market_prices_history (code, price, volume, exchange, fetched_at) VALUES (?, ?, ?, ?, ?)"
      ).run("VHM", 35000, vol, "HOSE", ts);
    }

    await runOhlcvDailyAggregator({
      db: () => db,
      nowMsFn: () => NOW_MS,
      sendWorkFn: async () => true,
    });

    const row = db
      .prepare("SELECT volume FROM daily_ohlcv WHERE code = ? AND date = ?")
      .get("VHM", VN_DATE) as { volume: number } | undefined;

    expect(row).toBeDefined();
    // Must be 9,348,000 (MAX) — NOT 5 (tick count)
    expect(row!.volume).toBe(9_348_000);
  });

  it("AC-3: single tick — volume equals that tick volume, not 1", async () => {
    const db = makeDb();
    db.prepare("INSERT INTO watchlist VALUES (?)").run("FPT");
    db.prepare(
      "INSERT INTO market_prices_history (code, price, volume, exchange, fetched_at) VALUES (?, ?, ?, ?, ?)"
    ).run("FPT", 120000, 2_000_000, "HOSE", TICK_1);

    await runOhlcvDailyAggregator({
      db: () => db,
      nowMsFn: () => NOW_MS,
      sendWorkFn: async () => true,
    });

    const row = db
      .prepare("SELECT volume FROM daily_ohlcv WHERE code = ? AND date = ?")
      .get("FPT", VN_DATE) as { volume: number } | undefined;

    expect(row!.volume).toBe(2_000_000); // not 1
  });
});
