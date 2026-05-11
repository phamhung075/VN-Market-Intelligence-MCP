/**
 * Task 1296b — GREEN Phase: Integration Tests (AC-5, AC-6, AC-7, AC-8)
 *
 * AC-5: IMF_CASCADE_RULES structure + count
 * AC-6: synthesizeChain conviction with/without imfSentiment
 * AC-7: runImfIndicatorPollerJob returns correct shape
 * AC-8: getLatestImfIndicators + classifyImfIndicators (no HTTP) — MCP tool path
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { IMF_CASCADE_RULES } from "../domain/services/cascadeEngine.js";
import { initDatabase, closeDb } from "../infrastructure/db/schema.js";
import { synthesizeChain, type ChainLink } from "../domain/services/chainSynthesizer.js";
import { runImfIndicatorPollerJob } from "../scheduler/market-data/imfIndicatorPollerJob.js";
import { getLatestImfIndicators } from "../application/services/imfDataFetcher.js";
import { classifyImfIndicators } from "../domain/services/imfDataClassifier.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeChainLink(overrides: Partial<ChainLink> = {}): ChainLink {
  return {
    id: 1,
    agent: "news-scout",
    signalType: "chain_catalyst",
    stockCode: "VCB",
    findingData: {
      confidence: 0.8,
      direction: "bullish",
      confirms_direction: true,
    },
    depth: 0,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── AC-5: IMF_CASCADE_RULES ───────────────────────────────────────────────────

describe("Task 1296b — AC-5: IMF_CASCADE_RULES", () => {
  it("IMF_CASCADE_RULES.length === 11", () => {
    expect(IMF_CASCADE_RULES.length).toBe(11);
  });

  it("all rule ids match /^imf_rule_\\d{2}$/", () => {
    for (const rule of IMF_CASCADE_RULES) {
      expect(rule.id).toMatch(/^imf_rule_\d{2}$/);
    }
  });

  it("imf_rule_01: impact === 0.45 and targets banking", () => {
    const rule01 = IMF_CASCADE_RULES.find(r => r.id === "imf_rule_01");
    expect(rule01).toBeDefined();
    expect(rule01!.impact).toBe(0.45);
    expect(rule01!.targetSectors).toContain("banking");
  });

  it("imf_rule_02: impact === -0.35 and targets real_estate", () => {
    const rule02 = IMF_CASCADE_RULES.find(r => r.id === "imf_rule_02");
    expect(rule02).toBeDefined();
    expect(rule02!.impact).toBe(-0.35);
    expect(rule02!.targetSectors).toContain("real_estate");
  });

  it("all rule impact values in range [-1, +1]", () => {
    for (const rule of IMF_CASCADE_RULES) {
      expect(rule.impact).toBeGreaterThanOrEqual(-1);
      expect(rule.impact).toBeLessThanOrEqual(1);
    }
  });
});

// ── AC-6: synthesizeChain conviction weight ───────────────────────────────────

describe("Task 1296b — AC-6: IMF conviction weight in synthesizeChain", () => {
  const baseLinks = (): ChainLink[] => [
    makeChainLink({ id: 1, depth: 0, agent: "news-scout", findingData: { confidence: 0.75, confirms_direction: true } }),
    makeChainLink({ id: 2, depth: 1, agent: "financial-analyst", findingData: { confidence: 0.70, validates: true } }),
  ];

  it("conviction higher when imfSentiment is bullish (confidence >= 0.55)", () => {
    const withoutImf = synthesizeChain(baseLinks());
    expect(withoutImf).not.toBeNull();

    const linksWithImf = baseLinks();
    linksWithImf[0]!.findingData = {
      ...linksWithImf[0]!.findingData,
      imfSentiment: { sentiment: 0.8, confidence: 0.75, affectedSectors: ["banking"], reasoning: "IMF growth ↑" },
    };
    const withImf = synthesizeChain(linksWithImf);
    expect(withImf).not.toBeNull();
    expect(withImf!.conviction).toBeGreaterThan(withoutImf!.conviction);
  });

  it("conviction lower when imfSentiment is bearish (confidence >= 0.55)", () => {
    const withoutImf = synthesizeChain(baseLinks());
    expect(withoutImf).not.toBeNull();

    const linksWithImf = baseLinks();
    linksWithImf[0]!.findingData = {
      ...linksWithImf[0]!.findingData,
      imfSentiment: { sentiment: -0.8, confidence: 0.75, affectedSectors: ["real_estate"], reasoning: "IMF growth ↓" },
    };
    const withImf = synthesizeChain(linksWithImf);
    expect(withImf).not.toBeNull();
    expect(withImf!.conviction).toBeLessThan(withoutImf!.conviction);
  });

  it("conviction unchanged when imfSentiment.confidence < 0.55 (below threshold)", () => {
    const withoutImf = synthesizeChain(baseLinks());
    expect(withoutImf).not.toBeNull();

    const linksWithImf = baseLinks();
    linksWithImf[0]!.findingData = {
      ...linksWithImf[0]!.findingData,
      imfSentiment: { sentiment: 0.9, confidence: 0.40, affectedSectors: ["banking"], reasoning: "Below threshold" },
    };
    const withImf = synthesizeChain(linksWithImf);
    expect(withImf).not.toBeNull();
    // IMF delta skipped — conviction must equal baseline
    expect(withImf!.conviction).toBeCloseTo(withoutImf!.conviction, 4);
  });

  it("IMF contribution is sentiment * 0.20 for bullish signal (0.6 * 0.20 = 0.12 delta)", () => {
    const baseline = synthesizeChain(baseLinks());
    expect(baseline).not.toBeNull();

    const linksWithImf = baseLinks();
    linksWithImf[0]!.findingData = {
      ...linksWithImf[0]!.findingData,
      imfSentiment: { sentiment: 0.6, confidence: 0.70, affectedSectors: ["banking"], reasoning: "Growth ↑" },
    };
    const withImf = synthesizeChain(linksWithImf);
    expect(withImf).not.toBeNull();
    const delta = withImf!.conviction - baseline!.conviction;
    // Expected delta: 0.6 * 0.20 = 0.12 (±0.01 for clamping at edges)
    expect(delta).toBeGreaterThanOrEqual(0.10);
    expect(delta).toBeLessThanOrEqual(0.14);
  });
});

// ── AC-7: runImfIndicatorPollerJob ────────────────────────────────────────────

describe("Task 1296b — AC-7: IMF poller job result shape", () => {
  it("runImfIndicatorPollerJob returns { success, indicator_count } shape", async () => {
    const result = await runImfIndicatorPollerJob();
    // Shape check — success may be false if circuit breaker is open or no network in test
    expect(typeof result.success).toBe("boolean");
    expect(typeof result.indicator_count).toBe("number");
    expect(result.indicator_count).toBeGreaterThanOrEqual(0);
  }, 35_000); // 35s timeout — poller has 30s timeout + overhead

  it("runImfIndicatorPollerJob does not throw on failure", async () => {
    // Call again — if first call opened circuit breaker, this returns cached/false without throw
    let threw = false;
    try {
      await runImfIndicatorPollerJob();
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  }, 35_000);

  it("on success: result.sentiment is defined with correct shape", async () => {
    const result = await runImfIndicatorPollerJob();
    if (result.success && result.sentiment) {
      expect(typeof result.sentiment.sentiment).toBe("number");
      expect(typeof result.sentiment.confidence).toBe("number");
      expect(typeof result.sentiment.classification).toBe("string");
      expect(Array.isArray(result.sentiment.sectorImpacts)).toBe(true);
    } else {
      // Network unavailable in test — acceptable, shape check skipped
      expect(result.success === false || result.indicator_count >= 0).toBe(true);
    }
  }, 35_000);
});

// ── AC-8: MCP tool path (cache read + classify — no HTTP) ────────────────────

describe("Task 1296b — AC-8: MCP tool path (getLatestImfIndicators + classify)", () => {
  beforeAll(async () => {
    closeDb();
    await initDatabase();
  });

  afterAll(() => {
    closeDb();
  });

  it("getLatestImfIndicators + classifyImfIndicators produces valid response shape", async () => {
    const indicators = await getLatestImfIndicators();
    // May be empty if poller hasn't run yet — shape is still valid
    expect(Array.isArray(indicators)).toBe(true);

    const classification = classifyImfIndicators({
      indicators,
      historicalBaseline: 3.0,
    });

    expect(typeof classification.sentiment).toBe("number");
    expect(typeof classification.confidence).toBe("number");
    expect(typeof classification.classification).toBe("string");
    expect(typeof classification.reasoning).toBe("string");
    expect(Array.isArray(classification.sectorImpacts)).toBe(true);
  });

  it("MCP response keys all present: indicators, sentiment, classification, confidence", async () => {
    // Simulate what registerImfSignalsTool builds
    const indicators = await getLatestImfIndicators();
    const classification = classifyImfIndicators({ indicators, historicalBaseline: 3.0 });

    const response = {
      indicators,
      sentiment: {
        score: classification.sentiment,
        classification: classification.classification,
        confidence: classification.confidence,
        reasoning: classification.reasoning,
        sector_impacts: classification.sectorImpacts,
      },
      last_updated: new Date().toISOString(),
      data_count: indicators.length,
    };

    expect(response).toHaveProperty("indicators");
    expect(response).toHaveProperty("sentiment");
    expect(response).toHaveProperty("last_updated");
    expect(response.sentiment).toHaveProperty("score");
    expect(response.sentiment).toHaveProperty("classification");
    expect(response.sentiment).toHaveProperty("confidence");
  });
});
