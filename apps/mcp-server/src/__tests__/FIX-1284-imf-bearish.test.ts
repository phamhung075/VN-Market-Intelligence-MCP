/**
 * FIX-1284: Global bearish macro news misclassified BULLISH
 *
 * Bug: IMF GDP cut + foreign fund losses were returning BULLISH direction.
 *
 * Root cause: bearish patterns "hạ dự báo", "cảnh báo kịch bản bất lợi",
 * "báo lỗ", "tăng phòng thủ tiền mặt" were missing or insufficiently weighted
 * to overcome bullish sub-phrase co-firing ("tăng trưởng" w2, "dự báo tăng" w3).
 *
 * Fix: Added compound bearish keywords in VN_BEARISH:
 *   - "hạ dự báo tăng trưởng" weight 6
 *   - "hạ dự báo" weight 4
 *   - "cảnh báo kịch bản bất lợi" weight 3
 *   - "báo lỗ" weight 3
 *   - "tăng phòng thủ tiền mặt" weight 3
 *
 * Run: bun test src/__tests__/FIX-1284-imf-bearish.test.ts
 */

import { describe, it, expect } from "bun:test";
import { classifySentiment } from "../domain/services/sentimentClassifier.js";

describe("FIX-1284 — Global bearish macro: IMF GDP cut + foreign fund losses", () => {
  it("AC-1: IMF GDP forecast downgrade → BEARISH", () => {
    const text = "IMF hạ dự báo tăng trưởng GDP toàn cầu, cảnh báo kịch bản bất lợi";
    const result = classifySentiment(text);
    expect(result.direction).toBe("bearish");
  });

  it("AC-2: Foreign fund loss + risk-off cash increase → BEARISH", () => {
    const text = "Quỹ ngoại báo lỗ tháng 3, tăng phòng thủ tiền mặt";
    const result = classifySentiment(text);
    expect(result.direction).toBe("bearish");
  });

  it("AC-3: 'hạ dự báo' standalone → BEARISH (weight 4 dominates generic text)", () => {
    const text = "Ngân hàng thế giới hạ dự báo tăng trưởng khu vực";
    const result = classifySentiment(text);
    expect(result.direction).toBe("bearish");
  });

  it("AC-4: 'báo lỗ' standalone → BEARISH", () => {
    const text = "Doanh nghiệp báo lỗ quý 1 do chi phí tăng";
    const result = classifySentiment(text);
    expect(result.direction).toBe("bearish");
  });

  it("AC-5: 'tăng phòng thủ tiền mặt' → BEARISH (risk-off signal)", () => {
    const text = "Nhà đầu tư tăng phòng thủ tiền mặt trước biến động thị trường";
    const result = classifySentiment(text);
    expect(result.direction).toBe("bearish");
  });

  it("AC-6: 'cảnh báo kịch bản bất lợi' → BEARISH (adverse scenario warning)", () => {
    const text = "IMF cảnh báo kịch bản bất lợi cho nền kinh tế toàn cầu";
    const result = classifySentiment(text);
    expect(result.direction).toBe("bearish");
  });

  it("AC-7: 'hạ dự báo tăng trưởng' compound → BEARISH with confidence > 0.5", () => {
    const text = "IMF hạ dự báo tăng trưởng GDP toàn cầu, cảnh báo kịch bản bất lợi";
    const result = classifySentiment(text);
    expect(result.direction).toBe("bearish");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("AC-8: 'quỹ ngoại báo lỗ' does not trigger false BULLISH", () => {
    const text = "Quỹ ngoại báo lỗ tháng 3";
    const result = classifySentiment(text);
    expect(result.direction).not.toBe("bullish");
  });
});
