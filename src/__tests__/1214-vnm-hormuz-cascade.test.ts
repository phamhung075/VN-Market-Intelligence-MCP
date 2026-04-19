// src/__tests__/1214-vnm-hormuz-cascade.test.ts
Bun.env["DB_PATH"] = ":memory:";
import { describe, it, expect } from "bun:test";
import { detectStocksInText, getAliasesForCode } from "../domain/services/stockAliases.js";
import { SECTOR_RULES } from "../domain/services/cascadeEngine.js";

describe("Task 1214 — VNM Hormuz cascade (Middle East dairy export disruption)", () => {
  it("VNM aliases include 'xuất khẩu sữa' (normalized form)", () => {
    const aliases = getAliasesForCode("VNM");
    expect(aliases).toContain("xuat khau sua");
  });

  it("VNM aliases include 'thị trường Trung Đông' (normalized form)", () => {
    const aliases = getAliasesForCode("VNM");
    expect(aliases).toContain("thi truong trung dong");
  });

  it("detects VNM from 'xuất khẩu sữa' in article text", () => {
    const text = "Ngành xuất khẩu sữa Việt Nam đối mặt khó khăn khi căng thẳng Trung Đông leo thang";
    const result = detectStocksInText(text, ["VNM"]);
    expect(result).toContain("VNM");
  });

  it("SECTOR_RULES contains a retail BEARISH rule for Hormuz mentioning VNM", () => {
    const hormuzVnmRules = SECTOR_RULES.filter(
      (r) =>
        r.domain === "retail" &&
        r.direction === "down" &&
        r.keywords.some((k) =>
          k.toLowerCase().includes("hormuz") ||
          k.toLowerCase().includes("xuất khẩu sữa") ||
          k.toLowerCase().includes("trung dong")
        ) &&
        r.title.toLowerCase().includes("vnm"),
    );
    expect(hormuzVnmRules.length).toBeGreaterThan(0);
  });

  it("Hormuz cascade rule for VNM has confidence >= 0.65", () => {
    const rule = SECTOR_RULES.find(
      (r) =>
        r.domain === "retail" &&
        r.direction === "down" &&
        r.title.toLowerCase().includes("vnm") &&
        r.keywords.some((k) => k.toLowerCase().includes("hormuz")),
    );
    expect(rule).toBeDefined();
    expect(rule!.confidence).toBeGreaterThanOrEqual(0.65);
  });

  it("Hormuz VNM rule direction is bearish (down)", () => {
    const rule = SECTOR_RULES.find(
      (r) =>
        r.domain === "retail" &&
        r.direction === "down" &&
        r.title.toLowerCase().includes("vnm") &&
        r.keywords.some((k) => k.toLowerCase().includes("hormuz")),
    );
    expect(rule?.direction).toBe("down");
  });
});
