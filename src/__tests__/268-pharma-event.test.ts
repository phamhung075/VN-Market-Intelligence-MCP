/**
 * Task 268 — Pharma Event Mapper
 *
 * Tests for classifyPharmaEvent: classifies pharma events from text
 * and maps to affected stocks.
 */

import { describe, it, expect } from "bun:test";
import {
  classifyPharmaEvent,
  type PharmaSignal,
} from "../domain/services/pharmaEventMapper.js";
import type { WatchlistEntry } from "../domain/services/cascadeEngine.js";

// Watchlist with pharma stocks for testing
const PHARMA_WATCHLIST: WatchlistEntry[] = [
  { actionCode: "DHG", domain: "pharma", exchange: "HOSE" },
  { actionCode: "IMP", domain: "pharma", exchange: "HOSE" },
  { actionCode: "DBD", domain: "pharma", exchange: "HNX" },
  { actionCode: "PME", domain: "pharma", exchange: "HOSE" },
  { actionCode: "TRA", domain: "pharma", exchange: "HOSE" },
  { actionCode: "OPC", domain: "pharma", exchange: "HOSE" },
];

const EMPTY_WATCHLIST: WatchlistEntry[] = [];

describe("Task 268 — Pharma Event Mapper", () => {
  // ── Drug approval ──────────────────────────────────────────────────────────
  it("classifies drug approval for Dược Hậu Giang", () => {
    const text =
      "Cục Quản lý Dược phê duyệt thuốc mới của Dược Hậu Giang, mở rộng danh mục sản phẩm";
    const result = classifyPharmaEvent(text, PHARMA_WATCHLIST);
    expect(result).not.toBeNull();
    expect(result!.eventType).toBe("drug_approval");
    expect(result!.affectedStocks.some((s) => s.code === "DHG")).toBe(true);
    expect(
      result!.affectedStocks.find((s) => s.code === "DHG")!.direction,
    ).toBe("up");
  });

  it("classifies drug approval for Imexpharm", () => {
    const text = "Imexpharm được DAV cấp phép lưu hành thuốc generic mới tại Việt Nam";
    const result = classifyPharmaEvent(text, PHARMA_WATCHLIST);
    expect(result).not.toBeNull();
    expect(result!.eventType).toBe("drug_approval");
    expect(result!.affectedStocks.some((s) => s.code === "IMP")).toBe(true);
  });

  it("classifies drug approval for Bidiphar / Dược Bình Định", () => {
    const text = "Bidiphar nhận phê duyệt đăng ký thuốc kháng sinh từ Cục Dược";
    const result = classifyPharmaEvent(text, PHARMA_WATCHLIST);
    expect(result).not.toBeNull();
    expect(result!.eventType).toBe("drug_approval");
    expect(result!.affectedStocks.some((s) => s.code === "DBD")).toBe(true);
  });

  it("classifies drug approval for Pymepharco", () => {
    const text =
      "Pymepharco được cấp phép đăng ký lưu hành 5 sản phẩm thuốc điều trị";
    const result = classifyPharmaEvent(text, PHARMA_WATCHLIST);
    expect(result).not.toBeNull();
    expect(result!.eventType).toBe("drug_approval");
    expect(result!.affectedStocks.some((s) => s.code === "PME")).toBe(true);
  });

  it("classifies drug approval for Traphaco", () => {
    const text =
      "Traphaco ra mắt sản phẩm đông dược mới được DAV phê duyệt đăng ký";
    const result = classifyPharmaEvent(text, PHARMA_WATCHLIST);
    expect(result).not.toBeNull();
    expect(result!.eventType).toBe("drug_approval");
    expect(result!.affectedStocks.some((s) => s.code === "TRA")).toBe(true);
  });

  // ── Outbreak detection ─────────────────────────────────────────────────────
  it("detects Vietnamese outbreak: sốt xuất huyết → pharma bullish", () => {
    const text =
      "Dịch sốt xuất huyết bùng phát tại TP.HCM, số ca tăng mạnh trong tuần";
    const result = classifyPharmaEvent(text, PHARMA_WATCHLIST);
    expect(result).not.toBeNull();
    expect(result!.eventType).toBe("outbreak");
    expect(result!.affectedStocks.every((s) => s.direction === "up")).toBe(true);
    expect(result!.affectedStocks.some((s) => s.code === "DHG")).toBe(true);
  });

  it("detects Vietnamese outbreak: cúm A → pharma bullish", () => {
    const text =
      "Bùng phát cúm A tại miền Bắc, Bộ Y tế cảnh báo cần tăng cường phòng chống";
    const result = classifyPharmaEvent(text, PHARMA_WATCHLIST);
    expect(result).not.toBeNull();
    expect(result!.eventType).toBe("outbreak");
    expect(result!.affectedStocks.some((s) => s.code === "IMP")).toBe(true);
  });

  it("detects English outbreak keywords: epidemic → pharma bullish", () => {
    const text = "Vietnam reports growing epidemic of hand-foot-mouth disease among children";
    const result = classifyPharmaEvent(text, PHARMA_WATCHLIST);
    expect(result).not.toBeNull();
    expect(result!.eventType).toBe("outbreak");
  });

  it("detects outbreak: COVID → all pharma bullish", () => {
    const text = "WHO cảnh báo biến thể COVID mới có khả năng lây lan cao";
    const result = classifyPharmaEvent(text, PHARMA_WATCHLIST);
    expect(result).not.toBeNull();
    expect(result!.eventType).toBe("outbreak");
    expect(result!.affectedStocks.length).toBeGreaterThan(0);
  });

  it("detects vaccination campaign signals", () => {
    const text =
      "Chính phủ triển khai chiến dịch tiêm chủng toàn quốc phòng bệnh sởi";
    const result = classifyPharmaEvent(text, PHARMA_WATCHLIST);
    expect(result).not.toBeNull();
    expect(result!.eventType).toBe("outbreak");
  });

  // ── Price regulation ───────────────────────────────────────────────────────
  it("classifies price_regulation: price cap → pharma bearish", () => {
    const text =
      "Bộ Y tế ban hành giá trần thuốc mới, giảm giá tối đa 15% các nhóm thuốc thiết yếu";
    const result = classifyPharmaEvent(text, PHARMA_WATCHLIST);
    expect(result).not.toBeNull();
    expect(result!.eventType).toBe("price_regulation");
    expect(result!.affectedStocks.every((s) => s.direction === "down")).toBe(true);
  });

  it("classifies price_regulation: drug price ceiling change", () => {
    const text =
      "DAV điều chỉnh trần giá thuốc nhập khẩu, ảnh hưởng biên lợi nhuận dược phẩm";
    const result = classifyPharmaEvent(text, PHARMA_WATCHLIST);
    expect(result).not.toBeNull();
    expect(result!.eventType).toBe("price_regulation");
  });

  // ── Hospital tender ────────────────────────────────────────────────────────
  it("classifies hospital_tender: DHG wins tender", () => {
    const text =
      "Dược Hậu Giang trúng thầu cung cấp thuốc cho 50 bệnh viện công năm 2026";
    const result = classifyPharmaEvent(text, PHARMA_WATCHLIST);
    expect(result).not.toBeNull();
    expect(result!.eventType).toBe("hospital_tender");
    expect(result!.affectedStocks.some((s) => s.code === "DHG")).toBe(true);
    expect(
      result!.affectedStocks.find((s) => s.code === "DHG")!.direction,
    ).toBe("up");
  });

  it("classifies hospital_tender: IMP wins hospital supply contract", () => {
    const text = "Imexpharm ký hợp đồng cung ứng thuốc cho hệ thống bệnh viện TP.HCM";
    const result = classifyPharmaEvent(text, PHARMA_WATCHLIST);
    expect(result).not.toBeNull();
    expect(result!.eventType).toBe("hospital_tender");
  });

  // ── FDI pharma ────────────────────────────────────────────────────────────
  it("classifies fdi_pharma: foreign investment in pharma", () => {
    const text =
      "Tập đoàn dược phẩm Nhật Bản đầu tư 100 triệu USD vào Imexpharm, mua 30% cổ phần";
    const result = classifyPharmaEvent(text, PHARMA_WATCHLIST);
    expect(result).not.toBeNull();
    expect(result!.eventType).toBe("fdi_pharma");
    expect(result!.affectedStocks.some((s) => s.code === "IMP")).toBe(true);
    expect(
      result!.affectedStocks.find((s) => s.code === "IMP")!.direction,
    ).toBe("up");
  });

  it("classifies fdi_pharma: M&A premium signal", () => {
    const text =
      "Foreign pharma company acquires stake in Traphaco for strategic partnership";
    const result = classifyPharmaEvent(text, PHARMA_WATCHLIST);
    expect(result).not.toBeNull();
    expect(result!.eventType).toBe("fdi_pharma");
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────
  it("returns null for unrelated text", () => {
    const text = "VN-Index tăng mạnh, ngân hàng dẫn đầu đà tăng phiên sáng";
    const result = classifyPharmaEvent(text, PHARMA_WATCHLIST);
    expect(result).toBeNull();
  });

  it("returns null for empty text", () => {
    const result = classifyPharmaEvent("", PHARMA_WATCHLIST);
    expect(result).toBeNull();
  });

  it("returns null when no pharma stocks in watchlist", () => {
    const text =
      "Dịch sốt xuất huyết bùng phát tại TP.HCM, số ca tăng mạnh trong tuần";
    const result = classifyPharmaEvent(text, EMPTY_WATCHLIST);
    expect(result).toBeNull();
  });

  it("includes confidence score between 0 and 1", () => {
    const text =
      "Cục Quản lý Dược phê duyệt thuốc mới của Dược Hậu Giang";
    const result = classifyPharmaEvent(text, PHARMA_WATCHLIST);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeGreaterThan(0);
    expect(result!.confidence).toBeLessThanOrEqual(1);
  });

  it("outbreak signal has severity medium or higher", () => {
    const text =
      "Dịch bệnh lây lan nhanh trên toàn quốc, Bộ Y tế công bố tình trạng khẩn cấp";
    const result = classifyPharmaEvent(text, PHARMA_WATCHLIST);
    expect(result).not.toBeNull();
    expect(["medium", "high", "critical"]).toContain(result!.severity);
  });
});
