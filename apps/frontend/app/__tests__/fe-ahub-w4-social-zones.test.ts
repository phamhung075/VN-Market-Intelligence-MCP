/**
 * fe-ahub-w4-social-zones.test.ts
 *
 * Sprint: FRONTEND-ANALYSIS-HUB-CONSOLIDATION
 * Task:   FE-AHUB-W4-SOCIAL-ZONES
 *
 * PURE-LOGIC unit tests for the three social-zone components:
 *   ReputationZone — filterReputationEntry, filterReputationHistory
 *   NewsBuzzZone   — filterNewsBuzzEntry
 *   ConvictionHistoryZone — pickStockConvictionRow, pickStockSeries
 *
 * No DOM rendering; all helpers are pure TypeScript functions.
 *
 * Suites:
 *   1. filterReputationEntry — happy path, case-sensitive, not found, empty
 *   2. filterReputationHistory — happy path, not found, empty map
 *   3. filterNewsBuzzEntry — happy path, case-sensitive, not found, empty
 *   4. pickStockConvictionRow — happy path, not found, multi-row safety guard
 *   5. pickStockSeries — happy path, not found, empty series
 *   6. Integration — filter then render helpers (e.g. mapRiskLevel, formatScore)
 */
import { describe, it, expect } from "vitest";

// Reputation zone helpers
import {
  filterReputationEntry,
  filterReputationHistory,
} from "../components/analysis/ReputationZone";
import type { ReputationEntry, HistoryPoint } from "../components/analysis/ReputationZone";

// NewsBuzz zone helpers
import { filterNewsBuzzEntry } from "../components/analysis/NewsBuzzZone";
import type { NewsBuzzEntry } from "../components/analysis/NewsBuzzZone";

// ConvictionHistory zone helpers
import {
  pickStockConvictionRow,
  pickStockSeries,
} from "../components/analysis/ConvictionHistoryZone";
import type { ConvictionRow } from "../components/analysis/ConvictionHistoryZone";

// Route helpers (for integration assertion)
import { mapRiskLevel, getRiskBadgeClass } from "../routes/dashboard.reputation";
import { getNegativityTier, formatNegativeRatioPct } from "../routes/dashboard.news-buzz";
import { formatScore, signalLabel } from "../routes/dashboard.conviction-history";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const REPUTATION_LEADERBOARD: ReputationEntry[] = [
  { code: "VCB", score: 72, trend: "improving", riskLevel: "safe" },
  { code: "FPT", score: 65, trend: "stable", riskLevel: "safe" },
  { code: "HPG", score: 45, trend: "stable", riskLevel: "watch" },
  { code: "NVL", score: 18, trend: "deteriorating", riskLevel: "danger" },
];

const REPUTATION_HISTORY: Record<string, HistoryPoint[]> = {
  VCB: [
    { date: "2026-06-01", score: 65 },
    { date: "2026-06-08", score: 68 },
    { date: "2026-06-15", score: 72 },
  ],
  FPT: [
    { date: "2026-06-01", score: 60 },
    { date: "2026-06-15", score: 65 },
  ],
};

const NEWS_BUZZ_LEADERBOARD: NewsBuzzEntry[] = [
  { code: "VIC", mentions: 42, negative: 28, sources: 12, hoursActive: 18, negativeRatio: 0.67 },
  { code: "VCB", mentions: 30, negative: 6, sources: 8, hoursActive: 12, negativeRatio: 0.20 },
  { code: "FPT", mentions: 20, negative: 8, sources: 5, hoursActive: 8, negativeRatio: 0.40 },
];

const CONVICTION_SNAPSHOT: ConvictionRow[] = [
  { symbol: "HPG", date: "2026-06-28", peakScore: 0.78, signal: "bullish" },
  { symbol: "VCB", date: "2026-06-28", peakScore: 0.55, signal: "neutral" },
  { symbol: "NVL", date: "2026-06-27", peakScore: 0.61, signal: "bearish" },
];

const CONVICTION_SERIES: Record<string, ConvictionRow[]> = {
  HPG: [
    { symbol: "HPG", date: "2026-06-20", peakScore: 0.60, signal: "bullish" },
    { symbol: "HPG", date: "2026-06-24", peakScore: 0.70, signal: "bullish" },
    { symbol: "HPG", date: "2026-06-28", peakScore: 0.78, signal: "bullish" },
  ],
  VCB: [
    { symbol: "VCB", date: "2026-06-28", peakScore: 0.55, signal: "neutral" },
  ],
};

// ---------------------------------------------------------------------------
// Suite 1: filterReputationEntry
// ---------------------------------------------------------------------------

describe("filterReputationEntry", () => {
  it("returns the matching entry for a known code", () => {
    const result = filterReputationEntry(REPUTATION_LEADERBOARD, "VCB");
    expect(result).toBeDefined();
    expect(result!.code).toBe("VCB");
    expect(result!.score).toBe(72);
    expect(result!.riskLevel).toBe("safe");
  });

  it("returns the correct entry for FPT", () => {
    const result = filterReputationEntry(REPUTATION_LEADERBOARD, "FPT");
    expect(result).toBeDefined();
    expect(result!.score).toBe(65);
    expect(result!.trend).toBe("stable");
  });

  it("returns the danger entry for NVL", () => {
    const result = filterReputationEntry(REPUTATION_LEADERBOARD, "NVL");
    expect(result).toBeDefined();
    expect(result!.riskLevel).toBe("danger");
    expect(result!.score).toBe(18);
  });

  it("returns undefined for an unknown code", () => {
    const result = filterReputationEntry(REPUTATION_LEADERBOARD, "UNKNOWN");
    expect(result).toBeUndefined();
  });

  it("is case-sensitive — lowercase does not match uppercase code", () => {
    const result = filterReputationEntry(REPUTATION_LEADERBOARD, "vcb");
    expect(result).toBeUndefined();
  });

  it("returns undefined on empty leaderboard", () => {
    const result = filterReputationEntry([], "VCB");
    expect(result).toBeUndefined();
  });

  it("returns the first matching entry when duplicates exist (data invariant)", () => {
    const dup = [
      { code: "VCB", score: 72, trend: "improving", riskLevel: "safe" },
      { code: "VCB", score: 50, trend: "stable", riskLevel: "watch" },
    ];
    const result = filterReputationEntry(dup, "VCB");
    expect(result!.score).toBe(72); // first match
  });
});

// ---------------------------------------------------------------------------
// Suite 2: filterReputationHistory
// ---------------------------------------------------------------------------

describe("filterReputationHistory", () => {
  it("returns history points for a known code", () => {
    const result = filterReputationHistory(REPUTATION_HISTORY, "VCB");
    expect(result).toHaveLength(3);
    expect(result[0]!.date).toBe("2026-06-01");
    expect(result[2]!.score).toBe(72);
  });

  it("returns FPT history with 2 points", () => {
    const result = filterReputationHistory(REPUTATION_HISTORY, "FPT");
    expect(result).toHaveLength(2);
  });

  it("returns [] for a code not in history", () => {
    const result = filterReputationHistory(REPUTATION_HISTORY, "HPG");
    expect(result).toEqual([]);
  });

  it("returns [] for empty history map", () => {
    const result = filterReputationHistory({}, "VCB");
    expect(result).toEqual([]);
  });

  it("history points are in ascending date order (fixture sanity check)", () => {
    const result = filterReputationHistory(REPUTATION_HISTORY, "VCB");
    for (let i = 1; i < result.length; i++) {
      expect(result[i]!.date >= result[i - 1]!.date).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 3: filterNewsBuzzEntry
// ---------------------------------------------------------------------------

describe("filterNewsBuzzEntry", () => {
  it("returns the matching entry for VIC (highest mentions)", () => {
    const result = filterNewsBuzzEntry(NEWS_BUZZ_LEADERBOARD, "VIC");
    expect(result).toBeDefined();
    expect(result!.code).toBe("VIC");
    expect(result!.mentions).toBe(42);
    expect(result!.negativeRatio).toBeCloseTo(0.67);
  });

  it("returns the VCB entry (low negativity)", () => {
    const result = filterNewsBuzzEntry(NEWS_BUZZ_LEADERBOARD, "VCB");
    expect(result).toBeDefined();
    expect(result!.negative).toBe(6);
    expect(result!.negativeRatio).toBeCloseTo(0.20);
  });

  it("returns the FPT entry (medium negativity)", () => {
    const result = filterNewsBuzzEntry(NEWS_BUZZ_LEADERBOARD, "FPT");
    expect(result).toBeDefined();
    expect(result!.sources).toBe(5);
    expect(result!.negativeRatio).toBeCloseTo(0.40);
  });

  it("returns undefined for an unknown code", () => {
    const result = filterNewsBuzzEntry(NEWS_BUZZ_LEADERBOARD, "UNKNWN");
    expect(result).toBeUndefined();
  });

  it("is case-sensitive — 'vic' does not match 'VIC'", () => {
    const result = filterNewsBuzzEntry(NEWS_BUZZ_LEADERBOARD, "vic");
    expect(result).toBeUndefined();
  });

  it("returns undefined on empty leaderboard", () => {
    const result = filterNewsBuzzEntry([], "VIC");
    expect(result).toBeUndefined();
  });

  it("entry.hoursActive is a number", () => {
    const result = filterNewsBuzzEntry(NEWS_BUZZ_LEADERBOARD, "VIC");
    expect(typeof result!.hoursActive).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// Suite 4: pickStockConvictionRow
// ---------------------------------------------------------------------------

describe("pickStockConvictionRow", () => {
  it("returns the HPG row", () => {
    const result = pickStockConvictionRow(CONVICTION_SNAPSHOT, "HPG");
    expect(result).toBeDefined();
    expect(result!.symbol).toBe("HPG");
    expect(result!.peakScore).toBeCloseTo(0.78);
    expect(result!.signal).toBe("bullish");
  });

  it("returns the VCB row (neutral signal)", () => {
    const result = pickStockConvictionRow(CONVICTION_SNAPSHOT, "VCB");
    expect(result).toBeDefined();
    expect(result!.signal).toBe("neutral");
  });

  it("returns the NVL row (stale date, bearish)", () => {
    const result = pickStockConvictionRow(CONVICTION_SNAPSHOT, "NVL");
    expect(result).toBeDefined();
    expect(result!.signal).toBe("bearish");
    expect(result!.date).toBe("2026-06-27");
  });

  it("returns undefined for an unknown stock", () => {
    const result = pickStockConvictionRow(CONVICTION_SNAPSHOT, "XXXX");
    expect(result).toBeUndefined();
  });

  it("returns undefined for empty snapshot", () => {
    const result = pickStockConvictionRow([], "HPG");
    expect(result).toBeUndefined();
  });

  it("is case-sensitive", () => {
    const result = pickStockConvictionRow(CONVICTION_SNAPSHOT, "hpg");
    expect(result).toBeUndefined();
  });

  it("returns first match when snapshot has multiple rows for same symbol (safety guard)", () => {
    const dup = [
      { symbol: "HPG", date: "2026-06-28", peakScore: 0.78, signal: "bullish" as const },
      { symbol: "HPG", date: "2026-06-27", peakScore: 0.65, signal: "neutral" as const },
    ];
    const result = pickStockConvictionRow(dup, "HPG");
    expect(result!.peakScore).toBeCloseTo(0.78);
  });
});

// ---------------------------------------------------------------------------
// Suite 5: pickStockSeries
// ---------------------------------------------------------------------------

describe("pickStockSeries", () => {
  it("returns 3 points for HPG", () => {
    const result = pickStockSeries(CONVICTION_SERIES, "HPG");
    expect(result).toHaveLength(3);
    expect(result[0]!.date).toBe("2026-06-20");
    expect(result[2]!.peakScore).toBeCloseTo(0.78);
  });

  it("returns 1 point for VCB", () => {
    const result = pickStockSeries(CONVICTION_SERIES, "VCB");
    expect(result).toHaveLength(1);
  });

  it("returns [] for a stock not in series", () => {
    const result = pickStockSeries(CONVICTION_SERIES, "NVL");
    expect(result).toEqual([]);
  });

  it("returns [] for empty series map", () => {
    const result = pickStockSeries({}, "HPG");
    expect(result).toEqual([]);
  });

  it("series points are in ascending date order (fixture sanity)", () => {
    const result = pickStockSeries(CONVICTION_SERIES, "HPG");
    for (let i = 1; i < result.length; i++) {
      expect(result[i]!.date >= result[i - 1]!.date).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 6: Integration — filter + route helpers compose correctly
// ---------------------------------------------------------------------------

describe("Integration — filter then display helpers", () => {
  it("filterReputationEntry(VCB) → mapRiskLevel → 'An toàn'", () => {
    const entry = filterReputationEntry(REPUTATION_LEADERBOARD, "VCB");
    expect(entry).toBeDefined();
    expect(mapRiskLevel(entry!.riskLevel)).toBe("An toàn");
  });

  it("filterReputationEntry(NVL) → getRiskBadgeClass contains 'red'", () => {
    const entry = filterReputationEntry(REPUTATION_LEADERBOARD, "NVL");
    expect(entry).toBeDefined();
    expect(getRiskBadgeClass(entry!.riskLevel)).toContain("red");
  });

  it("filterNewsBuzzEntry(VIC) → getNegativityTier → 'danger'", () => {
    const entry = filterNewsBuzzEntry(NEWS_BUZZ_LEADERBOARD, "VIC");
    expect(entry).toBeDefined();
    expect(getNegativityTier(entry!.negativeRatio)).toBe("danger");
  });

  it("filterNewsBuzzEntry(VCB) → getNegativityTier → 'ok'", () => {
    const entry = filterNewsBuzzEntry(NEWS_BUZZ_LEADERBOARD, "VCB");
    expect(entry).toBeDefined();
    expect(getNegativityTier(entry!.negativeRatio)).toBe("ok");
  });

  it("filterNewsBuzzEntry(VIC) → formatNegativeRatioPct → '67%'", () => {
    const entry = filterNewsBuzzEntry(NEWS_BUZZ_LEADERBOARD, "VIC");
    expect(formatNegativeRatioPct(entry!.negativeRatio)).toBe("67%");
  });

  it("pickStockConvictionRow(HPG) → formatScore → '0.78'", () => {
    const row = pickStockConvictionRow(CONVICTION_SNAPSHOT, "HPG");
    expect(row).toBeDefined();
    expect(formatScore(row!.peakScore)).toBe("0.78");
  });

  it("pickStockConvictionRow(HPG) → signalLabel → 'Tăng'", () => {
    const row = pickStockConvictionRow(CONVICTION_SNAPSHOT, "HPG");
    expect(row).toBeDefined();
    expect(signalLabel(row!.signal)).toBe("Tăng");
  });

  it("pickStockConvictionRow(VCB) → signalLabel → 'Trung lập'", () => {
    const row = pickStockConvictionRow(CONVICTION_SNAPSHOT, "VCB");
    expect(row).toBeDefined();
    expect(signalLabel(row!.signal)).toBe("Trung lập");
  });

  it("pickStockConvictionRow(NVL) → signalLabel → 'Giảm'", () => {
    const row = pickStockConvictionRow(CONVICTION_SNAPSHOT, "NVL");
    expect(row).toBeDefined();
    expect(signalLabel(row!.signal)).toBe("Giảm");
  });

  it("undefined entry → getRiskBadgeClass with fallback (no crash)", () => {
    const entry = filterReputationEntry(REPUTATION_LEADERBOARD, "MISSING");
    // entry is undefined — this tests that caller won't crash when undefined
    expect(entry).toBeUndefined();
    // calling helpers directly with an arbitrary string still returns a string
    expect(typeof getRiskBadgeClass("unknown")).toBe("string");
  });
});
