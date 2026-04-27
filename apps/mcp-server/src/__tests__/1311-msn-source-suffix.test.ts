// apps/mcp-server/src/__tests__/1311-msn-source-suffix.test.ts
// Bug 1311 — stripSourceAttributionSuffix must be called before detectStocksInText
// in newsNormalizer.ts so source attribution tokens (MSN, Reuters, etc.)
// are never treated as stock tickers.
//
// RED phase: these tests must fail before the fix is applied.
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import { normalizeNews } from "../domain/services/newsNormalizer.js";
import { stripSourceAttributionSuffix } from "../domain/services/stockAliases.js";

describe("Bug 1311 — stripSourceAttributionSuffix wired before NER in newsNormalizer", () => {

  it("normalizeNews should NOT include MSN in affectedActions for 'Vietnam rally - MSN'", () => {
    const item = {
      title: "Vietnam stocks rally - MSN",
      content: "",
      source: "msn",
      url: "https://msn.com/article/1",
      publishedAt: new Date().toISOString(),
    };
    const entry = normalizeNews(item);
    // MSN is a 3-char alpha token — without suffix stripping it is treated as a ticker.
    // After fix: suffix stripped → "Vietnam stocks rally" → MSN absent from affectedActions.
    expect(entry.affectedActions).not.toContain("MSN");
  });

  it("normalizeNews should NOT include AP in affectedActions for 'Trade deal reached - AP'", () => {
    const item = {
      title: "Trade deal reached - AP",
      content: "",
      source: "ap",
      url: "https://apnews.com/article/2",
      publishedAt: new Date().toISOString(),
    };
    const entry = normalizeNews(item);
    // AP is a 2-char token — known source, must be stripped.
    expect(entry.affectedActions).not.toContain("AP");
  });

  it("normalizeNews should NOT include BBC in affectedActions for 'Vietnam GDP grows - BBC'", () => {
    const item = {
      title: "Vietnam GDP grows - BBC",
      content: "",
      source: "bbc",
      url: "https://bbc.com/article/3",
      publishedAt: new Date().toISOString(),
    };
    const entry = normalizeNews(item);
    expect(entry.affectedActions).not.toContain("BBC");
  });

  it("normalizeNews SHOULD still detect VNM when title contains Vinamilk before a suffix", () => {
    const item = {
      title: "Vinamilk lên kế hoạch tăng trưởng - CafeF",
      content: "",
      source: "cafef",
      url: "https://cafef.vn/article/4",
      publishedAt: new Date().toISOString(),
    };
    const entry = normalizeNews(item);
    // CafeF suffix stripped → "Vinamilk lên kế hoạch tăng trưởng"
    // VNM alias "Vinamilk" still detected correctly.
    expect(entry.affectedActions).toContain("VNM");
  });

  it("stripSourceAttributionSuffix strips known sources (unit test of the function itself)", () => {
    expect(stripSourceAttributionSuffix("Vietnam stocks rally - MSN")).toBe("Vietnam stocks rally");
    expect(stripSourceAttributionSuffix("Trade deal reached - AP")).toBe("Trade deal reached");
    expect(stripSourceAttributionSuffix("Market update - Reuters")).toBe("Market update");
    expect(stripSourceAttributionSuffix("Vinamilk reports profit - CafeF")).toBe("Vinamilk reports profit");
    // No suffix — unchanged
    expect(stripSourceAttributionSuffix("Vietnam stocks rally")).toBe("Vietnam stocks rally");
    // Suffix with digit — NOT stripped (VN30 should survive)
    expect(stripSourceAttributionSuffix("VN30 hits record")).toBe("VN30 hits record");
  });

  it("stripSourceAttributionSuffix strips 2-5 char alpha tokens at end of headline", () => {
    // "FT" is 2 chars, alpha-only — should be stripped
    expect(stripSourceAttributionSuffix("Vietnam bond yield rises - FT")).toBe("Vietnam bond yield rises");
    // "CNN" is 3 chars — should be stripped
    expect(stripSourceAttributionSuffix("Rate cut incoming - CNN")).toBe("Rate cut incoming");
    // Longer than 5 chars — not stripped unless known source
    const long = "Market analysis - Investing";
    // "Investing" is in KNOWN_NEWS_SOURCES — should be stripped
    expect(stripSourceAttributionSuffix(long)).toBe("Market analysis");
  });
});
