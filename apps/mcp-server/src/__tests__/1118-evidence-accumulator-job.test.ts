/**
 * Task 1118 — evidenceAccumulatorJob + evidence_scores table
 *
 * Tests for runEvidenceAccumulator():
 * 1. Computes correct weighted scores for 3 bullish + 1 bearish + 1 neutral
 * 2. Purges expired fragments before accumulation (returns purged count)
 * 3. 0 fragments → no evidence_scores rows, returns { stocks: 0, purged: 0 }
 * 4. Multiple stocks: each gets own evidence_scores row
 * 5. CRONS map has "evidenceAccumulator" key
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { runEvidenceAccumulator } from "../scheduler/news-analysis/evidenceAccumulatorJob.js";
import { CRONS } from "../scheduler/jobs.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// Schema helper
// ─────────────────────────────────────────────────────────────────────────────

function createEvidenceSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS evidence_fragments (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      stock          TEXT NOT NULL,
      evidence_type  TEXT NOT NULL,
      direction      TEXT NOT NULL CHECK(direction IN ('bullish','bearish','neutral')),
      magnitude      REAL NOT NULL CHECK(magnitude BETWEEN 0.0 AND 1.0),
      confidence     REAL NOT NULL CHECK(confidence BETWEEN 0.0 AND 1.0),
      timestamp      TEXT NOT NULL,
      source_agent   TEXT NOT NULL,
      ttl_days       INTEGER NOT NULL DEFAULT 30,
      expires_at     TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS evidence_scores (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      stock          TEXT NOT NULL,
      score_date     TEXT NOT NULL,
      bullish_score  REAL NOT NULL DEFAULT 0.0,
      bearish_score  REAL NOT NULL DEFAULT 0.0,
      neutral_score  REAL NOT NULL DEFAULT 0.0,
      fragment_count INTEGER NOT NULL DEFAULT 0,
      computed_at    TEXT NOT NULL,
      UNIQUE(stock, score_date)
    )
  `);
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

function daysFromNow(n: number): string {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();
}

function insertFragment(
  db: Database,
  stock: string,
  direction: string,
  magnitude: number,
  confidence: number,
  agedays = 1,
  expiresInDays = 29,
): void {
  db.prepare(`
    INSERT INTO evidence_fragments (stock, evidence_type, direction, magnitude, confidence, timestamp, source_agent, ttl_days, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(stock, "test_type", direction, magnitude, confidence, daysAgo(agedays), "test-agent", 30, daysFromNow(expiresInDays));
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1118 — evidenceAccumulatorJob", () => {

  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    initNewsTables(db);
    initMarketDataTables(db);
    initSystemTables(db);
    createEvidenceSchema(db);
  });

  describe("Score computation", () => {
    it("computes correct weighted scores for mixed fragments", async () => {
      // 3 bullish (mag=0.8, conf=0.9 each)
      insertFragment(db, "VCB", "bullish", 0.8, 0.9);
      insertFragment(db, "VCB", "bullish", 0.8, 0.9);
      insertFragment(db, "VCB", "bullish", 0.8, 0.9);
      // 1 bearish (mag=0.6, conf=0.7)
      insertFragment(db, "VCB", "bearish", 0.6, 0.7);
      // 1 neutral (mag=0.4, conf=0.5)
      insertFragment(db, "VCB", "neutral", 0.4, 0.5);

      const result = await runEvidenceAccumulator(db);

      expect(result.stocks).toBe(1);
      expect(result.purged).toBe(0);

      const score = db
        .prepare("SELECT * FROM evidence_scores WHERE stock='VCB'")
        .get() as { bullish_score: number; bearish_score: number; neutral_score: number; fragment_count: number } | null;

      expect(score).not.toBeNull();
      expect(score!.fragment_count).toBe(5);
      // bullish: (0.8*0.9 + 0.8*0.9 + 0.8*0.9) / 3 = 0.72
      expect(score!.bullish_score).toBeCloseTo(0.72, 2);
      // bearish: 0.6*0.7 / 1 = 0.42
      expect(score!.bearish_score).toBeCloseTo(0.42, 2);
      // neutral: 0.4*0.5 / 1 = 0.20
      expect(score!.neutral_score).toBeCloseTo(0.20, 2);
    });

    it("computes single fragment score correctly", async () => {
      insertFragment(db, "FPT", "bearish", 0.5, 0.8);

      await runEvidenceAccumulator(db);

      const score = db
        .prepare("SELECT * FROM evidence_scores WHERE stock='FPT'")
        .get() as { bullish_score: number; bearish_score: number; fragment_count: number } | null;

      expect(score).not.toBeNull();
      expect(score!.bearish_score).toBeCloseTo(0.5 * 0.8, 2);
      expect(score!.bullish_score).toBeCloseTo(0, 2);
      expect(score!.fragment_count).toBe(1);
    });
  });

  describe("Expired fragment purging", () => {
    it("purges expired fragments before accumulation", async () => {
      // expired fragment (expires_at = yesterday)
      db.prepare(`
        INSERT INTO evidence_fragments (stock, evidence_type, direction, magnitude, confidence, timestamp, source_agent, ttl_days, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run("VCB", "test", "bullish", 0.5, 0.5, daysAgo(35), "agent", 30, daysAgo(5));

      // active fragment
      insertFragment(db, "FPT", "bullish", 0.7, 0.8);

      const result = await runEvidenceAccumulator(db);

      expect(result.purged).toBe(1);
      // VCB expired fragment purged, so only FPT has a score
      const vcbScore = db.prepare("SELECT * FROM evidence_scores WHERE stock='VCB'").get();
      expect(vcbScore).toBeNull();
    });
  });

  describe("Empty case", () => {
    it("returns { stocks: 0, purged: 0 } when no fragments", async () => {
      const result = await runEvidenceAccumulator(db);
      expect(result).toEqual({ stocks: 0, purged: 0 });

      const scoreCount = db.prepare("SELECT COUNT(*) as c FROM evidence_scores").get() as { c: number };
      expect(scoreCount.c).toBe(0);
    });
  });

  describe("Multiple stocks", () => {
    it("computes separate scores for each stock", async () => {
      insertFragment(db, "VCB", "bullish", 0.7, 0.8);
      insertFragment(db, "FPT", "bearish", 0.5, 0.6);
      insertFragment(db, "HPG", "neutral", 0.3, 0.4);

      const result = await runEvidenceAccumulator(db);
      expect(result.stocks).toBe(3);

      const stocksWithScores = db
        .prepare("SELECT DISTINCT stock FROM evidence_scores")
        .all() as { stock: string }[];
      expect(stocksWithScores.map((r) => r.stock).sort()).toEqual(["FPT", "HPG", "VCB"]);
    });
  });

  describe("CRONS map registration", () => {
    it("CRONS map contains evidenceAccumulator key", () => {
      expect(CRONS).toHaveProperty("evidenceAccumulator");
    });

    it("evidenceAccumulator cron defaults to 0 16 * * * (23:00 VN time)", () => {
      expect((CRONS as Record<string, string>)["evidenceAccumulator"]).toBe("0 16 * * *");
    });
  });
});
