/**
 * Task 1127 — calibration_snapshots DDL + calibrationSnapshotStore CRUD
 *
 * Tests use :memory: SQLite — initDatabase() sets up all tables including
 * calibration_snapshots.
 *
 * Acceptance criteria:
 *  - insertCalibrationSnapshot inserts row, returns non-zero id
 *  - JSON columns round-trip (serialise on write, parse on read)
 *  - getLatestCalibrationSnapshot returns null on empty table
 *  - getLatestCalibrationSnapshot returns highest-id row when two rows share same date
 *  - getCalibrationSnapshotByDate returns null for unknown date
 *  - getCalibrationSnapshotByDate returns latest row (highest id) for a date with two rows
 *  - getPreviousCalibrationSnapshot returns null when no prior row exists
 *  - getPreviousCalibrationSnapshot returns the correct row when prior row exists
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initDatabase, closeDb, getDb } from "../infrastructure/db/schema.js";
import {
  insertCalibrationSnapshot,
  getLatestCalibrationSnapshot,
  getCalibrationSnapshotByDate,
  getPreviousCalibrationSnapshot,
  type CalibrationSnapshotInput,
} from "../infrastructure/db/calibrationSnapshotStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<CalibrationSnapshotInput> = {}): CalibrationSnapshotInput {
  return {
    snapshot_date: "2026-04-06",
    total_resolved: 15,
    avg_brier_score: 0.142,
    avg_brier_by_agent: { "04-market-watcher": 0.135, "08-prediction-synthesizer": 0.149 },
    avg_brier_by_stock: { VCB: 0.12, TCB: 0.16, FPT: 0.13 },
    avg_brier_by_direction: { bullish: 0.14, bearish: 0.15, neutral: null },
    calibration_curve: [
      { bucket_midpoint: 0.65, predicted_prob: 0.65, actual_hit_rate: 0.61, sample_size: 8 },
      { bucket_midpoint: 0.75, predicted_prob: 0.75, actual_hit_rate: 0.78, sample_size: 5 },
    ],
    trend_delta: -0.018,
    top_predictions: [
      {
        id: 1,
        stock: "VCB",
        agent_id: "04-market-watcher",
        direction: "bullish",
        confidence: 0.75,
        claim_text: "VCB sẽ tăng 5% trong 30 ngày",
        brier_score: 0.0625,
        resolved_at: "2026-04-01T10:00:00Z",
      },
    ],
    worst_predictions: [
      {
        id: 2,
        stock: "HPG",
        agent_id: "08-prediction-synthesizer",
        direction: "bearish",
        confidence: 0.8,
        claim_text: "HPG sẽ giảm 8% trong 20 ngày",
        brier_score: 0.64,
        resolved_at: "2026-04-03T10:00:00Z",
      },
    ],
    computed_at: "2026-04-06T13:00:00Z",
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────────────────

let db: Database;

beforeEach(async () => {
  closeDb();
  Bun.env["DB_PATH"] = ":memory:";
  await initDatabase();
  db = getDb();
});

afterEach(() => {
  closeDb();
  delete Bun.env["DB_PATH"];
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1127 — calibrationSnapshotStore", () => {
  describe("insertCalibrationSnapshot", () => {
    it("inserts a row and returns a non-zero integer id", () => {
      const input = makeInput();
      const id = insertCalibrationSnapshot(db, input);
      expect(typeof id).toBe("number");
      expect(id).toBeGreaterThan(0);
    });

    it("serialises JSON fields correctly — round-trip via getLatestCalibrationSnapshot", () => {
      const input = makeInput();
      insertCalibrationSnapshot(db, input);

      const row = getLatestCalibrationSnapshot(db);
      expect(row).not.toBeNull();

      // avg_brier_by_agent
      expect(row!.avg_brier_by_agent).toEqual(input.avg_brier_by_agent);
      // avg_brier_by_stock
      expect(row!.avg_brier_by_stock).toEqual(input.avg_brier_by_stock);
      // avg_brier_by_direction
      expect(row!.avg_brier_by_direction).toEqual(input.avg_brier_by_direction);
      // calibration_curve
      expect(row!.calibration_curve).toEqual(input.calibration_curve);
      // top_predictions
      expect(row!.top_predictions).toEqual(input.top_predictions);
      // worst_predictions
      expect(row!.worst_predictions).toEqual(input.worst_predictions);
    });

    it("stores scalar fields correctly", () => {
      const input = makeInput();
      insertCalibrationSnapshot(db, input);
      const row = getLatestCalibrationSnapshot(db);
      expect(row!.snapshot_date).toBe("2026-04-06");
      expect(row!.total_resolved).toBe(15);
      expect(row!.avg_brier_score).toBeCloseTo(0.142);
      expect(row!.trend_delta).toBeCloseTo(-0.018);
      expect(row!.computed_at).toBe("2026-04-06T13:00:00Z");
    });

    it("stores NULL avg_brier_score when total_resolved is 0", () => {
      const input = makeInput({ total_resolved: 0, avg_brier_score: null, trend_delta: null });
      insertCalibrationSnapshot(db, input);
      const row = getLatestCalibrationSnapshot(db);
      expect(row!.avg_brier_score).toBeNull();
      expect(row!.trend_delta).toBeNull();
    });

    it("allows two rows with the same snapshot_date (re-run idempotency)", () => {
      const input = makeInput({ snapshot_date: "2026-04-06" });
      const id1 = insertCalibrationSnapshot(db, input);
      const id2 = insertCalibrationSnapshot(db, input);
      expect(id1).toBeGreaterThan(0);
      expect(id2).toBeGreaterThan(id1);
    });
  });

  describe("getLatestCalibrationSnapshot", () => {
    it("returns null on empty table", () => {
      const row = getLatestCalibrationSnapshot(db);
      expect(row).toBeNull();
    });

    it("returns the row with the highest id when two rows exist for the same date", () => {
      const input = makeInput({ snapshot_date: "2026-04-06", avg_brier_score: 0.142 });
      insertCalibrationSnapshot(db, input);
      const id2 = insertCalibrationSnapshot(db, { ...input, avg_brier_score: 0.155 });

      const row = getLatestCalibrationSnapshot(db);
      expect(row!.id).toBe(id2);
      expect(row!.avg_brier_score).toBeCloseTo(0.155);
    });

    it("returns the single row when only one exists", () => {
      const input = makeInput();
      const id = insertCalibrationSnapshot(db, input);
      const row = getLatestCalibrationSnapshot(db);
      expect(row!.id).toBe(id);
    });
  });

  describe("getCalibrationSnapshotByDate", () => {
    it("returns null for an unknown date", () => {
      insertCalibrationSnapshot(db, makeInput({ snapshot_date: "2026-04-06" }));
      const row = getCalibrationSnapshotByDate(db, "2026-03-30");
      expect(row).toBeNull();
    });

    it("returns the snapshot for the given date", () => {
      insertCalibrationSnapshot(db, makeInput({ snapshot_date: "2026-04-06" }));
      const row = getCalibrationSnapshotByDate(db, "2026-04-06");
      expect(row).not.toBeNull();
      expect(row!.snapshot_date).toBe("2026-04-06");
    });

    it("returns the latest row (highest id) when two rows share the same date", () => {
      const input = makeInput({ snapshot_date: "2026-04-06", avg_brier_score: 0.142 });
      insertCalibrationSnapshot(db, input);
      const id2 = insertCalibrationSnapshot(db, { ...input, avg_brier_score: 0.199 });

      const row = getCalibrationSnapshotByDate(db, "2026-04-06");
      expect(row!.id).toBe(id2);
      expect(row!.avg_brier_score).toBeCloseTo(0.199);
    });
  });

  describe("getPreviousCalibrationSnapshot", () => {
    it("returns null when no row predates the given date", () => {
      // Only row is on 2026-04-06; asking for before 2026-03-30 → no match
      insertCalibrationSnapshot(db, makeInput({ snapshot_date: "2026-04-06" }));
      const row = getPreviousCalibrationSnapshot(db, "2026-03-30");
      expect(row).toBeNull();
    });

    it("returns null on empty table", () => {
      const row = getPreviousCalibrationSnapshot(db, "2026-04-06");
      expect(row).toBeNull();
    });

    it("returns the most recent snapshot strictly before the given date", () => {
      insertCalibrationSnapshot(db, makeInput({ snapshot_date: "2026-03-23", avg_brier_score: 0.180 }));
      insertCalibrationSnapshot(db, makeInput({ snapshot_date: "2026-03-30", avg_brier_score: 0.162 }));

      const row = getPreviousCalibrationSnapshot(db, "2026-04-06");
      expect(row).not.toBeNull();
      expect(row!.snapshot_date).toBe("2026-03-30");
      expect(row!.avg_brier_score).toBeCloseTo(0.162);
    });

    it("does not return a row whose snapshot_date equals the given date (exclusive upper bound)", () => {
      insertCalibrationSnapshot(db, makeInput({ snapshot_date: "2026-04-06" }));
      const row = getPreviousCalibrationSnapshot(db, "2026-04-06");
      expect(row).toBeNull();
    });

    it("returns the highest-id row when two rows share the latest-prior date", () => {
      const input = makeInput({ snapshot_date: "2026-03-30", avg_brier_score: 0.162 });
      insertCalibrationSnapshot(db, input);
      const id2 = insertCalibrationSnapshot(db, { ...input, avg_brier_score: 0.171 });

      const row = getPreviousCalibrationSnapshot(db, "2026-04-06");
      expect(row!.id).toBe(id2);
    });
  });
});
