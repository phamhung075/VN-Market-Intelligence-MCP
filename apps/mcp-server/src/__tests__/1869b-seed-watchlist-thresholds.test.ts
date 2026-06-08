Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1869b-seed — Watchlist alert_drop_pct migration
 *
 * Verifies:
 *   AC1: migration function exists and runs without error
 *   AC2: standard rows (not high-vol) set to -7.0 from NULL or old -3
 *   AC3: high-vol tickers (NVL, DPM, REE, VNH, KBC, MWG, TCH) set to -9.0
 *   AC4: all rows non-null after migration
 *   AC5: idempotent — re-running returns 0 standard updates, 7 highVol updates
 *        (highVol always writes same value → changes = 7 on re-run, standard = 0)
 *   AC6: rows already at -7.0 are NOT changed (guard works)
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import {
  migrateWatchlistThresholds,
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

function insertRow(db: Database, code: string, dropPct: number | null = -3): void {
  db.exec(
    `INSERT INTO watchlist (code, alert_drop_pct)
     VALUES ('${code}', ${dropPct === null ? "NULL" : dropPct})`
  );
}

type WatchlistRow = { code: string; alert_drop_pct: number | null };

function getRow(db: Database, code: string): WatchlistRow | null {
  return db
    .prepare("SELECT code, alert_drop_pct FROM watchlist WHERE code = ?")
    .get(code) as WatchlistRow | null;
}

function getAllRows(db: Database): WatchlistRow[] {
  return db
    .prepare("SELECT code, alert_drop_pct FROM watchlist")
    .all() as WatchlistRow[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1869b-seed — migrateWatchlistThresholds", () => {

  // ── AC1: function runs without error ──────────────────────────────────────

  it("AC1: runs without throwing on empty table", () => {
    const db = makeDb();
    expect(() => migrateWatchlistThresholds(db)).not.toThrow();
  });

  // ── AC2: standard rows updated from -3 → -7.0 ────────────────────────────

  it("AC2: standard row at old default -3 is updated to -7.0", () => {
    const db = makeDb();
    insertRow(db, "VCB", -3);

    migrateWatchlistThresholds(db);

    expect(getRow(db, "VCB")?.alert_drop_pct).toBe(STANDARD_DROP_PCT);
  });

  it("AC2b: standard row at NULL is updated to -7.0", () => {
    const db = makeDb();
    insertRow(db, "FPT", null);

    migrateWatchlistThresholds(db);

    expect(getRow(db, "FPT")?.alert_drop_pct).toBe(STANDARD_DROP_PCT);
  });

  // ── AC3: high-vol tickers set to -9.0 ─────────────────────────────────────

  it("AC3: each high-vol ticker gets -9.0", () => {
    const db = makeDb();
    for (const code of HIGH_VOL_TICKERS) {
      insertRow(db, code, -3);
    }

    migrateWatchlistThresholds(db);

    for (const code of HIGH_VOL_TICKERS) {
      expect(getRow(db, code)?.alert_drop_pct).toBe(HIGH_VOL_DROP_PCT);
    }
  });

  it("AC3b: returns correct highVol count = 7 when all HIGH_VOL_TICKERS present", () => {
    const db = makeDb();
    for (const code of HIGH_VOL_TICKERS) {
      insertRow(db, code, -3);
    }

    const { highVol } = migrateWatchlistThresholds(db);
    expect(highVol).toBe(HIGH_VOL_TICKERS.length); // 7
  });

  // ── AC4: all rows non-null after migration ────────────────────────────────

  it("AC4: all rows non-null after migration (mixed seed)", () => {
    const db = makeDb();
    // Standard rows (old default or NULL)
    for (const code of ["VCB", "FPT", "HPG", "GAS"]) {
      insertRow(db, code, -3);
    }
    insertRow(db, "MBB", null);
    // High-vol rows
    for (const code of HIGH_VOL_TICKERS) {
      insertRow(db, code, -3);
    }

    migrateWatchlistThresholds(db);

    const rows = getAllRows(db);
    const nullRows = rows.filter((r) => r.alert_drop_pct === null);
    expect(nullRows.length).toBe(0);
  });

  // ── AC5: idempotent ────────────────────────────────────────────────────────

  it("AC5: re-running returns 0 standard updates (standard rows already at -7.0)", () => {
    const db = makeDb();
    insertRow(db, "VCB", -3);
    for (const code of HIGH_VOL_TICKERS) {
      insertRow(db, code, -3);
    }

    migrateWatchlistThresholds(db); // first run

    const { standard } = migrateWatchlistThresholds(db); // second run
    expect(standard).toBe(0); // already at -7.0, guard skips
  });

  it("AC5b: re-running leaves values unchanged", () => {
    const db = makeDb();
    insertRow(db, "VCB", -3);
    insertRow(db, "NVL", -3);

    migrateWatchlistThresholds(db);
    migrateWatchlistThresholds(db); // second run

    expect(getRow(db, "VCB")?.alert_drop_pct).toBe(STANDARD_DROP_PCT);
    expect(getRow(db, "NVL")?.alert_drop_pct).toBe(HIGH_VOL_DROP_PCT);
  });

  // ── AC6: rows already at -7.0 not re-updated ──────────────────────────────

  it("AC6: row already at -7.0 is not counted in standard updates", () => {
    const db = makeDb();
    insertRow(db, "VCB", -7.0);

    const { standard } = migrateWatchlistThresholds(db);
    expect(standard).toBe(0); // already correct, guard skips
  });

  // ── Mixed scenario: standard + high-vol together ──────────────────────────

  it("full scenario: 25 standard + 7 high-vol all end with correct values", () => {
    const db = makeDb();

    const standardCodes = [
      "GAS", "GVR", "VCB", "BID", "EIB", "MBB", "ACB", "CTG", "VPB",
      "VRE", "VIC", "VHM", "D2D", "HPG", "HSG", "NKG", "HVN", "ACV",
      "FPT", "VCI", "SSI", "HCM", "DAG", "DHG", "POW",
    ];

    for (const code of standardCodes) {
      insertRow(db, code, -3);
    }
    for (const code of HIGH_VOL_TICKERS) {
      insertRow(db, code, -3);
    }

    const { standard, highVol } = migrateWatchlistThresholds(db);

    expect(standard).toBe(standardCodes.length);
    expect(highVol).toBe(HIGH_VOL_TICKERS.length);

    // Verify values
    for (const code of standardCodes) {
      expect(getRow(db, code)?.alert_drop_pct).toBe(STANDARD_DROP_PCT);
    }
    for (const code of HIGH_VOL_TICKERS) {
      expect(getRow(db, code)?.alert_drop_pct).toBe(HIGH_VOL_DROP_PCT);
    }

    // No nulls
    const rows = getAllRows(db);
    expect(rows.filter((r) => r.alert_drop_pct === null).length).toBe(0);
  });
});
