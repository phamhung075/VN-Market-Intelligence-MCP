// apps/mcp-server/src/__tests__/AR-page-classifier.test.ts
// Sprint BCTC-AGENTIC-REFINE — FR-5 Page Classifier Unit Tests
//
// Tests:
//   AC-FR5-1: page with '|' → true
//   AC-FR5-2: page with 'Mã số' → true (Vietnamese column keyword)
//   AC-FR5-3: pure prose, prevPageWasImage=false → false
//   AC-FR5-4: continuation window — prev was image + continuation marker → true

import { describe, it, expect } from "bun:test";
import { classifyPageForImageLoad } from "../application/utils/pageClassifier.js";

describe("classifyPageForImageLoad (FR-5)", () => {
  // ── AC-FR5-1: pipe character → true ────────────────────────────────────────

  it("AC-FR5-1: page with | character → true (table delimiter)", () => {
    const ocrText = "| Mã số | Chỉ tiêu | Số cuối kỳ | Số đầu kỳ |\n|---|---|---|---|\n| 100 | Tiền | 1234 | 1000 |";
    expect(classifyPageForImageLoad(ocrText, false)).toBe(true);
  });

  it("AC-FR5-1b: single pipe in text → true", () => {
    const ocrText = "Giá trị | 1.234.567";
    expect(classifyPageForImageLoad(ocrText, false)).toBe(true);
  });

  it("AC-FR5-1c: digit sequence with whitespace (numeric columns) → true", () => {
    // Pattern: \d[\d\s]*\d{3,} matches sequences like "1 234 567" or "1234567"
    const ocrText = "Tiền mặt: 1 234 567\nĐầu tư: 500 000";
    expect(classifyPageForImageLoad(ocrText, false)).toBe(true);
  });

  // ── AC-FR5-2: Vietnamese column keywords → true ─────────────────────────────

  it("AC-FR5-2: page with 'Mã số' → true", () => {
    const ocrText = "Mã số   Chỉ tiêu   Số liệu";
    expect(classifyPageForImageLoad(ocrText, false)).toBe(true);
  });

  it("AC-FR5-2b: 'Thuyết minh' keyword → true", () => {
    const ocrText = "Cột Thuyết minh số 15 trong báo cáo";
    expect(classifyPageForImageLoad(ocrText, false)).toBe(true);
  });

  it("AC-FR5-2c: 'Số cuối' keyword → true (case-insensitive)", () => {
    const ocrText = "số cuối kỳ: 1.234.567";
    expect(classifyPageForImageLoad(ocrText, false)).toBe(true);
  });

  it("AC-FR5-2d: 'Số đầu' keyword → true", () => {
    const ocrText = "Số đầu kỳ   Số cuối kỳ";
    expect(classifyPageForImageLoad(ocrText, false)).toBe(true);
  });

  it("AC-FR5-2e: 'chỉ tiêu' keyword → true (lowercase, case-insensitive)", () => {
    const ocrText = "chỉ tiêu tài chính quan trọng";
    expect(classifyPageForImageLoad(ocrText, false)).toBe(true);
  });

  // ── AC-FR5-3: pure prose → false ────────────────────────────────────────────

  it("AC-FR5-3: pure prose, prevPageWasImage=false → false", () => {
    const ocrText = "Công ty cổ phần FPT báo cáo kết quả kinh doanh quý bốn năm nay. " +
      "Doanh thu đạt mức tăng trưởng ổn định. Ban lãnh đạo đánh giá tình hình thuận lợi.";
    expect(classifyPageForImageLoad(ocrText, false)).toBe(false);
  });

  it("AC-FR5-3b: cover page text → false", () => {
    const ocrText = "BÁO CÁO TÀI CHÍNH HỢP NHẤT\nQuý IV năm 2024\nCông ty Cổ phần FPT";
    expect(classifyPageForImageLoad(ocrText, false)).toBe(false);
  });

  it("AC-FR5-3c: pure narrative notes without numbers → false", () => {
    const ocrText = "Theo quy định của Bộ Tài chính, công ty áp dụng chuẩn mực kế toán Việt Nam. " +
      "Các chính sách kế toán được trình bày nhất quán với năm trước.";
    expect(classifyPageForImageLoad(ocrText, false)).toBe(false);
  });

  // ── AC-FR5-4: continuation window ──────────────────────────────────────────

  it("AC-FR5-4: prev was image + 'tiếp theo' in text → true (continuation)", () => {
    const ocrText = "tiếp theo (tiếp) — bảng số liệu phần hai";
    expect(classifyPageForImageLoad(ocrText, true)).toBe(true);
  });

  it("AC-FR5-4b: prev was image + 'continued' in text → true", () => {
    const ocrText = "continued from previous page\nMore data rows follow";
    expect(classifyPageForImageLoad(ocrText, true)).toBe(true);
  });

  it("AC-FR5-4c: prev was image + no continuation marker + pure prose → false", () => {
    // If prev was image but current page has no table markers OR continuation markers
    const ocrText = "Chú thích: Các số liệu trên được kiểm toán độc lập bởi Deloitte.";
    // No pipe, no VN keywords, no continuation markers → false
    expect(classifyPageForImageLoad(ocrText, true)).toBe(false);
  });

  it("AC-FR5-4d: prev NOT image + continuation marker → false (no context)", () => {
    // Continuation marker only triggers when prevPageWasImage = true
    const ocrText = "tiếp theo từ trang trước";
    expect(classifyPageForImageLoad(ocrText, false)).toBe(false);
  });

  // ── Edge cases ────────────────────────────────────────────────────────────────

  it("empty text → false", () => {
    expect(classifyPageForImageLoad("", false)).toBe(false);
  });

  it("empty text + prevPageWasImage=true → false (no continuation marker)", () => {
    expect(classifyPageForImageLoad("", true)).toBe(false);
  });

  it("case-insensitive: 'TIẾP THEO' → true (prev was image)", () => {
    expect(classifyPageForImageLoad("TIẾP THEO", true)).toBe(true);
  });

  it("case-insensitive: 'CONTINUED' → true (prev was image)", () => {
    expect(classifyPageForImageLoad("CONTINUED", true)).toBe(true);
  });
});
