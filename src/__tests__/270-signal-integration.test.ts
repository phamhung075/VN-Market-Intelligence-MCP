/**
 * Task 270 — Signal Integration: pharma_event + PHARMA_RULES cascade
 *
 * Tests:
 *   1. SignalType includes "pharma_event"
 *   2. DomainType includes "pharmaceutical"
 *   3. Cascade engine PHARMA_RULES: outbreak → pharmaceutical (bullish)
 *   4. Cascade engine PHARMA_RULES: drug_price_regulation → pharmaceutical (bearish)
 *   5. Cascade engine PHARMA_RULES: hospital_budget_increase → pharmaceutical (bullish)
 *   6. Pharma domain is correctly matched from seed entries
 *   7. Outbreak text triggers pharma domain chain entry
 *   8. Price cap text triggers pharma bearish chain entry
 */

import { describe, it, expect } from "bun:test";
import type { SignalType } from "../domain/services/signalDetector.js";
import type { DomainType } from "../../bctc-schema.js";
import {
  buildCausalChain,
  type WatchlistEntry,
} from "../domain/services/cascadeEngine.js";
import type { AnalysisEntry } from "../domain/services/newsNormalizer.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeEntry(summary: string, overrides: Partial<AnalysisEntry> = {}): AnalysisEntry {
  return {
    id: "test-001",
    level: "country",
    sourceTitle: "Test pharma event",
    sourceUrl: "https://example.com/test",
    sourceType: "news",
    publishedAt: new Date().toISOString(),
    sentiment: "neutral",
    impactScore: 7,
    impactDirection: "neutral",
    confidence: 0.7,
    timeHorizon: "short",
    summary,
    reasoning: "Test reasoning",
    affectedCountries: ["Vietnam"],
    affectedDomains: [],
    affectedActions: [],
    parentIds: [],
    tags: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const PHARMA_WATCHLIST: WatchlistEntry[] = [
  { actionCode: "DHG", domain: "pharmaceutical", exchange: "HOSE" },
  { actionCode: "IMP", domain: "pharmaceutical", exchange: "HOSE" },
  { actionCode: "DBD", domain: "pharmaceutical", exchange: "HNX" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 270 — Signal Integration", () => {
  it("SignalType union includes 'pharma_event'", () => {
    // Compile-time check via assignment — if this fails to compile, SignalType is missing pharma_event
    const signalType: SignalType = "pharma_event";
    expect(signalType).toBe("pharma_event");
  });

  it("DomainType union includes 'pharmaceutical'", () => {
    // Compile-time check via assignment
    const domainType: DomainType = "pharmaceutical";
    expect(domainType).toBe("pharmaceutical");
  });

  it("cascade engine PHARMA_RULES: outbreak text → pharmaceutical domain entry (bullish)", () => {
    const entry = makeEntry(
      "dịch sốt xuất huyết bùng phát tại tp.hcm, nhu cầu thuốc điều trị tăng cao",
    );
    const chain = buildCausalChain(entry, PHARMA_WATCHLIST);
    const pharmaEntry = chain.entries.find(
      (e) => e.affectedDomains.includes("pharmaceutical") && e.level === "domain",
    );
    expect(pharmaEntry).toBeDefined();
    expect(pharmaEntry!.sentiment).toBe("bullish");
  });

  it("cascade engine PHARMA_RULES: drug price regulation → pharmaceutical bearish", () => {
    const entry = makeEntry(
      "bộ y tế ban hành giá trần thuốc mới, điều chỉnh trần giá thuốc nhập khẩu",
    );
    const chain = buildCausalChain(entry, PHARMA_WATCHLIST);
    const pharmaEntry = chain.entries.find(
      (e) => e.affectedDomains.includes("pharmaceutical") && e.level === "domain",
    );
    expect(pharmaEntry).toBeDefined();
    expect(pharmaEntry!.sentiment).toBe("bearish");
  });

  it("cascade engine PHARMA_RULES: hospital budget increase → pharmaceutical bullish", () => {
    const entry = makeEntry(
      "bộ y tế tăng ngân sách mua thuốc cho bệnh viện công lên 30% trong năm 2026",
    );
    const chain = buildCausalChain(entry, PHARMA_WATCHLIST);
    const pharmaEntry = chain.entries.find(
      (e) => e.affectedDomains.includes("pharmaceutical") && e.level === "domain",
    );
    expect(pharmaEntry).toBeDefined();
    expect(pharmaEntry!.sentiment).toBe("bullish");
  });

  it("outbreak chain: watchlist impact for pharmaceutical stocks is bullish", () => {
    const entry = makeEntry(
      "dịch bệnh cúm a bùng phát, vaccine distribution demand increases across vietnam",
    );
    const chain = buildCausalChain(entry, PHARMA_WATCHLIST);
    const pharmaImpacts = chain.watchlistImpacts.filter((w) =>
      ["DHG", "IMP", "DBD"].includes(w.actionCode),
    );
    // At least one pharma stock should be in watchlist impacts
    expect(pharmaImpacts.length).toBeGreaterThan(0);
  });

  it("unrelated text does not trigger pharmaceutical domain", () => {
    const entry = makeEntry(
      "giá dầu tăng mạnh, ngành dầu khí hưởng lợi từ giá dầu toàn cầu tăng",
    );
    const chain = buildCausalChain(entry, PHARMA_WATCHLIST);
    const pharmaEntry = chain.entries.find(
      (e) => e.affectedDomains.includes("pharmaceutical"),
    );
    expect(pharmaEntry).toBeUndefined();
  });

  it("drug price regulation does not trigger pharmaceutical bullish", () => {
    const entry = makeEntry(
      "giá trần thuốc nhập khẩu giảm mạnh theo chỉ thị của bộ y tế",
    );
    const chain = buildCausalChain(entry, PHARMA_WATCHLIST);
    const pharmaBullish = chain.entries.find(
      (e) =>
        e.affectedDomains.includes("pharmaceutical") &&
        e.sentiment === "bullish",
    );
    // Should be bearish, not bullish
    expect(pharmaBullish).toBeUndefined();
  });

  it("pharma watchlist stocks are included in chain impacts when pharma rule fires", () => {
    const entry = makeEntry(
      "dịch bệnh lây lan nhanh, nhu cầu thuốc kháng sinh và vaccine tăng mạnh tại các tỉnh",
    );
    const chain = buildCausalChain(entry, PHARMA_WATCHLIST);
    // Chain should have entries with pharmaceutical domain
    const hasPharma = chain.entries.some((e) =>
      e.affectedDomains.includes("pharmaceutical"),
    );
    expect(hasPharma).toBe(true);
  });
});
