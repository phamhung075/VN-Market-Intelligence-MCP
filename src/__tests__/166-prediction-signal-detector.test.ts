// src/__tests__/166-prediction-signal-detector.test.ts
import { describe, it, expect } from "bun:test";
import {
  detectPredictionSignals,
  type PredictionMarket,
  type PredictionSignalConfig,
  type RecentSentimentEntry,
} from "../domain/services/predictionSignalDetector.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeMarket(overrides: Partial<PredictionMarket> = {}): PredictionMarket {
  return {
    id: "market-001",
    question: "Will the Fed cut rates in June 2026?",
    endDate: "2026-06-30T00:00:00Z",
    yesPrice: 0.50,
    noPrice: 0.50,
    volume24h: 10000,
    volumeTotal: 100000,
    liquidity: 50000,
    lastTradePrice: 0.50,
    uniqueWalletsCount: 20,
    tags: ["macroeconomics", "federal-reserve"],
    fetchedAt: new Date().toISOString(),
    ...overrides,
  };
}

const DEFAULT_CONFIG: PredictionSignalConfig = {
  volumeSpikeThresholdUsd: 50000,
  probabilityShiftPct: 5,
  minUniqueWallets: 10,
};

// ─────────────────────────────────────────────────────────────────────────────
// Task 166 — Prediction Signal Detector
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 166 — Prediction Signal Detector", () => {

  // ── volume_spike ────────────────────────────────────────────────────────────

  describe("volume_spike signals", () => {
    it("detects volume_spike when volume24h exceeds volumeSpikeThresholdUsd", () => {
      const market = makeMarket({ volume24h: 75000, uniqueWalletsCount: 20 });
      const signals = detectPredictionSignals([market], [], DEFAULT_CONFIG, new Set(), []);

      const spike = signals.find((s) => s.signalType === "volume_spike");
      expect(spike).toBeDefined();
      expect(spike!.signalType).toBe("volume_spike");
    });

    it("volume_spike has base severity 'low'", () => {
      const market = makeMarket({ volume24h: 75000, uniqueWalletsCount: 20 });
      const signals = detectPredictionSignals([market], [], DEFAULT_CONFIG, new Set(), []);
      const spike = signals.find((s) => s.signalType === "volume_spike");
      expect(spike!.severity).toBe("low");
    });

    it("volume_spike confidence = walletQuality * 0.5 (shiftMagnitude = 0 when no prev)", () => {
      // uniqueWalletsCount = 20 → walletQuality = min(1.0, 20/100) = 0.20
      // confidence = clamp(0.20 * 0.5 + 0 * 0.5, 0.1, 0.95) = clamp(0.10, 0.1, 0.95) = 0.10
      const market = makeMarket({ volume24h: 75000, uniqueWalletsCount: 20 });
      const signals = detectPredictionSignals([market], [], DEFAULT_CONFIG, new Set(), []);
      const spike = signals.find((s) => s.signalType === "volume_spike");
      expect(spike!.confidence).toBeCloseTo(0.10, 4);
    });

    it("volume_spike confidence minimum is 0.1 (clamped)", () => {
      // uniqueWalletsCount = 0 → walletQuality = 0
      // confidence = clamp(0, 0.1, 0.95) = 0.10
      const market = makeMarket({ volume24h: 75000, uniqueWalletsCount: 0 });
      const signals = detectPredictionSignals([market], [], DEFAULT_CONFIG, new Set(), []);
      const spike = signals.find((s) => s.signalType === "volume_spike");
      expect(spike!.confidence).toBeGreaterThanOrEqual(0.1);
    });

    it("does NOT detect volume_spike when volume24h < volumeSpikeThresholdUsd", () => {
      const market = makeMarket({ volume24h: 49999 });
      const signals = detectPredictionSignals([market], [], DEFAULT_CONFIG, new Set(), []);
      const spike = signals.find((s) => s.signalType === "volume_spike");
      expect(spike).toBeUndefined();
    });

    it("detects volume_spike at exact threshold boundary", () => {
      const market = makeMarket({ volume24h: 50000, uniqueWalletsCount: 10 });
      const signals = detectPredictionSignals([market], [], DEFAULT_CONFIG, new Set(), []);
      const spike = signals.find((s) => s.signalType === "volume_spike");
      expect(spike).toBeDefined();
    });
  });

  // ── probability_shift ────────────────────────────────────────────────────────

  describe("probability_shift signals", () => {
    it("detects probability_shift when yesPrice moves >= probabilityShiftPct", () => {
      const current = makeMarket({ id: "m1", yesPrice: 0.72, uniqueWalletsCount: 30 });
      const previous: PredictionMarket[] = [
        makeMarket({ id: "m1", yesPrice: 0.65, uniqueWalletsCount: 25 }),
      ];
      const signals = detectPredictionSignals([current], previous, DEFAULT_CONFIG, new Set(), []);
      const shift = signals.find((s) => s.signalType === "probability_shift");
      expect(shift).toBeDefined();
    });

    it("probability_shift has correct prices and severity 'medium'", () => {
      const current = makeMarket({ id: "m1", yesPrice: 0.72, uniqueWalletsCount: 30 });
      const previous: PredictionMarket[] = [
        makeMarket({ id: "m1", yesPrice: 0.65, uniqueWalletsCount: 25 }),
      ];
      const signals = detectPredictionSignals([current], previous, DEFAULT_CONFIG, new Set(), []);
      const shift = signals.find((s) => s.signalType === "probability_shift");
      expect(shift!.yesPricePrev).toBe(0.65);
      expect(shift!.yesPriceCurr).toBe(0.72);
      expect(shift!.severity).toBe("medium");
    });

    it("probability_shift confidence = clamp(walletQuality*0.5 + shiftMagnitude*0.5, 0.1, 0.95)", () => {
      // uniqueWalletsCount = 30 → walletQuality = min(1.0, 30/100) = 0.30
      // |0.72 - 0.65| = 0.07 → shiftMagnitude = min(1.0, 0.07/0.20) = 0.35
      // confidence = clamp(0.30*0.5 + 0.35*0.5, 0.1, 0.95) = clamp(0.325, 0.1, 0.95) = 0.325
      const current = makeMarket({ id: "m1", yesPrice: 0.72, uniqueWalletsCount: 30 });
      const previous: PredictionMarket[] = [
        makeMarket({ id: "m1", yesPrice: 0.65, uniqueWalletsCount: 25 }),
      ];
      const signals = detectPredictionSignals([current], previous, DEFAULT_CONFIG, new Set(), []);
      const shift = signals.find((s) => s.signalType === "probability_shift");
      expect(shift!.confidence).toBeCloseTo(0.325, 3);
    });

    it("does NOT detect probability_shift when shift is just below threshold (4.99pp)", () => {
      const current = makeMarket({ id: "m1", yesPrice: 0.6499, uniqueWalletsCount: 20 });
      const previous: PredictionMarket[] = [
        makeMarket({ id: "m1", yesPrice: 0.60, uniqueWalletsCount: 15 }),
      ];
      const signals = detectPredictionSignals([current], previous, DEFAULT_CONFIG, new Set(), []);
      const shift = signals.find((s) => s.signalType === "probability_shift");
      expect(shift).toBeUndefined();
    });

    it("detects probability_shift exactly at 5pp threshold (5.00pp)", () => {
      const current = makeMarket({ id: "m1", yesPrice: 0.65, uniqueWalletsCount: 20 });
      const previous: PredictionMarket[] = [
        makeMarket({ id: "m1", yesPrice: 0.60, uniqueWalletsCount: 15 }),
      ];
      const signals = detectPredictionSignals([current], previous, DEFAULT_CONFIG, new Set(), []);
      const shift = signals.find((s) => s.signalType === "probability_shift");
      expect(shift).toBeDefined();
    });

    it("detects downward probability_shift (negative direction)", () => {
      const current = makeMarket({ id: "m1", yesPrice: 0.40, uniqueWalletsCount: 20 });
      const previous: PredictionMarket[] = [
        makeMarket({ id: "m1", yesPrice: 0.50, uniqueWalletsCount: 15 }),
      ];
      const signals = detectPredictionSignals([current], previous, DEFAULT_CONFIG, new Set(), []);
      const shift = signals.find((s) => s.signalType === "probability_shift");
      expect(shift).toBeDefined();
      expect(shift!.yesPricePrev).toBe(0.50);
      expect(shift!.yesPriceCurr).toBe(0.40);
    });
  });

  // ── insider_timing ────────────────────────────────────────────────────────────

  describe("insider_timing signals", () => {
    it("detects insider_timing when probability_shift AND wallet increase >= 3 AND not in recent news", () => {
      const current = makeMarket({
        id: "m1",
        yesPrice: 0.72,
        uniqueWalletsCount: 30,
      });
      const previous: PredictionMarket[] = [
        makeMarket({
          id: "m1",
          yesPrice: 0.65,
          uniqueWalletsCount: 25,  // increase = 5 >= 3
        }),
      ];
      const signals = detectPredictionSignals(
        [current],
        previous,
        DEFAULT_CONFIG,
        new Set(), // "m1" NOT in hasRecentNews
        [],
      );
      const insider = signals.find((s) => s.signalType === "insider_timing");
      expect(insider).toBeDefined();
      expect(insider!.severity).toBe("high");
    });

    it("does NOT detect insider_timing when market is in hasRecentNews", () => {
      const current = makeMarket({ id: "m1", yesPrice: 0.72, uniqueWalletsCount: 30 });
      const previous: PredictionMarket[] = [
        makeMarket({ id: "m1", yesPrice: 0.65, uniqueWalletsCount: 25 }),
      ];
      const signals = detectPredictionSignals(
        [current],
        previous,
        DEFAULT_CONFIG,
        new Set(["m1"]), // m1 IS in recent news
        [],
      );
      const insider = signals.find((s) => s.signalType === "insider_timing");
      expect(insider).toBeUndefined();
    });

    it("does NOT detect insider_timing when wallet increase < 3", () => {
      const current = makeMarket({ id: "m1", yesPrice: 0.72, uniqueWalletsCount: 27 });
      const previous: PredictionMarket[] = [
        makeMarket({ id: "m1", yesPrice: 0.65, uniqueWalletsCount: 25 }), // +2 < 3
      ];
      const signals = detectPredictionSignals(
        [current],
        previous,
        DEFAULT_CONFIG,
        new Set(),
        [],
      );
      const insider = signals.find((s) => s.signalType === "insider_timing");
      expect(insider).toBeUndefined();
    });

    it("insider_timing downgraded to 'low' when uniqueWalletsCount < minUniqueWallets", () => {
      const current = makeMarket({
        id: "m1",
        yesPrice: 0.72,
        uniqueWalletsCount: 8, // below minUniqueWallets=10
      });
      const previous: PredictionMarket[] = [
        makeMarket({ id: "m1", yesPrice: 0.65, uniqueWalletsCount: 4 }), // +4 >= 3
      ];
      const signals = detectPredictionSignals(
        [current],
        previous,
        DEFAULT_CONFIG,
        new Set(),
        [],
      );
      const insider = signals.find((s) => s.signalType === "insider_timing");
      expect(insider).toBeDefined();
      expect(insider!.severity).toBe("low");
    });
  });

  // ── sentiment_divergence ────────────────────────────────────────────────────────

  describe("sentiment_divergence signals", () => {
    it("detects sentiment_divergence when yesPrice >= 0.65 and bullish sentiment for related stock", () => {
      const market = makeMarket({
        id: "m1",
        question: "Will the Fed cut rates in June 2026?",
        yesPrice: 0.70,
        uniqueWalletsCount: 20,
      });
      const sentiments: RecentSentimentEntry[] = [
        { actionCode: "VCB", sentiment: "bullish", confidence: 0.75 },
      ];
      const signals = detectPredictionSignals(
        [market],
        [],
        DEFAULT_CONFIG,
        new Set(),
        sentiments,
      );
      const div = signals.find((s) => s.signalType === "sentiment_divergence");
      expect(div).toBeDefined();
    });

    it("sentiment_divergence severity = 'high' when confidence >= 0.7", () => {
      const market = makeMarket({
        id: "m1",
        question: "Will the Fed cut rates in June 2026?",
        yesPrice: 0.70,
        uniqueWalletsCount: 20,
      });
      const sentiments: RecentSentimentEntry[] = [
        { actionCode: "VCB", sentiment: "bullish", confidence: 0.8 },
      ];
      const signals = detectPredictionSignals(
        [market],
        [],
        DEFAULT_CONFIG,
        new Set(),
        sentiments,
      );
      const div = signals.find((s) => s.signalType === "sentiment_divergence");
      expect(div!.severity).toBe("high");
    });

    it("sentiment_divergence severity = 'medium' when confidence < 0.7", () => {
      const market = makeMarket({
        id: "m1",
        question: "Will the Fed cut rates in June 2026?",
        yesPrice: 0.70,
        uniqueWalletsCount: 20,
      });
      const sentiments: RecentSentimentEntry[] = [
        { actionCode: "VCB", sentiment: "bullish", confidence: 0.65 },
      ];
      const signals = detectPredictionSignals(
        [market],
        [],
        DEFAULT_CONFIG,
        new Set(),
        sentiments,
      );
      const div = signals.find((s) => s.signalType === "sentiment_divergence");
      expect(div!.severity).toBe("medium");
    });

    it("does NOT detect sentiment_divergence when yesPrice < 0.65", () => {
      const market = makeMarket({
        id: "m1",
        question: "Will the Fed cut rates in June 2026?",
        yesPrice: 0.60,
        uniqueWalletsCount: 20,
      });
      const sentiments: RecentSentimentEntry[] = [
        { actionCode: "VCB", sentiment: "bullish", confidence: 0.8 },
      ];
      const signals = detectPredictionSignals(
        [market],
        [],
        DEFAULT_CONFIG,
        new Set(),
        sentiments,
      );
      const div = signals.find((s) => s.signalType === "sentiment_divergence");
      expect(div).toBeUndefined();
    });

    it("detects sentiment_divergence for bearish event (yesPrice <= 0.35 = 1 - 0.65)", () => {
      // yesPrice = 0.30 means 70% probability of YES (bad event) → bearish if stocks have bullish sentiment
      const market = makeMarket({
        id: "m1",
        question: "Will the Fed hike rates?",
        yesPrice: 0.30,
        uniqueWalletsCount: 20,
      });
      const sentiments: RecentSentimentEntry[] = [
        { actionCode: "VCB", sentiment: "bullish", confidence: 0.75 },
      ];
      const signals = detectPredictionSignals(
        [market],
        [],
        DEFAULT_CONFIG,
        new Set(),
        sentiments,
      );
      const div = signals.find((s) => s.signalType === "sentiment_divergence");
      expect(div).toBeDefined();
    });

    it("sentiment_divergence downgraded to 'low' when uniqueWalletsCount < minUniqueWallets", () => {
      const market = makeMarket({
        id: "m1",
        question: "Will the Fed cut rates in June 2026?",
        yesPrice: 0.70,
        uniqueWalletsCount: 5, // below minUniqueWallets=10
      });
      const sentiments: RecentSentimentEntry[] = [
        { actionCode: "VCB", sentiment: "bullish", confidence: 0.8 },
      ];
      const signals = detectPredictionSignals(
        [market],
        [],
        DEFAULT_CONFIG,
        new Set(),
        sentiments,
      );
      const div = signals.find((s) => s.signalType === "sentiment_divergence");
      expect(div).toBeDefined();
      expect(div!.severity).toBe("low");
    });
  });

  // ── wash trading filter (wallet downgrade) ────────────────────────────────────

  describe("wash trading / wallet downgrade filter", () => {
    it("downgrades all signals to 'low' when uniqueWalletsCount < minUniqueWallets (= 9)", () => {
      const current = makeMarket({
        id: "m1",
        yesPrice: 0.72,
        volume24h: 75000,
        uniqueWalletsCount: 9, // boundary: 9 < 10 → downgraded
      });
      const previous: PredictionMarket[] = [
        makeMarket({ id: "m1", yesPrice: 0.65, uniqueWalletsCount: 5 }),
      ];
      const signals = detectPredictionSignals(
        [current],
        previous,
        DEFAULT_CONFIG,
        new Set(),
        [],
      );
      expect(signals.length).toBeGreaterThan(0);
      for (const s of signals) {
        expect(s.severity).toBe("low");
      }
    });

    it("does NOT downgrade when uniqueWalletsCount = minUniqueWallets (= 10, boundary)", () => {
      const current = makeMarket({
        id: "m1",
        yesPrice: 0.72,
        volume24h: 75000,
        uniqueWalletsCount: 10, // boundary: 10 >= 10 → NOT downgraded
      });
      const previous: PredictionMarket[] = [
        makeMarket({ id: "m1", yesPrice: 0.65, uniqueWalletsCount: 5 }),
      ];
      const signals = detectPredictionSignals(
        [current],
        previous,
        DEFAULT_CONFIG,
        new Set(),
        [],
      );
      // At least probability_shift should be medium
      const shift = signals.find((s) => s.signalType === "probability_shift");
      expect(shift).toBeDefined();
      expect(shift!.severity).toBe("medium");
    });
  });

  // ── no false positives ────────────────────────────────────────────────────────

  describe("no false positives", () => {
    it("returns [] when prices unchanged and volume below threshold", () => {
      const market = makeMarket({ yesPrice: 0.50, volume24h: 10000 });
      const previous: PredictionMarket[] = [
        makeMarket({ id: market.id, yesPrice: 0.50, uniqueWalletsCount: market.uniqueWalletsCount }),
      ];
      const signals = detectPredictionSignals(
        [market],
        previous,
        DEFAULT_CONFIG,
        new Set(),
        [],
      );
      expect(signals).toEqual([]);
    });

    it("returns [] when current is empty", () => {
      const signals = detectPredictionSignals([], [], DEFAULT_CONFIG, new Set(), []);
      expect(signals).toEqual([]);
    });
  });

  // ── signal metadata ────────────────────────────────────────────────────────────

  describe("signal metadata fields", () => {
    it("includes marketId, marketQuestion, yesPriceCurr, volume24h, detectedAt on every signal", () => {
      const market = makeMarket({ id: "test-id-123", volume24h: 75000 });
      const signals = detectPredictionSignals([market], [], DEFAULT_CONFIG, new Set(), []);
      expect(signals.length).toBeGreaterThan(0);
      const s = signals[0]!;
      expect(s.marketId).toBe("test-id-123");
      expect(s.marketQuestion).toBe(market.question);
      expect(s.yesPriceCurr).toBe(0.50);
      expect(s.volume24h).toBe(75000);
      expect(s.detectedAt).toBeDefined();
      expect(new Date(s.detectedAt).getTime()).not.toBeNaN();
    });

    it("yesPricePrev = null when no previous market exists", () => {
      const market = makeMarket({ volume24h: 75000 });
      const signals = detectPredictionSignals([market], [], DEFAULT_CONFIG, new Set(), []);
      const spike = signals.find((s) => s.signalType === "volume_spike");
      expect(spike!.yesPricePrev).toBeNull();
    });

    it("reasoning is a non-empty string", () => {
      const market = makeMarket({ volume24h: 75000 });
      const signals = detectPredictionSignals([market], [], DEFAULT_CONFIG, new Set(), []);
      expect(signals[0]!.reasoning.length).toBeGreaterThan(0);
    });
  });

  // ── SignalType extension check ────────────────────────────────────────────────

  describe("SignalType extension", () => {
    it("'prediction_market' is a valid SignalType after extension", async () => {
      const { detectSignals } = await import("../domain/services/signalDetector.js");
      // The function should compile without error — just verify import works
      expect(typeof detectSignals).toBe("function");
    });
  });
});
