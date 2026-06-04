/**
 * FIX NER-PLACE-1 — Place-name preceding-token guard for direct-code ticker NER
 *
 * Bug (operator report 2026-06-04): headline
 *   "'Ông lớn' bất động sản TP HCM đề xuất giảm sở hữu nhà nước"
 * was mis-tagged "[DirectCodeNER+DomainRule: HCM]" — i.e. resolved to the broker
 * CTCP Chứng khoán TP.HCM (HOSE: HCM). But "TP HCM" = "Thành phố Hồ Chí Minh"
 * (Ho Chi Minh CITY, a place), NOT the ticker HCM.
 *
 * Root cause: isDirectTickerMention() accepts any all-caps word-boundary hit
 * (hasUppercaseWordBoundary). "HCM" in "TP HCM" is all-caps, space-bounded both
 * sides, so it passed with no preceding-token context guard.
 *
 * Fix: reject an all-caps ticker occurrence when the token immediately preceding
 * it is a Vietnamese place prefix (TP / TP. / Tp. / T.P / Thành phố / tỉnh,
 * diacritic-tolerant). Generalized to the whole place-prefix + all-caps-token
 * collision CLASS — not a hardcoded HCM special-case.
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
  impactScore = 5,
): AnalysisEntry {
  return {
    id: "test-seed-ner-place",
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
    reasoning: "test seed ner-place",
    affectedCountries: ["VN"],
    affectedDomains: [],
    affectedActions: [],
    parentIds: [],
    tags: [],
    createdAt: new Date().toISOString(),
  };
}

// HCM is the salient collision: city abbrev "TP HCM" == HOSE broker ticker HCM.
const WATCHLIST: WatchlistEntry[] = [
  wl("HCM", "securities"),
  wl("SSI", "securities"),
  wl("VND", "securities"),
];

function hcmEntries(seed: AnalysisEntry) {
  const chain = buildCausalChain(seed, WATCHLIST);
  return chain.entries.filter(
    (e) => e.level === "action" && e.affectedActions.includes("HCM"),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FALSE POSITIVES that must now be SUPPRESSED
// ─────────────────────────────────────────────────────────────────────────────

describe("NER-PLACE-1 — city/place reference must NOT tag broker ticker HCM", () => {
  it("'... bất động sản TP HCM ...' (space form) → NO HCM action entry", () => {
    const seed = makeSeed(
      "'Ông lớn' bất động sản TP HCM đề xuất giảm sở hữu nhà nước",
      "Doanh nghiệp bất động sản lớn tại Thành phố Hồ Chí Minh kiến nghị giảm tỷ lệ sở hữu nhà nước.",
    );
    expect(hcmEntries(seed).length).toBe(0);
  });

  it("'TP.HCM' joined form → NO HCM action entry", () => {
    const seed = makeSeed(
      "Giá đất nền TP.HCM tăng mạnh trong quý II",
      "Thị trường bất động sản tại TP.HCM ghi nhận mức tăng giá đáng kể ở khu vực ven đô.",
    );
    expect(hcmEntries(seed).length).toBe(0);
  });

  it("'Thành phố HCM' full prefix → NO HCM action entry", () => {
    const seed = makeSeed(
      "Thành phố HCM triển khai tuyến metro mới",
      "Dự án giao thông công cộng tại Thành phố HCM khởi công trong năm nay.",
    );
    expect(hcmEntries(seed).length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REGRESSION — genuine ticker mentions must STILL tag HCM (true positives)
// ─────────────────────────────────────────────────────────────────────────────

describe("NER-PLACE-1 REGRESSION — genuine HCM ticker mention must still tag", () => {
  it("'HCM tăng trần ...' (standalone ticker) → HCM action entry present", () => {
    const seed = makeSeed(
      "HCM tăng trần phiên cuối tuần",
      "Cổ phiếu HCM của Chứng khoán TP.HCM tăng kịch trần nhờ dòng tiền vào nhóm chứng khoán.",
    );
    expect(hcmEntries(seed).length).toBeGreaterThan(0);
  });

  it("'Chứng khoán HCM báo lãi ...' → HCM action entry present", () => {
    const seed = makeSeed(
      "Chứng khoán HCM báo lãi quý tăng 40%",
      "CTCP Chứng khoán mã HCM công bố kết quả kinh doanh tăng trưởng mạnh.",
    );
    expect(hcmEntries(seed).length).toBeGreaterThan(0);
  });
});
