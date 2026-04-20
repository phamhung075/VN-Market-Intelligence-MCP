import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");

function read(rel: string) {
  return fs.readFileSync(path.join(ROOT, rel), "utf-8");
}

describe("1472: Vietnamese diacritics batch 2", () => {
  describe("leadershipTools.ts", () => {
    const src = read("src/interface/mcp/tools/leadershipTools.ts");
    it("tool description has diacritics", () => {
      expect(src).toContain("Phân tích giao dịch nội bộ");
    });
    it("code param describe has diacritics", () => {
      expect(src).toContain("Mã cổ phiếu, ví dụ VCB");
    });
    it("outstandingShares param has diacritics", () => {
      expect(src).toContain("Số cổ phiếu đang lưu hành");
    });
    it("transactions param has diacritics", () => {
      expect(src).toContain("Danh sách giao dịch cần phân tích");
    });
  });

  describe("correlationTools.ts", () => {
    const src = read("src/interface/mcp/tools/correlationTools.ts");
    it("tool description has diacritics: tương quan", () => {
      expect(src).toContain("tương quan");
    });
    it("tool description has diacritics: cổ phiếu", () => {
      expect(src).toContain("cổ phiếu");
    });
    it("tool description has diacritics: tất cả cặp", () => {
      expect(src).toContain("tất cả cặp");
    });
  });

  describe("creditFlowTools.ts", () => {
    const src = read("src/interface/mcp/tools/creditFlowTools.ts");
    it("tool description has diacritics: Phân tích", () => {
      expect(src).toContain("Phân tích thay đổi tín dụng");
    });
    it("tool description has diacritics: tín hiệu", () => {
      expect(src).toContain("tín hiệu thị trường");
    });
    it("tool description has diacritics: không cung cấp", () => {
      expect(src).toContain("không cung cấp");
    });
    it("param: mặc định ~2800", () => {
      expect(src).toContain("mặc định ~2800");
    });
    it("param: hiện tại", () => {
      expect(src).toContain("tháng hiện tại");
    });
    it("param: trước", () => {
      expect(src).toContain("tháng trước");
    });
  });

  describe("energyTools.ts", () => {
    const src = read("src/interface/mcp/tools/energyTools.ts");
    it("tool description has diacritics: Lấy tín hiệu thị trường", () => {
      expect(src).toContain("Lấy tín hiệu thị trường điện lực");
    });
  });

  describe("climateTools.ts", () => {
    const src = read("src/interface/mcp/tools/climateTools.ts");
    it("tool description has diacritics: Lấy tín hiệu", () => {
      expect(src).toContain("Lấy tín hiệu rủi ro khí hậu");
    });
    it("stock param has diacritics: cổ phiếu", () => {
      expect(src).toContain("Mã cổ phiếu để lọc");
    });
  });

  describe("alertMuteTools.ts", () => {
    const src = read("src/interface/mcp/tools/alerts/alertMuteTools.ts");
    it("tool description has diacritics: Tắt tiếng", () => {
      expect(src).toContain("Tắt tiếng (mute)");
    });
    it("code param has diacritics: Mã cổ phiếu", () => {
      expect(src).toContain("Mã cổ phiếu (ví dụ: VCB");
    });
  });

  describe("telegramReportTools.ts", () => {
    const src = read("src/interface/mcp/tools/briefings/telegramReportTools.ts");
    it("comment string has diacritics: Khi không có", () => {
      expect(src).toContain("Khi không có báo cáo mới");
    });
  });

  describe("insiderCheckJob.ts", () => {
    const src = read("src/scheduler/market-data/insiderCheckJob.ts");
    it("MARKET output has diacritics: có hiệu ứng lớn nhất", () => {
      expect(src).toContain("có hiệu ứng lớn nhất trong thị trường VN");
    });
  });
});
