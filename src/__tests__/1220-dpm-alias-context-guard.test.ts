// src/__tests__/1220-dpm-alias-context-guard.test.ts
Bun.env["DB_PATH"] = ":memory:";
import { describe, it, expect } from "bun:test";
import { detectStocksInText } from "../domain/services/stockAliases.js";

describe("Task 1220 — DPM alias context guard for person-name false positives", () => {
  // ─── TRUE POSITIVES: DPM should be detected with fertilizer context ──────

  it("detects DPM from 'Đạm Phú Mỹ' (full name, no context required)", () => {
    const text = "Công ty Đạm Phú Mỹ công bố lợi nhuận tăng 20% trong quý 1";
    const result = detectStocksInText(text, ["DPM"]);
    expect(result).toContain("DPM");
  });

  it("detects DPM from 'phân bón Phú Mỹ' with fertilizer context", () => {
    const text = "Giá phân bón Phú Mỹ tăng mạnh do chi phí nguyên liệu đầu vào";
    const result = detectStocksInText(text, ["DPM"]);
    expect(result).toContain("DPM");
  });

  it("detects DPM from 'dam phu my' alias with urea keyword", () => {
    const text = "Nhà máy đạm Phú Mỹ tăng sản lượng urea để đáp ứng nhu cầu vụ đông xuân";
    const result = detectStocksInText(text, ["DPM"]);
    expect(result).toContain("DPM");
  });

  it("detects DPM from 'phan bon phu my' alias", () => {
    const text = "Nhu cầu phân bón Phú Mỹ tăng cao trong mùa vụ";
    const result = detectStocksInText(text, ["DPM"]);
    expect(result).toContain("DPM");
  });

  it("detects DPM from 'pvfcco' alias (no context needed — specific enough)", () => {
    const text = "PVFCCo thông báo tạm dừng hoạt động bảo dưỡng nhà máy";
    const result = detectStocksInText(text, ["DPM"]);
    expect(result).toContain("DPM");
  });

  // ─── FALSE POSITIVES: should NOT detect DPM when "phu my" refers to a person ──

  it("does NOT match 'Phú Mỹ' when used as a person name without fertilizer context", () => {
    const text = "Ông Nguyễn Phú Mỹ được bổ nhiệm làm Giám đốc Sở Giao thông Hà Nội";
    const result = detectStocksInText(text, ["DPM"]);
    expect(result).not.toContain("DPM");
  });

  it("does NOT match 'Phú Mỹ' in a place-name context without fertilizer keywords", () => {
    const text = "Khu công nghiệp Phú Mỹ 3 tại Bà Rịa Vũng Tàu thu hút vốn FDI";
    const result = detectStocksInText(text, ["DPM"]);
    expect(result).not.toContain("DPM");
  });

  it("does NOT match 'Phú' or 'Mỹ' standalone in person-name articles", () => {
    const text = "Nghị sĩ Nguyễn Phú Trọng phát biểu tại hội nghị kinh tế Mỹ";
    const result = detectStocksInText(text, ["DPM"]);
    expect(result).not.toContain("DPM");
  });

  // ─── Context requirement verification ─────────────────────────────────────

  it("detects DPM when 'phu my' appears with 'hóa chất' context keyword", () => {
    const text = "Tập đoàn Phú Mỹ sản xuất hóa chất công nghiệp lớn nhất khu vực miền Nam";
    const result = detectStocksInText(text, ["DPM"]);
    expect(result).toContain("DPM");
  });
});
