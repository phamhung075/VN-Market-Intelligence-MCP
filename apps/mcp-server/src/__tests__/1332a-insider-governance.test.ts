/**
 * Task 1332a — RED Phase: Insider Governance — Sell-High-Buy-Low Pattern
 *
 * Bug: "Chủ tịch Phát Đạt lý giải việc bán 88 triệu cổ phiếu giá cao rồi mua lại
 * khi giá giảm" classified BULLISH. Expected BEARISH.
 *
 * Pattern: executive sells at high price, then re-buys after price drops.
 * Governance signal: insider extracted value at peak — bearish intent, not bullish accumulation.
 *
 * RED phase: all tests fail until 1332b adds VN_BEARISH keywords.
 */

import { describe, test, expect } from "bun:test";
import { classifySentiment } from "../domain/services/sentimentClassifier.js";

// ═══════════════════════════════════════════════════════════════════════════
// TC-1332a-1: Sell-high-buy-low keyword classification
// ═══════════════════════════════════════════════════════════════════════════

describe("TC-1332a-1: Insider sell-high-buy-low pattern", () => {

  test("1a: exact article headline classifies as BEARISH", () => {
    const result = classifySentiment(
      "Chủ tịch Phát Đạt lý giải việc bán 88 triệu cổ phiếu giá cao rồi mua lại khi giá giảm"
    );
    expect(result.direction).toBe("bearish");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  test("1b: 'bán giá cao rồi mua lại' classifies as BEARISH", () => {
    const result = classifySentiment(
      "Lãnh đạo bán giá cao rồi mua lại cổ phiếu khi thị trường điều chỉnh"
    );
    expect(result.direction).toBe("bearish");
    expect(result.keywords).toContain("bán giá cao rồi mua lại");
  });

  test("1c: 'mua lại khi giá giảm' classifies as BEARISH", () => {
    const result = classifySentiment(
      "Chủ tịch công ty mua lại khi giá giảm sau khi đã chốt lời trước đó"
    );
    expect(result.direction).toBe("bearish");
    expect(result.keywords).toContain("mua lại khi giá giảm");
  });

  test("1d: 'bán ra...triệu cổ phiếu...giá cao' pattern classifies as BEARISH", () => {
    const result = classifySentiment(
      "Ông Nguyễn Văn A bán ra 50 triệu cổ phiếu giá cao trong tháng trước"
    );
    expect(result.direction).toBe("bearish");
  });

  test("1e: 'chủ tịch bán' with rebuy phrase classifies as BEARISH", () => {
    const result = classifySentiment(
      "Chủ tịch bán 20 triệu cổ phiếu rồi mua lại sau khi giá giảm sâu"
    );
    expect(result.direction).toBe("bearish");
  });

  test("1f: 'bán rồi mua lại' variant classifies as BEARISH", () => {
    const result = classifySentiment(
      "Tổng giám đốc bán rồi mua lại cổ phần khi giá điều chỉnh — tín hiệu rủi ro quản trị"
    );
    expect(result.direction).toBe("bearish");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TC-1332a-2: Score arithmetic — bearish must beat any incidental bullish
// ═══════════════════════════════════════════════════════════════════════════

describe("TC-1332a-2: Score arithmetic — bearish dominates mixed text", () => {

  test("2a: article with 'mua lại' + 'giá cao rồi mua lại' net result is BEARISH", () => {
    // "mua lại" alone would be neutral/bullish — the compound phrase must override
    const result = classifySentiment(
      "Chủ tịch Phát Đạt bán 88 triệu cổ phiếu giá cao rồi mua lại sau khi giá giảm 30%"
    );
    expect(result.direction).toBe("bearish");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  test("2b: bearish score must exceed bullish score for sell-high-buy-low article", () => {
    const result = classifySentiment(
      "Lãnh đạo bán giá cao rồi mua lại — nhà đầu tư lo ngại về quản trị doanh nghiệp"
    );
    expect(result.direction).toBe("bearish");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TC-1332a-3: Regression — genuine insider buy still fires correctly
// ═══════════════════════════════════════════════════════════════════════════

describe("TC-1332a-3: Regression — genuine insider buy not affected", () => {

  test("3a: clean insider buy (no sell-then-rebuy) still classifies BULLISH", () => {
    const result = classifySentiment(
      "Chủ tịch mua thêm 5 triệu cổ phiếu tích lũy dài hạn — tín hiệu lạc quan"
    );
    expect(result.direction).toBe("bullish");
  });

  test("3b: 'mua ròng' without sell context still classifies BULLISH", () => {
    const result = classifySentiment(
      "Khối ngoại mua ròng mạnh, tín hiệu tích cực cho thị trường"
    );
    expect(result.direction).toBe("bullish");
  });
});
