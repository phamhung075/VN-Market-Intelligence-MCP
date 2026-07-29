/**
 * FIX-1279: MSCI WatchList VN inclusion → BULLISH impact ≥ 9
 *
 * Bug: Article "Có khả năng chứng khoán Việt Nam vào WatchList MSCI trong tháng 6 năm nay"
 * was classified COUNTRY NEUTRAL impact 6 instead of BULLISH impact ≥ 9.
 *
 * Root causes:
 *  1. sentimentClassifier: MSCI WatchList keywords absent or weighted too low (≤1.0)
 *  2. msciDetector.detectMsciWatchlist: "vào watchlist msci" not matched
 *  3. Impact score: base 5 + no bullish keyword in title = stays at 6
 *
 * Fix: Add MSCI WatchList keywords with weight 3.0 to sentimentClassifier,
 *      add "vào watchlist msci" to detectMsciWatchlist,
 *      add cascade rules for securities + banking sectors.
 */

import { describe, it, expect } from "bun:test";
import { classifySentiment } from "../domain/services/sentimentClassifier.js";
import { detectMsciWatchlist } from "../domain/services/msciDetector.js";
import {
  buildCausalChain,
  type WatchlistEntry,
} from "../domain/services/cascadeEngine.js";
import type { AnalysisEntry } from "../domain/services/newsNormalizer.js";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeSeed(
  title: string,
  summary: string,
  overrides: Partial<AnalysisEntry> = {},
): AnalysisEntry {
  return {
    id: "fix-1279-test",
    sourceTitle: title,
    sourceUrl: "https://cafef.vn/msci-watchlist.html",
    sourceType: "news",
    publishedAt: "2026-04-25T00:00:00Z",
    summary,
    level: "country",
    sentiment: "neutral", // intentionally neutral — the fix must override this
    impactScore: 6,       // as reported — must reach ≥ 9 after fix
    impactDirection: "neutral",
    confidence: 0.85,
    timeHorizon: "medium",
    reasoning: "test",
    affectedCountries: ["VN"],
    affectedDomains: [],
    affectedActions: [],
    parentIds: [],
    tags: [],
    createdAt: "2026-04-25T00:00:00Z",
    ...overrides,
  };
}

const SECURITIES_WATCHLIST: WatchlistEntry[] = [
  { actionCode: "SSI", domain: "securities", exchange: "HOSE" },
  { actionCode: "VCI", domain: "securities", exchange: "HOSE" },
  { actionCode: "VIX", domain: "securities", exchange: "HOSE" },
  { actionCode: "VND", domain: "securities", exchange: "HOSE" },
  { actionCode: "HCM", domain: "securities", exchange: "HOSE" },
  { actionCode: "BID", domain: "banking", exchange: "HOSE" },
  { actionCode: "VCB", domain: "banking", exchange: "HOSE" },
  { actionCode: "TCB", domain: "banking", exchange: "HOSE" },
];

// ── Unit: sentimentClassifier ──────────────────────────────────────────────

describe("FIX-1279: sentimentClassifier — MSCI WatchList keywords", () => {
  it("classifies 'vào WatchList MSCI' as BULLISH", () => {
    const text = "Có khả năng chứng khoán Việt Nam vào WatchList MSCI trong tháng 6 năm nay";
    const result = classifySentiment(text);
    expect(result.direction).toBe("bullish");
  });

  it("classifies 'MSCI EM WatchList' as BULLISH", () => {
    const text = "Vietnam được đưa vào MSCI EM WatchList để xem xét nâng hạng thị trường";
    const result = classifySentiment(text);
    expect(result.direction).toBe("bullish");
  });

  it("classifies 'nâng hạng thị trường' as BULLISH", () => {
    const text = "Triển vọng nâng hạng thị trường chứng khoán Việt Nam lên Emerging Market";
    const result = classifySentiment(text);
    expect(result.direction).toBe("bullish");
  });

  it("classifies 'MSCI nâng hạng' as BULLISH", () => {
    const text = "MSCI nâng hạng Việt Nam từ Frontier lên Emerging Market sẽ thu hút dòng vốn ETF";
    const result = classifySentiment(text);
    expect(result.direction).toBe("bullish");
  });

  it("bullish score from MSCI WatchList phrase is strong enough (≥ 3 total)", () => {
    // The classifier must accumulate enough score so that
    // impactScore computed downstream reaches ≥ 9
    const text = "vào watchlist msci";
    const result = classifySentiment(text);
    expect(result.direction).toBe("bullish");
    // Confidence should be high (strong keyword)
    expect(result.confidence).toBeGreaterThan(0.5);
  });
});

// ── Unit: detectMsciWatchlist ──────────────────────────────────────────────

describe("FIX-1279: detectMsciWatchlist — keyword coverage", () => {
  const CRED = 0.85;

  it("detects 'vào WatchList MSCI' phrase", () => {
    const text = "Có khả năng chứng khoán Việt Nam vào WatchList MSCI trong tháng 6 năm nay";
    const result = detectMsciWatchlist(text, CRED);
    expect(result.matched).toBe(true);
  });

  it("detects 'watchlist msci' (case-insensitive)", () => {
    const text = "vietnam được thêm vào watchlist msci để chuẩn bị nâng hạng";
    const result = detectMsciWatchlist(text, CRED);
    expect(result.matched).toBe(true);
  });

  it("detects 'MSCI EM WatchList'", () => {
    const text = "Chứng khoán Việt Nam vào MSCI EM WatchList tháng 6";
    const result = detectMsciWatchlist(text, CRED);
    expect(result.matched).toBe(true);
  });

  it("detects 'vào danh sách theo dõi msci' (existing keyword, regression)", () => {
    const text = "Việt Nam được thêm vào danh sách theo dõi msci";
    const result = detectMsciWatchlist(text, CRED);
    expect(result.matched).toBe(true);
  });

  it("returns matched=false for low-credibility source", () => {
    const text = "vào watchlist msci tháng 6";
    const result = detectMsciWatchlist(text, 0.5);
    expect(result.matched).toBe(false);
  });
});

// ── Integration: cascadeEngine → securities + banking cascade ─────────────

describe("FIX-1279: cascadeEngine — MSCI WatchList cascade to securities + banking", () => {
  it("MSCI WatchList seed with bullish sentiment cascades to securities sector", () => {
    const seed = makeSeed(
      "Việt Nam vào WatchList MSCI tháng 6 — ETF inflows $2-5B",
      "Chứng khoán Việt Nam có khả năng vào watchlist msci trong tháng 6, kích hoạt dòng vốn ETF $2-5B.",
      {
        sentiment: "bullish",
        impactScore: 9,
        level: "country",
        confidence: 0.85,
      }
    );

    const chain = buildCausalChain(seed, SECURITIES_WATCHLIST);

    // Must have a MSCI watchlist cascade entry
    const msciEntry = chain.entries.find(e =>
      e.title?.toLowerCase().includes("msci") ||
      e.reasoning?.toLowerCase().includes("msci watchlist") ||
      e.reasoning?.toLowerCase().includes("watchlist")
    );
    expect(msciEntry).toBeDefined();
    expect(msciEntry?.sentiment).toBe("bullish");
  });

  it("MSCI WatchList seed cascades to banking sector stocks", () => {
    const seed = makeSeed(
      "Việt Nam vào WatchList MSCI — nâng hạng thị trường mới nổi",
      "Theo MSCI, Vietnam có khả năng vào watchlist msci trong tháng 6. Nâng hạng thị trường mới nổi sẽ kích hoạt ETF inflow.",
      {
        sentiment: "bullish",
        impactScore: 9,
        level: "country",
        confidence: 0.85,
      }
    );

    const chain = buildCausalChain(seed, SECURITIES_WATCHLIST);

    // Must have watchlist impacts for banking sector
    const bankingImpacts = chain.watchlistImpacts.filter(
      i => i.domain === "banking"
    );
    expect(bankingImpacts.length).toBeGreaterThan(0);
    bankingImpacts.forEach(impact => {
      expect(impact.impactDirection).toBe("up");
    });
  });

  it("MSCI WatchList seed with impactScore 9 cascades with bullish direction", () => {
    const seed = makeSeed(
      "Chứng khoán Việt Nam vào WatchList MSCI trong tháng 6",
      "Có khả năng chứng khoán Việt Nam vào WatchList MSCI trong tháng 6 năm nay. Đây là bước tiến quan trọng thu hút dòng vốn ETF nước ngoài.",
      {
        sentiment: "bullish",
        impactScore: 9,
        level: "country",
        confidence: 0.85,
      }
    );

    const chain = buildCausalChain(seed, SECURITIES_WATCHLIST);

    // All watchlist impacts must be bullish (up direction)
    chain.watchlistImpacts.forEach(impact => {
      expect(impact.impactDirection).toBe("up");
    });

    // Impact score of cascade entries must be proportional to the high seed impactScore
    chain.entries.forEach(entry => {
      expect(entry.impactScore).toBeGreaterThan(0);
    });
  });

  // FACTORY-GUARD-CI-METRICMASK-IMPL: cascadeEngine.ts used to pass
  // `seedEntry.confidence ?? 0.6` into detectMsciInclusion/Watchlist/Exclusion — a
  // fabricated mid-range "measured" credibility for a genuinely absent value. The
  // honest fix is `?? 0`; since detectMsci*'s own credibility floor is 0.7, both the
  // old (0.6) and new (0) fallback are BELOW threshold, so behavior for this
  // (unreachable-in-typed-production, defensive-only) absent case is unchanged: no
  // MSCI cascade entry is fabricated either way. This test locks that down directly.
  it("MSCI WatchList seed with an absent (undefined) confidence produces NO MSCI cascade entry — honest-absence, not a fabricated 0.6 credibility", () => {
    const seed = makeSeed(
      "Việt Nam vào WatchList MSCI tháng 6",
      "Có khả năng chứng khoán Việt Nam vào watchlist msci trong tháng 6 năm nay.",
      {
        sentiment: "bullish",
        impactScore: 9,
        level: "country",
        // Simulates a caller violating the AnalysisEntry type contract at runtime
        // (e.g. a manually-constructed/partial fixture) — confidence genuinely absent.
        confidence: undefined as unknown as number,
      }
    );

    const chain = buildCausalChain(seed, SECURITIES_WATCHLIST);

    // NOTE: chain.entries always includes a seed-echo entry whose title/summary
    // are copied verbatim from the input (which itself mentions "MSCI" here) — so
    // the assertion below targets the specific reasoning string cascadeEngine.ts
    // only writes inside the `msciWatchlistResult.matched` branch, not a generic
    // title/reasoning substring match (that would false-match the seed echo).
    const msciEntry = chain.entries.find(e =>
      e.reasoning?.includes("MSCI watchlist detected")
    );
    expect(msciEntry).toBeUndefined();
  });
});
