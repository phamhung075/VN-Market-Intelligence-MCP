Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1876a-A6 — Seed high-vol watchlist tickers at -9.0 alert_drop_pct
 *
 * Verifies the full seedWatchlist() + migrateWatchlistThresholds() startup sequence
 * for the HIGH_VOL_TICKERS tier (originally NVL/DPM/REE/VNH/KBC/MWG/TCH).
 *
 * Sprint 1869 high-vol tier: real-estate / retail sectors with historical
 * daily std-dev > 2σ of watchlist average.
 *
 * WATCHLIST-DB-SYSMAP-DRIFT-FIX (2026-07-11): WATCHLIST_SEED now derives
 * from docs/data/system-map.json (SSOT). HIGH_VOL_TICKERS is a separate,
 * independently-curated alert-tuning tier that is NOT required to be a
 * subset of the current watchlist membership — REE/VNH/MWG/TCH are no
 * longer in system-map.json and therefore no longer get a live watchlist
 * row; migrateWatchlistThresholds()'s `UPDATE ... WHERE code IN (...)` is a
 * harmless no-op for those codes. Tests below operate on `seededHighVol`
 * (the actual intersection of HIGH_VOL_TICKERS and WATCHLIST_SEED) rather
 * than assuming every HIGH_VOL_TICKERS code has a live row.
 *
 *   AC1: seeded high-vol rows present at -9.0 after seed + migrate
 *   AC2: standard rows remain at -7.0 (untouched by high-vol update)
 *   AC3: no rows remain at -3.0 or NULL post-migrate
 *   AC4: total watchlist row count >= 32 (25 original + 7 high-vol)
 *   AC5: idempotency — second migrate call leaves all values unchanged
 *   AC6: exchange spot-check for seeded high-vol tickers; VNH absent
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
    CREATE TABLE IF NOT EXISTS watchlist (
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

// Actual intersection of HIGH_VOL_TICKERS and the SSOT-derived WATCHLIST_SEED
// (see WATCHLIST-DB-SYSMAP-DRIFT-FIX note above — not every HIGH_VOL_TICKERS
// code still has a live watchlist row).
const seededCodes = new Set(WATCHLIST_SEED.map((e) => e.code));
const seededHighVol = HIGH_VOL_TICKERS.filter((t) => seededCodes.has(t));

describe("Task 1876a-A6 — high-vol seed: seedWatchlist + migrateWatchlistThresholds", () => {

  // ── WATCHLIST_SEED / HIGH_VOL_TICKERS intersection ────────────────────────

  it("WATCHLIST_SEED contains at least one HIGH_VOL_TICKERS entry", () => {
    expect(seededHighVol.length).toBeGreaterThan(0);
  });

  it("WATCHLIST_SEED has at least 32 entries (25 original + 7 high-vol)", () => {
    expect(WATCHLIST_SEED.length).toBeGreaterThanOrEqual(32);
  });

  // ── AC1: seeded high-vol rows at -9.0 after seed + migrate ────────────────

  it("AC1: every seeded HIGH_VOL_TICKERS entry has alert_drop_pct = -9.0 after seed+migrate", () => {
    const db = makeDb();
    seedWatchlist(db);
    migrateWatchlistThresholds(db);

    for (const ticker of seededHighVol) {
      const row = getRow(db, ticker);
      expect(row).not.toBeNull();
      expect(row?.alert_drop_pct).toBe(HIGH_VOL_DROP_PCT); // -9.0
    }
  });

  it("AC1: COUNT high-vol rows with alert_drop_pct = -9.0 equals seededHighVol.length", () => {
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

    expect(count).toBe(seededHighVol.length);
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

  it("AC6: every seeded HIGH_VOL_TICKERS entry has exchange matching WATCHLIST_SEED", () => {
    const db = makeDb();
    seedWatchlist(db);

    for (const ticker of seededHighVol) {
      const row = getRow(db, ticker);
      const seedEntry = WATCHLIST_SEED.find((e) => e.code === ticker);
      expect(row).not.toBeNull();
      expect(row?.exchange).toBe(seedEntry?.exchange);
    }
  });

  it("AC6: VNH is absent from the watchlist post-seed (not in system-map.json SSOT)", () => {
    const db = makeDb();
    seedWatchlist(db);

    const row = getRow(db, "VNH");
    expect(row).toBeNull();
  });

});
