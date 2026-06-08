/**
 * FIX-1275 — Regression: UNIQUE constraint failed on vnstock_trading_stats.code
 *
 * Bug: "UNIQUE constraint failed: vnstock_trading_stats.code" was thrown 3x in
 * production. Two root causes:
 *
 *   (A) VPS sends duplicate code entries within a single batch (same code
 *       appears twice in the payload). Second INSERT in the transaction hits
 *       the UNIQUE constraint before the ON CONFLICT clause can fire.
 *
 *   (B) Consecutive VPS pushes on the same day (code+date already exists).
 *       ON CONFLICT(code, date) must silently upsert instead of crashing.
 *
 *   (C) Legacy schema (UNIQUE(code) alone, no date column): duplicate code in
 *       batch also crashes without dedup guard.
 *
 * Fix: upsertForeignFlow() in vnstockStore.ts —
 *   1. Deduplicate items by (code, date) key BEFORE entering the transaction,
 *      last-occurrence wins.
 *   2. Primary path: INSERT ... ON CONFLICT(code, date) DO UPDATE SET.
 *   3. Legacy path: INSERT ... ON CONFLICT(code) DO UPDATE SET.
 *
 * These tests cover the exact failure modes observed in production.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { upsertForeignFlow } from "../infrastructure/db/vnstockStore.js";
import type { ForeignFlowUpsertItem } from "../domain/models/shared-types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a modern schema DB with UNIQUE(code, date) */
function makeModernDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS vnstock_trading_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      date TEXT NOT NULL DEFAULT '1970-01-01',
      foreign_room INTEGER,
      foreign_volume INTEGER,
      current_holding_ratio REAL,
      max_holding_ratio REAL,
      avg_volume_2w INTEGER,
      high_52w REAL,
      low_52w REAL,
      pct_from_high_52w REAL,
      pct_from_low_52w REAL,
      fetched_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, date)
    )
  `);
  return db;
}

/** Create a legacy schema DB with UNIQUE(code) only, no date column */
function makeLegacyDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS vnstock_trading_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      foreign_room INTEGER,
      foreign_volume INTEGER,
      current_holding_ratio REAL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  return db;
}

function rowCount(db: Database): number {
  return db.prepare<{ cnt: number }, []>(
    "SELECT COUNT(*) as cnt FROM vnstock_trading_stats"
  ).get()?.cnt ?? 0;
}

function getRow(db: Database, code: string, date?: string): Record<string, unknown> | null {
  if (date) {
    return db.prepare(
      "SELECT * FROM vnstock_trading_stats WHERE code = ? AND date = ?"
    ).get(code, date) as Record<string, unknown> | null;
  }
  return db.prepare(
    "SELECT * FROM vnstock_trading_stats WHERE code = ? ORDER BY rowid DESC LIMIT 1"
  ).get(code) as Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Scenario A: VPS sends duplicate code in single batch (modern schema)
// ---------------------------------------------------------------------------

describe("FIX-1275 — Scenario A: duplicate code in single batch (modern UNIQUE code+date)", () => {
  let db: Database;
  beforeEach(() => { db = makeModernDb(); });
  afterEach(() => { db.close(); });

  it("does not throw UNIQUE constraint error when batch has duplicate code+date", () => {
    const batch: ForeignFlowUpsertItem[] = [
      { code: "VNM", date: "2026-04-25", foreign_volume: 200000, foreign_room: 1000000, holding_ratio: 0.45, fetched_at: null },
      { code: "BID", date: "2026-04-25", foreign_volume: 100000, foreign_room: 800000,  holding_ratio: 0.50, fetched_at: null },
      { code: "VNM", date: "2026-04-25", foreign_volume: 250000, foreign_room: 1050000, holding_ratio: 0.47, fetched_at: null }, // dup
    ];
    expect(() => upsertForeignFlow(batch, db)).not.toThrow();
  });

  it("duplicate code+date in batch → exactly 1 row per unique code", () => {
    const batch: ForeignFlowUpsertItem[] = [
      { code: "VNM", date: "2026-04-25", foreign_volume: 200000, foreign_room: 1000000, holding_ratio: 0.45, fetched_at: null },
      { code: "VNM", date: "2026-04-25", foreign_volume: 250000, foreign_room: 1050000, holding_ratio: 0.47, fetched_at: null }, // dup
    ];
    upsertForeignFlow(batch, db);
    expect(rowCount(db)).toBe(1);
  });

  it("last-occurrence value wins when batch has duplicate code", () => {
    const batch: ForeignFlowUpsertItem[] = [
      { code: "HPG", date: "2026-04-25", foreign_volume: 100000, foreign_room: 500000, holding_ratio: 0.30, fetched_at: null },
      { code: "HPG", date: "2026-04-25", foreign_volume: 999999, foreign_room: 600000, holding_ratio: 0.35, fetched_at: null }, // dup — wins
    ];
    upsertForeignFlow(batch, db);
    const row = getRow(db, "HPG", "2026-04-25");
    expect(row?.foreign_volume).toBe(999999);
    expect(row?.foreign_room).toBe(600000);
  });
});

// ---------------------------------------------------------------------------
// Scenario B: Consecutive VPS pushes — same code+date already exists
// ---------------------------------------------------------------------------

describe("FIX-1275 — Scenario B: consecutive pushes same code+date (ON CONFLICT upsert)", () => {
  let db: Database;
  beforeEach(() => { db = makeModernDb(); });
  afterEach(() => { db.close(); });

  it("second push with same code+date does not throw", () => {
    const first: ForeignFlowUpsertItem[] = [
      { code: "VCB", date: "2026-04-25", foreign_volume: 300000, foreign_room: 2000000, holding_ratio: 0.22, fetched_at: null },
    ];
    upsertForeignFlow(first, db);
    expect(rowCount(db)).toBe(1);

    const second: ForeignFlowUpsertItem[] = [
      { code: "VCB", date: "2026-04-25", foreign_volume: 350000, foreign_room: 2100000, holding_ratio: 0.23, fetched_at: null },
    ];
    expect(() => upsertForeignFlow(second, db)).not.toThrow();
    expect(rowCount(db)).toBe(1); // Still 1 row — updated, not inserted
  });

  it("second push updates existing row with new values", () => {
    const first: ForeignFlowUpsertItem[] = [
      { code: "TCB", date: "2026-04-25", foreign_volume: 100000, foreign_room: 700000, holding_ratio: 0.15, fetched_at: null },
    ];
    upsertForeignFlow(first, db);

    const second: ForeignFlowUpsertItem[] = [
      { code: "TCB", date: "2026-04-25", foreign_volume: 180000, foreign_room: 750000, holding_ratio: 0.18, fetched_at: null },
    ];
    upsertForeignFlow(second, db);

    const row = getRow(db, "TCB", "2026-04-25");
    expect(row?.foreign_volume).toBe(180000); // Updated
    expect(row?.foreign_room).toBe(750000);   // Updated
  });

  it("third push (3x crash scenario from bug report) also succeeds", () => {
    const push = (vol: number): void => {
      upsertForeignFlow([
        { code: "MSN", date: "2026-04-25", foreign_volume: vol, foreign_room: 500000, holding_ratio: 0.40, fetched_at: null },
      ], db);
    };
    expect(() => push(100000)).not.toThrow();
    expect(() => push(120000)).not.toThrow();
    expect(() => push(140000)).not.toThrow(); // Third push — was the 3rd crash in production
    expect(rowCount(db)).toBe(1);
    const row = getRow(db, "MSN", "2026-04-25");
    expect(row?.foreign_volume).toBe(140000); // Last value wins
  });
});

// ---------------------------------------------------------------------------
// Scenario C: Legacy schema (UNIQUE code only) — duplicate code in batch
// ---------------------------------------------------------------------------

describe("FIX-1275 — Scenario C: duplicate code in batch (legacy UNIQUE code only)", () => {
  let db: Database;
  beforeEach(() => { db = makeLegacyDb(); });
  afterEach(() => { db.close(); });

  it("does not throw UNIQUE constraint error on legacy schema with duplicate code", () => {
    const batch: ForeignFlowUpsertItem[] = [
      { code: "FPT", date: "2026-04-25", foreign_volume: 200000, foreign_room: 900000, holding_ratio: 0.55, fetched_at: null },
      { code: "FPT", date: "2026-04-25", foreign_volume: 220000, foreign_room: 950000, holding_ratio: 0.56, fetched_at: null }, // dup
    ];
    expect(() => upsertForeignFlow(batch, db)).not.toThrow();
  });

  it("legacy schema: duplicate code in batch → exactly 1 row", () => {
    const batch: ForeignFlowUpsertItem[] = [
      { code: "MWG", date: "2026-04-25", foreign_volume: 100000, foreign_room: 400000, holding_ratio: 0.60, fetched_at: null },
      { code: "MWG", date: "2026-04-25", foreign_volume: 130000, foreign_room: 450000, holding_ratio: 0.61, fetched_at: null }, // dup
    ];
    upsertForeignFlow(batch, db);
    expect(rowCount(db)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Holding ratio normalisation (>1.0 → /100) does not corrupt uniqueness
// ---------------------------------------------------------------------------

describe("FIX-1275 — holding ratio normalisation preserves uniqueness", () => {
  let db: Database;
  beforeEach(() => { db = makeModernDb(); });
  afterEach(() => { db.close(); });

  it("percentage-form ratio (e.g. 48.87) normalised to 0.4887 without extra row", () => {
    const batch: ForeignFlowUpsertItem[] = [
      { code: "SSI", date: "2026-04-25", foreign_volume: 500000, foreign_room: 3000000, holding_ratio: 48.87, fetched_at: null },
      { code: "SSI", date: "2026-04-25", foreign_volume: 520000, foreign_room: 3100000, holding_ratio: 49.0,  fetched_at: null }, // dup
    ];
    expect(() => upsertForeignFlow(batch, db)).not.toThrow();
    expect(rowCount(db)).toBe(1);
    const row = getRow(db, "SSI", "2026-04-25");
    expect(row?.current_holding_ratio).toBeCloseTo(0.49, 4);
  });
});
