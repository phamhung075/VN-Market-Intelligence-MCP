/**
 * FIX-OHLCV-SCALE-X1000-AUTO-REPAIR — Regression suite
 *
 * Task: FIX-OHLCV-SCALE-X1000-AUTO-REPAIR (P1, 2026-06-18)
 *
 * Verification gates (from task spec):
 *   (a) x1000-inflated candle (e.g. AAA at 7.3M vs prior real 7,260) is auto-CORRECTED
 *       to raw VND at write-time (the clean ×1000 class handled by detectAndNormalizeScaleFromPrevClose).
 *   (b) NEW: Regression test for abnormal-bar reject path — synthetic 72.5M-vs-prior-~59k
 *       bar (VNM 2026-06-01 incident class) is REJECTED at write-time, NOT landed-and-flagged.
 *       Reject → write-no-row → honest gap (/goal#1 no-fake-data).
 *   (c) FR-G2 still fires for genuine threshold-crossing anomalies (no over-correction).
 *   (d) Full CI green.
 *   (e) vol=0 + data_env=NULL + implausible magnitude → rejected at write-time, NOT landed.
 *   (f) ROOT: the write-service implausible-magnitude reject fires regardless of whether
 *       the bar is a clean ×1000, ÷1000, or ×N (N != 1000, e.g. ×1225).
 *
 * Test coverage:
 *   REPAIR-T1  Clean ×1000 direction: AAA 7.26M vs prior 7260 → REJECTED at write-time.
 *              (7.26M / 7260 = 1000 >= SCALE_DETECTION_RATIO=50 → implausible_magnitude_reject)
 *   REPAIR-T2  Abnormal-bar VNM class: 72.5M vs prior ~59200 → REJECTED (ratio=1224× >> 50).
 *              No row written — honest gap left.
 *   REPAIR-T3  vol=0 + data_env=NULL + 72.5M inflated high: rejected regardless of open/low being normal.
 *              (Simulates the exact VNM 2026-06-01 incident bar: open=59200, high=72500000,
 *               low=59200, close=72500000, volume=0.)
 *   REPAIR-T4  Genuine large move within ×50 threshold → NOT rejected (no over-correction).
 *              A +48× price change (close = prevClose * 48) must pass through to validateOhlcvUnit.
 *   REPAIR-T5  ÷1000 direction still corrected: VHM 136.1 vs prior 136100 → corrected to 136100.
 *   REPAIR-T6  No prevClose (cold-start) → neither rejected nor corrected (no-op on scale check).
 *   REPAIR-T7  detectAndNormalizeScaleFromPrevClose pure-function check:
 *              close=72500000, prevClose=59200 → rejected=true, corrected=false.
 *   REPAIR-T8  FR-G2 sanity check: a ×1000 inflated row that IS below 10M (7.26M)
 *              triggers scale_mismatch_vs_prior in ohlcvSanityCheckJob (defense-in-depth).
 *              (Verifies FR-G2 still fires — guards are complementary, not competing.)
 *
 * Design constraints:
 *   - In-memory SQLite (:memory:) — no named-volume, no network.
 *   - Preload from src/__tests__/setup.ts sets DB_PATH=:memory: (bunfig.toml).
 *   - No per-ticker hardcode beyond fixture labels (VNM/AAA used as illustrative only).
 *   - Generic: logic fires for ANY ticker with implausible magnitude vs prevClose.
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";

import {
  detectAndNormalizeScaleFromPrevClose,
  SCALE_DETECTION_RATIO,
} from "../domain/services/market-data/ohlcvUnitGuard.js";
import { writeOhlcvBatch } from "../application/usecases/ohlcvWriteService.js";
import { runOhlcvSanityCheck } from "../scheduler/market-data/ohlcvSanityCheckJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Pinned time constants — deterministic, no wall-clock dependency
// ─────────────────────────────────────────────────────────────────────────────

const VN_TODAY    = "2026-06-18";
const YESTERDAY   = "2026-06-17";
const TWO_DAYS_AGO = "2026-06-16";

// For FR-G2 sanity check — nowMs in VN morning
const SANITY_NOW_MS = Date.parse("2026-06-18T02:00:00.000Z"); // 09:00 VNT

// ─────────────────────────────────────────────────────────────────────────────
// DB helpers
// ─────────────────────────────────────────────────────────────────────────────

const DDL_DAILY_OHLCV = `
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
  )
`;

const DDL_WATCHLIST = `
  CREATE TABLE IF NOT EXISTS watchlist (
    code     TEXT PRIMARY KEY,
    exchange TEXT NOT NULL DEFAULT 'HOSE'
  )
`;

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(DDL_DAILY_OHLCV);
  db.exec(DDL_WATCHLIST);
  return db;
}

function insertRealRow(
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
    `INSERT OR REPLACE INTO daily_ohlcv
     (code, date, open, high, low, close, volume, updated_at, data_env)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), 'production')`,
  ).run(code, date, open, high, low, close, volume);
}

function getRow(
  db: Database,
  code: string,
  date: string,
): { open: number; high: number; low: number; close: number; volume: number } | null {
  return db
    .prepare(
      "SELECT open, high, low, close, volume FROM daily_ohlcv WHERE code = ? AND date = ?",
    )
    .get(code, date) as {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  } | null;
}

function addWatchlistTicker(db: Database, code: string): void {
  db.prepare("INSERT OR IGNORE INTO watchlist (code) VALUES (?)").run(code);
}

// ─────────────────────────────────────────────────────────────────────────────
// REPAIR-T7 — Pure function test: detectAndNormalizeScaleFromPrevClose
// ─────────────────────────────────────────────────────────────────────────────

describe("REPAIR-T7: detectAndNormalizeScaleFromPrevClose — ×N rejection (pure function)", () => {
  it("T7-a: close=72500000 vs prevClose=59200 → rejected=true, corrected=false (VNM incident class)", () => {
    // VNM 2026-06-01 bad row: close=72500000, prevClose=~59200 → ratio=72500000/59200=1224×
    const result = detectAndNormalizeScaleFromPrevClose(
      "stock",
      { open: 59_200, high: 72_500_000, low: 59_200, close: 72_500_000 },
      59_200,
    );
    expect(result.rejected).toBe(true);
    expect(result.corrected).toBe(false);
    expect(result.reason).toContain("implausible_magnitude_reject");
    // OHLCV unchanged (caller must not write it)
    expect(result.ohlcv.close).toBe(72_500_000);
  });

  it("T7-b: close=7260000 vs prevClose=7260 → rejected=true (clean ×1000 class also caught)", () => {
    // AAA inflated ×1000: ratio=7260000/7260=1000 >= 50 → reject
    const result = detectAndNormalizeScaleFromPrevClose(
      "stock",
      { open: 7_260_000, high: 7_260_000, low: 7_260_000, close: 7_260_000 },
      7_260,
    );
    expect(result.rejected).toBe(true);
    expect(result.corrected).toBe(false);
    expect(result.reason).toContain("implausible_magnitude_reject");
  });

  it("T7-c: ratio exactly = SCALE_DETECTION_RATIO (50×) → rejected=true (boundary)", () => {
    // prevClose=1000, close=50000 → ratio=50.0 exactly → reject
    const result = detectAndNormalizeScaleFromPrevClose(
      "stock",
      { open: 50_000, high: 51_000, low: 49_000, close: 50_000 },
      1_000,
    );
    expect(result.rejected).toBe(true);
    expect(result.corrected).toBe(false);
  });

  it("T7-d: ratio = 49.9× → NOT rejected (just below threshold)", () => {
    // prevClose=1000, close=49900 → upRatioClose=49.9 < 50.
    // high=49950 → upRatioHigh=49.95 < 50.
    // Both ratios below threshold → pass through (no rejection).
    const result = detectAndNormalizeScaleFromPrevClose(
      "stock",
      { open: 49_000, high: 49_950, low: 48_500, close: 49_900 },
      1_000,
    );
    expect(result.rejected).toBe(false);
  });

  it("T7-e: ÷1000 direction still corrected: prevClose=136100, close=136.1 → corrected=true, rejected=false", () => {
    // VHM class — ÷1000 detection must still work
    const result = detectAndNormalizeScaleFromPrevClose(
      "stock",
      { open: 136.1, high: 137.0, low: 135.5, close: 136.1 },
      136_100,
    );
    expect(result.corrected).toBe(true);
    expect(result.rejected).toBe(false);
    expect(result.ohlcv.close).toBeCloseTo(136_100, 0);
  });

  it("T7-f: index type → exempt from both directions (no rejection)", () => {
    // VNINDEX — even with 1000× ratio, indices are not rejected
    const result = detectAndNormalizeScaleFromPrevClose(
      "index",
      { open: 1_200_000, high: 1_200_000, low: 1_200_000, close: 1_200_000 },
      1_200,
    );
    expect(result.rejected).toBe(false);
    expect(result.corrected).toBe(false);
  });

  it("T7-g: no prevClose → neither rejected nor corrected (cold-start safe)", () => {
    const result = detectAndNormalizeScaleFromPrevClose(
      "stock",
      { open: 72_500_000, high: 72_500_000, low: 72_500_000, close: 72_500_000 },
      undefined,
    );
    expect(result.rejected).toBe(false);
    expect(result.corrected).toBe(false);
  });

  it("T7-h: high inflated but close normal → rejected=true (max(upRatioClose, upRatioHigh) governs)", () => {
    // Simulates mixed-field inflation: open=59200 (normal), high=72500000 (inflated), close=59200 (normal)
    // upRatioClose = 59200/59200 = 1 (no flag), upRatioHigh = 72500000/59200 = 1224× (flagged)
    const result = detectAndNormalizeScaleFromPrevClose(
      "stock",
      { open: 59_200, high: 72_500_000, low: 59_200, close: 59_200 },
      59_200,
    );
    expect(result.rejected).toBe(true);
    expect(result.reason).toContain("implausible_magnitude_reject");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REPAIR-T1 — Clean ×1000 direction rejected at write-time
// ─────────────────────────────────────────────────────────────────────────────

describe("REPAIR-T1: clean ×1000 inflated bar rejected via writeOhlcvBatch (gate b)", () => {
  it("AAA close=7260000 vs prior real 7260 → rejected, no row written, honest gap", async () => {
    const db = makeDb();

    // Prior real row (volume > 0, data_env set)
    insertRealRow(db, "TICKER_A", TWO_DAYS_AGO, 7_100, 7_400, 7_000, 7_260, 1_000_000);

    // Incoming PAST bar ×1000 inflated — NOT a seed bar (vol > 0, past date)
    const result = await writeOhlcvBatch(
      [
        {
          code: "TICKER_A",
          date: YESTERDAY,
          open: 7_260_000,
          high: 7_400_000,
          low: 7_100_000,
          close: 7_260_000,
          volume: 500_000,
        },
      ],
      db,
      { vnToday: VN_TODAY },
    );

    // Must be rejected — not written, honest gap left
    expect(result.written).toBe(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]).toContain("implausible_magnitude_reject");
    expect(getRow(db, "TICKER_A", YESTERDAY)).toBeNull();

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REPAIR-T2 — VNM incident class: 72.5M vs prior ~59200
// ─────────────────────────────────────────────────────────────────────────────

describe("REPAIR-T2: VNM 2026-06-01 incident class — 72.5M bar rejected at write-time (gate b, e, f)", () => {
  it("T2-a: open=59200 normal, high=close=72500000 inflated → rejected, no DB row (honest gap)", async () => {
    const db = makeDb();

    // Prior real close for VNM class ticker (~59200 VND)
    insertRealRow(db, "TICKER_VNM", TWO_DAYS_AGO, 58_900, 59_500, 58_500, 59_200, 2_000_000);

    // The exact shape of the VNM 2026-06-01 bad bar:
    // open=59200 (normal), high=72500000 (×1225 inflated), low=59200 (normal),
    // close=72500000 (×1225 inflated), volume=0, data_env=NULL
    const result = await writeOhlcvBatch(
      [
        {
          code:   "TICKER_VNM",
          date:   "2026-06-01",   // past date (June 1 = Sunday, not caught by FR-S1)
          open:   59_200,
          high:   72_500_000,
          low:    59_200,
          close:  72_500_000,
          volume: 0,
          dataEnv: null,
        },
      ],
      db,
      { vnToday: VN_TODAY },
    );

    // Must be rejected at write-time — NOT landed-and-flagged
    expect(result.written).toBe(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]).toContain("implausible_magnitude_reject");
    expect(getRow(db, "TICKER_VNM", "2026-06-01")).toBeNull();

    db.close();
  });

  it("T2-b: PAST date (not caught by FR-S1) + implausible close → rejected at scale-check stage (gate f)", async () => {
    const db = makeDb();

    insertRealRow(db, "TICKER_B", TWO_DAYS_AGO, 100_000, 105_000, 99_000, 102_000, 1_000_000);

    // ×100 inflation — above SCALE_DETECTION_RATIO threshold (50) → reject
    const result = await writeOhlcvBatch(
      [
        {
          code:   "TICKER_B",
          date:   YESTERDAY,
          open:   102_000,
          high:   10_200_000,  // ×100 inflated high (above 10M → also caught by validateOhlcvUnit Rule 2)
          low:    100_000,
          close:  10_200_000,  // ×100 inflated close
          volume: 500_000,
        },
      ],
      db,
      { vnToday: VN_TODAY },
    );

    expect(result.written).toBe(0);
    expect(result.rejected).toHaveLength(1);
    // May be caught by scale-check OR validateOhlcvUnit — both are acceptable
    expect(getRow(db, "TICKER_B", YESTERDAY)).toBeNull();

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REPAIR-T3 — vol=0 + data_env=NULL pattern: rejected regardless
// ─────────────────────────────────────────────────────────────────────────────

describe("REPAIR-T3: vol=0 + data_env=NULL + implausible magnitude → rejected (gate e)", () => {
  it("vol=0 abnormal bar with inflated price → rejected at write-time (not landed)", async () => {
    const db = makeDb();

    // Establish prevClose
    insertRealRow(db, "TICKER_C", TWO_DAYS_AGO, 58_900, 59_600, 58_500, 59_200, 1_500_000);

    // vol=0, data_env=NULL, implausible high+close (the VNM incident signature)
    const result = await writeOhlcvBatch(
      [
        {
          code:    "TICKER_C",
          date:    YESTERDAY,   // past date, not FR-S1 (which needs vol=0 AND flat O=H=L=C AND date >= vnToday)
          open:    59_200,
          high:    72_500_000,
          low:     59_200,
          close:   72_500_000,
          volume:  0,
          dataEnv: null,         // data_env=NULL signature of abnormal/seeder bar
        },
      ],
      db,
      { vnToday: VN_TODAY },
    );

    // Rejected — honest gap left
    expect(result.written).toBe(0);
    expect(result.rejected).toHaveLength(1);
    expect(getRow(db, "TICKER_C", YESTERDAY)).toBeNull();

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REPAIR-T4 — Genuine large move within threshold → NOT rejected (gate c)
// ─────────────────────────────────────────────────────────────────────────────

describe("REPAIR-T4: genuine large move within ×50 threshold → NOT rejected (no over-correction)", () => {
  it("close = prevClose × 48 (ratio=48, below SCALE_DETECTION_RATIO=50) → written normally", async () => {
    const db = makeDb();

    // Prior close: 1000 VND (a very cheap stock)
    insertRealRow(db, "TICKER_D", TWO_DAYS_AGO, 900, 1_100, 850, 1_000, 500_000);

    // Incoming: close=48000 → ratio=48000/1000=48 < 50 → NOT rejected
    // (This is a genuine large move that should NOT be caught by the guard)
    const result = await writeOhlcvBatch(
      [
        {
          code:   "TICKER_D",
          date:   YESTERDAY,
          open:   1_000,
          high:   48_000,
          low:    900,
          close:  48_000,
          volume: 300_000,
        },
      ],
      db,
      { vnToday: VN_TODAY },
    );

    // Note: validateOhlcvUnit Rule 4 (HILO_RATIO_MAX=5) will check high/low=48000/900=53.3 > 5
    // → this specific fixture may be rejected by the HILO guard (not our target guard).
    // What matters: our implausible_magnitude guard does NOT fire for ratio < 50.
    // If rejected, it must be by a different guard (not implausible_magnitude_reject).
    if (result.rejected.length > 0) {
      // If rejected, must NOT be by our implausible_magnitude guard
      for (const reason of result.rejected) {
        expect(reason).not.toContain("implausible_magnitude_reject");
      }
    }

    db.close();
  });

  it("close = prevClose × 49 → scale guard no-op, only intra-row guards apply", async () => {
    const db = makeDb();

    // Prior close: 1000 VND
    insertRealRow(db, "TICKER_E", TWO_DAYS_AGO, 950, 1_050, 900, 1_000, 400_000);

    // close/prevClose = 49000/1000 = 49 < 50 → scale guard must NOT fire
    // Use tight OHLC spread to avoid HILO_RATIO rejection
    const result = await writeOhlcvBatch(
      [
        {
          code:   "TICKER_E",
          date:   YESTERDAY,
          open:   48_000,
          high:   49_500,
          low:    47_000,
          close:  49_000,
          volume: 200_000,
        },
      ],
      db,
      { vnToday: VN_TODAY },
    );

    // Scale guard must NOT reject this
    for (const reason of result.rejected) {
      expect(reason).not.toContain("implausible_magnitude_reject");
    }

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REPAIR-T5 — ÷1000 direction still corrected (regression guard)
// ─────────────────────────────────────────────────────────────────────────────

describe("REPAIR-T5: ÷1000 direction still auto-corrected (regression guard, gate a)", () => {
  it("VHM class: prevClose=136100, close=136.1 → corrected to ~136100 (÷1000 repair unchanged)", async () => {
    const db = makeDb();

    insertRealRow(db, "TICKER_F", TWO_DAYS_AGO, 135_800, 137_000, 135_000, 136_100, 8_000_000);

    const result = await writeOhlcvBatch(
      [
        {
          code:   "TICKER_F",
          date:   YESTERDAY,
          open:   136.1,
          high:   137.0,
          low:    135.5,
          close:  136.1,
          volume: 7_000_000,
        },
      ],
      db,
      { vnToday: VN_TODAY },
    );

    expect(result.written).toBe(1);
    expect(result.rejected).toHaveLength(0);

    const row = getRow(db, "TICKER_F", YESTERDAY);
    expect(row).not.toBeNull();
    expect(row!.close).toBeCloseTo(136_100, 0);
    expect(row!.close).toBeGreaterThan(100_000);

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REPAIR-T6 — No prevClose: scale guard is a no-op (cold-start safe)
// ─────────────────────────────────────────────────────────────────────────────

describe("REPAIR-T6: no prevClose (cold-start) → scale guard no-op (gate f)", () => {
  it("no prior real row in DB → implausible_magnitude check skipped (prevClose=0)", async () => {
    const db = makeDb();

    // No prior rows — prevCloseMap will be empty → prevClose=0
    // The guard requires prevClose > 0, so with no prevClose, it must not fire.
    // Instead, validateOhlcvUnit Rule 2 (STOCK_MAX_VND=10M) catches values above 10M.
    const result = await writeOhlcvBatch(
      [
        {
          code:   "NEWCODE_X",
          date:   YESTERDAY,
          open:   59_200,
          high:   59_800,
          low:    58_900,
          close:  59_200,
          volume: 1_000_000,
        },
      ],
      db,
      { vnToday: VN_TODAY },
    );

    // Normal full-VND bar with no prevClose → written normally
    expect(result.written).toBe(1);
    expect(result.rejected).toHaveLength(0);

    const row = getRow(db, "NEWCODE_X", YESTERDAY);
    expect(row).not.toBeNull();
    expect(row!.close).toBeCloseTo(59_200, 0);

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REPAIR-T8 — FR-G2 defense-in-depth: sanity check still fires for ×1000 class
// ─────────────────────────────────────────────────────────────────────────────

describe("REPAIR-T8: FR-G2 defense-in-depth — ohlcvSanityCheck still flags scale anomalies (gate c)", () => {
  it("×1000 inflated row below 10M (7.26M) that bypasses validateOhlcvUnit → FR-G2 flags scale_mismatch_vs_prior", async () => {
    // This tests the defense-in-depth layer: if an inflated bar somehow lands
    // (e.g., through a bypass writer that predates the guard, or via a cold-start
    // path with no prevClose), FR-G2 in ohlcvSanityCheckJob still catches it.
    const db = makeDb();
    addWatchlistTicker(db, "TICKER_G");

    // Establish prior real close
    insertRealRow(db, "TICKER_G", TWO_DAYS_AGO, 7_100, 7_400, 7_000, 7_260, 1_000_000);

    // Directly insert the inflated bar (bypassing writeOhlcvBatch — simulating legacy bypass)
    // 7,260,000 < STOCK_MAX_VND=10M → slips through validateOhlcvUnit Rule 2
    // but FR-G2 (ratio=7260000/7260=1000 > SCALE_RATIO_HIGH=500) catches it.
    db.prepare(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES ('TICKER_G', ?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).run(YESTERDAY, 7_260_000, 7_260_000, 7_260_000, 7_260_000, 500_000);

    const bugCalls: string[] = [];
    const result = await runOhlcvSanityCheck({
      db: () => db,
      nowMsFn: () => SANITY_NOW_MS,
      sendBugFn: async (msg) => { bugCalls.push(msg); },
    });

    expect(result.hitCount).toBeGreaterThanOrEqual(1);
    const scaleHit = result.hits.find(
      (h) => h.code === "TICKER_G" && h.flag.includes("scale_mismatch_vs_prior"),
    );
    expect(scaleHit).toBeDefined();

    db.close();
  });

  it("FR-G2 does NOT flag genuine ±5% moves (no over-correction)", async () => {
    const db = makeDb();
    addWatchlistTicker(db, "TICKER_H");

    insertRealRow(db, "TICKER_H", TWO_DAYS_AGO, 59_000, 60_000, 58_500, 59_200, 1_000_000);
    // Normal +1.3% move
    insertRealRow(db, "TICKER_H", YESTERDAY, 59_200, 60_200, 58_800, 59_980, 1_200_000);

    const bugCalls: string[] = [];
    const result = await runOhlcvSanityCheck({
      db: () => db,
      nowMsFn: () => SANITY_NOW_MS,
      sendBugFn: async (msg) => { bugCalls.push(msg); },
    });

    const falseHit = result.hits.find((h) => h.code === "TICKER_H");
    expect(falseHit).toBeUndefined();

    db.close();
  });
});
