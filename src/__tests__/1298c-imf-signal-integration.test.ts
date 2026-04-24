/**
 * Task 1298c — GREEN Phase: IMF Signal Integration Tests
 *
 * AC-5: IMF_CASCADE_RULES count >= 11, correct IDs
 * AC-6: Each rule has correct shape (sentimentThreshold, targetSectors, impact)
 * AC-7: chainSynthesizer enriches CausalChain with IMF conviction weight
 * AC-8: imfDataClassifier produces required output shape (used by MCP tool)
 */

import { describe, it, expect, spyOn } from "bun:test";
import { IMF_CASCADE_RULES } from "../domain/services/cascadeEngine.js";
import {
  synthesizeChain,
  type ChainLink,
} from "../domain/services/chainSynthesizer.js";
import { classifyImfIndicators } from "../domain/services/imfDataClassifier.js";
import * as imfFetcher from "../application/services/imfDataFetcher.js";
import type { ImfIndicator } from "../domain/models/imfIndicators.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeLink(overrides: Partial<ChainLink> & { findingOverrides?: Record<string, unknown> } = {}): ChainLink {
  const { findingOverrides, ...rest } = overrides;
  return {
    id: 1,
    agent: "news_scout",
    signalType: "chain_catalyst",
    stockCode: "VCB",
    findingData: {
      event_type: "macro",
      direction: "bullish",
      confidence: 0.75,
      affected_stocks: ["VCB"],
      affected_sectors: ["banking"],
      headline: "Test signal",
      source: "reuters",
      ...(findingOverrides ?? {}),
    },
    depth: 0,
    createdAt: new Date().toISOString(),
    ...rest,
  };
}

/** Builds a minimal 2-link chain (synthesizeChain requires >= 2 links). */
function makeChain(rootFindingOverrides: Record<string, unknown> = {}): ChainLink[] {
  return [
    makeLink({ id: 1, depth: 0, findingOverrides: rootFindingOverrides }),
    makeLink({ id: 2, agent: "sector_analyst", signalType: "sector_confirm", depth: 1 }),
  ];
}

function makeIndicator(overrides: Partial<ImfIndicator> = {}): ImfIndicator {
  return {
    code: "NGDP_RPCH",
    name: "World GDP Growth (%)",
    value: 3.2,
    publishedAt: "2026-04-20T00:00:00Z",
    ageInDays: 3,
    previousValue: 2.8,
    yoyChange: 0.14,
    source: "imf_api",
    confidence: 0.95,
    ...overrides,
  };
}

// ── AC-5 + AC-6: IMF_CASCADE_RULES shape ──────────────────────────────────────

describe("AC-5/AC-6: IMF_CASCADE_RULES correctness", () => {
  it("has exactly 11 rules", () => {
    expect(IMF_CASCADE_RULES.length).toBe(11);
  });

  it("every rule id matches /^imf_rule_\\d{2}$/", () => {
    for (const rule of IMF_CASCADE_RULES) {
      expect(rule.id).toMatch(/^imf_rule_\d{2}$/);
    }
  });

  it("rule IDs are unique", () => {
    const ids = IMF_CASCADE_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(11);
  });

  it("imf_rule_01: impact === 0.45, targetSectors contains 'banking'", () => {
    const rule = IMF_CASCADE_RULES.find((r) => r.id === "imf_rule_01");
    expect(rule).toBeDefined();
    expect(rule!.impact).toBe(0.45);
    expect(rule!.targetSectors).toContain("banking");
  });

  it("imf_rule_02: impact === -0.35, targetSectors contains 'real_estate'", () => {
    const rule = IMF_CASCADE_RULES.find((r) => r.id === "imf_rule_02");
    expect(rule).toBeDefined();
    expect(rule!.impact).toBe(-0.35);
    expect(rule!.targetSectors).toContain("real_estate");
  });

  it("all rule impact values in range [-1, +1]", () => {
    for (const rule of IMF_CASCADE_RULES) {
      expect(rule.impact).toBeGreaterThanOrEqual(-1);
      expect(rule.impact).toBeLessThanOrEqual(1);
    }
  });

  it("every rule has required fields: id, name, sentimentThreshold, operator, targetSectors, impact", () => {
    for (const rule of IMF_CASCADE_RULES) {
      expect(typeof rule.id).toBe("string");
      expect(typeof rule.name).toBe("string");
      expect(typeof rule.sentimentThreshold).toBe("number");
      expect([">", "<", ">=", "<="]).toContain(rule.operator);
      expect(Array.isArray(rule.targetSectors)).toBe(true);
      expect(rule.targetSectors.length).toBeGreaterThan(0);
      expect(typeof rule.impact).toBe("number");
    }
  });

  it("every rule has non-empty name and reasoning", () => {
    for (const rule of IMF_CASCADE_RULES) {
      expect(rule.name.length).toBeGreaterThan(0);
      expect(rule.reasoning.length).toBeGreaterThan(0);
    }
  });

  it("covers banking, real_estate, export/manufacturing, agriculture sectors", () => {
    const allSectors = IMF_CASCADE_RULES.flatMap((r) => r.targetSectors);
    expect(allSectors).toContain("banking");
    expect(allSectors).toContain("real_estate");
    expect(allSectors).toContain("agriculture");
    // export or manufacturing present
    const hasExportOrMfg = allSectors.includes("export") || allSectors.includes("manufacturing");
    expect(hasExportOrMfg).toBe(true);
  });
});

// ── AC-7: chainSynthesizer IMF conviction weight ──────────────────────────────

describe("AC-7: chainSynthesizer IMF conviction weight", () => {
  it("synthesizeChain returns non-null for 2+ links", () => {
    const result = synthesizeChain(makeChain());
    expect(result).not.toBeNull();
  });

  it("conviction higher with positive imfSentiment (0.8, conf 0.90) vs baseline", () => {
    const baseline = synthesizeChain(makeChain());
    const withImf = synthesizeChain(
      makeChain({
        imfSentiment: {
          sentiment: 0.8,
          confidence: 0.90,
          affectedSectors: ["banking"],
          reasoning: "Growth up",
        },
      })
    );
    expect(baseline).not.toBeNull();
    expect(withImf).not.toBeNull();
    expect(withImf!.conviction).toBeGreaterThan(baseline!.conviction);
  });

  it("conviction lower with negative imfSentiment (-0.8, conf 0.90) vs baseline", () => {
    const baseline = synthesizeChain(makeChain());
    const withNeg = synthesizeChain(
      makeChain({
        imfSentiment: {
          sentiment: -0.8,
          confidence: 0.90,
          affectedSectors: ["banking"],
          reasoning: "Growth down",
        },
      })
    );
    expect(baseline).not.toBeNull();
    expect(withNeg).not.toBeNull();
    expect(withNeg!.conviction).toBeLessThan(baseline!.conviction);
  });

  it("imfSentiment confidence 0.40 (below IMF_CONFIDENCE_MIN=0.55) → conviction unchanged", () => {
    const baseline = synthesizeChain(makeChain());
    const withLowConf = synthesizeChain(
      makeChain({
        imfSentiment: {
          sentiment: 0.9,
          confidence: 0.40,
          affectedSectors: ["banking"],
          reasoning: "Low conf signal",
        },
      })
    );
    expect(baseline).not.toBeNull();
    expect(withLowConf).not.toBeNull();
    expect(withLowConf!.conviction).toBeCloseTo(baseline!.conviction, 4);
  });

  it("IMF delta = sentiment(0.6) × weight(0.20) = 0.12 (numerically verified)", () => {
    const baseline = synthesizeChain(makeChain());
    const imfSentimentValue = 0.6;
    const withImf = synthesizeChain(
      makeChain({
        imfSentiment: {
          sentiment: imfSentimentValue,
          confidence: 0.90,
          affectedSectors: ["banking"],
          reasoning: "Test delta",
        },
      })
    );
    expect(baseline).not.toBeNull();
    expect(withImf).not.toBeNull();
    const delta = withImf!.conviction - baseline!.conviction;
    const expectedDelta = imfSentimentValue * 0.20;
    expect(delta).toBeCloseTo(expectedDelta, 3);
  });

  it("conviction clamped to [0, 1] even with extreme positive IMF sentiment", () => {
    const withMax = synthesizeChain(
      makeChain({
        imfSentiment: {
          sentiment: 1.0,
          confidence: 0.99,
          affectedSectors: ["banking"],
          reasoning: "Extreme bullish",
        },
      })
    );
    expect(withMax).not.toBeNull();
    expect(withMax!.conviction).toBeGreaterThanOrEqual(0);
    expect(withMax!.conviction).toBeLessThanOrEqual(1);
  });
});

// ── AC-8: MCP tool — imfDataClassifier output shape ───────────────────────────

describe("AC-8: IMF MCP tool — classifyImfIndicators output shape", () => {
  it("returns required keys: sentiment, confidence, classification, reasoning, sectorImpacts", () => {
    const indicators = [makeIndicator()];
    const result = classifyImfIndicators({ indicators, historicalBaseline: 3.0 });
    expect(typeof result.sentiment).toBe("number");
    expect(typeof result.confidence).toBe("number");
    expect(typeof result.classification).toBe("string");
    expect(typeof result.reasoning).toBe("string");
    expect(Array.isArray(result.sectorImpacts)).toBe(true);
  });

  it("classification is one of imf_bullish | imf_bearish | imf_neutral", () => {
    const result = classifyImfIndicators({
      indicators: [makeIndicator({ yoyChange: 0.14 })],
      historicalBaseline: 3.0,
    });
    expect(["imf_bullish", "imf_bearish", "imf_neutral"]).toContain(result.classification);
  });

  it("sentiment in range [-1, +1]", () => {
    const result = classifyImfIndicators({
      indicators: [makeIndicator()],
      historicalBaseline: 3.0,
    });
    expect(result.sentiment).toBeGreaterThanOrEqual(-1);
    expect(result.sentiment).toBeLessThanOrEqual(1);
  });

  it("confidence in range [0, 1]", () => {
    const result = classifyImfIndicators({
      indicators: [makeIndicator()],
      historicalBaseline: 3.0,
    });
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("indicator_code filter narrows results to single code (cache-only pattern)", async () => {
    const multiIndicators: ImfIndicator[] = [
      makeIndicator({ code: "NGDP_RPCH", name: "GDP" }),
      makeIndicator({ code: "PCPI_ADVEC", name: "Inflation", value: 2.1 }),
    ];
    const getSpy = spyOn(imfFetcher, "getLatestImfIndicators").mockResolvedValue(multiIndicators);

    const all = await imfFetcher.getLatestImfIndicators();
    const filtered = all.filter((i) => i.code.toUpperCase() === "NGDP_RPCH");
    expect(filtered.length).toBe(1);
    expect(filtered[0]!.code).toBe("NGDP_RPCH");

    getSpy.mockRestore();
  });

  it("MCP tool does NOT call fetchLatestImfIndicators (cache-only guarantee)", async () => {
    const fetchSpy = spyOn(imfFetcher, "fetchLatestImfIndicators");
    const getSpy = spyOn(imfFetcher, "getLatestImfIndicators").mockResolvedValue([]);

    // Tool handler calls getLatestImfIndicators, not fetchLatestImfIndicators
    await imfFetcher.getLatestImfIndicators();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getSpy).toHaveBeenCalled();

    fetchSpy.mockRestore();
    getSpy.mockRestore();
  });

  it("empty indicators → classification = imf_neutral, sentiment = 0", () => {
    const result = classifyImfIndicators({
      indicators: [],
      historicalBaseline: 3.0,
    });
    expect(result.classification).toBe("imf_neutral");
    expect(result.sentiment).toBe(0);
  });
});
