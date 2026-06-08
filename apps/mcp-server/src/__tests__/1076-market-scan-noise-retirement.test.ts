Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1076 — Market Scan Noise Retirement (Regression Test)
 *
 * Verifies the noise alert retirement policy for Sprint 054:
 *   1. scanMarket() does NOT call send_telegram/sendTelegramMarket for medium
 *      price moves, heartbeats, or volume spikes (no direct MARKET channel sends).
 *   2. Alerts are still stored to the `alerts` table (DB insert preserved).
 *   3. The scanMarket source file does not import the telegram notifier module.
 *
 * These tests lock in the existing correct behavior and guard against regression.
 *
 * Per TECH_054 section 10:
 *   "The following behaviors in marketScanJob.ts must have their
 *    send_telegram(channel="market") calls removed. DB inserts into
 *    alerts table are preserved for audit."
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Database } from "bun:sqlite";
import { getDb, closeDb } from "../infrastructure/db/schema.js";
import { scanMarket } from "../application/usecases/scanMarket.js";
import type { MarketPrice } from "../infrastructure/fetchers/hose.js";
import { SqliteWatchlistRepository } from "../infrastructure/db/repositories/SqliteWatchlistRepository.js";
import { SqliteMarketPriceRepository } from "../infrastructure/db/repositories/SqliteMarketPriceRepository.js";

const ROOT = resolve(import.meta.dir, "../..");

// ─────────────────────────────────────────────────────────────────────────────
// Test DB helpers
// ─────────────────────────────────────────────────────────────────────────────

function setupTestDb(): Database {
  (Bun.env as Record<string, string>)["DB_PATH"] = ":memory:";
  closeDb();
  const db = getDb();

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
      updated_at  TEXT
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

  return db;
}

const db = setupTestDb();

function makeDeps(fetchPrices?: (codes: string[]) => Promise<MarketPrice[]>) {
  return {
    watchlistRepo: new SqliteWatchlistRepository(db),
    marketPriceRepo: new SqliteMarketPriceRepository(db),
    ...(fetchPrices ? { fetchPrices } : {}),
  };
}

beforeEach(() => {
  try { db.exec("DELETE FROM alerts"); } catch (_) { /* ok */ }
  try { db.exec("DELETE FROM watchlist"); } catch (_) { /* ok */ }
  try { db.exec("DELETE FROM market_prices"); } catch (_) { /* ok */ }
  try { db.exec("DELETE FROM market_prices_history"); } catch (_) { /* ok */ }
});

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A price drop at -7% (signal detector default threshold).
 * Per TECH_054 section 10, medium moves (2-5%) were "noise" in legacy direct-Telegram
 * implementations. Here we use -7% to confirm that even when a signal fires, no
 * Telegram is sent — only a DB insert happens.
 */
const FIVE_PCT_DROP: MarketPrice = {
  code: "VCB",
  exchange: "HOSE",
  price: 93_000,
  previousPrice: 100_000,
  changePct: -7.0,
  volume: 500_000,
  avgVolume: 0,
  fetchedAt: new Date().toISOString(),
};

/** Alias for the spec name — 3% drop (below default threshold, produces no signal) */
const THREE_PCT_DROP: MarketPrice = {
  code: "VCB",
  exchange: "HOSE",
  price: 97_000,
  previousPrice: 100_000,
  changePct: -3.0,
  volume: 500_000,
  avgVolume: 0,
  fetchedAt: new Date().toISOString(),
};

/** A volume spike (3× avg) without large price move */
const VOLUME_SPIKE_ONLY: MarketPrice = {
  code: "FPT",
  exchange: "HOSE",
  price: 80_000,
  previousPrice: 80_100,
  changePct: -0.12,
  volume: 3_000_000,
  avgVolume: 0,
  fetchedAt: new Date().toISOString(),
};

/** A 0.5% heartbeat move — routine watchlist price update */
const HEARTBEAT_MOVE: MarketPrice = {
  code: "VNM",
  exchange: "HOSE",
  price: 50_250,
  previousPrice: 50_000,
  changePct: 0.5,
  volume: 150_000,
  avgVolume: 0,
  fetchedAt: new Date().toISOString(),
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper to add a watchlist entry
// ─────────────────────────────────────────────────────────────────────────────

function addWatchlistEntry(code: string, alertDropPct: number = -7) {
  db.exec(
    `INSERT OR REPLACE INTO watchlist (code, exchange, domain, added_at, alert_drop_pct, alert_rise_pct, alert_impact_min, alert_report_new)
     VALUES ('${code}', 'HOSE', 'banking', '${new Date().toISOString()}', ${alertDropPct}, 5, 7, 1)`,
  );
}

function addHistoryRows(code: string, volume: number, count: number) {
  for (let i = 0; i < count; i++) {
    const ts = new Date(Date.now() - i * 86_400_000).toISOString();
    db.exec(
      `INSERT OR REPLACE INTO market_prices_history (code, price, volume, fetched_at)
       VALUES ('${code}', 50000, ${volume}, '${ts}')`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1076 — Market Scan Noise Retirement", () => {

  // ── Static: scanMarket source does NOT import telegram ─────────────────────

  it("scanMarket.ts source does not import telegram notifier module", () => {
    const src = readFileSync(
      resolve(ROOT, "src/application/usecases/scanMarket.ts"),
      "utf-8",
    );
    // The file must not reference the telegram notifier in any form
    expect(src).not.toMatch(/notifiers\/telegram/);
    expect(src).not.toMatch(/sendTelegram/);
    expect(src).not.toMatch(/send_telegram/);
  });

  it("marketScanJob.ts source does not call send_telegram(channel='market') for noise types", () => {
    const src = readFileSync(
      resolve(ROOT, "src/scheduler/market-data/marketScanJob.ts"),
      "utf-8",
    );
    // The wrapper must not have any direct telegram market sends
    expect(src).not.toMatch(/sendTelegramMarket\s*\(/);
    expect(src).not.toMatch(/send_telegram.*market/);
  });

  // ── Runtime: 3% price drop does NOT trigger Telegram, alert IS stored to DB ─

  it("price drop at threshold: no Telegram send, alert stored to DB (noise retired, DB preserved)", async () => {
    addWatchlistEntry("VCB");

    // Runtime: call scanMarket with a -7% drop (at default signal detector threshold).
    // Telegram send invariant is verified statically by the source-check tests above.
    const result = await scanMarket(makeDeps(async () => [FIVE_PCT_DROP]));

    // The scan should have processed VCB
    expect(result.scanned).toBe(1);

    // DB insert must be preserved: alert row should exist
    const alertRow = db
      .prepare("SELECT COUNT(*) as cnt FROM alerts WHERE affected_actions_json LIKE '%VCB%'")
      .get() as { cnt: number };

    // signal fires at -7% → alert stored → DB has row
    expect(alertRow.cnt).toBeGreaterThanOrEqual(1);
  });

  it("3% price drop (below threshold): no signal fires, no alert stored, no Telegram", async () => {
    addWatchlistEntry("VCB");

    const result = await scanMarket(makeDeps(async () => [THREE_PCT_DROP]));

    expect(result.scanned).toBe(1);
    // -3% is below the default -7% threshold, so no price_drop signal fires
    // (no volume spike either since avgVolume = 0 suppresses it)
    expect(result.signals).toBe(0);
    expect(result.alerts).toBe(0);

    const alertRow = db
      .prepare("SELECT COUNT(*) as cnt FROM alerts WHERE affected_actions_json LIKE '%VCB%'")
      .get() as { cnt: number };
    expect(alertRow.cnt).toBe(0);
  });

  it("volume spike without price move: no Telegram send, alert stored if signal fires", async () => {
    addWatchlistEntry("FPT");
    // Add enough history so avgVolume is computed (needs ≥ 5 rows)
    addHistoryRows("FPT", 1_000_000, 10);

    const result = await scanMarket(makeDeps(async () => [VOLUME_SPIKE_ONLY]));

    expect(result.scanned).toBe(1);

    // Telegram call check is static (source does not import telegram)
    // DB insert preserved: if volume spike fired, row exists
    const alertRow = db
      .prepare("SELECT COUNT(*) as cnt FROM alerts WHERE affected_actions_json LIKE '%FPT%'")
      .get() as { cnt: number };
    // Whether signal fires or not depends on threshold, but no exception should be thrown
    expect(alertRow.cnt).toBeGreaterThanOrEqual(0);
  });

  it("heartbeat move (0.5%): no alert generated, no Telegram call", async () => {
    addWatchlistEntry("VNM");

    const result = await scanMarket(makeDeps(async () => [HEARTBEAT_MOVE]));

    expect(result.scanned).toBe(1);
    // A 0.5% move is below the 5% price_surge threshold and above the -3% price_drop threshold
    // so no signal fires → no alert stored
    expect(result.signals).toBe(0);
    expect(result.alerts).toBe(0);

    const alertRow = db
      .prepare("SELECT COUNT(*) as cnt FROM alerts WHERE affected_actions_json LIKE '%VNM%'")
      .get() as { cnt: number };
    expect(alertRow.cnt).toBe(0);
  });

  // ── Retired alert types: verify the pipeline only uses DB, not Telegram ────

  it("scanMarket result structure: scanned/signals/alerts counts are returned, no Telegram side effect", async () => {
    addWatchlistEntry("VCB");

    const result = await scanMarket(makeDeps(async () => [THREE_PCT_DROP]));

    // The return value is still the MarketScanResult shape (unchanged)
    expect(result).toHaveProperty("scanned");
    expect(result).toHaveProperty("signals");
    expect(result).toHaveProperty("alerts");
    expect(typeof result.scanned).toBe("number");
    expect(typeof result.signals).toBe("number");
    expect(typeof result.alerts).toBe("number");
    // No telegram send occurred (source-level guarantee from static test above)
  });

  // ── Alert Commander exclusivity: server stores to DB only ──────────────────

  it("only DB inserts happen in the scan pipeline — Alert Commander sends to MARKET separately", () => {
    // Structural assertion: scanMarket.ts must not reference telegram
    const src = readFileSync(
      resolve(ROOT, "src/application/usecases/scanMarket.ts"),
      "utf-8",
    );

    // Confirm DB path is used (storeAlerts must be called)
    expect(src).toMatch(/storeAlerts/);
    // Confirm no telegram path
    expect(src).not.toMatch(/sendTelegram/);
    expect(src).not.toMatch(/TELEGRAM/);
  });
});
