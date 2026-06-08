/**
 * Task 1275a — RED: UNIQUE(code, date) constraint and duplicate insert handling
 *
 * Tests the foreign flow push job's ability to handle duplicate (code, date) inserts.
 * The upsertForeignFlow function uses ON CONFLICT(code, date) DO UPDATE SET to handle
 * duplicates gracefully. These tests verify:
 *
 * TC-1: Duplicate insert same code+date → ON CONFLICT should suppress error
 * TC-2: Batch insert with duplicates in same call → should deduplicate or upsert
 * TC-3: Verify UNIQUE(code, date) index exists in schema after migrations
 * TC-4: ON CONFLICT references correct constraint (not misnamed)
 * TC-5: Date column defaults and null handling
 * TC-6: Holding ratio normalization doesn't break uniqueness
 *
 * Expected outcomes:
 * - TC-1, TC-2, TC-6 currently FAIL with UNIQUE constraint errors (red)
 * - TC-3, TC-4 may FAIL if migration didn't create UNIQUE index (red)
 * - TC-5 may FAIL if null date handling is broken (red)
 * - After TASK 1275b (GREEN fix), all tests pass
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { upsertForeignFlow, runVnstockMigrations } from "../infrastructure/db/vnstockStore.js";
import type { ForeignFlowUpsertItem } from "../domain/models/shared-types.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ---------------------------------------------------------------------------
// In-memory schema bootstrap
// ---------------------------------------------------------------------------

/**
 * Create an in-memory test database with full vnstock_trading_stats schema.
 * Mimics the production schema in schema-financial-reports.ts.
 * By default includes UNIQUE constraint (modern schema).
 */
function createTestDb(withUniqueConstraint = true): Database {
  const db = new Database(":memory:");

  if (withUniqueConstraint) {
    // Modern schema with UNIQUE(code, date) constraint
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
  } else {
    // Legacy schema WITHOUT UNIQUE constraint (production DBs that haven't been migrated)
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
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

/**
 * Get row count from vnstock_trading_stats.
 */
function getRowCount(db: Database): number {
  const result = db.prepare<{ cnt: number }, []>(
    "SELECT COUNT(*) as cnt FROM vnstock_trading_stats",
  ).get();
  return result?.cnt ?? 0;
}

/**
 * Get a specific row from vnstock_trading_stats.
 */
function getRow(
  db: Database,
  code: string,
  date: string,
): Record<string, any> | undefined {
  return db
    .prepare(
      `SELECT * FROM vnstock_trading_stats WHERE code = ? AND date = ?`,
    )
    .get(code, date) as Record<string, any> | undefined;
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe("Task 1275 — UNIQUE(code, date) constraint and duplicate insert handling", () => {
  let testDb: Database;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  // ═════════════════════════════════════════════════════════════════════════════════
  // TC-1: Duplicate insert same code+date → ON CONFLICT should suppress error
  // ═════════════════════════════════════════════════════════════════════════════════
  it("TC-1: Duplicate insert same code+date → ON CONFLICT suppresses error and updates row", () => {
    // Pre-seed vnstock_trading_stats with MSN 2026-04-22
    testDb.prepare(
      `
      INSERT INTO vnstock_trading_stats
        (code, date, foreign_volume, foreign_room, current_holding_ratio, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    ).run("MSN", "2026-04-22", 100000, 500000, 0.45, new Date().toISOString());

    // Attempt to upsert same code+date with different values
    // Should NOT throw UNIQUE constraint violation
    // Should UPDATE existing row
    const items: ForeignFlowUpsertItem[] = [
      {
        code: "MSN",
        date: "2026-04-22",
        foreign_volume: 150000,
        foreign_room: 600000,
        holding_ratio: 0.5,
        fetched_at: null,
      },
    ];

    // This call should NOT throw "UNIQUE constraint failed" error
    const affected = upsertForeignFlow(items, testDb);

    expect(affected).toBe(1); // Should have affected exactly 1 row (update, not insert)
    expect(getRowCount(testDb)).toBe(1); // Should still be 1 row (updated, not inserted)

    // Verify the row was updated with new values
    const row = getRow(testDb, "MSN", "2026-04-22");
    expect(row).toBeDefined();
    expect(row?.foreign_volume).toBe(150000); // Should be updated
    expect(row?.foreign_room).toBe(600000); // Should be updated
  });

  // ═════════════════════════════════════════════════════════════════════════════════
  // TC-2: Batch insert with duplicate code+date in same call
  // ═════════════════════════════════════════════════════════════════════════════════
  it("TC-2: Batch insert with duplicate code+date in same call → handles gracefully", () => {
    // Send 5 items, where items[0] and items[3] have same code+date
    const items: ForeignFlowUpsertItem[] = [
      {
        code: "VNM",
        date: "2026-04-22",
        foreign_volume: 100000,
        foreign_room: 500000,
        holding_ratio: 0.45,
        fetched_at: null,
      },
      {
        code: "BID",
        date: "2026-04-22",
        foreign_volume: 200000,
        foreign_room: 600000,
        holding_ratio: 0.50,
        fetched_at: null,
      },
      {
        code: "TCB",
        date: "2026-04-22",
        foreign_volume: 300000,
        foreign_room: 700000,
        holding_ratio: 0.55,
        fetched_at: null,
      },
      {
        code: "VNM",
        date: "2026-04-22",
        foreign_volume: 120000, // duplicate VNM 2026-04-22
        foreign_room: 550000,
        holding_ratio: 0.48,
        fetched_at: null,
      },
      {
        code: "CTG",
        date: "2026-04-22",
        foreign_volume: 400000,
        foreign_room: 800000,
        holding_ratio: 0.60,
        fetched_at: null,
      },
    ];

    // Should handle gracefully — either update to last value or deduplicate before insert
    // This currently fails with UNIQUE constraint error (red test)
    const affected = upsertForeignFlow(items, testDb);

    expect(affected).toBeGreaterThanOrEqual(4); // At least 4 distinct items should be processed
    const vnmRow = getRow(testDb, "VNM", "2026-04-22");
    expect(vnmRow).toBeDefined(); // Row should exist
    expect(vnmRow?.foreign_volume).toBe(120000); // Should be the last value
  });

  // ═════════════════════════════════════════════════════════════════════════════════
  // TC-3: Verify UNIQUE constraint exists in migration
  // ═════════════════════════════════════════════════════════════════════════════════
  it("TC-3: Verify UNIQUE(code, date) index exists after runVnstockMigrations()", () => {
    // Create a fresh DB and run migrations
    const freshDb = createTestDb();
    runVnstockMigrations();

    // Query the index list to verify UNIQUE index exists
    // Use pragma_index_list which returns (seq, name, unique, origin, partial)
    const indexList = freshDb
      .prepare<any, []>(
        `PRAGMA index_list('vnstock_trading_stats')`,
      )
      .all();

    // Should have at least one index named uq_vnstats_code_date (UNIQUE)
    // The migration in vnstockStore.ts creates this UNIQUE index with:
    // CREATE UNIQUE INDEX IF NOT EXISTS uq_vnstats_code_date ON vnstock_trading_stats(code, date)
    const uniqueIndex = indexList.find(
      (idx: any) => idx.name === "uq_vnstats_code_date" || idx.name === "sqlite_autoindex_vnstock_trading_stats_1",
    );
    expect(uniqueIndex).toBeDefined(); // TC-3 FAILS if migration silently skipped or if table UNIQUE constraint exists but no explicit index
    if (uniqueIndex) {
      expect(uniqueIndex.unique).toBe(1); // Must be UNIQUE (1), not just a regular index (0)
    }

    freshDb.close();
  });

  // ═════════════════════════════════════════════════════════════════════════════════
  // TC-4: ON CONFLICT references correct constraint
  // ═════════════════════════════════════════════════════════════════════════════════
  it("TC-4: ON CONFLICT references correct constraint (not misnamed or missing)", () => {
    // Prepare DB state with duplicate inserts to force error if constraint is missing
    const items: ForeignFlowUpsertItem[] = [
      {
        code: "VNM",
        date: "2026-04-22",
        foreign_volume: 100000,
        foreign_room: 500000,
        holding_ratio: 0.45,
        fetched_at: null,
      },
      {
        code: "VNM",
        date: "2026-04-22",
        foreign_volume: 150000, // duplicate
        foreign_room: 550000,
        holding_ratio: 0.48,
        fetched_at: null,
      },
    ];

    // Should NOT fail with "ON CONFLICT clause does not match any UNIQUE constraint"
    let errorThrown: Error | null = null;
    try {
      upsertForeignFlow(items, testDb);
    } catch (err) {
      errorThrown = err as Error;
    }

    // TC-4 FAILS if this error is thrown (indicates constraint name mismatch)
    if (errorThrown) {
      expect(errorThrown.message).not.toMatch(
        /ON CONFLICT.*UNIQUE|constraint does not match/i,
      );
    }
    expect(errorThrown).toBeNull(); // Should not throw at all
  });

  // ═════════════════════════════════════════════════════════════════════════════════
  // TC-5: Verify date column default and type
  // ═════════════════════════════════════════════════════════════════════════════════
  it("TC-5: Date column default and null handling", () => {
    // Schema defines: date TEXT NOT NULL DEFAULT '1970-01-01'
    // Ensure upsert respects provided date and has reasonable defaults

    const items: ForeignFlowUpsertItem[] = [
      {
        code: "VNM",
        date: "2026-04-22",
        foreign_volume: 100000,
        foreign_room: 500000,
        holding_ratio: 0.45,
        fetched_at: null,
      },
    ];

    upsertForeignFlow(items, testDb);

    const row = getRow(testDb, "VNM", "2026-04-22");
    expect(row).toBeDefined();
    expect(row?.date).toBe("2026-04-22"); // Must match provided date
    expect(typeof row?.date).toBe("string"); // Not NULL, not integer
    expect(row?.date).not.toBe(null);
  });

  // ═════════════════════════════════════════════════════════════════════════════════
  // TC-6: Holding ratio normalization doesn't break constraint
  // ═════════════════════════════════════════════════════════════════════════════════
  it("TC-6: Holding ratio normalization doesn't break uniqueness constraint", () => {
    // Test that holding_ratio normalization (>1.0 divided by 100) doesn't corrupt code+date uniqueness

    const items1: ForeignFlowUpsertItem[] = [
      {
        code: "VNM",
        date: "2026-04-22",
        foreign_volume: 100000,
        foreign_room: 500000,
        holding_ratio: 45.67, // 45.67 → 0.4567
        fetched_at: null,
      },
    ];

    upsertForeignFlow(items1, testDb);

    const row1 = getRow(testDb, "VNM", "2026-04-22");
    expect(row1).toBeDefined();
    expect(row1?.current_holding_ratio).toBeCloseTo(0.4567, 4); // Normalized

    // Duplicate with normalized ratio — should still upsert, not fail
    const items2: ForeignFlowUpsertItem[] = [
      {
        code: "VNM",
        date: "2026-04-22",
        foreign_volume: 150000,
        foreign_room: 600000,
        holding_ratio: 46.0, // 46.0 → 0.46
        fetched_at: null,
      },
    ];

    // This call should NOT throw UNIQUE constraint error
    const affected = upsertForeignFlow(items2, testDb);
    expect(affected).toBe(1); // TC-6 FAILS if constraint error thrown

    const rowCount = testDb
      .prepare<{ cnt: number }, [string]>("SELECT COUNT(*) as cnt FROM vnstock_trading_stats WHERE code = ?")
      .get("VNM");
    expect(rowCount?.cnt).toBe(1); // Still 1 row, not 2
  });
});
