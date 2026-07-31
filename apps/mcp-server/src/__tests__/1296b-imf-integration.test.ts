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
import type { ImfIndicator, ImfClassificationOutput } from "../domain/models/imfIndicators.js";

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

// FIX-CI-IMF-INTEGRATION-TEST-NONHERMETIC-LIVE-API: AC-7 must never reach the
// live IMF API from CI (was the root cause of the CI-red — see
// runImfIndicatorPollerJob() default fetchFn, a26653ff2 / run 30639708394).
// Mock at the poller's DI seam (fetchFn/storeFn/classifyFn — same seam already
// exercised by 1353a-imf-indicator-poller-job-gaps.test.ts) instead of calling
// the network-backed default.
function mockImfIndicator(overrides: Partial<ImfIndicator> = {}): ImfIndicator {
  return {
    code: "NGDP_RPCH",
    name: "Global GDP Growth (%)",
    value: 3.1,
    publishedAt: "2026-01-01T00:00:00Z",
    ageInDays: 5,
    previousValue: 3.0,
    yoyChange: 0.1,
    source: "imf_api",
    confidence: 0.95,
    ...overrides,
  };
}

function mockImfClassification(overrides: Partial<ImfClassificationOutput> = {}): ImfClassificationOutput {
  return {
    sentiment: 0.35,
    confidence: 0.8,
    classification: "imf_bullish",
    reasoning: "Mock reasoning — no live IMF API call",
    sectorImpacts: [],
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
  // NOTE: the default fetchFn (fetchLatestImfIndicators) hits the live IMF
  // DataMapper API and is deliberately NOT exercised here — CI must be
  // hermetic. Every call below supplies fetchFn/storeFn/classifyFn via the
  // poller's DI seam (ImfPollerOptions) so the network never leaves the
  // process. Real-network behaviour is covered separately by
  // 1353a-imf-indicator-poller-job-gaps.test.ts (also DI-mocked) and manually
  // via the live scheduler in production.

  it("runImfIndicatorPollerJob returns { success, indicator_count } shape (mocked — no live IMF API)", async () => {
    const result = await runImfIndicatorPollerJob({
      fetchFn: async () => [mockImfIndicator()],
      storeFn: async () => {},
      classifyFn: () => mockImfClassification(),
    });
    expect(typeof result.success).toBe("boolean");
    expect(typeof result.indicator_count).toBe("number");
    expect(result.indicator_count).toBeGreaterThanOrEqual(0);
  });

  it("runImfIndicatorPollerJob does not throw on failure (mocked fetchFn rejection)", async () => {
    // Simulate a fetch-boundary failure (network unreachable / circuit breaker
    // open) without touching the network — outer try/catch must absorb it.
    let threw = false;
    try {
      await runImfIndicatorPollerJob({
        fetchFn: async () => { throw new Error("simulated IMF API unreachable"); },
        storeFn: async () => { throw new Error("storeFn must not be called"); },
        classifyFn: () => { throw new Error("classifyFn must not be called"); },
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });

  it("on success: result.sentiment is defined with correct shape (mocked)", async () => {
    const result = await runImfIndicatorPollerJob({
      fetchFn: async () => [mockImfIndicator()],
      storeFn: async () => {},
      classifyFn: () => mockImfClassification(),
    });
    expect(result.success).toBe(true);
    expect(result.sentiment).toBeDefined();
    expect(typeof result.sentiment!.sentiment).toBe("number");
    expect(typeof result.sentiment!.confidence).toBe("number");
    expect(typeof result.sentiment!.classification).toBe("string");
    expect(Array.isArray(result.sentiment!.sectorImpacts)).toBe(true);
  });
});

// ── AC-8: MCP tool path (cache read + classify — no HTTP) ────────────────────
// FIX-CI-IMF-INTEGRATION-TEST-NONHERMETIC-LIVE-API: getLatestImfIndicators()
// reads the local SQLite cache only (see application/services/imfDataFetcher.ts
// — no fetch() call) and classifyImfIndicators() is pure domain logic. This
// describe is already hermetic; confirmed by inspection, not just assumed.

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
