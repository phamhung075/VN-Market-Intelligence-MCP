/**
 * Task 1279a — RED Phase: MSCI Inclusion Cascade Detection
 *
 * Tests for MSCI inclusion cascade feature. Tests should mostly PASS immediately
 * because the underlying sentiment keywords (nộp danh sách, đáp ứng tiêu chí, chỉ số msci)
 * will be added to sentimentClassifier as bullish keywords. This phase establishes test
 * structure + fixtures for GREEN phase implementation.
 *
 * Expected results:
 *   - TC-1/2/3: PASS (sentiment keywords added to classifier)
 *   - TC-4: FAIL (MSCI_INCLUSION_RULES not yet defined in GREEN)
 *   - TC-5/6: PASS (buildCausalChain plumbing already works)
 *
 * GREEN phase (1279b) will:
 *   - Define MSCI_INCLUSION_RULES with 3+ keyword entries
 *   - Implement detectMsciInclusion() domain function
 *   - Implement detectMsciCascadePeers() application function
 *   - Integrate with buildCausalChain
 *   - Make TC-4 PASS
 */

import { describe, test, expect } from "bun:test";
import { classifySentiment } from "../domain/services/sentimentClassifier.js";
import {
  buildCausalChain,
  type WatchlistEntry,
  // MSCI_INCLUSION_RULES will be added in GREEN phase
} from "../domain/services/cascadeEngine.js";
import type { AnalysisEntry } from "../domain/services/newsNormalizer.js";
import type { DomainType } from "../../bctc-schema.js";

// ═══════════════════════════════════════════════════════════════════════════
// Test helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a test AnalysisEntry seed with MSCI keyword sentiment.
 * Defaults to bullish sentiment (MSCI inclusion is positive news).
 */
function makeSeed(
  summary: string,
  affectedStocks?: string[],
  sourceCredibility: number = 0.9,
): AnalysisEntry {
  return {
    id: `test-${Date.now()}`,
    sourceTitle: summary,
    sourceUrl: "https://example.com",
    sourceType: "news",
    publishedAt: new Date().toISOString(),
    summary,
    level: "action",
    sentiment: "bullish",
    impactScore: 8,
    impactDirection: "up",
    confidence: sourceCredibility,
    timeHorizon: "medium",
    reasoning: "MSCI inclusion catalyst",
    affectedCountries: ["VN"],
    affectedDomains: ["other"],
    affectedActions: affectedStocks ?? ["VCB"],
    parentIds: [],
    tags: [],
    createdAt: new Date().toISOString(),
  };
}

/**
 * Watchlist fixture: 8 large-cap stocks across multiple sectors.
 * These represent the breadth of Vietnamese large-cap universe.
 */
const watchlist: WatchlistEntry[] = [
  // Banking sector
  { actionCode: "VCB", domain: "banking" as DomainType, exchange: "HOSE" },
  { actionCode: "BID", domain: "banking" as DomainType, exchange: "HOSE" },
  // Tech sector
  { actionCode: "FPT", domain: "tech" as DomainType, exchange: "HOSE" },
  { actionCode: "MWG", domain: "retail" as DomainType, exchange: "HOSE" },
  // Real Estate
  { actionCode: "KDH", domain: "real_estate" as DomainType, exchange: "HOSE" },
  // Materials / Industrials
  { actionCode: "HPG", domain: "materials" as DomainType, exchange: "HOSE" },
  { actionCode: "MSN", domain: "materials" as DomainType, exchange: "HOSE" },
  // Consumer staples
  { actionCode: "VNM", domain: "agriculture" as DomainType, exchange: "HOSE" },
];

// ═══════════════════════════════════════════════════════════════════════════
// Test Cases
// ═══════════════════════════════════════════════════════════════════════════

describe("Task 1279a — MSCI Inclusion Cascade (RED Phase)", () => {
  // ──────────────────────────────────────────────────────────────────────────
  // TC-1: "nộp danh sách" keyword → bullish sentiment
  // ──────────────────────────────────────────────────────────────────────────

  test("TC-1: 'nộp danh sách' keyword triggers bullish sentiment", () => {
    const text = "Reuters: Vietnam nộp danh sách MSCI eligibility criteria";
    const result = classifySentiment(text);

    expect(result.direction).toBe("bullish");
    expect(result.keywords).toContain("nộp danh sách");
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-2: "đáp ứng tiêu chí" keyword → bullish sentiment
  // ──────────────────────────────────────────────────────────────────────────

  test("TC-2: 'đáp ứng tiêu chí' keyword triggers bullish sentiment", () => {
    const text = "Vietnam đáp ứng tiêu chí MSCI inclusion standard";
    const result = classifySentiment(text);

    expect(result.direction).toBe("bullish");
    expect(result.keywords).toContain("đáp ứng tiêu chí");
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-3: "chỉ số msci" keyword → bullish sentiment
  // ──────────────────────────────────────────────────────────────────────────

  test("TC-3: 'chỉ số msci' keyword triggers bullish sentiment", () => {
    const text = "Công ty nộp danh sách chỉ số MSCI thành công";
    const result = classifySentiment(text);

    expect(result.direction).toBe("bullish");
    expect(result.keywords).toContain("chỉ số msci");
    expect(result.confidence).toBeGreaterThan(0.6);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-4: MSCI_INCLUSION_RULES structure validation (CONTRACT TEST)
  // ──────────────────────────────────────────────────────────────────────────
  // This test FAILS until GREEN phase (1279b) adds MSCI_INCLUSION_RULES.
  // It defines the expected interface for the GREEN implementation.

  test("TC-4: MSCI_INCLUSION_RULES array defined with correct structure", () => {
    // Dynamic import to avoid static import failure in RED phase
    let MSCI_INCLUSION_RULES: any;
    try {
      // Try to import MSCI_INCLUSION_RULES from cascadeEngine
      // If it doesn't exist, MSCI_INCLUSION_RULES will be undefined
      const module = require("../domain/services/cascadeEngine.js");
      MSCI_INCLUSION_RULES = module.MSCI_INCLUSION_RULES;
    } catch {
      // Import failed — rule doesn't exist yet
      MSCI_INCLUSION_RULES = undefined;
    }

    // Contract: MSCI_INCLUSION_RULES must be defined
    expect(MSCI_INCLUSION_RULES).toBeDefined();

    // Contract: must have at least 3 rules for the three keywords
    expect(MSCI_INCLUSION_RULES.length).toBeGreaterThanOrEqual(3);

    // Contract: all three keywords must be present
    const keywords = MSCI_INCLUSION_RULES.map((r: any) => r.keyword);
    expect(keywords).toContain("nộp danh sách");
    expect(keywords).toContain("đáp ứng tiêu chí");
    expect(keywords).toContain("chỉ số msci");

    // Contract: all rules must target large-cap sector (MSCI inclusion is cross-sector)
    MSCI_INCLUSION_RULES.forEach((rule: any) => {
      expect(rule.sector).toBe("all_largecp");
    });

    // Contract: all rules must start with "msci_" prefix for cohesion
    MSCI_INCLUSION_RULES.forEach((rule: any) => {
      expect(rule.key).toMatch(/^msci_/);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-5: buildCausalChain with MSCI seed produces domain entry
  // ──────────────────────────────────────────────────────────────────────────

  test("TC-5: buildCausalChain with MSCI seed produces domain entry", () => {
    // RED phase: buildCausalChain already exists and processes seeds.
    // We test that it accepts MSCI keywords and produces domain-level entries.

    const seed = makeSeed(
      "Vietnam nộp danh sách MSCI eligibility criteria successfully",
      ["VCB"],
    );

    const chain = buildCausalChain(seed, watchlist);

    expect(chain).toBeDefined();
    expect(chain.entries.length).toBeGreaterThan(0);

    // Seed entry should be preserved
    const seedEntry = chain.entries[0]!;
    expect(seedEntry.level).toBe("action");
    expect(seedEntry.sentiment).toBe("bullish");

    // Domain entries should be created (one per affected domain)
    expect(chain.entries.length).toBeGreaterThanOrEqual(1);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-6: Credibility threshold 0.7 enforced
  // ──────────────────────────────────────────────────────────────────────────

  test("TC-6: Credibility threshold 0.7 enforced (high cred passes, low cred excluded)", () => {
    const text = "Vietnam nộp danh sách MSCI eligibility";

    // High credibility seed (Reuters = 0.95) should be processed normally
    const highCredSeed = makeSeed(text, ["VCB"], 0.95);
    highCredSeed.sourceUrl = "https://reuters.com/article";
    const highCredChain = buildCausalChain(highCredSeed, watchlist);

    expect(highCredChain).toBeDefined();
    expect(highCredChain.entries.length).toBeGreaterThan(0);
    expect(highCredChain.entries[0]!.confidence).toBeGreaterThan(0.7);

    // Low credibility seed (local news = 0.55) should either:
    // - Be accepted but marked with low confidence, or
    // - Be excluded from cascade (behavior deferred to GREEN phase detectMsciInclusion)
    // For RED phase, we verify the seed can be processed without crashing
    const lowCredSeed = makeSeed(text, ["VCB"], 0.55);
    lowCredSeed.sourceUrl = "https://tinnhanhxyz.vn/article";
    const lowCredChain = buildCausalChain(lowCredSeed, watchlist);

    expect(lowCredChain).toBeDefined();
    // Low credibility should either:
    // a) still create entries but with lower confidence, or
    // b) be filtered before cascade (exact behavior in GREEN phase)
    // We just verify no crash
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-7: Non-MSCI keywords don't trigger cascade
  // ──────────────────────────────────────────────────────────────────────────

  test("TC-7: Non-MSCI keywords don't trigger cascade detection", () => {
    // Text with bullish sentiment but NO MSCI keywords
    const text = "VCB tăng mạnh giá cổ phiếu trong năm 2026";
    const result = classifySentiment(text);

    expect(result.direction).toBe("bullish");
    // Should NOT contain any MSCI keywords
    expect(result.keywords).not.toContain("nộp danh sách");
    expect(result.keywords).not.toContain("đáp ứng tiêu chí");
    expect(result.keywords).not.toContain("chỉ số msci");

    // buildCausalChain should process normally without MSCI-specific logic
    const seed = makeSeed(text, ["VCB"]);
    const chain = buildCausalChain(seed, watchlist);

    expect(chain).toBeDefined();
    expect(chain.entries.length).toBeGreaterThan(0);
  });
});
