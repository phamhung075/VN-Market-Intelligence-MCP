Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1128 — calibrationReportJob tests
 *
 * TDD: all tests are written before implementation.
 * Tests use an in-memory SQLite database with the minimal schema needed.
 *
 * AC coverage:
 *   AC-1: empty prediction_claims → total_resolved=0, avg_brier_score=null, JSON fields are {} or []
 *   AC-2: 4 resolved claims → correct total_resolved, avg_brier_score, direction avgs, stock min-3 filter
 *   AC-3: 10 claims across multiple confidence buckets → calibration_curve correct, empty buckets omitted
 *   AC-4: previous snapshot present → trend_delta = thisAvg - prevAvg
 *   AC-8: sendCalibrationDigest with total_resolved=0 → WORK called, MARKET not called
 *   AC-9: sendCalibrationDigest with total_resolved=5 → both channels called
 *   AC-obs: runCalibrationReportJob() calls recordJobRun (observability wrapper)
 *   AC-cron: CRONS.calibrationReport = '0 13 * * 0' (or env override)
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  runCalibrationReport,
  type CalibrationJobResult,
  type TelegramOverrides,
} from "../scheduler/macro/calibrationReportJob.js";
import { insertCalibrationSnapshot } from "../infrastructure/db/calibrationSnapshotStore.js";
import { CRONS } from "../scheduler/jobs.js";

// ─────────────────────────────────────────────────────────────────────────────
// Shared no-op Telegram overrides — used in all tests that do not test routing
// Prevents real HTTP calls to Telegram (429 rate-limit / timeout)
// ─────────────────────────────────────────────────────────────────────────────

const noopTelegram: TelegramOverrides = {
  sendWork: async () => true,
  sendMarket: async () => true,
};

// ─────────────────────────────────────────────────────────────────────────────
// In-memory DB setup
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");

  // prediction_claims table (minimal columns needed for calibration computation)
  db.run(`
    CREATE TABLE IF NOT EXISTS prediction_claims (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      stock              TEXT    NOT NULL,
      agent_id           TEXT    NOT NULL,
      claim_text         TEXT    NOT NULL,
      direction          TEXT    NOT NULL,
      target_price       REAL,
      resolution_date    TEXT    NOT NULL,
      confidence         REAL    NOT NULL,
      resolution_outcome INTEGER,
      actual_price       REAL,
      brier_score        REAL,
      created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
      resolved_at        TEXT,
      UNIQUE(stock, claim_text, resolution_date)
    )
  `);

  // calibration_snapshots table
  db.run(`
    CREATE TABLE IF NOT EXISTS calibration_snapshots (
      id                     INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_date          TEXT NOT NULL,
      total_resolved         INTEGER NOT NULL,
      avg_brier_score        REAL,
      avg_brier_by_agent     TEXT NOT NULL,
      avg_brier_by_stock     TEXT NOT NULL,
      avg_brier_by_direction TEXT NOT NULL,
      calibration_curve      TEXT NOT NULL,
      trend_delta            REAL,
      top_predictions        TEXT NOT NULL,
      worst_predictions      TEXT NOT NULL,
      computed_at            TEXT NOT NULL
    )
  `);

  // cron_job_runs table (for recordJobRun wrapper)
  db.run(`
    CREATE TABLE IF NOT EXISTS cron_job_runs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name     TEXT    NOT NULL,
      status       TEXT    NOT NULL DEFAULT 'running',
      started_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      finished_at  TEXT,
      duration_ms  INTEGER,
      rows_written INTEGER,
      error_msg    TEXT
    )
  `);

  // market_messages table (required by getLabelAccuracyReport in Step 3.5 — Task 1176)
  db.run(`
    CREATE TABLE IF NOT EXISTS market_messages (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent   TEXT    NOT NULL,
      message_type TEXT    NOT NULL,
      ticker       TEXT,
      content      TEXT    NOT NULL,
      sent_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      verdict      TEXT,
      verdict_note TEXT,
      reviewed_at  TEXT
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_mm_sent_at    ON market_messages(sent_at DESC)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_mm_from_agent ON market_messages(from_agent)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_mm_verdict    ON market_messages(verdict)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_mm_ticker     ON market_messages(ticker)`);

  return db;
}

/** Insert a resolved claim with a known brier_score */
function insertResolved(
  db: Database,
  opts: {
    stock: string;
    agent_id: string;
    direction: string;
    confidence: number;
    brier_score: number;
    resolution_outcome: 0 | 1;
    resolved_at?: string;
    created_at?: string;
  },
) {
  const text = `claim-${Math.random()}`;
  const date = new Date().toISOString().slice(0, 10);
  db.run(
    `INSERT INTO prediction_claims
       (stock, agent_id, claim_text, direction, resolution_date,
        confidence, resolution_outcome, brier_score, resolved_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      opts.stock,
      opts.agent_id,
      text,
      opts.direction,
      date,
      opts.confidence,
      opts.resolution_outcome,
      opts.brier_score,
      opts.resolved_at ?? new Date().toISOString(),
      opts.created_at ?? new Date().toISOString(),
    ],
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-1: empty prediction_claims
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1128 — calibrationReportJob", () => {
  describe("AC-1: empty prediction_claims", () => {
    it("writes snapshot with total_resolved=0 and avg_brier_score=null", async () => {
      const db = makeDb();
      const result = await runCalibrationReport(db, noopTelegram);

      expect(result.total_resolved).toBe(0);
      expect(result.avg_brier_score).toBeNull();
    });

    it("serialises empty JSON fields as {} or []", async () => {
      const db = makeDb();
      await runCalibrationReport(db, noopTelegram);

      const row = db
        .prepare("SELECT * FROM calibration_snapshots ORDER BY id DESC LIMIT 1")
        .get() as Record<string, unknown>;

      expect(row).toBeTruthy();
      expect(JSON.parse(row.avg_brier_by_agent as string)).toEqual({});
      expect(JSON.parse(row.avg_brier_by_stock as string)).toEqual({});
      expect(JSON.parse(row.calibration_curve as string)).toEqual([]);
      expect(JSON.parse(row.top_predictions as string)).toEqual([]);
      expect(JSON.parse(row.worst_predictions as string)).toEqual([]);
    });

    it("inserts exactly one snapshot row", async () => {
      const db = makeDb();
      await runCalibrationReport(db, noopTelegram);

      const { cnt } = db
        .prepare("SELECT count(*) as cnt FROM calibration_snapshots")
        .get() as { cnt: number };

      expect(cnt).toBe(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AC-2: 4 resolved claims — correct aggregates + stock min-3 filter
  // ─────────────────────────────────────────────────────────────────────────

  describe("AC-2: 4 resolved claims", () => {
    let db: Database;
    let result: CalibrationJobResult;

    beforeEach(async () => {
      db = makeDb();
      // 2 claims for VCB (bullish) — agent-A: brier=0.04, brier=0.09
      insertResolved(db, { stock: "VCB", agent_id: "agent-A", direction: "bullish", confidence: 0.8, brier_score: 0.04, resolution_outcome: 1 });
      insertResolved(db, { stock: "VCB", agent_id: "agent-A", direction: "bullish", confidence: 0.7, brier_score: 0.09, resolution_outcome: 1 });
      // 1 claim for HPG (bearish) — agent-B: brier=0.16
      insertResolved(db, { stock: "HPG", agent_id: "agent-B", direction: "bearish", confidence: 0.6, brier_score: 0.16, resolution_outcome: 0 });
      // 1 claim for FPT (neutral) — agent-A: brier=0.25
      insertResolved(db, { stock: "FPT", agent_id: "agent-A", direction: "neutral", confidence: 0.5, brier_score: 0.25, resolution_outcome: 0 });
      result = await runCalibrationReport(db, noopTelegram);
    });

    it("reports correct total_resolved", () => {
      expect(result.total_resolved).toBe(4);
    });

    it("computes correct avg_brier_score (mean of all 4)", () => {
      const expected = (0.04 + 0.09 + 0.16 + 0.25) / 4;
      expect(result.avg_brier_score).toBeCloseTo(expected, 5);
    });

    it("computes per-agent averages correctly", () => {
      // agent-A: (0.04 + 0.09 + 0.25) / 3
      const agentA = (0.04 + 0.09 + 0.25) / 3;
      expect(result.avg_brier_by_agent["agent-A"]).toBeCloseTo(agentA, 5);
      // agent-B: 0.16
      expect(result.avg_brier_by_agent["agent-B"]).toBeCloseTo(0.16, 5);
    });

    it("applies stock min-3 filter: all stocks excluded (each has <3 claims)", () => {
      // VCB has only 2 claims → excluded. HPG and FPT have 1 each → excluded.
      expect(result.avg_brier_by_stock["VCB"]).toBeUndefined();
      expect(Object.keys(result.avg_brier_by_stock).length).toBe(0);
    });

    it("computes per-direction averages correctly", () => {
      const bullishAvg = (0.04 + 0.09) / 2;
      expect(result.avg_brier_by_direction["bullish"]).toBeCloseTo(bullishAvg, 5);
      expect(result.avg_brier_by_direction["bearish"]).toBeCloseTo(0.16, 5);
      expect(result.avg_brier_by_direction["neutral"]).toBeCloseTo(0.25, 5);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AC-3: calibration curve buckets
  // ─────────────────────────────────────────────────────────────────────────

  describe("AC-3: calibration curve — 10 claims across 3 buckets", () => {
    let db: Database;
    let result: CalibrationJobResult;

    beforeEach(async () => {
      db = makeDb();
      // Bucket 0 (0.0-0.1): confidence=0.05 → bucketIndex=0, midpoint=0.05
      // Insert 3 claims in bucket 0: 2 correct, 1 wrong
      for (let i = 0; i < 2; i++) {
        insertResolved(db, { stock: "VCB", agent_id: "agent-A", direction: "bullish", confidence: 0.05, brier_score: Math.pow(1 - 0.05, 2), resolution_outcome: 1 });
      }
      insertResolved(db, { stock: "VCB", agent_id: "agent-A", direction: "bullish", confidence: 0.05, brier_score: Math.pow(0 - 0.05, 2), resolution_outcome: 0 });

      // Bucket 7 (0.7-0.8): confidence=0.75 → bucketIndex=7, midpoint=0.75
      // Insert 4 claims: 3 correct, 1 wrong
      for (let i = 0; i < 3; i++) {
        insertResolved(db, { stock: "HPG", agent_id: "agent-B", direction: "bearish", confidence: 0.75, brier_score: Math.pow(1 - 0.75, 2), resolution_outcome: 1 });
      }
      insertResolved(db, { stock: "HPG", agent_id: "agent-B", direction: "bearish", confidence: 0.75, brier_score: Math.pow(0 - 0.75, 2), resolution_outcome: 0 });

      // Bucket 9 (0.9-1.0): confidence=0.95 → bucketIndex=9, midpoint=0.95
      // Insert 3 claims: all correct
      for (let i = 0; i < 3; i++) {
        insertResolved(db, { stock: "FPT", agent_id: "agent-A", direction: "bullish", confidence: 0.95, brier_score: Math.pow(1 - 0.95, 2), resolution_outcome: 1 });
      }
      result = await runCalibrationReport(db, noopTelegram);
    });

    it("emits only non-empty buckets (3 populated out of 10)", () => {
      expect(result.calibration_curve.length).toBe(3);
    });

    it("bucket midpoint=0.05: correct actual_hit_rate (2/3) and sample_size (3)", () => {
      const bucket = result.calibration_curve.find((b) => b.bucket_midpoint === 0.05);
      expect(bucket).toBeTruthy();
      expect(bucket!.sample_size).toBe(3);
      expect(bucket!.actual_hit_rate).toBeCloseTo(2 / 3, 5);
    });

    it("bucket midpoint=0.75: correct actual_hit_rate (3/4) and sample_size (4)", () => {
      const bucket = result.calibration_curve.find((b) => b.bucket_midpoint === 0.75);
      expect(bucket).toBeTruthy();
      expect(bucket!.sample_size).toBe(4);
      expect(bucket!.actual_hit_rate).toBeCloseTo(3 / 4, 5);
    });

    it("bucket midpoint=0.95: correct actual_hit_rate (3/3) and sample_size (3)", () => {
      const bucket = result.calibration_curve.find((b) => b.bucket_midpoint === 0.95);
      expect(bucket).toBeTruthy();
      expect(bucket!.sample_size).toBe(3);
      expect(bucket!.actual_hit_rate).toBeCloseTo(1.0, 5);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AC-4: trend_delta computation
  // ─────────────────────────────────────────────────────────────────────────

  describe("AC-4: trend_delta vs previous snapshot", () => {
    it("returns null trend_delta when no prior snapshot exists", async () => {
      const db = makeDb();
      const result = await runCalibrationReport(db, noopTelegram);
      expect(result.trend_delta).toBeNull();
    });

    it("computes trend_delta = thisAvg - prevAvg when prior snapshot exists", async () => {
      const db = makeDb();

      // Insert a prior snapshot manually with avg_brier_score = 0.15
      // and snapshot_date in the past
      insertCalibrationSnapshot(db, {
        snapshot_date: "2026-01-05",
        total_resolved: 10,
        avg_brier_score: 0.15,
        avg_brier_by_agent: {},
        avg_brier_by_stock: {},
        avg_brier_by_direction: {},
        calibration_curve: [],
        trend_delta: null,
        top_predictions: [],
        worst_predictions: [],
        computed_at: new Date().toISOString(),
      });

      // Add one resolved claim so avg_brier_score is not null
      insertResolved(db, { stock: "VCB", agent_id: "agent-A", direction: "bullish", confidence: 0.8, brier_score: 0.10, resolution_outcome: 1 });

      const result = await runCalibrationReport(db, noopTelegram);

      // thisAvg = 0.10, prevAvg = 0.15 → delta = -0.05 (improving)
      expect(result.avg_brier_score).toBeCloseTo(0.10, 5);
      expect(result.trend_delta).toBeCloseTo(0.10 - 0.15, 5);
    });

    it("returns null trend_delta when current avg is null even if prior exists", async () => {
      const db = makeDb();

      // Insert prior snapshot
      insertCalibrationSnapshot(db, {
        snapshot_date: "2026-01-05",
        total_resolved: 5,
        avg_brier_score: 0.20,
        avg_brier_by_agent: {},
        avg_brier_by_stock: {},
        avg_brier_by_direction: {},
        calibration_curve: [],
        trend_delta: null,
        top_predictions: [],
        worst_predictions: [],
        computed_at: new Date().toISOString(),
      });

      // No current claims → avg = null
      const result = await runCalibrationReport(db, noopTelegram);
      expect(result.avg_brier_score).toBeNull();
      expect(result.trend_delta).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AC-8 / AC-9: sendCalibrationDigest channel routing
  // ─────────────────────────────────────────────────────────────────────────

  describe("AC-8: digest with total_resolved=0 — WORK only, not MARKET", () => {
    it("calls WORK channel but NOT MARKET channel when no resolved claims", async () => {
      const db = makeDb();
      const workCalls: string[] = [];
      const marketCalls: string[] = [];

      await runCalibrationReport(db, {
        sendWork: async (msg: string) => { workCalls.push(msg); return true; },
        sendMarket: async (msg: string) => { marketCalls.push(msg); return true; },
      });

      expect(workCalls.length).toBe(1);
      expect(marketCalls.length).toBe(0);
    });
  });

  describe("AC-9: digest with total_resolved>=1 — both channels called", () => {
    it("calls both WORK and MARKET when resolved claims exist", async () => {
      const db = makeDb();
      insertResolved(db, { stock: "VCB", agent_id: "agent-A", direction: "bullish", confidence: 0.8, brier_score: 0.04, resolution_outcome: 1 });

      const workCalls: string[] = [];
      const marketCalls: string[] = [];

      await runCalibrationReport(db, {
        sendWork: async (msg: string) => { workCalls.push(msg); return true; },
        sendMarket: async (msg: string) => { marketCalls.push(msg); return true; },
      });

      expect(workCalls.length).toBe(1);
      expect(marketCalls.length).toBe(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AC-cron: CRONS.calibrationReport key in jobs.ts
  // ─────────────────────────────────────────────────────────────────────────

  describe("AC-cron: CRONS.calibrationReport registered in jobs.ts", () => {
    it("has calibrationReport key with default cron '0 13 * * 0'", () => {
      expect(CRONS).toHaveProperty("calibrationReport");
      // Default value is '0 13 * * 0' unless overridden by env
      const val = CRONS.calibrationReport;
      expect(typeof val).toBe("string");
      // If env var not set, must be the default
      if (!Bun.env.CRON_CALIBRATION_REPORT) {
        expect(val).toBe("0 13 * * 0");
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Top/worst predictions
  // ─────────────────────────────────────────────────────────────────────────

  describe("top and worst predictions", () => {
    it("top_predictions contains the lowest brier_score claim", async () => {
      const db = makeDb();
      insertResolved(db, { stock: "VCB", agent_id: "agent-A", direction: "bullish", confidence: 0.9, brier_score: 0.01, resolution_outcome: 1 });
      insertResolved(db, { stock: "HPG", agent_id: "agent-B", direction: "bearish", confidence: 0.5, brier_score: 0.25, resolution_outcome: 0 });

      const result = await runCalibrationReport(db, noopTelegram);

      expect(result.top_predictions.length).toBeGreaterThan(0);
      const topFirst = result.top_predictions[0];
      expect(topFirst?.brier_score).toBeCloseTo(0.01, 5);
    });

    it("worst_predictions contains the highest brier_score claim", async () => {
      const db = makeDb();
      insertResolved(db, { stock: "VCB", agent_id: "agent-A", direction: "bullish", confidence: 0.9, brier_score: 0.01, resolution_outcome: 1 });
      insertResolved(db, { stock: "HPG", agent_id: "agent-B", direction: "bearish", confidence: 0.5, brier_score: 0.25, resolution_outcome: 0 });

      const result = await runCalibrationReport(db, noopTelegram);

      expect(result.worst_predictions.length).toBeGreaterThan(0);
      const worstFirst = result.worst_predictions[0];
      expect(worstFirst?.brier_score).toBeCloseTo(0.25, 5);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 90-day window filter
  // ─────────────────────────────────────────────────────────────────────────

  describe("90-day window filter", () => {
    it("excludes claims resolved more than 90 days ago", async () => {
      const db = makeDb();

      // Old claim: resolved 100 days ago
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 100);
      insertResolved(db, {
        stock: "VCB",
        agent_id: "agent-A",
        direction: "bullish",
        confidence: 0.8,
        brier_score: 0.04,
        resolution_outcome: 1,
        resolved_at: oldDate.toISOString(),
      });

      // Recent claim: resolved today
      insertResolved(db, {
        stock: "HPG",
        agent_id: "agent-B",
        direction: "bearish",
        confidence: 0.6,
        brier_score: 0.16,
        resolution_outcome: 0,
        resolved_at: new Date().toISOString(),
      });

      const result = await runCalibrationReport(db, noopTelegram);

      // Only the recent claim should be counted
      expect(result.total_resolved).toBe(1);
      expect(result.avg_brier_score).toBeCloseTo(0.16, 5);
    });
  });
});
