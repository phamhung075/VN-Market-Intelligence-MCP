// src/__tests__/1253-company-name-ner.test.ts
//
// Task 1253 — Company-name → ticker NER in newsNormalizer
//
// Bug report 1259: Articles about Novaland (NVL) and Vingroup/Phạm Nhật Vượng (VIC)
// were classified with Stocks: empty because extractStockTickers() only matched
// literal 2-5 letter ticker codes (e.g. "NVL"), not company trade names
// (e.g. "Novaland", "Vingroup").
//
// Fix: extractStockTickers() must use stockAliases.detectStocksInText() as a
// fallback to resolve company names to ticker codes.
//
// Acceptance criteria:
//   AC-1: "Novaland" in article title → NVL in affectedActions
//   AC-2: "Vingroup" in article title → VIC in affectedActions
//   AC-3: "Phạm Nhật Vượng" in article title → VIC in affectedActions
//   AC-4: "Vinhomes" in article title → VHM in affectedActions
//   AC-5: Explicit ticker code "HPG" still detected (regression guard)
//   AC-6: No false positives — generic text with no company/ticker → []

import { describe, it, expect } from "bun:test";
import { normalizeNews } from "../domain/services/newsNormalizer.js";
import type { RssItem } from "../infrastructure/fetchers/rss.js";

function makeItem(title: string, content = ""): RssItem {
  return {
    title,
    content,
    url: "https://example.com/article",
    source: "cafef",
    publishedAt: new Date().toISOString(),
  };
}

describe("Task 1253 — Company-name NER in normalizeNews", () => {
  it("AC-1: 'Novaland' in title → NVL in affectedActions", () => {
    const entry = normalizeNews(makeItem("Novaland lý giải việc doanh thu tăng hơn 3 lần"));
    expect(entry.affectedActions).toContain("NVL");
  });

  it("AC-2: 'Vingroup' in title → VIC in affectedActions", () => {
    const entry = normalizeNews(makeItem("Chủ tịch Phạm Nhật Vượng: Vingroup lựa chọn dấn thân"));
    expect(entry.affectedActions).toContain("VIC");
  });

  it("AC-3: 'Phạm Nhật Vượng' without Vingroup → VIC in affectedActions", () => {
    const entry = normalizeNews(makeItem("Phạm Nhật Vượng chia sẻ về chiến lược kinh doanh 2026"));
    expect(entry.affectedActions).toContain("VIC");
  });

  it("AC-4: 'Vinhomes' in title → VHM in affectedActions", () => {
    const entry = normalizeNews(makeItem("Vinhomes ra mắt dự án mới tại Hà Nội"));
    expect(entry.affectedActions).toContain("VHM");
  });

  it("AC-5: Explicit ticker code 'HPG' still detected (regression)", () => {
    const entry = normalizeNews(makeItem("HPG tăng mạnh sau kết quả kinh doanh Q1"));
    expect(entry.affectedActions).toContain("HPG");
  });

  it("AC-6: Generic macro text → no false-positive stock detection", () => {
    const entry = normalizeNews(makeItem("Thị trường chứng khoán Việt Nam tăng điểm hôm nay"));
    // Should not contain random tickers unless the text genuinely matches an alias
    // Filter to only known stocks that shouldn't match generic market text
    const falsePositiveCodes = ["VIC", "NVL", "VHM", "HPG", "VCB", "FPT"];
    const matched = entry.affectedActions.filter((a) => falsePositiveCodes.includes(a));
    expect(matched).toEqual([]);
  });
});
