/**
 * Task 1198 — VND currency false positive guard
 *
 * Tests that extractStockTickers() (called internally by normalizeNews) does not
 * include "VND" in affectedActions when the surrounding text clearly identifies
 * it as the VND currency / ISO-4217 code, while still detecting VND when cited
 * as the VNDirect ticker in a parenthetical "(VND)" pattern.
 */

import { describe, test, expect } from "bun:test";
import { normalizeNews } from "../domain/services/newsNormalizer.js";

// RssItem shape: title, url, publishedAt, content, source
function makeItem(title: string, content: string = "") {
  return {
    title,
    url: "https://cafef.vn/test",
    publishedAt: new Date().toISOString(),
    content,
    source: "cafef",
  };
}

describe("Task 1198 — VND currency false positive guard", () => {
  test("AC-5: USD/VND forex text does not produce VND in affectedActions", () => {
    const result = normalizeNews(
      makeItem(
        "tỷ giá USD/VND tăng 150 điểm lên 25.450",
        "ngân hàng nhà nước công bố tỷ giá USD/VND"
      )
    );
    expect(result.affectedActions).not.toContain("VND");
  });

  test("AC-5 variant: 'tỷ vnd' context suppresses VND ticker", () => {
    const result = normalizeNews(
      makeItem("doanh thu 1.000 tỷ vnd trong quý", "")
    );
    expect(result.affectedActions).not.toContain("VND");
  });

  test("AC-5 variant: 'tỷ đồng' context suppresses VND ticker", () => {
    const result = normalizeNews(
      makeItem("kết quả lợi nhuận 500 tỷ đồng vnd quý 1", "")
    );
    expect(result.affectedActions).not.toContain("VND");
  });

  test("AC-5 variant: '/vnd' slash pattern suppresses VND ticker", () => {
    const result = normalizeNews(
      makeItem("tỷ giá EUR tăng so với VND hôm nay", "euro/vnd đạt mức cao nhất")
    );
    expect(result.affectedActions).not.toContain("VND");
  });

  test("AC-6: VNDirect (VND) parenthetical still detected as ticker", () => {
    const result = normalizeNews(
      makeItem("VNDirect (VND) công bố lợi nhuận quý 1 tăng 45%", "")
    );
    expect(result.affectedActions).toContain("VND");
  });

  test("non-ambiguous ticker VCB is unaffected by guard", () => {
    const result = normalizeNews(
      makeItem("VCB tăng mạnh sau kết quả kinh doanh quý 2", "")
    );
    expect(result.affectedActions).toContain("VCB");
  });

  test("VND without currency context is detected as ticker (VNDirect mention)", () => {
    // Plain "VND" in a securities context without forex/currency tokens
    const result = normalizeNews(
      makeItem("VND tăng mạnh sau kết quả kinh doanh tốt", "")
    );
    expect(result.affectedActions).toContain("VND");
  });

  test("AC-5 variant: 'billion vnd' context suppresses VND ticker", () => {
    const result = normalizeNews(
      makeItem("profit reached 10 billion vnd in q1", "")
    );
    expect(result.affectedActions).not.toContain("VND");
  });
});
