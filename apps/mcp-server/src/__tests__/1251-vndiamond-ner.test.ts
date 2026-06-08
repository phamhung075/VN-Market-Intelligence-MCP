// src/__tests__/1251-vndiamond-ner.test.ts
Bun.env["DB_PATH"] = ":memory:";
import { describe, it, expect } from "bun:test";
import { buildCausalChain } from "../domain/services/cascadeEngine.js";
import type { WatchlistEntry } from "../domain/services/cascadeEngine.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

/**
 * Task 1251 — VNDiamond exclusion NER: specific ticker must be extracted.
 *
 * When an article headline is "TCB bị loại khỏi rổ VNDiamond", the cascade
 * should produce a BEARISH watchlistImpact for TCB (the excluded stock),
 * even though TCB is in the `banking` domain and the VNDiamond exclusion
 * cascade rule fires on the `securities` domain.
 *
 * Root cause: detectStocksInText() only checks company name aliases, not the
 * raw ticker code. "TCB" as a 3-letter token in the headline is not detected
 * because "tcb" is not in TCB's alias list.
 *
 * Fix: cascade engine must also check if the watchlist ticker code appears
 * as a word-boundary match in the seed text (direct ticker mention = NER).
 */

function makeSeed(title: string, summary: string) {
  return {
    id: "test-seed",
    level: "action" as const,
    source: "cafef" as const,
    sentiment: "bearish" as const,
    confidence: 0.8,
    affectedCountries: ["VN"],
    affectedSectors: [],
    affectedActions: [],
    matchedKeywords: [],
    relevanceScore: 8,
    summary,
    title,
    sourceTitle: title,
    sourceUrl: "https://cafef.vn/test",
    sourceType: "news" as const,
    publishedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    impactScore: 8,
    impactDirection: "down" as const,
    timeHorizon: "short" as const,
    reasoning: "",
    affectedDomains: [],
    parentIds: [],
    tags: [],
  };
}

const WATCHLIST: WatchlistEntry[] = [
  { actionCode: "TCB", domain: "banking" as const, exchange: "HOSE" },
  { actionCode: "SSI", domain: "securities" as const, exchange: "HOSE" },
  { actionCode: "HPG", domain: "steel" as const, exchange: "HOSE" },
  { actionCode: "VCB", domain: "banking" as const, exchange: "HOSE" },
];

describe("Task 1251 — VNDiamond exclusion NER", () => {
  // AC-1: The excluded ticker (banking domain) must get a watchlistImpact
  it("AC-1: TCB (banking) gets BEARISH impact when headline says 'TCB bị loại khỏi rổ VNDiamond'", () => {
    const seed = makeSeed(
      "TCB bị loại khỏi rổ VNDiamond, quỹ ETF buộc phải bán cổ phiếu",
      "TCB bị loại khỏi rổ VNDiamond, quỹ thụ động phải bán theo quy tắc.",
    );
    const chain = buildCausalChain(seed, WATCHLIST, [], null, [], 6);

    const tcbImpact = chain.watchlistImpacts.find((i) => i.actionCode === "TCB");
    expect(tcbImpact).toBeDefined();
    // Should be bearish/down (ETF forced selling)
    expect(tcbImpact!.impactDirection).toBe("down");
  });

  // AC-2: SSI (securities domain — VNDiamond rule fires) also gets an impact
  it("AC-2: SSI (securities) still gets a watchlistImpact from the VNDiamond domain rule", () => {
    const seed = makeSeed(
      "TCB bị loại khỏi rổ VNDiamond",
      "TCB bị loại khỏi rổ VNDiamond.",
    );
    const chain = buildCausalChain(seed, WATCHLIST, [], null, [], 6);

    const ssiImpact = chain.watchlistImpacts.find((i) => i.actionCode === "SSI");
    expect(ssiImpact).toBeDefined();
  });

  // AC-3: HPG (steel — no domain rule, ticker NOT mentioned) gets NO impact
  it("AC-3: HPG (steel, not mentioned) gets NO watchlistImpact", () => {
    const seed = makeSeed(
      "TCB bị loại khỏi rổ VNDiamond",
      "TCB bị loại khỏi rổ VNDiamond.",
    );
    const chain = buildCausalChain(seed, WATCHLIST, [], null, [], 6);

    const hpgImpact = chain.watchlistImpacts.find((i) => i.actionCode === "HPG");
    expect(hpgImpact).toBeUndefined();
  });

  // AC-4: Direct ticker mention in non-VNDiamond context also triggers NER
  it("AC-4: VCB directly mentioned in article title gets an impact regardless of domain", () => {
    const seed = makeSeed(
      "VCB báo lãi quý 1 tăng 15%, dư nợ cho vay tăng mạnh",
      "Ngân hàng VCB công bố kết quả kinh doanh quý 1 ấn tượng.",
    );
    const chain = buildCausalChain(seed, WATCHLIST, [], null, [], 6);

    const vcbImpact = chain.watchlistImpacts.find((i) => i.actionCode === "VCB");
    expect(vcbImpact).toBeDefined();
  });

  // AC-5: Ticker code that appears as substring of another word should NOT match
  // e.g. "HPGAS" should not trigger HPG
  it("AC-5: HPG is NOT matched when it appears as part of a longer token (HPGAS)", () => {
    const seed = makeSeed(
      "HPGAS tăng giá mạnh sau thông báo",
      "Giá gas HPGAS tăng vọt sau thông báo điều chỉnh giá.",
    );
    const chain = buildCausalChain(seed, WATCHLIST, [], null, [], 6);

    const hpgImpact = chain.watchlistImpacts.find((i) => i.actionCode === "HPG");
    expect(hpgImpact).toBeUndefined();
  });

  // AC-6: Task 1266 — Vietnamese word "hụt" from "thiếu hụt" must NOT match ticker HUT
  // The word is lowercase Vietnamese; HUT ticker only matches when written all-caps.
  it("AC-6: HUT is NOT triggered by Vietnamese word 'hụt' in 'thiếu hụt'", () => {
    const hutWatchlist: WatchlistEntry[] = [
      { actionCode: "HUT", domain: "real_estate" as const, exchange: "HNX" },
      ...WATCHLIST,
    ];
    const seed = makeSeed(
      "Nguồn cung dầu sẽ càng thiếu hụt vì lệnh phong tỏa của Mỹ",
      "Nguồn cung dầu thô thiếu hụt nghiêm trọng do lệnh phong tỏa eo Hormuz.",
    );
    const chain = buildCausalChain(seed, hutWatchlist, [], null, [], 6);

    const hutImpact = chain.watchlistImpacts.find((i) => i.actionCode === "HUT");
    // HUT should NOT be triggered — "hụt" is a Vietnamese word, not the ticker
    expect(hutImpact).toBeUndefined();
  });

  // AC-7: HUT is correctly matched when "HUT" appears all-caps in article
  it("AC-7: HUT IS triggered when all-caps 'HUT' appears explicitly in headline", () => {
    const hutWatchlist: WatchlistEntry[] = [
      { actionCode: "HUT", domain: "real_estate" as const, exchange: "HNX" },
      ...WATCHLIST,
    ];
    const seed = makeSeed(
      "HUT tăng mạnh sau thông tin dự án mới được phê duyệt",
      "Cổ phiếu HUT của Tasco tăng 5% sau khi dự án được phê duyệt.",
    );
    const chain = buildCausalChain(seed, hutWatchlist, [], null, [], 6);

    const hutImpact = chain.watchlistImpacts.find((i) => i.actionCode === "HUT");
    expect(hutImpact).toBeDefined();
  });
});
