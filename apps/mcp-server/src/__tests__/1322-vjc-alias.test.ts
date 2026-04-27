/**
 * Task 1322 — TDD RED: VJC alias missing "viet jet" (two-word with space)
 *
 * Bug: stockAliases.ts VJC entry has "vietjet" (one word) but not "viet jet"
 * (two words). Headlines like "Viet Jet ký hợp đồng với COMAC" fail to trigger
 * VJC detection.
 *
 * Fix: add "viet jet" and "viet jet air" to VJC aliases array.
 *
 * T1: "Viet Jet" two-word form → detects VJC
 * T2: "Viet Jet Air" two-word + Air → detects VJC
 * T3: "Vietjet" single-word form → still detects VJC (regression)
 * T4: Vietnamese carrier reference → still detects VJC (regression)
 * T5: "viet" alone does NOT trigger VJC (word-boundary negative case)
 */

import { describe, it, expect } from "bun:test";
import { detectStocksInText } from "../domain/services/stockAliases.js";

describe("Task 1322 — VJC alias 'viet jet' two-word form", () => {
  it("T1: 'Viet Jet' two-word form → detects VJC", () => {
    const stocks = detectStocksInText(
      "Viet Jet ký hợp đồng với COMAC",
      ["VJC"],
    );
    expect(stocks).toContain("VJC");
  });

  it("T2: 'Viet Jet Air' two-word + Air → detects VJC", () => {
    const stocks = detectStocksInText(
      "Viet Jet Air thêm 20 máy bay mới",
      ["VJC"],
    );
    expect(stocks).toContain("VJC");
  });

  it("T3: 'Vietjet' single-word form still detects VJC (regression)", () => {
    const stocks = detectStocksInText(
      "Vietjet tuyên bố mở thêm 5 đường bay",
      ["VJC"],
    );
    expect(stocks).toContain("VJC");
  });

  it("T4: Vietnamese carrier reference still detects VJC (regression)", () => {
    const stocks = detectStocksInText(
      "Hãng hàng không giá rẻ Vietjet chuẩn bị IPO",
      ["VJC"],
    );
    expect(stocks).toContain("VJC");
  });

  it("T5: 'viet' alone does NOT trigger VJC — word-boundary guard", () => {
    const stocks = detectStocksInText(
      "Mục tiêu viet là tăng trưởng",
      ["VJC"],
    );
    expect(stocks).not.toContain("VJC");
  });
});
