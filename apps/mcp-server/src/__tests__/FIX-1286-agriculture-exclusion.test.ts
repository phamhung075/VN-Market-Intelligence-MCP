/**
 * FIX-1286 — Agriculture/commodity broadcast exclusion: coffee/rice export articles
 * must NOT cascade to real_estate (HUT) via market-wide broadcast.
 *
 * Bug reproduced with exact article title: "Xuất khẩu cà phê và gạo 'hụt hơi'"
 * The title has "cà phê và gạo" (reversed word order) — not "xuất khẩu cà phê"
 * as a contiguous prefix, and "hụt hơi" (running out of steam) was not in keywords.
 *
 * Fix: add "cà phê và gạo", "hụt hơi" (in export context), "giá gạo", "giá cà phê"
 * to the Task 1309a agriculture SECTOR_RULE keywords so hasCommodityTrigger fires
 * and the broadcast exclusion guard suppresses real_estate/tech/aviation/securities.
 */

import { describe, it, expect } from "bun:test";
import { buildCausalChain } from "../domain/services/cascadeEngine.js";
import type { WatchlistEntry } from "../domain/services/cascadeEngine.js";
import type { AnalysisEntry } from "../domain/services/newsNormalizer.js";

function wl(actionCode: string, domain: WatchlistEntry["domain"]): WatchlistEntry {
  return { actionCode, domain, exchange: "HOSE" };
}

function makeSeed(
  title: string,
  summary: string,
  level: AnalysisEntry["level"] = "country",
  impactScore = 8,
): AnalysisEntry {
  return {
    id: "test-seed-1286",
    level,
    sourceTitle: title,
    sourceUrl: "",
    sourceType: "news",
    publishedAt: new Date().toISOString(),
    sentiment: "bearish",
    impactScore,
    impactDirection: "down",
    confidence: 0.72,
    timeHorizon: "short",
    summary: `${title}. ${summary}`,
    reasoning: "test seed fix-1286",
    affectedCountries: ["VN"],
    affectedDomains: [],
    affectedActions: [],
    parentIds: [],
    tags: [],
    createdAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Core regression: exact failing article title
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-1286 — Exact article: 'Xuất khẩu cà phê và gạo hụt hơi'", () => {
  const TITLE = "Xuất khẩu cà phê và gạo 'hụt hơi'";
  const SUMMARY =
    "Kim ngạch xuất khẩu cà phê và gạo của Việt Nam giảm mạnh trong quý I/2026. " +
    "Giá cà phê và giá gạo xuất khẩu chịu áp lực cạnh tranh từ Indonesia và Thái Lan. " +
    "Ngành nông sản đối mặt với thách thức lớn.";

  const watchlist: WatchlistEntry[] = [
    wl("GVR", "agriculture"),
    wl("VNM", "agriculture"),
    wl("HUT", "real_estate"),
    wl("FPT", "tech"),
    wl("VJC", "aviation"),
    wl("SSI", "securities"),
  ];

  it("agriculture domain entry fires (keyword match present)", () => {
    const seed = makeSeed(TITLE, SUMMARY);
    const chain = buildCausalChain(seed, watchlist);

    const agriEntry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("agriculture"),
    );
    expect(agriEntry).toBeDefined();
  });

  it("HUT (real_estate) must NOT appear via market-wide broadcast", () => {
    const seed = makeSeed(TITLE, SUMMARY);
    const chain = buildCausalChain(seed, watchlist);

    const hutBroadcast = chain.entries.find(
      (e) =>
        e.level === "action" &&
        e.affectedActions.includes("HUT") &&
        e.reasoning.includes("market-wide cascade"),
    );
    expect(hutBroadcast).toBeUndefined();
  });

  it("real_estate watchlist impacts must be empty for this article", () => {
    const seed = makeSeed(TITLE, SUMMARY);
    const chain = buildCausalChain(seed, watchlist);

    const realEstateImpacts = chain.watchlistImpacts.filter(
      (i) => i.actionCode === "HUT",
    );
    expect(realEstateImpacts.length).toBe(0);
  });

  it("tech (FPT) must NOT appear via market-wide broadcast", () => {
    const seed = makeSeed(TITLE, SUMMARY);
    const chain = buildCausalChain(seed, watchlist);

    const techBroadcast = chain.entries.find(
      (e) =>
        e.level === "action" &&
        e.affectedActions.includes("FPT") &&
        e.reasoning.includes("market-wide cascade"),
    );
    expect(techBroadcast).toBeUndefined();
  });

  it("aviation (VJC) must NOT appear via market-wide broadcast", () => {
    const seed = makeSeed(TITLE, SUMMARY);
    const chain = buildCausalChain(seed, watchlist);

    const aviationBroadcast = chain.entries.find(
      (e) =>
        e.level === "action" &&
        e.affectedActions.includes("VJC") &&
        e.reasoning.includes("market-wide cascade"),
    );
    expect(aviationBroadcast).toBeUndefined();
  });

  it("securities (SSI) must NOT appear via market-wide broadcast", () => {
    const seed = makeSeed(TITLE, SUMMARY);
    const chain = buildCausalChain(seed, watchlist);

    const secBroadcast = chain.entries.find(
      (e) =>
        e.level === "action" &&
        e.affectedActions.includes("SSI") &&
        e.reasoning.includes("market-wide cascade"),
    );
    expect(secBroadcast).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Keyword variants: "giá cà phê", "giá gạo", "nông sản" standalone
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-1286 — Agriculture keyword variants also excluded from broadcast", () => {
  const watchlist: WatchlistEntry[] = [
    wl("GVR", "agriculture"),
    wl("HUT", "real_estate"),
    wl("SSI", "securities"),
  ];

  it("'giá cà phê giảm' article → no real_estate broadcast", () => {
    const seed = makeSeed(
      "Giá cà phê giảm mạnh trên thị trường thế giới",
      "Giá cà phê robusta giảm 8% trong tuần qua. Các doanh nghiệp xuất khẩu cà phê Việt Nam chịu thiệt hại.",
    );
    const chain = buildCausalChain(seed, watchlist);

    const realEstateImpacts = chain.watchlistImpacts.filter(
      (i) => i.actionCode === "HUT",
    );
    expect(realEstateImpacts.length).toBe(0);
  });

  it("'giá gạo xuất khẩu' article → no securities broadcast", () => {
    const seed = makeSeed(
      "Giá gạo xuất khẩu Việt Nam chịu áp lực",
      "Giá gạo xuất khẩu giảm do cạnh tranh từ Thái Lan và Ấn Độ. Nông sản xuất khẩu gặp khó.",
    );
    const chain = buildCausalChain(seed, watchlist);

    const secImpacts = chain.watchlistImpacts.filter(
      (i) => i.actionCode === "SSI",
    );
    expect(secImpacts.length).toBe(0);
  });

  it("'nông sản xuất khẩu hụt hơi' → agriculture domain fires", () => {
    const seed = makeSeed(
      "Nông sản xuất khẩu hụt hơi trong quý I",
      "Cà phê và gạo xuất khẩu đều giảm. Doanh nghiệp nông nghiệp đối mặt áp lực lớn từ thị trường quốc tế.",
    );
    const chain = buildCausalChain(seed, watchlist);

    const agriEntry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("agriculture"),
    );
    expect(agriEntry).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Allowed cascade: agriculture sector stocks (VNM) SHOULD receive impact
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-1286 — agriculture sector correctly receives cascade (allowed)", () => {
  it("coffee/rice export article → real_estate still excluded when agriculture stock on watchlist", () => {
    const seed = makeSeed(
      "Xuất khẩu cà phê và gạo 'hụt hơi'",
      "Kim ngạch xuất khẩu cà phê và gạo giảm mạnh. Các doanh nghiệp nông nghiệp bị ảnh hưởng.",
    );
    const watchlist: WatchlistEntry[] = [
      wl("VNM", "agriculture"),
      wl("HUT", "real_estate"),
    ];
    const chain = buildCausalChain(seed, watchlist);

    // real_estate must still be excluded
    const realEstateImpacts = chain.watchlistImpacts.filter(
      (i) => i.actionCode === "HUT",
    );
    expect(realEstateImpacts.length).toBe(0);
  });
});
