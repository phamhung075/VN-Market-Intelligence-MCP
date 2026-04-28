// apps/mcp-server/src/__tests__/1360b-price-news-validator.test.ts
// Task 1360b — priceNewsValidator unit tests (24 tests, pure function)
// No mock.module, no DB, no production changes.

import { describe, it, expect } from "bun:test";
import {
  validatePriceNews,
  extractHistoricalParallels,
  detectSensitiveDates,
  type PriceAction,
  type NewsSentiment,
} from "../domain/services/financial-reports/priceNewsValidator.js";

// ─────────────────────────────────────────────────────────────────────────────
// Section A — validatePriceNews: null/absent sentiment (PNV-1 through PNV-4)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1360b — validatePriceNews: null/absent sentiment", () => {
  it("PNV-1: null sentiment + volume spike — divergence = volume_no_news, severity = alert", () => {
    const price: PriceAction = { code: "VCB", changePct: 3.0, volume: 2_000_000, avgVolume: 900_000 };
    // volume (2_000_000) >= avgVolume (900_000) * 2.0 = 1_800_000 → spike
    const result = validatePriceNews(price, null);
    expect(result.divergence).toBe("volume_no_news");
    expect(result.severity).toBe("alert");
    expect(result.insight).toContain("VCB");
    expect(result.insight).toContain("KL giao dịch");
  });

  it("PNV-2: null sentiment + volume exactly at threshold (2.0×) — divergence = volume_no_news", () => {
    const price: PriceAction = { code: "TCB", changePct: 0, volume: 2_000_000, avgVolume: 1_000_000 };
    // volume (2_000_000) >= avgVolume * 2.0 (2_000_000) exactly → spike (>= guard)
    const result = validatePriceNews(price, null);
    expect(result.divergence).toBe("volume_no_news");
  });

  it("PNV-3: null sentiment + volume below spike threshold — divergence = no_data, insight empty", () => {
    const price: PriceAction = { code: "MBB", changePct: 2.0, volume: 1_500_000, avgVolume: 1_000_000 };
    // 1_500_000 < 1_000_000 * 2.0 = 2_000_000 → no spike
    const result = validatePriceNews(price, null);
    expect(result.divergence).toBe("no_data");
    expect(result.insight).toBe("");
    expect(result.severity).toBe("info");
  });

  it("PNV-4: sentiment present but articleCount = 0 + spike — divergence = volume_no_news", () => {
    const price: PriceAction = { code: "HPG", changePct: 1.5, volume: 3_000_000, avgVolume: 1_000_000 };
    const sentiment: NewsSentiment = { code: "HPG", direction: "bullish", confidence: 0.9, articleCount: 0 };
    // articleCount === 0 → falls into null-sentiment branch → spike check
    const result = validatePriceNews(price, sentiment);
    expect(result.divergence).toBe("volume_no_news");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section B — validatePriceNews: weak confidence boundary (PNV-5 through PNV-6)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1360b — validatePriceNews: weak confidence boundary", () => {
  it("PNV-5: confidence below threshold (0.39) — no_data regardless of direction", () => {
    const price: PriceAction = { code: "VNM", changePct: 2.0, volume: 500_000, avgVolume: 500_000 };
    const sentiment: NewsSentiment = { code: "VNM", direction: "bullish", confidence: 0.39, articleCount: 3 };
    const result = validatePriceNews(price, sentiment);
    expect(result.divergence).toBe("no_data");
    expect(result.insight).toBe("");
  });

  it("PNV-6: confidence exactly at threshold (0.4) — proceeds to divergence check, not no_data", () => {
    const price: PriceAction = { code: "VNM", changePct: 2.0, volume: 500_000, avgVolume: 500_000 };
    const sentiment: NewsSentiment = { code: "VNM", direction: "bullish", confidence: 0.4, articleCount: 3 };
    // confidence 0.4 >= MIN_SENTIMENT_CONFIDENCE 0.4 → passes the guard
    const result = validatePriceNews(price, sentiment);
    expect(result.divergence).not.toBe("no_data");
    // bullish sentiment + changePct 2.0 >= 1.0 → confirmed
    expect(result.divergence).toBe("confirmed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section C — validatePriceNews: divergence detection (PNV-7 through PNV-13)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1360b — validatePriceNews: divergence detection", () => {
  it("PNV-7: bullish news + price falls 2% — divergence = news_bullish_price_bearish, severity = warn", () => {
    const price: PriceAction = { code: "VCB", changePct: -2.0, volume: 500_000, avgVolume: 500_000 };
    const sentiment: NewsSentiment = { code: "VCB", direction: "bullish", confidence: 0.8, articleCount: 5 };
    const result = validatePriceNews(price, sentiment);
    expect(result.divergence).toBe("news_bullish_price_bearish");
    expect(result.severity).toBe("warn");
    expect(result.insight).toContain("VCB");
    expect(result.insight).toContain("Tin tức tích cực");
    expect(result.insight).toContain("giá giảm");
    expect(result.insight).toContain("5 bài");
  });

  it("PNV-8: bullish news + price falls exactly at threshold (-1.0%) — divergence triggered", () => {
    const price: PriceAction = { code: "ACB", changePct: -1.0, volume: 500_000, avgVolume: 500_000 };
    const sentiment: NewsSentiment = { code: "ACB", direction: "bullish", confidence: 0.7, articleCount: 2 };
    // priceDown = changePct <= -1.0; -1.0 <= -1.0 = true → divergence
    const result = validatePriceNews(price, sentiment);
    expect(result.divergence).toBe("news_bullish_price_bearish");
  });

  it("PNV-9: bearish news + price rises 3% — divergence = news_bearish_price_bullish, severity = info", () => {
    const price: PriceAction = { code: "TCB", changePct: 3.0, volume: 500_000, avgVolume: 500_000 };
    const sentiment: NewsSentiment = { code: "TCB", direction: "bearish", confidence: 0.75, articleCount: 4 };
    const result = validatePriceNews(price, sentiment);
    expect(result.divergence).toBe("news_bearish_price_bullish");
    expect(result.severity).toBe("info");
    expect(result.insight).toContain("TCB");
    expect(result.insight).toContain("Tin tiêu cực");
    expect(result.insight).toContain("giá tăng");
  });

  it("PNV-10: bullish news + price rises — divergence = confirmed, severity = info", () => {
    const price: PriceAction = { code: "MBB", changePct: 1.5, volume: 500_000, avgVolume: 500_000 };
    const sentiment: NewsSentiment = { code: "MBB", direction: "bullish", confidence: 0.9, articleCount: 6 };
    const result = validatePriceNews(price, sentiment);
    expect(result.divergence).toBe("confirmed");
    expect(result.severity).toBe("info");
    expect(result.insight).toContain("MBB");
    expect(result.insight).toContain("tích cực");
  });

  it("PNV-11: bearish news + price falls — divergence = confirmed with bearish label", () => {
    const price: PriceAction = { code: "HPG", changePct: -2.5, volume: 500_000, avgVolume: 500_000 };
    const sentiment: NewsSentiment = { code: "HPG", direction: "bearish", confidence: 0.85, articleCount: 3 };
    const result = validatePriceNews(price, sentiment);
    expect(result.divergence).toBe("confirmed");
    expect(result.insight).toContain("tiêu cực");
  });

  it("PNV-12: flat price (changePct = 0.5, within -1.0/+1.0 band) — no_data", () => {
    const price: PriceAction = { code: "STB", changePct: 0.5, volume: 500_000, avgVolume: 500_000 };
    const sentiment: NewsSentiment = { code: "STB", direction: "bullish", confidence: 0.8, articleCount: 2 };
    // priceUp = 0.5 >= 1.0 = false; priceDown = 0.5 <= -1.0 = false → flat → no_data
    const result = validatePriceNews(price, sentiment);
    expect(result.divergence).toBe("no_data");
    expect(result.insight).toBe("");
  });

  it("PNV-13: volume spike insight contains ratio string (e.g. '2.2×')", () => {
    const price: PriceAction = { code: "VIC", changePct: 1.0, volume: 2_200_000, avgVolume: 1_000_000 };
    const result = validatePriceNews(price, null);
    expect(result.divergence).toBe("volume_no_news");
    // volRatio = (2_200_000 / 1_000_000).toFixed(1) = "2.2"
    expect(result.insight).toContain("2.2×");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section D — extractHistoricalParallels (PNV-14 through PNV-18)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1360b — extractHistoricalParallels", () => {
  it("PNV-14: empty ragResults — returns empty array", () => {
    const result = extractHistoricalParallels([], "oil +2σ");
    expect(result).toHaveLength(0);
  });

  it("PNV-15: results with distance > 0.8 are excluded", () => {
    const ragResults = [
      { title: "Dầu tăng 03/2022", summary: "HK giảm 15%", distance: 0.85, tags: [] },
      { title: "Dầu tăng 06/2021", summary: "HK giảm 8%", distance: 0.5, tags: [] },
    ];
    const result = extractHistoricalParallels(ragResults, "oil +2σ");
    expect(result).toHaveLength(1);
    expect(result[0]!.description).toContain("2021");
  });

  it("PNV-16: results are sorted by relevance descending (lower distance = higher relevance)", () => {
    const ragResults = [
      { title: "Event A", summary: "Outcome A", distance: 0.6, tags: [] },
      { title: "Event B", summary: "Outcome B", distance: 0.2, tags: [] },
      { title: "Event C", summary: "Outcome C", distance: 0.4, tags: [] },
    ];
    const result = extractHistoricalParallels(ragResults, "condition");
    // Relevance = 1 - distance: B=0.8, C=0.6, A=0.4
    expect(result[0]!.description).toContain("Event B");
    expect(result[1]!.description).toContain("Event C");
    expect(result[2]!.description).toContain("Event A");
  });

  it("PNV-17: at most 3 results returned even when more qualify", () => {
    const ragResults = Array.from({ length: 5 }, (_, i) => ({
      title: `Event ${i}`,
      summary: `Outcome ${i}`,
      distance: 0.1 * (i + 1),
      tags: [],
    }));
    const result = extractHistoricalParallels(ragResults, "condition");
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it("PNV-18: date extracted from title when present in YYYY-MM-DD format", () => {
    const ragResults = [
      { title: "VN-Index crash 2022-03-15 oil spike", summary: "Drop 8%", distance: 0.3, tags: [] },
    ];
    const result = extractHistoricalParallels(ragResults, "oil +2σ");
    expect(result[0]!.date).toBe("2022-03-15");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section E — detectSensitiveDates (PNV-19 through PNV-24)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1360b — detectSensitiveDates", () => {
  it("PNV-19: BCTC season — month=4 (April), day=20 → returns BCTC description", () => {
    // April 20 is within [1,4,7,10] month AND day 15-28
    // UTC 2026-04-20 00:00 → GMT+7 = 07:00 April 20
    const d = new Date(Date.UTC(2026, 3, 20, 0, 0, 0));
    const result = detectSensitiveDates(d);
    expect(result.some(s => s.includes("BCTC"))).toBe(true);
  });

  it("PNV-20: BCTC season — month=4, day=14 (before window) → no BCTC event", () => {
    // April 14 UTC 00:00 → GMT+7 = April 14 07:00 → day=14 < 15 → outside BCTC window
    const d = new Date(Date.UTC(2026, 3, 14, 0, 0, 0));
    const result = detectSensitiveDates(d);
    expect(result.some(s => s.includes("BCTC"))).toBe(false);
  });

  it("PNV-21: YEAR_END_WINDOW — December 25 → returns year-end description", () => {
    // Dec 25 UTC 00:00 → GMT+7 = Dec 25 07:00 → month=12, day=25 >= 20 → year-end
    const d = new Date(Date.UTC(2026, 11, 25, 0, 0, 0));
    const result = detectSensitiveDates(d);
    expect(result.some(s => s.includes("Window dressing"))).toBe(true);
  });

  it("PNV-22: YEAR_END_WINDOW — December 19 (outside window) → no year-end event", () => {
    // Dec 19 UTC 00:00 → GMT+7 = Dec 19 07:00 → day=19 < 20 → no year-end
    const d = new Date(Date.UTC(2026, 11, 19, 0, 0, 0));
    const result = detectSensitiveDates(d);
    expect(result.some(s => s.includes("Window dressing"))).toBe(false);
  });

  it("PNV-23: QUARTER_END_REBALANCE — March 28 → returns quarter-end description", () => {
    // March 28 UTC 00:00 → GMT+7 = March 28 07:00 → month=3, day=28 >= 25 → quarter-end
    const d = new Date(Date.UTC(2026, 2, 28, 0, 0, 0));
    const result = detectSensitiveDates(d);
    expect(result.some(s => s.includes("cuối quý") || s.includes("Cuối quý"))).toBe(true);
  });

  it("PNV-24: no events active on a neutral date — no BCTC, no Window dressing, no cuối quý", () => {
    // March 5 — not BCTC season (month=3 not in [1,4,7,10]), not quarter-end (day=5 < 25), not year-end
    const d = new Date(Date.UTC(2026, 2, 5, 0, 0, 0));
    const result = detectSensitiveDates(d);
    expect(result.some(s => s.includes("BCTC"))).toBe(false);
    expect(result.some(s => s.includes("Window dressing"))).toBe(false);
    expect(result.some(s => s.includes("Cuối quý") || s.includes("cuối quý"))).toBe(false);
  });
});
