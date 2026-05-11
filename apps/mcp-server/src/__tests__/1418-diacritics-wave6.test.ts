Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1418 — RED test: diacritics wave 6
 *
 * Group A: direct-call tests on exportPortfolioSnapshot (write-error path).
 * Group B: source-scan tests (readFileSync on .ts source).
 *
 * All assertions must FAIL before task 1419 fixes the source files.
 * After task 1419, all assertions must be GREEN.
 */

import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import Database from "bun:sqlite";

// ── Group A imports ────────────────────────────────────────────────────────────

import { exportPortfolioSnapshot } from "../application/usecases/exportPortfolioSnapshot.js";

// ── Source-scan helpers ────────────────────────────────────────────────────────

const TOOLS = join(import.meta.dir, "../interface/mcp/tools");
const APP   = join(import.meta.dir, "../application/usecases");

// =============================================================================
// Group A — direct-call (exportPortfolioSnapshot write-error path)
// =============================================================================

describe("1418 wave6 — Group A: direct-call (exportPortfolioSnapshot)", () => {
  it("error sentinel contains Vietnamese diacritics", async () => {
    const db = new Database(":memory:");
    const result = await exportPortfolioSnapshot({ db, exportDir: "/root/no-perm-xyz" });
    expect(result.error).toContain("(không thể ghi file):");
  });

  it("old broken sentinel absent", async () => {
    const db = new Database(":memory:");
    const result = await exportPortfolioSnapshot({ db, exportDir: "/root/no-perm-xyz" });
    expect(result.error).not.toContain("khong the ghi file");
  });
});

// =============================================================================
// Group B — source-scan tests
// =============================================================================

describe("1418 wave6 — Group B: source-scan (customAlertTools.ts)", () => {
  const src = readFileSync(join(TOOLS, "alerts/customAlertTools.ts"), "utf8");

  it('contains "Chưa có quy tắc cảnh báo tùy chỉnh nào."', () => {
    expect(src).toContain("Chưa có quy tắc cảnh báo tùy chỉnh nào.");
  });

  it('not contains "Chua co quy tac canh bao tuy chinh nao."', () => {
    expect(src).not.toContain("Chua co quy tac canh bao tuy chinh nao.");
  });

  it('contains "Quy tắc cảnh báo tùy chỉnh" and "đang hoạt động" and "tổng cộng"', () => {
    expect(src).toContain("Quy tắc cảnh báo tùy chỉnh");
    expect(src).toContain("đang hoạt động");
    expect(src).toContain("tổng cộng");
  });

  it('not contains "Quy tac canh bao tuy chinh"', () => {
    expect(src).not.toContain("Quy tac canh bao tuy chinh");
  });

  it('contains "Lỗi khi lấy danh sách quy tắc:"', () => {
    expect(src).toContain("Lỗi khi lấy danh sách quy tắc:");
  });

  it('not contains "Loi khi lay danh sach quy tac:"', () => {
    expect(src).not.toContain("Loi khi lay danh sach quy tac:");
  });
});

describe("1418 wave6 — Group B: source-scan (changelogTools.ts)", () => {
  const src = readFileSync(join(TOOLS, "briefings/changelogTools.ts"), "utf8");

  it('contains "Lỗi khi ghi sửa lỗi:"', () => {
    expect(src).toContain("Lỗi khi ghi sửa lỗi:");
  });

  it('not contains "Loi khi ghi sua loi:"', () => {
    expect(src).not.toContain("Loi khi ghi sua loi:");
  });

  it('contains "Chưa có sửa lỗi nào được ghi lại."', () => {
    expect(src).toContain("Chưa có sửa lỗi nào được ghi lại.");
  });

  it('not contains "Chua co sua loi nao duoc ghi lai."', () => {
    expect(src).not.toContain("Chua co sua loi nao duoc ghi lai.");
  });

  it('contains "sửa lỗi gần nhất (mới nhất trước)"', () => {
    expect(src).toContain("sửa lỗi gần nhất (mới nhất trước)");
  });

  it('not contains "sua loi gan nhat (moi nhat truoc)"', () => {
    expect(src).not.toContain("sua loi gan nhat (moi nhat truoc)");
  });

  it('contains "Lỗi khi đọc lịch sử sửa lỗi:"', () => {
    expect(src).toContain("Lỗi khi đọc lịch sử sửa lỗi:");
  });

  it('not contains "Loi khi doc lich su sua loi:"', () => {
    expect(src).not.toContain("Loi khi doc lich su sua loi:");
  });
});

describe("1418 wave6 — Group B: source-scan (targetAllocationTools.ts)", () => {
  const src = readFileSync(join(TOOLS, "portfolio/targetAllocationTools.ts"), "utf8");

  it('contains "Chưa có mục tiêu phân bổ."', () => {
    expect(src).toContain("Chưa có mục tiêu phân bổ.");
  });

  it('not contains "Chua co muc tieu phan bo."', () => {
    expect(src).not.toContain("Chua co muc tieu phan bo.");
  });

  it('contains "Vui lòng thiết lập mục tiêu qua analyst workflow trước khi xem gap."', () => {
    expect(src).toContain("Vui lòng thiết lập mục tiêu qua analyst workflow trước khi xem gap.");
  });

  it('not contains "Vui long thiet lap muc tieu qua analyst workflow truoc khi xem gap."', () => {
    expect(src).not.toContain("Vui long thiet lap muc tieu qua analyst workflow truoc khi xem gap.");
  });

  it('contains "Phân bổ mục tiêu"', () => {
    expect(src).toContain("Phân bổ mục tiêu");
  });

  it('not contains "Phan bo muc tieu"', () => {
    expect(src).not.toContain("Phan bo muc tieu");
  });

  it('contains pad("Mã",', () => {
    expect(src).toContain('pad("Mã",');
  });

  it('not contains pad("Ma",', () => {
    expect(src).not.toContain('pad("Ma",');
  });

  it('contains pad("Mục tiêu",', () => {
    expect(src).toContain('pad("Mục tiêu",');
  });

  it('not contains pad("Muc tieu",', () => {
    expect(src).not.toContain('pad("Muc tieu",');
  });

  it('contains pad("Hiện tại",', () => {
    expect(src).toContain('pad("Hiện tại",');
  });

  it('not contains pad("Hien tai",', () => {
    expect(src).not.toContain('pad("Hien tai",');
  });

  it('contains "(đúng)"', () => {
    expect(src).toContain("(đúng)");
  });

  it('not contains "(dung)"', () => {
    expect(src).not.toContain("(dung)");
  });

  it('contains "(thừa)"', () => {
    expect(src).toContain("(thừa)");
  });

  it('not contains "(thua)"', () => {
    expect(src).not.toContain("(thua)");
  });

  it('contains "(thiếu)"', () => {
    expect(src).toContain("(thiếu)");
  });

  it('not contains "(thieu)"', () => {
    expect(src).not.toContain("(thieu)");
  });

  it('contains "(không có mục tiêu)"', () => {
    expect(src).toContain("(không có mục tiêu)");
  });

  it('not contains "(khong co muc tieu)"', () => {
    expect(src).not.toContain("(khong co muc tieu)");
  });

  it('contains "Tổng danh mục:"', () => {
    expect(src).toContain("Tổng danh mục:");
  });

  it('not contains "Tong danh muc:"', () => {
    expect(src).not.toContain("Tong danh muc:");
  });

  it('contains "Lưu ý: Giá ước tính (giá vốn) cho:"', () => {
    expect(src).toContain("Lưu ý: Giá ước tính (giá vốn) cho:");
  });

  it('not contains "Luu y: Gia uoc tinh"', () => {
    expect(src).not.toContain("Luu y: Gia uoc tinh");
  });

  it('contains "Lưu ý: Chưa có vị trí nào trong danh mục"', () => {
    expect(src).toContain("Lưu ý: Chưa có vị trí nào trong danh mục");
  });

  it('not contains "Luu y: Chua co vi tri nao"', () => {
    expect(src).not.toContain("Luu y: Chua co vi tri nao");
  });

  it('contains "Lỗi khi đọc phân bổ mục tiêu:"', () => {
    expect(src).toContain("Lỗi khi đọc phân bổ mục tiêu:");
  });

  it('not contains "Loi khi doc phan bo muc tieu:"', () => {
    expect(src).not.toContain("Loi khi doc phan bo muc tieu:");
  });
});

describe("1418 wave6 — Group B: source-scan (exportPortfolioSnapshot.ts)", () => {
  const src = readFileSync(join(APP, "exportPortfolioSnapshot.ts"), "utf8");

  it('contains "(không thể ghi file)"', () => {
    expect(src).toContain("(không thể ghi file)");
  });

  it('not contains "(khong the ghi file)"', () => {
    expect(src).not.toContain("(khong the ghi file)");
  });
});
