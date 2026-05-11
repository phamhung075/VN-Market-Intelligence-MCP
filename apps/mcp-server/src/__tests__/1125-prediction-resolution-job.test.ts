/**
 * Task 1125 — Prediction Resolution Scheduler Job
 *
 * Tests for runPredictionResolution():
 * 1. Resolves claims where resolution_date <= today AND resolution_outcome IS NULL
 * 2. Direction-based evaluation: bullish (actual >= target), bearish (actual <= target)
 * 3. Brier score computed at resolution: (outcome - confidence)^2
 * 4. resolveClaim() stores outcome, actual_price, brier_score
 * 5. Claims within 5-day retry window are not marked unresolvable
 * 6. Claims past 5-day retry window are marked unresolvable
 * 7. Claims with no OHLCV data are skipped (not yet past retry window)
 * 8. Claims with resolution_date in future are not processed
 * 9. CRONS map has "predictionResolution" key with default "30 16 * * *"
 * 10. computeBrierScore: (probability - outcome)^2 formula
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  runPredictionResolution,
  type PredictionResolutionResult,
} from "../scheduler/macro/predictionResolutionJob.js";
import { CRONS } from "../scheduler/jobs.js";
import { computeBrierScore } from "../domain/services/baseRateComputer.js";

// ─────────────────────────────────────────────────────────────────────────────
// Schema helpers
// ─────────────────────────────────────────────────────────────────────────────

function createSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS prediction_claims (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      stock              TEXT    NOT NULL,
      agent_id           TEXT    NOT NULL,
      claim_text         TEXT    NOT NULL,
      direction          TEXT    NOT NULL CHECK(direction IN ('bullish','bearish','neutral')),
      target_price       REAL,
      resolution_date    TEXT    NOT NULL,
      confidence         REAL    NOT NULL CHECK(confidence BETWEEN 0.0 AND 1.0),
      resolution_outcome INTEGER CHECK(resolution_outcome IN (NULL, 0, 1)),
      actual_price       REAL,
      brier_score        REAL,
      created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
      resolved_at        TEXT,
      UNIQUE(stock, claim_text, resolution_date)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_pc_stock ON prediction_claims(stock)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_pc_resolution ON prediction_claims(resolution_date)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code       TEXT    NOT NULL,
      date       TEXT    NOT NULL,
      open       REAL    NOT NULL,
      high       REAL    NOT NULL,
      low        REAL    NOT NULL,
      close      REAL    NOT NULL,
      volume     REAL    NOT NULL DEFAULT 0,
      updated_at TEXT    NOT NULL,
      PRIMARY KEY (code, date)
    )
  `);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function insertClaim(
  db: Database,
  opts: {
    stock: string;
    direction: "bullish" | "bearish" | "neutral";
    targetPrice: number | null;
    confidence: number;
    resolutionDate: string;
    resolutionOutcome?: number | null;
  },
): number {
  const result = db
    .prepare(
      `INSERT INTO prediction_claims
        (stock, agent_id, claim_text, direction, target_price, confidence, resolution_date, resolution_outcome)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      opts.stock,
      "08-prediction-synthesizer",
      `${opts.stock} ${opts.direction} target ${opts.targetPrice}`,
      opts.direction,
      opts.targetPrice,
      opts.confidence,
      opts.resolutionDate,
      opts.resolutionOutcome ?? null,
    );
  return result.lastInsertRowid as number;
}

function insertOhlcv(
  db: Database,
  code: string,
  date: string,
  close: number,
): void {
  db.prepare(
    `INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).run(code, date, close, close, close, close, 1000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1125 — predictionResolutionJob", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    createSchema(db);
  });

  // ── Domain: computeBrierScore ──────────────────────────────────────────────

  describe("computeBrierScore", () => {
    it("returns (probability - outcome)^2 when outcome is true (1)", () => {
      // probability=0.8, outcome=1 → (0.8 - 1)^2 = 0.04
      expect(computeBrierScore(0.8, 1)).toBeCloseTo(0.04, 6);
    });

    it("returns (probability - outcome)^2 when outcome is false (0)", () => {
      // probability=0.8, outcome=0 → (0.8 - 0)^2 = 0.64
      expect(computeBrierScore(0.8, 0)).toBeCloseTo(0.64, 6);
    });

    it("returns 0 for perfect prediction: probability=1.0, outcome=1", () => {
      expect(computeBrierScore(1.0, 1)).toBeCloseTo(0, 6);
    });

    it("returns 1 for worst prediction: probability=1.0, outcome=0", () => {
      expect(computeBrierScore(1.0, 0)).toBeCloseTo(1.0, 6);
    });

    it("returns 0.25 for uninformative: probability=0.5, outcome=1", () => {
      expect(computeBrierScore(0.5, 1)).toBeCloseTo(0.25, 6);
    });
  });

  // ── Direction-based evaluation ───────────────────────────────────────────

  describe("Direction-based evaluation against target_price", () => {
    it("resolves outcome=1 when actual >= target for bullish direction", async () => {
      const id = insertClaim(db, {
        stock: "VCB",
        direction: "bullish",
        targetPrice: 100,
        confidence: 0.7,
        resolutionDate: daysAgo(1),
      });
      insertOhlcv(db, "VCB", daysAgo(1), 105); // 105 >= 100 → bullish correct

      await runPredictionResolution(db);

      const row = db
        .prepare("SELECT * FROM prediction_claims WHERE id=?")
        .get(id) as { resolution_outcome: number; actual_price: number; brier_score: number };
      expect(row.resolution_outcome).toBe(1);
      expect(row.actual_price).toBeCloseTo(105);
    });

    it("resolves outcome=0 when actual < target for bullish direction", async () => {
      const id = insertClaim(db, {
        stock: "VCB",
        direction: "bullish",
        targetPrice: 100,
        confidence: 0.7,
        resolutionDate: daysAgo(1),
      });
      insertOhlcv(db, "VCB", daysAgo(1), 95); // 95 < 100 → bullish wrong

      await runPredictionResolution(db);

      const row = db
        .prepare("SELECT * FROM prediction_claims WHERE id=?")
        .get(id) as { resolution_outcome: number };
      expect(row.resolution_outcome).toBe(0);
    });

    it("resolves outcome=1 when actual >= target for bullish (exact match)", async () => {
      const id = insertClaim(db, {
        stock: "FPT",
        direction: "bullish",
        targetPrice: 80,
        confidence: 0.6,
        resolutionDate: daysAgo(1),
      });
      insertOhlcv(db, "FPT", daysAgo(1), 80); // 80 >= 80 → bullish correct

      await runPredictionResolution(db);

      const row = db
        .prepare("SELECT * FROM prediction_claims WHERE id=?")
        .get(id) as { resolution_outcome: number };
      expect(row.resolution_outcome).toBe(1);
    });

    it("resolves outcome=1 when actual <= target for bearish direction", async () => {
      const id = insertClaim(db, {
        stock: "HPG",
        direction: "bearish",
        targetPrice: 50,
        confidence: 0.5,
        resolutionDate: daysAgo(1),
      });
      insertOhlcv(db, "HPG", daysAgo(1), 45); // 45 <= 50 → bearish correct

      await runPredictionResolution(db);

      const row = db
        .prepare("SELECT * FROM prediction_claims WHERE id=?")
        .get(id) as { resolution_outcome: number };
      expect(row.resolution_outcome).toBe(1);
    });

    it("skips claims with neutral direction (no target evaluation)", async () => {
      insertClaim(db, {
        stock: "MWG",
        direction: "neutral",
        targetPrice: 60,
        confidence: 0.4,
        resolutionDate: daysAgo(1),
      });
      insertOhlcv(db, "MWG", daysAgo(1), 60);

      const result = await runPredictionResolution(db);

      expect(result.resolved).toBe(0);
      expect(result.skipped).toBe(1);
    });
  });

  // ── Brier score stored ────────────────────────────────────────────────────

  describe("Brier score storage", () => {
    it("stores correct brier_score on resolution", async () => {
      const id = insertClaim(db, {
        stock: "VCB",
        direction: "bullish",
        targetPrice: 100,
        confidence: 0.8,
        resolutionDate: daysAgo(1),
      });
      insertOhlcv(db, "VCB", daysAgo(1), 105); // outcome=1

      await runPredictionResolution(db);

      const row = db
        .prepare("SELECT brier_score FROM prediction_claims WHERE id=?")
        .get(id) as { brier_score: number };
      // outcome=1, confidence=0.8 → (1-0.8)^2 = 0.04
      expect(row.brier_score).toBeCloseTo(0.04, 4);
    });

    it("stores resolved_at timestamp on resolution", async () => {
      const id = insertClaim(db, {
        stock: "VCB",
        direction: "bullish",
        targetPrice: 100,
        confidence: 0.7,
        resolutionDate: daysAgo(1),
      });
      insertOhlcv(db, "VCB", daysAgo(1), 110);

      await runPredictionResolution(db);

      const row = db
        .prepare("SELECT resolved_at FROM prediction_claims WHERE id=?")
        .get(id) as { resolved_at: string | null };
      expect(row.resolved_at).not.toBeNull();
    });
  });

  // ── Future claims not processed ───────────────────────────────────────────

  describe("Future resolution dates are skipped", () => {
    it("does not process claims with resolution_date in the future", async () => {
      const id = insertClaim(db, {
        stock: "VCB",
        direction: "bullish",
        targetPrice: 100,
        confidence: 0.7,
        resolutionDate: daysFromNow(3),
      });
      insertOhlcv(db, "VCB", daysFromNow(3), 110);

      const result = await runPredictionResolution(db);

      expect(result.resolved).toBe(0);
      const row = db
        .prepare("SELECT resolution_outcome FROM prediction_claims WHERE id=?")
        .get(id) as { resolution_outcome: number | null };
      expect(row.resolution_outcome).toBeNull();
    });
  });

  // ── Retry window ──────────────────────────────────────────────────────────

  describe("5-day retry window", () => {
    it("skips claims with no OHLCV data within 5-day retry window", async () => {
      insertClaim(db, {
        stock: "VCB",
        direction: "bullish",
        targetPrice: 100,
        confidence: 0.7,
        resolutionDate: daysAgo(3), // within 5-day window, no OHLCV
      });

      const result = await runPredictionResolution(db);

      expect(result.resolved).toBe(0);
      expect(result.unresolvable).toBe(0);
    });

    it("marks claims unresolvable when past 5-day retry window with no data", async () => {
      const id = insertClaim(db, {
        stock: "VCB",
        direction: "bullish",
        targetPrice: 100,
        confidence: 0.7,
        resolutionDate: daysAgo(6), // past 5-day window
      });

      const result = await runPredictionResolution(db);

      expect(result.unresolvable).toBe(1);
      const row = db
        .prepare(
          "SELECT resolution_outcome, brier_score, resolved_at FROM prediction_claims WHERE id=?",
        )
        .get(id) as {
        resolution_outcome: number | null;
        brier_score: number | null;
        resolved_at: string | null;
      };
      expect(row.brier_score).toBeNull();
      expect(row.resolved_at).not.toBeNull();
    });
  });

  // ── Already resolved claims not re-processed ─────────────────────────────

  describe("Already resolved claims", () => {
    it("does not reprocess claims that already have resolution_outcome set", async () => {
      const id = insertClaim(db, {
        stock: "VCB",
        direction: "bullish",
        targetPrice: 100,
        confidence: 0.7,
        resolutionDate: daysAgo(1),
        resolutionOutcome: 1,
      });
      insertOhlcv(db, "VCB", daysAgo(1), 105);

      const result = await runPredictionResolution(db);

      expect(result.resolved).toBe(0);
      const row = db
        .prepare("SELECT resolved_at FROM prediction_claims WHERE id=?")
        .get(id) as { resolved_at: string | null };
      expect(row.resolved_at).toBeNull();
    });
  });

  // ── Return value ──────────────────────────────────────────────────────────

  describe("Return value", () => {
    it("returns correct resolved count", async () => {
      insertClaim(db, {
        stock: "VCB",
        direction: "bullish",
        targetPrice: 100,
        confidence: 0.7,
        resolutionDate: daysAgo(1),
      });
      insertOhlcv(db, "VCB", daysAgo(1), 110);
      insertClaim(db, {
        stock: "FPT",
        direction: "bearish",
        targetPrice: 80,
        confidence: 0.6,
        resolutionDate: daysAgo(2),
      });
      insertOhlcv(db, "FPT", daysAgo(2), 75);

      const result = await runPredictionResolution(db);

      expect(result.resolved).toBe(2);
      expect(result.unresolvable).toBe(0);
      expect(result.skipped).toBe(0);
    });

    it("returns { resolved: 0, unresolvable: 0, skipped: 0 } when no pending claims", async () => {
      const result = await runPredictionResolution(db);
      expect(result).toEqual({ resolved: 0, unresolvable: 0, skipped: 0 });
    });
  });

  // ── CRONS map registration ────────────────────────────────────────────────

  describe("CRONS map registration", () => {
    it("CRONS map contains predictionResolution key", () => {
      expect(CRONS).toHaveProperty("predictionResolution");
    });

    it("predictionResolution cron defaults to 30 16 * * * (after VN market close 16:30 UTC)", () => {
      expect((CRONS as Record<string, string>)["predictionResolution"]).toBe(
        "30 16 * * *",
      );
    });
  });
});
