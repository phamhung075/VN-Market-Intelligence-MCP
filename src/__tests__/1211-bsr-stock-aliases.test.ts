// src/__tests__/1211-bsr-stock-aliases.test.ts
Bun.env["DB_PATH"] = ":memory:";
import { describe, it, expect } from "bun:test";
import { detectStocksInText, getAliasesForCode } from "../domain/services/stockAliases.js";

describe("Task 1211 — BSR stock aliases", () => {
  it("detects BSR from 'công ty lọc hóa dầu Bình Sơn'", () => {
    const text = "Công ty lọc hóa dầu Bình Sơn công bố kết quả kinh doanh quý 1";
    const result = detectStocksInText(text, ["BSR"]);
    expect(result).toContain("BSR");
  });

  it("detects BSR from 'lọc dầu Bình Sơn'", () => {
    const text = "Nhà máy lọc dầu Bình Sơn nâng công suất chế biến";
    const result = detectStocksInText(text, ["BSR"]);
    expect(result).toContain("BSR");
  });

  it("detects BSR from 'Bình Sơn' (short name)", () => {
    const text = "Bình Sơn Refining ghi nhận lợi nhuận tăng mạnh";
    const result = detectStocksInText(text, ["BSR"]);
    expect(result).toContain("BSR");
  });

  it("detects BSR from 'BSRC' variant", () => {
    const text = "Cổ phiếu BSRC tăng trần phiên hôm nay";
    const result = detectStocksInText(text, ["BSR"]);
    expect(result).toContain("BSR");
  });

  it("BSR aliases list includes all required Vietnamese forms", () => {
    const aliases = getAliasesForCode("BSR");
    // normalizeText strips diacritics, so check normalized forms
    expect(aliases).toContain("binh son");
    expect(aliases).toContain("loc dau binh son");
    expect(aliases).toContain("cong ty loc hoa dau binh son");
    expect(aliases).toContain("bsrc");
    expect(aliases).toContain("bsr");
  });

  it("does not produce false positive for unrelated oil_gas article without BSR mention", () => {
    const text = "Giá dầu thế giới tăng mạnh do căng thẳng Trung Đông";
    const result = detectStocksInText(text, ["BSR"]);
    expect(result).not.toContain("BSR");
  });
});
