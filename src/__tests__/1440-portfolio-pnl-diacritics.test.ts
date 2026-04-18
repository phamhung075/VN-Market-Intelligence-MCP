/**
 * Task 1440 — formatPnlSection Vietnamese diacritics
 *
 * RED: asserts correct accented strings in formatPnlSection output.
 * These FAIL until portfolioPnlCalculator.ts is fixed.
 */

import { describe, it, expect } from "bun:test";
import {
  computePortfolioPnl,
  formatPnlSection,
} from "../domain/services/portfolioPnlCalculator.js";

function makeResult() {
  const positions = [
    { code: "VCB", shares: 1000, avgPrice: 75_000 },
    { code: "FPT", shares: 500, avgPrice: 120_000 },
  ];
  const prices = new Map<string, number>([
    ["VCB", 85_000],
    ["FPT", 115_000],
  ]);
  return computePortfolioPnl(positions, prices);
}

describe("formatPnlSection — Vietnamese diacritics (task 1440)", () => {
  it('header contains "DANH MỤC"', () => {
    const out = formatPnlSection(makeResult());
    expect(out).toContain("DANH MỤC");
  });

  it('header contains "vị thế"', () => {
    const out = formatPnlSection(makeResult());
    expect(out).toContain("vị thế");
  });

  it('column header contains "Mã"', () => {
    const out = formatPnlSection(makeResult());
    expect(out).toContain("Mã");
  });

  it('column header contains "Giá TB"', () => {
    const out = formatPnlSection(makeResult());
    expect(out).toContain("Giá TB");
  });

  it('column header contains "Giá HT"', () => {
    const out = formatPnlSection(makeResult());
    expect(out).toContain("Giá HT");
  });

  it('column header contains "Lãi/Lỗ"', () => {
    const out = formatPnlSection(makeResult());
    expect(out).toContain("Lãi/Lỗ");
  });

  it('footer contains "Tổng:"', () => {
    const out = formatPnlSection(makeResult());
    expect(out).toContain("Tổng:");
  });
});
