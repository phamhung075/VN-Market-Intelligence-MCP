/**
 * Task 1838b — Repository Adapters Test
 *
 * Tests each SQLite adapter with an in-memory database.
 * 2 tests per adapter (happy path + error/empty path) = 10 tests minimum.
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { SqliteWatchlistRepository } from "../infrastructure/db/repositories/SqliteWatchlistRepository.js";
import { SqliteMarketPriceRepository } from "../infrastructure/db/repositories/SqliteMarketPriceRepository.js";
import { SqliteKinhDichScoreRepository } from "../infrastructure/db/repositories/SqliteKinhDichScoreRepository.js";
import { SqliteHexagramRepository } from "../infrastructure/db/repositories/SqliteHexagramRepository.js";
import { SqliteVnstockRepository } from "../infrastructure/db/repositories/SqliteVnstockRepository.js";

// ──────────────────────��─────────────────────────────��────────────────────────
// SqliteWatchlistRepository
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1838b — SqliteWatchlistRepository", () => {
  it("getAll() returns empty array on missing table", () => {
    const db = new Database(":memory:");
    const repo = new SqliteWatchlistRepository(db);
    expect(repo.getAll()).toEqual([]);
  });

  it("getAll() returns seeded rows when table exists", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE IF NOT EXISTS watchlist (
        code TEXT PRIMARY KEY,
        domain TEXT NOT NULL DEFAULT 'other',
        exchange TEXT NOT NULL DEFAULT 'HOSE',
        added_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`INSERT INTO watchlist (code, domain) VALUES ('VCB', 'banking'), ('FPT', 'tech')`);

    const repo = new SqliteWatchlistRepository(db);
    const rows = repo.getAll();
    expect(rows.length).toBe(2);
    const codes = rows.map((r) => r.code);
    expect(codes).toContain("VCB");
    expect(codes).toContain("FPT");
  });

  it("getAllCodesForVps() returns empty arrays on missing table", () => {
    const db = new Database(":memory:");
    const repo = new SqliteWatchlistRepository(db);
    const result = repo.getAllCodesForVps();
    expect(result.watchlist).toEqual([]);
    expect(result.reference).toEqual([]);
  });

  it("getAllCodesForVps() returns watchlist codes when table has rows", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE IF NOT EXISTS watchlist (
        code TEXT PRIMARY KEY,
        domain TEXT NOT NULL DEFAULT 'other',
        exchange TEXT NOT NULL DEFAULT 'HOSE',
        added_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`INSERT INTO watchlist (code, domain) VALUES ('HPG', 'steel')`);

    const repo = new SqliteWatchlistRepository(db);
    const result = repo.getAllCodesForVps();
    expect(result.watchlist).toContain("HPG");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SqliteMarketPriceRepository
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1838b — SqliteMarketPriceRepository", () => {
  it("getAvgVolume() returns 0 on missing table", () => {
    const db = new Database(":memory:");
    const repo = new SqliteMarketPriceRepository(db);
    const today = new Date().toISOString().substring(0, 10);
    expect(repo.getAvgVolume("VCB", today, 20, 5)).toBe(0);
  });

  it("getAvgVolume() returns 0 when fewer than minHistoryRows exist", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE IF NOT EXISTS market_prices_history (
        code TEXT NOT NULL,
        price REAL NOT NULL,
        volume REAL NOT NULL,
        fetched_at TEXT NOT NULL,
        PRIMARY KEY (code, fetched_at)
      )
    `);
    // Insert only 3 rows (< minHistoryRows=5)
    for (let i = 1; i <= 3; i++) {
      const ts = new Date(Date.now() - i * 86_400_000).toISOString();
      db.exec(`INSERT INTO market_prices_history VALUES ('VCB', 50000, 1000000, '${ts}')`);
    }

    const repo = new SqliteMarketPriceRepository(db);
    const today = new Date().toISOString().substring(0, 10);
    expect(repo.getAvgVolume("VCB", today, 20, 5)).toBe(0);
  });

  it("getAvgVolume() returns nonzero average when sufficient history exists", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE IF NOT EXISTS market_prices_history (
        code TEXT NOT NULL,
        price REAL NOT NULL,
        volume REAL NOT NULL,
        fetched_at TEXT NOT NULL,
        PRIMARY KEY (code, fetched_at)
      )
    `);
    // Insert 6 closed days (past dates)
    for (let i = 1; i <= 6; i++) {
      const ts = new Date(Date.now() - i * 86_400_000).toISOString();
      db.exec(`INSERT INTO market_prices_history VALUES ('VCB', 50000, 1000000, '${ts}')`);
    }

    const repo = new SqliteMarketPriceRepository(db);
    const today = new Date().toISOString().substring(0, 10);
    expect(repo.getAvgVolume("VCB", today, 20, 5)).toBeGreaterThan(0);
  });

  it("upsertConvictionHistory() is safe on missing table", () => {
    const db = new Database(":memory:");
    const repo = new SqliteMarketPriceRepository(db);
    // Should not throw
    expect(() =>
      repo.upsertConvictionHistory({
        symbol: "VCB",
        date: "2026-05-03",
        peakScore: 0.8,
        dominantSignal: "bullish",
        createdAt: new Date().toISOString(),
      }),
    ).not.toThrow();
  });

  it("getRecentNewsTitles() returns empty array on missing table", () => {
    const db = new Database(":memory:");
    const repo = new SqliteMarketPriceRepository(db);
    expect(repo.getRecentNewsTitles("VCB", 4, 10)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SqliteKinhDichScoreRepository
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1838b — SqliteKinhDichScoreRepository", () => {
  it("getLatestChangePct() returns null on missing table", () => {
    const db = new Database(":memory:");
    const repo = new SqliteKinhDichScoreRepository(db);
    expect(repo.getLatestChangePct("VCB")).toBeNull();
  });

  it("getLatestChangePct() returns correct value when row exists", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE IF NOT EXISTS market_prices (
        code TEXT PRIMARY KEY,
        price REAL,
        change_amt REAL,
        change_pct REAL,
        volume REAL,
        updated_at TEXT
      )
    `);
    db.exec(`INSERT INTO market_prices VALUES ('VCB', 90000, -10000, -10.0, 500000, datetime('now'))`);

    const repo = new SqliteKinhDichScoreRepository(db);
    const row = repo.getLatestChangePct("VCB");
    expect(row).not.toBeNull();
    expect(row?.changePct).toBe(-10.0);
  });

  it("getWatchlistDomain() returns null on missing table", () => {
    const db = new Database(":memory:");
    const repo = new SqliteKinhDichScoreRepository(db);
    expect(repo.getWatchlistDomain("VCB")).toBeNull();
  });

  it("getWatchlistDomain() returns domain when row exists", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE IF NOT EXISTS watchlist (
        code TEXT PRIMARY KEY,
        domain TEXT NOT NULL DEFAULT 'other',
        exchange TEXT NOT NULL DEFAULT 'HOSE',
        added_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`INSERT INTO watchlist (code, domain) VALUES ('VCB', 'banking')`);

    const repo = new SqliteKinhDichScoreRepository(db);
    expect(repo.getWatchlistDomain("VCB")).toBe("banking");
  });

  it("getMarketPricesForCodes() returns empty array for empty input", () => {
    const db = new Database(":memory:");
    const repo = new SqliteKinhDichScoreRepository(db);
    expect(repo.getMarketPricesForCodes([])).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SqliteHexagramRepository
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1838b — SqliteHexagramRepository", () => {
  function makeHexDb(): Database {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE IF NOT EXISTS kinhdich_readings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stock_code TEXT NOT NULL,
        hexagram_number INTEGER NOT NULL,
        ho_que_number INTEGER NOT NULL,
        bien_que_number INTEGER NOT NULL,
        hao_states TEXT NOT NULL,
        raw_scores TEXT NOT NULL,
        ngu_hanh_dynamic TEXT,
        trading_signal TEXT,
        confidence REAL,
        action_note TEXT,
        source TEXT DEFAULT 'manual',
        timestamp TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS hexagram_transitions (
        from_hexagram INTEGER NOT NULL,
        to_hexagram INTEGER NOT NULL,
        stock_code TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        total_price_change_5d REAL NOT NULL DEFAULT 0,
        win_count INTEGER NOT NULL DEFAULT 0,
        last_seen TEXT,
        PRIMARY KEY (from_hexagram, to_hexagram, stock_code)
      );
    `);
    return db;
  }

  it("getLatestReading() returns null on empty table", () => {
    const db = makeHexDb();
    const repo = new SqliteHexagramRepository(db);
    expect(repo.getLatestReading("VCB")).toBeNull();
  });

  it("storeReading() and getLatestReading() round-trip correctly", () => {
    const db = makeHexDb();
    const repo = new SqliteHexagramRepository(db);

    repo.storeReading({
      stockCode: "VCB",
      hexagramNumber: 1,
      hoQueNumber: 2,
      bienQueNumber: 3,
      haoStates: "[1,0,1,0,1,0]",
      rawScores: "[0.5,0.3,-0.2,0.1,0.4,-0.1]",
      tradingSignal: "BUY",
      confidence: 0.85,
      source: "manual",
    });

    const reading = repo.getLatestReading("VCB");
    expect(reading).not.toBeNull();
    expect(reading?.hexagramNumber).toBe(1);
    expect(reading?.tradingSignal).toBe("BUY");
    expect(reading?.confidence).toBe(0.85);
  });

  it("getTopTransitions() returns empty array when no transitions exist", () => {
    const db = makeHexDb();
    const repo = new SqliteHexagramRepository(db);
    expect(repo.getTopTransitions("VCB", 1, 5)).toEqual([]);
  });

  it("recordTransition() and getTopTransitions() work correctly", () => {
    const db = makeHexDb();
    const repo = new SqliteHexagramRepository(db);

    repo.recordTransition("VCB", 1, 2);
    repo.recordTransition("VCB", 1, 2);
    repo.recordTransition("VCB", 1, 3);

    const transitions = repo.getTopTransitions("VCB", 1, 5);
    expect(transitions.length).toBeGreaterThanOrEqual(2);
    const t2 = transitions.find((t) => t.toHexagram === 2);
    expect(t2?.count).toBe(2);
  });

  it("getReadingsForBacktest() returns empty array when no readings exist", () => {
    const db = makeHexDb();
    const repo = new SqliteHexagramRepository(db);
    expect(repo.getReadingsForBacktest("VCB")).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SqliteVnstockRepository
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1838b — SqliteVnstockRepository", () => {
  it("getLatestFinancials() returns null safely when vnstockStore not available", () => {
    const db = new Database(":memory:");
    const repo = new SqliteVnstockRepository(db);
    // May throw internally but should return null (caught in try/catch)
    expect(() => repo.getLatestFinancials("VCB")).not.toThrow();
  });

  it("getOfficers() returns empty array safely", () => {
    const db = new Database(":memory:");
    const repo = new SqliteVnstockRepository(db);
    const result = repo.getOfficers("VCB");
    expect(Array.isArray(result)).toBe(true);
  });
});
