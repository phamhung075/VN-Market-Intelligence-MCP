/**
 * FIX-DIGEST-FOREIGN-FLOW-ZERO-PAD-TOPN — Tests
 *
 * Covers the two changes shipped for this fix:
 *   1. assembleEveningSummary Step 4b SQL: AND foreign_net_vol <> 0
 *      → getForeignFlowMoversFn is injected, so SQL change is verified via
 *        the default path using a real in-memory DB.
 *   2. formatForeignFlowSection: nonZero filter before rendering.
 *
 * Test cases:
 *   T-1 (partial-zero): 2 nonzero + 3 would-be-padding rows in DB
 *        → assembleEveningSummary returns only the 2 nonzero
 *   T-2 (all-zero SQL): all rows have foreign_net_vol=0
 *        → assembleEveningSummary returns empty foreignFlowMovers
 *   T-3 (formatter partial-zero): formatForeignFlowSection given mixed list
 *        → renders only nonzero lines, correct count in header
 *   T-4 (formatter all-zero): formatForeignFlowSection given all-zero list
 *        → returns "Dữ liệu không khả dụng (pipeline tạm dừng)" message (1783 canonical)
 *   T-5 (formatter 5+ nonzero): formatForeignFlowSection given 5 nonzero
 *        → renders all 5 nonzero lines, no 0.000k
 *   T-6 (formatter empty): formatForeignFlowSection given empty array
 *        → returns []
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { assembleEveningSummary } from "../application/usecases/assembleEveningSummary.js";
import { formatForeignFlowSection } from "../scheduler/briefings/eveningSummaryJob.js";
// TASK_2003 (SUBTASK-DAILY-FF-4): production code now reads foreign-flow via the
// daily_ohlcv_with_flow compat view. Reuse the real schema init/migration
// functions (no duplicated DDL) to upgrade this ad-hoc fixture so the view resolves.
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { migrateForeignFlowColumns } from "../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// DB factory — minimal schema for foreignFlowMovers step
// ─────────────────────────────────────────────────────────────────────────────

async function buildDb(): Promise<Database> {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code             TEXT NOT NULL,
      date             TEXT NOT NULL,
      open             REAL,
      high             REAL,
      low              REAL,
      close            REAL NOT NULL DEFAULT 0,
      volume           REAL,
      updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
      foreign_buy_vol  REAL,
      foreign_sell_vol REAL,
      foreign_net_vol  REAL,
      put_through_vol  REAL,
      PRIMARY KEY (code, date)
    );
    CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY,
      company_name TEXT,
      exchange TEXT NOT NULL DEFAULT 'HOSE',
      domain TEXT NOT NULL DEFAULT 'other',
      notes TEXT,
      added_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS market_prices (
      code TEXT PRIMARY KEY,
      price REAL,
      change_amt REAL,
      change_pct REAL,
      volume REAL,
      updated_at TEXT,
      exchange TEXT DEFAULT 'HOSE'
    );
    CREATE TABLE IF NOT EXISTS rag_analyses (
      id INTEGER PRIMARY KEY,
      source_title TEXT,
      level TEXT,
      sentiment TEXT,
      impact_score REAL,
      created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      triggered_at TEXT NOT NULL,
      severity TEXT NOT NULL,
      message TEXT,
      affected_actions_json TEXT
    );
    CREATE TABLE IF NOT EXISTS prediction_signals (
      id INTEGER PRIMARY KEY,
      question TEXT,
      outcome TEXT,
      confidence TEXT,
      rationale TEXT,
      source TEXT,
      created_at TEXT,
      expires_at TEXT,
      severity TEXT
    );
    CREATE TABLE IF NOT EXISTS market_messages (
      id INTEGER PRIMARY KEY,
      from_agent TEXT,
      message_type TEXT,
      content TEXT,
      sent_at TEXT
    );
    CREATE TABLE IF NOT EXISTS positions (
      id INTEGER PRIMARY KEY,
      code TEXT,
      shares REAL,
      avg_price REAL,
      opened_at TEXT,
      closed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS commodity_prices (
      source TEXT PRIMARY KEY,
      vix REAL NOT NULL DEFAULT 0,
      dxy REAL NOT NULL DEFAULT 0,
      sp500 REAL NOT NULL DEFAULT 0,
      hang_seng REAL NOT NULL DEFAULT 0,
      fetched_at TEXT NOT NULL
    );
  `);

  // TASK_2003: create daily_foreign_flow + the compat view via the real
  // init path (updated_at already present above) so the view resolves.
  initMarketDataTables(db);
  await migrateForeignFlowColumns(db);

  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// T-1: partial-zero in DB — SQL <> 0 filter returns only real movers
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-DIGEST-FOREIGN-FLOW-ZERO-PAD-TOPN T-1 — SQL excludes zero-net rows (partial-zero DB)", () => {
  let db: Database;

  beforeEach(async () => {
    db = await buildDb();
    // 2 real movers + 3 zero-pad rows — simulates 2026-06-19 scenario
    db.exec(`
      INSERT INTO daily_ohlcv (code, date, close, foreign_buy_vol, foreign_sell_vol, foreign_net_vol)
      VALUES
        ('MWG', '2026-06-19', 60000, 40000,  4531,  35469),
        ('VNH', '2026-06-19', 5000,   0,     40,   -40),
        ('ACV', '2026-06-19', 78000,  0,      0,     0),
        ('DFF', '2026-06-19', 4200,   0,      0,     0),
        ('HBC', '2026-06-19', 9500,   0,      0,     0)
    `);
  });

  it("returns exactly 2 foreignFlowMovers (the nonzero ones only)", async () => {
    const summary = await assembleEveningSummary({
      db,
      reportsDir: "/tmp/test-reports-ffz-t1",
      computeTaFn: () => null,
      getOhlcvRowCountFn: () => 0,
      getPredictionSignalsFn: async () => [],
      getPnlFn: async () => null,
    });

    expect(summary.foreignFlowMovers).toBeDefined();
    expect(summary.foreignFlowMovers!.length).toBe(2);
  });

  it("returned movers have codes MWG and VNH (the real movers)", async () => {
    const summary = await assembleEveningSummary({
      db,
      reportsDir: "/tmp/test-reports-ffz-t1b",
      computeTaFn: () => null,
      getOhlcvRowCountFn: () => 0,
      getPredictionSignalsFn: async () => [],
      getPnlFn: async () => null,
    });

    const codes = summary.foreignFlowMovers!.map((m) => m.code);
    expect(codes).toContain("MWG");
    expect(codes).toContain("VNH");
  });

  it("returned movers do NOT include ACV, DFF, HBC (the zero-pad rows)", async () => {
    const summary = await assembleEveningSummary({
      db,
      reportsDir: "/tmp/test-reports-ffz-t1c",
      computeTaFn: () => null,
      getOhlcvRowCountFn: () => 0,
      getPredictionSignalsFn: async () => [],
      getPnlFn: async () => null,
    });

    const codes = summary.foreignFlowMovers!.map((m) => m.code);
    expect(codes).not.toContain("ACV");
    expect(codes).not.toContain("DFF");
    expect(codes).not.toContain("HBC");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T-2: all-zero DB — SQL returns empty set
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-DIGEST-FOREIGN-FLOW-ZERO-PAD-TOPN T-2 — all-zero DB → empty foreignFlowMovers", () => {
  let db: Database;

  beforeEach(async () => {
    db = await buildDb();
    db.exec(`
      INSERT INTO daily_ohlcv (code, date, close, foreign_buy_vol, foreign_sell_vol, foreign_net_vol)
      VALUES
        ('ACV', '2026-06-19', 78000, 0, 0, 0),
        ('DFF', '2026-06-19',  4200, 0, 0, 0),
        ('HBC', '2026-06-19',  9500, 0, 0, 0)
    `);
  });

  it("returns empty foreignFlowMovers array when all rows are zero", async () => {
    const summary = await assembleEveningSummary({
      db,
      reportsDir: "/tmp/test-reports-ffz-t2",
      computeTaFn: () => null,
      getOhlcvRowCountFn: () => 0,
      getPredictionSignalsFn: async () => [],
      getPnlFn: async () => null,
    });

    expect(summary.foreignFlowMovers).toBeDefined();
    expect(summary.foreignFlowMovers!.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T-3: formatForeignFlowSection — partial-zero list → only nonzero rendered
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-DIGEST-FOREIGN-FLOW-ZERO-PAD-TOPN T-3 — formatter partial-zero: only nonzero lines", () => {
  it("renders only the 2 nonzero movers when 3 zeros are also present", () => {
    const movers = [
      { code: "MWG", foreignNetVol: 35469, foreignBuyVol: 40000, foreignSellVol: 4531 },
      { code: "VNH", foreignNetVol: -40,   foreignBuyVol: 0,     foreignSellVol: 40 },
      { code: "ACV", foreignNetVol: 0,     foreignBuyVol: 0,     foreignSellVol: 0 },
      { code: "DFF", foreignNetVol: 0,     foreignBuyVol: 0,     foreignSellVol: 0 },
      { code: "HBC", foreignNetVol: 0,     foreignBuyVol: 0,     foreignSellVol: 0 },
    ];

    const lines = formatForeignFlowSection(movers);

    // Should have a header line + 2 mover lines (not 5)
    const moverLines = lines.filter((l) => l.startsWith("  "));
    expect(moverLines.length).toBe(2);
  });

  it("header says 'top 2' not 'top 5'", () => {
    const movers = [
      { code: "MWG", foreignNetVol: 35469, foreignBuyVol: 40000, foreignSellVol: 4531 },
      { code: "VNH", foreignNetVol: -40,   foreignBuyVol: 0,     foreignSellVol: 40 },
      { code: "ACV", foreignNetVol: 0,     foreignBuyVol: 0,     foreignSellVol: 0 },
      { code: "DFF", foreignNetVol: 0,     foreignBuyVol: 0,     foreignSellVol: 0 },
      { code: "HBC", foreignNetVol: 0,     foreignBuyVol: 0,     foreignSellVol: 0 },
    ];

    const lines = formatForeignFlowSection(movers);
    const header = lines.find((l) => l.includes("Khối ngoại"));
    expect(header).toBeDefined();
    expect(header).toContain("top 2");
    expect(header).not.toContain("top 5");
  });

  it("does not contain ACV, DFF, or HBC in output", () => {
    const movers = [
      { code: "MWG", foreignNetVol: 35469, foreignBuyVol: 40000, foreignSellVol: 4531 },
      { code: "VNH", foreignNetVol: -40,   foreignBuyVol: 0,     foreignSellVol: 40 },
      { code: "ACV", foreignNetVol: 0,     foreignBuyVol: 0,     foreignSellVol: 0 },
      { code: "DFF", foreignNetVol: 0,     foreignBuyVol: 0,     foreignSellVol: 0 },
      { code: "HBC", foreignNetVol: 0,     foreignBuyVol: 0,     foreignSellVol: 0 },
    ];

    const joined = formatForeignFlowSection(movers).join("\n");
    expect(joined).not.toContain("ACV");
    expect(joined).not.toContain("DFF");
    expect(joined).not.toContain("HBC");
  });

  it("does not render a net-zero mover line (ACV ròng 0.000k must not appear)", () => {
    const movers = [
      { code: "MWG", foreignNetVol: 35469, foreignBuyVol: 40000, foreignSellVol: 4531 },
      { code: "VNH", foreignNetVol: -40,   foreignBuyVol: 0,     foreignSellVol: 40 },
      { code: "ACV", foreignNetVol: 0,     foreignBuyVol: 0,     foreignSellVol: 0 },
      { code: "DFF", foreignNetVol: 0,     foreignBuyVol: 0,     foreignSellVol: 0 },
    ];

    const joined = formatForeignFlowSection(movers).join("\n");
    // Net-zero padding lines must not appear (ACV/DFF with foreignNetVol=0)
    // Note: buy/sell sub-components CAN be 0.000k for a real mover (e.g. VNH buy=0)
    expect(joined).not.toContain("ACV");
    expect(joined).not.toContain("DFF");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T-4: formatForeignFlowSection — all-zero → canonical unavailability message
// (Task 1783 BUG-1 defined the canonical copy as "Dữ liệu không khả dụng (pipeline tạm dừng)")
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-DIGEST-FOREIGN-FLOW-ZERO-PAD-TOPN T-4 — formatter all-zero → no-data message", () => {
  it("returns unavailability message when all movers are zero", () => {
    const movers = [
      { code: "ACV", foreignNetVol: 0, foreignBuyVol: 0, foreignSellVol: 0 },
      { code: "DFF", foreignNetVol: 0, foreignBuyVol: 0, foreignSellVol: 0 },
      { code: "HBC", foreignNetVol: 0, foreignBuyVol: 0, foreignSellVol: 0 },
    ];

    const lines = formatForeignFlowSection(movers);
    const joined = lines.join("\n");
    expect(joined).toContain("Dữ liệu không khả dụng");
  });

  it("does not render any mover lines when all are zero", () => {
    const movers = [
      { code: "ACV", foreignNetVol: 0, foreignBuyVol: 0, foreignSellVol: 0 },
    ];

    const lines = formatForeignFlowSection(movers);
    const moverLines = lines.filter((l) => l.startsWith("  "));
    expect(moverLines.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T-5: formatForeignFlowSection — 5+ nonzero → top-5 all nonzero
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-DIGEST-FOREIGN-FLOW-ZERO-PAD-TOPN T-5 — formatter 5+ nonzero → all nonzero output", () => {
  it("renders all 5 movers when 5 nonzero movers provided", () => {
    const movers = [
      { code: "VCB", foreignNetVol:  500000, foreignBuyVol: 600000, foreignSellVol: 100000 },
      { code: "HPG", foreignNetVol: -200000, foreignBuyVol: 100000, foreignSellVol: 300000 },
      { code: "MWG", foreignNetVol:   35469, foreignBuyVol:  40000, foreignSellVol:   4531 },
      { code: "FPT", foreignNetVol:  150000, foreignBuyVol: 200000, foreignSellVol:  50000 },
      { code: "VNH", foreignNetVol:     -40, foreignBuyVol:      0, foreignSellVol:     40 },
    ];

    const lines = formatForeignFlowSection(movers);
    const moverLines = lines.filter((l) => l.startsWith("  "));
    expect(moverLines.length).toBe(5);
  });

  it("all 5 mover codes appear in output when all 5 are nonzero", () => {
    const movers = [
      { code: "VCB", foreignNetVol:  500000, foreignBuyVol: 600000, foreignSellVol: 100000 },
      { code: "HPG", foreignNetVol: -200000, foreignBuyVol: 100000, foreignSellVol: 300000 },
      { code: "MWG", foreignNetVol:   35469, foreignBuyVol:  40000, foreignSellVol:   4531 },
      { code: "FPT", foreignNetVol:  150000, foreignBuyVol: 200000, foreignSellVol:  50000 },
      { code: "VNH", foreignNetVol:     -40, foreignBuyVol:      0, foreignSellVol:     40 },
    ];

    const joined = formatForeignFlowSection(movers).join("\n");
    // All nonzero movers must appear — the padding filter must not incorrectly drop them
    expect(joined).toContain("VCB");
    expect(joined).toContain("HPG");
    expect(joined).toContain("MWG");
    expect(joined).toContain("FPT");
    expect(joined).toContain("VNH");
  });

  it("header says 'top 5'", () => {
    const movers = [
      { code: "VCB", foreignNetVol:  500000, foreignBuyVol: 600000, foreignSellVol: 100000 },
      { code: "HPG", foreignNetVol: -200000, foreignBuyVol: 100000, foreignSellVol: 300000 },
      { code: "MWG", foreignNetVol:   35469, foreignBuyVol:  40000, foreignSellVol:   4531 },
      { code: "FPT", foreignNetVol:  150000, foreignBuyVol: 200000, foreignSellVol:  50000 },
      { code: "VNH", foreignNetVol:     -40, foreignBuyVol:      0, foreignSellVol:     40 },
    ];

    const lines = formatForeignFlowSection(movers);
    const header = lines.find((l) => l.includes("Khối ngoại"));
    expect(header).toBeDefined();
    expect(header).toContain("top 5");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T-6: formatForeignFlowSection — empty array → []
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-DIGEST-FOREIGN-FLOW-ZERO-PAD-TOPN T-6 — formatter empty array → []", () => {
  it("returns empty array when movers is empty", () => {
    expect(formatForeignFlowSection([])).toEqual([]);
  });
});
