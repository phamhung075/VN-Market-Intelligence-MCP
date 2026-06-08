// src/__tests__/1222-dff-stock-aliases.test.ts
Bun.env["DB_PATH"] = ":memory:";
import { describe, it, expect } from "bun:test";
import { detectStocksInText, getAliasesForCode, STOCK_CATALOG } from "../domain/services/stockAliases.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

describe("Task 1222 — DFF (Đức Phát / Đua Fat Group) stock aliases", () => {
  it("DFF exists in STOCK_CATALOG", () => {
    expect(STOCK_CATALOG["DFF"]).toBeDefined();
    expect(STOCK_CATALOG["DFF"]!.companyName).toBeTruthy();
  });

  it("detects DFF from 'Đức Phát'", () => {
    const text = "Cổ phiếu Đức Phát tăng mạnh sau công bố lợi nhuận";
    const result = detectStocksInText(text, ["DFF"]);
    expect(result).toContain("DFF");
  });

  it("detects DFF from 'Đua Fat'", () => {
    const text = "Tập đoàn Đua Fat công bố kế hoạch mở rộng bất động sản khu công nghiệp";
    const result = detectStocksInText(text, ["DFF"]);
    expect(result).toContain("DFF");
  });

  it("detects DFF from 'DFF' bare ticker", () => {
    const text = "DFF ghi nhận doanh thu 2.500 tỷ đồng trong năm 2025";
    const result = detectStocksInText(text, ["DFF"]);
    expect(result).toContain("DFF");
  });

  it("DFF aliases include required forms", () => {
    const aliases = getAliasesForCode("DFF");
    expect(aliases).toContain("duc phat");   // normalized "Đức Phát"
    expect(aliases).toContain("dua fat");    // normalized "Đua Fat"
    expect(aliases).toContain("dff");
  });

  it("does not false-positive on unrelated real estate articles", () => {
    const text = "Thị trường bất động sản Hà Nội tăng trưởng trong quý 1";
    const result = detectStocksInText(text, ["DFF"]);
    expect(result).not.toContain("DFF");
  });
});
