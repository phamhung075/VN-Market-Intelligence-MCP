/**
 * Task 1286 — daily_ohlcv table created by initDatabase()
 *
 * Acceptance criteria:
 * AC1: initDatabase() creates the daily_ohlcv table with correct columns
 *      (code, date, open, high, low, close, volume, updated_at).
 * AC2: The table has a composite primary key on (code, date).
 * AC3: Tests 179 (listOpenPositions) and 172 (assembleBriefing) pass
 *      when run after the schema fix — regression gate on the two most
 *      representative failing callers.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initDatabase, closeDb, getDb } from "../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// AC1 + AC2: initDatabase() creates daily_ohlcv with expected schema
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1286 — initDatabase() creates daily_ohlcv table", () => {
  beforeEach(async () => {
    process.env["DB_PATH"] = ":memory:";
    closeDb();
    await initDatabase();
  });

  afterEach(() => {
    closeDb();
  });

  it("AC1: daily_ohlcv table exists after initDatabase()", () => {
    const db = getDb();
    const row = db
      .query<{ name: string }, []>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='daily_ohlcv'`,
      )
      .get();
    expect(row).not.toBeNull();
    expect(row!.name).toBe("daily_ohlcv");
  });

  it("AC1: daily_ohlcv has required columns: code, date, open, high, low, close, volume, updated_at", () => {
    const db = getDb();
    const cols = db
      .query<{ name: string }, []>(`PRAGMA table_info(daily_ohlcv)`)
      .all()
      .map((r) => r.name);

    expect(cols).toContain("code");
    expect(cols).toContain("date");
    expect(cols).toContain("open");
    expect(cols).toContain("high");
    expect(cols).toContain("low");
    expect(cols).toContain("close");
    expect(cols).toContain("volume");
    expect(cols).toContain("updated_at");
  });

  it("AC2: INSERT with duplicate (code, date) raises UNIQUE constraint error", () => {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run("VCB", "2026-01-01", 80000, 82000, 79000, 81000, 500000, now);

    expect(() => {
      db.prepare(
        `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run("VCB", "2026-01-01", 80000, 82000, 79000, 81000, 500000, now);
    }).toThrow();
  });

  it("AC2: INSERT OR REPLACE on duplicate (code, date) succeeds and updates the row", () => {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run("VCB", "2026-01-01", 80000, 82000, 79000, 81000, 500000, now);

    db.prepare(
      `INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run("VCB", "2026-01-01", 81000, 83000, 80000, 82500, 600000, now);

    const row = db
      .query<{ close: number }, []>(
        `SELECT close FROM daily_ohlcv WHERE code = 'VCB' AND date = '2026-01-01'`,
      )
      .get();
    expect(row).not.toBeNull();
    expect(row!.close).toBe(82500);
  });

  it("AC1: initDatabase() is idempotent — calling it twice does not throw", async () => {
    await expect(initDatabase()).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC3: Regression — listOpenPositions (test 179 representative caller)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1286 — AC3 regression: listOpenPositions uses daily_ohlcv fallback", () => {
  it("listOpenPositions does not throw when daily_ohlcv table exists in db", async () => {
    const db = new Database(":memory:");

    // Minimal schema mirroring what test 179 sets up + daily_ohlcv added
    db.exec(`
      CREATE TABLE IF NOT EXISTS positions (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        code      TEXT NOT NULL UNIQUE,
        shares    INTEGER NOT NULL,
        avg_price REAL NOT NULL,
        opened_at TEXT NOT NULL DEFAULT (datetime('now')),
        closed_at TEXT,
        notes     TEXT
      );
      CREATE TABLE IF NOT EXISTS market_prices (
        code       TEXT PRIMARY KEY,
        price      REAL,
        change_amt REAL,
        change_pct REAL,
        volume     REAL,
        updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS daily_ohlcv (
        code       TEXT NOT NULL,
        date       TEXT NOT NULL,
        open       REAL NOT NULL,
        high       REAL NOT NULL,
        low        REAL NOT NULL,
        close      REAL NOT NULL,
        volume     REAL NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (code, date)
      );
    `);

    // Should not throw
    const { listOpenPositions } = await import("../infrastructure/db/positionStore.js");
    const rows = listOpenPositions(db);
    expect(Array.isArray(rows)).toBe(true);
    expect(rows).toHaveLength(0);
  });

  it("listOpenPositions falls back to daily_ohlcv close when market_prices has no row", async () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE IF NOT EXISTS positions (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        code      TEXT NOT NULL UNIQUE,
        shares    INTEGER NOT NULL,
        avg_price REAL NOT NULL,
        opened_at TEXT NOT NULL DEFAULT (datetime('now')),
        closed_at TEXT,
        notes     TEXT
      );
      CREATE TABLE IF NOT EXISTS market_prices (
        code       TEXT PRIMARY KEY,
        price      REAL,
        change_amt REAL,
        change_pct REAL,
        volume     REAL,
        updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS daily_ohlcv (
        code       TEXT NOT NULL,
        date       TEXT NOT NULL,
        open       REAL NOT NULL,
        high       REAL NOT NULL,
        low        REAL NOT NULL,
        close      REAL NOT NULL,
        volume     REAL NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (code, date)
      );
    `);

    db.prepare(
      `INSERT INTO positions (code, shares, avg_price, opened_at)
       VALUES ('FPT', 100, 120000, datetime('now'))`,
    ).run();

    db.prepare(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES ('FPT', '2026-01-15', 121000, 123000, 119000, 122500, 200000, datetime('now'))`,
    ).run();

    const { listOpenPositions } = await import("../infrastructure/db/positionStore.js");
    const rows = listOpenPositions(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.currentPrice).toBe(122500);
  });
});
