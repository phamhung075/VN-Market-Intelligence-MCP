/**
 * 1972-vndirect-ohlcv-null-coercion.test.ts
 *
 * Regression test: VnDirect OHLCV backfill must NOT insert rows with null/missing
 * OHLC fields into daily_ohlcv. The coercion bug wrote open=0 when open was null,
 * and low=0 when low was null and close=0 — corrupting TA computations.
 *
 * AC-1: record with null low (valid open/high/close) → NOT inserted (no low=0 row)
 * AC-2: record with null open (valid high/low/close) → NOT inserted (no open=0 row)
 * AC-3: record with all 4 OHLCV fields present → IS inserted correctly
 * AC-4: record with null close → still skipped (pre-existing guard regression)
 * AC-5: asymmetric fixture (null low, valid open=10/high=40/close=20) → no low=0 in DB
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { runOhlcvBackfill } from "../infrastructure/fetchers/ohlcvBackfill.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ---------------------------------------------------------------------------
// Minimal in-memory DB factory
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
    );
  `);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

// ---------------------------------------------------------------------------
// Helper: inject mock fetch into runOhlcvBackfill
// runOhlcvBackfill uses global fetch — we mock it per test with globalThis.fetch
// ---------------------------------------------------------------------------

type VnDirectOhlcvRecord = {
  code?: string;
  date?: string;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  nmVolume?: number;
};

function mockFetchReturning(records: VnDirectOhlcvRecord[]): () => void {
  const original = globalThis.fetch;
  const mockImpl = async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    return new Response(
      JSON.stringify({ data: records, totalCount: records.length }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  // Assign preconnect to satisfy the typeof fetch shape required by strict TS
  (mockImpl as unknown as typeof fetch).preconnect = (url: string | URL) => {
    void url;
  };
  globalThis.fetch = mockImpl as typeof fetch;
  return () => { globalThis.fetch = original; };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Task 1972 — VnDirect OHLCV null-coercion fix", () => {
  let db: Database;
  let restore: () => void;

  beforeEach(() => {
    db = makeDb();
    // seed a ticker so backfill has something to process
    db.prepare("INSERT INTO watchlist (code) VALUES (?)").run("VCB");
    // fresh daily_ohlcv (0 rows) → resume logic does not skip via count>100
  });

  afterEach(() => {
    if (restore) restore();
    db.close();
  });

  it("AC-1: record with null low (valid open/high/close) — NOT inserted, no low=0 row", async () => {
    restore = mockFetchReturning([
      { code: "VCB", date: "2024-03-01", open: 88000, high: 91000, low: null, close: 90000, nmVolume: 500000 },
    ]);

    await runOhlcvBackfill(db, { fromDate: "2024-03-01", toDate: "2024-03-01", delayMs: 0 });

    const rows = db.prepare("SELECT * FROM daily_ohlcv WHERE code = 'VCB'").all() as Array<{ low: number }>;
    expect(rows).toHaveLength(0); // record must be skipped
  });

  it("AC-2: record with null open (valid high/low/close) — NOT inserted, no open=0 row", async () => {
    restore = mockFetchReturning([
      { code: "VCB", date: "2024-03-02", open: null, high: 91000, low: 87000, close: 90000, nmVolume: 500000 },
    ]);

    await runOhlcvBackfill(db, { fromDate: "2024-03-02", toDate: "2024-03-02", delayMs: 0 });

    const rows = db.prepare("SELECT * FROM daily_ohlcv WHERE code = 'VCB'").all() as Array<{ open: number }>;
    expect(rows).toHaveLength(0); // record must be skipped
  });

  it("AC-3: record with all 4 OHLCV fields present — IS inserted correctly", async () => {
    restore = mockFetchReturning([
      { code: "VCB", date: "2024-03-03", open: 88000, high: 91000, low: 87000, close: 90000, nmVolume: 600000 },
    ]);

    await runOhlcvBackfill(db, { fromDate: "2024-03-03", toDate: "2024-03-03", delayMs: 0 });

    const rows = db.prepare("SELECT * FROM daily_ohlcv WHERE code = 'VCB'").all() as Array<{
      open: number; high: number; low: number; close: number; volume: number
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.open).toBe(88000);
    expect(rows[0]!.high).toBe(91000);
    expect(rows[0]!.low).toBe(87000);
    expect(rows[0]!.close).toBe(90000);
    expect(rows[0]!.volume).toBe(600000);
  });

  it("AC-4: record with null close — still skipped (pre-existing guard regression)", async () => {
    restore = mockFetchReturning([
      { code: "VCB", date: "2024-03-04", open: 88000, high: 91000, low: 87000, close: null, nmVolume: 500000 },
    ]);

    await runOhlcvBackfill(db, { fromDate: "2024-03-04", toDate: "2024-03-04", delayMs: 0 });

    const rows = db.prepare("SELECT * FROM daily_ohlcv WHERE code = 'VCB'").all();
    expect(rows).toHaveLength(0);
  });

  it("AC-5: asymmetric fixture (null low, open=10/high=40/close=20) — no low=0 inserted in DB", async () => {
    // The canonical 1971-style asymmetric OHLCV fixture — different distinct values per field.
    // If the bug is present: low=0 appears. If fixed: record is skipped entirely.
    restore = mockFetchReturning([
      { code: "VCB", date: "2024-03-05", open: 10, high: 40, low: null, close: 20, nmVolume: 1000 },
    ]);

    await runOhlcvBackfill(db, { fromDate: "2024-03-05", toDate: "2024-03-05", delayMs: 0 });

    const zeroLowRows = db
      .prepare("SELECT * FROM daily_ohlcv WHERE code = 'VCB' AND low = 0")
      .all();
    expect(zeroLowRows).toHaveLength(0); // must not produce low=0

    const allRows = db.prepare("SELECT * FROM daily_ohlcv WHERE code = 'VCB'").all();
    expect(allRows).toHaveLength(0); // must be skipped entirely
  });
});
