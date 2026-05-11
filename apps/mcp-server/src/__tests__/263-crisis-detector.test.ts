/**
 * Task 263 — Crisis Pattern Detector Tests
 *
 * Tests for crisisPatternDetector.ts:
 * - 18 Vietnamese crisis patterns across 7 crisis types
 * - Velocity-based severity detection
 * - CRITICAL = velocity > 5× baseline + sentiment < -0.6 + sources >= 2
 */

import { describe, it, expect } from "bun:test";
import {
  detectCrisisPatterns,
  type CrisisInput,
  type CrisisResult,
  type CrisisType,
} from "../domain/services/crisisPatternDetector.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<CrisisInput> = {}): CrisisInput {
  return {
    stockCode: "VNM",
    text: "",
    mentionCount: 5,
    baselineMentionCount: 1,
    negativeCount: 2,
    sourceCount: 2,
    sentiment: -0.3,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern detection tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 263 — Crisis Pattern Detector", () => {
  // 1. product_recall
  it("detects product_recall from 'thu hồi sản phẩm'", () => {
    const result = detectCrisisPatterns(
      makeInput({ text: "VNM phải thu hồi sản phẩm sữa bị ô nhiễm" }),
    );
    expect(result.detected).toBe(true);
    expect(result.crisisType).toBe("product_recall");
  });

  it("detects product_recall from 'lỗi sản phẩm'", () => {
    const result = detectCrisisPatterns(
      makeInput({ text: "Phát hiện lỗi sản phẩm nghiêm trọng trong lô hàng FPT" }),
    );
    expect(result.detected).toBe(true);
    expect(result.crisisType).toBe("product_recall");
  });

  // 2. environmental
  it("detects environmental crisis from 'ô nhiễm môi trường'", () => {
    const result = detectCrisisPatterns(
      makeInput({ text: "Nhà máy VCB gây ô nhiễm môi trường nghiêm trọng" }),
    );
    expect(result.detected).toBe(true);
    expect(result.crisisType).toBe("environmental");
  });

  it("detects environmental crisis from 'xả thải'", () => {
    const result = detectCrisisPatterns(
      makeInput({ text: "Công ty bị phát hiện xả thải trái phép ra sông" }),
    );
    expect(result.detected).toBe(true);
    expect(result.crisisType).toBe("environmental");
  });

  // 3. workplace_accident
  it("detects workplace_accident from 'tai nạn lao động'", () => {
    const result = detectCrisisPatterns(
      makeInput({ text: "Xảy ra tai nạn lao động nghiêm trọng tại nhà máy HPG" }),
    );
    expect(result.detected).toBe(true);
    expect(result.crisisType).toBe("workplace_accident");
  });

  it("detects workplace_accident from 'cháy nổ nhà máy'", () => {
    const result = detectCrisisPatterns(
      makeInput({ text: "Cháy nổ nhà máy khiến nhiều công nhân bị thương" }),
    );
    expect(result.detected).toBe(true);
    expect(result.crisisType).toBe("workplace_accident");
  });

  // 4. cyber_breach
  it("detects cyber_breach from 'rò rỉ dữ liệu'", () => {
    const result = detectCrisisPatterns(
      makeInput({ text: "FPT bị rò rỉ dữ liệu khách hàng" }),
    );
    expect(result.detected).toBe(true);
    expect(result.crisisType).toBe("cyber_breach");
  });

  it("detects cyber_breach from 'tấn công mạng'", () => {
    const result = detectCrisisPatterns(
      makeInput({ text: "Hệ thống ngân hàng bị tấn công mạng làm gián đoạn dịch vụ" }),
    );
    expect(result.detected).toBe(true);
    expect(result.crisisType).toBe("cyber_breach");
  });

  // 5. fraud_scandal
  it("detects fraud_scandal from 'gian lận tài chính'", () => {
    const result = detectCrisisPatterns(
      makeInput({ text: "VCB bị điều tra về gian lận tài chính" }),
    );
    expect(result.detected).toBe(true);
    expect(result.crisisType).toBe("fraud_scandal");
  });

  it("detects fraud_scandal from 'làm giả báo cáo'", () => {
    const result = detectCrisisPatterns(
      makeInput({ text: "Phát hiện làm giả báo cáo tài chính tại công ty niêm yết" }),
    );
    expect(result.detected).toBe(true);
    expect(result.crisisType).toBe("fraud_scandal");
  });

  // 6. executive_scandal
  it("detects executive_scandal from 'lãnh đạo bị bắt'", () => {
    const result = detectCrisisPatterns(
      makeInput({ text: "Tổng giám đốc VNM bị bắt vì tội tham nhũng" }),
    );
    expect(result.detected).toBe(true);
    expect(result.crisisType).toBe("executive_scandal");
  });

  it("detects executive_scandal from 'CEO từ chức đột ngột'", () => {
    const result = detectCrisisPatterns(
      makeInput({ text: "CEO từ chức đột ngột giữa bối cảnh bê bối nội bộ" }),
    );
    expect(result.detected).toBe(true);
    expect(result.crisisType).toBe("executive_scandal");
  });

  // 7. regulatory_action
  it("detects regulatory_action from 'bị phạt hành chính'", () => {
    const result = detectCrisisPatterns(
      makeInput({ text: "HPG bị phạt hành chính 5 tỷ đồng vì vi phạm quy định" }),
    );
    expect(result.detected).toBe(true);
    expect(result.crisisType).toBe("regulatory_action");
  });

  it("detects regulatory_action from 'đình chỉ hoạt động'", () => {
    const result = detectCrisisPatterns(
      makeInput({ text: "Cơ quan quản lý ra lệnh đình chỉ hoạt động chi nhánh ngân hàng" }),
    );
    expect(result.detected).toBe(true);
    expect(result.crisisType).toBe("regulatory_action");
  });

  // ── Velocity-based severity ────────────────────────────────────────────────

  it("returns CRITICAL when velocity > 5× baseline + sentiment < -0.6 + sources >= 2", () => {
    const result = detectCrisisPatterns(
      makeInput({
        text: "VNM phải thu hồi sản phẩm sữa bị ô nhiễm",
        mentionCount: 12,
        baselineMentionCount: 2,  // velocity = 6× baseline
        sentiment: -0.7,
        sourceCount: 3,
      }),
    );
    expect(result.detected).toBe(true);
    expect(result.severity).toBe("critical");
  });

  it("returns HIGH when velocity > 3× baseline but not CRITICAL criteria", () => {
    const result = detectCrisisPatterns(
      makeInput({
        text: "VNM phải thu hồi sản phẩm",
        mentionCount: 8,
        baselineMentionCount: 2,  // velocity = 4× baseline
        sentiment: -0.4,
        sourceCount: 2,
      }),
    );
    expect(result.detected).toBe(true);
    expect(result.severity).toBe("high");
  });

  it("returns MEDIUM when velocity > 2× baseline", () => {
    const result = detectCrisisPatterns(
      makeInput({
        text: "VNM phải thu hồi sản phẩm",
        mentionCount: 5,
        baselineMentionCount: 2,  // velocity = 2.5× baseline
        sentiment: -0.2,
        sourceCount: 1,
      }),
    );
    expect(result.detected).toBe(true);
    expect(result.severity).toBe("medium");
  });

  it("returns LOW when velocity <= 2× baseline", () => {
    const result = detectCrisisPatterns(
      makeInput({
        text: "VNM phải thu hồi sản phẩm",
        mentionCount: 2,
        baselineMentionCount: 2,  // velocity = 1× baseline
        sentiment: -0.1,
        sourceCount: 1,
      }),
    );
    expect(result.detected).toBe(true);
    expect(result.severity).toBe("low");
  });

  // ── Non-crisis text ────────────────────────────────────────────────────────

  it("returns detected=false for neutral business news", () => {
    const result = detectCrisisPatterns(
      makeInput({ text: "VNM công bố kết quả kinh doanh quý II tăng trưởng 15%" }),
    );
    expect(result.detected).toBe(false);
  });

  it("returns detected=false for empty text", () => {
    const result = detectCrisisPatterns(makeInput({ text: "" }));
    expect(result.detected).toBe(false);
  });

  // ── Return structure ───────────────────────────────────────────────────────

  it("returns complete CrisisResult structure", () => {
    const result = detectCrisisPatterns(
      makeInput({ text: "Công ty bị cơ quan quản lý thu hồi giấy phép hoạt động" }),
    );
    expect(result).toHaveProperty("detected");
    expect(result).toHaveProperty("severity");
    expect(result).toHaveProperty("crisisType");
    expect(result).toHaveProperty("matchedPatterns");
    expect(result).toHaveProperty("velocityRatio");
    expect(Array.isArray(result.matchedPatterns)).toBe(true);
  });
});
