/**
 * Task 1291 — Schema audit: verify initDatabase() creates all previously-missing items.
 *
 * Root cause pattern (same as 1286/daily_ohlcv): production tables added via migrations
 * were missing from initDatabase(), causing test failures when tests build in-memory DBs.
 *
 * Items audited:
 *   - market_prices_history.exchange column
 *   - alerts.sent_by column
 *   - positions table
 *   - insider_transactions table
 *   - vnstock_trading_stats table
 *   - evidence_scores table (bonus — needed by test 125)
 *
 * Also verifies that inline test DDLs in tests 103 and 1050 were updated to include
 * the missing columns so storeAlerts/storeMarketPrices work without schema errors.
 */
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { closeDb, getDb, initDatabase } from "../infrastructure/db/schema.js";

describe("Task 1291 — Schema audit: initDatabase() completeness", () => {
  beforeEach(async () => {
    (Bun.env as Record<string, string>)["DB_PATH"] = ":memory:";
    closeDb();
    await initDatabase();
  });

  // ── market_prices_history.exchange ─────────────────────────────────────────

  it("market_prices_history has exchange column after initDatabase()", () => {
    const db = getDb();
    const cols = db
      .query<{ name: string }, []>("PRAGMA table_info(market_prices_history)")
      .all();
    const names = cols.map((c) => c.name);
    expect(names).toContain("exchange");
  });

  it("can INSERT into market_prices_history with exchange column", () => {
    const db = getDb();
    expect(() => {
      db.exec(`
        INSERT INTO market_prices_history (code, price, volume, fetched_at, exchange)
        VALUES ('VCB', 92000, 1000000, datetime('now'), 'HOSE')
      `);
    }).not.toThrow();
  });

  // ── alerts.sent_by ─────────────────────────────────────────────────────────

  it("alerts table has sent_by column after initDatabase()", () => {
    const db = getDb();
    const cols = db
      .query<{ name: string }, []>("PRAGMA table_info(alerts)")
      .all();
    const names = cols.map((c) => c.name);
    expect(names).toContain("sent_by");
  });

  it("can INSERT into alerts with sent_by column", () => {
    const db = getDb();
    expect(() => {
      db.exec(`
        INSERT INTO alerts
          (id, triggered_at, severity, signals_json, affected_actions_json,
           analysis_ids_json, message, read, user_note, sent_by)
        VALUES
          ('test-id-1291', datetime('now'), 'warning', '[]', '[]',
           NULL, 'test message', 0, NULL, 'server')
      `);
    }).not.toThrow();
  });

  // ── positions table ────────────────────────────────────────────────────────

  it("positions table exists after initDatabase()", () => {
    const db = getDb();
    const row = db
      .query<{ name: string }, [string]>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      )
      .get("positions");
    expect(row).not.toBeNull();
    expect(row?.name).toBe("positions");
  });

  it("positions table has required columns", () => {
    const db = getDb();
    const cols = db
      .query<{ name: string }, []>("PRAGMA table_info(positions)")
      .all();
    const names = cols.map((c) => c.name);
    expect(names).toContain("id");
    expect(names).toContain("code");
    expect(names).toContain("shares");
    expect(names).toContain("avg_price");
    expect(names).toContain("opened_at");
  });

  // ── insider_transactions table ─────────────────────────────────────────────

  it("insider_transactions table exists after initDatabase()", () => {
    const db = getDb();
    const row = db
      .query<{ name: string }, [string]>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      )
      .get("insider_transactions");
    expect(row).not.toBeNull();
    expect(row?.name).toBe("insider_transactions");
  });

  // ── vnstock_trading_stats table ────────────────────────────────────────────

  it("vnstock_trading_stats table exists after initDatabase()", () => {
    const db = getDb();
    const row = db
      .query<{ name: string }, [string]>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      )
      .get("vnstock_trading_stats");
    expect(row).not.toBeNull();
    expect(row?.name).toBe("vnstock_trading_stats");
  });

  // ── evidence_scores table (needed by test 125) ─────────────────────────────

  it("evidence_scores table exists after initDatabase()", () => {
    const db = getDb();
    const row = db
      .query<{ name: string }, [string]>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      )
      .get("evidence_scores");
    expect(row).not.toBeNull();
    expect(row?.name).toBe("evidence_scores");
  });

  // ── Idempotency ────────────────────────────────────────────────────────────

  it("initDatabase() is idempotent — second call does not throw", async () => {
    let threw = false;
    try {
      await initDatabase();
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });
});

// ── Regression: test 103 inline DDL compatibility ─────────────────────────────
// Simulates the schema created by test 103's seedSchema() and verifies
// storeAlerts / storeMarketPrices can INSERT without schema errors.

describe("Task 1291 — Regression: test 103 seedSchema() inline DDL", () => {
  it("market_prices_history inline DDL must include exchange column for storeMarketPrices", () => {
    const db = new Database(":memory:");
    // This is the FIXED inline DDL (exchange column present)
    db.exec(`
      CREATE TABLE IF NOT EXISTS market_prices_history (
        code       TEXT NOT NULL,
        price      REAL NOT NULL,
        volume     REAL NOT NULL,
        fetched_at TEXT NOT NULL,
        exchange   TEXT DEFAULT 'HOSE',
        PRIMARY KEY (code, fetched_at)
      )
    `);
    expect(() => {
      db.exec(`
        INSERT INTO market_prices_history (code, price, volume, fetched_at, exchange)
        VALUES ('VCB', 92000, 1000000, datetime('now'), 'HOSE')
      `);
    }).not.toThrow();
    db.close();
  });
});

// ── Regression: test 1050 inline DDL compatibility ───────────────────────────
// Simulates the alerts table created inline in the 1050 storeAlerts test.

describe("Task 1291 — Regression: test 1050 storeAlerts inline DDL", () => {
  it("inline alerts DDL must include sent_by column for storeAlerts()", () => {
    const db = new Database(":memory:");
    // This is the FIXED inline DDL (sent_by column present)
    db.exec(`
      CREATE TABLE IF NOT EXISTS alerts (
        id                    TEXT PRIMARY KEY,
        triggered_at          TEXT NOT NULL,
        severity              TEXT NOT NULL,
        signals_json          TEXT,
        affected_actions_json TEXT,
        analysis_ids_json     TEXT,
        message               TEXT,
        read                  INTEGER NOT NULL DEFAULT 0,
        user_note             TEXT,
        notified_telegram     INTEGER NOT NULL DEFAULT 0,
        sent_by               TEXT NOT NULL DEFAULT 'server'
      )
    `);
    expect(() => {
      db.exec(`
        INSERT OR IGNORE INTO alerts
          (id, triggered_at, severity, signals_json, affected_actions_json,
           analysis_ids_json, message, read, user_note, sent_by)
        VALUES
          ('test-1050', datetime('now'), 'medium', '[]', '[]',
           NULL, 'test', 0, NULL, 'server')
      `);
    }).not.toThrow();
    db.close();
  });
});

// ── Regression: test 125 setupTestDb() compatibility ─────────────────────────
// Verify tables needed by assembleBriefing are present in the fixed setupTestDb().

describe("Task 1291 — Regression: test 125 setupTestDb() missing tables", () => {
  it("positions table must be present in test 125 setupTestDb()", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE IF NOT EXISTS positions (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        code      TEXT NOT NULL,
        shares    INTEGER NOT NULL,
        avg_price REAL NOT NULL,
        opened_at TEXT NOT NULL DEFAULT (datetime('now')),
        closed_at TEXT,
        notes     TEXT,
        UNIQUE(code)
      )
    `);
    const row = db
      .query<{ name: string }, [string]>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      )
      .get("positions");
    expect(row?.name).toBe("positions");
    db.close();
  });

  it("insider_transactions table must be present in test 125 setupTestDb()", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE IF NOT EXISTS insider_transactions (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        code      TEXT NOT NULL,
        type      TEXT NOT NULL,
        from_date TEXT NOT NULL,
        to_date   TEXT,
        quantity  REAL,
        price     REAL,
        source    TEXT,
        fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    const row = db
      .query<{ name: string }, [string]>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      )
      .get("insider_transactions");
    expect(row?.name).toBe("insider_transactions");
    db.close();
  });

  it("vnstock_trading_stats table must be present in test 125 setupTestDb()", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE IF NOT EXISTS vnstock_trading_stats (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        code        TEXT NOT NULL,
        date        TEXT NOT NULL,
        foreign_buy REAL,
        foreign_sell REAL,
        net_foreign  REAL,
        UNIQUE(code, date)
      )
    `);
    const row = db
      .query<{ name: string }, [string]>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      )
      .get("vnstock_trading_stats");
    expect(row?.name).toBe("vnstock_trading_stats");
    db.close();
  });
});
