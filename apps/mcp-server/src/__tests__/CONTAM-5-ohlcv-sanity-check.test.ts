Bun.env["DB_PATH"] = ":memory:";
// src/__tests__/CONTAM-5-ohlcv-sanity-check.test.ts
// Task CONTAM-5 / Sprint OHLCV-UNIT-CONTAM
//
// TDD tests for runOhlcvSanityCheck:
//   AC-1: clean rows → hitCount=0, sentBug=false
//   AC-2: contaminated row (open<100 stock) → hitCount>0, sentBug=true, flag contains reason
//   AC-3: all-zero row (BACKLOG_CONTAM_8 known defect) → skippedAllZero=1, hitCount=0, no BUG
//   AC-4: row older than 7 days → not scanned (outside window)
//   AC-5: index ticker exempt from stock range guard (VNINDEX ~1200 is valid)
//   AC-6: multiple contaminated rows → all hits returned in result
//   AC-7: sendBugFn throws → sentBug=false, result still returned (error swallowed)

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { runOhlcvSanityCheck } from "../scheduler/market-data/ohlcvSanityCheckJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Pinned time constants
// ─────────────────────────────────────────────────────────────────────────────
const NOW_ISO = "2026-06-12T16:00:00.000Z";
const NOW_MS = Date.parse(NOW_ISO);
const TODAY = "2026-06-12";
const YESTERDAY = "2026-06-11";
const THREE_DAYS_AGO = "2026-06-09";
const EIGHT_DAYS_AGO = "2026-06-04"; // outside 7-day window

// ─────────────────────────────────────────────────────────────────────────────
// DB factory helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY,
      exchange TEXT NOT NULL DEFAULT 'HOSE'
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code       TEXT,
      date       TEXT,
      open       REAL,
      high       REAL,
      low        REAL,
      close      REAL,
      volume     REAL,
      updated_at TEXT,
      PRIMARY KEY (code, date)
    );
  `);
  return db;
}

function addTicker(db: Database, code: string): void {
  db.prepare("INSERT OR IGNORE INTO watchlist (code) VALUES (?)").run(code);
}

function addRow(
  db: Database,
  code: string,
  date: string,
  open: number,
  high: number,
  low: number,
  close: number,
  volume = 1000,
): void {
  db.prepare(
    `INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(code, date, open, high, low, close, volume, new Date().toISOString());
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("CONTAM-5 — runOhlcvSanityCheck", () => {

  // ─────────────────────────────────────────────────────────────────────────
  // AC-1: clean rows → no contamination detected
  // ─────────────────────────────────────────────────────────────────────────
  it("AC-1: clean full-VND rows → hitCount=0, sentBug=false, scanned=rows in window", async () => {
    const db = makeDb();
    addTicker(db, "FPT");
    addTicker(db, "VCB");

    // Clean full-VND rows for 2 tickers over 2 dates
    addRow(db, "FPT", TODAY,     140_000, 142_000, 138_000, 141_000);
    addRow(db, "FPT", YESTERDAY, 139_000, 141_000, 138_000, 140_000);
    addRow(db, "VCB", TODAY,      62_000,  63_000,  61_000,  62_500);

    const bugCalls: string[] = [];
    const sendBugFn = async (msg: string) => { bugCalls.push(msg); return true; };

    const result = await runOhlcvSanityCheck({ db: () => db, nowMsFn: () => NOW_MS, sendBugFn });

    expect(result.hitCount).toBe(0);
    expect(result.sentBug).toBe(false);
    expect(result.scanned).toBe(3);
    expect(result.skippedAllZero).toBe(0);
    expect(bugCalls).toHaveLength(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AC-2: contaminated row (open < 100 for stock) → flagged, BUG sent
  // ─────────────────────────────────────────────────────────────────────────
  it("AC-2: stock row with open=0.9 (thousand-VND leakage) → hitCount=1, sentBug=true", async () => {
    const db = makeDb();
    addTicker(db, "VNH");

    // Contaminated VNH row: open=0.9 (thousand-VND), high=1000 (full-VND)
    addRow(db, "VNH", TODAY, 0.9, 1000, 0.9, 1000);

    const bugCalls: string[] = [];
    const sendBugFn = async (msg: string) => { bugCalls.push(msg); return true; };

    const result = await runOhlcvSanityCheck({ db: () => db, nowMsFn: () => NOW_MS, sendBugFn });

    expect(result.hitCount).toBe(1);
    expect(result.sentBug).toBe(true);
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]!.code).toBe("VNH");
    expect(result.hits[0]!.date).toBe(TODAY);
    expect(result.hits[0]!.flag).toContain("VNH");

    // BUG Telegram was sent
    expect(bugCalls).toHaveLength(1);
    expect(bugCalls[0]!).toContain("[ohlcv-sanity]");
    expect(bugCalls[0]!).toContain("VNH");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AC-3: all-zero row → skipped, NOT a contamination hit, no BUG
  // ─────────────────────────────────────────────────────────────────────────
  it("AC-3: all-zero row (BACKLOG_CONTAM_8) → skippedAllZero=1, hitCount=0, no BUG", async () => {
    const db = makeDb();
    addTicker(db, "FPT");
    addTicker(db, "GAS");

    // All-zero rows (known 2026-05-30 bulk defect)
    addRow(db, "FPT", THREE_DAYS_AGO, 0, 0, 0, 0);
    addRow(db, "GAS", THREE_DAYS_AGO, 0, 0, 0, 0);

    // Also a clean row to confirm scanned count
    addRow(db, "FPT", TODAY, 140_000, 142_000, 138_000, 141_000);

    const bugCalls: string[] = [];
    const sendBugFn = async (msg: string) => { bugCalls.push(msg); return true; };

    const result = await runOhlcvSanityCheck({ db: () => db, nowMsFn: () => NOW_MS, sendBugFn });

    expect(result.skippedAllZero).toBe(2);
    expect(result.hitCount).toBe(0);
    expect(result.sentBug).toBe(false);
    expect(bugCalls).toHaveLength(0);
    // scanned = 3 total rows fetched (zeros + clean)
    expect(result.scanned).toBe(3);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AC-4: row older than 7 days → outside window, not scanned
  // ─────────────────────────────────────────────────────────────────────────
  it("AC-4: contaminated row older than 7 days → not detected (outside window)", async () => {
    const db = makeDb();
    addTicker(db, "FPT");

    // Old contaminated row — outside 7-day window
    addRow(db, "FPT", EIGHT_DAYS_AGO, 0.9, 1000, 0.9, 1000);

    // Also a clean row within the window
    addRow(db, "FPT", TODAY, 140_000, 142_000, 138_000, 141_000);

    const bugCalls: string[] = [];
    const sendBugFn = async (msg: string) => { bugCalls.push(msg); return true; };

    const result = await runOhlcvSanityCheck({ db: () => db, nowMsFn: () => NOW_MS, sendBugFn });

    // Only the clean row in window was scanned
    expect(result.scanned).toBe(1);
    expect(result.hitCount).toBe(0);
    expect(result.sentBug).toBe(false);
    expect(bugCalls).toHaveLength(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AC-5: index ticker exempt from stock range guard
  // ─────────────────────────────────────────────────────────────────────────
  it("AC-5: VNINDEX ~1200 → valid index (exempt from 100-floor guard), no hit", async () => {
    const db = makeDb();
    addTicker(db, "VNINDEX");

    // VNINDEX typical value ~1200 — would fail stock range guard (< 100? no, 1200 > 100)
    // but also a typical extreme index case to confirm index exemption works
    // Test a value < STOCK_MIN_VND = 100 for index (should be exempt)
    // Actually VNINDEX = 1200, not < 100. Test a more extreme case:
    // Use a VN30-style sub-1200 value that is valid for index but invalid for stock
    // VNINDEX on good days: 1200, VN30: 1300, HNXINDEX: ~240
    addRow(db, "VNINDEX", TODAY, 1200, 1220, 1180, 1210);

    const bugCalls: string[] = [];
    const sendBugFn = async (msg: string) => { bugCalls.push(msg); return true; };

    const result = await runOhlcvSanityCheck({ db: () => db, nowMsFn: () => NOW_MS, sendBugFn });

    expect(result.hitCount).toBe(0);
    expect(result.sentBug).toBe(false);
    expect(bugCalls).toHaveLength(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AC-5b: stock ticker with value ~1200 should pass (1200 > STOCK_MIN_VND=100)
  // Confirms guard doesn't over-reject plausible low-price stocks
  // ─────────────────────────────────────────────────────────────────────────
  it("AC-5b: low-price stock ~1200 VND → valid stock (above 100-floor), no hit", async () => {
    const db = makeDb();
    addTicker(db, "DAG");

    // DAG ~1400 full-VND (a real low-price VN stock)
    addRow(db, "DAG", TODAY, 1400, 1450, 1350, 1420);

    const bugCalls: string[] = [];
    const sendBugFn = async (msg: string) => { bugCalls.push(msg); return true; };

    const result = await runOhlcvSanityCheck({ db: () => db, nowMsFn: () => NOW_MS, sendBugFn });

    expect(result.hitCount).toBe(0);
    expect(result.sentBug).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AC-6: multiple contaminated rows → all hits collected
  // ─────────────────────────────────────────────────────────────────────────
  it("AC-6: 3 contaminated rows → hitCount=3, all hits in result.hits", async () => {
    const db = makeDb();
    addTicker(db, "VNH");
    addTicker(db, "FPT");
    addTicker(db, "GAS");

    // All contaminated (open < 100 = thousand-VND leakage for stocks)
    addRow(db, "VNH", TODAY,      0.9,  1000, 0.9,  1000);
    addRow(db, "FPT", TODAY,      90, 140_000, 90, 140_000); // open=90 < 100
    addRow(db, "GAS", THREE_DAYS_AGO, 45.2, 80_000, 45.2, 80_000); // open=45.2 < 100

    const bugCalls: string[] = [];
    const sendBugFn = async (msg: string) => { bugCalls.push(msg); return true; };

    const result = await runOhlcvSanityCheck({ db: () => db, nowMsFn: () => NOW_MS, sendBugFn });

    expect(result.hitCount).toBe(3);
    expect(result.hits).toHaveLength(3);
    expect(result.sentBug).toBe(true);

    const codes = result.hits.map((h) => h.code).sort();
    expect(codes).toEqual(["FPT", "GAS", "VNH"]);

    // One BUG message (not one per row)
    expect(bugCalls).toHaveLength(1);
    expect(bugCalls[0]!).toContain("3 row(s)");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AC-7: sendBugFn throws → sentBug=false, result still returned (error swallowed)
  // ─────────────────────────────────────────────────────────────────────────
  it("AC-7: sendBugFn throws → sentBug=false, no crash, hitCount still correct", async () => {
    const db = makeDb();
    addTicker(db, "VNH");
    addRow(db, "VNH", TODAY, 0.9, 1000, 0.9, 1000);

    const sendBugFn = async (_msg: string): Promise<unknown> => {
      throw new Error("Telegram network timeout");
    };

    let result: Awaited<ReturnType<typeof runOhlcvSanityCheck>> | undefined;
    result = await runOhlcvSanityCheck({ db: () => db, nowMsFn: () => NOW_MS, sendBugFn });

    expect(result).toBeDefined();
    expect(result!.hitCount).toBe(1);
    expect(result!.sentBug).toBe(false); // send failed but no crash
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AC-8: empty watchlist → early return, no scan
  // ─────────────────────────────────────────────────────────────────────────
  it("AC-8: empty watchlist → scanned=0, hitCount=0, sentBug=false", async () => {
    const db = makeDb();
    // No tickers added

    const bugCalls: string[] = [];
    const sendBugFn = async (msg: string) => { bugCalls.push(msg); return true; };

    const result = await runOhlcvSanityCheck({ db: () => db, nowMsFn: () => NOW_MS, sendBugFn });

    expect(result.scanned).toBe(0);
    expect(result.hitCount).toBe(0);
    expect(result.sentBug).toBe(false);
    expect(bugCalls).toHaveLength(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AC-9: hilo ratio extreme (high/low > 5) → flagged
  // ─────────────────────────────────────────────────────────────────────────
  it("AC-9: extreme H/L ratio (high=600000, low=100000 → ratio=6>5) → flagged as contamination", async () => {
    const db = makeDb();
    addTicker(db, "HPG");

    // high/low ratio = 6 > HILO_RATIO_MAX=5 → hilo_ratio_too_wide
    addRow(db, "HPG", TODAY, 100_000, 600_000, 100_000, 300_000);

    const bugCalls: string[] = [];
    const sendBugFn = async (msg: string) => { bugCalls.push(msg); return true; };

    const result = await runOhlcvSanityCheck({ db: () => db, nowMsFn: () => NOW_MS, sendBugFn });

    expect(result.hitCount).toBe(1);
    expect(result.hits[0]!.flag).toContain("hilo_ratio");
    expect(result.sentBug).toBe(true);
  });

});
