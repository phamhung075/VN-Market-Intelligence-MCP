/**
 * Task 240 — Legal Risk Detector
 *
 * Tests for detectLegalRisk() pure domain service.
 * 22 tests covering: each pattern, stock resolution, false positives, empty input.
 */
import { describe, it, expect } from "bun:test";
import {
  detectLegalRisk,
  type LegalRiskSignal,
  type LegalRiskType,
} from "../domain/services/legalRiskDetector.js";

const WATCHLIST = ["VCB", "VHM", "FPT", "HPG", "NVL"];

describe("Task 240 — Legal Risk Detector", () => {
  it("returns empty array for empty text", () => {
    const result = detectLegalRisk("", WATCHLIST);
    expect(result).toEqual([]);
  });

  it("returns empty array for text with no legal keywords", () => {
    const result = detectLegalRisk(
      "Doanh thu VHM tăng 15% trong quý 2, kết quả khả quan",
      WATCHLIST,
    );
    expect(result).toEqual([]);
  });

  it("returns empty array for empty watchlist", () => {
    const result = detectLegalRisk("khởi tố giám đốc VCB", []);
    expect(result).toEqual([]);
  });

  it("detects 'khởi tố' as prosecution CRITICAL", () => {
    const result = detectLegalRisk("Cơ quan điều tra khởi tố giám đốc VCB", WATCHLIST);
    expect(result.length).toBeGreaterThan(0);
    const sig = result.find((s) => s.riskType === "prosecution");
    expect(sig).toBeDefined();
    expect(sig!.severity).toBe("critical");
    expect(sig!.stockCodes).toContain("VCB");
  });

  it("detects 'bắt tạm giam' as prosecution CRITICAL", () => {
    const result = detectLegalRisk("Cảnh sát bắt tạm giam lãnh đạo VHM", WATCHLIST);
    const sig = result.find((s) => s.riskType === "prosecution");
    expect(sig).toBeDefined();
    expect(sig!.severity).toBe("critical");
    expect(sig!.stockCodes).toContain("VHM");
  });

  it("detects 'bắt giam' as prosecution CRITICAL", () => {
    const result = detectLegalRisk("Bộ Công an bắt giam chủ tịch HPG", WATCHLIST);
    const sig = result.find((s) => s.riskType === "prosecution");
    expect(sig).toBeDefined();
    expect(sig!.severity).toBe("critical");
  });

  it("detects 'phong tỏa tài sản' as asset_freeze CRITICAL", () => {
    const result = detectLegalRisk(
      "Tòa án phong tỏa tài sản của công ty NVL",
      WATCHLIST,
    );
    const sig = result.find((s) => s.riskType === "asset_freeze");
    expect(sig).toBeDefined();
    expect(sig!.severity).toBe("critical");
    expect(sig!.stockCodes).toContain("NVL");
  });

  it("detects 'kê biên' as asset_freeze CRITICAL", () => {
    const result = detectLegalRisk("Cơ quan thi hành án kê biên tài sản FPT", WATCHLIST);
    const sig = result.find((s) => s.riskType === "asset_freeze");
    expect(sig).toBeDefined();
    expect(sig!.severity).toBe("critical");
  });

  it("detects 'truy thu thuế' as tax_penalty HIGH", () => {
    const result = detectLegalRisk(
      "Cục thuế truy thu thuế 500 tỷ đồng từ VCB",
      WATCHLIST,
    );
    const sig = result.find((s) => s.riskType === "tax_penalty");
    expect(sig).toBeDefined();
    expect(sig!.severity).toBe("high");
    expect(sig!.stockCodes).toContain("VCB");
  });

  it("detects 'phạt vi phạm thuế' as tax_penalty HIGH", () => {
    const result = detectLegalRisk(
      "Thanh tra phát hiện phạt vi phạm thuế tại HPG",
      WATCHLIST,
    );
    const sig = result.find((s) => s.riskType === "tax_penalty");
    expect(sig).toBeDefined();
    expect(sig!.severity).toBe("high");
  });

  it("detects 'thu hồi giấy phép' as license_revocation HIGH", () => {
    const result = detectLegalRisk(
      "Bộ Xây dựng có thể thu hồi giấy phép dự án VHM",
      WATCHLIST,
    );
    const sig = result.find((s) => s.riskType === "license_revocation");
    expect(sig).toBeDefined();
    expect(sig!.severity).toBe("high");
    expect(sig!.stockCodes).toContain("VHM");
  });

  it("detects 'đình chỉ hoạt động' as license_revocation HIGH", () => {
    const result = detectLegalRisk(
      "Sở Kế hoạch đình chỉ hoạt động chi nhánh FPT",
      WATCHLIST,
    );
    const sig = result.find((s) => s.riskType === "license_revocation");
    expect(sig).toBeDefined();
    expect(sig!.severity).toBe("high");
  });

  it("detects 'chống bán phá giá' as anti_dumping HIGH", () => {
    const result = detectLegalRisk(
      "Mỹ áp thuế chống bán phá giá lên thép HPG",
      WATCHLIST,
    );
    const sig = result.find((s) => s.riskType === "anti_dumping");
    expect(sig).toBeDefined();
    expect(sig!.severity).toBe("high");
    expect(sig!.stockCodes).toContain("HPG");
  });

  it("detects 'anti-dumping' as anti_dumping HIGH", () => {
    const result = detectLegalRisk(
      "EU initiates anti-dumping investigation against HPG steel exports",
      WATCHLIST,
    );
    const sig = result.find((s) => s.riskType === "anti_dumping");
    expect(sig).toBeDefined();
    expect(sig!.severity).toBe("high");
  });

  it("detects 'thua kiện' as litigation MEDIUM", () => {
    const result = detectLegalRisk("NVL thua kiện vụ tranh chấp đất đai", WATCHLIST);
    const sig = result.find((s) => s.riskType === "litigation");
    expect(sig).toBeDefined();
    expect(sig!.severity).toBe("medium");
    expect(sig!.stockCodes).toContain("NVL");
  });

  it("detects 'bồi thường thiệt hại' as litigation MEDIUM", () => {
    const result = detectLegalRisk(
      "VCB phải bồi thường thiệt hại cho khách hàng",
      WATCHLIST,
    );
    const sig = result.find((s) => s.riskType === "litigation");
    expect(sig).toBeDefined();
    expect(sig!.severity).toBe("medium");
  });

  it("detects 'điều tra' as investigation MEDIUM", () => {
    const result = detectLegalRisk(
      "Ủy ban chứng khoán điều tra giao dịch bất thường FPT",
      WATCHLIST,
    );
    const sig = result.find((s) => s.riskType === "investigation");
    expect(sig).toBeDefined();
    expect(sig!.severity).toBe("medium");
    expect(sig!.stockCodes).toContain("FPT");
  });

  it("detects 'thanh tra' as investigation MEDIUM", () => {
    const result = detectLegalRisk("Thanh tra Chính phủ vào cuộc thanh tra VHM", WATCHLIST);
    const sig = result.find((s) => s.riskType === "investigation");
    expect(sig).toBeDefined();
    expect(sig!.severity).toBe("medium");
  });

  it("includes matchedPatterns in the signal", () => {
    const result = detectLegalRisk("Khởi tố vụ án liên quan đến VCB", WATCHLIST);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.matchedPatterns.length).toBeGreaterThan(0);
  });

  it("includes originalText in the signal", () => {
    const text = "Bắt tạm giam chủ tịch VHM sau vụ điều tra";
    const result = detectLegalRisk(text, WATCHLIST);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.originalText).toBe(text);
  });

  it("confidence is between 0 and 1", () => {
    const result = detectLegalRisk("Phong tỏa tài sản NVL", WATCHLIST);
    expect(result.length).toBeGreaterThan(0);
    for (const sig of result) {
      expect(sig.confidence).toBeGreaterThanOrEqual(0);
      expect(sig.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("multiple patterns in same text produce multiple signals", () => {
    const result = detectLegalRisk(
      "Khởi tố và phong tỏa tài sản VCB do vi phạm pháp luật nghiêm trọng",
      WATCHLIST,
    );
    expect(result.length).toBeGreaterThanOrEqual(2);
  });
});
