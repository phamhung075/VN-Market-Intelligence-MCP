/**
 * Task 1200 — Cascade "đầu tư công" missing sentiment polarity check
 *
 * "đầu tư công" (public investment) was always BULLISH.
 * It should check context:
 *   - "cắt giảm đầu tư công" / "đầu tư công giảm" / "đình trệ đầu tư công" → BEARISH
 *     for construction, steel, materials
 *   - "đẩy mạnh đầu tư công" / "tăng đầu tư công" / "giải ngân đầu tư công" → BULLISH (existing)
 *
 * Implementation approach: add compound negative keywords to sentimentClassifier
 * AND add bearish SECTOR_RULES before positive ones in cascadeEngine (first-match-wins).
 *
 * Layer: domain/services
 */
Bun.env["DB_PATH"] = ":memory:";
import { describe, it, expect } from "bun:test";
import { classifySentiment } from "../domain/services/sentimentClassifier.js";
import { buildCausalChain } from "../domain/services/cascadeEngine.js";
import type { AnalysisEntry } from "../domain/services/newsNormalizer.js";

// ── Sentiment classifier tests ──────────────────────────────────────────────

describe("Task 1200 — đầu tư công negative context: sentiment classifier", () => {

  it("AC-1: 'cắt giảm đầu tư công' → BEARISH", () => {
    const result = classifySentiment("Chính phủ thông báo cắt giảm đầu tư công trong 6 tháng tới.");
    expect(result.direction).toBe("bearish");
  });

  it("AC-2: 'đầu tư công chậm trễ' → BEARISH", () => {
    const result = classifySentiment("Đầu tư công chậm trễ nghiêm trọng, nhiều dự án đình trệ.");
    expect(result.direction).toBe("bearish");
  });

  it("AC-3: 'đình trệ đầu tư công' → BEARISH", () => {
    const result = classifySentiment("Đình trệ đầu tư công do thiếu vốn ngân sách, xây dựng bị ảnh hưởng nặng nề.");
    expect(result.direction).toBe("bearish");
  });

  it("AC-4: 'đầu tư công giảm mạnh' → BEARISH", () => {
    const result = classifySentiment("Vốn đầu tư công giảm mạnh 25% so với cùng kỳ năm ngoái.");
    expect(result.direction).toBe("bearish");
  });

  it("AC-5: 'giải ngân đầu tư công' (positive) → BULLISH (preserved)", () => {
    const result = classifySentiment("Giải ngân đầu tư công tăng mạnh, thúc đẩy tăng trưởng xây dựng.");
    expect(result.direction).toBe("bullish");
  });

  it("AC-6: 'đẩy mạnh đầu tư công' (positive) → BULLISH (preserved)", () => {
    const result = classifySentiment("Chính phủ đẩy mạnh đầu tư công, ưu tiên dự án trọng điểm quốc gia.");
    expect(result.direction).toBe("bullish");
  });
});

// ── Cascade engine tests ─────────────────────────────────────────────────────

const BASE_ENTRY: AnalysisEntry = {
  id: "test-1200",
  level: "country",
  sourceTitle: "",
  sourceUrl: "",
  sourceType: "news",
  publishedAt: new Date().toISOString(),
  sentiment: "bearish",
  impactScore: 7,
  impactDirection: "down",
  confidence: 0.80,
  timeHorizon: "short",
  summary: "",
  reasoning: "",
  affectedCountries: ["VN"],
  affectedDomains: [],
  affectedActions: [],
  parentIds: [],
  tags: [],
  createdAt: new Date().toISOString(),
};

const WATCHLIST = [
  { actionCode: "CTD", domain: "construction" as const, exchange: "HOSE" },
  { actionCode: "HPG", domain: "steel" as const, exchange: "HOSE" },
  { actionCode: "VHM", domain: "real_estate" as const, exchange: "HOSE" },
];

describe("Task 1200 — đầu tư công negative context: cascade engine", () => {

  it("AC-7: 'cắt giảm đầu tư công' → construction BEARISH in chain", () => {
    const entry: AnalysisEntry = {
      ...BASE_ENTRY,
      sourceTitle: "Cắt giảm đầu tư công ảnh hưởng ngành xây dựng",
      summary: "Cắt giảm đầu tư công do áp lực ngân sách, dự án đình trệ.",
    };
    const chain = buildCausalChain(entry, WATCHLIST);
    const constrEntry = chain.entries.find(
      (e) => e.affectedDomains.includes("construction") && e.sentiment === "bearish"
    );
    expect(constrEntry).toBeDefined();
  });

  it("AC-8: 'cắt giảm đầu tư công' → steel BEARISH in chain", () => {
    const entry: AnalysisEntry = {
      ...BASE_ENTRY,
      sourceTitle: "Cắt giảm đầu tư công ảnh hưởng ngành thép",
      summary: "Cắt giảm đầu tư công trong năm 2025, ảnh hưởng tiêu cực đến HPG.",
    };
    const chain = buildCausalChain(entry, WATCHLIST);
    const steelEntry = chain.entries.find(
      (e) => e.affectedDomains.includes("steel") && e.sentiment === "bearish"
    );
    expect(steelEntry).toBeDefined();
  });

  it("AC-9: 'tăng đầu tư công' still → construction BULLISH (not broken)", () => {
    const entry: AnalysisEntry = {
      ...BASE_ENTRY,
      sourceTitle: "Tăng đầu tư công, thúc đẩy xây dựng hạ tầng",
      summary: "Chính phủ quyết định tăng đầu tư công cho hạ tầng giao thông năm nay.",
      sentiment: "bullish",
      impactDirection: "up",
    };
    const chain = buildCausalChain(entry, WATCHLIST);
    const constrEntry = chain.entries.find(
      (e) => e.affectedDomains.includes("construction")
    );
    expect(constrEntry?.sentiment).toBe("bullish");
  });
});
