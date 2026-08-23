/**
 * TASK17-CONVICTION — GET /api/conviction-history
 *
 * AC-1:  response envelope: {generatedAt, tradingDate, snapshot, series, summary, count}
 * AC-2:  snapshot: one row per symbol at MAX(date), sorted peakScore DESC
 * AC-3:  NULL dominant_signal → signal="unknown" (not "neutral", not coerced)
 * AC-4:  signal pass-through: bullish/bearish/neutral pass through unchanged
 * AC-5:  series[symbol] is the full ASC history for that symbol (all dates)
 * AC-6:  summary counts correct: bullish/bearish/neutral/unknown over snapshot
 * AC-7:  avgPeakScore = mean peakScore over snapshot; null when empty (divide-by-zero guard)
 * AC-8:  topBullish: up to 5, signal=bullish, peakScore DESC
 * AC-9:  topBearish: up to 5, signal=bearish, peakScore DESC
 * AC-10: tradingDate = MAX(date) across rows; "" when empty
 * AC-11: 200 + empty snapshot/series/summary (zeroed, avgPeakScore null) when table empty — NO error
 * AC-12: 500 JSON on DB error
 * AC-13: count matches snapshot.length
 * AC-14: ?limit=N clamps the store fetch (default 2000, max 2000)
 * AC-15: multi-symbol × multi-date seed mirrors production shape
 *
 * PRODUCTION SHAPE seeds:
 *   - 3 symbols: ACB, PLX, VCB
 *   - ACB: 3 dates (2026-04-01, 2026-05-01, 2026-06-09)
 *   - PLX: 2 dates (2026-05-15, 2026-06-09)
 *   - VCB: 2 dates (2026-04-15, 2026-06-09)
 *   - At least one NULL dominant_signal (ACB 2026-04-01)
 *   - One each of bullish / bearish / neutral in the seeded data
 *
 * DDD layer: interface + infrastructure tested together at the handler seam.
 * Isolation: in-memory SQLite, reset per test via initDatabase().
 */

// Must be set before importing schema module
Bun.env["DB_PATH"] = ":memory:";
if (Bun.env["DB_PATH"] !== ":memory:") {
  throw new Error(`[TASK17-CONVICTION] DB_PATH must be ':memory:', got: ${Bun.env["DB_PATH"]}`);
}

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import {
  mapSignal,
  buildSnapshot,
  buildSeries,
  buildSummary,
  computeAvg,
  handleGetConvictionHistory,
  type ConvictionHistoryResponse,
  type ConvictionSnapshotItem,
} from "../interface/mcp/routes/convictionHistoryHandler.js";
import type { ConvictionRow } from "../infrastructure/db/convictionHistoryStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  closeDb();
  await initDatabase();
});
afterEach(() => {
  closeDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const NOW = "2026-06-11T00:00:00.000Z";

function makeMockRes() {
  const mock = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: "",
    writeHead(status: number, headers?: Record<string, string>) {
      this.statusCode = status;
      if (headers) Object.assign(this.headers, headers);
    },
    end(data: string) {
      this.body = data;
    },
  };
  return mock;
}

function makeFakeReq(url: string = "/api/conviction-history"): import("node:http").IncomingMessage {
  return { url } as import("node:http").IncomingMessage;
}

/**
 * Insert a conviction_history row directly via raw SQL.
 * Used to seed test data with known shapes — including NULL dominant_signal.
 */
function insertConvictionRow(
  symbol: string,
  date: string,
  peakScore: number,
  dominantSignal: string | null,
): void {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO conviction_history (symbol, date, peak_score, dominant_signal, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(symbol, date, peakScore, dominantSignal, `${date}T08:30:00.000Z`);
}

/**
 * Seed the full production-shape test corpus:
 *   ACB: 3 dates — NULL signal on oldest, neutral on middle, bullish on latest
 *   PLX: 2 dates — bearish on both
 *   VCB: 2 dates — neutral on oldest, bullish on latest
 */
function seedProductionCorpus(): void {
  // ACB — 3 dates, NULL signal on 2026-04-01
  insertConvictionRow("ACB", "2026-04-01", 0.48, null);           // NULL dominant_signal
  insertConvictionRow("ACB", "2026-05-01", 0.52, "neutral");
  insertConvictionRow("ACB", "2026-06-09", 0.54, "bullish");      // latest = MAX(date)

  // PLX — 2 dates, both bearish
  insertConvictionRow("PLX", "2026-05-15", 0.50, "bearish");
  insertConvictionRow("PLX", "2026-06-09", 0.54, "bearish");      // latest

  // VCB — 2 dates
  insertConvictionRow("VCB", "2026-04-15", 0.45, "neutral");
  insertConvictionRow("VCB", "2026-06-09", 0.60, "bullish");      // latest, highest score
}

// ─────────────────────────────────────────────────────────────────────────────
// mapSignal unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("mapSignal", () => {
  it("'bullish' → 'bullish'", () => {
    expect(mapSignal("bullish")).toBe("bullish");
  });

  it("'bearish' → 'bearish'", () => {
    expect(mapSignal("bearish")).toBe("bearish");
  });

  it("'neutral' → 'neutral'", () => {
    expect(mapSignal("neutral")).toBe("neutral");
  });

  it("AC-3: null → 'unknown' (never coerced to neutral)", () => {
    expect(mapSignal(null)).toBe("unknown");
    expect(mapSignal(null)).not.toBe("neutral");
  });

  it("unknown string → 'unknown'", () => {
    expect(mapSignal("other")).toBe("unknown");
    expect(mapSignal("")).toBe("unknown");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildSnapshot unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("buildSnapshot", () => {
  it("AC-2: returns one row per symbol at MAX(date), sorted peakScore DESC", () => {
    // Rows in ASC date order (as returned by store)
    const rows: ConvictionRow[] = [
      { symbol: "ACB", date: "2026-04-01", peak_score: 0.48, dominant_signal: null, created_at: "2026-04-01T08:30:00.000Z" },
      { symbol: "ACB", date: "2026-06-09", peak_score: 0.54, dominant_signal: "bullish", created_at: "2026-06-09T08:30:00.000Z" },
      { symbol: "VCB", date: "2026-04-15", peak_score: 0.45, dominant_signal: "neutral", created_at: "2026-04-15T08:30:00.000Z" },
      { symbol: "VCB", date: "2026-06-09", peak_score: 0.60, dominant_signal: "bullish", created_at: "2026-06-09T08:30:00.000Z" },
    ];
    const snapshot = buildSnapshot(rows);

    // One row per symbol
    expect(snapshot).toHaveLength(2);
    expect(snapshot.map((s) => s.symbol).sort()).toEqual(["ACB", "VCB"]);

    // Each symbol should show its MAX(date) row
    const acb = snapshot.find((s) => s.symbol === "ACB")!;
    expect(acb.date).toBe("2026-06-09");
    expect(acb.peakScore).toBe(0.54);
    expect(acb.signal).toBe("bullish");

    const vcb = snapshot.find((s) => s.symbol === "VCB")!;
    expect(vcb.date).toBe("2026-06-09");
    expect(vcb.peakScore).toBe(0.60);

    // Sorted peakScore DESC: VCB(0.60) before ACB(0.54)
    expect(snapshot[0]!.symbol).toBe("VCB");
    expect(snapshot[1]!.symbol).toBe("ACB");
  });

  it("AC-3: NULL dominant_signal in latest row → signal='unknown'", () => {
    const rows: ConvictionRow[] = [
      { symbol: "XYZ", date: "2026-06-09", peak_score: 0.55, dominant_signal: null, created_at: "2026-06-09T08:30:00.000Z" },
    ];
    const snapshot = buildSnapshot(rows);
    expect(snapshot[0]!.signal).toBe("unknown");
    expect(snapshot[0]!.signal).not.toBe("neutral");
  });

  it("empty rows → empty snapshot", () => {
    expect(buildSnapshot([])).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildSeries unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("buildSeries", () => {
  it("AC-5: series[symbol] contains all dates in ASC order", () => {
    const rows: ConvictionRow[] = [
      { symbol: "ACB", date: "2026-04-01", peak_score: 0.48, dominant_signal: null, created_at: "2026-04-01T08:30:00.000Z" },
      { symbol: "ACB", date: "2026-05-01", peak_score: 0.52, dominant_signal: "neutral", created_at: "2026-05-01T08:30:00.000Z" },
      { symbol: "ACB", date: "2026-06-09", peak_score: 0.54, dominant_signal: "bullish", created_at: "2026-06-09T08:30:00.000Z" },
      { symbol: "PLX", date: "2026-06-09", peak_score: 0.54, dominant_signal: "bearish", created_at: "2026-06-09T08:30:00.000Z" },
    ];
    const series = buildSeries(rows);

    // ACB has 3 data points
    expect(series["ACB"]).toHaveLength(3);
    expect(series["ACB"]![0]!.date).toBe("2026-04-01");
    expect(series["ACB"]![0]!.signal).toBe("unknown"); // NULL → unknown
    expect(series["ACB"]![1]!.signal).toBe("neutral");
    expect(series["ACB"]![2]!.signal).toBe("bullish");

    // PLX has 1 data point
    expect(series["PLX"]).toHaveLength(1);
    expect(series["PLX"]![0]!.signal).toBe("bearish");
  });

  it("empty rows → empty series object", () => {
    const series = buildSeries([]);
    expect(Object.keys(series)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeAvg unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("computeAvg", () => {
  it("AC-7: empty array → null (divide-by-zero guard)", () => {
    expect(computeAvg([])).toBeNull();
  });

  it("computes mean correctly", () => {
    const items: ConvictionSnapshotItem[] = [
      { symbol: "A", date: "2026-06-09", peakScore: 0.40, signal: "bullish" },
      { symbol: "B", date: "2026-06-09", peakScore: 0.60, signal: "bearish" },
    ];
    expect(computeAvg(items)).toBe(0.50);
  });

  it("single item → peakScore of that item", () => {
    const items: ConvictionSnapshotItem[] = [
      { symbol: "A", date: "2026-06-09", peakScore: 0.73, signal: "bullish" },
    ];
    expect(computeAvg(items)).toBe(0.73);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildSummary unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("buildSummary", () => {
  it("AC-6: counts bullish/bearish/neutral/unknown correctly", () => {
    const snapshot: ConvictionSnapshotItem[] = [
      { symbol: "A", date: "2026-06-09", peakScore: 0.70, signal: "bullish" },
      { symbol: "B", date: "2026-06-09", peakScore: 0.65, signal: "bullish" },
      { symbol: "C", date: "2026-06-09", peakScore: 0.60, signal: "bearish" },
      { symbol: "D", date: "2026-06-09", peakScore: 0.55, signal: "neutral" },
      { symbol: "E", date: "2026-06-09", peakScore: 0.50, signal: "unknown" },
    ];
    const summary = buildSummary(snapshot);
    expect(summary.symbols).toBe(5);
    expect(summary.bullish).toBe(2);
    expect(summary.bearish).toBe(1);
    expect(summary.neutral).toBe(1);
    expect(summary.unknown).toBe(1);
  });

  it("AC-7: avgPeakScore is mean of snapshot peakScores", () => {
    const snapshot: ConvictionSnapshotItem[] = [
      { symbol: "A", date: "2026-06-09", peakScore: 0.50, signal: "bullish" },
      { symbol: "B", date: "2026-06-09", peakScore: 0.70, signal: "bearish" },
    ];
    const summary = buildSummary(snapshot);
    expect(summary.avgPeakScore).toBe(0.60);
  });

  it("AC-7: empty snapshot → avgPeakScore null", () => {
    const summary = buildSummary([]);
    expect(summary.avgPeakScore).toBeNull();
    expect(summary.symbols).toBe(0);
    expect(summary.bullish).toBe(0);
    expect(summary.bearish).toBe(0);
    expect(summary.neutral).toBe(0);
    expect(summary.unknown).toBe(0);
  });

  it("AC-8: topBullish: up to 5 bullish items, peakScore DESC", () => {
    // 7 bullish items — should cap at 5; already DESC since snapshot is sorted DESC
    const snapshot: ConvictionSnapshotItem[] = [
      { symbol: "A", date: "2026-06-09", peakScore: 0.73, signal: "bullish" },
      { symbol: "B", date: "2026-06-09", peakScore: 0.70, signal: "bullish" },
      { symbol: "C", date: "2026-06-09", peakScore: 0.68, signal: "bullish" },
      { symbol: "D", date: "2026-06-09", peakScore: 0.65, signal: "bullish" },
      { symbol: "E", date: "2026-06-09", peakScore: 0.62, signal: "bullish" },
      { symbol: "F", date: "2026-06-09", peakScore: 0.60, signal: "bullish" },
      { symbol: "G", date: "2026-06-09", peakScore: 0.55, signal: "bullish" },
    ];
    const summary = buildSummary(snapshot);
    expect(summary.topBullish).toHaveLength(5);
    // First item must be highest peakScore bullish
    expect(summary.topBullish[0]!.peakScore).toBe(0.73);
    expect(summary.topBullish[4]!.peakScore).toBe(0.62);
  });

  it("AC-9: topBearish: up to 5 bearish items, peakScore DESC", () => {
    const snapshot: ConvictionSnapshotItem[] = [
      { symbol: "A", date: "2026-06-09", peakScore: 0.73, signal: "bullish" },
      { symbol: "B", date: "2026-06-09", peakScore: 0.70, signal: "bearish" },
      { symbol: "C", date: "2026-06-09", peakScore: 0.68, signal: "bearish" },
      { symbol: "D", date: "2026-06-09", peakScore: 0.65, signal: "bearish" },
      { symbol: "E", date: "2026-06-09", peakScore: 0.62, signal: "bearish" },
      { symbol: "F", date: "2026-06-09", peakScore: 0.60, signal: "bearish" },
      { symbol: "G", date: "2026-06-09", peakScore: 0.55, signal: "bearish" },
    ];
    const summary = buildSummary(snapshot);
    expect(summary.topBearish).toHaveLength(5);
    expect(summary.topBearish[0]!.peakScore).toBe(0.70);
    expect(summary.topBearish[4]!.peakScore).toBe(0.60);
  });

  it("AC-8 + AC-9: topBullish/topBearish correctly filtered by signal", () => {
    const snapshot: ConvictionSnapshotItem[] = [
      { symbol: "A", date: "2026-06-09", peakScore: 0.70, signal: "bullish" },
      { symbol: "B", date: "2026-06-09", peakScore: 0.65, signal: "bearish" },
      { symbol: "C", date: "2026-06-09", peakScore: 0.60, signal: "neutral" },
    ];
    const summary = buildSummary(snapshot);
    expect(summary.topBullish.every((i) => i.signal === "bullish")).toBe(true);
    expect(summary.topBearish.every((i) => i.signal === "bearish")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleGetConvictionHistory HTTP handler tests (DB integration)
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-CONVICTION — handleGetConvictionHistory HTTP handler", () => {
  it("AC-1: returns 200 JSON with required envelope fields", () => {
    seedProductionCorpus();

    const res = makeMockRes();
    handleGetConvictionHistory(
      makeFakeReq("/api/conviction-history"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
      new Date(NOW),
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(res.body) as ConvictionHistoryResponse;
    expect(body.generatedAt).toBe(NOW);
    expect(typeof body.tradingDate).toBe("string");
    expect(Array.isArray(body.snapshot)).toBe(true);
    expect(typeof body.series).toBe("object");
    expect(typeof body.summary).toBe("object");
    expect(typeof body.count).toBe("number");
  });

  it("AC-2: snapshot has one row per symbol at MAX(date), sorted peakScore DESC", () => {
    seedProductionCorpus();

    const res = makeMockRes();
    handleGetConvictionHistory(
      makeFakeReq("/api/conviction-history"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as ConvictionHistoryResponse;
    // Exactly 3 symbols
    expect(body.snapshot).toHaveLength(3);

    // All entries should be on 2026-06-09 (MAX date)
    expect(body.snapshot.every((s) => s.date === "2026-06-09")).toBe(true);

    // Sorted peakScore DESC: VCB(0.60) > ACB(0.54) = PLX(0.54)
    expect(body.snapshot[0]!.symbol).toBe("VCB");
    expect(body.snapshot[0]!.peakScore).toBe(0.60);

    // VCB signal on latest date is bullish
    expect(body.snapshot[0]!.signal).toBe("bullish");
  });

  it("AC-3: NULL dominant_signal on LATEST date → signal='unknown' in snapshot", () => {
    // Seed a symbol where the latest date has NULL dominant_signal
    insertConvictionRow("NUL", "2026-06-09", 0.50, null);

    const res = makeMockRes();
    handleGetConvictionHistory(
      makeFakeReq("/api/conviction-history"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as ConvictionHistoryResponse;
    const item = body.snapshot.find((s) => s.symbol === "NUL")!;
    expect(item).toBeDefined();
    expect(item.signal).toBe("unknown");
    expect(item.signal).not.toBe("neutral");
  });

  it("AC-4: signal pass-through bullish/bearish/neutral", () => {
    insertConvictionRow("BB", "2026-06-09", 0.65, "bullish");
    insertConvictionRow("BR", "2026-06-09", 0.55, "bearish");
    insertConvictionRow("NT", "2026-06-09", 0.50, "neutral");

    const res = makeMockRes();
    handleGetConvictionHistory(
      makeFakeReq("/api/conviction-history"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as ConvictionHistoryResponse;
    const signals = new Set(body.snapshot.map((s) => s.signal));
    expect(signals.has("bullish")).toBe(true);
    expect(signals.has("bearish")).toBe(true);
    expect(signals.has("neutral")).toBe(true);
  });

  it("AC-5: series[symbol] contains full ASC history for that symbol", () => {
    seedProductionCorpus();

    const res = makeMockRes();
    handleGetConvictionHistory(
      makeFakeReq("/api/conviction-history"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as ConvictionHistoryResponse;

    // ACB has 3 dates
    const acbSeries = body.series["ACB"]!;
    expect(acbSeries).toHaveLength(3);
    expect(acbSeries[0]!.date).toBe("2026-04-01");
    expect(acbSeries[0]!.signal).toBe("unknown"); // NULL on 2026-04-01
    expect(acbSeries[1]!.date).toBe("2026-05-01");
    expect(acbSeries[1]!.signal).toBe("neutral");
    expect(acbSeries[2]!.date).toBe("2026-06-09");
    expect(acbSeries[2]!.signal).toBe("bullish");

    // PLX has 2 dates
    const plxSeries = body.series["PLX"]!;
    expect(plxSeries).toHaveLength(2);
    expect(plxSeries[0]!.date).toBe("2026-05-15");
    expect(plxSeries[1]!.date).toBe("2026-06-09");
  });

  it("AC-6: summary counts correct (bullish/bearish/neutral/unknown over snapshot)", () => {
    seedProductionCorpus();
    // Snapshot at 2026-06-09: ACB=bullish, PLX=bearish, VCB=bullish
    // Expected: bullish=2, bearish=1, neutral=0, unknown=0

    const res = makeMockRes();
    handleGetConvictionHistory(
      makeFakeReq("/api/conviction-history"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as ConvictionHistoryResponse;
    const { summary } = body;
    expect(summary.symbols).toBe(3);
    expect(summary.bullish).toBe(2);
    expect(summary.bearish).toBe(1);
    expect(summary.neutral).toBe(0);
    expect(summary.unknown).toBe(0);
  });

  it("AC-7: avgPeakScore = mean peakScore over snapshot; divide-by-zero guard → null when empty", () => {
    seedProductionCorpus();
    // snapshot: VCB=0.60, ACB=0.54, PLX=0.54 → avg=(0.60+0.54+0.54)/3=0.56

    const res = makeMockRes();
    handleGetConvictionHistory(
      makeFakeReq("/api/conviction-history"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as ConvictionHistoryResponse;
    expect(body.summary.avgPeakScore).not.toBeNull();
    // avg = (0.60 + 0.54 + 0.54) / 3 = 0.56
    expect(Math.round((body.summary.avgPeakScore ?? 0) * 100) / 100).toBe(0.56);
  });

  it("AC-10: tradingDate = MAX(date) across all rows", () => {
    seedProductionCorpus();

    const res = makeMockRes();
    handleGetConvictionHistory(
      makeFakeReq("/api/conviction-history"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as ConvictionHistoryResponse;
    expect(body.tradingDate).toBe("2026-06-09");
  });

  it("AC-11: returns 200 + empty snapshot/series/summary (zeroed, avgPeakScore null) when table empty", () => {
    // Do NOT seed — table empty

    const res = makeMockRes();
    handleGetConvictionHistory(
      makeFakeReq("/api/conviction-history"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
      new Date(NOW),
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as ConvictionHistoryResponse;
    expect(body.snapshot).toHaveLength(0);
    expect(Object.keys(body.series)).toHaveLength(0);
    expect(body.tradingDate).toBe("");
    expect(body.count).toBe(0);
    expect(body.summary.symbols).toBe(0);
    expect(body.summary.bullish).toBe(0);
    expect(body.summary.bearish).toBe(0);
    expect(body.summary.neutral).toBe(0);
    expect(body.summary.unknown).toBe(0);
    expect(body.summary.avgPeakScore).toBeNull();
    expect(body.summary.topBullish).toHaveLength(0);
    expect(body.summary.topBearish).toHaveLength(0);
  });

  it("AC-12: returns 500 JSON on DB error (closed DB)", () => {
    const db = getDb();
    closeDb();

    const res = makeMockRes();
    handleGetConvictionHistory(
      makeFakeReq("/api/conviction-history"),
      res as unknown as import("node:http").ServerResponse,
      db,
    );

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body) as { error: string };
    expect(body.error).toBe("db_error");
  });

  it("AC-13: count matches snapshot.length", () => {
    seedProductionCorpus();

    const res = makeMockRes();
    handleGetConvictionHistory(
      makeFakeReq("/api/conviction-history"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as ConvictionHistoryResponse;
    expect(body.count).toBe(body.snapshot.length);
  });

  it("AC-15: production shape — multi-symbol × multi-date seed with NULL signal row", () => {
    seedProductionCorpus();

    const res = makeMockRes();
    handleGetConvictionHistory(
      makeFakeReq("/api/conviction-history"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
      new Date(NOW),
    );

    const body = JSON.parse(res.body) as ConvictionHistoryResponse;

    // Full corpus stats
    expect(body.count).toBe(3); // 3 symbols in snapshot
    expect(body.tradingDate).toBe("2026-06-09");
    expect(body.generatedAt).toBe(NOW);

    // series should have entries for all 3 symbols
    expect(Object.keys(body.series).sort()).toEqual(["ACB", "PLX", "VCB"]);

    // series total length = all seeded rows (3+2+2=7)
    const totalSeriesPoints = Object.values(body.series).reduce(
      (sum, pts) => sum + pts.length,
      0,
    );
    expect(totalSeriesPoints).toBe(7);

    // summary cross-checks
    expect(body.summary.symbols).toBe(3);
    expect(body.summary.topBullish.length).toBeGreaterThanOrEqual(1);
    expect(body.summary.topBearish.length).toBeGreaterThanOrEqual(1);
    expect(body.summary.topBullish.every((i) => i.signal === "bullish")).toBe(true);
    expect(body.summary.topBearish.every((i) => i.signal === "bearish")).toBe(true);
  });

  it("topBullish/topBearish capped at 5", () => {
    // Insert 7 bullish + 7 bearish symbols
    for (let i = 1; i <= 7; i++) {
      insertConvictionRow(`BL${i}`, "2026-06-09", 0.40 + i * 0.01, "bullish");
      insertConvictionRow(`BR${i}`, "2026-06-09", 0.40 + i * 0.01, "bearish");
    }

    const res = makeMockRes();
    handleGetConvictionHistory(
      makeFakeReq("/api/conviction-history"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as ConvictionHistoryResponse;
    expect(body.summary.topBullish.length).toBeLessThanOrEqual(5);
    expect(body.summary.topBearish.length).toBeLessThanOrEqual(5);
    expect(body.summary.topBullish).toHaveLength(5);
    expect(body.summary.topBearish).toHaveLength(5);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // AC-16 — FIX-GHOSTZONE-CONVICTION-ASC-LIMIT-TRUNCATES-NEWEST
  //
  // Root cause: `ORDER BY date ASC LIMIT ?` keeps the OLDEST `limit` rows once
  // the table outgrows `limit` — freezing tradingDate at a stale date forever
  // (live: 3942 rows, cap 2000, tradingDate frozen 64 days stale). Fix: inner
  // `ORDER BY date DESC LIMIT ?` selects the newest rows, outer
  // `ORDER BY date ASC` restores the documented return contract
  // (buildSnapshot/buildSeries both silently depend on ASC input — see
  // architect brownfield findings, FIX-GHOSTZONE-CONVICTION-ASC-LIMIT-
  // TRUNCATES-NEWEST-BA-spec.md §2 FR-1).
  //
  // 9 rows seeded: 3 dates (D1 oldest, D2, D3 newest) x 3 symbols each.
  // limit=6 selects the newest 6 rows (D2+D3), excluding D1 (3 rows) — the
  // exact truncation-from-the-wrong-end shape of the live bug.
  // ───────────────────────────────────────────────────────────────────────────
  it("AC-16: newest-N window selection with ASC-contract preserved (anti naive-DESC-flip)", () => {
    const D1 = "2026-01-01"; // oldest — must be excluded by limit=6
    const D2 = "2026-02-01";
    const D3 = "2026-03-01"; // newest — true MAX(date) over the FULL seeded set

    // D1 — oldest, low scores, EXCLUDED by limit=6
    insertConvictionRow("ACB", D1, 0.30, "bearish");
    insertConvictionRow("PLX", D1, 0.31, "bearish");
    insertConvictionRow("VCB", D1, 0.32, "bearish");
    // D2 — middle, INCLUDED (within newest-6 window)
    insertConvictionRow("ACB", D2, 0.40, "neutral");
    insertConvictionRow("PLX", D2, 0.41, "neutral");
    insertConvictionRow("VCB", D2, 0.42, "neutral");
    // D3 — newest, INCLUDED, highest scores
    insertConvictionRow("ACB", D3, 0.90, "bullish");
    insertConvictionRow("PLX", D3, 0.91, "bullish");
    insertConvictionRow("VCB", D3, 0.92, "bullish");

    const res = makeMockRes();
    handleGetConvictionHistory(
      makeFakeReq("/api/conviction-history?limit=6"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
      new Date(NOW),
    );

    const body = JSON.parse(res.body) as ConvictionHistoryResponse;

    // Point 1: tradingDate == true MAX(date) over the FULL seeded set (D3),
    // not the stale date a naive ASC-LIMIT (or an unbounded window) would
    // otherwise serve.
    expect(body.tradingDate).toBe(D3);

    // Point 2 (anti naive-DESC-flip trap): ACB appears at BOTH D2 (0.40,
    // neutral) and D3 (0.90, bullish) inside the selected newest-6 window. A
    // raw `ORDER BY date DESC LIMIT 6` with NO outer ASC re-wrap would return
    // D3's rows first then D2's — buildSnapshot's "last row written per
    // symbol wins" would then pick D2 (WRONG: older, lower score) as ACB's
    // snapshot entry. The correct (outer-ASC-restored) result reports D3.
    const acb = body.snapshot.find((s) => s.symbol === "ACB");
    expect(acb?.date).toBe(D3);
    expect(acb?.peakScore).toBe(0.90);
    expect(acb?.signal).toBe("bullish");

    // Point 3: series[symbol] stays ASC — first date strictly before last
    // date. Catches an omitted outer-wrap even if point 2 were somehow
    // missed (buildSeries appends in received order with no internal sort).
    const acbSeries = body.series["ACB"]!;
    expect(acbSeries.length).toBe(2); // D1 excluded by limit=6
    expect(acbSeries[0]!.date).toBe(D2);
    expect(acbSeries[acbSeries.length - 1]!.date).toBe(D3);
    expect(acbSeries[0]!.date < acbSeries[acbSeries.length - 1]!.date).toBe(true);

    // D1 (oldest) must be fully excluded — confirms the window is newest-N,
    // not simply "all rows, correctly ordered."
    const allDates = Object.values(body.series).flatMap((pts) => pts.map((p) => p.date));
    expect(allDates).not.toContain(D1);
  });
});
