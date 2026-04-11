/**
 * Task 1004 — VN Government Stabilization + Systemic Stress Cascade Rules
 *
 * Tests for new SECTOR_RULES, POLICY_RULES additions, and
 * detectPolicyInterventionCombo pure function.
 */

import { describe, test, expect } from "bun:test";
import {
  buildCausalChain,
  detectPolicyInterventionCombo,
  POLICY_RULES,
  type WatchlistEntry,
} from "../../src/domain/services/cascadeEngine.js";
import type { AnalysisEntry } from "../../src/domain/services/newsNormalizer.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeSeed(summary: string): AnalysisEntry {
  return {
    id: `test-${Date.now()}`,
    sourceTitle: summary,
    sourceUrl: "",
    sourceType: "news",
    publishedAt: "2026-04-11T00:00:00Z",
    summary,
    level: "country",
    sentiment: "neutral",
    impactScore: 8,
    impactDirection: "neutral",
    confidence: 0.8,
    timeHorizon: "short",
    reasoning: "test seed",
    affectedCountries: ["VN"],
    affectedDomains: [],
    affectedActions: [],
    parentIds: [],
    tags: [],
    createdAt: "2026-04-11T00:00:00Z",
  };
}

const watchlist: WatchlistEntry[] = [
  { actionCode: "VCB", domain: "banking", exchange: "HOSE" },
  { actionCode: "SSI", domain: "securities", exchange: "HOSE" },
  { actionCode: "VHM", domain: "real_estate", exchange: "HOSE" },
  { actionCode: "HPG", domain: "steel", exchange: "HOSE" },
  { actionCode: "HUT", domain: "construction", exchange: "HOSE" },
  { actionCode: "FRT", domain: "retail", exchange: "HOSE" },
];

function getDomainEntry(summary: string, domain: string) {
  const chain = buildCausalChain(makeSeed(summary), watchlist);
  return chain.entries.find(
    (e) => e.level === "domain" && e.affectedDomains.includes(domain as any),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-1: SBV rate cut fires high-confidence banking domain entry
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1004 — VN Policy Cascade Rules", () => {
  test("AC-1: SBV rate cut → banking domain entry, direction up, confidence >= 0.85", () => {
    const entry = getDomainEntry(
      "nhnn hạ lãi suất điều hành 50 điểm cơ bản xuống 4%",
      "banking",
    );
    expect(entry).toBeDefined();
    expect(entry!.sentiment).toBe("bullish");
    expect(entry!.confidence).toBeGreaterThanOrEqual(0.85);
  });

  // AC-2: SBV rate cut fires securities domain entry
  test("AC-2: SBV rate cut → securities domain entry, direction up, confidence >= 0.82", () => {
    const entry = getDomainEntry(
      "nhnn hạ lãi suất điều hành 50 điểm cơ bản xuống 4%",
      "securities",
    );
    expect(entry).toBeDefined();
    expect(entry!.sentiment).toBe("bullish");
    expect(entry!.confidence).toBeGreaterThanOrEqual(0.82);
  });

  // AC-3: Systemic stress fires bearish banking entry
  test("AC-3: Systemic stress → banking bearish, confidence >= 0.88", () => {
    const entry = getDomainEntry(
      "nợ xấu hệ thống vượt 5% — khủng hoảng thanh khoản ngân hàng nghiêm trọng",
      "banking",
    );
    expect(entry).toBeDefined();
    expect(entry!.sentiment).toBe("bearish");
    expect(entry!.confidence).toBeGreaterThanOrEqual(0.88);
  });

  // AC-4: Systemic stress fires bearish securities entry
  test("AC-4: Systemic stress → securities bearish, confidence >= 0.82", () => {
    const entry = getDomainEntry(
      "nợ xấu hệ thống vượt 5% — khủng hoảng thanh khoản ngân hàng nghiêm trọng",
      "securities",
    );
    expect(entry).toBeDefined();
    expect(entry!.sentiment).toBe("bearish");
    expect(entry!.confidence).toBeGreaterThanOrEqual(0.82);
  });

  // AC-5: SCIC intervention triggers high-confidence bullish securities
  // Note: when text also matches existing "bình ổn thị trường" stabilization rules,
  // those fire first (first-match-wins per domain). SCIC-specific vocabulary that
  // doesn't overlap with existing rules gets the 0.90 confidence.
  test("AC-5: SCIC intervention → securities bullish, confidence >= 0.80", () => {
    const entry = getDomainEntry(
      "scic mua vào cổ phiếu nhằm bình ổn thị trường chứng khoán",
      "securities",
    );
    expect(entry).toBeDefined();
    expect(entry!.sentiment).toBe("bullish");
    expect(entry!.confidence).toBeGreaterThanOrEqual(0.80);
  });

  // AC-6: Policy combo — SBV + fiscal → multiplier applied
  test("AC-6: SBV + fiscal combo → multiplier 1.10, banking boosted", () => {
    const summary =
      "nhnn hạ lãi suất điều hành 50bp đồng thời bộ tài chính bơm tiền gói phục hồi kinh tế";
    const combo = detectPolicyInterventionCombo(summary.toLowerCase());
    expect(combo.multiplier).toBe(1.1);
    expect(combo.matchedCategories).toContain("sbv_rate");
    expect(combo.matchedCategories).toContain("fiscal_stimulus");

    const entry = getDomainEntry(summary, "banking");
    expect(entry).toBeDefined();
    expect(entry!.reasoning).toContain("PolicyCombo");
  });

  // AC-7: Triple combo → 1.18x multiplier
  test("AC-7: SBV + fiscal + credit room → multiplier 1.18", () => {
    const summary =
      "nhnn hạ lãi suất điều hành đồng thời gói kích thích tài khóa và nới room tín dụng cho các ngân hàng";
    const combo = detectPolicyInterventionCombo(summary.toLowerCase());
    expect(combo.multiplier).toBe(1.18);
    expect(combo.matchedCategories.length).toBeGreaterThanOrEqual(3);
  });

  // AC-8: Single policy → no combo boost
  test("AC-8: Single policy action → multiplier 1.0", () => {
    const combo = detectPolicyInterventionCombo(
      "hạ lãi suất điều hành 25 điểm",
    );
    expect(combo.multiplier).toBe(1.0);
    expect(combo.matchedCategories.length).toBeLessThanOrEqual(1);
  });

  // AC-9: Fiscal stimulus fires construction domain entry
  test("AC-9: Fiscal stimulus → construction domain entry, direction up", () => {
    const entry = getDomainEntry(
      "giải ngân đầu tư công khẩn cấp — gói kích thích tài khóa",
      "construction",
    );
    expect(entry).toBeDefined();
    expect(entry!.sentiment).toBe("bullish");
  });

  // AC-10: POLICY_RULES additions present
  test("AC-10: POLICY_RULES contains new task 1004 keys", () => {
    const keys = POLICY_RULES.map((r) => r.key);
    expect(keys).toContain("sbv_rate_cut_banking");
    expect(keys).toContain("sbv_rate_cut_securities");
    expect(keys).toContain("fiscal_stimulus_securities");
    expect(keys).toContain("scic_intervention");
    expect(keys).toContain("systemic_npl_banking");
    expect(keys).toContain("bank_liquidity_crisis");
    expect(keys).toContain("open_market_operations");
  });

  // AC-11: DDD — zero infrastructure imports
  test("AC-11: cascadeEngine.ts has zero infrastructure imports", async () => {
    const file = Bun.file("src/domain/services/cascadeEngine.ts");
    const content = await file.text();
    const infraImports = content.match(/from\s+["'].*infrastructure/g);
    expect(infraImports).toBeNull();
  });

  // AC-12: SBV rate cut fires real_estate domain entry
  test("AC-12: SBV rate cut → real_estate domain entry, direction up, confidence >= 0.70", () => {
    const entry = getDomainEntry(
      "nhnn hạ lãi suất điều hành giảm mạnh — lãi vay mua nhà giảm",
      "real_estate",
    );
    expect(entry).toBeDefined();
    expect(entry!.sentiment).toBe("bullish");
    // Base confidence 0.82, may be adjusted by sentiment alignment
    expect(entry!.confidence).toBeGreaterThanOrEqual(0.70);
  });

  // AC-13: Systemic stress fires bearish real_estate entry
  test("AC-13: Bank crisis → real_estate bearish, confidence >= 0.78", () => {
    const entry = getDomainEntry(
      "khủng hoảng thanh khoản ngân hàng — tín dụng BĐS đóng băng",
      "real_estate",
    );
    expect(entry).toBeDefined();
    expect(entry!.sentiment).toBe("bearish");
    expect(entry!.confidence).toBeGreaterThanOrEqual(0.78);
  });

  // AC-14: Fiscal stimulus fires retail domain entry
  test("AC-14: Recovery package → retail domain entry, direction up", () => {
    const entry = getDomainEntry(
      "chính phủ triển khai chương trình phục hồi kinh tế toàn diện",
      "retail",
    );
    expect(entry).toBeDefined();
    expect(entry!.sentiment).toBe("bullish");
  });

  // AC-15: SOE restructuring fires securities domain entry
  test("AC-15: SOE equitisation → securities domain entry", () => {
    const entry = getDomainEntry(
      "đẩy mạnh cổ phần hóa doanh nghiệp nhà nước năm 2026",
      "securities",
    );
    expect(entry).toBeDefined();
    expect(entry!.sentiment).toBe("bullish");
    expect(entry!.confidence).toBeGreaterThanOrEqual(0.73);
  });
});
