/**
 * FIX-1264 — Hormuz blockade cascade gap: Vietnamese article title variant
 *
 * Bug: Article "Đàm phán đổ vỡ, eo Hormuz bị phong tỏa, thị trường mất động lực tăng"
 * (impact 9.0 bearish) did NOT cascade to BSR (oil_gas BULLISH) or VJC (aviation BEARISH).
 *
 * Root cause A: Keyword mismatch — existing keywords use "eo biển hormuz" but
 *   the article uses "eo hormuz" (without "biển"). None of the Vietnamese keyword
 *   variants matched the actual article phrasing.
 *
 * Root cause B: BSR (Binh Son Refinery) was incorrectly placed in the logistics
 *   affected_actions as direction "down", instead of oil_gas as direction "up".
 *   BSR is a Vietnamese oil refinery — Hormuz blockade = oil price up = BSR BULLISH.
 *
 * Fix:
 *   1. Add "eo hormuz bị phong tỏa" and "hormuz bị phong tỏa" to oil_gas + aviation rules
 *   2. Move BSR from logistics rule to oil_gas rule with direction "up"
 *   3. Remove BSR from logistics affected_actions
 *
 * Layer: domain/services (pure function — no I/O)
 */
Bun.env["DB_PATH"] = ":memory:";
import { describe, it, expect } from "bun:test";
import { buildCausalChain } from "../domain/services/cascadeEngine.js";
import type { AnalysisEntry } from "../domain/services/newsNormalizer.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE_ENTRY: AnalysisEntry = {
  id: "test-fix-1264",
  level: "global",
  sourceTitle: "",
  sourceUrl: "",
  sourceType: "news",
  publishedAt: new Date().toISOString(),
  sentiment: "bearish",
  impactScore: 9,
  impactDirection: "down",
  confidence: 0.90,
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

// Watchlist covering oil_gas (BSR) and aviation (VJC) and real_estate (HUT)
const WATCHLIST = [
  { actionCode: "BSR", domain: "oil_gas" as const, exchange: "UPCOM" },
  { actionCode: "GAS", domain: "oil_gas" as const, exchange: "HOSE" },
  { actionCode: "PVD", domain: "oil_gas" as const, exchange: "HOSE" },
  { actionCode: "VJC", domain: "aviation" as const, exchange: "HOSE" },
  { actionCode: "HVN", domain: "aviation" as const, exchange: "HOSE" },
  { actionCode: "HUT", domain: "real_estate" as const, exchange: "HNX" },
];

// ── The exact article from the bug report ────────────────────────────────────

const HORMUZ_ARTICLE_TITLE =
  "Đàm phán đổ vỡ, eo Hormuz bị phong tỏa, thị trường mất động lực tăng";

// summary = (title + '. ' + content).slice(0, 500) — simulate realistic summary
const HORMUZ_ARTICLE_SUMMARY =
  "Đàm phán đổ vỡ, eo Hormuz bị phong tỏa, thị trường mất động lực tăng. " +
  "Căng thẳng địa chính trị leo thang khi eo biển chiến lược bị phong tỏa, " +
  "đẩy giá dầu thô tăng mạnh, gây áp lực chi phí nhiên liệu toàn cầu.";

// ── Tests ────────────────────────────────────────────────────────────────────

describe("FIX-1264 — Hormuz cascade: Vietnamese article 'eo Hormuz bị phong tỏa'", () => {

  it("RED→GREEN: exact article title triggers oil_gas BULLISH domain rule", () => {
    const entry = makeEntry(HORMUZ_ARTICLE_TITLE, HORMUZ_ARTICLE_SUMMARY);
    const chain = buildCausalChain(entry, WATCHLIST);

    const oilGasDomain = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("oil_gas"),
    );
    expect(oilGasDomain).toBeDefined();
    expect(oilGasDomain?.sentiment).toBe("bullish");
  });

  it("RED→GREEN: exact article title triggers aviation BEARISH domain rule", () => {
    const entry = makeEntry(HORMUZ_ARTICLE_TITLE, HORMUZ_ARTICLE_SUMMARY);
    const chain = buildCausalChain(entry, WATCHLIST);

    const aviationDomain = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("aviation"),
    );
    expect(aviationDomain).toBeDefined();
    expect(aviationDomain?.sentiment).toBe("bearish");
  });

  it("RED→GREEN: BSR appears in chain as BULLISH (oil refinery benefits from price spike)", () => {
    const entry = makeEntry(HORMUZ_ARTICLE_TITLE, HORMUZ_ARTICLE_SUMMARY);
    const chain = buildCausalChain(entry, WATCHLIST);

    // BSR (Binh Son Refinery) — oil_gas sector — oil supply shock = BULLISH
    const bsrImpact = chain.watchlistImpacts.find((w) => w.actionCode === "BSR");
    expect(bsrImpact).toBeDefined();
    expect(bsrImpact?.impactDirection).toBe("up");
  });

  it("RED→GREEN: VJC appears in chain as BEARISH (jet fuel cost spike)", () => {
    const entry = makeEntry(HORMUZ_ARTICLE_TITLE, HORMUZ_ARTICLE_SUMMARY);
    const chain = buildCausalChain(entry, WATCHLIST);

    const vjcImpact = chain.watchlistImpacts.find((w) => w.actionCode === "VJC");
    expect(vjcImpact).toBeDefined();
    expect(vjcImpact?.impactDirection).toBe("down");
  });

  it("coverage: keyword variant 'hormuz bị phong tỏa' (short form) also triggers", () => {
    // Minimal summary containing only the short Vietnamese form
    const entry = makeEntry(
      "Hormuz bị phong tỏa",
      "hormuz bị phong tỏa làm gián đoạn nguồn cung dầu toàn cầu.",
    );
    const chain = buildCausalChain(entry, WATCHLIST);

    const oilGasDomain = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("oil_gas"),
    );
    expect(oilGasDomain).toBeDefined();
  });

  it("no false positive: HUT (real_estate) NOT triggered by Hormuz blockade sector rule", () => {
    const entry = makeEntry(HORMUZ_ARTICLE_TITLE, HORMUZ_ARTICLE_SUMMARY);
    // Force broadcastMinImpact high (>9) so market-wide broadcast doesn't fire
    const chain = buildCausalChain(entry, WATCHLIST, undefined, undefined, undefined, 10);

    const hutImpact = chain.watchlistImpacts.find((w) => w.actionCode === "HUT");
    // HUT should NOT be in watchlist impacts when broadcast is suppressed
    expect(hutImpact).toBeUndefined();
  });

});
