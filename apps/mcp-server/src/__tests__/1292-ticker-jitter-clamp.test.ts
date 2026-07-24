/**
 * Task 1292 — tickerJitter range drift
 *
 * The function returned values up to 0.150 (e.g. 0.10, 0.115) while
 * the test 1007 contract asserts |jitter| <= 0.09 (exclusive of 0.09).
 *
 * This test pins the hard upper bound at 0.089 and verifies the minimum
 * floor is still respected (|jitter| > 0.04).
 */

import { describe, it, expect } from "bun:test";
import { tickerJitter } from "../application/services/kinhDich/kinhDichScoring.js";

describe("Task 1292 — tickerJitter output never exceeds 0.089", () => {
  const TICKERS = [
    "VCB", "VNM", "FPT", "VEA", "HPG", "MSN", "MWG", "SSI",
    "A", "B", "Z", "VNINDEX", "HDB", "TCB", "MBB", "VPB",
  ];

  it("absolute value never exceeds 0.089 for any ticker", () => {
    for (const code of TICKERS) {
      const j = tickerJitter(code);
      expect(Math.abs(j)).toBeLessThanOrEqual(0.089);
    }
  });

  it("absolute value stays above 0.04 (floor preserved)", () => {
    for (const code of TICKERS) {
      const j = tickerJitter(code);
      expect(Math.abs(j)).toBeGreaterThan(0.04);
    }
  });

  it("VCB returns a value within the new bounds", () => {
    const j = tickerJitter("VCB");
    expect(Math.abs(j)).toBeGreaterThan(0.04);
    expect(Math.abs(j)).toBeLessThanOrEqual(0.089);
  });

  it("single-char ticker 'A' returns a value within the new bounds", () => {
    const j = tickerJitter("A");
    expect(Math.abs(j)).toBeGreaterThan(0.04);
    expect(Math.abs(j)).toBeLessThanOrEqual(0.089);
  });

  it("seed variants also stay within bounds (all 6 hao seeds)", () => {
    for (const code of ["VCB", "VNM", "FPT"]) {
      for (let seed = 0; seed <= 6; seed++) {
        const j = tickerJitter(code, seed);
        if (code === "" ) {
          expect(j).toBe(0);
        } else {
          expect(Math.abs(j)).toBeLessThanOrEqual(0.089);
        }
      }
    }
  });
});
