Bun.env["DB_PATH"] = ":memory:";
// src/__tests__/OHLCV-WHOLEROW-LT1000-sanity-pass4.test.ts
// CONTAM-10-SANITY / Sprint OHLCV-UNIT-CONTAM-WHOLEROW-LT1000
//
// TDD tests for Pass 4 of runOhlcvSanityCheck:
//   FR-G4 whole-row close<1000 anchor divergence scan.
//
// Acceptance criteria:
//   AC-P4-1: Contaminated row flagged — ticker with clean anchor (close>=1000) and
//            a recent bar where anchor_close/bar.close >= 100 AND bar.close < 1000
//            → hit with flag="whole_row_lt1000_scale:..." AND sentBug=true.
//   AC-P4-2: Clean row not flagged — ticker with clean anchor AND recent bar where
//            bar.close >= 1000 → no Pass 4 hit (clean data passes).
//   AC-P4-3: Legitimately cheap stock not flagged — ticker with ALL-history close < 1000
//            (no clean anchor) AND recent bar with close < 1000 → NOT flagged
//            (no anchor → skip).
//   AC-P4-4: Index ticker excluded — VNINDEX has a "clean" bar in history with
//            close >= 1000 but is excluded from anchor query; a same-ticker window
//            bar with close < 1000 is NOT flagged (index exempt at both anchor
//            build AND Pass 4 check via INDEX_TICKERS + tickerType).
//   AC-P4-5: Message action line updated for whole-row hits — BUG message contains
//            "repair-ohlcv-unit-contamination-wholerow-lt1000.ts" when Pass 4 flags.
//   AC-P4-6: Ratio exactly at threshold (>=100) is flagged; ratio below 100 is not.
//
// Uses real in-memory SQLite — no mocks.
// Sanity job imports from domain (validateOhlcvUnit) — allowed per DDD rules.

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { runOhlcvSanityCheck } from "../scheduler/market-data/ohlcvSanityCheckJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Pinned time constants
// ─────────────────────────────────────────────────────────────────────────────

const NOW_ISO = "2026-06-30T10:00:00.000Z";
const NOW_MS  = Date.parse(NOW_ISO);
// 7-day window cutoff: 2026-06-23
const TODAY        = "2026-06-30";
const YESTERDAY    = "2026-06-29";
const THREE_DAYS   = "2026-06-27";
// Historical anchor bar — well outside the 7-day window
const HIST_DATE    = "2026-01-15";
// Eight days ago — outside window (used for old contaminated bars)
const EIGHT_DAYS   = "2026-06-22";

// ─────────────────────────────────────────────────────────────────────────────
// DB helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY,
      exchange TEXT NOT NULL DEFAULT 'HOSE'
    );
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code       TEXT NOT NULL,
      date       TEXT NOT NULL,
      open       REAL NOT NULL DEFAULT 0,
      high       REAL NOT NULL DEFAULT 0,
      low        REAL NOT NULL DEFAULT 0,
      close      REAL NOT NULL,
      volume     REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (code, date)
    );
    CREATE INDEX IF NOT EXISTS idx_daily_ohlcv_code_date
      ON daily_ohlcv(code, date DESC);
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
  volume = 1_000_000,
): void {
  db.prepare(
    `INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).run(code, date, open, high, low, close, volume);
}

function noBug(): (msg: string) => Promise<void> {
  return async (_msg: string) => { /* no-op */ };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pass 4 tests
// ─────────────────────────────────────────────────────────────────────────────

describe("CONTAM-10-SANITY — Pass 4 (whole-row close<1000 anchor divergence)", () => {

  // ─────────────────────────────────────────────────────────────────────────
  // AC-P4-1: Contaminated row flagged
  // ─────────────────────────────────────────────────────────────────────────
  it("AC-P4-1: ticker with clean anchor (130000) and recent bar close=130 → Pass 4 hit flagged", async () => {
    const db = makeDb();
    addTicker(db, "FPT");

    // Historical clean anchor: FPT real price ~130,000 VND
    addRow(db, "FPT", HIST_DATE, 129_000, 131_000, 128_000, 130_000, 2_000_000);
    // Recent window bar: contaminated whole-row thousands scale
    // close=130 << anchor=130000: ratio = 130000/130 ≈ 1000 → >= 100 → flag
    addRow(db, "FPT", YESTERDAY, 129, 131, 128, 130, 900_000);

    const bugCalls: string[] = [];
    const sendBugFn = async (msg: string) => { bugCalls.push(msg); };

    const result = await runOhlcvSanityCheck({
      db: () => db,
      nowMsFn: () => NOW_MS,
      sendBugFn,
    });

    // Should have exactly one Pass 4 hit
    const pass4Hits = result.hits.filter((h) => h.flag.startsWith("whole_row_lt1000_scale"));
    expect(pass4Hits).toHaveLength(1);
    expect(pass4Hits[0]!.code).toBe("FPT");
    expect(pass4Hits[0]!.date).toBe(YESTERDAY);
    expect(pass4Hits[0]!.close).toBe(130);
    expect(pass4Hits[0]!.flag).toContain("ratio=");
    expect(pass4Hits[0]!.flag).toContain("anchor=130000");
    expect(pass4Hits[0]!.flag).toContain("row.close=130");

    // BUG was sent
    expect(result.sentBug).toBe(true);
    expect(bugCalls).toHaveLength(1);
    expect(bugCalls[0]!).toContain("[ohlcv-sanity]");
    expect(bugCalls[0]!).toContain("FPT");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AC-P4-2: Clean row not flagged
  // ─────────────────────────────────────────────────────────────────────────
  it("AC-P4-2: ticker with clean anchor and recent bar close=130000 → no Pass 4 hit", async () => {
    const db = makeDb();
    addTicker(db, "VCB");

    // Historical anchor
    addRow(db, "VCB", HIST_DATE, 95_000, 97_000, 94_000, 96_000, 3_000_000);
    // Recent window bar: clean full-VND price
    addRow(db, "VCB", YESTERDAY, 95_000, 97_000, 94_000, 96_500, 2_500_000);

    const bugCalls: string[] = [];
    const sendBugFn = async (msg: string) => { bugCalls.push(msg); };

    const result = await runOhlcvSanityCheck({
      db: () => db,
      nowMsFn: () => NOW_MS,
      sendBugFn,
    });

    const pass4Hits = result.hits.filter((h) => h.flag.startsWith("whole_row_lt1000_scale"));
    expect(pass4Hits).toHaveLength(0);
    expect(result.hitCount).toBe(0);
    expect(result.sentBug).toBe(false);
    expect(bugCalls).toHaveLength(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AC-P4-3: Legitimately cheap stock — no qualifying anchor → NOT flagged
  // ─────────────────────────────────────────────────────────────────────────
  it("AC-P4-3: legitimately cheap stock (all-history close < 1000) → no anchor → NOT flagged", async () => {
    const db = makeDb();
    // CHEAP is a stock whose real VND price has always been in the 100–800 range
    addTicker(db, "CHEAP");

    // Historical bars: all close < 1000 (no qualifying anchor)
    addRow(db, "CHEAP", HIST_DATE,   510, 550, 490, 520, 200_000);
    addRow(db, "CHEAP", "2026-03-01", 480, 510, 460, 500, 150_000);
    // Recent window bar: also close < 1000 (legitimate)
    addRow(db, "CHEAP", YESTERDAY,   530, 560, 510, 540, 180_000);

    const bugCalls: string[] = [];
    const sendBugFn = async (msg: string) => { bugCalls.push(msg); };

    const result = await runOhlcvSanityCheck({
      db: () => db,
      nowMsFn: () => NOW_MS,
      sendBugFn,
    });

    const pass4Hits = result.hits.filter((h) => h.flag.startsWith("whole_row_lt1000_scale"));
    expect(pass4Hits).toHaveLength(0);
    // Pass 1 should also not flag (close=540 >= STOCK_MIN_VND=100, and within plausible range)
    // Overall: no contamination
    expect(result.sentBug).toBe(false);
    expect(bugCalls).toHaveLength(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AC-P4-4: Index ticker excluded — VNINDEX not flagged even if close < 1000
  // ─────────────────────────────────────────────────────────────────────────
  it("AC-P4-4: index ticker (VNINDEX) with close < 1000 in window → excluded from Pass 4 (not flagged)", async () => {
    const db = makeDb();
    addTicker(db, "VNINDEX");

    // Historical "anchor-like" bar for VNINDEX — excluded from anchor query (index ticker)
    addRow(db, "VNINDEX", HIST_DATE, 1_300, 1_350, 1_280, 1_320, 0);
    // Recent bar with close < 1000 (e.g. hypothetical low-index value)
    // Even if ratio = 1320/500 = 2.64, it's below 100; but the real test is
    // that INDEX_TICKERS guard fires at Pass 4 tickerType check.
    addRow(db, "VNINDEX", YESTERDAY, 480, 500, 460, 490, 0);

    const bugCalls: string[] = [];
    const sendBugFn = async (msg: string) => { bugCalls.push(msg); };

    const result = await runOhlcvSanityCheck({
      db: () => db,
      nowMsFn: () => NOW_MS,
      sendBugFn,
    });

    const pass4Hits = result.hits.filter((h) => h.flag.startsWith("whole_row_lt1000_scale"));
    expect(pass4Hits).toHaveLength(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AC-P4-5: BUG message contains the new repair script reference
  // ─────────────────────────────────────────────────────────────────────────
  it("AC-P4-5: Pass 4 hit → BUG message action line references wholerow repair script", async () => {
    const db = makeDb();
    addTicker(db, "VHM");

    // Clean anchor
    addRow(db, "VHM", HIST_DATE, 45_000, 47_000, 44_000, 46_000, 1_500_000);
    // Contaminated recent bar: VHM close ~46 (thousands scale)
    // ratio = 46000/46 ≈ 1000 → flagged
    addRow(db, "VHM", THREE_DAYS, 45, 47, 44, 46, 800_000);

    const bugCalls: string[] = [];
    const sendBugFn = async (msg: string) => { bugCalls.push(msg); };

    await runOhlcvSanityCheck({ db: () => db, nowMsFn: () => NOW_MS, sendBugFn });

    expect(bugCalls).toHaveLength(1);
    expect(bugCalls[0]!).toContain("repair-ohlcv-unit-contamination-wholerow-lt1000.ts");
    expect(bugCalls[0]!).toContain("--dry-run");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AC-P4-6: Ratio threshold boundary — ratio=100 flagged, ratio=99 not flagged
  // ─────────────────────────────────────────────────────────────────────────
  it("AC-P4-6a: ratio exactly 100 (anchor=100000, close=1000) → NOT flagged (close=1000 is not < 1000)", async () => {
    // close must be STRICTLY < 1000 to trigger Pass 4
    const db = makeDb();
    addTicker(db, "RATIO1000");

    addRow(db, "RATIO1000", HIST_DATE,  99_000, 101_000, 98_000, 100_000, 1_000_000);
    // close=1000 → condition row.close < 1000 is FALSE → no Pass 4 hit
    addRow(db, "RATIO1000", YESTERDAY, 990, 1010, 980, 1000, 500_000);

    const result = await runOhlcvSanityCheck({
      db: () => db,
      nowMsFn: () => NOW_MS,
      sendBugFn: noBug(),
    });

    const pass4Hits = result.hits.filter((h) => h.flag.startsWith("whole_row_lt1000_scale"));
    expect(pass4Hits).toHaveLength(0);
  });

  it("AC-P4-6b: ratio=100 (anchor=100000, close=999) → flagged (ratio=100.1 >= 100)", async () => {
    const db = makeDb();
    addTicker(db, "RATIOB");

    // anchor_close = 100000, close = 999 → ratio = 100000/999 ≈ 100.1 → flagged
    addRow(db, "RATIOB", HIST_DATE, 99_000, 101_000, 98_000, 100_000, 1_000_000);
    addRow(db, "RATIOB", YESTERDAY, 998, 1010, 980, 999, 500_000);

    const bugCalls: string[] = [];
    const sendBugFn = async (msg: string) => { bugCalls.push(msg); };

    const result = await runOhlcvSanityCheck({
      db: () => db,
      nowMsFn: () => NOW_MS,
      sendBugFn,
    });

    const pass4Hits = result.hits.filter((h) => h.flag.startsWith("whole_row_lt1000_scale"));
    expect(pass4Hits).toHaveLength(1);
    expect(pass4Hits[0]!.close).toBe(999);
  });

  it("AC-P4-6c: ratio below 100 (anchor=5000, close=100) ratio=50 → NOT flagged", async () => {
    const db = makeDb();
    addTicker(db, "RATIOC");

    // anchor=5000, close=100 → ratio=50 → below threshold → not flagged
    // This could be a stock that was once ~5000 VND and has since fallen to 100 VND
    // (unlikely legitimate scenario but tests the 100x boundary correctly)
    addRow(db, "RATIOC", HIST_DATE, 4_800, 5_200, 4_700, 5_000, 1_000_000);
    addRow(db, "RATIOC", YESTERDAY, 98, 104, 96, 100, 300_000);

    const result = await runOhlcvSanityCheck({
      db: () => db,
      nowMsFn: () => NOW_MS,
      sendBugFn: noBug(),
    });

    const pass4Hits = result.hits.filter((h) => h.flag.startsWith("whole_row_lt1000_scale"));
    expect(pass4Hits).toHaveLength(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AC-P4-7: Multiple index tickers all excluded — VN30, HNXINDEX, HNX30, UPCOMINDEX
  // ─────────────────────────────────────────────────────────────────────────
  it("AC-P4-7: all five INDEX_TICKERS excluded — none flagged regardless of anchor/close", async () => {
    const db = makeDb();
    const indexCodes = ["VNINDEX", "VN30", "HNXINDEX", "HNX30", "UPCOMINDEX"];
    for (const code of indexCodes) {
      addTicker(db, code);
      // Each has a historical bar with close >= 1000 (would be an anchor if not excluded)
      addRow(db, code, HIST_DATE, 1_200, 1_250, 1_180, 1_220, 0);
      // And a window bar with close < 1000 (ratio would be >= 100 for some)
      addRow(db, code, YESTERDAY, 8, 10, 7, 9, 0);
    }

    const result = await runOhlcvSanityCheck({
      db: () => db,
      nowMsFn: () => NOW_MS,
      sendBugFn: noBug(),
    });

    const pass4Hits = result.hits.filter((h) => h.flag.startsWith("whole_row_lt1000_scale"));
    expect(pass4Hits).toHaveLength(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AC-P4-8: Only old contaminated bars (outside 7-day window) — Pass 4
  // does NOT flag them. The monitor's scan window covers last 7 days only;
  // historical cleanup is the repair migration's responsibility.
  //
  // Note: the contaminated bar outside the window may still affect Pass 2
  // (used as prior-close) if the inside-window bar transitions from it.
  // This test validates Pass 4 specifically: no whole_row_lt1000_scale hit.
  // ─────────────────────────────────────────────────────────────────────────
  it("AC-P4-8: contaminated bar outside 7-day window → Pass 4 does NOT flag it", async () => {
    const db = makeDb();
    addTicker(db, "OLD");

    // Clean anchor in history (close >= 1000)
    addRow(db, "OLD", HIST_DATE,   50_000, 52_000, 49_000, 51_000, 1_000_000);
    // Contaminated bar outside 7-day window (8 days ago, not in scan rows)
    addRow(db, "OLD", EIGHT_DAYS, 50, 52, 49, 51, 600_000);
    // Clean bar inside window: close >= 1000 → Pass 4 condition row.close < 1000 is FALSE
    // (Pass 2 may fire due to prior_close=51 from EIGHT_DAYS, but Pass 4 does not)
    addRow(db, "OLD", YESTERDAY, 51_000, 53_000, 50_000, 52_000, 900_000);

    const result = await runOhlcvSanityCheck({
      db: () => db,
      nowMsFn: () => NOW_MS,
      sendBugFn: noBug(),
    });

    // Pass 4 specifically: no whole_row_lt1000_scale hit
    const pass4Hits = result.hits.filter((h) => h.flag.startsWith("whole_row_lt1000_scale"));
    expect(pass4Hits).toHaveLength(0);
    // Other passes may flag (e.g. Pass 2 scale_mismatch_vs_prior due to contaminated prior-close)
    // — that is expected behaviour and not the concern of this Pass 4 test.
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AC-P4-9: Multiple contaminated tickers in one scan — all flagged
  // ─────────────────────────────────────────────────────────────────────────
  it("AC-P4-9: two contaminated tickers in window → both flagged, one BUG message", async () => {
    const db = makeDb();
    addTicker(db, "FPT");
    addTicker(db, "DHG");

    // FPT: anchor=130000, window close=130 → ratio=1000
    addRow(db, "FPT", HIST_DATE, 129_000, 131_000, 128_000, 130_000, 2_000_000);
    addRow(db, "FPT", YESTERDAY, 129, 131, 128, 130, 900_000);

    // DHG: anchor=93000, window close=93 → ratio=1000
    addRow(db, "DHG", HIST_DATE, 91_000, 95_000, 89_000, 93_000, 800_000);
    addRow(db, "DHG", THREE_DAYS, 91, 95, 89, 93, 500_000);

    const bugCalls: string[] = [];
    const sendBugFn = async (msg: string) => { bugCalls.push(msg); };

    const result = await runOhlcvSanityCheck({
      db: () => db,
      nowMsFn: () => NOW_MS,
      sendBugFn,
    });

    const pass4Hits = result.hits.filter((h) => h.flag.startsWith("whole_row_lt1000_scale"));
    expect(pass4Hits).toHaveLength(2);

    const codes = pass4Hits.map((h) => h.code).sort();
    expect(codes).toEqual(["DHG", "FPT"]);

    // Single BUG message (not per-ticker)
    expect(bugCalls).toHaveLength(1);
    expect(result.sentBug).toBe(true);
  });

});
