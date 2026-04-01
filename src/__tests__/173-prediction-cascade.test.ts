/**
 * Task 173 — Prediction Cascade Wiring
 *
 * Tests that HIGH/CRITICAL prediction signals are converted into AnalysisEntry
 * objects and fed through buildCausalChain, producing WatchlistImpact[] that
 * flow into the standard alert pipeline.
 *
 * Covers:
 *   1. buildPredictionEntry() converts a HIGH PredictionSignal → AnalysisEntry
 *   2. buildPredictionEntry() converts a CRITICAL PredictionSignal → AnalysisEntry
 *   3. buildPredictionEntry() sets correct sentiment from yesPrice
 *   4. buildPredictionEntry() sets low/medium signals' entry correctly (still
 *      builds but won't be fed to cascade — logic in caller)
 *   5. runPredictionImpactChain() returns CausalChain for HIGH signal
 *   6. runPredictionImpactChain() skips signals below HIGH severity
 *   7. runPredictionImpactChain() handles empty signal array
 *   8. runPredictionImpactChain() accumulates results from multiple HIGH/CRITICAL signals
 *   9. Integration: prediction with oil keywords → oil_gas domain → GAS watchlist impact
 *  10. Integration: prediction with Fed rate keywords → banking domain → VCB watchlist impact
 */

import { describe, it, expect } from "bun:test";
import {
  buildPredictionEntry,
  runPredictionImpactChain,
} from "../application/usecases/runPredictionImpactChain.js";
import type { PredictionSignal } from "../domain/services/predictionSignalDetector.js";
import type { WatchlistEntry } from "../domain/services/cascadeEngine.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const HIGH_OIL_SIGNAL: PredictionSignal = {
  marketId: "cond-oil-001",
  marketQuestion: "Will oil price rise above $100 per barrel by end of Q2?",
  signalType: "probability_shift",
  severity: "high",
  yesPricePrev: 0.42,
  yesPriceCurr: 0.68,
  volume24h: 150000,
  uniqueWalletsCount: 45,
  confidence: 0.78,
  reasoning: "Probability shifted +26pp on OPEC+ announcement",
  detectedAt: "2026-04-01T08:00:00.000Z",
};

const CRITICAL_FED_SIGNAL: PredictionSignal = {
  marketId: "cond-fed-002",
  marketQuestion: "Will the Federal Reserve cut interest rates in May 2026?",
  signalType: "volume_spike",
  severity: "critical",
  yesPricePrev: 0.55,
  yesPriceCurr: 0.35,
  volume24h: 500000,
  uniqueWalletsCount: 120,
  confidence: 0.92,
  reasoning: "Volume spike $500k on Fed hawkish statement",
  detectedAt: "2026-04-01T09:00:00.000Z",
};

const LOW_SIGNAL: PredictionSignal = {
  marketId: "cond-low-003",
  marketQuestion: "Will VN-Index reach 1300 by end of year?",
  signalType: "volume_spike",
  severity: "low",
  yesPricePrev: null,
  yesPriceCurr: 0.5,
  volume24h: 10000,
  uniqueWalletsCount: 5,
  confidence: 0.3,
  reasoning: "Minor volume",
  detectedAt: "2026-04-01T09:30:00.000Z",
};

const MEDIUM_SIGNAL: PredictionSignal = {
  marketId: "cond-med-004",
  marketQuestion: "Will gold price exceed $3000 in 2026?",
  signalType: "probability_shift",
  severity: "medium",
  yesPricePrev: 0.48,
  yesPriceCurr: 0.56,
  volume24h: 30000,
  uniqueWalletsCount: 20,
  confidence: 0.55,
  reasoning: "Moderate probability shift",
  detectedAt: "2026-04-01T10:00:00.000Z",
};

const WATCHLIST: WatchlistEntry[] = [
  { actionCode: "GAS", domain: "oil_gas", exchange: "HOSE" },
  { actionCode: "VCB", domain: "banking", exchange: "HOSE" },
  { actionCode: "FPT", domain: "tech", exchange: "HOSE" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 173 — Prediction Cascade Wiring", () => {
  // ── buildPredictionEntry ────────────────────────────────────────────────

  describe("buildPredictionEntry()", () => {
    it("1. converts a HIGH PredictionSignal into a valid AnalysisEntry", () => {
      const entry = buildPredictionEntry(HIGH_OIL_SIGNAL);

      expect(entry.id).toMatch(/^pred-/);
      expect(entry.sourceType).toBe("prediction_market");
      expect(entry.sourceTitle).toBe(HIGH_OIL_SIGNAL.marketQuestion);
      expect(entry.summary).toContain(HIGH_OIL_SIGNAL.reasoning);
      expect(entry.confidence).toBe(HIGH_OIL_SIGNAL.confidence);
      expect(entry.impactScore).toBeGreaterThanOrEqual(1);
      expect(entry.impactScore).toBeLessThanOrEqual(10);
      expect(entry.level).toBe("global");
      expect(entry.affectedDomains).toBeInstanceOf(Array);
      expect(entry.affectedActions).toBeInstanceOf(Array);
      expect(entry.publishedAt).toBe(HIGH_OIL_SIGNAL.detectedAt);
    });

    it("2. converts a CRITICAL PredictionSignal into a valid AnalysisEntry", () => {
      const entry = buildPredictionEntry(CRITICAL_FED_SIGNAL);

      expect(entry.id).toMatch(/^pred-/);
      expect(entry.sourceType).toBe("prediction_market");
      expect(entry.impactScore).toBeGreaterThanOrEqual(7); // CRITICAL → high impact score
    });

    it("3. sets sentiment bearish when yesPriceCurr >= 0.6", () => {
      // yesPrice >= 0.6 means the "bad" event is likely → bearish for VN market
      const entry = buildPredictionEntry(HIGH_OIL_SIGNAL); // yesPrice=0.68
      expect(entry.sentiment).toBe("bearish");
    });

    it("3b. sets sentiment bullish when yesPriceCurr <= 0.4", () => {
      // yesPrice <= 0.4 means the "negative" event is unlikely → bullish
      const entry = buildPredictionEntry(CRITICAL_FED_SIGNAL); // yesPrice=0.35
      expect(entry.sentiment).toBe("bullish");
    });

    it("3c. sets sentiment neutral when yesPriceCurr is between 0.4 and 0.6", () => {
      const neutralSignal: PredictionSignal = {
        ...HIGH_OIL_SIGNAL,
        yesPriceCurr: 0.5,
        marketId: "cond-neutral",
      };
      const entry = buildPredictionEntry(neutralSignal);
      expect(entry.sentiment).toBe("neutral");
    });

    it("4. builds entry even for low/medium signals (filtering is caller's job)", () => {
      const lowEntry = buildPredictionEntry(LOW_SIGNAL);
      const medEntry = buildPredictionEntry(MEDIUM_SIGNAL);

      expect(lowEntry.id).toMatch(/^pred-/);
      expect(medEntry.id).toMatch(/^pred-/);
    });

    it("4b. embeds conditionId in entry.id", () => {
      const entry = buildPredictionEntry(HIGH_OIL_SIGNAL);
      expect(entry.id).toContain(HIGH_OIL_SIGNAL.marketId);
    });
  });

  // ── runPredictionImpactChain ─────────────────────────────────────────────

  describe("runPredictionImpactChain()", () => {
    it("5. returns CausalChain array for a single HIGH signal", async () => {
      const chains = await runPredictionImpactChain({
        signals: [HIGH_OIL_SIGNAL],
        watchlist: WATCHLIST,
        ragRetriever: async () => [],
      });

      expect(chains).toBeInstanceOf(Array);
      expect(chains.length).toBe(1);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(chains[0]!.seedTitle).toBe(HIGH_OIL_SIGNAL.marketQuestion);
    });

    it("6. skips signals below HIGH severity (low, medium)", async () => {
      const chains = await runPredictionImpactChain({
        signals: [LOW_SIGNAL, MEDIUM_SIGNAL],
        watchlist: WATCHLIST,
        ragRetriever: async () => [],
      });

      expect(chains).toBeInstanceOf(Array);
      expect(chains.length).toBe(0);
    });

    it("7. returns empty array when signal array is empty", async () => {
      const chains = await runPredictionImpactChain({
        signals: [],
        watchlist: WATCHLIST,
        ragRetriever: async () => [],
      });

      expect(chains).toBeInstanceOf(Array);
      expect(chains.length).toBe(0);
    });

    it("8. accumulates results from multiple HIGH/CRITICAL signals", async () => {
      const chains = await runPredictionImpactChain({
        signals: [HIGH_OIL_SIGNAL, CRITICAL_FED_SIGNAL, LOW_SIGNAL],
        watchlist: WATCHLIST,
        ragRetriever: async () => [],
      });

      // Should have 2 chains: HIGH + CRITICAL only (LOW is skipped)
      expect(chains.length).toBe(2);
    });

    it("9. oil price signal cascades to oil_gas domain → GAS watchlist impact", async () => {
      const chains = await runPredictionImpactChain({
        signals: [HIGH_OIL_SIGNAL],
        watchlist: WATCHLIST,
        ragRetriever: async () => [],
      });

      expect(chains.length).toBe(1);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const chain = chains[0]!;

      // Should have some watchlist impacts since the entry includes oil_gas
      // domain in affectedDomains (mapPredictionToVn fires R03 for oil price rise)
      const impacts = chain.watchlistImpacts;
      expect(impacts).toBeInstanceOf(Array);
      // GAS is in watchlist with domain oil_gas
      const gasImpact = impacts.find((i) => i.actionCode === "GAS");
      expect(gasImpact).toBeDefined();
    });

    it("10. Fed rate cut signal cascades to banking domain → VCB watchlist impact", async () => {
      const chains = await runPredictionImpactChain({
        signals: [CRITICAL_FED_SIGNAL],
        watchlist: WATCHLIST,
        ragRetriever: async () => [],
      });

      expect(chains.length).toBe(1);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const chain = chains[0]!;

      const impacts = chain.watchlistImpacts;
      const vcbImpact = impacts.find((i) => i.actionCode === "VCB");
      expect(vcbImpact).toBeDefined();
    });
  });
});
