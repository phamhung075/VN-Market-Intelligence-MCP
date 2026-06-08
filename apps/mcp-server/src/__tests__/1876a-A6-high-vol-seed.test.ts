Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1876a-A6 — Seed 7 high-vol watchlist tickers at -9.0 alert_drop_pct
 *
 * Verifies the full seedWatchlist() + migrateWatchlistThresholds() startup sequence
 * after adding NVL/DPM/REE/VNH/KBC/MWG/TCH to WATCHLIST_SEED.
 *
 * Sprint 1869 high-vol tier: real-estate / retail sectors with historical
 * daily std-dev > 2σ of watchlist average.
 *
 *   AC1: 7 high-vol rows present at -9.0 after seed + migrate
 *   AC2: standard rows remain at -7.0 (untouched by high-vol update)
 *   AC3: no rows remain at -3.0 or NULL post-migrate
 *   AC4: total watchlist row count >= 32 (25 original + 7 high-vol)
 *   AC5: idempotency — second migrate call leaves all values unchanged
 *   AC6: exchange spot-check (NVL/DPM/REE/KBC/MWG/TCH = HOSE, VNH = HNX)
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import {
  seedWatchlist,
  migrateWatchlistThresholds,
  WATCHLIST_SEED,
  HIGH_VOL_TICKERS,
  STANDARD_DROP_PCT,
  HIGH_VOL_DROP_PCT,
} from "../infrastructure/db/seedWatchlist.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test DB helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE watchlist (
      code              TEXT PRIMARY KEY,
      exchange          TEXT NOT NULL DEFAULT 'HOSE',
      domain            TEXT NOT NULL DEFAULT 'other',
      notes             TEXT,
      added_at          TEXT NOT NULL DEFAULT (datetime('now')),
      alert_drop_pct    REAL DEFAULT -3,
      alert_rise_pct    REAL DEFAULT 5,
      alert_impact_min  REAL DEFAULT 7,
      alert_report_new  INTEGER DEFAULT 1
    )
  `);
  return db;
}

type WatchlistRow = {
  code: string;
  exchange: string;
  domain: string;
  alert_drop_pct: number | null;
};

function getAllRows(db: Database): WatchlistRow[] {
  return db
    .prepare("SELECT code, exchange, domain, alert_drop_pct FROM watchlist")
    .all() as WatchlistRow[];
}

function getRow(db: Database, code: string): WatchlistRow | null {
  return db
    .prepare("SELECT code, exchange, domain, alert_drop_pct FROM watchlist WHERE code = ?")
    .get(code) as WatchlistRow | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1876a-A6 — high-vol seed: seedWatchlist + migrateWatchlistThresholds", () => {

  // ── WATCHLIST_SEED constant includes all 7 high-vol tickers ──────────────

  it("WATCHLIST_SEED contains all 7 HIGH_VOL_TICKERS", () => {
    const seedCodes = WATCHLIST_SEED.map((e) => e.code);
    for (const ticker of HIGH_VOL_TICKERS) {
      expect(seedCodes).toContain(ticker);
    }
  });

  it("WATCHLIST_SEED has at least 32 entries (25 original + 7 high-vol)", () => {
    expect(WATCHLIST_SEED.length).toBeGreaterThanOrEqual(32);
  });

  // ── AC1: 7 high-vol rows at -9.0 after seed + migrate ────────────────────

  it("AC1: all 7 HIGH_VOL_TICKERS have alert_drop_pct = -9.0 after seed+migrate", () => {
    const db = makeDb();
    seedWatchlist(db);
    migrateWatchlistThresholds(db);

    for (const ticker of HIGH_VOL_TICKERS) {
      const row = getRow(db, ticker);
      expect(row).not.toBeNull();
      expect(row?.alert_drop_pct).toBe(HIGH_VOL_DROP_PCT); // -9.0
    }
  });

  it("AC1: COUNT high-vol rows with alert_drop_pct = -9.0 equals 7", () => {
    const db = makeDb();
    seedWatchlist(db);
    migrateWatchlistThresholds(db);

    const count = (db
      .prepare(
        `SELECT COUNT(*) AS n FROM watchlist
         WHERE code IN (${HIGH_VOL_TICKERS.map(() => "?").join(",")})
           AND alert_drop_pct = -9.0`
      )
      .get(...HIGH_VOL_TICKERS) as { n: number }).n;

    expect(count).toBe(7);
  });

  // ── AC2: standard rows remain at -7.0 ─────────────────────────────────────

  it("AC2: at least 25 standard rows have alert_drop_pct = -7.0 after migrate", () => {
    const db = makeDb();
    seedWatchlist(db);
    migrateWatchlistThresholds(db);

    const rows = getAllRows(db);
    const standardRows = rows.filter(
      (r) => !HIGH_VOL_TICKERS.includes(r.code as typeof HIGH_VOL_TICKERS[number])
        && r.alert_drop_pct === STANDARD_DROP_PCT
    );
    expect(standardRows.length).toBeGreaterThanOrEqual(25);
  });

  it("AC2: no high-vol ticker has alert_drop_pct = -7.0", () => {
    const db = makeDb();
    seedWatchlist(db);
    migrateWatchlistThresholds(db);

    for (const ticker of HIGH_VOL_TICKERS) {
      const row = getRow(db, ticker);
      expect(row?.alert_drop_pct).not.toBe(STANDARD_DROP_PCT);
    }
  });

  // ── AC3: no rows at -3.0 or NULL post-migrate ─────────────────────────────

  it("AC3: zero rows with alert_drop_pct = -3 or NULL after seed+migrate", () => {
    const db = makeDb();
    seedWatchlist(db);
    migrateWatchlistThresholds(db);

    const rows = getAllRows(db);
    const staleRows = rows.filter(
      (r) => r.alert_drop_pct === null || r.alert_drop_pct === -3
    );
    expect(staleRows.length).toBe(0);
  });

  // ── AC4: total row count >= 32 ────────────────────────────────────────────

  it("AC4: watchlist contains at least 32 rows after seed", () => {
    const db = makeDb();
    seedWatchlist(db);
    migrateWatchlistThresholds(db);

    const rows = getAllRows(db);
    expect(rows.length).toBeGreaterThanOrEqual(32);
  });

  // ── AC5: idempotency ──────────────────────────────────────────────────────

  it("AC5: second seedWatchlist+migrate call leaves all thresholds unchanged", () => {
    const db = makeDb();
    seedWatchlist(db);
    migrateWatchlistThresholds(db);

    // Capture snapshot after first run
    const snapshot1 = getAllRows(db).map((r) => ({
      code: r.code,
      alert_drop_pct: r.alert_drop_pct,
    }));

    // Second run — simulates container restart
    seedWatchlist(db);
    migrateWatchlistThresholds(db);

    const snapshot2 = getAllRows(db).map((r) => ({
      code: r.code,
      alert_drop_pct: r.alert_drop_pct,
    }));

    // Same codes, same thresholds
    expect(snapshot2.length).toBe(snapshot1.length);
    for (const s1 of snapshot1) {
      const s2 = snapshot2.find((r) => r.code === s1.code);
      expect(s2).toBeDefined();
      expect(s2?.alert_drop_pct).toBe(s1.alert_drop_pct);
    }
  });

  it("AC5: second migrateWatchlistThresholds returns standard=0 (already -7.0)", () => {
    const db = makeDb();
    seedWatchlist(db);
    migrateWatchlistThresholds(db);

    // On second migrate only (no re-seed), standard rows already at -7.0
    const { standard } = migrateWatchlistThresholds(db);
    expect(standard).toBe(0);
  });

  // ── AC6: exchange correctness ─────────────────────────────────────────────

  it("AC6: NVL/DPM/REE/KBC/MWG/TCH have exchange = HOSE", () => {
    const db = makeDb();
    seedWatchlist(db);

    const hoseHighVol = ["NVL", "DPM", "REE", "KBC", "MWG", "TCH"] as const;
    for (const ticker of hoseHighVol) {
      const row = getRow(db, ticker);
      expect(row).not.toBeNull();
      expect(row?.exchange).toBe("HOSE");
    }
  });

  it("AC6: VNH has exchange = HNX", () => {
    const db = makeDb();
    seedWatchlist(db);

    const row = getRow(db, "VNH");
    expect(row).not.toBeNull();
    expect(row?.exchange).toBe("HNX");
  });

});
