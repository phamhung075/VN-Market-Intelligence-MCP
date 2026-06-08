/**
 * Task 1264 — Hormuz blockade cascade rule gap: extend to VJC + BSR
 *
 * Problem: Hormuz blockade rule cascaded to PVD/PVS/GAS (oil_gas) but was missing:
 *   - VJC (Vietnam Airlines) — aviation domain (BEARISH: jet fuel costs up)
 *   - BSR (Bamboo Shipping) — logistics domain (BULLISH: shipping premiums up)
 *
 * This test verifies the fixed watchlist now includes VJC + BSR with correct domains,
 * so the Hormuz cascade rules impact them properly.
 *
 * Layer: domain/services
 */
Bun.env["DB_PATH"] = ":memory:";
import { describe, it, expect } from "bun:test";
import { buildCausalChain } from "../domain/services/cascadeEngine.js";
import type { AnalysisEntry } from "../domain/services/newsNormalizer.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

const BASE_ENTRY: AnalysisEntry = {
  id: "test-1264",
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
  affectedDomains: [],
  affectedActions: [],
  parentIds: [],
  tags: [],
  createdAt: new Date().toISOString(),
};

function makeEntry(sourceTitle: string, summary: string): AnalysisEntry {
  return { ...BASE_ENTRY, sourceTitle, summary };
}

const WATCHLIST = [
  // Oil gas — BULLISH on supply shock
  { actionCode: "PVD", domain: "oil_gas" as const, exchange: "HOSE" },
  { actionCode: "PVS", domain: "oil_gas" as const, exchange: "HOSE" },
  { actionCode: "GAS", domain: "oil_gas" as const, exchange: "HOSE" },
  // Aviation — BEARISH on supply shock (fuel costs up)
  { actionCode: "VJC", domain: "aviation" as const, exchange: "HOSE" },
  { actionCode: "HVN", domain: "aviation" as const, exchange: "HOSE" },
  // Oil gas — BSR (Binh Son Refinery) is oil_gas, not logistics (FIX-1264)
  { actionCode: "BSR", domain: "oil_gas" as const, exchange: "UPCOM" },
  { actionCode: "GMD", domain: "logistics" as const, exchange: "HOSE" },
  // Securities — BEARISH on risk-off market sentiment
  { actionCode: "SSI", domain: "securities" as const, exchange: "HOSE" },
];

describe("Task 1264 — Hormuz blockade cascade: VJC + BSR coverage", () => {

  it("Hormuz blockade → VJC (aviation) impacted with BEARISH direction", () => {
    const entry = makeEntry(
      "Hormuz Strait blockade threatens oil supply",
      "hormuz strait blockade causes oil supply shock, aviation fuel costs surge.",
    );
    const chain = buildCausalChain(entry, WATCHLIST);

    // VJC should appear in watchlistImpacts with direction "down" (BEARISH)
    const vjcImpact = chain.watchlistImpacts.find((w) => w.actionCode === "VJC");
    expect(vjcImpact).toBeDefined();
    expect(vjcImpact?.impactDirection).toBe("down");
  });

  // FIX-1264: BSR is Binh Son Refinery (oil_gas), NOT logistics.
  // Hormuz blockade = oil price spike = upstream oil companies benefit = BULLISH.
  it("Hormuz blockade → BSR (oil_gas refinery) impacted with BULLISH direction", () => {
    const entry = makeEntry(
      "Strait of Hormuz blockade disrupts oil supply",
      "hormuz strait blockade causes oil supply shock, crude oil price surges.",
    );
    const chain = buildCausalChain(entry, WATCHLIST);

    // BSR should appear in watchlistImpacts with direction "up" (BULLISH)
    const bsrImpact = chain.watchlistImpacts.find((w) => w.actionCode === "BSR");
    expect(bsrImpact).toBeDefined();
    expect(bsrImpact?.impactDirection).toBe("up");
  });

  it("Hormuz blockade → both VJC and BSR appear in cascade chain", () => {
    const entry = makeEntry(
      "Iran blockade Hormuz impacts oil supply aviation shipping",
      "phong tỏa eo biển hormuz causes gián đoạn nguồn cung dầu, affecting aviation fuel and logistics shipping.",
    );
    const chain = buildCausalChain(entry, WATCHLIST);

    const vjcFound = chain.watchlistImpacts.some((w) => w.actionCode === "VJC");
    const bsrFound = chain.watchlistImpacts.some((w) => w.actionCode === "BSR");

    expect(vjcFound).toBe(true);
    expect(bsrFound).toBe(true);
  });

  it("Hormuz blockade → VJC confidence > 0 (domain rule matched)", () => {
    const entry = makeEntry(
      "Hormuz blockade oil supply shock",
      "hormuz strait blockade causes oil supply shock.",
    );
    const chain = buildCausalChain(entry, WATCHLIST);

    const vjcImpact = chain.watchlistImpacts.find((w) => w.actionCode === "VJC");
    expect(vjcImpact?.confidence ?? 0).toBeGreaterThan(0);
  });

  it("Hormuz blockade → BSR confidence > 0 (domain rule matched)", () => {
    const entry = makeEntry(
      "Hormuz blockade oil supply shock",
      "hormuz strait blockade causes oil supply shock.",
    );
    const chain = buildCausalChain(entry, WATCHLIST);

    const bsrImpact = chain.watchlistImpacts.find((w) => w.actionCode === "BSR");
    expect(bsrImpact?.confidence ?? 0).toBeGreaterThan(0);
  });

});
