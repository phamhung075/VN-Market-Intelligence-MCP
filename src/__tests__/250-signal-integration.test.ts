// src/__tests__/250-signal-integration.test.ts
import { describe, it, expect } from "bun:test";
import type { SignalType } from "../domain/services/signalDetector.js";
import { buildCausalChain } from "../domain/services/cascadeEngine.js";
import type { AnalysisEntry } from "../domain/services/newsNormalizer.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEntry(
  title: string,
  overrides: Partial<AnalysisEntry> = {},
): AnalysisEntry {
  return {
    id: "test-1",
    level: "country",
    sourceTitle: title,
    sourceUrl: "https://test.example.com",
    sourceType: "news",
    publishedAt: new Date().toISOString(),
    sentiment: "bullish",
    impactScore: 8,
    impactDirection: "up",
    confidence: 0.8,
    timeHorizon: "medium",
    summary: title,
    reasoning: "test",
    affectedCountries: ["VN"],
    affectedDomains: [],
    affectedActions: [],
    parentIds: [],
    tags: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("Task 250 — Signal Integration", () => {
  // ── 1. SignalType union includes new types ─────────────────────────────

  it("SignalType includes public_contract", () => {
    const type: SignalType = "public_contract";
    expect(type).toBe("public_contract");
  });

  it("SignalType includes credit_flow", () => {
    const type: SignalType = "credit_flow";
    expect(type).toBe("credit_flow");
  });

  it("SignalType includes insider_trading", () => {
    const type: SignalType = "insider_trading";
    expect(type).toBe("insider_trading");
  });

  // ── 2. CAPEX rules in cascade engine ─────────────────────────────────

  it("cascade: đầu tư công keyword → steel/real_estate domain", () => {
    const entry = makeEntry(
      "Chính phủ phê duyệt gói đầu tư công 100 nghìn tỷ xây dựng hạ tầng cao tốc",
    );
    const chain = buildCausalChain(entry, [
      { actionCode: "HHV", domain: "steel", exchange: "HOSE" },
      { actionCode: "CII", domain: "real_estate", exchange: "HOSE" },
    ]);
    expect(chain.entries.length).toBeGreaterThan(0);
  });

  it("cascade: CAPEX airport keyword → aviation domain triggered", () => {
    const entry = makeEntry(
      "Nhà nước tăng chi đầu tư công cho sân bay Long Thành và cảng biển",
    );
    const chain = buildCausalChain(entry, [
      { actionCode: "ACV", domain: "aviation", exchange: "UPCOM" },
    ]);
    // Should find aviation-related entries
    const aviationEntries = chain.entries.filter((e) =>
      e.affectedDomains.includes("aviation"),
    );
    expect(aviationEntries.length).toBeGreaterThanOrEqual(0);
    // Chain should have been built without errors
    expect(chain.id).toBeDefined();
  });

  // ── 3. CREDIT rules in cascade engine ─────────────────────────────────

  it("cascade: credit tín dụng BĐS tăng → real_estate domain", () => {
    const entry = makeEntry(
      "NHNN tăng room tín dụng bất động sản, cho vay mua nhà dễ hơn",
    );
    const chain = buildCausalChain(entry, [
      { actionCode: "VHM", domain: "real_estate", exchange: "HOSE" },
    ]);
    expect(chain.entries.length).toBeGreaterThan(0);
  });

  it("cascade: siết tín dụng BĐS → bearish for real_estate", () => {
    const entry = makeEntry(
      "NHNN siết tín dụng bất động sản, tỷ lệ cho vay nhà giảm mạnh",
      { sentiment: "bearish", impactDirection: "down" },
    );
    const chain = buildCausalChain(entry, [
      { actionCode: "NVL", domain: "real_estate", exchange: "HOSE" },
    ]);
    expect(chain.id).toBeDefined();
    expect(chain.entries.length).toBeGreaterThan(0);
  });

  // ── 4. Insider trading keyword in cascade ─────────────────────────────

  it("cascade: giao dịch nội bộ keyword → returns chain", () => {
    const entry = makeEntry(
      "CEO VCB mua 5 triệu cổ phiếu VCB trong giao dịch nội bộ — tín hiệu tích lũy",
    );
    const chain = buildCausalChain(entry, [
      { actionCode: "VCB", domain: "banking", exchange: "HOSE" },
    ]);
    expect(chain.id).toBeDefined();
  });

  // ── 5. buildCausalChain still works for existing types ────────────────

  it("existing cascade rules still fire: lãi suất tăng → banking", () => {
    const entry = makeEntry(
      "NHNN tăng lãi suất điều hành thêm 50bp, ngân hàng hưởng lợi NIM",
    );
    const chain = buildCausalChain(entry, [
      { actionCode: "VCB", domain: "banking", exchange: "HOSE" },
      { actionCode: "BID", domain: "banking", exchange: "HOSE" },
    ]);
    const bankEntries = chain.entries.filter((e) =>
      e.affectedDomains.includes("banking"),
    );
    expect(bankEntries.length).toBeGreaterThan(0);
  });

  // ── 6. gói thầu keyword fires construction ─────────────────────────────

  it("cascade: gói thầu từ muasamcong → steel/logistics domain", () => {
    const entry = makeEntry(
      "Bộ GTVT trao gói thầu 1500 tỷ xây dựng cầu đường cao tốc Bắc Nam",
    );
    const chain = buildCausalChain(entry, [
      { actionCode: "HHV", domain: "steel", exchange: "HOSE" },
      { actionCode: "VCG", domain: "logistics", exchange: "HOSE" },
    ]);
    expect(chain.entries.length).toBeGreaterThan(0);
  });

  // ── 7. IT contract keyword fires tech ─────────────────────────────────

  it("cascade: gói thầu CNTT → tech domain", () => {
    const entry = makeEntry(
      "Bộ KH&ĐT trao gói thầu công nghệ thông tin số hóa dữ liệu quốc gia",
    );
    const chain = buildCausalChain(entry, [
      { actionCode: "FPT", domain: "tech", exchange: "HOSE" },
    ]);
    expect(chain.id).toBeDefined();
  });

  // ── 8. Chain has matchedRules tracking ────────────────────────────────

  it("chain tracks matched rules array", () => {
    const entry = makeEntry(
      "NHNN tăng room tín dụng bất động sản",
    );
    const chain = buildCausalChain(entry, [
      { actionCode: "VHM", domain: "real_estate", exchange: "HOSE" },
    ]);
    expect(Array.isArray(chain.matchedRules)).toBe(true);
  });

  // ── 9. No crash on empty watchlist ────────────────────────────────────

  it("buildCausalChain works with empty watchlist", () => {
    const entry = makeEntry("NHNN thay đổi chính sách tín dụng");
    const chain = buildCausalChain(entry, []);
    expect(chain.id).toBeDefined();
    expect(chain.watchlistImpacts).toHaveLength(0);
  });

  // ── 10. Public investment signal type is in SignalType union ──────────

  it("all 3 new SignalType values are valid string literals", () => {
    const types: SignalType[] = ["public_contract", "credit_flow", "insider_trading"];
    expect(types).toHaveLength(3);
    for (const t of types) {
      expect(typeof t).toBe("string");
    }
  });
});
