/**
 * FIX-OHLCV-CORP-ACTION-CONTINUITY — Regression suite
 *
 * Goal: detect an adjusted-vs-unadjusted price discontinuity at a
 * corporate-action boundary (a bar-to-bar |move| beyond the daily board
 * price limit) and reconcile-or-flag it — never serve a false/discontinuous
 * bar downstream.
 *
 * REAL corp-action example (NO fabricated/hardcoded bars — no-fake-data /
 * real-fetch DoD, PUSH-AUTONOMY-1 §5): VJC (VietJet Air, HOSE) ex-date
 * discontinuity first surfaced by the 2026-06-16 behavioral gate
 * (docs/handoffs/FIX-OHLCV-SEED-CANDLE-behavioral-gate-2026-06-16-RED.md
 * Class 4). The exact fixture values below are the REAL rows currently
 * persisted in the live production `daily_ohlcv` table, fetched via:
 *
 *   docker exec vn-market-intelligence-mcp-mcp-server-1 bun -e '
 *     const { Database } = require("bun:sqlite");
 *     const db = new Database(process.env.DB_PATH, { readonly: true });
 *     console.log(JSON.stringify(db.query(
 *       "SELECT code,date,open,high,low,close,volume FROM daily_ohlcv " +
 *       "WHERE code=? AND date BETWEEN ? AND ? ORDER BY date ASC"
 *     ).all("VJC", "2026-06-08", "2026-06-20")));
 *   '
 *
 * run 2026-07-24T against the live named-volume DB (RAW, not invented).
 * VJC 2026-06-15 close=183,700 -> 2026-06-16 close=138,000 is a real -24.87%
 * single-day move — impossible under HOSE's ±7% board limit during normal
 * trading, i.e. a genuine ex-div/ex-rights adjustment stitched onto
 * unadjusted history (or bad data) rather than a legitimate limit-day move.
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";

import {
  resolveBoardLimitPct,
  detectBoundaryDiscontinuity,
  scanOhlcvContinuity,
  reconcileOrFlagBoundary,
  type OhlcvBar,
} from "../domain/services/market-data/ohlcvContinuityGuard.js";
import { getContinuityCheckedOhlcvSeries } from "../application/usecases/getContinuityCheckedOhlcvSeries.js";

// ─────────────────────────────────────────────────────────────────────────────
// REAL fixture — VJC daily_ohlcv rows, live production DB, 2026-06-08..19
// (see provenance comment above; values are NOT invented)
// ─────────────────────────────────────────────────────────────────────────────

const VJC_REAL_SERIES: OhlcvBar[] = [
  { code: "VJC", date: "2026-06-08", open: 178000, high: 180000, low: 174900, close: 176800, volume: 846900 },
  { code: "VJC", date: "2026-06-09", open: 177000, high: 179400, low: 175400, close: 179000, volume: 898900 },
  { code: "VJC", date: "2026-06-10", open: 179300, high: 183500, low: 178700, close: 182000, volume: 1008400 },
  { code: "VJC", date: "2026-06-11", open: 181000, high: 182500, low: 177300, close: 177500, volume: 817800 },
  { code: "VJC", date: "2026-06-12", open: 177800, high: 183100, low: 177700, close: 180800, volume: 907600 },
  { code: "VJC", date: "2026-06-15", open: 181000, high: 185500, low: 181000, close: 183700, volume: 1074500 },
  { code: "VJC", date: "2026-06-16", open: 143800, high: 144100, low: 137800, close: 138000, volume: 969400 }, // corp-action boundary bar
  { code: "VJC", date: "2026-06-17", open: 136800, high: 144000, low: 136300, close: 143900, volume: 959700 },
  { code: "VJC", date: "2026-06-18", open: 142800, high: 142800, low: 138400, close: 138400, volume: 1144100 },
  { code: "VJC", date: "2026-06-19", open: 138900, high: 141000, low: 138400, close: 140500, volume: 1166800 },
];

// ─────────────────────────────────────────────────────────────────────────────
// resolveBoardLimitPct — per-board limit resolution (generic, not hardcoded)
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveBoardLimitPct", () => {
  it("resolves HOSE to 7%", () => {
    expect(resolveBoardLimitPct("HOSE")).toBeCloseTo(0.07, 5);
  });

  it("resolves HNX to 10%", () => {
    expect(resolveBoardLimitPct("HNX")).toBeCloseTo(0.10, 5);
  });

  it("resolves UPCOM to 15%", () => {
    expect(resolveBoardLimitPct("UPCOM")).toBeCloseTo(0.15, 5);
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(resolveBoardLimitPct(" hose ")).toBeCloseTo(0.07, 5);
  });

  it("falls back to the widest known VN board limit for an unknown/missing exchange", () => {
    expect(resolveBoardLimitPct("UNKNOWN_VENUE")).toBeCloseTo(0.15, 5);
    expect(resolveBoardLimitPct(null)).toBeCloseTo(0.15, 5);
    expect(resolveBoardLimitPct(undefined)).toBeCloseTo(0.15, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// detectBoundaryDiscontinuity / scanOhlcvContinuity — REAL VJC series
// ─────────────────────────────────────────────────────────────────────────────

describe("detectBoundaryDiscontinuity — real VJC HOSE corp-action boundary", () => {
  it("flags the real 2026-06-15 -> 2026-06-16 -24.87% move as a candidate discontinuity", () => {
    const prev = VJC_REAL_SERIES[5]!; // 2026-06-15 close=183700
    const bar = VJC_REAL_SERIES[6]!; // 2026-06-16 close=138000
    const result = detectBoundaryDiscontinuity(prev, bar, "HOSE");

    expect(result.flagged).toBe(true);
    expect(result.boardLimitPct).toBeCloseTo(0.07, 5);
    expect(result.movePct).toBeCloseTo((138000 - 183700) / 183700, 5);
    expect(Math.abs(result.movePct)).toBeGreaterThan(result.boardLimitPct);
    expect(result.reason).toContain("corp_action_boundary_candidate");
  });

  it("does NOT flag a real legitimate sub-limit move (2026-06-08 -> 2026-06-09, +1.24%)", () => {
    const prev = VJC_REAL_SERIES[0]!;
    const bar = VJC_REAL_SERIES[1]!;
    const result = detectBoundaryDiscontinuity(prev, bar, "HOSE");

    expect(result.flagged).toBe(false);
    expect(result.movePct).toBeCloseTo((179000 - 176800) / 176800, 5);
  });

  it("does NOT flag the real post-boundary recovery move (2026-06-16 -> 2026-06-17, +4.28%, still real data)", () => {
    const prev = VJC_REAL_SERIES[6]!;
    const bar = VJC_REAL_SERIES[7]!;
    const result = detectBoundaryDiscontinuity(prev, bar, "HOSE");

    expect(result.flagged).toBe(false);
  });

  it("scanOhlcvContinuity over the full real series flags exactly the one 06-15->06-16 boundary", () => {
    const results = scanOhlcvContinuity(VJC_REAL_SERIES, "HOSE");
    const flagged = results.filter((r) => r.flagged);

    expect(results.length).toBe(VJC_REAL_SERIES.length - 1);
    expect(flagged.length).toBe(1);
    expect(flagged[0]!.date).toBe("2026-06-16");
    expect(flagged[0]!.prevDate).toBe("2026-06-15");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// reconcileOrFlagBoundary — reconcile-or-flag path
// ─────────────────────────────────────────────────────────────────────────────

describe("reconcileOrFlagBoundary", () => {
  it("flags + identifies the boundary bar as suspect when no adjustment factor is derivable (live default path)", () => {
    const discontinuity = detectBoundaryDiscontinuity(VJC_REAL_SERIES[5]!, VJC_REAL_SERIES[6]!, "HOSE");
    const result = reconcileOrFlagBoundary(VJC_REAL_SERIES, discontinuity);

    expect(result.action).toBe("flagged");
    expect(result.suspectBar?.date).toBe("2026-06-16");
    expect(result.adjustedBars).toBeUndefined();
  });

  it("reconciles the pre-boundary series when a known adjustment factor is supplied", () => {
    const discontinuity = detectBoundaryDiscontinuity(VJC_REAL_SERIES[5]!, VJC_REAL_SERIES[6]!, "HOSE");
    // Real empirically-observed ratio from the fetched series (not invented):
    // postClose / preClose = 138000 / 183700
    const factor = 138000 / 183700;
    const result = reconcileOrFlagBoundary(VJC_REAL_SERIES, discontinuity, {
      knownAdjustmentFactor: factor,
    });

    expect(result.action).toBe("reconciled");
    expect(result.adjustedBars).toBeDefined();
    const adjusted = result.adjustedBars!;
    // Pre-boundary bar (2026-06-15) rescaled by factor
    const preBoundary = adjusted.find((b) => b.date === "2026-06-15")!;
    expect(preBoundary.close).toBeCloseTo(183700 * factor, 2);
    // Post-boundary bar (2026-06-16) left unchanged (already in the post-adjustment unit)
    const boundary = adjusted.find((b) => b.date === "2026-06-16")!;
    expect(boundary.close).toBe(138000);
    // Continuity restored: the reconciled adjacent move is now within board limit
    const reconciledMove = (boundary.close - preBoundary.close) / preBoundary.close;
    expect(Math.abs(reconciledMove)).toBeLessThanOrEqual(0.07 + 0.005);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getContinuityCheckedOhlcvSeries — application-layer serving guarantee
// (never serve a false/discontinuous bar downstream)
// ─────────────────────────────────────────────────────────────────────────────

function buildDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code     TEXT PRIMARY KEY,
      exchange TEXT NOT NULL DEFAULT 'HOSE'
    );
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code       TEXT NOT NULL,
      date       TEXT NOT NULL,
      open       REAL NOT NULL DEFAULT 0,
      high       REAL NOT NULL DEFAULT 0,
      low        REAL NOT NULL DEFAULT 0,
      close      REAL NOT NULL DEFAULT 0,
      volume     REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (code, date)
    );
  `);
  return db;
}

function seedVjcReal(db: Database): void {
  db.run(`INSERT INTO watchlist (code, exchange) VALUES ('VJC', 'HOSE')`);
  const insert = db.prepare(
    `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  );
  for (const bar of VJC_REAL_SERIES) {
    insert.run(bar.code, bar.date, bar.open, bar.high, bar.low, bar.close, bar.volume);
  }
}

describe("getContinuityCheckedOhlcvSeries — never serve a discontinuous bar downstream", () => {
  it("excludes the real VJC 2026-06-16 corp-action boundary bar from the served (clean) series", () => {
    const db = buildDb();
    seedVjcReal(db);

    const result = getContinuityCheckedOhlcvSeries(db, "VJC", 30);

    // Raw series has 10 real rows; the served clean series must exclude the suspect boundary bar.
    expect(result.bars.some((b) => b.date === "2026-06-16")).toBe(false);
    expect(result.excludedDates).toContain("2026-06-16");
    expect(result.flags.length).toBeGreaterThanOrEqual(1);
    expect(result.flags.some((f) => f.date === "2026-06-16" && f.flagged)).toBe(true);

    // Every OTHER real bar is still served (never over-suppress).
    const otherDates = VJC_REAL_SERIES.filter((b) => b.date !== "2026-06-16").map((b) => b.date);
    for (const d of otherDates) {
      expect(result.bars.some((b) => b.date === d)).toBe(true);
    }
  });

  it("serves the full clean series untouched when no discontinuity exists in the window", () => {
    const db = buildDb();
    db.run(`INSERT INTO watchlist (code, exchange) VALUES ('VJC', 'HOSE')`);
    const insert = db.prepare(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    );
    // Only the pre-boundary, continuous real rows (no corp-action bar present).
    for (const bar of VJC_REAL_SERIES.slice(0, 5)) {
      insert.run(bar.code, bar.date, bar.open, bar.high, bar.low, bar.close, bar.volume);
    }

    const result = getContinuityCheckedOhlcvSeries(db, "VJC", 30);

    expect(result.bars.length).toBe(5);
    expect(result.excludedDates.length).toBe(0);
    expect(result.flags.length).toBe(0);
  });
});
