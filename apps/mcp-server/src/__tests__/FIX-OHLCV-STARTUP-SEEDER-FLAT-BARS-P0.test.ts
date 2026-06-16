Bun.env["DB_PATH"] = ":memory:";
/**
 * FIX-OHLCV-STARTUP-SEEDER-FLAT-BARS-P0 — regression test
 *
 * Root cause: runOhlcvBackfill() (called by runOhlcvStartupProbe() at startup)
 * fetches VNDirect data and writes flat O=H=L=C vol=0 reference-price rows for
 * illiquid/non-traded tickers. These rows bypass FR-S1 in writeOhlcvBatch because
 * ohlcvBackfill.ts does NOT route through writeOhlcvBatch — it has its own INSERT.
 *
 * Fix (option b, /goal#1 no fake data): the flat seed-bar guard in ohlcvBackfill.ts
 * skips any row where volume=0 AND open=high=low=close AFTER normalization.
 * Generic predicate (/goal#2): no date literal, no ticker allowlist.
 *
 * This test simulates the startup path by calling runOhlcvBackfill() with a fake
 * fetchFn that mimics VNDirect returning flat reference-price rows for today.
 *
 * MUST FAIL on pre-fix code (guard not present).
 * MUST PASS after the fix (guard prevents flat bars from being written).
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { runOhlcvBackfill } from "../infrastructure/fetchers/ohlcvBackfill.js";

// ─────────────────────────────────────────────────────────────────────────────
// DB factory — minimal schema matching production daily_ohlcv
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code       TEXT NOT NULL,
      date       TEXT NOT NULL,
      open       REAL NOT NULL DEFAULT 0,
      high       REAL NOT NULL DEFAULT 0,
      low        REAL NOT NULL DEFAULT 0,
      close      REAL NOT NULL DEFAULT 0,
      volume     REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT '',
      data_env   TEXT,
      PRIMARY KEY (code, date)
    );
    CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY,
      exchange TEXT NOT NULL DEFAULT 'HOSE'
    );
  `);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: count flat zero-vol seed bars for today
// ─────────────────────────────────────────────────────────────────────────────

function countFlatSeedBarsForToday(db: Database): number {
  const today = new Date().toISOString().slice(0, 10);
  const row = db
    .prepare<{ cnt: number }, [string]>(
      `SELECT COUNT(*) AS cnt FROM daily_ohlcv
       WHERE date = ?
         AND volume = 0
         AND open = high
         AND high = low
         AND low = close`,
    )
    .get(today);
  return row?.cnt ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock VNDirect fetcher — mimics what VNDirect returns for illiquid tickers:
//   flat O=H=L=C=reference_price, vol=0, for today's date.
//   Also includes today's real candle for a traded ticker (vol>0, varied OHLC).
// ─────────────────────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10);

// Flat seed bar record (thousand-VND scale) — the bug class
const FLAT_SEED_RECORD_THOUSAND_SCALE = {
  code: "DCR",
  date: TODAY,
  open: 5.9,    // thousand-VND scale (×1000 = 5900)
  high: 5.9,
  low: 5.9,
  close: 5.9,
  nmVolume: 0,
};

// Flat seed bar with non-zero full-VND price
const FLAT_SEED_RECORD_FULL_VND = {
  code: "H11",
  date: TODAY,
  open: 25700,  // already full-VND
  high: 25700,
  low: 25700,
  close: 25700,
  nmVolume: 0,
};

// All-zero seed bar (DAG class — open=high=low=close=0, vol=0)
const ALLZERO_SEED_RECORD = {
  code: "DAG",
  date: TODAY,
  open: 0,
  high: 0,
  low: 0,
  close: 0,
  nmVolume: 0,
};

// Real traded candle for today (vol>0, varied OHLC) — must NOT be skipped
const REAL_CANDLE_RECORD = {
  code: "VCB",
  date: TODAY,
  open: 61.0,    // thousand-VND scale
  high: 62.0,
  low: 60.5,
  close: 61.5,
  nmVolume: 3_000_000,
};

// Historical real candle (past date, vol>0) — must NOT be skipped
const HISTORICAL_REAL_RECORD = {
  code: "FPT",
  date: "2026-01-15",
  open: 73.0,
  high: 74.0,
  low: 72.5,
  close: 73.5,
  nmVolume: 2_000_000,
};

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-OHLCV-STARTUP-SEEDER-FLAT-BARS-P0 — ohlcvBackfill flat seed-bar guard", () => {

  // ──────────────────────────────────────────────────────────────────────────
  // TC-1 (PRIMARY REGRESSION): Simulates startup path.
  // runOhlcvBackfill with a fake fetch that returns flat vol=0 O=H=L=C rows
  // for today (the exact class written at 08:19:13Z on 2026-06-16 live incident).
  //
  // MUST FAIL on pre-fix code (without the guard).
  // MUST PASS after the fix (guard prevents any flat seed bar from being written).
  // ──────────────────────────────────────────────────────────────────────────
  it("TC-1 (regression): startup probe feed of flat vol=0 O=H=L=C rows → ZERO rows written for today", async () => {
    const db = makeDb();

    // Seed watchlist with illiquid tickers (the ones that triggered the bug)
    for (const code of ["DCR", "H11", "DAG", "FAKE1", "FAKE2"]) {
      db.prepare("INSERT OR IGNORE INTO watchlist (code) VALUES (?)").run(code);
    }

    // Mock fetcher: returns flat O=H=L=C reference-price rows (thousand-VND scale)
    // for today, with vol=0. This is what VNDirect returns for non-traded tickers.
    const flatFetch = async (code: string): Promise<typeof FLAT_SEED_RECORD_THOUSAND_SCALE[]> => {
      const refPrice = code === "DAG" ? 0 : 5.9; // DAG class = all-zero
      return [
        {
          code,
          date: TODAY,
          open: refPrice,
          high: refPrice,
          low: refPrice,
          close: refPrice,
          nmVolume: 0,
        },
      ];
    };

    await runOhlcvBackfill(db, { fetchFn: flatFetch as any, delayMs: 0 });

    // PRIMARY ASSERTION: ZERO flat seed bars must exist for today after the backfill.
    const flatCount = countFlatSeedBarsForToday(db);
    expect(flatCount).toBe(0);

    // SECONDARY ASSERTION: total daily_ohlcv row count for today must also be 0
    // (all rows were seed bars — none should have been written)
    const todayCount = db
      .prepare<{ cnt: number }, [string]>(
        "SELECT COUNT(*) AS cnt FROM daily_ohlcv WHERE date = ?",
      )
      .get(TODAY);
    expect(todayCount?.cnt ?? 0).toBe(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-2: Thousand-VND scale flat bar (DCR open=5.9 → normalized 5900).
  // After ×1000 normalization the shape is still flat (5900=5900=5900=5900).
  // The guard must fire AFTER normalization to catch this class.
  // ──────────────────────────────────────────────────────────────────────────
  it("TC-2: thousand-VND flat seed (DCR 5.9→5900 after ×1000) — not written", async () => {
    const db = makeDb();
    db.prepare("INSERT OR IGNORE INTO watchlist (code) VALUES (?)").run("DCR");

    const fetch1Ticker = async (_code: string) => [FLAT_SEED_RECORD_THOUSAND_SCALE];

    await runOhlcvBackfill(db, { fetchFn: fetch1Ticker as any, delayMs: 0 });

    const flatCount = countFlatSeedBarsForToday(db);
    expect(flatCount).toBe(0);

    const row = db.prepare("SELECT * FROM daily_ohlcv WHERE code='DCR'").get();
    expect(row).toBeNull();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-3: Full-VND flat seed bar (H11 open=25700=close, vol=0).
  // normalizeOhlcvToVnd is a no-op for full-VND values, but the guard
  // must still fire because the shape is flat.
  // ──────────────────────────────────────────────────────────────────────────
  it("TC-3: full-VND flat seed (H11 25700=25700=25700=25700 vol=0) — not written", async () => {
    const db = makeDb();
    db.prepare("INSERT OR IGNORE INTO watchlist (code) VALUES (?)").run("H11");

    const fetch1Ticker = async (_code: string) => [FLAT_SEED_RECORD_FULL_VND];

    await runOhlcvBackfill(db, { fetchFn: fetch1Ticker as any, delayMs: 0 });

    const flatCount = countFlatSeedBarsForToday(db);
    expect(flatCount).toBe(0);

    const row = db.prepare("SELECT * FROM daily_ohlcv WHERE code='H11'").get();
    expect(row).toBeNull();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-4: All-zero flat bar (DAG open=0=close, vol=0).
  // validateOhlcvUnit already rejects zero-close rows, but the flat-seed guard
  // fires first (more specific diagnostic). Either path must produce 0 written rows.
  // ──────────────────────────────────────────────────────────────────────────
  it("TC-4: all-zero flat seed (DAG 0=0=0=0 vol=0) — not written", async () => {
    const db = makeDb();
    db.prepare("INSERT OR IGNORE INTO watchlist (code) VALUES (?)").run("DAG");

    const fetch1Ticker = async (_code: string) => [ALLZERO_SEED_RECORD];

    await runOhlcvBackfill(db, { fetchFn: fetch1Ticker as any, delayMs: 0 });

    const flatCount = countFlatSeedBarsForToday(db);
    expect(flatCount).toBe(0);

    const row = db.prepare("SELECT * FROM daily_ohlcv WHERE code='DAG'").get();
    expect(row).toBeNull();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-5 (SAFETY): Real traded candle (vol>0, varied OHLC) MUST be written.
  // The guard must NOT fire for real candles — only for flat vol=0 seeds.
  // ──────────────────────────────────────────────────────────────────────────
  it("TC-5 (safety): real candle with vol>0 and varied OHLC is written normally", async () => {
    const db = makeDb();
    db.prepare("INSERT OR IGNORE INTO watchlist (code) VALUES (?)").run("VCB");

    const fetch1Ticker = async (_code: string) => [REAL_CANDLE_RECORD];

    await runOhlcvBackfill(db, { fetchFn: fetch1Ticker as any, delayMs: 0 });

    // Real candle MUST exist
    const row = db.prepare("SELECT open, high, low, close, volume FROM daily_ohlcv WHERE code='VCB'").get() as
      | { open: number; high: number; low: number; close: number; volume: number }
      | undefined;

    expect(row).toBeDefined();
    // Volume should be written (raw or via normalization)
    expect((row?.volume ?? 0) > 0).toBe(true);
    // OHLC must be non-flat (varied)
    expect(row?.open).not.toBe(row?.close);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-6: Historical real candle (past date, vol>0) MUST be written.
  // The flat-seed guard must not exclude historical real candles.
  // ──────────────────────────────────────────────────────────────────────────
  it("TC-6: historical real candle (past date, vol>0) is written normally", async () => {
    const db = makeDb();
    db.prepare("INSERT OR IGNORE INTO watchlist (code) VALUES (?)").run("FPT");

    const fetch1Ticker = async (_code: string) => [HISTORICAL_REAL_RECORD];

    await runOhlcvBackfill(db, { fetchFn: fetch1Ticker as any, delayMs: 0 });

    const row = db
      .prepare("SELECT open, high, low, close, volume FROM daily_ohlcv WHERE code='FPT' AND date='2026-01-15'")
      .get() as { open: number; high: number; low: number; close: number; volume: number } | undefined;

    expect(row).toBeDefined();
    expect((row?.volume ?? 0) > 0).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-7 (GENERIC + MIXED): Multiple tickers in one run.
  // Flat seed bars for illiquid tickers → NOT written.
  // Real candles for traded tickers → written.
  // Halt day (O=H=L=C with vol>0) → written (vol>0 saves it).
  // ──────────────────────────────────────────────────────────────────────────
  it("TC-7: mixed fetch — flat seeds rejected, real candles + halt-day written", async () => {
    const db = makeDb();

    // Seed watchlist: illiquid + traded + halt-day ticker
    for (const code of ["DCR", "VCB", "HALT"]) {
      db.prepare("INSERT OR IGNORE INTO watchlist (code) VALUES (?)").run(code);
    }

    const mixedFetch = async (code: string) => {
      if (code === "DCR") {
        // Illiquid: flat seed bar (thousand-VND scale)
        return [{ code: "DCR", date: TODAY, open: 5.9, high: 5.9, low: 5.9, close: 5.9, nmVolume: 0 }];
      }
      if (code === "VCB") {
        // Traded: real candle
        return [{ code: "VCB", date: TODAY, open: 61.0, high: 62.0, low: 60.5, close: 61.5, nmVolume: 3_000_000 }];
      }
      if (code === "HALT") {
        // Circuit-breaker halt day: O=H=L=C but vol>0
        return [{ code: "HALT", date: TODAY, open: 50.0, high: 50.0, low: 50.0, close: 50.0, nmVolume: 100_000 }];
      }
      return [];
    };

    await runOhlcvBackfill(db, { fetchFn: mixedFetch as any, delayMs: 0 });

    // Flat seed bar for DCR must NOT have been written
    const dcrRow = db.prepare("SELECT * FROM daily_ohlcv WHERE code='DCR'").get();
    expect(dcrRow).toBeNull();

    // Real candle for VCB MUST be written
    const vcbRow = db
      .prepare("SELECT volume FROM daily_ohlcv WHERE code='VCB'")
      .get() as { volume: number } | undefined;
    expect(vcbRow).toBeDefined();
    expect((vcbRow?.volume ?? 0) > 0).toBe(true);

    // Halt-day candle for HALT MUST be written (vol>0 saves it despite flat shape)
    const haltRow = db
      .prepare("SELECT volume, open, close FROM daily_ohlcv WHERE code='HALT'")
      .get() as { volume: number; open: number; close: number } | undefined;
    expect(haltRow).toBeDefined();
    expect((haltRow?.volume ?? 0) > 0).toBe(true);

    // PRIMARY ASSERTION: zero flat seed bars for today
    const flatCount = countFlatSeedBarsForToday(db);
    expect(flatCount).toBe(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-8 (BOOT SEQUENCE SIMULATION): purgeStrandedSeedRows → runOhlcvBackfill
  // Simulates the exact boot sequence: purge runs synchronously, then backfill
  // runs async. Even if legacy stranded bars exist before boot, the combined
  // sequence leaves ZERO flat seed bars for today after both steps complete.
  // ──────────────────────────────────────────────────────────────────────────
  it("TC-8 (boot sequence): purge + backfill combined leaves zero flat bars for today", async () => {
    const { purgeStrandedSeedRows } = await import(
      "../scheduler/market-data/allzeroOhlcvBackfill.js"
    );

    const db = makeDb();
    db.prepare("INSERT OR IGNORE INTO watchlist (code) VALUES (?)").run("DCR");
    db.prepare("INSERT OR IGNORE INTO watchlist (code) VALUES (?)").run("VCB");

    // Pre-plant legacy stranded bars (as if they existed before the boot+purge)
    db.prepare(
      "INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))",
    ).run("DCR", "2026-06-15", 5900, 5900, 5900, 5900, 0);

    // Step 1: purgeStrandedSeedRows (synchronous — removes legacy stranded bars)
    const purgeResult = purgeStrandedSeedRows(db);
    expect(purgeResult.deleted).toBe(1); // the legacy DCR bar

    // Step 2: runOhlcvBackfill (async — must NOT re-introduce flat bars for today)
    const flatFetch = async (code: string) => {
      if (code === "DCR") {
        return [{ code: "DCR", date: TODAY, open: 5.9, high: 5.9, low: 5.9, close: 5.9, nmVolume: 0 }];
      }
      // VCB: real candle
      return [{ code: "VCB", date: TODAY, open: 61.0, high: 62.0, low: 60.5, close: 61.5, nmVolume: 3_000_000 }];
    };

    await runOhlcvBackfill(db, { fetchFn: flatFetch as any, delayMs: 0 });

    // After full boot sequence: ZERO flat seed bars for today
    const flatCount = countFlatSeedBarsForToday(db);
    expect(flatCount).toBe(0);

    // VCB real candle is present
    const vcbRow = db
      .prepare("SELECT volume FROM daily_ohlcv WHERE code='VCB' AND date=?")
      .get(TODAY) as { volume: number } | undefined;
    expect(vcbRow).toBeDefined();
    expect((vcbRow?.volume ?? 0) > 0).toBe(true);
  });

});
