/**
 * 1970-ta-ohlcv-backfill.test.ts — TDD test suite
 *
 * Task 1970 — RSI/MACD/BB indicator restoration across 30 watchlist tickers.
 *
 * ACs covered:
 *   AC-1: tickers with >= 35 clean rows → covered, no fetch
 *   AC-2: tickers with < 35 rows → fetched, INSERT OR REPLACE overwrites corrupt rows
 *   AC-3: tickers with any low=0 rows (1972 corrupt data) → fetched even if cnt >= 35
 *   AC-4: fetch error per ticker is isolated; remaining tickers still processed
 *   AC-5: return summary { covered, backfilled, sparse, errors } where sparse = fetched < 35
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  runTaOhlcvBackfill,
  TA_MIN_ROWS,
  type TaOhlcvBackfillDeps,
  type OhlcvRecord,
} from "../scheduler/market-data/taOhlcvBackfillJob.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code       TEXT NOT NULL,
      date       TEXT NOT NULL,
      open       REAL NOT NULL DEFAULT 0,
      high       REAL NOT NULL DEFAULT 0,
      low        REAL NOT NULL DEFAULT 0,
      close      REAL NOT NULL,
      volume     REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (code, date)
    );
    CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY
    ,
    exchange TEXT NOT NULL DEFAULT 'HOSE');
  `);
  return db;
}

/** Seed N clean rows (low > 0) for a ticker */
function seedCleanRows(db: Database, code: string, n: number): void {
  for (let i = 0; i < n; i++) {
    const date = `2024-${String(Math.floor(i / 28) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`;
    db.prepare(
      `INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES (?, ?, 80000, 82000, 79000, 81000, 100000, datetime('now'))`,
    ).run(code, date);
  }
}

/** Seed one corrupt row with low=0 */
function seedCorruptRow(db: Database, code: string): void {
  db.prepare(
    `INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
     VALUES (?, '2024-01-01', 80000, 82000, 0, 81000, 100000, datetime('now'))`,
  ).run(code);
}

/** Explicit fetchFn type for test helpers — non-optional to satisfy exactOptionalPropertyTypes */
type FetchFn = (code: string, fromDate: string, toDate: string) => Promise<OhlcvRecord[]>;

/** Build a mock fetchFn that returns N clean records for any ticker */
function mockFetchSuccess(n: number): FetchFn {
  return async (code: string) => {
    const records: OhlcvRecord[] = [];
    for (let i = 0; i < n; i++) {
      const date = `2024-${String(Math.floor(i / 28) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`;
      records.push({ code, date, open: 80000, high: 82000, low: 79000, close: 81000, nmVolume: 100000 });
    }
    return records;
  };
}

/** Build a mock fetchFn that throws for a given code, succeeds for others */
function mockFetchThrowsFor(errorCode: string, successN: number): FetchFn {
  return async (code: string) => {
    if (code === errorCode) throw new Error(`Simulated fetch error for ${code}`);
    const records: OhlcvRecord[] = [];
    for (let i = 0; i < successN; i++) {
      const date = `2024-${String(Math.floor(i / 28) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`;
      records.push({ code, date, open: 80000, high: 82000, low: 79000, close: 81000, nmVolume: 100000 });
    }
    return records;
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Task 1970 — taOhlcvBackfillJob", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  afterEach(() => {
    db.close();
  });

  // ─── AC-1: covered tickers are not re-fetched ──────────────────────────────

  it("AC-1a: ticker with >= TA_MIN_ROWS clean rows → covered=1, backfilled=0", async () => {
    db.prepare("INSERT INTO watchlist (code) VALUES (?)").run("VCB");
    seedCleanRows(db, "VCB", TA_MIN_ROWS);

    let fetchCalled = false;
    const result = await runTaOhlcvBackfill({
      db,
      fetchFn: async () => { fetchCalled = true; return []; },
    });

    expect(fetchCalled).toBe(false); // must not fetch for already-covered ticker
    expect(result.covered).toBe(1);
    expect(result.backfilled).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("AC-1b: ticker with > TA_MIN_ROWS clean rows → covered, no fetch", async () => {
    db.prepare("INSERT INTO watchlist (code) VALUES (?)").run("HPG");
    seedCleanRows(db, "HPG", TA_MIN_ROWS + 10);

    let fetchCalled = false;
    const result = await runTaOhlcvBackfill({
      db,
      fetchFn: async () => { fetchCalled = true; return []; },
    });

    expect(fetchCalled).toBe(false);
    expect(result.covered).toBe(1);
  });

  // ─── AC-2: tickers with < TA_MIN_ROWS are fetched and upserted ────────────

  it("AC-2a: ticker with 0 rows → fetched, rows inserted via INSERT OR REPLACE", async () => {
    db.prepare("INSERT INTO watchlist (code) VALUES (?)").run("FPT");

    const result = await runTaOhlcvBackfill({
      db,
      fetchFn: mockFetchSuccess(TA_MIN_ROWS),
    });

    expect(result.backfilled).toBe(1);
    expect(result.errors).toHaveLength(0);
    const rowCount = (db.prepare("SELECT COUNT(*) as cnt FROM daily_ohlcv WHERE code = 'FPT'").get() as { cnt: number }).cnt;
    expect(rowCount).toBe(TA_MIN_ROWS);
  });

  it("AC-2b: ticker with TA_MIN_ROWS - 1 rows → fetched and upserted (threshold is strict)", async () => {
    db.prepare("INSERT INTO watchlist (code) VALUES (?)").run("VNM");
    seedCleanRows(db, "VNM", TA_MIN_ROWS - 1);

    let fetchCalled = false;
    const successFn = mockFetchSuccess(TA_MIN_ROWS);
    const result = await runTaOhlcvBackfill({
      db,
      fetchFn: async (code, fromDate, toDate) => { fetchCalled = true; return successFn(code, fromDate, toDate); },
    });

    expect(fetchCalled).toBe(true);
    expect(result.backfilled).toBe(1);
  });

  it("AC-2c: INSERT OR REPLACE overwrites existing corrupt row (low=0 → replaced with clean value)", async () => {
    db.prepare("INSERT INTO watchlist (code) VALUES (?)").run("VCB");
    // pre-seed one corrupt row: low=0 for 2024-01-01
    seedCorruptRow(db, "VCB");

    // fetch returns TA_MIN_ROWS clean records including the corrupt date
    const records: OhlcvRecord[] = [];
    for (let i = 0; i < TA_MIN_ROWS; i++) {
      const date = i === 0 ? "2024-01-01" : `2024-${String(Math.floor(i / 28) + 1).padStart(2, "0")}-${String((i % 28) + 2).padStart(2, "0")}`;
      records.push({ code: "VCB", date, open: 80000, high: 82000, low: 79000, close: 81000, nmVolume: 100000 });
    }

    const result = await runTaOhlcvBackfill({
      db,
      fetchFn: async () => records,
    });

    // corrupt row should be replaced by the clean fetch result
    const row = db.prepare("SELECT low FROM daily_ohlcv WHERE code = 'VCB' AND date = '2024-01-01'").get() as { low: number } | undefined;
    expect(row).toBeDefined();
    expect(row!.low).toBe(79000); // NOT 0 — INSERT OR REPLACE healed the corrupt row
    expect(result.backfilled).toBe(1);
    expect(result.sparse).toBe(0);
  });

  // ─── AC-3: tickers with any low=0 rows are treated as needing backfill ────

  it("AC-3: ticker with >= TA_MIN_ROWS rows but low=0 corrupt rows → still fetched", async () => {
    db.prepare("INSERT INTO watchlist (code) VALUES (?)").run("BID");
    // Seed >= TA_MIN_ROWS rows, but one is corrupt
    seedCleanRows(db, "BID", TA_MIN_ROWS);
    seedCorruptRow(db, "BID"); // adds/overwrites 2024-01-01 with low=0

    let fetchCalled = false;
    const successFn = mockFetchSuccess(TA_MIN_ROWS);
    const result = await runTaOhlcvBackfill({
      db,
      fetchFn: async (code, fromDate, toDate) => {
        fetchCalled = true;
        return successFn(code, fromDate, toDate);
      },
    });

    expect(fetchCalled).toBe(true);
    expect(result.backfilled).toBe(1);
  });

  // ─── AC-4: per-ticker error isolation ─────────────────────────────────────

  it("AC-4: fetch error for one ticker does not stop others; error counted in result", async () => {
    db.prepare("INSERT INTO watchlist (code) VALUES (?)").run("VCB");
    db.prepare("INSERT INTO watchlist (code) VALUES (?)").run("FPT");
    db.prepare("INSERT INTO watchlist (code) VALUES (?)").run("HPG");
    // all have 0 rows → all need backfill

    const result = await runTaOhlcvBackfill({
      db,
      fetchFn: mockFetchThrowsFor("FPT", TA_MIN_ROWS),
    });

    // VCB and HPG should succeed, FPT should error
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("FPT");
    expect(result.backfilled).toBe(2); // VCB + HPG
  });

  // ─── AC-5: sparse result when fetch returns < TA_MIN_ROWS ─────────────────

  it("AC-5: ticker where API returns < TA_MIN_ROWS rows → counted as sparse", async () => {
    db.prepare("INSERT INTO watchlist (code) VALUES (?)").run("KBC");
    // KBC has 0 rows in DB → needs backfill
    // but API only returns 10 rows (newly listed or no history)

    const result = await runTaOhlcvBackfill({
      db,
      fetchFn: mockFetchSuccess(10), // < TA_MIN_ROWS
    });

    expect(result.sparse).toBe(1);
    expect(result.backfilled).toBe(0);
    // But rows still inserted (best-effort)
    const rowCount = (db.prepare("SELECT COUNT(*) as cnt FROM daily_ohlcv WHERE code = 'KBC'").get() as { cnt: number }).cnt;
    expect(rowCount).toBe(10);
  });

  // ─── AC-5b: empty watchlist ───────────────────────────────────────────────

  it("AC-5b: empty watchlist returns all-zero summary", async () => {
    let fetchCalled = false;
    const result = await runTaOhlcvBackfill({
      db,
      fetchFn: async () => { fetchCalled = true; return []; },
    });

    expect(fetchCalled).toBe(false);
    expect(result.covered).toBe(0);
    expect(result.backfilled).toBe(0);
    expect(result.sparse).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  // ─── AC-5c: multi-ticker summary correctness ──────────────────────────────

  it("AC-5c: 3 covered + 2 backfilled + 1 sparse + 1 error → correct summary counts", async () => {
    // 3 covered
    for (const code of ["VCB", "FPT", "HPG"]) {
      db.prepare("INSERT INTO watchlist (code) VALUES (?)").run(code);
      seedCleanRows(db, code, TA_MIN_ROWS);
    }
    // 2 needing backfill (returns enough rows)
    for (const code of ["VNM", "BID"]) {
      db.prepare("INSERT INTO watchlist (code) VALUES (?)").run(code);
    }
    // 1 sparse (fetch returns < TA_MIN_ROWS)
    db.prepare("INSERT INTO watchlist (code) VALUES (?)").run("KBC");
    // 1 error
    db.prepare("INSERT INTO watchlist (code) VALUES (?)").run("DXG");

    const result = await runTaOhlcvBackfill({
      db,
      fetchFn: async (code) => {
        if (code === "DXG") throw new Error("timeout");
        if (code === "KBC") return [{ code, date: "2024-01-01", open: 50000, high: 51000, low: 49000, close: 50500, nmVolume: 50000 }];
        const records = [];
        for (let i = 0; i < TA_MIN_ROWS; i++) {
          const date = `2024-${String(Math.floor(i / 28) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`;
          records.push({ code, date, open: 80000, high: 82000, low: 79000, close: 81000, nmVolume: 100000 });
        }
        return records;
      },
    });

    expect(result.covered).toBe(3);
    expect(result.backfilled).toBe(2);
    expect(result.sparse).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("DXG");
  });
});
