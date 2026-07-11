/**
 * Task 1343a — Watchlist Restore + Q4 2025 Backfill
 *
 * Rewritten under WATCHLIST-DB-SYSMAP-DRIFT-FIX (2026-07-11): WATCHLIST_SEED
 * now derives from docs/data/system-map.json (SSOT) instead of a hardcoded
 * ticker array. The exact ticker set / exchange / domain composition is
 * pinned against the live system-map.json in
 * WATCHLIST-DB-SYSMAP-DRIFT-FIX.test.ts. These tests assert only the
 * seedWatchlist()/backfillBctcQ4() SQL behavior generically against
 * WATCHLIST_SEED (whatever it currently contains) so they never drift again
 * when system-map.json's watchlist changes.
 *
 * Tests for seedWatchlist() and backfillBctcQ4() against an in-memory SQLite DB.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  seedWatchlist,
  backfillBctcQ4,
  validateSeedTickers,
  WATCHLIST_SEED,
} from "../infrastructure/db/seedWatchlist.js";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal DDL — mirrors production schema for the two tables under test
// ─────────────────────────────────────────────────────────────────────────────

function createTestDb(): Database {
  const db = new Database(":memory:");

  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code             TEXT PRIMARY KEY,
      exchange         TEXT NOT NULL,
      domain           TEXT NOT NULL DEFAULT 'other',
      notes            TEXT,
      added_at         TEXT NOT NULL DEFAULT (datetime('now')),
      alert_drop_pct   REAL NOT NULL DEFAULT -3,
      alert_rise_pct   REAL NOT NULL DEFAULT 5,
      alert_impact_min REAL NOT NULL DEFAULT 7,
      alert_report_new INTEGER NOT NULL DEFAULT 1
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS financial_reports (
      id           TEXT PRIMARY KEY,
      action_code  TEXT NOT NULL,
      period_year  INTEGER NOT NULL,
      period_type  TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS bctc_vps_queue (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      action_code    TEXT    NOT NULL,
      period_year    INTEGER NOT NULL,
      period_quarter TEXT    NOT NULL,
      status         TEXT    NOT NULL DEFAULT 'pending',
      source_url     TEXT,
      attempts       INTEGER NOT NULL DEFAULT 0,
      last_attempt   TEXT,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(action_code, period_year, period_quarter)
    )
  `);

  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1343a — Watchlist Restore + Q4 2025 Backfill", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  // ── WATCHLIST_SEED constant — shape invariants only ───────────────────────
  // Exact composition is pinned against system-map.json elsewhere
  // (WATCHLIST-DB-SYSMAP-DRIFT-FIX.test.ts).

  it("WATCHLIST_SEED is non-empty", () => {
    expect(WATCHLIST_SEED.length).toBeGreaterThan(0);
  });

  it("WATCHLIST_SEED has no duplicate codes", () => {
    const codes = WATCHLIST_SEED.map((e) => e.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("WATCHLIST_SEED contains at least one HOSE entry", () => {
    const exchanges = new Set(WATCHLIST_SEED.map((e) => e.exchange));
    expect(exchanges).toContain("HOSE");
  });

  // ── seedWatchlist ──────────────────────────────────────────────────────────

  it("seedWatchlist inserts exactly WATCHLIST_SEED.length rows into watchlist", () => {
    seedWatchlist(db);
    const { cnt } = db.prepare("SELECT COUNT(*) AS cnt FROM watchlist").get() as { cnt: number };
    expect(cnt).toBe(WATCHLIST_SEED.length);
  });

  it("seedWatchlist sets default thresholds: drop=-3, rise=5, impact=5", () => {
    seedWatchlist(db);
    const rows = db
      .prepare("SELECT alert_drop_pct, alert_rise_pct, alert_impact_min FROM watchlist")
      .all() as { alert_drop_pct: number; alert_rise_pct: number; alert_impact_min: number }[];

    for (const row of rows) {
      expect(row.alert_drop_pct).toBe(-3);
      expect(row.alert_rise_pct).toBe(5);
      expect(row.alert_impact_min).toBe(5);
    }
  });

  it("seedWatchlist sets exchange and domain on every row", () => {
    seedWatchlist(db);
    const rows = db
      .prepare("SELECT code, exchange, domain FROM watchlist")
      .all() as { code: string; exchange: string; domain: string }[];

    expect(rows).toHaveLength(WATCHLIST_SEED.length);
    for (const row of rows) {
      expect(row.exchange).toBeTruthy();
      expect(row.domain).toBeTruthy();
    }
  });

  it("seedWatchlist is idempotent: calling twice still yields WATCHLIST_SEED.length rows", () => {
    seedWatchlist(db);
    seedWatchlist(db);
    const { cnt } = db.prepare("SELECT COUNT(*) AS cnt FROM watchlist").get() as { cnt: number };
    expect(cnt).toBe(WATCHLIST_SEED.length);
  });

  it("seedWatchlist inserts every WATCHLIST_SEED code exactly once", () => {
    seedWatchlist(db);
    const codes = new Set(
      (db.prepare("SELECT code FROM watchlist").all() as { code: string }[]).map((r) => r.code),
    );
    for (const entry of WATCHLIST_SEED) {
      expect(codes.has(entry.code)).toBe(true);
    }
    expect(codes.size).toBe(WATCHLIST_SEED.length);
  });

  // ── backfillBctcQ4 ─────────────────────────────────────────────────────────

  it("backfillBctcQ4 enqueues all WATCHLIST_SEED tickers when none have Q4 2025 reports", () => {
    seedWatchlist(db);
    backfillBctcQ4(db);

    const { cnt } = db
      .prepare("SELECT COUNT(*) AS cnt FROM bctc_vps_queue WHERE period_year = 2025 AND period_quarter = 'Q4'")
      .get() as { cnt: number };
    expect(cnt).toBe(WATCHLIST_SEED.length);
  });

  it("backfillBctcQ4 skips tickers that already have a Q4 2025 financial_report", () => {
    seedWatchlist(db);

    // Pre-populate the first two SSOT-seeded tickers as already having Q4 2025 reports
    const first = WATCHLIST_SEED[0];
    const second = WATCHLIST_SEED[1];
    if (!first || !second) {
      throw new Error("WATCHLIST_SEED must contain at least 2 entries for this test");
    }
    db.prepare(
      "INSERT INTO financial_reports (id, action_code, period_year, period_type) VALUES (?, ?, ?, ?)",
    ).run(`${first.code}-2025-q4`, first.code, 2025, "Q4");
    db.prepare(
      "INSERT INTO financial_reports (id, action_code, period_year, period_type) VALUES (?, ?, ?, ?)",
    ).run(`${second.code}-2025-q4`, second.code, 2025, "Q4");

    backfillBctcQ4(db);

    const { cnt } = db
      .prepare("SELECT COUNT(*) AS cnt FROM bctc_vps_queue WHERE period_year = 2025 AND period_quarter = 'Q4'")
      .get() as { cnt: number };
    expect(cnt).toBe(WATCHLIST_SEED.length - 2);

    // Pre-populated tickers must NOT be in the queue
    const firstRow = db
      .prepare("SELECT * FROM bctc_vps_queue WHERE action_code = ? AND period_quarter = 'Q4'")
      .get(first.code);
    expect(firstRow).toBeNull();

    const secondRow = db
      .prepare("SELECT * FROM bctc_vps_queue WHERE action_code = ? AND period_quarter = 'Q4'")
      .get(second.code);
    expect(secondRow).toBeNull();
  });

  it("backfillBctcQ4 sets status=pending and attempts=0 on all enqueued rows", () => {
    seedWatchlist(db);
    backfillBctcQ4(db);

    const rows = db
      .prepare("SELECT status, attempts FROM bctc_vps_queue WHERE period_year = 2025 AND period_quarter = 'Q4'")
      .all() as { status: string; attempts: number }[];

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.status).toBe("pending");
      expect(row.attempts).toBe(0);
    }
  });

  it("backfillBctcQ4 is idempotent: calling twice keeps same queue count", () => {
    seedWatchlist(db);
    backfillBctcQ4(db);
    backfillBctcQ4(db);

    const { cnt } = db
      .prepare("SELECT COUNT(*) AS cnt FROM bctc_vps_queue WHERE period_year = 2025 AND period_quarter = 'Q4'")
      .get() as { cnt: number };
    expect(cnt).toBe(WATCHLIST_SEED.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateSeedTickers
// ─────────────────────────────────────────────────────────────────────────────

describe("Task stale-tickers — validateSeedTickers startup check", () => {
  let db: Database;

  beforeEach(() => {
    // Minimal schema: watchlist + market_prices
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE watchlist (
        code TEXT PRIMARY KEY,
        exchange TEXT NOT NULL,
        domain TEXT NOT NULL DEFAULT 'other',
        notes TEXT,
        added_at TEXT NOT NULL DEFAULT (datetime('now')),
        alert_drop_pct REAL NOT NULL DEFAULT -3,
        alert_rise_pct REAL NOT NULL DEFAULT 5,
        alert_impact_min REAL NOT NULL DEFAULT 7,
        alert_report_new INTEGER NOT NULL DEFAULT 1
      )
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS market_prices (
        code TEXT PRIMARY KEY,
        price REAL,
        change_pct REAL,
        volume INTEGER,
        updated_at TEXT,
        exchange TEXT
      )
    `);
  });

  it("does not warn when all seeded tickers have market_prices rows", () => {
    seedWatchlist(db);
    // Insert a market_prices row for every seeded ticker
    for (const entry of WATCHLIST_SEED) {
      db.prepare(
        "INSERT INTO market_prices (code, price, change_pct, volume, updated_at, exchange) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(entry.code, 50000, 0, 1000000, new Date().toISOString(), entry.exchange);
    }
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(String(args[0]));
    validateSeedTickers(db);
    console.warn = original;

    expect(warnings.length).toBe(0);
  });

  it("warns when seeded tickers have no market_prices data", () => {
    seedWatchlist(db);
    // No market_prices rows inserted — every seeded ticker is missing
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(String(args[0]));
    validateSeedTickers(db);
    console.warn = original;

    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain(`${WATCHLIST_SEED.length} seeded ticker(s) have no market_prices data`);
    expect(warnings[0]).toContain("possible delisted/inactive");
  });

  it("warns only for the specific tickers missing prices (partial case)", () => {
    seedWatchlist(db);
    // Only the first two SSOT-seeded tickers have prices
    const withPrices = WATCHLIST_SEED.slice(0, 2).map((e) => e.code);
    for (const code of withPrices) {
      db.prepare(
        "INSERT INTO market_prices (code, price, change_pct, volume, updated_at, exchange) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(code, 50000, 0, 1000000, new Date().toISOString(), "HOSE");
    }
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(String(args[0]));
    validateSeedTickers(db);
    console.warn = original;

    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain(
      `${WATCHLIST_SEED.length - withPrices.length} seeded ticker(s) have no market_prices data`,
    );
    for (const code of withPrices) {
      expect(warnings[0]).not.toContain(code);
    }
  });
});
