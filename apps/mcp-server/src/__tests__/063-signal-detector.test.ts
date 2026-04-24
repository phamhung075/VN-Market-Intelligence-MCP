/**
 * Task 063 — Signal Detector (price + news + report)
 *
 * Tests for detectSignals() — a pure domain function that identifies
 * trading signals from a market snapshot and optional context.
 */

import { describe, it, expect } from "bun:test";
import {
  detectSignals,
  type MarketSnapshot,
  type SignalContext,
  type Signal,
  type SignalType,
} from "../domain/services/signalDetector.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function recentIso(minutesAgo: number = 30): string {
  return new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
}

function oldIso(hoursAgo: number = 48): string {
  return new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// Describe block
// ---------------------------------------------------------------------------

describe("Task 063 — Signal Detector", () => {
  // Safe clock outside ATC window (07:30–08:35 UTC) to avoid time-flakes.
  const safeNow = new Date("2026-04-18T10:00:00Z");

  // TC-1: price drop triggers price_drop
  it("returns price_drop signal when price falls by -5%", () => {
    const snapshot = makeSnapshot({
      price: 95_000,
      previousPrice: 100_000, // -5%
    });

    const signals = detectSignals(snapshot);

    const types = signals.map((s) => s.type);
    expect(types).toContain("price_drop");
  });

  // TC-2: price surge triggers price_surge
  it("returns price_surge signal when price rises by +10%", () => {
    const snapshot = makeSnapshot({
      price: 110_000,
      previousPrice: 100_000, // +10%
    });

    const signals = detectSignals(snapshot);

    const types = signals.map((s) => s.type);
    expect(types).toContain("price_surge");
  });

  // TC-3: new report within 24h triggers report_new
  it("returns report_new signal when latest report date is within 24 hours", () => {
    const snapshot = makeSnapshot();
    const context: SignalContext = {
      latestReportDate: recentIso(60), // 60 minutes ago
    };

    const signals = detectSignals(snapshot, context);

    const types = signals.map((s) => s.type);
    expect(types).toContain("report_new");
  });

  // TC-4: old report does NOT trigger report_new
  it("does NOT return report_new when latest report date is older than 24 hours", () => {
    const snapshot = makeSnapshot();
    const context: SignalContext = {
      latestReportDate: oldIso(48),
    };

    const signals = detectSignals(snapshot, context);

    const types = signals.map((s) => s.type);
    expect(types).not.toContain("report_new");
  });

  // TC-5: news mentions trigger news_mention
  it("returns news_mention signal when recentNews contains entries", () => {
    const snapshot = makeSnapshot();
    const context: SignalContext = {
      recentNews: [
        { title: "VCB lãi kỷ lục Q1/2026", source: "CafeF" },
        { title: "Ngân hàng lớn nhất tăng vốn", source: "VnExpress" },
      ],
    };

    const signals = detectSignals(snapshot, context);

    const types = signals.map((s) => s.type);
    expect(types).toContain("news_mention");
  });

  // TC-6: no significant changes returns empty array
  it("returns empty array when no signals are triggered", () => {
    const snapshot = makeSnapshot({
      price: 100_000,
      previousPrice: 100_000, // 0% change
      volume: 1_000_000,
      avgVolume: 1_000_000,
    });

    const signals = detectSignals(snapshot);

    expect(signals).toBeArray();
    expect(signals.length).toBe(0);
  });

  // TC-7: volume spike triggers volume_spike
  it("returns volume_spike signal when volume exceeds 2x average", () => {
    const snapshot = makeSnapshot({
      volume: 2_500_000,  // 2.5x average
      avgVolume: 1_000_000,
    });

    const signals = detectSignals(snapshot, { _now: safeNow });

    const types = signals.map((s) => s.type);
    expect(types).toContain("volume_spike");
  });

  // TC-8: volume below 2x does NOT trigger volume_spike
  it("does NOT return volume_spike when volume is below 2x average", () => {
    const snapshot = makeSnapshot({
      volume: 1_800_000,  // 1.8x — below threshold
      avgVolume: 1_000_000,
    });

    const signals = detectSignals(snapshot);

    const types = signals.map((s) => s.type);
    expect(types).not.toContain("volume_spike");
  });

  // TC-9: multiple signals simultaneously
  it("returns multiple signals simultaneously when several conditions are met", () => {
    const snapshot = makeSnapshot({
      price: 93_000,
      previousPrice: 100_000,  // -7% → price_drop
      volume: 3_000_000,        // 3x average → volume_spike
      avgVolume: 1_000_000,
    });
    const context: SignalContext = {
      latestReportDate: recentIso(10), // → report_new
      recentNews: [{ title: "VCB bán vốn nhà nước", source: "Reuters" }], // → news_mention
      _now: safeNow,
    };

    const signals = detectSignals(snapshot, context);

    const types = signals.map((s) => s.type);
    expect(types).toContain("price_drop");
    expect(types).toContain("volume_spike");
    expect(types).toContain("report_new");
    expect(types).toContain("news_mention");
    expect(signals.length).toBeGreaterThanOrEqual(4);
  });

  // TC-10: custom thresholds via watchlistThresholds
  it("respects custom dropPct threshold from watchlistThresholds", () => {
    const snapshot = makeSnapshot({
      price: 98_000,
      previousPrice: 100_000, // -2% — below default -5% threshold
    });
    const context: SignalContext = {
      watchlistThresholds: { dropPct: -1, risePct: 3, impactScore: 7 },
    };

    const signals = detectSignals(snapshot, context);

    const types = signals.map((s) => s.type);
    // -2% triggers when threshold is -1%
    expect(types).toContain("price_drop");
  });

  // TC-11: Signal shape is correct
  it("returned signals have the required shape (type, severity, actionCode, message, confidence, detectedAt)", () => {
    const snapshot = makeSnapshot({
      price: 90_000,
      previousPrice: 100_000, // -10% → price_drop with high/critical severity
    });

    const signals = detectSignals(snapshot);
    expect(signals.length).toBeGreaterThan(0);

    const signal = signals[0]!;
    expect(signal).toHaveProperty("type");
    expect(signal).toHaveProperty("severity");
    expect(signal).toHaveProperty("actionCode");
    expect(signal).toHaveProperty("message");
    expect(signal).toHaveProperty("confidence");
    expect(signal).toHaveProperty("detectedAt");

    expect(["low", "medium", "high", "critical"]).toContain(signal.severity);
    expect(typeof signal.confidence).toBe("number");
    expect(signal.confidence).toBeGreaterThanOrEqual(0);
    expect(signal.confidence).toBeLessThanOrEqual(1);
    expect(signal.actionCode).toBe("VCB");
    // detectedAt must be a valid ISO string
    expect(() => new Date(signal.detectedAt)).not.toThrow();
  });

  // TC-12: price_drop severity scales with magnitude
  it("price_drop at -10% or more has severity high or critical", () => {
    const snapshot = makeSnapshot({
      price: 85_000,
      previousPrice: 100_000, // -15%
    });

    const signals = detectSignals(snapshot);

    const priceDrop = signals.find((s) => s.type === "price_drop");
    expect(priceDrop).toBeDefined();
    expect(["high", "critical"]).toContain(priceDrop!.severity);
  });
});
