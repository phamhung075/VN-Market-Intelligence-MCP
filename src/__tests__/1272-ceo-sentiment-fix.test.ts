/**
 * Task 1272 — CEO Group Sentiment Misclassification Fix
 *
 * Tests for 'xả hàng' (dump/unload shares) keyword classification as BEARISH.
 * CEO insider dumps should be classified as bearish, not bullish.
 */

import { describe, it, expect } from "bun:test";
import { classifySentiment, type SentimentResult, type SentimentDirection } from "../domain/services/sentimentClassifier.js";

function dir(result: SentimentResult): SentimentDirection {
  return result.direction;
}

describe("Task 1272 — CEO Group Sentiment Fix", () => {
  describe("'xả hàng' (dump shares) keyword", () => {
    it("detects 'Tổng giám đốc xả hàng cổ phiếu' as bearish", () => {
      expect(dir(classifySentiment("Tổng giám đốc xả hàng cổ phiếu"))).toBe("bearish");
    });

    it("detects 'CEO xả hàng khối lượng lớn' as bearish", () => {
      expect(dir(classifySentiment("CEO xả hàng khối lượng lớn"))).toBe("bearish");
    });

    it("detects 'Lãnh đạo công ty xả hàng liên tiếp' as bearish", () => {
      expect(dir(classifySentiment("Lãnh đạo công ty xả hàng liên tiếp"))).toBe("bearish");
    });

    it("includes 'xả hàng' in detected keywords for bearish sentiment", () => {
      const result = classifySentiment("Giám đốc xả hàng cổ phiếu công ty");
      expect(result.direction).toBe("bearish");
      expect(result.keywords.includes("xả hàng")).toBe(true);
    });

    it("assigns weight to 'xả hàng' that makes mixed bearish text clearly bearish", () => {
      // Even with some neutral text, 'xả hàng' should push to bearish
      const result = classifySentiment("Công ty thông báo CEO xả hàng cổ phiếu vào hôm nay");
      expect(result.direction).toBe("bearish");
      expect(result.confidence).toBeGreaterThan(0);
    });
  });

  describe("Regression: existing bearish keywords still work", () => {
    it("still detects 'bán sạch' as bearish", () => {
      expect(dir(classifySentiment("CEO bán sạch cổ phiếu"))).toBe("bearish");
    });

    it("still detects 'thoái sạch' as bearish", () => {
      expect(dir(classifySentiment("Thoái sạch vốn khỏi công ty"))).toBe("bearish");
    });

    it("still detects 'rút vốn' as bearish", () => {
      expect(dir(classifySentiment("Nhà đầu tư rút vốn khỏi thị trường"))).toBe("bearish");
    });
  });
});
