import { describe, it, expect } from "bun:test";
import { buildCausalChain } from "../domain/services/cascadeEngine.js";
import type { AnalysisEntry } from "../domain/services/newsNormalizer.js";

const DSC_ARTICLE: AnalysisEntry = {
  id: "dsc-ceo-bearish",
  level: "country",
  sourceTitle: "Tổng Giám đốc DSC: Những nhịp điều chỉnh của VN-Index nếu xảy ra có thể sẽ rất sâu và đau",
  sourceUrl: "",
  sourceType: "news",
  summary: "Tổng Giám đốc DSC cảnh báo nhà đầu tư rằng thị trường chứng khoán có thể điều chỉnh sâu và đau. Những nhịp điều chỉnh sâu nếu xảy ra có thể khiến VN-Index rất sâu và đau.",
  sentiment: "bearish",
  impactScore: 4,         // below default broadcastMinImpact=6 — must still broadcast via analyst-warning path
  impactDirection: "down",
  confidence: 0.7,
  timeHorizon: "short",
  reasoning: "CEO analyst bearish warning for VN-Index deep correction",
  affectedCountries: ["VN"],
  affectedDomains: ["securities"],
  affectedActions: [],    // market-wide — no specific stock
  parentIds: [],
  tags: [],
  publishedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
};

const WATCHLIST = [
  { actionCode: "VCB", domain: "banking" as const, exchange: "HOSE" },
  { actionCode: "VNM", domain: "retail" as const, exchange: "HOSE" },
  { actionCode: "SSI", domain: "securities" as const, exchange: "HOSE" },
];

describe("Task 1334b — CEO bearish analyst warning broadcast", () => {
  it("DSC CEO warning article triggers market-wide broadcast to all watchlist stocks", () => {
    const chain = buildCausalChain(DSC_ARTICLE, WATCHLIST);

    const broadcastCodes = chain.watchlistImpacts.map((w) => w.actionCode);
    // Must reach VCB and VNM (not just SSI from direct domain match)
    expect(broadcastCodes).toContain("VCB");   // RED: currently missing
    expect(broadcastCodes).toContain("VNM");   // RED: currently missing
  });

  it("broadcast entries from CEO warning carry BEARISH sentiment", () => {
    const chain = buildCausalChain(DSC_ARTICLE, WATCHLIST);

    const vcbImpact = chain.watchlistImpacts.find((w) => w.actionCode === "VCB");
    expect(vcbImpact).toBeDefined();
    // Impact direction must be "down" (bearish cascade — ImpactDirection type uses "down" not "negative")
    expect(vcbImpact!.impactDirection).toBe("down");
  });

  it("broadcast entries use analyst-warning path reasoning marker", () => {
    const chain = buildCausalChain(DSC_ARTICLE, WATCHLIST);

    const entries = chain.entries.filter(
      (e) => e.level === "action" && e.affectedActions.includes("VCB")
    );
    expect(entries.length).toBeGreaterThan(0);
    // Reasoning must mention analyst-warning cascade path
    expect(entries[0]!.reasoning).toMatch(/analyst.warning.*cascade|market-wide cascade/i);
  });
});
