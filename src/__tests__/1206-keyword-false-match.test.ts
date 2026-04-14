import { describe, test, expect } from "bun:test";
import { buildCausalChain } from "../domain/services/cascadeEngine";
import type { AnalysisEntry } from "../domain/services/newsNormalizer";

const baseSeed: AnalysisEntry = {
  id: "seed-1206",
  level: "global",
  sourceTitle: "",
  sourceUrl: "",
  sourceType: "news",
  publishedAt: new Date().toISOString(),
  sentiment: "bullish",
  impactScore: 7,
  impactDirection: "up",
  confidence: 0.8,
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

/** Extract the flat list of domain strings across all chain entries. */
function chainDomains(chain: ReturnType<typeof buildCausalChain>): string[] {
  return chain.entries.flatMap((e) => e.affectedDomains);
}

describe("Task 1206 — keyword false match fixes", () => {
  test("AC-7: 'nhu cầu thép toàn cầu tăng mạnh' does NOT trigger construction", () => {
    const chain = buildCausalChain(
      { ...baseSeed, summary: "nhu cầu thép toàn cầu tăng mạnh theo đà phục hồi kinh tế" },
      [],
      undefined
    );
    const domains = chainDomains(chain);
    expect(domains).not.toContain("construction");
    expect(domains).toContain("steel");
  });

  test("AC-8: 'đất vàng trung tâm TP.HCM' triggers real_estate (bullish), not gold_mining", () => {
    const chain = buildCausalChain(
      { ...baseSeed, summary: "dự án đất vàng trung tâm TP.HCM ra mắt" },
      [],
      undefined
    );
    const domains = chainDomains(chain);
    expect(domains).toContain("real_estate");
    expect(domains).not.toContain("gold_mining");
    const reEntry = chain.entries.find((e) => e.affectedDomains.includes("real_estate"));
    expect(reEntry?.sentiment).toBe("bullish");
  });

  test("AC-9: 'xây cầu vượt cao tốc Bắc-Nam' still triggers construction", () => {
    const chain = buildCausalChain(
      { ...baseSeed, summary: "dự án xây cầu vượt cao tốc Bắc-Nam được giải ngân" },
      [],
      undefined
    );
    const domains = chainDomains(chain);
    expect(domains).toContain("construction");
  });

  test("'toàn cầu hóa' does NOT trigger construction", () => {
    const chain = buildCausalChain(
      { ...baseSeed, summary: "toàn cầu hóa thúc đẩy thương mại quốc tế" },
      [],
      undefined
    );
    const domains = chainDomains(chain);
    expect(domains).not.toContain("construction");
  });
});
