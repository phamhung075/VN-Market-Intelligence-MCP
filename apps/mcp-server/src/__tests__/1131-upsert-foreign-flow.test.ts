Bun.env["DB_PATH"] = ":memory:";

// src/__tests__/1131-upsert-foreign-flow.test.ts
import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";

// We call these with an in-memory Database injected as the optional db param.
// Import paths use .js extension for ESM compatibility.
import { upsertForeignFlow } from "../infrastructure/db/vnstockStore.js";
import type { ForeignFlowUpsertItem } from "../domain/models/shared-types.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ---------------------------------------------------------------------------
// In-memory schema bootstrap
// ---------------------------------------------------------------------------

function createTestDb(): Database {
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
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, date)
    )
  `);

  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

/** Insert a seed row with all price/financial columns populated. */
function seedRow(
  db: Database,
  code: string,
  date: string,
  overrides: Partial<{
    avg_volume_2w: number;
    high_52w: number;
    low_52w: number;
    pct_from_high_52w: number;
    pct_from_low_52w: number;
    max_holding_ratio: number;
    foreign_volume: number;
    foreign_room: number;
    current_holding_ratio: number;
  }> = {},
): void {
  db.prepare(
    `INSERT INTO vnstock_trading_stats
       (code, date, avg_volume_2w, high_52w, low_52w, pct_from_high_52w, pct_from_low_52w,
        max_holding_ratio, foreign_volume, foreign_room, current_holding_ratio, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).run(
    code,
    date,
    overrides.avg_volume_2w ?? 500000,
    overrides.high_52w ?? 98000,
    overrides.low_52w ?? 72000,
    overrides.pct_from_high_52w ?? -5.2,
    overrides.pct_from_low_52w ?? 12.4,
    overrides.max_holding_ratio ?? 0.49,
    overrides.foreign_volume ?? 0,
    overrides.foreign_room ?? 0,
    overrides.current_holding_ratio ?? 0,
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type StatsRow = {
  foreign_volume: number | null;
  foreign_room: number | null;
  current_holding_ratio: number | null;
  avg_volume_2w: number | null;
  high_52w: number | null;
  low_52w: number | null;
  max_holding_ratio: number | null;
  fetched_at: string | null;
};

function queryRow(db: Database, code: string, date: string): StatsRow | null {
  return db
    .prepare<StatsRow, [string, string]>(
      `SELECT foreign_volume, foreign_room, current_holding_ratio,
              avg_volume_2w, high_52w, low_52w, max_holding_ratio, fetched_at
       FROM vnstock_trading_stats WHERE code = ? AND date = ?`,
    )
    .get(code, date) as StatsRow | null;
}

function countRows(db: Database, code: string): number {
  const row = db
    .prepare<{ cnt: number }, [string]>(
      "SELECT COUNT(*) AS cnt FROM vnstock_trading_stats WHERE code = ?",
    )
    .get(code);
  return row?.cnt ?? 0;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Task 1131 — upsertForeignFlow", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  // AC-1: returns 1 for a single-item upsert
  it("returns 1 when upserting a single item", () => {
    seedRow(db, "VNM", "2026-04-12");

    const item: ForeignFlowUpsertItem = {
      code: "VNM",
      date: "2026-04-12",
      foreign_volume: 1500000,
      foreign_room: 50000000,
      holding_ratio: 0.4887,
      fetched_at: null,
    };

    const affected = upsertForeignFlow([item], db);
    expect(affected).toBe(1);
  });

  // AC-1: foreign columns are written correctly
  it("writes the four foreign columns correctly on an existing row", () => {
    seedRow(db, "VNM", "2026-04-12");

    const item: ForeignFlowUpsertItem = {
      code: "VNM",
      date: "2026-04-12",
      foreign_volume: 1500000,
      foreign_room: 50000000,
      holding_ratio: 0.4887,
      fetched_at: "2026-04-12T09:30:00Z",
    };

    upsertForeignFlow([item], db);

    const row = queryRow(db, "VNM", "2026-04-12");
    expect(row).not.toBeNull();
    expect(row!.foreign_volume).toBe(1500000);
    expect(row!.foreign_room).toBe(50000000);
    expect(Math.abs((row!.current_holding_ratio ?? 0) - 0.4887)).toBeLessThan(1e-9);
  });

  // AC-1: critical invariant — non-foreign columns MUST NOT be zeroed out
  it("does NOT overwrite avg_volume_2w, high_52w, low_52w after upsert", () => {
    seedRow(db, "VNM", "2026-04-12", {
      avg_volume_2w: 500000,
      high_52w: 98000,
      low_52w: 72000,
    });

    upsertForeignFlow(
      [{ code: "VNM", date: "2026-04-12", foreign_volume: 999, foreign_room: 1, holding_ratio: 0.1, fetched_at: null }],
      db,
    );

    const row = queryRow(db, "VNM", "2026-04-12");
    expect(row!.avg_volume_2w).toBe(500000);
    expect(row!.high_52w).toBe(98000);
    expect(row!.low_52w).toBe(72000);
  });

  // AC-1: max_holding_ratio must also be left unchanged
  it("does NOT overwrite max_holding_ratio after upsert", () => {
    seedRow(db, "VNM", "2026-04-12", { max_holding_ratio: 0.49 });

    upsertForeignFlow(
      [{ code: "VNM", date: "2026-04-12", foreign_volume: 999, foreign_room: 1, holding_ratio: 0.1, fetched_at: null }],
      db,
    );

    const row = queryRow(db, "VNM", "2026-04-12");
    expect(row!.max_holding_ratio).toBe(0.49);
  });

  // AC-1: upsert on same (code, date) updates the row, not duplicates
  it("updates the row on conflict, does not insert a duplicate", () => {
    seedRow(db, "VNM", "2026-04-12");

    upsertForeignFlow(
      [{ code: "VNM", date: "2026-04-12", foreign_volume: 100, foreign_room: 200, holding_ratio: 0.1, fetched_at: null }],
      db,
    );
    upsertForeignFlow(
      [{ code: "VNM", date: "2026-04-12", foreign_volume: 999, foreign_room: 888, holding_ratio: 0.2, fetched_at: null }],
      db,
    );

    expect(countRows(db, "VNM")).toBe(1);
    const row = queryRow(db, "VNM", "2026-04-12");
    expect(row!.foreign_volume).toBe(999);
    expect(row!.foreign_room).toBe(888);
    expect(Math.abs((row!.current_holding_ratio ?? 0) - 0.2)).toBeLessThan(1e-9);
  });

  // AC-3: holding_ratio normalisation — value > 1.0 should be divided by 100
  it("normalises holding_ratio when value > 1.0 (e.g. 48.87 → 0.4887)", () => {
    seedRow(db, "VNM", "2026-04-12");

    upsertForeignFlow(
      [{ code: "VNM", date: "2026-04-12", foreign_volume: 1, foreign_room: 1, holding_ratio: 48.87, fetched_at: null }],
      db,
    );

    const row = queryRow(db, "VNM", "2026-04-12");
    const ratio = row!.current_holding_ratio ?? 0;
    expect(Math.abs(ratio - 0.4887)).toBeLessThan(1e-9);
  });

  // AC-3: holding_ratio exactly 1.0 is NOT divided
  it("does not modify holding_ratio when value <= 1.0", () => {
    seedRow(db, "VNM", "2026-04-12");

    upsertForeignFlow(
      [{ code: "VNM", date: "2026-04-12", foreign_volume: 1, foreign_room: 1, holding_ratio: 1.0, fetched_at: null }],
      db,
    );

    const row = queryRow(db, "VNM", "2026-04-12");
    expect(Math.abs((row!.current_holding_ratio ?? 0) - 1.0)).toBeLessThan(1e-9);
  });

  // null holding_ratio stored as null
  it("stores null holding_ratio as null without error", () => {
    seedRow(db, "VNM", "2026-04-12");

    upsertForeignFlow(
      [{ code: "VNM", date: "2026-04-12", foreign_volume: 1, foreign_room: 1, holding_ratio: null, fetched_at: null }],
      db,
    );

    const row = queryRow(db, "VNM", "2026-04-12");
    expect(row!.current_holding_ratio).toBeNull();
  });

  // fetched_at: null triggers server-generated datetime
  it("stores a non-null fetched_at when fetched_at=null (server-generated)", () => {
    seedRow(db, "VNM", "2026-04-12");

    upsertForeignFlow(
      [{ code: "VNM", date: "2026-04-12", foreign_volume: 1, foreign_room: 1, holding_ratio: 0.1, fetched_at: null }],
      db,
    );

    const row = queryRow(db, "VNM", "2026-04-12");
    expect(row!.fetched_at).not.toBeNull();
    expect(typeof row!.fetched_at).toBe("string");
    expect((row!.fetched_at as string).length).toBeGreaterThan(0);
  });

  // fetched_at: explicit value is preserved
  it("stores the explicit fetched_at when provided", () => {
    seedRow(db, "VNM", "2026-04-12");

    const ts = "2026-04-12T09:30:00Z";
    upsertForeignFlow(
      [{ code: "VNM", date: "2026-04-12", foreign_volume: 1, foreign_room: 1, holding_ratio: 0.1, fetched_at: ts }],
      db,
    );

    const row = queryRow(db, "VNM", "2026-04-12");
    expect(row!.fetched_at).toBe(ts);
  });

  // Batch upsert: multiple stocks
  it("batch upserts multiple stocks and returns correct count", () => {
    seedRow(db, "VNM", "2026-04-12");
    seedRow(db, "FPT", "2026-04-12");
    seedRow(db, "VCB", "2026-04-12");

    const items: ForeignFlowUpsertItem[] = [
      { code: "VNM", date: "2026-04-12", foreign_volume: 100, foreign_room: 200, holding_ratio: 0.1, fetched_at: null },
      { code: "FPT", date: "2026-04-12", foreign_volume: 300, foreign_room: 400, holding_ratio: 0.2, fetched_at: null },
      { code: "VCB", date: "2026-04-12", foreign_volume: 500, foreign_room: 600, holding_ratio: 0.3, fetched_at: null },
    ];

    const affected = upsertForeignFlow(items, db);
    expect(affected).toBe(3);

    const vnm = queryRow(db, "VNM", "2026-04-12");
    const fpt = queryRow(db, "FPT", "2026-04-12");
    const vcb = queryRow(db, "VCB", "2026-04-12");

    expect(vnm!.foreign_volume).toBe(100);
    expect(fpt!.foreign_volume).toBe(300);
    expect(vcb!.foreign_volume).toBe(500);
  });

  // Batch preserves non-foreign columns across all rows
  it("preserves price columns for all rows in a batch upsert", () => {
    seedRow(db, "VNM", "2026-04-12", { avg_volume_2w: 111111, high_52w: 90000, low_52w: 60000 });
    seedRow(db, "FPT", "2026-04-12", { avg_volume_2w: 222222, high_52w: 80000, low_52w: 50000 });

    upsertForeignFlow(
      [
        { code: "VNM", date: "2026-04-12", foreign_volume: 1, foreign_room: 1, holding_ratio: 0.1, fetched_at: null },
        { code: "FPT", date: "2026-04-12", foreign_volume: 2, foreign_room: 2, holding_ratio: 0.2, fetched_at: null },
      ],
      db,
    );

    const vnm = queryRow(db, "VNM", "2026-04-12");
    const fpt = queryRow(db, "FPT", "2026-04-12");

    expect(vnm!.avg_volume_2w).toBe(111111);
    expect(vnm!.high_52w).toBe(90000);
    expect(vnm!.low_52w).toBe(60000);
    expect(fpt!.avg_volume_2w).toBe(222222);
    expect(fpt!.high_52w).toBe(80000);
    expect(fpt!.low_52w).toBe(50000);
  });

  // New row INSERT (no pre-existing row with same code+date)
  it("inserts a new row when no conflict exists", () => {
    // Do NOT seed a row — let upsertForeignFlow create it
    const item: ForeignFlowUpsertItem = {
      code: "TCB",
      date: "2026-04-12",
      foreign_volume: 777,
      foreign_room: 888,
      holding_ratio: 0.25,
      fetched_at: "2026-04-12T10:00:00Z",
    };

    const affected = upsertForeignFlow([item], db);
    expect(affected).toBe(1);

    const row = queryRow(db, "TCB", "2026-04-12");
    expect(row).not.toBeNull();
    expect(row!.foreign_volume).toBe(777);
    expect(row!.foreign_room).toBe(888);
    expect(Math.abs((row!.current_holding_ratio ?? 0) - 0.25)).toBeLessThan(1e-9);
  });

  // Empty array: returns 0
  it("returns 0 for an empty input array", () => {
    const affected = upsertForeignFlow([], db);
    expect(affected).toBe(0);
  });

  // Legacy schema fallback (no date column)
  it("falls back to ON CONFLICT(code) when the date column is absent", () => {
    // Create a legacy-schema DB (no date column, UNIQUE on code)
    const legacyDb = new Database(":memory:");
    initNewsTables(legacyDb);
    initMarketDataTables(legacyDb);
    initSystemTables(legacyDb);
    legacyDb.exec(`
      CREATE TABLE vnstock_trading_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL,
        foreign_room INTEGER,
        foreign_volume INTEGER,
        current_holding_ratio REAL,
        max_holding_ratio REAL,
        avg_volume_2w INTEGER,
        high_52w REAL,
        low_52w REAL,
        pct_from_high_52w REAL,
        pct_from_low_52w REAL,
        fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(code)
      )
    `);

    // Seed a legacy row
    legacyDb.exec(
      `INSERT INTO vnstock_trading_stats (code, avg_volume_2w, high_52w, low_52w, fetched_at)
       VALUES ('VNM', 500000, 98000, 72000, datetime('now'))`,
    );

    const item: ForeignFlowUpsertItem = {
      code: "VNM",
      date: "2026-04-12",
      foreign_volume: 1234,
      foreign_room: 5678,
      holding_ratio: 0.3,
      fetched_at: null,
    };

    // Must not throw, must return 1
    const affected = upsertForeignFlow([item], legacyDb);
    expect(affected).toBe(1);

    const row = legacyDb
      .prepare("SELECT foreign_volume, avg_volume_2w FROM vnstock_trading_stats WHERE code='VNM'")
      .get() as { foreign_volume: number; avg_volume_2w: number };

    expect(row.foreign_volume).toBe(1234);
    expect(row.avg_volume_2w).toBe(500000); // preserved
  });
});
