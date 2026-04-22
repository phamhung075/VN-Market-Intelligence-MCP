/**
 * Task 1278a — RED Phase: Insider Dump Cascade Detection
 *
 * Tests for insider dump sentiment cascade feature. Tests should PASS immediately
 * because the underlying sentiment keywords (xả hàng, bán sạch, thoái sạch) already
 * exist from sprint 1272. This phase establishes test structure + fixtures for
 * GREEN phase implementation.
 *
 * Expected results:
 *   - TC-1/2/3: PASS (sentiment keywords already exist)
 *   - TC-4: FAIL (INSIDER_DUMP_RULES not yet defined)
 *   - TC-5/6: PASS (buildCausalChain plumbing already works)
 *
 * GREEN phase (1278b) will:
 *   - Define INSIDER_DUMP_RULES with 3+ keyword entries
 *   - Implement peer-banking cascade logic
 *   - Make TC-4 PASS
 */

import { describe, test, expect } from "bun:test";
import { classifySentiment } from "../domain/services/sentimentClassifier.js";
import {
  buildCausalChain,
  type WatchlistEntry,
  // INSIDER_DUMP_RULES will be added in GREEN phase
} from "../domain/services/cascadeEngine.js";
import type { AnalysisEntry } from "../domain/services/newsNormalizer.js";
import type { DomainType } from "../../bctc-schema.js";

// ═══════════════════════════════════════════════════════════════════════════
// Test helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a test AnalysisEntry seed with insider dump sentiment.
 * Defaults to banking sector, VCB stock, bearish sentiment.
 */
function makeSeed(
  summary: string,
  affectedStocks?: string[],
): AnalysisEntry {
  return {
    id: `test-${Date.now()}`,
    sourceTitle: summary,
    sourceUrl: "https://example.com",
    sourceType: "news",
    publishedAt: new Date().toISOString(),
    summary,
    level: "stock",
    sentiment: "bearish",
    impactScore: 7,
    impactDirection: "down",
    confidence: 0.75,
    timeHorizon: "short",
    reasoning: "insider action",
    affectedCountries: ["VN"],
    affectedDomains: ["banking"],
    affectedActions: affectedStocks ?? ["VCB"],
    parentIds: [],
    tags: [],
    createdAt: new Date().toISOString(),
  };
}

/**
 * Watchlist fixture: 6 stocks across banking, tech, and securities sectors.
 */
const watchlist: WatchlistEntry[] = [
  { actionCode: "VCB", domain: "banking" as DomainType, exchange: "HOSE" },
  { actionCode: "BID", domain: "banking" as DomainType, exchange: "HOSE" },
  { actionCode: "CTG", domain: "banking" as DomainType, exchange: "HOSE" },
  { actionCode: "ACB", domain: "banking" as DomainType, exchange: "HOSE" },
  { actionCode: "FPT", domain: "tech" as DomainType, exchange: "HOSE" },
  { actionCode: "SBV", domain: "securities" as DomainType, exchange: "HOSE" },
];

// ═══════════════════════════════════════════════════════════════════════════
// Test Cases
// ═══════════════════════════════════════════════════════════════════════════

describe("Task 1278a — Insider Dump Cascade (RED Phase)", () => {
  // ──────────────────────────────────────────────────────────────────────────
  // TC-1: xả hàng keyword → bearish sentiment
  // ──────────────────────────────────────────────────────────────────────────

  test("TC-1: xả hàng keyword triggers bearish sentiment", () => {
    const text = "Tổng giám đốc VCB xả hàng cổ phiếu khối lượng lớn";
    const result = classifySentiment(text);

    expect(result.direction).toBe("bearish");
    expect(result.keywords).toContain("xả hàng");
    expect(result.confidence).toBeGreaterThan(0.6);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-2: bán sạch keyword → bearish sentiment
  // ──────────────────────────────────────────────────────────────────────────

  test("TC-2: bán sạch keyword triggers bearish sentiment", () => {
    const text = "CEO VCB bán sạch vốn sau 15 năm lãnh đạo";
    const result = classifySentiment(text);

    expect(result.direction).toBe("bearish");
    expect(result.keywords).toContain("bán sạch");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-3: thoái sạch keyword → bearish sentiment
  // ──────────────────────────────────────────────────────────────────────────

  test("TC-3: thoái sạch keyword triggers bearish sentiment", () => {
    const text = "Lãnh đạo BID thoái sạch toàn bộ cổ phiếu";
    const result = classifySentiment(text);

    expect(result.direction).toBe("bearish");
    expect(result.keywords).toContain("thoái sạch");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-4: INSIDER_DUMP_RULES structure validation (CONTRACT TEST)
  // ──────────────────────────────────────────────────────────────────────────
  // This test FAILS until GREEN phase (1278b) adds INSIDER_DUMP_RULES.
  // It defines the expected interface for the GREEN implementation.

  test("TC-4: INSIDER_DUMP_RULES array defined with correct structure", () => {
    // Dynamic import to avoid static import failure in RED phase
    let INSIDER_DUMP_RULES: any;
    try {
      // Try to import INSIDER_DUMP_RULES from cascadeEngine
      // If it doesn't exist, INSIDER_DUMP_RULES will be undefined
      const module = require("../domain/services/cascadeEngine.js");
      INSIDER_DUMP_RULES = module.INSIDER_DUMP_RULES;
    } catch {
      // Import failed — rule doesn't exist yet
      INSIDER_DUMP_RULES = undefined;
    }

    // Contract: INSIDER_DUMP_RULES must be defined
    expect(INSIDER_DUMP_RULES).toBeDefined();

    // Contract: must have at least 3 rules for the three keywords
    expect(INSIDER_DUMP_RULES.length).toBeGreaterThanOrEqual(3);

    // Contract: all three keywords must be present
    const keywords = INSIDER_DUMP_RULES.map((r: any) => r.keyword);
    expect(keywords).toContain("xả hàng");
    expect(keywords).toContain("bán sạch");
    expect(keywords).toContain("thoái sạch");

    // Contract: all rules must target banking sector (insider dump = banking concern)
    INSIDER_DUMP_RULES.forEach((rule: any) => {
      expect(rule.sector).toBe("banking");
    });

    // Contract: all rules must share the same key prefix for cohesion
    const keys = new Set(INSIDER_DUMP_RULES.map((r: any) => r.key));
    expect(keys.size).toBe(1);
    expect([...keys][0]).toBe("insider_dump_banking_peers");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-5: buildCausalChain with banking insider dump includes affected peers
  // ──────────────────────────────────────────────────────────────────────────

  test("TC-5: buildCausalChain with banking insider dump includes affected peers", () => {
    // RED phase: We can't fully test peer filtering without INSIDER_DUMP_RULES,
    // but we can test that buildCausalChain accepts banking insider-dump seeds
    // and produces domain entries.

    const seed = makeSeed(
      "Tổng giám đốc VCB xả hàng cổ phiếu khối lượng lớn",
      ["VCB"],
    );

    const chain = buildCausalChain(seed, watchlist);

    expect(chain).toBeDefined();
    expect(chain.entries.length).toBeGreaterThan(0);

    // Seed entry should be preserved
    const seedEntry = chain.entries[0];
    expect(seedEntry.level).toBe("stock");
    expect(seedEntry.sentiment).toBe("bearish");

    // Domain entries should include banking (from affectedDomains)
    const bankingEntry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("banking"),
    );
    expect(bankingEntry).toBeDefined();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-6: Non-banking insider dumps don't fire cascade
  // ──────────────────────────────────────────────────────────────────────────

  test("TC-6: FPT (tech) insider dump with xả hàng does not cascade to banking", () => {
    // FPT is tech sector, not banking. Even with insider dump keywords,
    // it should NOT cascade to banking peers.

    const seed = makeSeed(
      "CEO FPT bán sạch cổ phiếu sau 20 năm",
      ["FPT"],
    );

    // Adjust affectedDomains to match FPT's actual sector
    seed.affectedDomains = ["tech"];

    const chain = buildCausalChain(seed, watchlist);

    // Chain should exist and include tech domain (FPT)
    expect(chain.entries.length).toBeGreaterThan(0);

    // Should include tech domain entries triggered by FPT's insider action
    const techEntry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("tech"),
    );
    expect(techEntry).toBeDefined();

    // Insider dump rule firing would only happen if original stock IS banking.
    // Since FPT is tech, no insider-dump cascade should trigger.
    // (Exact verification deferred to GREEN phase with CASCADE integration.)
  });
});
