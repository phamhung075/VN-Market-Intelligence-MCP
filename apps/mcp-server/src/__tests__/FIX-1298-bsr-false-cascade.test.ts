/**
 * FIX-1298 + FIX-1299 — BSR false cascade
 *
 * 1298: Fed/monetary policy articles (Fed Chair net worth, rate cut appeal,
 *       central bank gold selling) must NOT route to BSR via oil supply risk.
 *       Root cause: geopolitical escalation rule for oil_gas (line ~1550) has
 *       "geopolitical" as a broad keyword — monetary policy articles can contain
 *       that word without any oil/energy context.
 *
 * 1299: Masan khoáng sản article must NOT alert BSR (oil refinery) via the
 *       coal/minerals → oil_gas SECTOR_RULE. BSR is Binh Son Refinery — it
 *       processes crude oil, not coal or minerals.
 *
 * Fix strategy:
 *   - Add `excludeKeywords?: string[]` to SectorRule interface.
 *   - Geopolitical oil_gas rule: exclude when article contains Fed/monetary
 *     policy terms WITHOUT oil/energy context (oil, dầu, crude, energy).
 *   - Coal/minerals oil_gas rule: exclude "khoáng sản" articles that do NOT
 *     also contain explicit oil/gas/energy terms (the rule should only fire
 *     for coal-price-relevant energy companies, not oil refineries).
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
  level: AnalysisEntry["level"] = "global",
  impactScore = 7,
): AnalysisEntry {
  return {
    id: "test-seed-1298",
    level,
    sourceTitle: title,
    sourceUrl: "",
    sourceType: "news",
    publishedAt: new Date().toISOString(),
    sentiment: "neutral",
    impactScore,
    impactDirection: "neutral",
    confidence: 0.65,
    timeHorizon: "short",
    summary: `${title}. ${summary}`,
    reasoning: "test seed fix-1298",
    affectedCountries: ["US"],
    affectedDomains: [],
    affectedActions: [],
    parentIds: [],
    tags: [],
    createdAt: new Date().toISOString(),
  };
}

const WATCHLIST_WITH_BSR: WatchlistEntry[] = [
  wl("BSR", "oil_gas"),
  wl("PVD", "oil_gas"),
  wl("GAS", "oil_gas"),
  wl("VJC", "aviation"),
  wl("SSI", "securities"),
];

// ─────────────────────────────────────────────────────────────────────────────
// FIX-1298: Fed/monetary policy articles must NOT alert BSR
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-1298 — Fed/monetary policy articles must NOT cascade to BSR", () => {
  it("Fed Chair net worth article → BSR NOT alerted", () => {
    const seed = makeSeed(
      "Fed Chair nominee net worth revealed amid Senate confirmation",
      "The Federal Reserve chair nominee disclosed personal net worth. " +
        "Geopolitical uncertainty and rate cut expectations are driving investor sentiment. " +
        "FOMC members signal cautious stance on monetary policy.",
    );
    const chain = buildCausalChain(seed, WATCHLIST_WITH_BSR);

    const bsrImpacts = chain.watchlistImpacts.filter((i) => i.actionCode === "BSR");
    expect(bsrImpacts.length).toBe(0);
  });

  it("Fed rate cut appeal article (no oil keywords) → BSR NOT alerted", () => {
    const seed = makeSeed(
      "Investors appeal for Fed rate cut as economy slows",
      "The Federal Reserve faces pressure to cut interest rates. " +
        "Central bank officials cite geopolitical risks and weak employment data. " +
        "FOMC meeting minutes show divided committee on monetary easing.",
    );
    const chain = buildCausalChain(seed, WATCHLIST_WITH_BSR);

    const bsrImpacts = chain.watchlistImpacts.filter((i) => i.actionCode === "BSR");
    expect(bsrImpacts.length).toBe(0);
  });

  it("Central bank gold selling article (no oil keywords) → BSR NOT alerted", () => {
    const seed = makeSeed(
      "Central banks sell gold reserves to fund monetary operations",
      "Ngân hàng trung ương các nước đang bán vàng dự trữ. " +
        "Federal Reserve và ECB thay đổi chiến lược dự trữ. " +
        "Geopolitical context drives central bank asset reallocation.",
    );
    const chain = buildCausalChain(seed, WATCHLIST_WITH_BSR);

    const bsrImpacts = chain.watchlistImpacts.filter((i) => i.actionCode === "BSR");
    expect(bsrImpacts.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX-1299: Masan minerals article must NOT alert BSR
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-1299 — Masan khoáng sản article must NOT cascade to BSR", () => {
  it("'Masan khoáng sản đặt mục tiêu lãi gấp 200 lần' → BSR NOT alerted", () => {
    const seed = makeSeed(
      "Masan khoáng sản đặt mục tiêu lãi gấp 200 lần năm nay",
      "Công ty khoáng sản Masan đặt mục tiêu tăng trưởng lợi nhuận mạnh. " +
        "Khai thác than và khoáng sản tăng công suất trong năm 2026. " +
        "Giá khoáng sản toàn cầu hỗ trợ kế hoạch kinh doanh than của Masan.",
      "country",
    );
    const chain = buildCausalChain(seed, WATCHLIST_WITH_BSR);

    const bsrImpacts = chain.watchlistImpacts.filter((i) => i.actionCode === "BSR");
    expect(bsrImpacts.length).toBe(0);
  });

  it("coal price article mentioning 'khoáng sản' → BSR NOT alerted", () => {
    const seed = makeSeed(
      "Giá than và khoáng sản tăng mạnh trong quý II/2026",
      "Thị trường khoáng sản và than đá ghi nhận mức tăng giá đáng kể. " +
        "Doanh nghiệp khai thác than đá và khoáng sản hưởng lợi từ nhu cầu tăng. " +
        "Mineral mining activities expand in northern Vietnam.",
      "country",
    );
    const chain = buildCausalChain(seed, WATCHLIST_WITH_BSR);

    const bsrImpacts = chain.watchlistImpacts.filter((i) => i.actionCode === "BSR");
    expect(bsrImpacts.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REGRESSION: Actual oil supply disruption articles MUST still alert BSR
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-1298/1299 REGRESSION — Actual oil supply disruption must still alert BSR", () => {
  it("Hormuz blockade article → BSR IS alerted (bullish)", () => {
    const seed = makeSeed(
      "Hormuz blockade threatens global oil supply",
      "Phong tỏa eo biển Hormuz gây gián đoạn nguồn cung dầu toàn cầu. " +
        "Oil supply disruption pushes crude prices above $100/barrel. " +
        "Binh Son Refinery (BSR) expected to benefit from higher refining margins.",
      "global",
      9,
    );
    const chain = buildCausalChain(seed, WATCHLIST_WITH_BSR);

    const bsrImpacts = chain.watchlistImpacts.filter((i) => i.actionCode === "BSR");
    expect(bsrImpacts.length).toBeGreaterThan(0);
  });

  it("OPEC cut article → oil_gas domain entry fires", () => {
    const seed = makeSeed(
      "OPEC+ production cut surprises markets",
      "OPEC cut giảm sản lượng 1 triệu thùng/ngày. " +
        "Gián đoạn nguồn cung dầu đẩy giá dầu Brent lên cao. " +
        "Oil supply shock triggers rally in upstream oil and gas stocks.",
      "global",
      9,
    );
    const chain = buildCausalChain(seed, WATCHLIST_WITH_BSR);

    const oilGasDomain = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("oil_gas"),
    );
    expect(oilGasDomain).toBeDefined();
  });
});
