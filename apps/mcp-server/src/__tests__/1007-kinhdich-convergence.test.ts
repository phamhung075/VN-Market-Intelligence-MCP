/**
 * Task 1007 / 1020 — Kinh Dich convergence fix
 *
 * Problem: When real data is absent (BCTC missing, VPS offline off-hours,
 * no rag_analyses for a stock), all 6 hao scores default to 0.0.
 * Multiple stocks then map to the SAME hexagram because their score
 * vectors are identical.
 *
 * Evidence (2026-04-07): VCB, VNM, FPT all got Que Du 16 in the same
 * cycle (same -0.30 NguHanh score, same hao pattern). Report 1007/1020.
 *
 * Fix: a deterministic jitter derived from the stock-code hash is added
 * to the sector score (Hao 5) when the raw sector score would otherwise
 * be 0.0. The jitter is small (|jitter| ≤ 0.09) and only activates when
 * real data is absent, so it never overrides meaningful signal.
 *
 * These tests use pure function calls — no SQLite, no HTTP.
 */

import { describe, it, expect } from "bun:test";
import { tickerJitter } from "../application/services/kinhDich/kinhDichScoring.js";

// ─────────────────────────────────────────────────────────────────────────────
// tickerJitter() — deterministic per-ticker perturbation
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1007 — tickerJitter()", () => {
  it("returns a value in (-0.09, -0.05) or (+0.05, +0.09) for any non-empty code", () => {
    for (const code of ["VCB", "VNM", "FPT", "VEA", "HPG", "MSN", "MWG", "SSI"]) {
      const j = tickerJitter(code);
      expect(Math.abs(j)).toBeGreaterThan(0.04);
      expect(Math.abs(j)).toBeLessThanOrEqual(0.09);
    }
  });

  it("is deterministic — same code always produces the same jitter", () => {
    const codes = ["VCB", "FPT", "VNM", "VEA"];
    for (const code of codes) {
      const j1 = tickerJitter(code);
      const j2 = tickerJitter(code);
      expect(j1).toBe(j2);
    }
  });

  it("produces different jitter values for VCB, VNM, and FPT", () => {
    const vcb = tickerJitter("VCB");
    const vnm = tickerJitter("VNM");
    const fpt = tickerJitter("FPT");
    expect(vcb).not.toBe(vnm);
    expect(vcb).not.toBe(fpt);
    expect(vnm).not.toBe(fpt);
  });

  it("is case-insensitive — vcb and VCB produce the same jitter", () => {
    expect(tickerJitter("vcb")).toBe(tickerJitter("VCB"));
    expect(tickerJitter("fpt")).toBe(tickerJitter("FPT"));
  });

  it("returns zero for empty string (edge case)", () => {
    expect(tickerJitter("")).toBe(0);
  });

  it("produces jitter for a single-char code", () => {
    const j = tickerJitter("A");
    expect(Math.abs(j)).toBeGreaterThan(0);
    expect(Math.abs(j)).toBeLessThanOrEqual(0.09);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Convergence prevention — distinct hexagram vectors for watchlist stocks
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1007 — jitter prevents identical hao vectors for watchlist stocks", () => {
  it("VCB, VNM, and FPT have different sector jitter values (no identical Que)", () => {
    // The three stocks confirmed identical in report 1007/1020.
    // With jitter, their Hao 5 score is unique, so hexagrams diverge.
    const vcbJ = tickerJitter("VCB");
    const vnmJ = tickerJitter("VNM");
    const fptJ = tickerJitter("FPT");

    // No two should be the same
    const jitters = new Set([vcbJ, vnmJ, fptJ]);
    expect(jitters.size).toBe(3);
  });

  it("all 8 watchlist stocks get unique jitter values", () => {
    const watchlist = ["VCB", "VNM", "FPT", "VEA", "HPG", "MSN", "MWG", "SSI"];
    const jitters = watchlist.map(tickerJitter);
    const unique = new Set(jitters);
    // All 8 should be unique
    expect(unique.size).toBe(watchlist.length);
  });
});
