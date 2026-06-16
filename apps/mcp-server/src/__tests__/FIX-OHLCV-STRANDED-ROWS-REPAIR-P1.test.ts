Bun.env["DB_PATH"] = ":memory:";
/**
 * FIX-OHLCV-STRANDED-ROWS-REPAIR-P1 — TDD tests
 *
 * Proves that purgeStrandedSeedRows() removes ALL synthetic seed bars from
 * daily_ohlcv using a GENERIC shape predicate — no date literal, no ticker allowlist.
 *
 * Shape predicate (flat zero-vol seed bar):
 *   volume = 0 AND open = high AND high = low AND low = close
 *
 * This matches:
 *   - Class 1: flat vol=0 seed with wrong-scale close (DCR close=5900 vs prior 3,600)
 *   - Class 2: flat vol=0 seed with close=0 (DAG/DFF/DMC/POM — all-zero O=H=L=C=0)
 *     NOTE: Class 2 (close=0) rows are also caught by purgeAllZeroRows(). purgeStrandedSeedRows
 *     catches them too because their shape satisfies vol=0 AND O=H=L=C. No double-count risk:
 *     DELETE is idempotent (second run deletes 0 rows).
 *
 * Does NOT match (legitimacy guard):
 *   - Real candles with vol > 0 (even if O = H = L = C on a halt day)
 *   - Real candles with vol > 0 even when O ≠ H ≠ L ≠ C
 *
 * Idempotency: running twice must be a no-op (0 additional deletions).
 * Generic: predicate must fire for ANY ticker on ANY date without per-ticker logic.
 *
 * Regression test: plants the exact DCR/H11/DAG stranded rows from the 2026-06-16
 * incident and confirms they are cleared by purgeStrandedSeedRows.
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import {
  purgeStrandedSeedRows,
  type PurgeStrandedResult,
} from "../scheduler/market-data/allzeroOhlcvBackfill.js";

// ─────────────────────────────────────────────────────────────────────────────
// DB factory
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code       TEXT NOT NULL,
      date       TEXT NOT NULL,
      open       REAL NOT NULL DEFAULT 0,
      high       REAL NOT NULL DEFAULT 0,
      low        REAL NOT NULL DEFAULT 0,
      close      REAL NOT NULL DEFAULT 0,
      volume     REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT '',
      data_env   TEXT,
      PRIMARY KEY (code, date)
    );
  `);
  return db;
}

function insertRow(
  db: Database,
  code: string,
  date: string,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
  dataEnv: string | null = null,
): void {
  db.prepare(
    `INSERT OR REPLACE INTO daily_ohlcv
       (code, date, open, high, low, close, volume, updated_at, data_env)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`,
  ).run(code, date, open, high, low, close, volume, dataEnv);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-OHLCV-STRANDED-ROWS-REPAIR-P1 — purgeStrandedSeedRows", () => {

  // ──────────────────────────────────────────────────────────────────────────
  // Regression test — exact DCR / H11 / DAG incident rows
  // Plants the 2026-06-16 stranded rows from the QA report and confirms
  // purgeStrandedSeedRows removes them all.
  // ──────────────────────────────────────────────────────────────────────────
  it("Regression: DCR close=5900 flat vol=0, H11 close=25700 flat vol=0, DAG close=0 — all purged", () => {
    const db = makeDb();

    // Class 1: flat vol=0 wrong-scale seed bars (pre-fix aggregator wrote these)
    insertRow(db, "DCR", "2026-06-16", 5900, 5900, 5900, 5900, 0);
    insertRow(db, "H11", "2026-06-16", 25700, 25700, 25700, 25700, 0);

    // Class 2: all-zero O=H=L=C=0 flat vol=0 (DAG/DFF/DMC/POM pattern)
    insertRow(db, "DAG", "2026-06-16", 0, 0, 0, 0, 0);
    insertRow(db, "DFF", "2026-06-16", 0, 0, 0, 0, 0);
    insertRow(db, "POM", "2026-06-16", 0, 0, 0, 0, 0);

    const result: PurgeStrandedResult = purgeStrandedSeedRows(db);

    expect(result.deleted).toBe(5);

    // Confirm all stranded rows are gone
    const remaining = db
      .prepare("SELECT COUNT(*) AS cnt FROM daily_ohlcv")
      .get() as { cnt: number };
    expect(remaining.cnt).toBe(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Generic: ANY ticker, ANY date — predicate must be shape-based only
  // ──────────────────────────────────────────────────────────────────────────
  it("Generic: removes stranded seed bar for any ticker / any date (no allowlist)", () => {
    const db = makeDb();

    // Unknown ticker, past date — still a seed bar by shape
    insertRow(db, "XTICKER", "2024-01-15", 99800, 99800, 99800, 99800, 0);
    insertRow(db, "ANOTHER", "2025-11-30", 15000, 15000, 15000, 15000, 0);

    const result = purgeStrandedSeedRows(db);

    expect(result.deleted).toBe(2);
    const cnt = (db.prepare("SELECT COUNT(*) AS cnt FROM daily_ohlcv").get() as { cnt: number }).cnt;
    expect(cnt).toBe(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Safety: vol > 0 candles are NEVER deleted (even if O = H = L = C)
  // A real halt day can have O=H=L=C with vol > 0 (ATC price, full halt).
  // The predicate MUST key on vol = 0.
  // ──────────────────────────────────────────────────────────────────────────
  it("Safety: real candle with vol>0 and O=H=L=C (halt day) is NOT deleted", () => {
    const db = makeDb();

    // Real halt day: market opened, traded at a single price, volume > 0
    insertRow(db, "ABC", "2026-06-16", 50000, 50000, 50000, 50000, 100000);

    // Also a real candle with varied OHLC and vol > 0
    insertRow(db, "VCB", "2026-06-16", 61000, 62000, 60500, 61500, 3000000);

    const result = purgeStrandedSeedRows(db);

    expect(result.deleted).toBe(0);

    // Both real candles must still exist
    const cnt = (db.prepare("SELECT COUNT(*) AS cnt FROM daily_ohlcv").get() as { cnt: number }).cnt;
    expect(cnt).toBe(2);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Mixed: stranded rows removed, real candles preserved in same table
  // ──────────────────────────────────────────────────────────────────────────
  it("Mixed: stranded seed rows purged, real vol>0 candles preserved", () => {
    const db = makeDb();

    // Real candles (must survive)
    insertRow(db, "FPT", "2026-06-16", 73000, 74000, 72500, 73500, 2000000);
    insertRow(db, "VCB", "2026-06-16", 61000, 62000, 60500, 61500, 3000000);
    // Real halt day (must survive — vol > 0)
    insertRow(db, "ABC", "2026-06-16", 50000, 50000, 50000, 50000, 100000);

    // Stranded seed bars (must be deleted)
    insertRow(db, "DCR", "2026-06-16", 5900, 5900, 5900, 5900, 0);
    insertRow(db, "H11", "2026-06-16", 25700, 25700, 25700, 25700, 0);
    insertRow(db, "DAG", "2026-06-16", 0, 0, 0, 0, 0);

    const result = purgeStrandedSeedRows(db);

    // 3 stranded removed
    expect(result.deleted).toBe(3);

    // 3 real candles preserved
    const cnt = (db.prepare("SELECT COUNT(*) AS cnt FROM daily_ohlcv").get() as { cnt: number }).cnt;
    expect(cnt).toBe(3);

    // Confirm the real rows by code
    const fpt = db.prepare("SELECT close FROM daily_ohlcv WHERE code='FPT'").get() as { close: number } | undefined;
    expect(fpt).toBeDefined();
    expect(fpt!.close).toBe(73500);

    const vcb = db.prepare("SELECT close FROM daily_ohlcv WHERE code='VCB'").get() as { close: number } | undefined;
    expect(vcb).toBeDefined();
    expect(vcb!.close).toBe(61500);

    const abc = db.prepare("SELECT close FROM daily_ohlcv WHERE code='ABC'").get() as { close: number } | undefined;
    expect(abc).toBeDefined();
    expect(abc!.close).toBe(50000);

    // Stranded rows must be gone
    const dcr = db.prepare("SELECT * FROM daily_ohlcv WHERE code='DCR'").get();
    expect(dcr).toBeNull();
    const h11 = db.prepare("SELECT * FROM daily_ohlcv WHERE code='H11'").get();
    expect(h11).toBeNull();
    const dag = db.prepare("SELECT * FROM daily_ohlcv WHERE code='DAG'").get();
    expect(dag).toBeNull();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Idempotency: running twice on an already-clean table deletes 0 rows
  // ──────────────────────────────────────────────────────────────────────────
  it("Idempotent: second run on clean table deletes 0 additional rows", () => {
    const db = makeDb();

    // Plant stranded rows
    insertRow(db, "DCR", "2026-06-16", 5900, 5900, 5900, 5900, 0);
    insertRow(db, "DAG", "2026-06-16", 0, 0, 0, 0, 0);

    // First run removes them
    const first = purgeStrandedSeedRows(db);
    expect(first.deleted).toBe(2);

    // Second run is a no-op
    const second = purgeStrandedSeedRows(db);
    expect(second.deleted).toBe(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Empty table: no crash, deleted=0
  // ──────────────────────────────────────────────────────────────────────────
  it("Empty table: returns deleted=0, no error", () => {
    const db = makeDb();
    const result = purgeStrandedSeedRows(db);
    expect(result.deleted).toBe(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Scale-outlier seed bars (Class 1 variant):
  // Real prior close ~3600 but seed wrote close=5900 (÷1000 error × arbitrary factor)
  // The predicate doesn't need to check scale ratio — the vol=0 flat shape is sufficient.
  // ──────────────────────────────────────────────────────────────────────────
  it("Class-1 scale-outlier seed: DCR close=5900 (expected ~3600) removed by shape alone", () => {
    const db = makeDb();

    // Real prior row (vol > 0 — must survive)
    insertRow(db, "DCR", "2026-06-15", 3600, 3720, 3550, 3620, 500000);

    // Stranded seed for next day (wrong-scale, flat, vol=0)
    insertRow(db, "DCR", "2026-06-16", 5900, 5900, 5900, 5900, 0);

    const result = purgeStrandedSeedRows(db);

    // Only the seed bar deleted
    expect(result.deleted).toBe(1);

    // Prior real row survived
    const prior = db.prepare(
      "SELECT close, volume FROM daily_ohlcv WHERE code='DCR' AND date='2026-06-15'",
    ).get() as { close: number; volume: number } | undefined;
    expect(prior).toBeDefined();
    expect(prior!.close).toBe(3620);
    expect(prior!.volume).toBe(500000);

    // Stranded row gone
    const stranded = db.prepare(
      "SELECT * FROM daily_ohlcv WHERE code='DCR' AND date='2026-06-16'",
    ).get();
    expect(stranded).toBeNull();
  });

});
