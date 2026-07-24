/**
 * Task 302 — Kinh Dịch differentiation smoke test
 *
 * Seeds an in-memory SQLite with realistic per-stock data for VNM, FPT, VCB,
 * VEA and asserts that the SQL fixes from tasks 297/298/299 produce:
 *
 *   - non-zero computeForeignFlowScore / computeSectorScore / computeMacroScore
 *   - >= 3/6 non-zero hao scores for VCB and FPT
 *   - at least 2 distinct hexagram numbers across the 4 watchlist stocks
 *     (the readings are not all collapsed onto the same hexagram)
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import {
  computeHaoScores,
  computeForeignFlowScore,
  computeSectorScore,
  computeMacroScore,
} from "../application/services/kinhDich/kinhDichScoring.js";
import { computeReading } from "../domain/services/kinhDich/kinhDichReading.js";

const STOCKS: { code: string; domain: string; change: number }[] = [
  { code: "VNM", domain: "retail", change: 1.2 },
  { code: "FPT", domain: "tech", change: 3.5 },
  { code: "VCB", domain: "banking", change: -2.1 },
  { code: "VEA", domain: "automotive", change: 0.8 },
];

// Additional peer rows so sectorScore has a meaningful sector average.
const SECTOR_ROWS: { code: string; change: number }[] = [
  // banking peers
  { code: "BID", change: 0.2 },
  { code: "CTG", change: 0.5 },
  { code: "TCB", change: -0.3 },
  { code: "MBB", change: 0.1 },
  // tech peers
  { code: "CMG", change: 1.0 },
  { code: "ELC", change: 0.6 },
  { code: "SAM", change: 0.4 },
  // retail peers
  { code: "MWG", change: 0.8 },
  { code: "FRT", change: -0.2 },
  { code: "PNJ", change: 0.3 },
  { code: "MSN", change: 0.5 },
  // automotive peers
  { code: "HAX", change: -0.5 },
  { code: "CTF", change: 0.1 },
  { code: "TMT", change: -0.3 },
  { code: "SMA", change: 0.2 },
];

beforeAll(async () => {
  Bun.env["DB_PATH"] = ":memory:";
  await initDatabase();
  const db = getDb();

  // vnstock_trading_stats is created lazily by vnstockStore — create it here
  // with the same schema so computeForeignFlowScore can read it.
  db.exec(`
    CREATE TABLE IF NOT EXISTS vnstock_trading_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      date TEXT NOT NULL,
      foreign_room INTEGER,
      foreign_volume INTEGER,
      current_holding_ratio REAL,
      max_holding_ratio REAL,
      avg_volume_2w INTEGER,
      high_52w REAL,
      low_52w REAL,
      pct_from_high_52w REAL,
      pct_from_low_52w REAL,
      fetched_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, date)
    );
  `);

  // tracked_indicators is created lazily by commodityTracker — create it here.
  db.exec(`
    CREATE TABLE IF NOT EXISTS tracked_indicators (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      indicator    TEXT NOT NULL,
      value        REAL NOT NULL,
      unit         TEXT NOT NULL DEFAULT '',
      source       TEXT NOT NULL DEFAULT '',
      extracted_at TEXT NOT NULL
    );
  `);

  // Seed watchlist
  const insertWatch = db.prepare(
    `INSERT OR REPLACE INTO watchlist
     (code, company_name, exchange, domain, added_at)
     VALUES (?, ?, 'HOSE', ?, datetime('now'))`,
  );
  for (const s of STOCKS) insertWatch.run(s.code, s.code, s.domain);

  // Seed market_prices for watchlist + sector peers
  const insertPrice = db.prepare(
    `INSERT OR REPLACE INTO market_prices
     (code, price, change_amt, change_pct, volume, updated_at)
     VALUES (?, 50000, 0, ?, 1000000, datetime('now'))`,
  );
  for (const s of STOCKS) insertPrice.run(s.code, s.change);
  for (const r of SECTOR_ROWS) insertPrice.run(r.code, r.change);

  // Seed vnstock_trading_stats (foreign_volume / avg_volume_2w ratio ≠ 0)
  const insertStats = db.prepare(
    `INSERT INTO vnstock_trading_stats
     (code, date, foreign_volume, avg_volume_2w, fetched_at)
     VALUES (?, date('now'), ?, ?, datetime('now'))`,
  );
  insertStats.run("VNM", 30000, 100000);   // +0.30
  insertStats.run("FPT", -40000, 100000);  // -0.40
  insertStats.run("VCB", 55000, 100000);   // +0.55
  insertStats.run("VEA", -15000, 100000);  // -0.15

  // Seed tracked_indicators: 20 rising oil values → non-zero macro z-score
  const insertInd = db.prepare(
    `INSERT INTO tracked_indicators (indicator, value, extracted_at)
     VALUES (?, ?, datetime('now', '-' || ? || ' hours'))`,
  );
  for (let i = 0; i < 20; i++) {
    // Most recent (i=0) is the highest — rising trend, big positive z.
    insertInd.run("brent_crude_usd", 85 + (20 - i) * 0.4, i);
    insertInd.run("gold_usd_oz", 2000 + (20 - i) * 5, i);
    insertInd.run("wti_crude_usd", 80 + (20 - i) * 0.35, i);
  }
});

afterAll(() => {
  closeDb();
  delete Bun.env["DB_PATH"];
});

describe("Task 302 — Kinh Dịch differentiation smoke test", () => {
  it("computeForeignFlowScore returns non-zero for each seeded stock", () => {
    for (const s of STOCKS) {
      const score = computeForeignFlowScore(s.code);
      expect(score).not.toBe(0);
    }
  });

  it("computeSectorScore returns non-zero for stocks with sector peers", () => {
    // VCB vs banking peers: change -2.1 vs avg ~0.125 → negative non-zero
    expect(computeSectorScore("VCB")).not.toBe(0);
    // FPT vs tech peers: change +3.5 vs avg ~0.67 → positive non-zero
    expect(computeSectorScore("FPT")).not.toBe(0);
  });

  it("computeMacroScore returns non-zero when commodities trend upward", () => {
    const macro = computeMacroScore();
    expect(macro).not.toBe(0);
    // Rising commodities → negative score (macro stress)
    expect(macro).toBeLessThan(0);
  });

  it("VCB produces at least 3/6 non-zero hao scores", () => {
    const scores = computeHaoScores("VCB");
    const nonZero = scores.filter((s) => s !== 0).length;
    expect(nonZero).toBeGreaterThanOrEqual(3);
  });

  it("FPT produces at least 3/6 non-zero hao scores", () => {
    const scores = computeHaoScores("FPT");
    const nonZero = scores.filter((s) => s !== 0).length;
    expect(nonZero).toBeGreaterThanOrEqual(3);
  });

  it("the 4 watchlist stocks do not all collapse onto the same hexagram", () => {
    const hexagrams = new Set<number>();
    for (const s of STOCKS) {
      const scores = computeHaoScores(s.code);
      const reading = computeReading(s.code, scores, null);
      hexagrams.add(reading.queChiNh.number);
    }
    // Must differentiate at least 2 hexagrams across the 4 stocks.
    expect(hexagrams.size).toBeGreaterThanOrEqual(2);
  });
});
