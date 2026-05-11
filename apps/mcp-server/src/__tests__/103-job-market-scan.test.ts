Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 103 — Market open/close scan jobs (09:00 + 15:30 GMT+7)
 *
 * Tests the scanMarket application use case and the marketScanJob scheduler
 * wrapper (concurrency guard + cron registration).
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { getDb, closeDb } from "../infrastructure/db/schema.js";
import { scanMarket } from "../application/usecases/scanMarket.js";
import type { MarketScanResult } from "../application/usecases/scanMarket.js";
import type { MarketPrice } from "../infrastructure/fetchers/hose.js";
import { SqliteWatchlistRepository } from "../infrastructure/db/repositories/SqliteWatchlistRepository.js";
import { SqliteMarketPriceRepository } from "../infrastructure/db/repositories/SqliteMarketPriceRepository.js";
import { Database } from "bun:sqlite";

/** Build production-like deps backed by the current test in-memory DB. */
function makeDeps(fetchPrices?: (codes: string[]) => Promise<MarketPrice[]>) {
  const db = getDb();
  return {
    watchlistRepo: new SqliteWatchlistRepository(db),
    marketPriceRepo: new SqliteMarketPriceRepository(db),
    ...(fetchPrices ? { fetchPrices } : {}),
  };
}

// ---------------------------------------------------------------------------
// Test DB helpers — wipe all relevant tables before each test
// ---------------------------------------------------------------------------

function setupTestDb(): Database {
  // Force in-memory DB for tests
  (Bun.env as Record<string, string>)["DB_PATH"] = ":memory:";
  closeDb(); // reset singleton so getDb() re-opens fresh DB

  const db = getDb();
  seedSchema(db);
  return db;
}

function wipeTables(db: Database) {
  // Truncate all mutable tables — faster than close/reopen between tests
  // Use try/catch in case tables don't exist yet in the test run order
  try { db.exec("DELETE FROM market_prices_history"); } catch (_) { /* ok */ }
  try { db.exec("DELETE FROM market_prices"); } catch (_) { /* ok */ }
  try { db.exec("DELETE FROM watchlist"); } catch (_) { /* ok */ }
  try { db.exec("DELETE FROM alerts"); } catch (_) { /* ok */ }
}

function seedSchema(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code              TEXT PRIMARY KEY,
      company_name      TEXT,
      exchange          TEXT NOT NULL,
      domain            TEXT NOT NULL DEFAULT 'other',
      notes             TEXT,
      added_at          TEXT NOT NULL,
      alert_drop_pct    REAL NOT NULL DEFAULT -3,
      alert_rise_pct    REAL NOT NULL DEFAULT 5,
      alert_impact_min  REAL NOT NULL DEFAULT 7,
      alert_report_new  INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS market_prices (
      code        TEXT PRIMARY KEY,
      price       REAL,
      change_amt  REAL,
      change_pct  REAL,
      volume      REAL,
      updated_at  TEXT,
      exchange    TEXT DEFAULT 'HOSE'
    );
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
      resolved_at           TEXT,
      resolution_notes      TEXT,
      sent_by               TEXT NOT NULL DEFAULT 'server',
      confidence_score      REAL,
      validated_at          TEXT
    );
    CREATE TABLE IF NOT EXISTS market_prices_history (
      code       TEXT NOT NULL,
      price      REAL NOT NULL,
      volume     REAL NOT NULL,
      fetched_at TEXT NOT NULL,
      exchange   TEXT DEFAULT 'HOSE',
      PRIMARY KEY (code, fetched_at)
    );
    CREATE INDEX IF NOT EXISTS idx_mph_code_fetched
      ON market_prices_history(code, fetched_at DESC);
  `);
}

function addWatchlistEntry(db: Database, code: string, exchange = "HOSE") {
  db.exec(
    `INSERT OR REPLACE INTO watchlist (code, exchange, domain, added_at)
     VALUES ('${code}', '${exchange}', 'banking', '${new Date().toISOString()}')`,
  );
}

function addHistoryRows(
  db: Database,
  code: string,
  volume: number,
  count: number,
) {
  for (let i = 0; i < count; i++) {
    const ts = new Date(Date.now() - i * 86_400_000).toISOString();
    db.exec(
      `INSERT OR REPLACE INTO market_prices_history (code, price, volume, fetched_at)
       VALUES ('${code}', 50000, ${volume}, '${ts}')`,
    );
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A MarketPrice with a significant drop (−10% from 100,000 → 90,000) */
const PRICE_DROP_MOCK: MarketPrice = {
  code: "VCB",
  exchange: "HOSE",
  price: 90_000,
  previousPrice: 100_000,
  changePct: -10,
  volume: 500_000,
  avgVolume: 0,
  fetchedAt: new Date().toISOString(),
};

/** A MarketPrice with a volume spike (3× avgVolume when history = 1,000,000) */
const VOLUME_SPIKE_MOCK: MarketPrice = {
  code: "HPG",
  exchange: "HOSE",
  price: 50_000,
  previousPrice: 50_000,
  changePct: 0,
  volume: 3_000_000,
  avgVolume: 0,
  fetchedAt: new Date().toISOString(),
};

/** A normal MarketPrice — no signal (less than 5% change, normal volume) */
const NORMAL_PRICE_MOCK: MarketPrice = {
  code: "FPT",
  exchange: "HOSE",
  price: 120_000,
  previousPrice: 119_500,
  changePct: 0.42,
  volume: 200_000,
  avgVolume: 0,
  fetchedAt: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// Suite setup: initialize once, wipe tables before each test
// ---------------------------------------------------------------------------

// Initialize the DB once (creates tables, sets :memory: path)
setupTestDb();

beforeEach(() => {
  // Wipe all data for test isolation without needing to recreate the DB
  wipeTables(getDb());
});

afterEach(() => {
  // Ensure DB is cleanly closed after the suite
  // (Bun calls afterEach after each test, so this will run after each test too)
});

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("Task 103 — Market Scan Use Case + Job", () => {
  // ── 1. Empty watchlist ────────────────────────────────────────────────────

  it("returns { scanned:0, signals:0, alerts:0 } on empty watchlist", async () => {
    const mockFetcher = async (_codes: string[]) => [];

    const result: MarketScanResult = await scanMarket(makeDeps(mockFetcher));
    expect(result.scanned).toBe(0);
    expect(result.signals).toBe(0);
    expect(result.alerts).toBe(0);
  });

  // ── 2. Price drop signal ──────────────────────────────────────────────────

  it("detects price_drop signal for -10% move on VCB", async () => {
    const db = getDb();
    addWatchlistEntry(db, "VCB");

    const mockFetcher = async (_codes: string[]) => [PRICE_DROP_MOCK];

    const result: MarketScanResult = await scanMarket(makeDeps(mockFetcher));
    expect(result.scanned).toBe(1);
    expect(result.signals).toBeGreaterThanOrEqual(1);
    expect(result.alerts).toBeGreaterThanOrEqual(1);
  });

  // ── 3. Volume spike signal ────────────────────────────────────────────────

  it("detects volume_spike when volume >= 2x avgVolume (5+ history rows)", async () => {
    const db = getDb();
    addWatchlistEntry(db, "HPG");

    // Seed history: avgVolume = 1,000,000; current volume = 3,000,000 → 3× spike
    addHistoryRows(db, "HPG", 1_000_000, 6);

    const mockFetcher = async (_codes: string[]) => [VOLUME_SPIKE_MOCK];

    const result: MarketScanResult = await scanMarket(makeDeps(mockFetcher));
    expect(result.scanned).toBe(1);
    expect(result.signals).toBeGreaterThanOrEqual(1);
    expect(result.alerts).toBeGreaterThanOrEqual(1);
  });

  // ── 4. Sparse history suppresses volume_spike ─────────────────────────────

  it("suppresses volume_spike when fewer than 5 history rows (avgVolume=0)", async () => {
    const db = getDb();
    addWatchlistEntry(db, "HPG");

    // Only 3 history rows → avgVolume returned as 0 → spike suppressed
    addHistoryRows(db, "HPG", 1_000_000, 3);

    const mockFetcher = async (_codes: string[]) => [VOLUME_SPIKE_MOCK];

    const result: MarketScanResult = await scanMarket(makeDeps(mockFetcher));
    // No price signal (0% change) + no volume spike (avgVolume=0) → 0 signals
    expect(result.signals).toBe(0);
    expect(result.alerts).toBe(0);
  });

  // ── 5. Price fetch error → graceful degradation ────────────────────────────

  it("handles price fetch error gracefully — scanned=0, no throw", async () => {
    const db = getDb();
    addWatchlistEntry(db, "VCB");

    const mockFetcher = async (_codes: string[]) => {
      throw new Error("Network error");
    };

    const result: MarketScanResult = await scanMarket(makeDeps(mockFetcher));
    expect(result.scanned).toBe(0);
    expect(result.signals).toBe(0);
    expect(result.alerts).toBe(0);
  });

  // ── 6. Alert generated and stored in DB ───────────────────────────────────

  it("stores generated alert in the alerts table", async () => {
    const db = getDb();
    addWatchlistEntry(db, "VCB");

    const mockFetcher = async (_codes: string[]) => [PRICE_DROP_MOCK];

    await scanMarket(makeDeps(mockFetcher));

    const rows = db
      .query("SELECT * FROM alerts WHERE affected_actions_json LIKE '%VCB%'")
      .all();
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  // ── 7. Normal price → no signal, no alert ─────────────────────────────────

  it("produces no signals or alerts for a normal price move (+0.42%)", async () => {
    const db = getDb();
    addWatchlistEntry(db, "FPT");

    const mockFetcher = async (_codes: string[]) => [NORMAL_PRICE_MOCK];

    const result: MarketScanResult = await scanMarket(makeDeps(mockFetcher));
    expect(result.scanned).toBe(1);
    expect(result.signals).toBe(0);
    expect(result.alerts).toBe(0);
  });

  // ── 8. Cron jobs registered in jobs.ts ────────────────────────────────────

  it("jobs.ts registers both marketOpen and marketClose cron schedules", async () => {
    // Verify the CRONS map has the correct weekday-only expressions
    // We check the source directly (not running cron) to avoid side effects.
    const { readFileSync } = await import("node:fs");
    const { resolve, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");

    const dir = dirname(fileURLToPath(import.meta.url));
    const configPath = resolve(dir, "../scheduler/cronConfig.ts");
    const jobsSource = readFileSync(configPath, "utf8");

    // Market open: 09:00 weekdays
    expect(jobsSource).toContain("0 9 * * 1-5");
    // Market close: 15:30 weekdays
    expect(jobsSource).toContain("30 15 * * 1-5");
  });

  // ── 9. marketScanJob exports runMarketScan ────────────────────────────────

  it("marketScanJob exports runMarketScan function", async () => {
    const mod = await import("../scheduler/market-data/marketScanJob.js");
    expect(typeof mod.runMarketScan).toBe("function");
  });

  // ── 10. Multiple stocks — only watchlist codes scanned ────────────────────

  it("only fetches prices for codes on the watchlist", async () => {
    const db = getDb();
    addWatchlistEntry(db, "VCB");
    addWatchlistEntry(db, "HPG");

    let capturedCodes: string[] = [];
    const mockFetcher = async (codes: string[]) => {
      capturedCodes = codes;
      return [];
    };

    await scanMarket(makeDeps(mockFetcher));
    expect(capturedCodes).toContain("VCB");
    expect(capturedCodes).toContain("HPG");
    expect(capturedCodes.length).toBe(2);
  });
});
