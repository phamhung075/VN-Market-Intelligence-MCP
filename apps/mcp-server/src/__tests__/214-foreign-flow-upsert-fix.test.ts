/**
 * Task 214 — upsertForeignFlow must NOT destroy non-flow columns.
 *
 * Bug: INSERT OR REPLACE does DELETE + INSERT, NULLing avg_volume_2w,
 * high_52w, low_52w, pct_from_* written by storeTradingStats.
 * Fix: ON CONFLICT(code, date) DO UPDATE SET targeting only the 4 flow cols.
 */

import { describe, it, expect } from "bun:test";
import Database from "bun:sqlite";
import { upsertForeignFlow } from "../infrastructure/db/vnstockStore.js";

function makeDb(): InstanceType<typeof Database> {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE vnstock_trading_stats (
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

describe("upsertForeignFlow — column preservation", () => {
  it("does NOT NULL avg_volume_2w / high_52w / low_52w on update", () => {
    const db = makeDb();

    // Seed row with price columns set by storeTradingStats
    db.exec(`
      INSERT INTO vnstock_trading_stats
        (code, date, avg_volume_2w, high_52w, low_52w, pct_from_high_52w, pct_from_low_52w,
         foreign_volume, foreign_room, current_holding_ratio, fetched_at)
      VALUES ('VNM', '2026-04-20', 1234567, 89.5, 65.0, -12.3, 18.7,
              500000, 999999, 0.35, datetime('now'))
    `);

    // Update only foreign-flow columns
    const affected = upsertForeignFlow(
      [
        {
          code: "VNM",
          date: "2026-04-20",
          foreign_volume: 600000,
          foreign_room: 888888,
          holding_ratio: 0.40,
          fetched_at: null,
        },
      ],
      db,
    );

    expect(affected).toBe(1);

    const row = db
      .query<{
        avg_volume_2w: number | null;
        high_52w: number | null;
        low_52w: number | null;
        pct_from_high_52w: number | null;
        pct_from_low_52w: number | null;
        foreign_volume: number;
        current_holding_ratio: number;
      }, []>(
        "SELECT avg_volume_2w, high_52w, low_52w, pct_from_high_52w, pct_from_low_52w, foreign_volume, current_holding_ratio FROM vnstock_trading_stats WHERE code='VNM' AND date='2026-04-20'",
      )
      .get();

    // Price columns MUST survive
    expect(row?.avg_volume_2w).toBe(1234567);
    expect(row?.high_52w).toBe(89.5);
    expect(row?.low_52w).toBe(65.0);
    expect(row?.pct_from_high_52w).toBe(-12.3);
    expect(row?.pct_from_low_52w).toBe(18.7);

    // Flow columns MUST be updated
    expect(row?.foreign_volume).toBe(600000);
    expect(row?.current_holding_ratio).toBe(0.40);
  });

  it("inserts new row when no conflict", () => {
    const db = makeDb();

    const affected = upsertForeignFlow(
      [
        {
          code: "HPG",
          date: "2026-04-20",
          foreign_volume: 1000000,
          foreign_room: 500000,
          holding_ratio: 0.25,
          fetched_at: null,
        },
      ],
      db,
    );

    expect(affected).toBe(1);

    const count = db
      .query<{ n: number }, []>(
        "SELECT COUNT(*) as n FROM vnstock_trading_stats WHERE code='HPG'",
      )
      .get();
    expect(count?.n).toBe(1);
  });

  it("normalises holding_ratio > 1 by dividing by 100", () => {
    const db = makeDb();

    upsertForeignFlow(
      [
        {
          code: "MBB",
          date: "2026-04-20",
          foreign_volume: 200000,
          foreign_room: 100000,
          holding_ratio: 48.87,   // VPS sends percentage form
          fetched_at: null,
        },
      ],
      db,
    );

    const row = db
      .query<{ current_holding_ratio: number }, []>(
        "SELECT current_holding_ratio FROM vnstock_trading_stats WHERE code='MBB'",
      )
      .get();

    expect(row?.current_holding_ratio).toBeCloseTo(0.4887, 4);
  });
});
