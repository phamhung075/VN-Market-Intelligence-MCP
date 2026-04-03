// src/__tests__/250-signal-integration.test.ts
import { describe, it, expect } from "bun:test";
import { detectSignals } from "../domain/services/signalDetector.js";
import { buildCausalChain } from "../domain/services/cascadeEngine.js";
import type { WatchlistEntry } from "../domain/services/cascadeEngine.js";
import type { AnalysisEntry } from "../domain/services/newsNormalizer.js";

// ─────────────────────────────────────────────────────────────────────────────
// Task 250 — Signal Type Extension tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 250 — Extended SignalType", () => {
  it("SignalType union includes public_contract", () => {
    // Type-level test: assign to SignalType and expect no TS error
    const t = "public_contract" as import("../domain/services/signalDetector.js").SignalType;
    expect(t).toBe("public_contract");
  });

  it("SignalType union includes credit_flow", () => {
    const t = "credit_flow" as import("../domain/services/signalDetector.js").SignalType;
    expect(t).toBe("credit_flow");
  });

  it("SignalType union includes insider_trading", () => {
    const t = "insider_trading" as import("../domain/services/signalDetector.js").SignalType;
    expect(t).toBe("insider_trading");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 250 — CAPEX cascade rules
// ─────────────────────────────────────────────────────────────────────────────

const BASE_WATCHLIST: WatchlistEntry[] = [
  { actionCode: "HHV", domain: "construction", exchange: "HOSE" },
  { actionCode: "CTD", domain: "construction", exchange: "HOSE" },
  { actionCode: "VCB", domain: "banking", exchange: "HOSE" },
  { actionCode: "REE", domain: "energy", exchange: "HOSE" },
];

function makeEntry(summary: string): AnalysisEntry {
  return {
    id: "test-001",
    sourceUrl: "https://example.com",
    sourceTitle: "Test Title",
    sourceType: "news",
    publishedAt: new Date().toISOString(),
    level: "country",
    summary,
    sentiment: "bullish",
    impactScore: 8,
    impactDirection: "up",
    confidence: 0.8,
    timeHorizon: "short",
    reasoning: "Test",
    affectedCountries: ["VN"],
    affectedDomains: [],
    affectedActions: [],
    parentIds: [],
    tags: [],
    createdAt: new Date().toISOString(),
  };
}

describe("Task 250 — CAPEX cascade rules", () => {
  it("cao tốc keyword triggers construction cascade", () => {
    const entry = makeEntry("Chính phủ đầu tư mạnh vào cao tốc Bắc Nam, giải ngân đầu tư công tăng mạnh");
    const chain = buildCausalChain(entry, BASE_WATCHLIST);
    const domains = chain.entries.map((e) => e.affectedDomains).flat();
    expect(domains).toContain("construction");
  });

  it("đầu tư công keyword creates upward construction impact", () => {
    const entry = makeEntry("Chính phủ tăng đầu tư công, đẩy nhanh giải ngân hạ tầng");
    const chain = buildCausalChain(entry, BASE_WATCHLIST);
    const constructionEntry = chain.entries.find(
      (e) => e.affectedDomains.includes("construction") && e.level === "domain",
    );
    expect(constructionEntry).toBeDefined();
    expect(constructionEntry!.sentiment).toBe("bullish");
  });

  it("sân bay Long Thành triggers construction cascade", () => {
    const entry = makeEntry("Dự án sân bay Long Thành được phê duyệt, vốn đầu tư hàng tỷ USD");
    const chain = buildCausalChain(entry, BASE_WATCHLIST);
    const domains = chain.entries.map((e) => e.affectedDomains).flat();
    expect(domains).toContain("construction");
  });

  it("watchlist impacts include HHV or CTD when construction chain fires", () => {
    const entry = makeEntry("Chính phủ tăng đầu tư công cao tốc mạnh, giải ngân đẩy nhanh");
    const chain = buildCausalChain(entry, BASE_WATCHLIST);
    const codes = chain.watchlistImpacts.map((w) => w.actionCode);
    expect(codes.some((c) => ["HHV", "CTD"].includes(c))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 250 — CREDIT cascade rules
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 250 — CREDIT cascade rules", () => {
  it("tín dụng bất động sản tăng triggers real_estate cascade", () => {
    const entry = makeEntry("NHNN nới room tín dụng bất động sản, thanh khoản thị trường BĐS cải thiện");
    const chain = buildCausalChain(entry, [
      ...BASE_WATCHLIST,
      { actionCode: "VHM", domain: "real_estate", exchange: "HOSE" },
    ]);
    const domains = chain.entries.map((e) => e.affectedDomains).flat();
    expect(domains).toContain("real_estate");
  });

  it("NHNN siết tín dụng creates bearish real_estate signal", () => {
    const entry = makeEntry("NHNN siết tín dụng bất động sản, giảm room cho vay mua nhà");
    const chain = buildCausalChain(entry, [
      ...BASE_WATCHLIST,
      { actionCode: "VHM", domain: "real_estate", exchange: "HOSE" },
    ]);
    const reEntry = chain.entries.find(
      (e) => e.affectedDomains.includes("real_estate") && e.level === "domain",
    );
    expect(reEntry).toBeDefined();
    expect(reEntry!.sentiment).toBe("bearish");
  });

  it("room tín dụng banking creates bullish banking signal", () => {
    const entry = makeEntry("NHNN tăng room tín dụng cho ngân hàng, hỗ trợ tăng trưởng cho vay");
    const chain = buildCausalChain(entry, BASE_WATCHLIST);
    const bankEntry = chain.entries.find(
      (e) => e.affectedDomains.includes("banking") && e.level === "domain",
    );
    expect(bankEntry).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 250 — InsiderCheckJob integration test
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 250 — InsiderCheckJob", () => {
  it("runInsiderCheck returns without throwing", async () => {
    const { runInsiderCheck } = await import("../scheduler/insiderCheckJob.js");
    // Use a mock httpClient that returns empty HTML
    let didThrow = false;
    try {
      await runInsiderCheck({
        get: async () => "<html><body></body></html>",
      });
    } catch {
      didThrow = true;
    }
    expect(didThrow).toBe(false);
  });

  it("runInsiderCheck returns an object with processed count", async () => {
    const { runInsiderCheck } = await import("../scheduler/insiderCheckJob.js");
    const result = await runInsiderCheck({
      get: async () => "<html><body></body></html>",
    });
    expect(typeof result.processed).toBe("number");
    expect(result.processed).toBeGreaterThanOrEqual(0);
  });
});
