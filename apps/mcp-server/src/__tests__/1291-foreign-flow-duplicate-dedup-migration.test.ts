/**
 * FIX-1291 — Production DB dedup-before-index migration
 *
 * Root cause:
 *   ALTER TABLE added `date TEXT NOT NULL DEFAULT '1970-01-01'` to an
 *   existing table. Every pre-existing row got date='1970-01-01'. With N
 *   tickers already stored, the table now has N duplicate (code,'1970-01-01')
 *   pairs. CREATE UNIQUE INDEX throws on duplicates → index never created →
 *   ON CONFLICT(code, date) fires "no matching PRIMARY KEY or UNIQUE
 *   constraint" on every push-foreign-flow call (every 30s in production).
 *
 * Fix: runVnstockMigrations() must DELETE duplicate rows (keep MAX(id) per
 *   code+date) BEFORE attempting CREATE UNIQUE INDEX.
 *
 * Tests operate on the real in-memory DB (DB_PATH=:memory: via setup.ts)
 * by closing and rebuilding it with the legacy schema, then calling the
 * production runVnstockMigrations() function directly.
 *
 * TC-1: runVnstockMigrations() on DB with duplicate (code,'1970-01-01')
 *        rows must NOT throw and must create the UNIQUE index.
 * TC-2: After migration, upsertForeignFlow with same code+date must not throw.
 * TC-3: Migration keeps one row per (code, date) — no over-deletion.
 * TC-4: Migration is idempotent on a DB that already has no duplicates.
 * TC-5: upsertForeignFlow for same code on different dates → two rows exist.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { closeDb, getDb } from "../infrastructure/db/schema.js";
import {
  runVnstockMigrations,
  upsertForeignFlow,
} from "../infrastructure/db/vnstockStore.js";
import type { ForeignFlowUpsertItem } from "../domain/models/shared-types.js";

// ---------------------------------------------------------------------------
// Helpers — build legacy schema directly on the in-memory DB
// ---------------------------------------------------------------------------

/**
 * Tear down the module-level DB singleton and rebuild it with the legacy
 * schema: vnstock_trading_stats WITHOUT UNIQUE constraint, date column added
 * via ALTER TABLE so all existing rows get date='1970-01-01'.
 */
function setupLegacyDbWithDuplicates(): void {
  closeDb();
  // After closeDb(), getDb() returns a fresh :memory: DB (no tables yet).
  // Guard: DROP first in case initDatabase() was called by a previous test file
  // in the same Bun worker (module-level DB singleton is shared across test files).
  const db = getDb();
  db.exec(`DROP TABLE IF EXISTS vnstock_trading_stats`);

  // Recreate the table as it looked BEFORE the UNIQUE constraint was added
  db.exec(`
    CREATE TABLE IF NOT EXISTS vnstock_trading_stats (
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
      fetched_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Insert rows as if they existed before the date column
  db.exec(`
    INSERT INTO vnstock_trading_stats
      (code, foreign_room, foreign_volume, current_holding_ratio, fetched_at)
    VALUES
      ('VNM', 1000000, 500000, 0.48, datetime('now', '-3 days')),
      ('BID', 2000000, 800000, 0.30, datetime('now', '-3 days')),
      ('TCB', 1500000, 600000, 0.45, datetime('now', '-3 days')),
      ('VNM', 1100000, 520000, 0.49, datetime('now', '-2 days')),
      ('BID', 2100000, 810000, 0.31, datetime('now', '-2 days')),
      ('VNM', 1200000, 530000, 0.50, datetime('now', '-1 days'))
  `);

  // Simulate ALTER TABLE adding date column — all rows get '1970-01-01'
  db.exec(
    `ALTER TABLE vnstock_trading_stats ADD COLUMN date TEXT NOT NULL DEFAULT '1970-01-01'`,
  );
  // At this point: VNM×3, BID×2, TCB×1 — all with date='1970-01-01'
}

/**
 * Tear down the module-level DB singleton and rebuild it with modern schema
 * (UNIQUE(code, date) in CREATE TABLE, no existing rows).
 */
function setupModernDb(): void {
  closeDb();
  const db = getDb();
  db.exec(`DROP TABLE IF EXISTS vnstock_trading_stats`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS vnstock_trading_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      date TEXT NOT NULL DEFAULT '1970-01-01',
      foreign_room INTEGER,
      foreign_volume INTEGER,
      current_holding_ratio REAL,
      max_holding_ratio REAL,
      fetched_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, date)
    )
  `);
}

function rowCount(): number {
  const db = getDb();
  return (
    db
      .prepare<{ cnt: number }, []>(
        `SELECT COUNT(*) as cnt FROM vnstock_trading_stats`,
      )
      .get()?.cnt ?? 0
  );
}

function getUniqueIndexNames(): string[] {
  return getDb()
    .prepare<{ name: string; unique: number }, []>(
      `PRAGMA index_list('vnstock_trading_stats')`,
    )
    .all()
    .filter((r) => r.unique === 1)
    .map((r) => r.name);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FIX-1291 — dedup-before-index in runVnstockMigrations()", () => {
  afterEach(() => {
    closeDb();
  });

  // TC-1 ─────────────────────────────────────────────────────────────────────
  it("TC-1: runVnstockMigrations() on DB with duplicate (code,'1970-01-01') rows must not throw and must create UNIQUE index", () => {
    setupLegacyDbWithDuplicates();
    // Before fix: CREATE UNIQUE INDEX throws because duplicates exist
    expect(() => runVnstockMigrations()).not.toThrow();

    const uniqueIndexes = getUniqueIndexNames();
    expect(uniqueIndexes.length).toBeGreaterThanOrEqual(1);
    const hasDedupIndex = uniqueIndexes.some(
      (n) =>
        n === "uq_vnstats_code_date" || n.startsWith("sqlite_autoindex_"),
    );
    expect(hasDedupIndex).toBe(true);
  });

  // TC-2 ─────────────────────────────────────────────────────────────────────
  it("TC-2: After migration on legacy duplicate DB, upsertForeignFlow with same code+date must not throw", () => {
    setupLegacyDbWithDuplicates();
    runVnstockMigrations();

    const items: ForeignFlowUpsertItem[] = [
      {
        code: "VNM",
        date: "1970-01-01",
        foreign_volume: 999,
        foreign_room: 888,
        holding_ratio: 0.50,
        fetched_at: null,
      },
      {
        // duplicate in same batch — dedup must handle this too
        code: "VNM",
        date: "1970-01-01",
        foreign_volume: 1000,
        foreign_room: 900,
        holding_ratio: 0.51,
        fetched_at: null,
      },
    ];

    expect(() => upsertForeignFlow(items)).not.toThrow();

    // Last value wins after batch dedup
    const row = getDb()
      .prepare(
        `SELECT * FROM vnstock_trading_stats WHERE code = 'VNM' AND date = '1970-01-01'`,
      )
      .get() as Record<string, unknown> | undefined;
    expect(row).toBeDefined();
    expect(row?.foreign_volume).toBe(1000);
  });

  // TC-3 ─────────────────────────────────────────────────────────────────────
  it("TC-3: Migration keeps one row per (code, date) — does not over-delete distinct codes", () => {
    setupLegacyDbWithDuplicates();
    // VNM×3, BID×2, TCB×1 all with date='1970-01-01' → 6 rows
    expect(rowCount()).toBe(6);

    runVnstockMigrations();

    // After dedup: VNM×1, BID×1, TCB×1 → 3 rows
    expect(rowCount()).toBe(3);

    const codes = getDb()
      .prepare<{ code: string }, []>(
        `SELECT DISTINCT code FROM vnstock_trading_stats ORDER BY code`,
      )
      .all()
      .map((r) => r.code);
    expect(codes).toEqual(["BID", "TCB", "VNM"]);
  });

  // TC-4 ─────────────────────────────────────────────────────────────────────
  it("TC-4: runVnstockMigrations() is idempotent on a DB that already has no duplicates", () => {
    setupModernDb();
    getDb().exec(`
      INSERT INTO vnstock_trading_stats
        (code, date, foreign_volume, foreign_room, fetched_at)
      VALUES ('VIC', '2026-04-25', 100, 200, datetime('now'))
    `);

    expect(() => runVnstockMigrations()).not.toThrow();
    expect(() => runVnstockMigrations()).not.toThrow(); // second call
    expect(rowCount()).toBe(1);
  });

  // TC-5 ─────────────────────────────────────────────────────────────────────
  it("TC-5: upsertForeignFlow same code different dates → two rows (daily history preserved)", () => {
    setupModernDb();

    const items: ForeignFlowUpsertItem[] = [
      {
        code: "HPG",
        date: "2026-04-24",
        foreign_volume: 100,
        foreign_room: 200,
        holding_ratio: 0.40,
        fetched_at: null,
      },
      {
        code: "HPG",
        date: "2026-04-25",
        foreign_volume: 110,
        foreign_room: 210,
        holding_ratio: 0.41,
        fetched_at: null,
      },
    ];

    expect(() => upsertForeignFlow(items)).not.toThrow();
    expect(rowCount()).toBe(2);

    const db = getDb();
    const r1 = db
      .prepare(
        `SELECT foreign_volume FROM vnstock_trading_stats WHERE code='HPG' AND date='2026-04-24'`,
      )
      .get() as { foreign_volume: number } | undefined;
    const r2 = db
      .prepare(
        `SELECT foreign_volume FROM vnstock_trading_stats WHERE code='HPG' AND date='2026-04-25'`,
      )
      .get() as { foreign_volume: number } | undefined;

    expect(r1?.foreign_volume).toBe(100);
    expect(r2?.foreign_volume).toBe(110);
  });
});
