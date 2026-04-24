/**
 * Task 1308a — RED Phase: Insider Selling + Global Bearish Macro Patterns
 *
 * Covers two gaps reported in bugs 1272/1278/1284:
 *
 * GAP-1: Insider SELLING misclassified BULLISH
 *   - "bán ra" missing from VN_BEARISH
 *   - detectInsiderSelling() function does not exist in pollNews.ts
 *
 * GAP-2: Global bearish macro misclassified BULLISH
 *   - "hạ dự báo", "cảnh báo kịch bản bất lợi", "báo lỗ",
 *     "tăng phòng thủ tiền mặt", "risk-off", "flight to safety"
 *     all missing from keyword tables
 *
 * RED phase: All tests in TC-1308a-1 and TC-1308a-2 should FAIL until
 * GREEN implementation adds the missing patterns + function.
 */

import { describe, test, expect } from "bun:test";
import { classifySentiment } from "../domain/services/sentimentClassifier.js";
import { detectInsiderSelling } from "../application/usecases/pollNews.js";

// ═══════════════════════════════════════════════════════════════════════════
// TC-1308a-1: Insider SELLING patterns
// ═══════════════════════════════════════════════════════════════════════════

describe("TC-1308a-1: Insider selling keyword classification", () => {
  // ── 1a: "bán ra" missing from VN_BEARISH ────────────────────────────────

  test("1a: 'bán ra' classifies as BEARISH", () => {
    const result = classifySentiment("Cổ đông lớn bán ra 9 triệu cổ phiếu");
    expect(result.direction).toBe("bearish");
    expect(result.keywords).toContain("bán ra");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  test("1b: 'bán ra' in CEO context classifies as BEARISH", () => {
    const result = classifySentiment("CEO Group bán ra 9 triệu cổ phiếu liên tiếp");
    expect(result.direction).toBe("bearish");
    expect(result.keywords).toContain("bán ra");
  });

  // ── 1c: detectInsiderSelling() function existence ────────────────────────

  test("1c: detectInsiderSelling('xả hàng') returns true", () => {
    const result = detectInsiderSelling("Tổng giám đốc xả hàng cổ phiếu khối lượng lớn");
    expect(result).toBe(true);
  });

  test("1d: detectInsiderSelling('bán ra') returns true", () => {
    const result = detectInsiderSelling("Cổ đông lớn bán ra 9 triệu cổ phiếu");
    expect(result).toBe(true);
  });

  test("1e: detectInsiderSelling('thoái vốn') returns true", () => {
    const result = detectInsiderSelling("Quỹ ngoại thoái vốn khỏi VCB");
    expect(result).toBe(true);
  });

  test("1f: detectInsiderSelling('dump') returns true (English)", () => {
    const result = detectInsiderSelling("CEO dump shares after record quarter");
    expect(result).toBe(true);
  });

  test("1g: detectInsiderSelling('selling') returns true (English)", () => {
    const result = detectInsiderSelling("Insider selling accelerates at major bank");
    expect(result).toBe(true);
  });

  test("1h: detectInsiderSelling returns false for bullish article", () => {
    const result = detectInsiderSelling("VCB tăng mạnh sau kết quả kinh doanh tốt");
    expect(result).toBe(false);
  });

  test("1i: detectInsiderSelling returns false for neutral article", () => {
    const result = detectInsiderSelling("Thị trường chứng khoán hôm nay giao dịch bình thường");
    expect(result).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TC-1308a-2: Global bearish macro patterns
// ═══════════════════════════════════════════════════════════════════════════

describe("TC-1308a-2: Global bearish macro keyword classification", () => {
  // ── 2a: "hạ dự báo" (lower forecast) ────────────────────────────────────

  test("2a: 'hạ dự báo' (IMF lowers GDP forecast) classifies as BEARISH", () => {
    const result = classifySentiment("IMF hạ dự báo GDP toàn cầu xuống còn 2.8%");
    expect(result.direction).toBe("bearish");
    expect(result.keywords).toContain("hạ dự báo");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  test("2b: 'hạ dự báo tăng trưởng' classifies as BEARISH not BULLISH", () => {
    const result = classifySentiment("IMF hạ dự báo tăng trưởng kinh tế Việt Nam");
    expect(result.direction).toBe("bearish");
  });

  // ── 2c: "cảnh báo kịch bản bất lợi" (adverse scenario warning) ──────────

  test("2c: 'cảnh báo kịch bản bất lợi' classifies as BEARISH", () => {
    const result = classifySentiment("Ngân hàng Thế giới cảnh báo kịch bản bất lợi cho kinh tế Đông Nam Á");
    expect(result.direction).toBe("bearish");
    expect(result.keywords).toContain("cảnh báo kịch bản bất lợi");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  // ── 2d: "báo lỗ" (report losses) ────────────────────────────────────────

  test("2d: 'báo lỗ' classifies as BEARISH", () => {
    const result = classifySentiment("Quỹ ngoại báo lỗ kỷ lục trong quý 3");
    expect(result.direction).toBe("bearish");
    expect(result.keywords).toContain("báo lỗ");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  test("2e: 'quỹ ngoại báo lỗ' full phrase from bug report 1284", () => {
    const result = classifySentiment("Quỹ ngoại báo lỗ lớn do biến động tỷ giá");
    expect(result.direction).toBe("bearish");
  });

  // ── 2f: "tăng phòng thủ tiền mặt" (increase cash defense) ───────────────

  test("2f: 'tăng phòng thủ tiền mặt' classifies as BEARISH", () => {
    const result = classifySentiment("Các quỹ đầu tư tăng phòng thủ tiền mặt trước rủi ro toàn cầu");
    expect(result.direction).toBe("bearish");
    expect(result.keywords).toContain("tăng phòng thủ tiền mặt");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  // ── 2g: "risk-off" (English) ─────────────────────────────────────────────

  test("2g: 'risk-off' classifies as BEARISH", () => {
    const result = classifySentiment("Global risk-off sentiment weighs on emerging markets");
    expect(result.direction).toBe("bearish");
    expect(result.keywords).toContain("risk-off");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  // ── 2h: "flight to safety" (English) ────────────────────────────────────

  test("2h: 'flight to safety' classifies as BEARISH", () => {
    const result = classifySentiment("Investors engage in flight to safety amid global uncertainty");
    expect(result.direction).toBe("bearish");
    expect(result.keywords).toContain("flight to safety");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  // ── 2i: Regression — existing bearish macro phrases still work ───────────

  test("2i: regression — 'suy thoái' still classifies BEARISH", () => {
    const result = classifySentiment("Kinh tế toàn cầu đối mặt nguy cơ suy thoái");
    expect(result.direction).toBe("bearish");
  });

  test("2j: regression — 'recession' still classifies BEARISH", () => {
    const result = classifySentiment("IMF warns of global recession risk");
    expect(result.direction).toBe("bearish");
  });
});
