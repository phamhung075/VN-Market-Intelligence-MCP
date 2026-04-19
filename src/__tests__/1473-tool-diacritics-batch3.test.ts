import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");

function read(rel: string) {
  return fs.readFileSync(path.join(ROOT, rel), "utf-8");
}

describe("1473: Vietnamese diacritics batch 3", () => {
  describe("changelogTools.ts — log_fix tool", () => {
    const src = read("src/interface/mcp/tools/changelogTools.ts");

    it("log_fix tool description: 'ghi lại một sửa lỗi'", () => {
      expect(src).toContain("ghi lại một sửa lỗi");
    });
    it("log_fix tool description: 'có thể dùng'", () => {
      expect(src).toContain("có thể dùng");
    });
    it("log_fix tool description: 'để kiểm tra'", () => {
      expect(src).toContain("để kiểm tra");
    });
    it("log_fix tool description: 'đã được xử lý'", () => {
      expect(src).toContain("đã được xử lý");
    });
    it("title param: 'Tên ngắn mô tả sửa lỗi'", () => {
      expect(src).toContain("Tên ngắn mô tả sửa lỗi");
    });
    it("detail param: 'Mô tả chi tiết về thay đổi'", () => {
      expect(src).toContain("Mô tả chi tiết về thay đổi");
    });
    it("fix_type param: 'Loại sửa lỗi'", () => {
      expect(src).toContain("Loại sửa lỗi");
    });
    it("fix_type param: 'mặc định: bugfix'", () => {
      expect(src).toContain("mặc định: bugfix");
    });
    it("files param: 'Danh sách các file đã thay đổi'", () => {
      expect(src).toContain("Danh sách các file đã thay đổi");
    });
    it("files param: 'đường dẫn tương đối'", () => {
      expect(src).toContain("đường dẫn tương đối");
    });
    it("commit_hash param: 'tương ứng (tùy chọn)'", () => {
      expect(src).toContain("tương ứng (tùy chọn)");
    });
  });

  describe("changelogTools.ts — get_recent_fixes tool", () => {
    const src = read("src/interface/mcp/tools/changelogTools.ts");

    it("get_recent_fixes description: 'Lấy danh sách'", () => {
      expect(src).toContain("Lấy danh sách");
    });
    it("get_recent_fixes description: 'các sửa lỗi gần nhất'", () => {
      expect(src).toContain("các sửa lỗi gần nhất");
    });
    it("get_recent_fixes description: 'nên gọi tool này'", () => {
      expect(src).toContain("nên gọi tool này");
    });
    it("get_recent_fixes description: 'để tránh báo cáo trùng lặp'", () => {
      expect(src).toContain("để tránh báo cáo trùng lặp");
    });
    it("get_recent_fixes description: 'Trả về'", () => {
      expect(src).toContain("Trả về");
    });
    it("limit param: 'bản ghi tối đa'", () => {
      expect(src).toContain("bản ghi tối đa");
    });
    it("limit param: 'mặc định 10'", () => {
      expect(src).toContain("mặc định 10");
    });
  });

  describe("telegramReportTools.ts — read_telegram_reports tool", () => {
    const src = read("src/interface/mcp/tools/telegramReportTools.ts");

    it("tool description: 'Đọc các báo cáo'", () => {
      expect(src).toContain("Đọc các báo cáo");
    });
    it("tool description: 'Mặc định trả về'", () => {
      expect(src).toContain("Mặc định trả về");
    });
    it("tool description: 'chưa xử lý'", () => {
      expect(src).toContain("chưa xử lý");
    });
    it("status param: 'Trạng thái báo cáo cần lấy'", () => {
      expect(src).toContain("Trạng thái báo cáo cần lấy");
    });
    it("status param: 'mặc định'", () => {
      expect(src).toContain("'new' (mặc định)");
    });
    it("limit param: 'Số bản ghi tối đa'", () => {
      expect(src).toContain("Số bản ghi tối đa");
    });
    it("unclaimed_only param: 'Chỉ trả về'", () => {
      expect(src).toContain("Chỉ trả về");
    });
    it("unclaimed_only param: 'chưa được claim'", () => {
      expect(src).toContain("chưa được claim");
    });
    it("unclaimed_only param: 'Đặt false'", () => {
      expect(src).toContain("Đặt false");
    });
    it("unclaimed_only param: 'bao gồm cả đã claimed'", () => {
      expect(src).toContain("bao gồm cả đã claimed");
    });
  });

  describe("telegramReportTools.ts — process_telegram_report tool", () => {
    const src = read("src/interface/mcp/tools/telegramReportTools.ts");

    it("tool description: 'Đánh dấu một báo cáo'", () => {
      expect(src).toContain("Đánh dấu một báo cáo");
    });
    it("tool description: 'đã xử lý'", () => {
      expect(src).toContain("đã xử lý");
    });
    it("tool description: 'tùy chọn xóa'", () => {
      expect(src).toContain("tùy chọn xóa");
    });
    it("tool description: 'để giữ kênh sạch sẽ'", () => {
      expect(src).toContain("để giữ kênh sạch sẽ");
    });
    it("delete param: 'Xóa tin nhắn'", () => {
      expect(src).toContain("Xóa tin nhắn");
    });
    it("delete param: 'sau khi xử lý'", () => {
      expect(src).toContain("sau khi xử lý");
    });
    it("delete param: 'mặc định: true'", () => {
      expect(src).toContain("mặc định: true");
    });
  });

  describe("telegramReportTools.ts — claim_telegram_report tool", () => {
    const src = read("src/interface/mcp/tools/telegramReportTools.ts");

    it("tool description: 'Đặt quyền sở hữu'", () => {
      expect(src).toContain("Đặt quyền sở hữu");
    });
    it("tool description: 'để tránh hai agent xử lý cùng lúc'", () => {
      expect(src).toContain("để tránh hai agent xử lý cùng lúc");
    });
    it("tool description: 'Dùng trước khi gọi'", () => {
      expect(src).toContain("Dùng trước khi gọi");
    });
    it("tool description: 'Nếu đã có agent khác claim'", () => {
      expect(src).toContain("Nếu đã có agent khác claim");
    });
    it("id param: 'bản ghi telegram_reports cần claim'", () => {
      expect(src).toContain("bản ghi telegram_reports cần claim");
    });
    it("claimant param: 'Tên định danh'", () => {
      expect(src).toContain("Tên định danh");
    });
    it("claimant param: 'ví dụ: 'dev-team''", () => {
      expect(src).toContain("ví dụ: 'dev-team'");
    });
  });

  describe("supplyChainTools.ts — error text", () => {
    const src = read("src/interface/mcp/tools/supplyChainTools.ts");

    it("error text has diacritics: 'Lỗi: Không thể lấy'", () => {
      expect(src).toContain("Lỗi: Không thể lấy");
    });
    it("error text has diacritics: 'chuỗi cung ứng'", () => {
      expect(src).toContain("chuỗi cung ứng");
    });
    it("error text has diacritics: 'Vui lòng thử lại'", () => {
      expect(src).toContain("Vui lòng thử lại");
    });
  });

  describe("tickerIntelligenceTools.ts — error text", () => {
    const src = read("src/interface/mcp/tools/tickerIntelligenceTools.ts");

    it("error text has diacritics: '(lỗi phân tích BCTC)'", () => {
      expect(src).toContain("(lỗi phân tích BCTC)");
    });
  });

  describe("leadershipTools.ts — windowDays param (batch 4 tail)", () => {
    const src = read("src/interface/mcp/tools/leadershipTools.ts");

    it("windowDays param: 'Cửa sổ thời gian cho mass insider buy (default: 30 ngày)'", () => {
      expect(src).toContain("Cửa sổ thời gian cho mass insider buy (default: 30 ngày)");
    });
  });

  describe("changelogTools.ts — report_id param (batch 4 tail)", () => {
    const src = read("src/interface/mcp/tools/changelogTools.ts");

    it("report_id param: 'ID của báo cáo telegram_reports liên quan (tùy chọn)'", () => {
      expect(src).toContain("ID của báo cáo telegram_reports liên quan (tùy chọn)");
    });
  });
});
