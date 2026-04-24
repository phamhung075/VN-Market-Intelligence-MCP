// apps/mcp-server/src/__tests__/1328f-suppression-reasons.test.ts
import { describe, it, expect } from "bun:test";
import {
  checkPositionDanger,
  checkWatchlistOpportunity,
} from "../domain/services/alertPolicyChecker.js";

const PD_THRESHOLDS = { singleDayDropPct: 5.0, newsSentimentThreshold: -0.5 };
const WO_THRESHOLDS = { kinhDichConfidenceMin: 70, newsSentimentMin: 0.3 };

// ─────────────────────────────────────────────────────────────────────────────
// checkPositionDanger — suppressionReasons
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1328f — checkPositionDanger suppressionReasons", () => {
  it("stopLossHit=false only fails → failedConditions contains 'stopLossHit=false'", () => {
    const result = checkPositionDanger({
      stopLossHit: false,
      singleDayDropPct: 6.0,
      newsSentiment: -0.7,
      thresholds: PD_THRESHOLDS,
    });
    expect(result.fire).toBe(false);
    expect(result.suppressionReasons).toBeDefined();
    expect(result.suppressionReasons!.rule).toBe("position_danger_3and");
    expect(result.suppressionReasons!.failedConditions).toEqual(["stopLossHit=false"]);
  });

  it("singleDayDropPct below threshold → failedConditions contains drop line", () => {
    const result = checkPositionDanger({
      stopLossHit: true,
      singleDayDropPct: 3.2,
      newsSentiment: -0.7,
      thresholds: PD_THRESHOLDS,
    });
    expect(result.fire).toBe(false);
    expect(result.suppressionReasons!.failedConditions).toEqual([
      "singleDayDropPct=3.2 (threshold=5)",
    ]);
  });

  it("all 3 conditions fail → failedConditions length = 3", () => {
    const result = checkPositionDanger({
      stopLossHit: false,
      singleDayDropPct: 2.0,
      newsSentiment: 0.1,
      thresholds: PD_THRESHOLDS,
    });
    expect(result.fire).toBe(false);
    expect(result.suppressionReasons!.failedConditions).toHaveLength(3);
  });

  it("all 3 pass → fire=true, no suppressionReasons", () => {
    const result = checkPositionDanger({
      stopLossHit: true,
      singleDayDropPct: 6.0,
      newsSentiment: -0.7,
      thresholds: PD_THRESHOLDS,
    });
    expect(result.fire).toBe(true);
    expect(result.suppressionReasons).toBeUndefined();
    expect(result.reason).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkWatchlistOpportunity — suppressionReasons
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1328f — checkWatchlistOpportunity suppressionReasons", () => {
  it("kinhDichSignal=NEUTRAL fails → failedConditions contains 'kinhDichSignal=NEUTRAL (expected=BUY)'", () => {
    const result = checkWatchlistOpportunity({
      kinhDichConfidence: 80,
      kinhDichSignal: "NEUTRAL",
      newsSentiment: 0.5,
      agentSignalsMajority: "BUY",
      thresholds: WO_THRESHOLDS,
    });
    expect(result.fire).toBe(false);
    expect(result.suppressionReasons).toBeDefined();
    expect(result.suppressionReasons!.rule).toBe("watchlist_opportunity_4and");
    expect(result.suppressionReasons!.failedConditions).toContain(
      "kinhDichSignal=NEUTRAL (expected=BUY)"
    );
  });

  it("2 of 4 conditions fail → failedConditions length = 2", () => {
    const result = checkWatchlistOpportunity({
      kinhDichConfidence: 50,  // fails (< 70)
      kinhDichSignal: "NEUTRAL",  // fails
      newsSentiment: 0.5,
      agentSignalsMajority: "BUY",
      thresholds: WO_THRESHOLDS,
    });
    expect(result.fire).toBe(false);
    expect(result.suppressionReasons!.failedConditions).toHaveLength(2);
  });

  it("all 4 pass → fire=true, no suppressionReasons", () => {
    const result = checkWatchlistOpportunity({
      kinhDichConfidence: 80,
      kinhDichSignal: "BUY",
      newsSentiment: 0.5,
      agentSignalsMajority: "BUY",
      thresholds: WO_THRESHOLDS,
    });
    expect(result.fire).toBe(true);
    expect(result.suppressionReasons).toBeUndefined();
    expect(result.reason).toBeDefined();
  });
});
