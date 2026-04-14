/**
 * Task 1224 — oil_gas_down → aviation BULLISH (inverse cascade rule)
 *
 * Reports 1193, 1204: oil price decline was classified as BEARISH for VJC.
 * Oil is ~35-40% of airline OPEX — lower oil = lower jet fuel cost = BULLISH.
 * Also: fuel tax = 0% on gasoline/kerosene → aviation BULLISH.
 *
 * Acceptance criteria:
 *   AC-1: oil price fall headline → aviation chain entry with direction="up"
 *   AC-2: "worst week" oil headline → aviation BULLISH (not bearish)
 *   AC-3: fuel tax 0% / giảm thuế xăng dầu → aviation BULLISH
 *   AC-4: oil price RISE still triggers aviation BEARISH (existing rule preserved)
 */

import { describe, test, expect } from "bun:test";
import { buildCausalChain } from "../domain/services/cascadeEngine";
import type { AnalysisEntry } from "../domain/services/newsNormalizer";

const baseSeed: AnalysisEntry = {
  id: "seed-1224",
  level: "global",
  sourceTitle: "",
  sourceUrl: "",
  sourceType: "news",
  publishedAt: new Date().toISOString(),
  sentiment: "bearish",
  impactScore: 8,
  impactDirection: "down",
  confidence: 0.85,
  timeHorizon: "short",
  summary: "",
  reasoning: "",
  affectedCountries: ["VN"],
  affectedDomains: ["oil_gas"],
  affectedActions: [],
  parentIds: [],
  tags: [],
  createdAt: new Date().toISOString(),
};

function aviationEntry(chain: ReturnType<typeof buildCausalChain>) {
  return chain.entries.find((e) => e.affectedDomains.includes("aviation"));
}

describe("Task 1224 — oil price decline → aviation BULLISH", () => {
  test("AC-1: 'oil price fall' → aviation chain entry with sentiment bullish", () => {
    const chain = buildCausalChain(
      { ...baseSeed, summary: "Oil Falls on Hopes for More US-Iran Talks, oil price fall signal" },
      [],
      undefined
    );
    const entry = aviationEntry(chain);
    expect(entry).toBeDefined();
    expect(entry?.sentiment).toBe("bullish");
  });

  test("AC-2: 'giá dầu giảm mạnh nhất 4 năm / worst week' → aviation BULLISH (not bearish)", () => {
    const chain = buildCausalChain(
      { ...baseSeed, summary: "Giá dầu thế giới có tuần giảm mạnh nhất 4 năm, worst week for crude" },
      [],
      undefined
    );
    const entry = aviationEntry(chain);
    expect(entry).toBeDefined();
    expect(entry?.sentiment).not.toBe("bearish");
  });

  test("AC-3: fuel tax 0% / giảm thuế xăng dầu về 0 → aviation BULLISH", () => {
    const chain = buildCausalChain(
      {
        ...baseSeed,
        summary: "Quốc hội chốt giảm thuế với xăng dầu về 0 đến hết tháng 6, giảm thuế nhiên liệu hàng không",
        sentiment: "neutral",
        impactDirection: "up",
      },
      [],
      undefined
    );
    const entry = aviationEntry(chain);
    expect(entry).toBeDefined();
    expect(entry?.sentiment).toBe("bullish");
  });

  test("AC-4: oil price RISE still triggers aviation BEARISH (existing rule preserved)", () => {
    const chain = buildCausalChain(
      {
        ...baseSeed,
        summary: "oil price rise, aviation fuel cost surges as crude climbs above $100",
        sentiment: "bullish",
        impactDirection: "up",
      },
      [],
      undefined
    );
    const entry = aviationEntry(chain);
    expect(entry).toBeDefined();
    expect(entry?.sentiment).toBe("bearish");
  });
});
