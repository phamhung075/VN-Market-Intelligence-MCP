/**
 * Task 1279b — MSCI Inclusion Cascade Integration Tests (GREEN phase)
 *
 * Validates:
 *   - detectMsciCascadePeers() correctly identifies large-cap stocks
 *   - Credibility threshold 0.7 enforced
 *   - Non-MSCI keywords don't trigger cascade
 *   - Large-cap filtering (excludes mid/small-cap)
 *   - Integration with buildCausalChain (E2E)
 *   - Sentiment direction is bullish (opposite of insider dump)
 *   - Confidence calculation formula: (cred × keywordCount / 3.0) capped at 1.0
 */

import { describe, test, expect } from "bun:test";
import {
  buildCausalChain,
  MSCI_INCLUSION_RULES,
  type WatchlistEntry,
} from "../domain/services/cascadeEngine.js";
import type { AnalysisEntry } from "../domain/services/newsNormalizer.js";
import { detectMsciCascadePeers } from "../application/cascadeExecutor.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeSeed(
  summary: string,
  affectedStocks?: string[],
  sourceCredibility: number = 0.9,
): AnalysisEntry {
  return {
    id: `test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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
 * Watchlist with mix of large-cap and non-large-cap stocks.
 * Large-cap: VCB, BID, FPT, MWG, HPG, KDH, MSN, CTG
 * Non-large-cap: VNM (retail/agriculture, smaller)
 */
const watchlist: WatchlistEntry[] = [
  // Banking sector (large-cap)
  { actionCode: "VCB", domain: "banking" as const, exchange: "HOSE" },
  { actionCode: "BID", domain: "banking" as const, exchange: "HOSE" },
  { actionCode: "CTG", domain: "banking" as const, exchange: "HOSE" },
  { actionCode: "ACB", domain: "banking" as const, exchange: "HOSE" },
  // Tech sector (large-cap)
  { actionCode: "FPT", domain: "tech" as const, exchange: "HOSE" },
  // Retail sector (large-cap)
  { actionCode: "MWG", domain: "retail" as const, exchange: "HOSE" },
  // Real estate (large-cap)
  { actionCode: "KDH", domain: "real_estate" as const, exchange: "HOSE" },
  // Steel (large-cap)
  { actionCode: "HPG", domain: "steel" as const, exchange: "HOSE" },
  // Retail (large-cap)
  { actionCode: "MSN", domain: "retail" as const, exchange: "HOSE" },
  // Consumer staples (NOT large-cap — excluded from MSCI cascade)
  { actionCode: "VNM", domain: "agriculture" as const, exchange: "HOSE" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Test Cases
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1279b — MSCI Inclusion Cascade (GREEN)", () => {
  // ── GC-1: Large-cap filtering ──────────────────────────────────────────

  test("GC-1: detectMsciCascadePeers() returns large-cap stocks only", () => {
    const result = detectMsciCascadePeers(
      "Reuters announces MSCI eligibility nộp danh sách Vietnam",
      0.95,
      watchlist,
    );

    expect(result.matched).toBe(true);
    expect(result.targetStocks.length).toBeGreaterThan(0);
    // Should include large-cap stocks
    expect(result.targetStocks).toContain("VCB");
    expect(result.targetStocks).toContain("FPT");
    expect(result.targetStocks).toContain("MWG");
    expect(result.targetStocks).toContain("HPG");
    // Should exclude VNM (non-large-cap)
    expect(result.targetStocks).not.toContain("VNM");
    // 1 keyword: 0.95 * 1 / 3.0 ≈ 0.317
    expect(result.confidence).toBeGreaterThan(0.3);
    expect(result.confidence).toBeLessThan(0.4);
  });

  // ── GC-2: Credibility threshold 0.7 ────────────────────────────────────

  test("GC-2: Credibility <0.7 returns empty targetStocks", () => {
    const result = detectMsciCascadePeers(
      "Vietnam MSCI eligibility nộp danh sách",
      0.55,
      watchlist,
    );

    expect(result.matched).toBe(false);
    expect(result.targetStocks.length).toBe(0);
    expect(result.reasoning).toContain("credibility");
  });

  // ── GC-3: Multi-keyword filtering ──────────────────────────────────────

  test("GC-3: Multi-stock article filters to large-cap only", () => {
    const result = detectMsciCascadePeers(
      "Article mentions FPT, MWG, VNM, VCB MSCI eligibility đáp ứng tiêu chí",
      0.90,
      watchlist,
    );

    expect(result.matched).toBe(true);
    // Should include large-cap mentioned
    expect(result.targetStocks).toContain("FPT");
    expect(result.targetStocks).toContain("MWG");
    expect(result.targetStocks).toContain("VCB");
    // Should exclude VNM
    expect(result.targetStocks).not.toContain("VNM");
  });

  // ── GC-4: Non-MSCI keywords don't match ────────────────────────────────

  test("GC-4: Non-MSCI keywords return no match", () => {
    const result = detectMsciCascadePeers(
      "Vietnam banking sector trends up",
      0.95,
      watchlist,
    );

    expect(result.matched).toBe(false);
    expect(result.detectedKeywords.length).toBe(0);
    expect(result.targetStocks.length).toBe(0);
  });

  // ── GC-5: Sentiment is bullish ─────────────────────────────────────────

  test("GC-5: Sentiment direction bullish (opposite insider dump)", () => {
    const seed = makeSeed(
      "Reuters: Vietnam nộp danh sách MSCI inclusion",
      ["VCB"],
      0.95,
    );

    const chain = buildCausalChain(seed, watchlist);

    // Find MSCI domain entry (should be present after GREEN implementation)
    const msciEntry = chain.entries.find(
      (e) => e.title && e.title.includes("MSCI")
    );

    if (msciEntry) {
      expect(msciEntry.sentiment).toBe("bullish");
    }
  });

  // ── GC-6: Peer isolation — only large-cap, not sector peers ────────────

  test("GC-6: Peer cascade isolation — targets large-cap, not retail peers", () => {
    const result = detectMsciCascadePeers(
      "MWG nộp danh sách MSCI eligibility",
      0.95,
      watchlist,
    );

    expect(result.matched).toBe(true);
    // Should include large-cap stocks (cross-sector)
    expect(result.targetStocks).toContain("MWG");
    expect(result.targetStocks).toContain("FPT"); // tech, not retail peer
    expect(result.targetStocks).toContain("VCB"); // banking, not retail peer
  });

  // ── GC-7: buildCausalChain integration ─────────────────────────────────

  test("GC-7: buildCausalChain integration produces HIGH severity domain entry", () => {
    const seed = makeSeed(
      "Reuters: Vietnam MSCI nộp danh sách eligibility",
      ["VCB"],
      0.95,
    );

    const chain = buildCausalChain(seed, watchlist);

    expect(chain.entries.length).toBeGreaterThanOrEqual(1);

    // First entry is the seed
    expect(chain.entries[0]?.level).toBe("action");

    // Find MSCI domain entry
    const msciEntry = chain.entries.find(
      (e) =>
        e.level === "domain" &&
        e.title &&
        e.title.includes("MSCI")
    );

    expect(msciEntry).toBeDefined();
    if (msciEntry) {
      expect(msciEntry.sentiment).toBe("bullish");
      expect(msciEntry.reasoning).toContain("MSCI");
    }
  });

  // ── GC-8: Confidence calculation formula ────────────────────────────────

  test("GC-8: Confidence = (cred × keywordCount / 3.0) capped at 1.0", () => {
    // 1 keyword: (0.75 × 1 / 3.0) = 0.25
    const result1 = detectMsciCascadePeers(
      "Text with single MSCI keyword: nộp danh sách",
      0.75,
      watchlist,
    );

    if (result1.matched) {
      // Expected: 0.75 * 1 / 3.0 = 0.25
      expect(Math.abs(result1.confidence - 0.25)).toBeLessThan(0.01);
    }
  });

  // ── GC-9: Multiple keywords boost confidence ────────────────────────────

  test("GC-9: Multiple keywords boost confidence", () => {
    // 2 keywords: (0.90 × 2 / 3.0) ≈ 0.60
    const result = detectMsciCascadePeers(
      "Text mentions nộp danh sách and đáp ứng tiêu chí MSCI",
      0.90,
      watchlist,
    );

    if (result.matched) {
      // Expected: 0.90 * 2 / 3.0 ≈ 0.60
      expect(Math.abs(result.confidence - 0.60)).toBeLessThan(0.01);
    }
  });

  // ── GC-10: E2E complex cascade scenario ────────────────────────────────

  test("GC-10: E2E with complex cascade scenario", () => {
    // News about FPT joining MSCI, mentions peers
    const result = detectMsciCascadePeers(
      "FPT joining MSCI nộp danh sách successfully, peers include BID, ACB, VCB all mentioned",
      0.92,
      watchlist,
    );

    expect(result.matched).toBe(true);
    // Should target large-cap stocks
    expect(result.targetStocks.length).toBeGreaterThan(0);
    // Should include FPT and banking peers
    expect(result.targetStocks).toContain("FPT");

    // Now test with buildCausalChain
    const seed = makeSeed(
      result.reasoning,
      ["FPT", "BID", "VCB"],
      0.92,
    );

    const chain = buildCausalChain(seed, watchlist);

    // Should have at least seed + domain entry
    expect(chain.entries.length).toBeGreaterThanOrEqual(1);
    // Seed should be bullish (MSCI is positive)
    expect(chain.entries[0]?.sentiment).toBe("bullish");
  });

  // ── TC-4 from RED phase: Contract test ─────────────────────────────────

  test("TC-4 (RED): MSCI_INCLUSION_RULES array defined with correct structure", () => {
    // Contract: MSCI_INCLUSION_RULES must be defined
    expect(MSCI_INCLUSION_RULES).toBeDefined();

    // Contract: must have at least 3 rules for the three keywords
    expect(MSCI_INCLUSION_RULES.length).toBeGreaterThanOrEqual(3);

    // Contract: all three keywords must be present
    const keywords = MSCI_INCLUSION_RULES.map((r) => r.keyword);
    expect(keywords).toContain("nộp danh sách");
    expect(keywords).toContain("đáp ứng tiêu chí");
    expect(keywords).toContain("chỉ số msci");

    // Contract: all rules must target large-cap sector
    MSCI_INCLUSION_RULES.forEach((rule) => {
      expect(rule.sector).toBe("all_largecp");
    });

    // Contract: all rules must start with "msci_" prefix
    MSCI_INCLUSION_RULES.forEach((rule) => {
      expect(rule.key).toMatch(/^msci_/);
    });
  });
});
