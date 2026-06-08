Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1416 — RED test: diacritics wave 5
 *
 * Group A: direct-call tests on exported pure functions.
 * Group B: source-scan tests (readFileSync on .ts source).
 *
 * All assertions must FAIL before task 1417 fixes the source files.
 * After task 1417, all assertions must be GREEN.
 */

import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

// ── Group A imports ────────────────────────────────────────────────────────────

import {
  classifyFreshness,
  formatAge,
} from "../interface/mcp/tools/market-data/dataFreshnessTools.js";

import { formatSourceHealthTable } from "../interface/mcp/tools/news-analysis/sourceHealthTools.js";

import { formatSearchResults } from "../domain/services/stockSearch.js";

import { formatTaIndicatorReport } from "../interface/mcp/tools/market-data/technicalIndicatorTools.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ── Source-scan helpers ────────────────────────────────────────────────────────

const TOOLS_DIR = join(import.meta.dir, "../interface/mcp/tools");
function readTool(f: string) {
  return readFileSync(join(TOOLS_DIR, f), "utf8");
}

const DOMAIN_DIR = join(import.meta.dir, "../domain/services");
function readDomain(f: string) {
  return readFileSync(join(DOMAIN_DIR, f), "utf8");
}

// ── Helper — flat candles ──────────────────────────────────────────────────────

function flatCandles(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    day: `2026-01-${String(i + 1).padStart(2, "0")}`,
    close: 100,
  }));
}

// =============================================================================
// Group A — direct-call tests
// =============================================================================

describe("1416 wave5 — Group A: direct-call", () => {
  // ── dataFreshnessTools ──────────────────────────────────────────────────────

  describe("classifyFreshness", () => {
    it('classifyFreshness(0) returns "Tốt"', () => {
      expect(classifyFreshness(0)).toBe("Tốt");
    });

    it('classifyFreshness(0.99) returns "Tốt"', () => {
      expect(classifyFreshness(0.99)).toBe("Tốt");
    });

    it('classifyFreshness(1) returns "Bình thường"', () => {
      expect(classifyFreshness(1)).toBe("Bình thường");
    });

    it('classifyFreshness(6) returns "Cũ"', () => {
      expect(classifyFreshness(6)).toBe("Cũ");
    });

    it('classifyFreshness(24) returns "Rất cũ"', () => {
      expect(classifyFreshness(24)).toBe("Rất cũ");
    });

    it('classifyFreshness(null) returns "Chưa có dữ liệu"', () => {
      expect(classifyFreshness(null)).toBe("Chưa có dữ liệu");
    });
  });

  describe("formatAge", () => {
    it('formatAge(0.25) contains "phút"', () => {
      expect(formatAge(0.25)).toContain("phút");
    });

    it('formatAge(48) contains "ngày"', () => {
      expect(formatAge(48)).toContain("ngày");
    });
  });

  // ── sourceHealthTools ───────────────────────────────────────────────────────

  describe("formatSourceHealthTable", () => {
    it('formatSourceHealthTable([]) contains "Chưa có dữ liệu"', () => {
      expect(formatSourceHealthTable([])).toContain("Chưa có dữ liệu");
    });
  });

  // ── stockSearch ─────────────────────────────────────────────────────────────

  describe("formatSearchResults", () => {
    it('formatSearchResults empty → "Không tìm thấy kết quả nào"', () => {
      expect(formatSearchResults("xyz", [])).toContain(
        "Không tìm thấy kết quả nào",
      );
    });
  });

  // ── technicalIndicatorTools ─────────────────────────────────────────────────

  describe("formatTaIndicatorReport", () => {
    it('formatTaIndicatorReport <35 candles → "Không đủ dữ liệu kỹ thuật"', () => {
      expect(
        (formatTaIndicatorReport as any)("VCB", flatCandles(10), 60),
      ).toContain("Không đủ dữ liệu kỹ thuật");
    });

    it('formatTaIndicatorReport <35 candles → "cần tối thiểu 35 cho MACD"', () => {
      expect(
        (formatTaIndicatorReport as any)("VCB", flatCandles(10), 60),
      ).toContain("cần tối thiểu 35 cho MACD");
    });
  });
});

// =============================================================================
// Group B — source-scan tests
// =============================================================================

describe("1416 wave5 — Group B: source-scan", () => {
  // ── alertMuteTools.ts ───────────────────────────────────────────────────────

  describe("alertMuteTools.ts (6 strings)", () => {
    const src = readTool("alerts/alertMuteTools.ts");

    it("contains 'đã được tắt tiếng trong'", () => {
      expect(src).toContain("đã được tắt tiếng trong");
    });

    it("contains 'Lý do:'", () => {
      expect(src).toContain("Lý do:");
    });

    it("contains 'Để bật lại cảnh báo'", () => {
      expect(src).toContain("Để bật lại cảnh báo");
    });

    it("contains 'hiện không bị tắt tiếng cảnh báo'", () => {
      expect(src).toContain("hiện không bị tắt tiếng cảnh báo");
    });

    it("contains 'đã được bật lại cảnh báo'", () => {
      expect(src).toContain("đã được bật lại cảnh báo");
    });

    it("contains 'Lỗi khi tắt tiếng'", () => {
      expect(src).toContain("Lỗi khi tắt tiếng");
    });

    // negative guards
    it("not contains 'da duoc tat tieng'", () => {
      expect(src).not.toContain("da duoc tat tieng");
    });

    it("not contains 'Ly do:'", () => {
      expect(src).not.toContain("Ly do:");
    });

    it("not contains 'De bat lai canh bao'", () => {
      expect(src).not.toContain("De bat lai canh bao");
    });
  });

  // ── climateTools.ts ─────────────────────────────────────────────────────────

  describe("climateTools.ts (1 string)", () => {
    const src = readTool("sector/climateTools.ts");

    it("contains 'Lọc: ${opts.stock}'", () => {
      expect(src).toContain("Lọc: ${opts.stock}");
    });

    it("not contains 'Loc: ${opts.stock}'", () => {
      expect(src).not.toContain("Loc: ${opts.stock}");
    });
  });

  // ── compareTools.ts ─────────────────────────────────────────────────────────

  describe("compareTools.ts (9 strings)", () => {
    const src = readTool("news-analysis/compareTools.ts");

    it("contains 'Lỗi: Cần ít nhất 2 mã cổ phiếu'", () => {
      expect(src).toContain("Lỗi: Cần ít nhất 2 mã cổ phiếu");
    });

    it("contains 'Lỗi: Tối đa 5 mã cổ phiếu'", () => {
      expect(src).toContain("Lỗi: Tối đa 5 mã cổ phiếu");
    });

    it("contains 'So sánh cổ phiếu ('", () => {
      expect(src).toContain("So sánh cổ phiếu (");
    });

    it('contains \'"Chỉ tiêu"\'', () => {
      expect(src).toContain('"Chỉ tiêu"');
    });

    it('contains \'"Giá"\'', () => {
      expect(src).toContain('"Giá"');
    });

    it('contains \'"Thay đổi"\'', () => {
      expect(src).toContain('"Thay đổi"');
    });

    it('contains \'"Xác tín"\'', () => {
      expect(src).toContain('"Xác tín"');
    });

    it("contains 'Cập nhật:'", () => {
      expect(src).toContain("Cập nhật:");
    });

    it("contains 'Lỗi khi so sánh cổ phiếu:'", () => {
      expect(src).toContain("Lỗi khi so sánh cổ phiếu:");
    });

    // negative guards
    it("not contains 'Can it nhat 2 ma co phieu'", () => {
      expect(src).not.toContain("Can it nhat 2 ma co phieu");
    });

    it("not contains 'So sanh co phieu'", () => {
      expect(src).not.toContain("So sanh co phieu");
    });

    it('not contains \'"Chi tieu"\'', () => {
      expect(src).not.toContain('"Chi tieu"');
    });
  });

  // ── dataFreshnessTools.ts — source-scan supplement ──────────────────────────

  describe("dataFreshnessTools.ts — label/header source-scan", () => {
    const src = readTool("market-data/dataFreshnessTools.ts");

    it('contains \'"Tin tức (RSS)"\'', () => {
      expect(src).toContain('"Tin tức (RSS)"');
    });

    it('contains \'"Giá cổ phiếu"\'', () => {
      expect(src).toContain('"Giá cổ phiếu"');
    });

    it('contains \'"Hàng hóa"\'', () => {
      expect(src).toContain('"Hàng hóa"');
    });

    it('contains \'"Tỷ giá SBV"\'', () => {
      expect(src).toContain('"Tỷ giá SBV"');
    });

    it('contains \'"Dự đoán (Poly)"\'', () => {
      expect(src).toContain('"Dự đoán (Poly)"');
    });

    it('contains \'"Độ tuổi dữ liệu"\'', () => {
      expect(src).toContain('"Độ tuổi dữ liệu"');
    });

    it('contains \'"Nguồn"\'', () => {
      expect(src).toContain('"Nguồn"');
    });

    it('contains \'"Cập nhật cuối"\'', () => {
      expect(src).toContain('"Cập nhật cuối"');
    });

    it('contains \'"Tuổi"\'', () => {
      expect(src).toContain('"Tuổi"');
    });

    it('contains \'"Trạng thái"\'', () => {
      expect(src).toContain('"Trạng thái"');
    });

    it('contains \'"v Tốt"\'', () => {
      expect(src).toContain('"v Tốt"');
    });

    it('contains \'"~ Bình thường"\'', () => {
      expect(src).toContain('"~ Bình thường"');
    });

    it('contains \'"! Cũ"\'', () => {
      expect(src).toContain('"! Cũ"');
    });

    it('contains \'"!! Rất cũ"\'', () => {
      expect(src).toContain('"!! Rất cũ"');
    });

    it('contains \'"- Chưa có dữ liệu"\'', () => {
      expect(src).toContain('"- Chưa có dữ liệu"');
    });

    it("contains 'Kiểm tra lúc:'", () => {
      expect(src).toContain("Kiểm tra lúc:");
    });

    // negative guards
    it('not contains \'"Tin tuc (RSS)"\'', () => {
      expect(src).not.toContain('"Tin tuc (RSS)"');
    });

    it('not contains \'"Gia co phieu"\'', () => {
      expect(src).not.toContain('"Gia co phieu"');
    });

    it('not contains \'"Do tuoi du lieu"\'', () => {
      expect(src).not.toContain('"Do tuoi du lieu"');
    });

    it("not contains '\"Kiem tra luc'", () => {
      expect(src).not.toContain('"Kiem tra luc');
    });
  });

  // ── earningsCalendarTools.ts ─────────────────────────────────────────────────

  describe("earningsCalendarTools.ts (10 strings)", () => {
    const src = readTool("financial-reports/earningsCalendarTools.ts");

    it('contains \'"ĐÃ NỘP"\'', () => {
      expect(src).toContain('"ĐÃ NỘP"');
    });

    it('contains \'"QUÁ HẠN"\'', () => {
      expect(src).toContain('"QUÁ HẠN"');
    });

    it('contains \'"SẮP ĐẾN"\'', () => {
      expect(src).toContain('"SẮP ĐẾN"');
    });

    it('contains \'"(ước tính)"\'', () => {
      expect(src).toContain('"(ước tính)"');
    });

    it("contains 'Danh sách theo dõi trống'", () => {
      expect(src).toContain("Danh sách theo dõi trống");
    });

    it("contains 'LỊCH NỘP BCTC'", () => {
      expect(src).toContain("LỊCH NỘP BCTC");
    });

    it("contains 'Ngày tham chiếu:'", () => {
      expect(src).toContain("Ngày tham chiếu:");
    });

    it("contains 'CỔ PHIẾU'", () => {
      expect(src).toContain("CỔ PHIẾU");
    });

    it("contains 'cổ phiếu`'", () => {
      expect(src).toContain("cổ phiếu`");
    });

    it("contains 'Lỗi khi lấy lịch nộp BCTC'", () => {
      expect(src).toContain("Lỗi khi lấy lịch nộp BCTC");
    });

    // negative guards
    it('not contains \'"DA NOP"\'', () => {
      expect(src).not.toContain('"DA NOP"');
    });

    it('not contains \'"QUA HAN"\'', () => {
      expect(src).not.toContain('"QUA HAN"');
    });

    it('not contains \'"SAP DEN"\'', () => {
      expect(src).not.toContain('"SAP DEN"');
    });

    it('not contains \'"(uoc tinh)"\'', () => {
      expect(src).not.toContain('"(uoc tinh)"');
    });
  });

  // ── kinhDichTools.ts ─────────────────────────────────────────────────────────

  describe("kinhDichTools.ts (28 strings)", () => {
    const src = readTool("kinhdich/kinhDichTools.ts");

    // Error strings
    it("contains 'không có trong watchlist. Thêm cổ phiếu trước khi đọc Kinh Dịch'", () => {
      expect(src).toContain(
        "không có trong watchlist. Thêm cổ phiếu trước khi đọc Kinh Dịch",
      );
    });

    it("contains 'Lỗi khi đọc Kinh Dịch cho'", () => {
      expect(src).toContain("Lỗi khi đọc Kinh Dịch cho");
    });

    it("contains 'Lỗi khi tính quẻ thị trường'", () => {
      expect(src).toContain("Lỗi khi tính quẻ thị trường");
    });

    // History
    it("contains 'LỊCH SỬ KINH DỊCH:'", () => {
      expect(src).toContain("LỊCH SỬ KINH DỊCH:");
    });

    it("contains 'Tổng số lần đọc:'", () => {
      expect(src).toContain("Tổng số lần đọc:");
    });

    it("contains 'Quẻ phổ biến nhất:'", () => {
      expect(src).toContain("Quẻ phổ biến nhất:");
    });

    // Transition
    it("contains 'XÁC SUẤT CHUYỂN QUẺ:'", () => {
      expect(src).toContain("XÁC SUẤT CHUYỂN QUẺ:");
    });

    it("contains 'Xác suất chuyển sang (top 10):'", () => {
      expect(src).toContain("Xác suất chuyển sang (top 10):");
    });

    it("contains 'Thay đổi TB:'", () => {
      expect(src).toContain("Thay đổi TB:");
    });

    it("contains 'Tỷ lệ thắng:'", () => {
      expect(src).toContain("Tỷ lệ thắng:");
    });

    // Backtest
    it("contains 'BACKTEST KINH DỊCH:'", () => {
      expect(src).toContain("BACKTEST KINH DỊCH:");
    });

    it("contains 'Độ chính xác (BUY/SELL):'", () => {
      expect(src).toContain("Độ chính xác (BUY/SELL):");
    });

    it("contains 'Lợi nhuận TB 5 phiên:'", () => {
      expect(src).toContain("Lợi nhuận TB 5 phiên:");
    });

    it("contains 'Quẻ tốt nhất:'", () => {
      expect(src).toContain("Quẻ tốt nhất:");
    });

    it("contains 'Quẻ xấu nhất:'", () => {
      expect(src).toContain("Quẻ xấu nhất:");
    });

    it("contains 'Lưu ý: Backtest chỉ mang tính tham khảo'", () => {
      expect(src).toContain("Lưu ý: Backtest chỉ mang tính tham khảo");
    });

    // Hexagram detail
    it("contains 'Thượng quán (trên):'", () => {
      expect(src).toContain("Thượng quán (trên):");
    });

    it("contains 'Ý nghĩa chính:'", () => {
      expect(src).toContain("Ý nghĩa chính:");
    });

    it("contains 'Hào từ (Phán quyết):'", () => {
      expect(src).toContain("Hào từ (Phán quyết):");
    });

    it("contains 'Tượng truyện (Hình tượng):'", () => {
      expect(src).toContain("Tượng truyện (Hình tượng):");
    });

    it("contains 'Hành động:'", () => {
      expect(src).toContain("Hành động:");
    });

    it("contains 'Sự nghiệp:'", () => {
      expect(src).toContain("Sự nghiệp:");
    });

    it("contains 'Kết quả:'", () => {
      expect(src).toContain("Kết quả:");
    });

    // negative guards
    it("not contains 'khong co trong watchlist'", () => {
      expect(src).not.toContain("khong co trong watchlist");
    });

    it("not contains 'Loi khi doc Kinh Dich'", () => {
      expect(src).not.toContain("Loi khi doc Kinh Dich");
    });

    it("not contains 'LICH SU KINH DICH'", () => {
      expect(src).not.toContain("LICH SU KINH DICH");
    });

    it("not contains 'XAC SUAT CHUYEN QUE'", () => {
      expect(src).not.toContain("XAC SUAT CHUYEN QUE");
    });

    it("not contains 'BACKTEST KINH DICH'", () => {
      expect(src).not.toContain("BACKTEST KINH DICH");
    });

    it("not contains 'Do chinh xac'", () => {
      expect(src).not.toContain("Do chinh xac");
    });

    it("not contains 'Loi nhuan TB'", () => {
      expect(src).not.toContain("Loi nhuan TB");
    });

    it("not contains 'Ty le thang'", () => {
      expect(src).not.toContain("Ty le thang");
    });

    // do-not-break guards: wave4-already-fixed lines must still be present
    it("wave4 guard: contains '| Quẻ ${r.hexagramNumber}'", () => {
      expect(src).toContain("| Quẻ ${r.hexagramNumber}");
    });

    it("wave4 guard: contains '`Cổ phiếu: ${code}`'", () => {
      expect(src).toContain("`Cổ phiếu: ${code}`");
    });
  });

  // ── pharmaTools.ts ───────────────────────────────────────────────────────────

  describe("pharmaTools.ts (1 string)", () => {
    const src = readTool("sector/pharmaTools.ts");

    it("contains 'Lọc theo cổ phiếu:'", () => {
      expect(src).toContain("Lọc theo cổ phiếu:");
    });

    it("not contains 'Loc theo co phieu:'", () => {
      expect(src).not.toContain("Loc theo co phieu:");
    });
  });

  // ── portfolioTools.ts ────────────────────────────────────────────────────────

  describe("portfolioTools.ts (2 strings)", () => {
    const src = readTool("portfolio/portfolioTools.ts");

    it("contains 'Watchlist trống'", () => {
      expect(src).toContain("Watchlist trống");
    });

    it("contains 'Ngành ${r.sectorName}:'", () => {
      expect(src).toContain("Ngành ${r.sectorName}:");
    });

    it("not contains 'Watchlist trong'", () => {
      expect(src).not.toContain("Watchlist trong");
    });

    it("not contains 'Nganh ${r.sectorName}:'", () => {
      expect(src).not.toContain("Nganh ${r.sectorName}:");
    });
  });

  // ── sourceHealthTools.ts — source-scan supplement ───────────────────────────

  describe("sourceHealthTools.ts — label/status source-scan", () => {
    const src = readTool("news-analysis/sourceHealthTools.ts");

    it('contains \'"Suy giảm"\'', () => {
      expect(src).toContain('"Suy giảm"');
    });

    it('contains \'"Ngưng"\'', () => {
      expect(src).toContain('"Ngưng"');
    });

    it("contains 'Tình trạng nguồn dữ liệu'", () => {
      expect(src).toContain("Tình trạng nguồn dữ liệu");
    });

    it("contains 'Trạng thái'", () => {
      expect(src).toContain("Trạng thái");
    });

    it("contains 'Lần cuối thành công'", () => {
      expect(src).toContain("Lần cuối thành công");
    });

    it("contains 'Lỗi liên tiếp'", () => {
      expect(src).toContain("Lỗi liên tiếp");
    });

    it("contains 'Cập nhật lúc:'", () => {
      expect(src).toContain("Cập nhật lúc:");
    });

    it('contains \'"Chưa bao giờ"\'', () => {
      expect(src).toContain('"Chưa bao giờ"');
    });

    it("contains 'giây trước'", () => {
      expect(src).toContain("giây trước");
    });

    it("contains 'phút trước'", () => {
      expect(src).toContain("phút trước");
    });

    it("contains 'giờ trước'", () => {
      expect(src).toContain("giờ trước");
    });

    it("contains 'ngày trước'", () => {
      expect(src).toContain("ngày trước");
    });

    // negative guards
    it('not contains \'"Suy giam"\'', () => {
      expect(src).not.toContain('"Suy giam"');
    });

    it('not contains \'"Ngung"\'', () => {
      expect(src).not.toContain('"Ngung"');
    });

    it("not contains 'Tinh trang nguon du lieu'", () => {
      expect(src).not.toContain("Tinh trang nguon du lieu");
    });

    it("not contains 'Chua bao gio'", () => {
      expect(src).not.toContain("Chua bao gio");
    });

    it("not contains 'giay truoc'", () => {
      expect(src).not.toContain("giay truoc");
    });

    it("not contains 'phut truoc'", () => {
      expect(src).not.toContain("phut truoc");
    });
  });

  // ── supplyChainTools.ts ──────────────────────────────────────────────────────

  describe("supplyChainTools.ts (10 strings)", () => {
    const src = readTool("sector/supplyChainTools.ts");

    it("contains 'PHÂN TÍCH CHUỖI CUNG ỨNG'", () => {
      expect(src).toContain("PHÂN TÍCH CHUỖI CUNG ỨNG");
    });

    it("contains 'CHỈ SỐ VẬN TẢI BIỂN:'", () => {
      expect(src).toContain("CHỈ SỐ VẬN TẢI BIỂN:");
    });

    it("contains 'Chỉ số vận tải: Chưa có dữ liệu'", () => {
      expect(src).toContain("Chỉ số vận tải: Chưa có dữ liệu");
    });

    it.skip('contains \'"NGHIÊM TRỌNG"\'', () => {
      // SKIPPED: severity strings were extracted to SSOT severityLabels.ts (SEVERITY_VI map).
      // supplyChainTools.ts imports SEVERITY_VI from ./severityLabels.js — strings no longer inline.
      expect(src).toContain('"NGHIÊM TRỌNG"');
    });

    it.skip('contains \'"QUAN TRỌNG"\'', () => {
      // SKIPPED: same as above — now in severityLabels.ts SEVERITY_VI map.
      expect(src).toContain('"QUAN TRỌNG"');
    });

    it.skip('contains \'"LƯU Ý"\'', () => {
      // SKIPPED: same as above — now in severityLabels.ts SEVERITY_VI map.
      expect(src).toContain('"LƯU Ý"');
    });

    it.skip('contains \'"THẤP"\'', () => {
      // SKIPPED: same as above — now in severityLabels.ts SEVERITY_VI map.
    });

    it("contains 'TÍN HIỆU TÁC ĐỘNG CỔ PHIẾU:'", () => {
      expect(src).toContain("TÍN HIỆU TÁC ĐỘNG CỔ PHIẾU:");
    });

    it("contains 'Sai lệch:'", () => {
      expect(src).toContain("Sai lệch:");
    });

    it('contains \'"TĂNG"\'', () => {
      expect(src).toContain('"TĂNG"');
    });

    it('contains \'"GIẢM"\'', () => {
      expect(src).toContain('"GIẢM"');
    });

    it('contains \'"TRUNG LẬP"\'', () => {
      expect(src).toContain('"TRUNG LẬP"');
    });

    // negative guards
    it("not contains 'PHAN TICH CHUOI CUNG UNG'", () => {
      expect(src).not.toContain("PHAN TICH CHUOI CUNG UNG");
    });

    it("not contains 'CHI SO VAN TAI BIEN'", () => {
      expect(src).not.toContain("CHI SO VAN TAI BIEN");
    });

    it('not contains \'"NGHIEM TRONG"\'', () => {
      expect(src).not.toContain('"NGHIEM TRONG"');
    });

    it('not contains \'"TANG"\'', () => {
      expect(src).not.toContain('"TANG"');
    });
  });

  // ── technicalIndicatorTools.ts — source-scan supplement ─────────────────────

  describe("technicalIndicatorTools.ts — source-scan", () => {
    const src = readTool("market-data/technicalIndicatorTools.ts");

    it("contains 'Quá mua (overbought)'", () => {
      expect(src).toContain("Quá mua (overbought)");
    });

    it("contains 'Quá bán (oversold)'", () => {
      expect(src).toContain("Quá bán (oversold)");
    });

    it("contains 'Trung tính (vùng 40-70'", () => {
      expect(src).toContain("Trung tính (vùng 40-70");
    });

    it("contains 'histogram dương và tăng'", () => {
      expect(src).toContain("histogram dương và tăng");
    });

    it("contains 'histogram âm và giảm'", () => {
      expect(src).toContain("histogram âm và giảm");
    });

    it("contains 'cần tối thiểu 34 nến'", () => {
      expect(src).toContain("cần tối thiểu 34 nến");
    });

    it("contains 'cần tối thiểu 20 nến'", () => {
      expect(src).toContain("cần tối thiểu 20 nến");
    });

    it("contains 'Lỗi tính chỉ báo kỹ thuật'", () => {
      expect(src).toContain("Lỗi tính chỉ báo kỹ thuật");
    });

    it("contains 'giá > MA5 > MA20 > MA50'", () => {
      expect(src).toContain("giá > MA5 > MA20 > MA50");
    });

    it("contains 'giá < MA5 < MA20 < MA50'", () => {
      expect(src).toContain("giá < MA5 < MA20 < MA50");
    });

    it("contains 'trung bình-thấp'", () => {
      expect(src).toContain("trung bình-thấp");
    });

    it("contains 'thấp (cảnh oversold)'", () => {
      expect(src).toContain("thấp (cảnh oversold)");
    });

    it("contains 'cao (cảnh overbought)'", () => {
      expect(src).toContain("cao (cảnh overbought)");
    });

    // negative guards
    it("not contains 'Qua mua (overbought)'", () => {
      expect(src).not.toContain("Qua mua (overbought)");
    });

    it("not contains 'Trung tinh'", () => {
      expect(src).not.toContain("Trung tinh");
    });

    it("not contains 'histogram duong'", () => {
      expect(src).not.toContain("histogram duong");
    });

    it("not contains 'Loi tinh chi bao'", () => {
      expect(src).not.toContain("Loi tinh chi bao");
    });
  });

  // ── stockSearch.ts — source-scan supplement ──────────────────────────────────

  describe("stockSearch.ts — source-scan", () => {
    const src = readDomain("stockSearch.ts");

    it("contains 'Không tìm thấy kết quả nào'", () => {
      expect(src).toContain("Không tìm thấy kết quả nào");
    });

    it("contains 'Kết quả tìm kiếm'", () => {
      expect(src).toContain("Kết quả tìm kiếm");
    });

    it("contains 'Tên công ty'", () => {
      expect(src).toContain("Tên công ty");
    });

    it("contains 'Ngành'", () => {
      expect(src).toContain("Ngành");
    });

    it("contains 'Theo dõi'", () => {
      expect(src).toContain("Theo dõi");
    });

    // negative guards
    it("not contains 'Khong tim thay ket qua'", () => {
      expect(src).not.toContain("Khong tim thay ket qua");
    });

    it("not contains 'Ket qua tim kiem'", () => {
      expect(src).not.toContain("Ket qua tim kiem");
    });

    it("not contains 'Ten cong ty'", () => {
      expect(src).not.toContain("Ten cong ty");
    });
  });
});
