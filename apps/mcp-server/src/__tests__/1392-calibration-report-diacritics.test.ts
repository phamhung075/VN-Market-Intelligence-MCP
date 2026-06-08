Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1392 — TDD RED: calibrationReportJob MARKET message diacritics
 *
 * The current implementation builds marketLines with unaccented strings
 * ("BAO CAO CALIBRATION TUAN", "Du doan da giai quyet", "cai thien" etc.).
 * These tests assert the CORRECT accented Vietnamese strings MUST be present,
 * which makes them RED against the unchanged implementation.
 *
 * T1: header must contain "BÁO CÁO" (not "BAO CAO")
 * T2: resolved label must contain "Dự đoán đã giải quyết" (not "Du doan")
 * T3: trend delta < 0 → label "cải thiện"
 * T4: trend delta = 0 → label "ổn định"
 * T5: trend delta > 0 → label "xuống cấp"
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  runCalibrationReport,
  type TelegramOverrides,
} from "../scheduler/macro/calibrationReportJob.js";
import { insertCalibrationSnapshot } from "../infrastructure/db/calibrationSnapshotStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// In-memory DB factory (minimal schema required by runCalibrationReport)
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");

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

/** Insert a resolved prediction_claim with a brier_score */
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
  },
): void {
  const text = `claim-${Math.random()}`;
  const date = new Date().toISOString().slice(0, 10);
  const resolvedAt =
    opts.resolved_at ?? new Date(Date.now() - 1000 * 60).toISOString();
  db.run(
    `INSERT INTO prediction_claims
       (stock, agent_id, claim_text, direction, resolution_date,
        confidence, resolution_outcome, brier_score, resolved_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      opts.stock,
      opts.agent_id,
      text,
      opts.direction,
      date,
      opts.confidence,
      opts.resolution_outcome,
      opts.brier_score,
      resolvedAt,
    ],
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run runCalibrationReport and capture the market message sent via sendMarket.
 * Returns the captured string or null if sendMarket was never called.
 */
async function captureMarketMsg(
  db: Database,
  extraSetup?: (db: Database) => void,
): Promise<string | null> {
  extraSetup?.(db);

  let captured: string | null = null;
  const overrides: TelegramOverrides = {
    sendWork: async () => true,
    sendMarket: async (msg: string) => {
      captured = msg;
      return true;
    },
  };

  await runCalibrationReport(db, overrides);
  return captured;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1392 — MARKET message proper Vietnamese diacritics (RED)", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  it("T1: MARKET header must use accented 'BÁO CÁO' not bare 'BAO CAO'", async () => {
    // Insert 1 resolved claim so MARKET channel is triggered
    insertResolved(db, {
      stock: "VNM",
      agent_id: "agent-01",
      direction: "LONG",
      confidence: 0.7,
      brier_score: 0.09,
      resolution_outcome: 1,
    });

    const msg = await captureMarketMsg(db);

    expect(msg).not.toBeNull();
    // Must contain proper accented header
    expect(msg!).toContain("BÁO CÁO");
    // Must NOT contain the unaccented version
    expect(msg!).not.toContain("BAO CAO");
  });

  it("T2: resolved-count label must use 'Dự đoán đã giải quyết' not 'Du doan'", async () => {
    insertResolved(db, {
      stock: "FPT",
      agent_id: "agent-02",
      direction: "SHORT",
      confidence: 0.6,
      brier_score: 0.25,
      resolution_outcome: 0,
    });

    const msg = await captureMarketMsg(db);

    expect(msg).not.toBeNull();
    expect(msg!).toContain("Dự đoán đã giải quyết");
    expect(msg!).not.toContain("Du doan");
  });

  it("T3: trend label for delta < 0 must be 'cải thiện' not 'cai thien'", async () => {
    // Insert 2 resolved claims so avg_brier_score exists
    for (let i = 0; i < 2; i++) {
      insertResolved(db, {
        stock: "HPG",
        agent_id: "agent-03",
        direction: "LONG",
        confidence: 0.65,
        brier_score: 0.2,
        resolution_outcome: 1,
      });
    }

    // Insert previous snapshot with HIGHER brier (so delta = current - prev < 0)
    const todayStr = new Date().toISOString().slice(0, 10);
    insertCalibrationSnapshot(db, {
      snapshot_date: "2000-01-01", // older date so it qualifies as "previous"
      total_resolved: 2,
      avg_brier_score: 0.5, // higher than current ~0.2 → delta negative → improving
      avg_brier_by_agent: {},
      avg_brier_by_stock: {},
      avg_brier_by_direction: {},
      calibration_curve: [],
      trend_delta: null,
      top_predictions: [],
      worst_predictions: [],
      computed_at: "2000-01-01T00:00:00.000Z",
    });

    const msg = await captureMarketMsg(db);

    expect(msg).not.toBeNull();
    expect(msg!).toContain("cải thiện");
    expect(msg!).not.toContain("cai thien");
  });

  it("T4: trend label for delta = 0 must be 'ổn định' not 'on dinh'", async () => {
    const brierScore = 0.3;
    insertResolved(db, {
      stock: "VIC",
      agent_id: "agent-04",
      direction: "LONG",
      confidence: 0.7,
      brier_score: brierScore,
      resolution_outcome: 1,
    });

    // Previous snapshot with SAME avg_brier_score → delta = 0
    insertCalibrationSnapshot(db, {
      snapshot_date: "2000-01-01",
      total_resolved: 1,
      avg_brier_score: brierScore,
      avg_brier_by_agent: {},
      avg_brier_by_stock: {},
      avg_brier_by_direction: {},
      calibration_curve: [],
      trend_delta: null,
      top_predictions: [],
      worst_predictions: [],
      computed_at: "2000-01-01T00:00:00.000Z",
    });

    const msg = await captureMarketMsg(db);

    expect(msg).not.toBeNull();
    expect(msg!).toContain("ổn định");
    expect(msg!).not.toContain("on dinh");
  });

  it("T5: trend label for delta > 0 must be 'xuống cấp' not 'xuong cap'", async () => {
    insertResolved(db, {
      stock: "MWG",
      agent_id: "agent-05",
      direction: "SHORT",
      confidence: 0.55,
      brier_score: 0.45,
      resolution_outcome: 0,
    });

    // Previous snapshot with LOWER brier → delta > 0 → degrading
    insertCalibrationSnapshot(db, {
      snapshot_date: "2000-01-01",
      total_resolved: 1,
      avg_brier_score: 0.1, // lower than current 0.45 → delta positive → degrading
      avg_brier_by_agent: {},
      avg_brier_by_stock: {},
      avg_brier_by_direction: {},
      calibration_curve: [],
      trend_delta: null,
      top_predictions: [],
      worst_predictions: [],
      computed_at: "2000-01-01T00:00:00.000Z",
    });

    const msg = await captureMarketMsg(db);

    expect(msg).not.toBeNull();
    expect(msg!).toContain("xuống cấp");
    expect(msg!).not.toContain("xuong cap");
  });
});
