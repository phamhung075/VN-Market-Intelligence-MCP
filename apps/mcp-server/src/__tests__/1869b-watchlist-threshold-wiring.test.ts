Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1869b — Wire per-watchlist thresholds into scanMarket dispatch
 *
 * Verifies:
 *   1. detectSignals() respects context.watchlistThresholds.dropPct override
 *   2. scanMarket passes per-stock thresholds from watchlist DB rows to detectSignals
 *   3. Baseline: stock without custom threshold uses DEFAULT_DROP_PCT (-7)
 *   4. High-vol stock (alert_drop_pct=-9): -7.5% does NOT trigger
 *   5. Standard stock (alert_drop_pct=-7): -7.5% DOES trigger
 */

import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import {
  detectSignals,
  type MarketSnapshot,
  type SignalContext,
} from "../domain/services/signalDetector.js";
import { getDb, closeDb, initDatabase } from "../infrastructure/db/schema.js";
import { scanMarket } from "../application/usecases/scanMarket.js";
import type { MarketPrice } from "../infrastructure/fetchers/hose.js";
import { SqliteWatchlistRepository } from "../infrastructure/db/repositories/SqliteWatchlistRepository.js";
import { SqliteMarketPriceRepository } from "../infrastructure/db/repositories/SqliteMarketPriceRepository.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeSnapshot(
  code: string,
  price: number,
  previousPrice: number,
): MarketSnapshot {
  return {
    actionCode: code,
    price,
    previousPrice,
    volume: 1_000_000,
    avgVolume: 1_000_000,
  };
}

// Safe clock outside ATC window (07:30–08:35 UTC) to avoid time-flakes.
const safeNow = new Date("2026-05-11T10:00:00Z");

// ─────────────────────────────────────────────────────────────────────────────
// DB helpers for scanMarket integration tests
// ─────────────────────────────────────────────────────────────────────────────

function setupTestDb(): Database {
  (Bun.env as Record<string, string>)["DB_PATH"] = ":memory:";
  closeDb();
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code              TEXT PRIMARY KEY,
      company_name      TEXT,
      exchange          TEXT NOT NULL DEFAULT 'HOSE',
      domain            TEXT NOT NULL DEFAULT 'other',
      notes             TEXT,
      added_at          TEXT NOT NULL DEFAULT (datetime('now')),
      alert_drop_pct    REAL NOT NULL DEFAULT -7,
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
  `);

  return db;
}

function wipeTables(db: Database) {
  try { db.exec("DELETE FROM market_prices_history"); } catch { /* ok */ }
  try { db.exec("DELETE FROM market_prices"); } catch { /* ok */ }
  try { db.exec("DELETE FROM watchlist"); } catch { /* ok */ }
  try { db.exec("DELETE FROM alerts"); } catch { /* ok */ }
}

function insertWatchlistRow(
  db: Database,
  code: string,
  alertDropPct: number,
  alertRisePct: number = 5,
) {
  db.exec(
    `INSERT OR REPLACE INTO watchlist (code, exchange, domain, added_at, alert_drop_pct, alert_rise_pct, alert_impact_min, alert_report_new)
     VALUES ('${code}', 'HOSE', 'banking', datetime('now'), ${alertDropPct}, ${alertRisePct}, 7, 1)`,
  );
}

function makeScanDeps(db: Database, fetchPrices?: (codes: string[]) => Promise<MarketPrice[]>) {
  return {
    watchlistRepo: new SqliteWatchlistRepository(db),
    marketPriceRepo: new SqliteMarketPriceRepository(db),
    ...(fetchPrices ? { fetchPrices } : {}),
  };
}

function makePrice(
  code: string,
  price: number,
  previousPrice: number,
): MarketPrice {
  return {
    code,
    exchange: "HOSE",
    price,
    previousPrice,
    changePct: ((price - previousPrice) / previousPrice) * 100,
    volume: 1_000_000,
    avgVolume: 0,
    fetchedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1869b — detectSignals: watchlistThresholds override", () => {

  // ── TC-1: Custom dropPct = -9 → -9% triggers, -8.9% does NOT ──────────────

  it("TC-1: -9% drop triggers with custom threshold dropPct=-9", () => {
    const snapshot = makeSnapshot("NVL", 91_000, 100_000); // -9%
    const context: SignalContext = {
      watchlistThresholds: { dropPct: -9, risePct: 5, impactScore: 0 },
      _now: safeNow,
    };

    const signals = detectSignals(snapshot, context);
    const types = signals.map((s) => s.type);
    expect(types).toContain("price_drop");
  });

  it("TC-1b: -8.9% drop does NOT trigger with custom threshold dropPct=-9", () => {
    const snapshot = makeSnapshot("NVL", 91_100, 100_000); // -8.9%
    const context: SignalContext = {
      watchlistThresholds: { dropPct: -9, risePct: 5, impactScore: 0 },
      _now: safeNow,
    };

    const signals = detectSignals(snapshot, context);
    const priceDrop = signals.filter((s) => s.type === "price_drop");
    expect(priceDrop.length).toBe(0);
  });

  // ── TC-2: No context → DEFAULT_DROP_PCT (-7) applies ─────────────────────

  it("TC-2: -7% drop triggers with no context (DEFAULT_DROP_PCT=-7)", () => {
    const snapshot = makeSnapshot("VCB", 93_000, 100_000); // -7%
    const context: SignalContext = { _now: safeNow };

    const signals = detectSignals(snapshot, context);
    const types = signals.map((s) => s.type);
    expect(types).toContain("price_drop");
  });

  it("TC-2b: -6.9% drop does NOT trigger with no context (below -7 default)", () => {
    const snapshot = makeSnapshot("VCB", 93_100, 100_000); // -6.9%
    const context: SignalContext = { _now: safeNow };

    const signals = detectSignals(snapshot, context);
    const priceDrop = signals.filter((s) => s.type === "price_drop");
    expect(priceDrop.length).toBe(0);
  });

  // ── TC-3: Low threshold (bank stock) — dropPct=-3, -3% triggers ──────────

  it("TC-3: -3% drop triggers with bank stock threshold dropPct=-3", () => {
    const snapshot = makeSnapshot("VCB", 97_000, 100_000); // -3%
    const context: SignalContext = {
      watchlistThresholds: { dropPct: -3, risePct: 5, impactScore: 0 },
      _now: safeNow,
    };

    const signals = detectSignals(snapshot, context);
    const types = signals.map((s) => s.type);
    expect(types).toContain("price_drop");
  });

  // ── TC-4: watchlistThresholds overrides volatility (highest priority) ─────

  it("TC-4: watchlistThresholds.dropPct overrides adaptiveDropPct from volatility", () => {
    // Volatile stock with adaptive threshold of -5%, but watchlist explicitly sets -9%
    const snapshot = makeSnapshot("NVL", 94_000, 100_000); // -6%
    const context: SignalContext = {
      watchlistThresholds: { dropPct: -9, risePct: 5, impactScore: 0 }, // highest priority
      volatility: {
        actionCode: "NVL",
        adaptiveDropPct: -5,  // would trigger at -6%, but watchlist overrides
        adaptiveRisePct: 5,
        adaptiveVolumeMult: 2,
        dailyStdDev: 0.02,
        annualizedVol: 0.32,
        windowDays: 20,
      },
      _now: safeNow,
    };

    const signals = detectSignals(snapshot, context);
    // -6% drop: watchlist says -9 threshold, adaptive says -5 threshold.
    // watchlist wins (higher priority) → -6 NOT <= -9 → no signal
    const priceDrop = signals.filter((s) => s.type === "price_drop");
    expect(priceDrop.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration: scanMarket wires per-stock thresholds
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1869b — scanMarket: per-stock threshold wiring", () => {
  let db: Database;

  beforeEach(() => {
    db = setupTestDb();
    wipeTables(db);
  });

  // ── IT-1: High-vol stock (alert_drop_pct=-9) should NOT alert on -7.5% drop

  it("IT-1: high-vol stock (alert_drop_pct=-9) does NOT trigger on -7.5% drop", async () => {
    insertWatchlistRow(db, "NVL", -9);

    const mockPrices: MarketPrice[] = [makePrice("NVL", 92_500, 100_000)]; // -7.5%

    const result = await scanMarket(makeScanDeps(db, async () => mockPrices));

    expect(result.scanned).toBe(1);
    // -7.5% < -9 is false: -7.5 > -9 → no price_drop signal
    expect(result.signals).toBe(0);
    expect(result.alerts).toBe(0);
  });

  // ── IT-2: Standard stock (alert_drop_pct=-7) SHOULD alert on -7.5% drop ──

  it("IT-2: standard stock (alert_drop_pct=-7) triggers on -7.5% drop", async () => {
    insertWatchlistRow(db, "VCB", -7);

    const mockPrices: MarketPrice[] = [makePrice("VCB", 92_500, 100_000)]; // -7.5%

    const result = await scanMarket(makeScanDeps(db, async () => mockPrices));

    expect(result.scanned).toBe(1);
    // -7.5% <= -7 → price_drop signal fires
    expect(result.signals).toBeGreaterThanOrEqual(1);
    expect(result.alerts).toBeGreaterThanOrEqual(1);
  });

  // ── IT-3: Two stocks, different thresholds — correct selective alerting ────

  it("IT-3: NVL (threshold=-9) silent on -7.5%, VCB (threshold=-7) alerts on -7.5%", async () => {
    insertWatchlistRow(db, "NVL", -9); // high-vol: needs bigger drop
    insertWatchlistRow(db, "VCB", -7); // standard: fires at -7%

    const mockPrices: MarketPrice[] = [
      makePrice("NVL", 92_500, 100_000), // -7.5% → below NVL threshold (-9) → no signal
      makePrice("VCB", 92_500, 100_000), // -7.5% → at VCB threshold (-7) → signal
    ];

    const result = await scanMarket(makeScanDeps(db, async () => mockPrices));

    expect(result.scanned).toBe(2);
    // Only VCB triggers
    const alertRow = db
      .prepare("SELECT COUNT(*) as cnt FROM alerts WHERE affected_actions_json LIKE '%VCB%'")
      .get() as { cnt: number };
    const nvlAlertRow = db
      .prepare("SELECT COUNT(*) as cnt FROM alerts WHERE affected_actions_json LIKE '%NVL%'")
      .get() as { cnt: number };

    expect(alertRow.cnt).toBeGreaterThanOrEqual(1);
    expect(nvlAlertRow.cnt).toBe(0);
  });

  // ── IT-4: No watchlist threshold row → falls back to DEFAULT_DROP_PCT ─────

  it("IT-4: stock with no watchlist threshold falls back to DEFAULT_DROP_PCT=-7", async () => {
    // Insert WITHOUT alert_drop_pct (use schema default -7)
    db.exec(
      `INSERT OR REPLACE INTO watchlist (code, exchange, domain, added_at)
       VALUES ('FPT', 'HOSE', 'tech', datetime('now'))`,
    );

    const mockPrices: MarketPrice[] = [makePrice("FPT", 92_500, 100_000)]; // -7.5%

    const result = await scanMarket(makeScanDeps(db, async () => mockPrices));

    expect(result.scanned).toBe(1);
    // Schema default -7 → -7.5% triggers
    expect(result.signals).toBeGreaterThanOrEqual(1);
  });
});

afterAll(async () => {
  closeDb();
  await initDatabase();
});
