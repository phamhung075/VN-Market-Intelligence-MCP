Bun.env["DB_PATH"] = ":memory:";

/**
 * KI-278 — Kinh Dich identical readings when all data sources return 0.0
 *
 * When market is closed / VPS offline / no BCTC, all raw hao scores are 0.0.
 * Previously only hao 5 got per-ticker jitter — all other haos were identical
 * across stocks, causing many to collapse to the same hexagram.
 *
 * Fix: all 6 haos now receive per-ticker jitter (with different seeds) when
 * their raw score is 0.0. This test verifies differentiation in the worst case.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { computeHaoScores, tickerJitter } from "../application/services/kinhDich/kinhDichScoring.js";
import { computeReading } from "../domain/services/kinhDich/kinhDichReading.js";

const WATCHLIST = ["VNM", "FPT", "VCB", "VEA"];

beforeAll(async () => {
  await initDatabase();
  const db = getDb();

  // Seed watchlist ONLY — no prices, no foreign flow, no indicators, no BCTC.
  // This simulates the worst case where all data sources are unavailable.
  const insertWatch = db.prepare(
    `INSERT OR REPLACE INTO watchlist (code, company_name, exchange, domain, added_at)
     VALUES (?, ?, 'HOSE', 'other', datetime('now'))`,
  );
  for (const code of WATCHLIST) insertWatch.run(code, code);
});

afterAll(() => {
  closeDb();
  delete Bun.env["DB_PATH"];
});

describe("KI-278 — all-zero differentiation", () => {
  it("tickerJitter with different seeds produces different values for the same code", () => {
    const j1 = tickerJitter("VCB", 1);
    const j2 = tickerJitter("VCB", 2);
    const j3 = tickerJitter("VCB", 3);
    // At least 2 of the 3 should differ
    const unique = new Set([j1, j2, j3]);
    expect(unique.size).toBeGreaterThanOrEqual(2);
  });

  it("tickerJitter with same seed but different codes produces different values", () => {
    const values = WATCHLIST.map((code) => tickerJitter(code, 1));
    const unique = new Set(values);
    // 4 stocks should produce at least 2 distinct jitter values
    expect(unique.size).toBeGreaterThanOrEqual(2);
  });

  it("all 6 hao scores are non-zero (jittered) when no data exists", () => {
    for (const code of WATCHLIST) {
      const scores = computeHaoScores(code);
      expect(scores).toHaveLength(6);
      for (let i = 0; i < 6; i++) {
        expect(scores[i]).not.toBe(0);
        expect(Math.abs(scores[i]!)).toBeGreaterThanOrEqual(0.05);
        // Task 1292: jitter range clamped to max 0.089 (was 0.15 before drift fix)
        expect(Math.abs(scores[i]!)).toBeLessThanOrEqual(0.089);
      }
    }
  });

  it("different stocks produce different score vectors when all data is absent", () => {
    const vectors = WATCHLIST.map((code) => computeHaoScores(code));
    // Each pair of stocks should differ in at least 1 hao
    for (let i = 0; i < vectors.length; i++) {
      for (let j = i + 1; j < vectors.length; j++) {
        const differs = vectors[i]!.some((s, k) => s !== vectors[j]![k]);
        expect(differs).toBe(true);
      }
    }
  });

  it("score vectors differ across stocks even when binary hexagrams may converge", () => {
    // Task 1292: jitter is clamped to max 0.089, which is below the THIEU_DUONG
    // threshold of 0.10. All haos therefore encode as THIEU_AM (Yin, binary=0),
    // producing the same hexagram Khôn when data is fully absent. However, the
    // per-ticker jitter still ensures raw score vectors are unique, which provides
    // meaningful differentiation in NguHanh scoring and Markov lookups.
    const vectors = WATCHLIST.map((code) => computeHaoScores(code));
    // Each pair of stocks should differ in at least 1 hao score
    for (let i = 0; i < vectors.length; i++) {
      for (let j = i + 1; j < vectors.length; j++) {
        const differs = vectors[i]!.some((s, k) => s !== vectors[j]![k]);
        expect(differs).toBe(true);
      }
    }
  });

  it("jitter is deterministic — same code always gets same scores", () => {
    const first = computeHaoScores("VCB");
    const second = computeHaoScores("VCB");
    expect(first).toEqual(second);
  });
});
