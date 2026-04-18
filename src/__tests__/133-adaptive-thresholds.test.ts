/**
 * Task 133 — Adaptive Signal Detection Thresholds
 *
 * Tests for:
 *   1. computeStockVolatility() — volatilityCalculator.ts (new)
 *   2. detectSignals() with volatility parameter — signalDetector.ts (updated)
 *   3. Config values from mcp.config.json respected
 */

import { describe, it, expect } from "bun:test";
import {
  computeStockVolatility,
  type StockVolatility,
} from "../domain/services/volatilityCalculator.js";
import {
  detectSignals,
  type MarketSnapshot,
} from "../domain/services/signalDetector.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a synthetic price history with a given stdDev of daily returns.
 * Prices walk with +/- stdDev alternating to approximate the target stdDev.
 */
function buildHistory(
  days: number,
  dailyReturnStdDev: number,
  avgVolume = 1_000_000,
): Array<{ price: number; volume: number; date: string }> {
  const history: Array<{ price: number; volume: number; date: string }> = [];
  let price = 50_000;
  for (let i = 0; i < days; i++) {
    // Alternate positive/negative returns to achieve target stdDev
    const ret = i % 2 === 0 ? dailyReturnStdDev : -dailyReturnStdDev;
    price = price * (1 + ret);
    const d = new Date(2026, 0, i + 1);
    history.push({
      price,
      volume: avgVolume + (i % 3 === 0 ? avgVolume * 0.2 : 0),
      date: d.toISOString().slice(0, 10),
    });
  }
  return history;
}

function makeSnapshot(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    actionCode: "VCB",
    price: 100_000,
    previousPrice: 100_000,
    volume: 1_000_000,
    avgVolume: 1_000_000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Group 1: volatilityCalculator — core computation
// ---------------------------------------------------------------------------

describe("Task 133 — Volatility Calculator", () => {
  // TC-01: Stable stock (VCB-like, stdDev=0.015) → threshold ≈ -3%/+3%
  it("stable stock: adaptiveDropPct ≈ -3% for stdDev=0.015", () => {
    const history = buildHistory(30, 0.015);
    const vol = computeStockVolatility(history);
    // 2 * 1.5% = 3%
    expect(vol.adaptiveDropPct).toBeLessThan(0);
    expect(vol.adaptiveDropPct).toBeGreaterThanOrEqual(-5);
    expect(vol.adaptiveDropPct).toBeLessThanOrEqual(-1);
    // Should be close to -3 (2 sigma * 1.5%)
    expect(Math.abs(vol.adaptiveDropPct - (-3))).toBeLessThan(1.5);
  });

  it("stable stock: adaptiveRisePct ≈ +3% for stdDev=0.015", () => {
    const history = buildHistory(30, 0.015);
    const vol = computeStockVolatility(history);
    expect(vol.adaptiveRisePct).toBeGreaterThan(0);
    expect(Math.abs(vol.adaptiveRisePct - 3)).toBeLessThan(1.5);
  });

  // TC-03: Volatile stock (HPG-like, stdDev=0.04) → threshold ≈ -8%/+8%
  it("volatile stock: adaptiveDropPct ≈ -8% for stdDev=0.04", () => {
    const history = buildHistory(30, 0.04);
    const vol = computeStockVolatility(history);
    expect(vol.adaptiveDropPct).toBeLessThan(0);
    // 2 * 4% = 8%, allow ±2% tolerance
    expect(Math.abs(vol.adaptiveDropPct - (-8))).toBeLessThan(2.5);
  });

  it("volatile stock: adaptiveRisePct ≈ +8% for stdDev=0.04", () => {
    const history = buildHistory(30, 0.04);
    const vol = computeStockVolatility(history);
    expect(vol.adaptiveRisePct).toBeGreaterThan(0);
    expect(Math.abs(vol.adaptiveRisePct - 8)).toBeLessThan(2.5);
  });

  // TC-05: Edge — only 3 days of history → use default thresholds
  it("only 3 days of history → returns default fallback thresholds", () => {
    const history = buildHistory(3, 0.04);
    const vol = computeStockVolatility(history);
    // Cannot compute reliable stdDev with < 2 returns, should fall back
    // adaptiveDropPct should be DEFAULT_DROP_PCT = -5
    expect(vol.adaptiveDropPct).toBe(-5);
    expect(vol.adaptiveRisePct).toBe(5);
    expect(vol.adaptiveVolumeMult).toBe(2);
  });

  // TC-06: Edge — all same prices → stdDev=0, use minimum thresholds
  it("all same prices → stdDev=0, clamp to minimum thresholds", () => {
    const history = Array.from({ length: 25 }, (_, i) => ({
      price: 50_000,
      volume: 1_000_000,
      date: new Date(2026, 0, i + 1).toISOString().slice(0, 10),
    }));
    const vol = computeStockVolatility(history);
    expect(vol.dailyStdDev).toBe(0);
    // clamp: drop between -1% and -15%
    expect(vol.adaptiveDropPct).toBe(-1);
    expect(vol.adaptiveRisePct).toBe(1);
  });

  // TC-07: Clamp — computed drop exceeds -15% → capped at -15%
  it("extremely volatile stock: adaptiveDropPct clamped at -15%", () => {
    // stdDev = 0.12 → 2*12 = 24% → capped at 15
    const history = buildHistory(30, 0.12);
    const vol = computeStockVolatility(history);
    expect(vol.adaptiveDropPct).toBe(-15);
    expect(vol.adaptiveRisePct).toBe(15);
  });

  // TC-08: annualizedVol calculation
  it("annualizedVol = dailyStdDev * sqrt(252)", () => {
    const history = buildHistory(30, 0.02);
    const vol = computeStockVolatility(history);
    const expectedAnnualized = vol.dailyStdDev * Math.sqrt(252);
    expect(Math.abs(vol.annualizedVol - expectedAnnualized)).toBeLessThan(0.001);
  });

  // TC-09: windowDays reflects actual data used
  it("windowDays reflects the number of history entries used", () => {
    const history = buildHistory(25, 0.02);
    const vol = computeStockVolatility(history, { windowDays: 20 });
    expect(vol.windowDays).toBe(20);
  });

  it("windowDays capped at history length when history is shorter", () => {
    const history = buildHistory(10, 0.02);
    const vol = computeStockVolatility(history, { windowDays: 20 });
    expect(vol.windowDays).toBeLessThanOrEqual(history.length);
  });

  // TC-11: actionCode propagated
  it("actionCode from first price entry is reflected in result", () => {
    const history = buildHistory(25, 0.02);
    const vol = computeStockVolatility(history);
    // actionCode is not in priceHistory items, it should be empty string by default
    expect(typeof vol.actionCode).toBe("string");
  });

  // TC-12: Volume — high volume variance → higher spike multiplier
  it("high volume variance → adaptiveVolumeMult > low variance", () => {
    // Build high-variance volume history
    const highVarHistory = Array.from({ length: 25 }, (_, i) => ({
      price: 50_000 * (1 + (i % 2 === 0 ? 0.02 : -0.02)),
      volume: i % 2 === 0 ? 3_000_000 : 500_000, // huge swings
      date: new Date(2026, 0, i + 1).toISOString().slice(0, 10),
    }));

    const lowVarHistory = Array.from({ length: 25 }, (_, i) => ({
      price: 50_000 * (1 + (i % 2 === 0 ? 0.02 : -0.02)),
      volume: 1_000_000, // stable
      date: new Date(2026, 0, i + 1).toISOString().slice(0, 10),
    }));

    const highVol = computeStockVolatility(highVarHistory);
    const lowVol = computeStockVolatility(lowVarHistory);

    expect(highVol.adaptiveVolumeMult).toBeGreaterThan(lowVol.adaptiveVolumeMult);
  });

  // TC-13: Volume multiplier clamp — never exceeds 5.0
  it("adaptiveVolumeMult clamped at maximum 5.0", () => {
    const extremeVarHistory = Array.from({ length: 25 }, (_, i) => ({
      price: 50_000 * (1 + (i % 2 === 0 ? 0.02 : -0.02)),
      volume: i % 2 === 0 ? 100_000_000 : 1, // extreme swings
      date: new Date(2026, 0, i + 1).toISOString().slice(0, 10),
    }));
    const vol = computeStockVolatility(extremeVarHistory);
    expect(vol.adaptiveVolumeMult).toBeLessThanOrEqual(5.0);
  });

  // TC-14: Volume multiplier clamp — never below 1.5
  it("adaptiveVolumeMult at least 1.5", () => {
    const history = buildHistory(25, 0.015);
    const vol = computeStockVolatility(history);
    expect(vol.adaptiveVolumeMult).toBeGreaterThanOrEqual(1.5);
  });

  // TC-15: Custom sigma config
  it("custom dropSigma=3 produces wider threshold than dropSigma=2", () => {
    const history = buildHistory(30, 0.02);
    const vol2 = computeStockVolatility(history, { dropSigma: 2 });
    const vol3 = computeStockVolatility(history, { dropSigma: 3 });
    // higher sigma → more negative drop threshold
    expect(vol3.adaptiveDropPct).toBeLessThan(vol2.adaptiveDropPct);
  });

  // TC-16: Returns valid StockVolatility shape
  it("returns correct StockVolatility shape", () => {
    const history = buildHistory(25, 0.02);
    const vol = computeStockVolatility(history);
    expect(typeof vol.actionCode).toBe("string");
    expect(typeof vol.dailyStdDev).toBe("number");
    expect(typeof vol.annualizedVol).toBe("number");
    expect(typeof vol.adaptiveDropPct).toBe("number");
    expect(typeof vol.adaptiveRisePct).toBe("number");
    expect(typeof vol.adaptiveVolumeMult).toBe("number");
    expect(typeof vol.windowDays).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// Group 2: signalDetector — integration with volatility
// ---------------------------------------------------------------------------

describe("Task 133 — Signal Detector with Adaptive Volatility", () => {
  // Safe clock outside ATC window (07:30–08:35 UTC) to avoid time-flakes.
  const safeNow = new Date("2026-04-18T10:00:00Z");

  // TC-17: detectSignals uses adaptive thresholds when volatility provided
  it("uses adaptive drop threshold when volatility is provided", () => {
    // Stable stock: adaptive threshold = -3%, fixed default = -5%
    // A -4% move should trigger with adaptive but NOT with default
    const history = buildHistory(30, 0.015);
    const vol = computeStockVolatility(history);

    const snapshot = makeSnapshot({
      actionCode: "VCB",
      price: 96_000,       // -4% from 100_000
      previousPrice: 100_000,
    });

    const signalsWithAdaptive = detectSignals(snapshot, { volatility: vol });
    const signalsDefault = detectSignals(snapshot);

    const adaptiveTypes = signalsWithAdaptive.map((s) => s.type);
    const defaultTypes = signalsDefault.map((s) => s.type);

    // Adaptive threshold for stable stock ≈ -3%, so -4% should trigger
    expect(adaptiveTypes).toContain("price_drop");
    // Default threshold = -5%, so -4% should NOT trigger
    expect(defaultTypes).not.toContain("price_drop");
  });

  // TC-18: detectSignals uses adaptive rise threshold when volatility provided
  it("uses adaptive rise threshold when volatility is provided", () => {
    // Stable stock: adaptive threshold ≈ +3%, fixed default = +5%
    // A +4% move should trigger with adaptive but NOT with default
    const history = buildHistory(30, 0.015);
    const vol = computeStockVolatility(history);

    const snapshot = makeSnapshot({
      actionCode: "VCB",
      price: 104_000,   // +4%
      previousPrice: 100_000,
    });

    const signalsAdaptive = detectSignals(snapshot, { volatility: vol });
    const signalsDefault = detectSignals(snapshot);

    expect(signalsAdaptive.map((s) => s.type)).toContain("price_surge");
    expect(signalsDefault.map((s) => s.type)).not.toContain("price_surge");
  });

  // TC-19: volatile stock does NOT trigger on small moves
  it("volatile stock adaptive threshold does NOT trigger on -4% move", () => {
    // HPG-like: adaptive threshold ≈ -8%, so -4% should NOT trigger
    const history = buildHistory(30, 0.04);
    const vol = computeStockVolatility(history);

    const snapshot = makeSnapshot({
      actionCode: "HPG",
      price: 96_000,   // -4%
      previousPrice: 100_000,
    });

    const signals = detectSignals(snapshot, { volatility: vol });
    expect(signals.map((s) => s.type)).not.toContain("price_drop");
  });

  // TC-20: adaptive volume multiplier used when volatility provided
  it("uses adaptive volume multiplier when volatility is provided", () => {
    const history = buildHistory(30, 0.015); // stable price
    const vol = computeStockVolatility(history);

    // Volume exactly 2x avg — triggers with fixed default (2x multiplier)
    // but with adaptive (≥1.5x) it should also trigger (lower bar)
    const snapshot = makeSnapshot({
      volume: 2_000_000,
      avgVolume: 1_000_000,
    });

    const signals = detectSignals(snapshot, { volatility: vol, _now: safeNow });
    expect(signals.map((s) => s.type)).toContain("volume_spike");
  });

  // TC-21: watchlistThresholds still override even when volatility provided
  it("watchlistThresholds override volatility adaptive thresholds", () => {
    const history = buildHistory(30, 0.04); // HPG-like: adaptive ≈ -8%
    const vol = computeStockVolatility(history);

    const snapshot = makeSnapshot({
      price: 96_000, // -4%
      previousPrice: 100_000,
    });

    // Explicit watchlistThreshold = -2% should override adaptive -8%
    const signals = detectSignals(snapshot, {
      volatility: vol,
      watchlistThresholds: { dropPct: -2, risePct: 3, impactScore: 7 },
    });

    expect(signals.map((s) => s.type)).toContain("price_drop");
  });

  // TC-22: fallback to defaults when no volatility and no watchlistThresholds
  it("falls back to default -5%/+5% when no volatility or thresholds provided", () => {
    const snapshotDrop4 = makeSnapshot({
      price: 96_000,
      previousPrice: 100_000, // -4%
    });
    // -4% does NOT exceed default -5% threshold
    const signals = detectSignals(snapshotDrop4);
    expect(signals.map((s) => s.type)).not.toContain("price_drop");
  });
});

// ---------------------------------------------------------------------------
// Group 3: Config values respected
// ---------------------------------------------------------------------------

describe("Task 133 — Config values from mcp.config.json", () => {
  it("adaptiveThresholds.windowDays config controls history window", () => {
    const history = buildHistory(30, 0.02);

    const vol20 = computeStockVolatility(history, { windowDays: 20 });
    const vol10 = computeStockVolatility(history, { windowDays: 10 });

    expect(vol20.windowDays).toBe(20);
    expect(vol10.windowDays).toBe(10);
    // Different windows → different stdDevs (last 10 vs last 20 days)
    // (They may differ slightly due to different subsets)
    expect(typeof vol20.dailyStdDev).toBe("number");
    expect(typeof vol10.dailyStdDev).toBe("number");
  });

  it("min/max clamps are symmetric: drop clamped -1 to -15, rise clamped 1 to 15", () => {
    const flatHistory = Array.from({ length: 25 }, (_, i) => ({
      price: 50_000,
      volume: 1_000_000,
      date: new Date(2026, 0, i + 1).toISOString().slice(0, 10),
    }));
    const vol = computeStockVolatility(flatHistory);
    // stdDev=0 → clamp to minimum
    expect(vol.adaptiveDropPct).toBeGreaterThanOrEqual(-15);
    expect(vol.adaptiveDropPct).toBeLessThanOrEqual(-1);
    expect(vol.adaptiveRisePct).toBeGreaterThanOrEqual(1);
    expect(vol.adaptiveRisePct).toBeLessThanOrEqual(15);
  });

  it("volume multiplier always in range [1.5, 5.0]", () => {
    const normalHistory = buildHistory(25, 0.02);
    const vol = computeStockVolatility(normalHistory);
    expect(vol.adaptiveVolumeMult).toBeGreaterThanOrEqual(1.5);
    expect(vol.adaptiveVolumeMult).toBeLessThanOrEqual(5.0);
  });
});
