/**
 * Task 1127 — calibrationSnapshotStore
 *
 * CRUD helpers for the `calibration_snapshots` table.
 * Part of the Prediction Engine Phase D (Sprint 060).
 *
 * Calibration snapshots are weekly materialised aggregates over
 * `prediction_claims`. They are written by `calibrationReportJob` every
 * Sunday 13:00 UTC and read by the `get_calibration_report` MCP tool.
 *
 * Layer: infrastructure/db — no domain imports.
 * All queries use parameterized bindings — never string-interpolate user input.
 *
 * @module infrastructure/db/calibrationSnapshotStore
 */

import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One bucket in the calibration curve.
 * The curve maps predicted probability to observed hit rate for each
 * 10-percentage-point confidence band.
 */
export interface CalibrationCurveBucket {
  /** Mid-point of the confidence band: 0.05, 0.15, …, 0.95 */
  bucket_midpoint: number;
  /** Same as bucket_midpoint — explicit for serialisation clarity */
  predicted_prob: number;
  /** Fraction of claims in this bucket that were correct */
  actual_hit_rate: number;
  /** Number of scorable claims in this bucket */
  sample_size: number;
}

/**
 * Summary row for a single resolved prediction — used in top/worst lists.
 */
export interface PredictionSummary {
  id: number;
  stock: string;
  agent_id: string;
  direction: string;
  confidence: number;
  claim_text: string;
  brier_score: number;
  resolved_at: string;
}

/**
 * Input shape for inserting a new calibration snapshot.
 * All Record and array fields are serialised to JSON strings by the store.
 */
export interface CalibrationSnapshotInput {
  /** ISO date YYYY-MM-DD of the Sunday wall-clock run */
  snapshot_date: string;
  /** Total number of resolved claims in the 90-day window */
  total_resolved: number;
  /**
   * Mean Brier score across all scorable resolved claims.
   * NULL when total_resolved = 0 or no claims have a brier_score.
   */
  avg_brier_score: number | null;
  /** Per-agent mean Brier score. Empty object when no data. */
  avg_brier_by_agent: Record<string, number>;
  /** Per-stock mean Brier score (min 3 claims per stock). Empty object when no data. */
  avg_brier_by_stock: Record<string, number>;
  /**
   * Per-direction mean Brier score.
   * NULL values are valid (direction present in data but all brier_score=NULL).
   */
  avg_brier_by_direction: Record<string, number | null>;
  /** Calibration curve buckets. Empty array when no data. */
  calibration_curve: CalibrationCurveBucket[];
  /**
   * Difference vs previous snapshot: current - previous avg_brier_score.
   * Negative = improving. NULL on first run.
   */
  trend_delta: number | null;
  /** Top 5 predictions (lowest brier_score). Empty array when no data. */
  top_predictions: PredictionSummary[];
  /** Worst 5 predictions (highest brier_score). Empty array when no data. */
  worst_predictions: PredictionSummary[];
  /** ISO 8601 UTC timestamp of when this snapshot was computed */
  computed_at: string;
}

/**
 * Full row from the calibration_snapshots table.
 * JSON columns are parsed back to objects/arrays on read.
 */
export interface CalibrationSnapshotRow extends CalibrationSnapshotInput {
  id: number;
}

/** Raw SQLite row shape before JSON parsing */
interface CalibrationSnapshotDbRow {
  id: number;
  snapshot_date: string;
  total_resolved: number;
  avg_brier_score: number | null;
  avg_brier_by_agent: string;
  avg_brier_by_stock: string;
  avg_brier_by_direction: string;
  calibration_curve: string;
  trend_delta: number | null;
  top_predictions: string;
  worst_predictions: string;
  computed_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a raw SQLite row into a CalibrationSnapshotRow.
 * Deserialises all JSON TEXT columns back to objects/arrays.
 */
function parseRow(r: CalibrationSnapshotDbRow): CalibrationSnapshotRow {
  return {
    id: r.id,
    snapshot_date: r.snapshot_date,
    total_resolved: r.total_resolved,
    avg_brier_score: r.avg_brier_score,
    avg_brier_by_agent: JSON.parse(r.avg_brier_by_agent) as Record<string, number>,
    avg_brier_by_stock: JSON.parse(r.avg_brier_by_stock) as Record<string, number>,
    avg_brier_by_direction: JSON.parse(r.avg_brier_by_direction) as Record<string, number | null>,
    calibration_curve: JSON.parse(r.calibration_curve) as CalibrationCurveBucket[],
    trend_delta: r.trend_delta,
    top_predictions: JSON.parse(r.top_predictions) as PredictionSummary[],
    worst_predictions: JSON.parse(r.worst_predictions) as PredictionSummary[],
    computed_at: r.computed_at,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Write helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert a new calibration snapshot row.
 *
 * Serialises all object/array fields to JSON strings before insert.
 * Re-runs on the same Sunday produce a second row — the query layer always
 * uses ORDER BY id DESC LIMIT 1 so duplicate dates are safe.
 *
 * Layer: infrastructure — no domain imports.
 * All bindings are parameterized.
 *
 * @returns The new row's auto-increment id (always > 0).
 */
export function insertCalibrationSnapshot(
  db: Database,
  input: CalibrationSnapshotInput,
): number {
  const result = db
    .prepare(
      `INSERT INTO calibration_snapshots
         (snapshot_date, total_resolved, avg_brier_score,
          avg_brier_by_agent, avg_brier_by_stock, avg_brier_by_direction,
          calibration_curve, trend_delta, top_predictions, worst_predictions,
          computed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.snapshot_date,
      input.total_resolved,
      input.avg_brier_score,
      JSON.stringify(input.avg_brier_by_agent),
      JSON.stringify(input.avg_brier_by_stock),
      JSON.stringify(input.avg_brier_by_direction),
      JSON.stringify(input.calibration_curve),
      input.trend_delta,
      JSON.stringify(input.top_predictions),
      JSON.stringify(input.worst_predictions),
      input.computed_at,
    );

  return result.lastInsertRowid as number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Read helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return the latest calibration snapshot (highest id).
 *
 * Returns null if the table is empty (no runs yet).
 * JSON columns are parsed back to objects/arrays before return.
 */
export function getLatestCalibrationSnapshot(
  db: Database,
): CalibrationSnapshotRow | null {
  const row = db
    .prepare(
      `SELECT * FROM calibration_snapshots
       ORDER BY id DESC
       LIMIT 1`,
    )
    .get() as CalibrationSnapshotDbRow | null;

  return row ? parseRow(row) : null;
}

/**
 * Return the calibration snapshot for a specific date.
 *
 * Uses ORDER BY id DESC LIMIT 1 on snapshot_date — returns the latest run
 * for that date (handles re-runs on the same Sunday).
 * Returns null if no snapshot exists for the given date.
 *
 * The `date` parameter is bound as a SQL parameter — never concatenated.
 *
 * @param date - ISO date YYYY-MM-DD
 */
export function getCalibrationSnapshotByDate(
  db: Database,
  date: string,
): CalibrationSnapshotRow | null {
  const row = db
    .prepare(
      `SELECT * FROM calibration_snapshots
       WHERE snapshot_date = ?
       ORDER BY id DESC
       LIMIT 1`,
    )
    .get(date) as CalibrationSnapshotDbRow | null;

  return row ? parseRow(row) : null;
}

/**
 * Return the most recent snapshot whose snapshot_date is strictly before
 * the given date (exclusive upper bound).
 *
 * Used by calibrationReportJob to compute trend_delta:
 *   trend_delta = this_run_avg_brier - prev_snapshot.avg_brier_score
 *
 * Returns null if no prior snapshot exists.
 *
 * @param beforeDate - ISO date YYYY-MM-DD (exclusive upper bound)
 */
export function getPreviousCalibrationSnapshot(
  db: Database,
  beforeDate: string,
): CalibrationSnapshotRow | null {
  const row = db
    .prepare(
      `SELECT * FROM calibration_snapshots
       WHERE snapshot_date < ?
       ORDER BY snapshot_date DESC, id DESC
       LIMIT 1`,
    )
    .get(beforeDate) as CalibrationSnapshotDbRow | null;

  return row ? parseRow(row) : null;
}
