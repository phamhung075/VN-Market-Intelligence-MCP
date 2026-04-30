// apps/mcp-server/src/__tests__/1788-hcm-geographic-false-positive.test.ts
// Task 1788 — FIX: HCM ticker must not fire on geographic "TP.HCM" context
//
// Root cause: extractStockTickers() Pattern 2 uses \b([A-Za-z]{2,5})\b which
// treats the dot in "TP.HCM" as a word boundary, extracting "HCM" as a
// standalone token — then matching it against KNOWN_VN_STOCKS.

import { describe, it, expect } from "bun:test";
import { normalizeNews } from "../domain/services/newsNormalizer.js";
import type { RssItem } from "../domain/models/shared-types.js";
import { detectStocksInText } from "../domain/services/stockAliases.js";

// Minimal RssItem factory
function makeItem(title: string, content = ""): RssItem {
  return {
    title,
    content,
    url: "https://example.com/news/1",
    source: "cafef",
    publishedAt: new Date().toISOString(),
  };
}

describe("Task 1788 — HCM geographic false positive", () => {
  // ─── Core regression: the exact PC1/HCM scenario ─────────────────────────

  it("AC-1: 'TP.HCM' in title does NOT extract HCM ticker", () => {
    // PC1 contains a digit — not detectable via bare-token pattern; focus is HCM guard
    const item = makeItem(
      "PC1 phát hành thông báo tới 29,000 cổ đông tại TP.HCM",
    );
    const entry = normalizeNews(item);
    expect(entry.affectedActions).not.toContain("HCM");
  });

  it("AC-2: 'TP HCM' (space variant) in title does NOT extract HCM ticker", () => {
    const item = makeItem(
      "Công ty điện lực PC1 mở rộng lưới điện tại TP HCM",
    );
    const entry = normalizeNews(item);
    expect(entry.affectedActions).not.toContain("HCM");
  });

  it("AC-3: 'Hồ Chí Minh' (full name) in content does NOT extract HCM ticker", () => {
    const item = makeItem(
      "PC1 công bố kết quả kinh doanh",
      "Dự án điện mặt trời tại thành phố Hồ Chí Minh được phê duyệt",
    );
    const entry = normalizeNews(item);
    expect(entry.affectedActions).not.toContain("HCM");
  });

  it("AC-4: 'TP.HCM' in content does NOT extract HCM ticker", () => {
    const item = makeItem(
      "Công ty xây dựng dự án cầu đường tại TP.HCM",
      "Dự án hạ tầng giao thông TP.HCM được triển khai trong quý 2",
    );
    const entry = normalizeNews(item);
    expect(entry.affectedActions).not.toContain("HCM");
  });

  // ─── HCM ticker SHOULD still fire on legitimate company mentions ───────────

  it("AC-5: explicit 'HCM' ticker mention still extracted (parenthetical form)", () => {
    const item = makeItem(
      "Chứng khoán HCM (HCM) báo lãi quý 1 tăng 30%",
    );
    const entry = normalizeNews(item);
    expect(entry.affectedActions).toContain("HCM");
  });

  it("AC-6: alias 'chứng khoán hồ chí minh' still extracts HCM ticker", () => {
    const item = makeItem(
      "Công ty chứng khoán Hồ Chí Minh công bố kết quả kinh doanh quý 1",
    );
    const entry = normalizeNews(item);
    expect(entry.affectedActions).toContain("HCM");
  });

  it("AC-7: alias 'hcm securities' still extracts HCM ticker", () => {
    const matched = detectStocksInText(
      "HCM Securities announces dividend payment for shareholders",
      ["HCM"],
    );
    expect(matched).toContain("HCM");
  });

  // ─── detectStocksInText geographic guard ──────────────────────────────────

  it("AC-8: detectStocksInText with 'TP.HCM' text does NOT match HCM via alias", () => {
    // detectStocksInText uses alias matching only — HCM aliases are "chung khoan ho chi minh"
    // and "hcm securities". Neither appears in a geographic TP.HCM context.
    const matched = detectStocksInText(
      "PC1 phát hành thông báo tới cổ đông tại TP.HCM",
      ["HCM"],
    );
    expect(matched).not.toContain("HCM");
  });

  // ─── Other geographic ticker collisions (regression guard) ────────────────

  it("AC-9: article with only TP.HCM geographic context has no affectedActions for HCM", () => {
    const item = makeItem(
      "Ủy ban nhân dân TP.HCM họp về quy hoạch đô thị năm 2030",
    );
    const entry = normalizeNews(item);
    expect(entry.affectedActions).not.toContain("HCM");
  });

  it("AC-10: multiple TP.HCM occurrences in long text still blocked", () => {
    const item = makeItem(
      "Dự án BĐS TP.HCM: PC1 xây dựng hạ tầng điện tại TP.HCM và tỉnh lân cận",
      "Theo UBND TP.HCM, dự án sẽ kéo dài đến 2026 với tổng vốn đầu tư 500 tỷ",
    );
    const entry = normalizeNews(item);
    expect(entry.affectedActions).not.toContain("HCM");
  });
});
