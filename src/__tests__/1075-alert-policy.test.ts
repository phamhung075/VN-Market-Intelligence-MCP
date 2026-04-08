/**
 * Task 1075 — Alert Policy: computeStopLoss + checkPositionDanger + checkWatchlistOpportunity
 * TDD Red: all tests must FAIL before implementation.
 */

import { describe, it, expect } from "bun:test";
import { computeStopLoss } from "../domain/services/stopLossComputer.js";
import {
  checkPositionDanger,
  checkWatchlistOpportunity,
} from "../domain/services/alertPolicyChecker.js";

// ─────────────────────────────────────────────────────────────────────────────
// computeStopLoss
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1075 — computeStopLoss", () => {
  it("returns max of all three candidates when all are valid", () => {
    // avgCost=100000, atr14=2000, nearestSupport=97000
    // candidates: 100000 - 2*2000 = 96000, support=97000, 100000*0.93=93000
    // max = 97000
    expect(computeStopLoss(100000, 2000, 97000)).toBe(97000);
  });

  it("uses avgCost - 2*atr14 when it is the highest", () => {
    // avgCost=100000, atr14=500, nearestSupport=90000
    // candidates: 100000 - 2*500 = 99000, support=90000, 100000*0.93=93000
    // max = 99000
    expect(computeStopLoss(100000, 500, 90000)).toBe(99000);
  });

  it("uses avgCost*0.93 when it is the highest", () => {
    // avgCost=100000, atr14=10000 (high atr => 100000-20000=80000), nearestSupport=85000
    // 100000*0.93 = 93000, which is the highest
    expect(computeStopLoss(100000, 10000, 85000)).toBe(93000);
  });

  it("falls back to avgCost*0.93 when atr14=0 and nearestSupport=0", () => {
    // Both invalid -> only avgCost*0.93 = Math.round(75000 * 0.93) = 69750
    expect(computeStopLoss(75000, 0, 0)).toBe(69750);
  });

  it("excludes atr14 candidate when atr14<=0 but uses nearestSupport", () => {
    // avgCost=100000, atr14=0, nearestSupport=96000
    // candidates: only support=96000 and 100000*0.93=93000
    // max = 96000
    expect(computeStopLoss(100000, 0, 96000)).toBe(96000);
  });

  it("excludes nearestSupport candidate when nearestSupport<=0 but uses atr14", () => {
    // avgCost=100000, atr14=2000, nearestSupport=0
    // candidates: 100000-4000=96000 and 100000*0.93=93000
    // max = 96000
    expect(computeStopLoss(100000, 2000, 0)).toBe(96000);
  });

  it("rounds result to integer VND", () => {
    // avgCost=10001, atr14=0, nearestSupport=0 -> 10001*0.93 = 9300.93 -> round = 9301
    expect(computeStopLoss(10001, 0, 0)).toBe(9301);
  });

  it("negative atr14 is treated as invalid (<=0)", () => {
    // atr14=-100 -> only avgCost*0.93 and nearestSupport=94000
    // 100000*0.93=93000 vs 94000 -> max=94000
    expect(computeStopLoss(100000, -100, 94000)).toBe(94000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkPositionDanger -- 3-AND gate
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1075 — checkPositionDanger", () => {
  const defaultThresholds = {
    singleDayDropPct: 5.0,
    newsSentimentThreshold: -0.5,
  };

  it("returns fire=true when all 3 conditions are met", () => {
    const result = checkPositionDanger({
      stopLossHit: true,
      singleDayDropPct: 5.5,
      newsSentiment: -0.7,
      thresholds: defaultThresholds,
    });
    expect(result.fire).toBe(true);
  });

  it("returns fire=false when stopLossHit is false", () => {
    const result = checkPositionDanger({
      stopLossHit: false,
      singleDayDropPct: 6.0,
      newsSentiment: -0.8,
      thresholds: defaultThresholds,
    });
    expect(result.fire).toBe(false);
  });

  it("returns fire=false when singleDayDropPct is below threshold", () => {
    const result = checkPositionDanger({
      stopLossHit: true,
      singleDayDropPct: 4.9, // below 5.0
      newsSentiment: -0.9,
      thresholds: defaultThresholds,
    });
    expect(result.fire).toBe(false);
  });

  it("returns fire=false when newsSentiment is above threshold (not negative enough)", () => {
    const result = checkPositionDanger({
      stopLossHit: true,
      singleDayDropPct: 5.5,
      newsSentiment: -0.3, // above -0.5 threshold
      thresholds: defaultThresholds,
    });
    expect(result.fire).toBe(false);
  });

  it("returns fire=false when two conditions met but not third (stopLossHit + drop, no sentiment)", () => {
    const result = checkPositionDanger({
      stopLossHit: true,
      singleDayDropPct: 7.0,
      newsSentiment: 0.1, // positive news
      thresholds: defaultThresholds,
    });
    expect(result.fire).toBe(false);
  });

  it("returns fire=false when only sentiment condition met", () => {
    const result = checkPositionDanger({
      stopLossHit: false,
      singleDayDropPct: 3.0,
      newsSentiment: -0.9,
      thresholds: defaultThresholds,
    });
    expect(result.fire).toBe(false);
  });

  it("fires exactly at threshold boundary -- singleDayDropPct equals threshold", () => {
    const result = checkPositionDanger({
      stopLossHit: true,
      singleDayDropPct: 5.0, // exactly at threshold
      newsSentiment: -0.5, // exactly at threshold
      thresholds: defaultThresholds,
    });
    expect(result.fire).toBe(true);
  });

  it("returns reason string when fire=true", () => {
    const result = checkPositionDanger({
      stopLossHit: true,
      singleDayDropPct: 6.0,
      newsSentiment: -0.6,
      thresholds: defaultThresholds,
    });
    expect(result.fire).toBe(true);
    expect(typeof result.reason).toBe("string");
    expect(result.reason!.length).toBeGreaterThan(0);
  });

  it("uses custom thresholds from config correctly", () => {
    // Stricter: need 7% drop and -0.7 sentiment
    const strictThresholds = { singleDayDropPct: 7.0, newsSentimentThreshold: -0.7 };
    // Would fire with defaults (5%, -0.5) but not with strict
    const result = checkPositionDanger({
      stopLossHit: true,
      singleDayDropPct: 6.0,
      newsSentiment: -0.6,
      thresholds: strictThresholds,
    });
    expect(result.fire).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkWatchlistOpportunity -- 4-AND gate
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1075 — checkWatchlistOpportunity", () => {
  const defaultThresholds = {
    kinhDichConfidenceMin: 70,
    newsSentimentMin: 0.3,
  };

  it("returns fire=true when all 4 conditions are met", () => {
    const result = checkWatchlistOpportunity({
      kinhDichConfidence: 80,
      kinhDichSignal: "BUY",
      newsSentiment: 0.5,
      agentSignalsMajority: "BUY",
      thresholds: defaultThresholds,
    });
    expect(result.fire).toBe(true);
  });

  it("returns fire=false when kinhDichConfidence is below threshold", () => {
    const result = checkWatchlistOpportunity({
      kinhDichConfidence: 65, // below 70
      kinhDichSignal: "BUY",
      newsSentiment: 0.5,
      agentSignalsMajority: "BUY",
      thresholds: defaultThresholds,
    });
    expect(result.fire).toBe(false);
  });

  it("returns fire=false when kinhDichSignal is not BUY", () => {
    const result = checkWatchlistOpportunity({
      kinhDichConfidence: 80,
      kinhDichSignal: "NEUTRAL",
      newsSentiment: 0.5,
      agentSignalsMajority: "BUY",
      thresholds: defaultThresholds,
    });
    expect(result.fire).toBe(false);
  });

  it("returns fire=false when kinhDichSignal is SELL", () => {
    const result = checkWatchlistOpportunity({
      kinhDichConfidence: 80,
      kinhDichSignal: "SELL",
      newsSentiment: 0.5,
      agentSignalsMajority: "BUY",
      thresholds: defaultThresholds,
    });
    expect(result.fire).toBe(false);
  });

  it("returns fire=false when newsSentiment is below threshold", () => {
    const result = checkWatchlistOpportunity({
      kinhDichConfidence: 80,
      kinhDichSignal: "BUY",
      newsSentiment: 0.2, // below 0.3
      agentSignalsMajority: "BUY",
      thresholds: defaultThresholds,
    });
    expect(result.fire).toBe(false);
  });

  it("returns fire=false when agentSignalsMajority is not BUY", () => {
    const result = checkWatchlistOpportunity({
      kinhDichConfidence: 80,
      kinhDichSignal: "BUY",
      newsSentiment: 0.5,
      agentSignalsMajority: "NEUTRAL",
      thresholds: defaultThresholds,
    });
    expect(result.fire).toBe(false);
  });

  it("fires exactly at threshold boundaries", () => {
    const result = checkWatchlistOpportunity({
      kinhDichConfidence: 70, // exactly at min
      kinhDichSignal: "BUY",
      newsSentiment: 0.3, // exactly at min
      agentSignalsMajority: "BUY",
      thresholds: defaultThresholds,
    });
    expect(result.fire).toBe(true);
  });

  it("returns reason string when fire=true", () => {
    const result = checkWatchlistOpportunity({
      kinhDichConfidence: 75,
      kinhDichSignal: "BUY",
      newsSentiment: 0.4,
      agentSignalsMajority: "BUY",
      thresholds: defaultThresholds,
    });
    expect(result.fire).toBe(true);
    expect(typeof result.reason).toBe("string");
    expect(result.reason!.length).toBeGreaterThan(0);
  });

  it("returns fire=false when three conditions met but kinhDich=SELL", () => {
    const result = checkWatchlistOpportunity({
      kinhDichConfidence: 85,
      kinhDichSignal: "SELL",
      newsSentiment: 0.6,
      agentSignalsMajority: "BUY",
      thresholds: defaultThresholds,
    });
    expect(result.fire).toBe(false);
  });

  it("uses custom thresholds from config correctly", () => {
    // Looser: only need 60% confidence and 0.2 sentiment
    const laxThresholds = { kinhDichConfidenceMin: 60, newsSentimentMin: 0.2 };
    const result = checkWatchlistOpportunity({
      kinhDichConfidence: 65,
      kinhDichSignal: "BUY",
      newsSentiment: 0.25,
      agentSignalsMajority: "BUY",
      thresholds: laxThresholds,
    });
    expect(result.fire).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Config integration -- alertPolicy section loaded from mcp.config.json
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1075 — alertPolicy config", () => {
  it("loadMcpConfig exposes alertPolicy section with expected defaults", async () => {
    const { loadMcpConfig } = await import("../infrastructure/config.js");
    const cfg = loadMcpConfig();
    const ap = (cfg as unknown as Record<string, unknown>).alertPolicy as Record<string, unknown> | undefined;
    expect(ap).toBeDefined();
    if (ap) {
      const pd = ap.positionDanger as Record<string, unknown>;
      expect(pd.singleDayDropPct).toBe(5);
      expect(pd.newsSentimentBelow).toBe(-0.5);
      expect(pd.requireAllConditions).toBe(true);

      const wo = ap.watchlistOpportunity as Record<string, unknown>;
      expect(wo.kinhDichConfidenceMin).toBe(70);
      expect(wo.kinhDichSignalMustBe).toBe("BUY");
      expect(wo.newsSentimentMin).toBe(0.3);
      expect(wo.agentSignalsMajority).toBe("BUY");

      expect(ap.alertCooldownMinutes).toBe(0);
    }
  });
});
