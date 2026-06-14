/**
 * Task 1128 — calibrationReportJob
 *
 * Weekly Sunday 13:00 UTC (20:00 VN) computation of calibration statistics
 * from resolved `prediction_claims`, stored in `calibration_snapshots`, and
 * dispatched as a Telegram digest to WORK (always) and MARKET (when data exists).
 *
 * 11-step computation:
 *   1. Query resolved prediction_claims within 90-day window
 *   2. Compute avg_brier_score (excluding NULL brier_score rows)
 *   3. Group by agent_id → avg_brier_by_agent
 *   4. Group by stock (min 3 resolved scorable claims) → avg_brier_by_stock
 *   5. Group by direction → avg_brier_by_direction
 *   6. Bucket by confidence into 10 bands → calibration_curve (empty buckets omitted)
 *   7. Fetch previous snapshot → trend_delta = thisAvg - prevAvg
 *   8. Select top 5 (lowest brier_score) and worst 5 (highest brier_score)
 *   9. insertCalibrationSnapshot
 *  10. sendCalibrationDigest
 *  11. Return CalibrationJobResult
 *
 * Layer: scheduler — may import from infrastructure and domain.
 *
 * @module scheduler/calibrationReportJob
 */

import type { Database } from "bun:sqlite";
import { logger } from "../../infrastructure/logger.js";
import {
  insertCalibrationSnapshot,
  getPreviousCalibrationSnapshot,
  type CalibrationCurveBucket,
  type PredictionSummary,
} from "../../infrastructure/db/calibrationSnapshotStore.js";
import {
  getLabelAccuracyReport,
  type LabelAccuracyRow,
} from "../../infrastructure/db/marketMessageStore.js";
import { recordJobRun } from "../../infrastructure/db/cronJobRunStore.js";
import { shouldSkipRecoveryReplay } from "../startupHelpers.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Result shape returned by runCalibrationReport */
export interface CalibrationJobResult {
  total_resolved: number;
  avg_brier_score: number | null;
  avg_brier_by_agent: Record<string, number>;
  avg_brier_by_stock: Record<string, number>;
  avg_brier_by_direction: Record<string, number | null>;
  calibration_curve: CalibrationCurveBucket[];
  trend_delta: number | null;
  top_predictions: PredictionSummary[];
  worst_predictions: PredictionSummary[];
  snapshot_id: number;
  /** Per-agent accuracy from human verdict labels on market_messages. Empty array on error or no data. */
  label_accuracy: LabelAccuracyRow[];
}

/** Injectable Telegram send functions (for testing without real HTTP) */
export interface TelegramOverrides {
  sendWork: (msg: string) => Promise<boolean>;
  sendMarket: (msg: string) => Promise<boolean>;
}

/** Raw row shape from the claims query */
interface ResolvedClaimRow {
  id: number;
  stock: string;
  agent_id: string;
  claim_text: string;
  direction: string;
  confidence: number;
  resolution_outcome: number;
  brier_score: number | null;
  resolved_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Database bootstrap helper
// ─────────────────────────────────────────────────────────────────────────────

/** Lazily import the production DB (avoids loading in tests) */
async function defaultGetDb(): Promise<Database> {
  const { getDb } = await import("../../infrastructure/db/index.js");
  return getDb();
}

// ─────────────────────────────────────────────────────────────────────────────
// Computation helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute mean of a number array. Returns null for empty arrays.
 */
function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Build per-agent average Brier scores.
 * Only claims with non-null brier_score are included.
 */
function computeAvgByAgent(
  claims: ResolvedClaimRow[],
): Record<string, number> {
  const map: Record<string, number[]> = {};
  for (const c of claims) {
    if (c.brier_score === null) continue;
    const existing = map[c.agent_id];
    if (existing) {
      existing.push(c.brier_score);
    } else {
      map[c.agent_id] = [c.brier_score];
    }
  }

  const result: Record<string, number> = {};
  for (const [agent, scores] of Object.entries(map)) {
    const avg = mean(scores);
    if (avg !== null) result[agent] = avg;
  }
  return result;
}

/**
 * Build per-stock average Brier scores.
 * Requires at least 3 resolved scorable claims per stock (min-3 filter).
 */
function computeAvgByStock(
  claims: ResolvedClaimRow[],
): Record<string, number> {
  const map: Record<string, number[]> = {};
  for (const c of claims) {
    if (c.brier_score === null) continue;
    const existing = map[c.stock];
    if (existing) {
      existing.push(c.brier_score);
    } else {
      map[c.stock] = [c.brier_score];
    }
  }

  const result: Record<string, number> = {};
  for (const [stock, scores] of Object.entries(map)) {
    if (scores.length < 3) continue; // min-3 filter
    const avg = mean(scores);
    if (avg !== null) result[stock] = avg;
  }
  return result;
}

/**
 * Build per-direction average Brier scores.
 * NULL values allowed (direction present but all brier_score=NULL).
 */
function computeAvgByDirection(
  claims: ResolvedClaimRow[],
): Record<string, number | null> {
  // Collect all unique directions from claims
  const allDirections = [...new Set(claims.map((c) => c.direction))];
  const map: Record<string, number[]> = {};

  for (const c of claims) {
    if (c.brier_score === null) continue;
    const existing = map[c.direction];
    if (existing) {
      existing.push(c.brier_score);
    } else {
      map[c.direction] = [c.brier_score];
    }
  }

  const result: Record<string, number | null> = {};
  for (const dir of allDirections) {
    const scores = map[dir] ?? [];
    result[dir] = mean(scores);
  }
  return result;
}

/**
 * Build calibration curve — 10 buckets by confidence band.
 * bucketIndex = Math.min(9, Math.floor(confidence * 10))
 * Empty buckets are omitted.
 *
 * Each bucket reports:
 *   - bucket_midpoint: 0.05, 0.15, …, 0.95
 *   - predicted_prob: same as bucket_midpoint
 *   - actual_hit_rate: fraction of claims with resolution_outcome = 1
 *   - sample_size: number of claims in this bucket
 */
function computeCalibrationCurve(
  claims: ResolvedClaimRow[],
): CalibrationCurveBucket[] {
  // Only use claims with non-null brier_score (scorable)
  const scorable = claims.filter((c) => c.brier_score !== null);

  // Accumulate by bucket
  const buckets: Array<{ total: number; correct: number }> = Array.from(
    { length: 10 },
    () => ({ total: 0, correct: 0 }),
  );

  for (const c of scorable) {
    const idx = Math.min(9, Math.floor(c.confidence * 10));
    const bucket = buckets[idx];
    if (bucket) {
      bucket.total++;
      if (c.resolution_outcome === 1) {
        bucket.correct++;
      }
    }
  }

  const curve: CalibrationCurveBucket[] = [];
  for (let i = 0; i < 10; i++) {
    const bucket = buckets[i];
    if (!bucket || bucket.total === 0) continue; // omit empty buckets
    const { total, correct } = bucket;

    const midpoint = Math.round((i * 0.1 + 0.05) * 100) / 100;
    curve.push({
      bucket_midpoint: midpoint,
      predicted_prob: midpoint,
      actual_hit_rate: correct / total,
      sample_size: total,
    });
  }
  return curve;
}

/**
 * Build top-5 predictions (lowest brier_score).
 */
function buildTopPredictions(
  claims: ResolvedClaimRow[],
): PredictionSummary[] {
  const scorable = claims
    .filter((c) => c.brier_score !== null)
    .sort((a, b) => (a.brier_score as number) - (b.brier_score as number));

  return scorable.slice(0, 5).map((c) => ({
    id: c.id,
    stock: c.stock,
    agent_id: c.agent_id,
    direction: c.direction,
    confidence: c.confidence,
    claim_text: c.claim_text,
    brier_score: c.brier_score as number,
    resolved_at: c.resolved_at,
  }));
}

/**
 * Build worst-5 predictions (highest brier_score).
 */
function buildWorstPredictions(
  claims: ResolvedClaimRow[],
): PredictionSummary[] {
  const scorable = claims
    .filter((c) => c.brier_score !== null)
    .sort((a, b) => (b.brier_score as number) - (a.brier_score as number));

  return scorable.slice(0, 5).map((c) => ({
    id: c.id,
    stock: c.stock,
    agent_id: c.agent_id,
    direction: c.direction,
    confidence: c.confidence,
    claim_text: c.claim_text,
    brier_score: c.brier_score as number,
    resolved_at: c.resolved_at,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Telegram digest
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the MARKET Telegram message for the calibration digest.
 *
 * Extracted for unit testability — pure function, no I/O.
 *
 * @param result - CalibrationJobResult from runCalibrationReport
 * @param date   - ISO date string (YYYY-MM-DD) for the report header
 */
export function buildCalibrationMarketMessage(result: CalibrationJobResult, date: string): string {
  const marketLines: string[] = [
    `BÁO CÁO CALIBRATION TUẦN ${date}`,
    `Dự đoán đã giải quyết (90 ngày): ${result.total_resolved}`,
  ];

  if (result.avg_brier_score !== null) {
    marketLines.push(`Brier Score trung bình: ${result.avg_brier_score.toFixed(4)}`);
  }

  if (result.trend_delta !== null) {
    const trend = result.trend_delta < 0 ? "cải thiện" : result.trend_delta === 0 ? "ổn định" : "xuống cấp";
    marketLines.push(`Xu hướng: ${trend} (delta ${result.trend_delta.toFixed(4)})`);
  }

  if (result.top_predictions.length > 0) {
    marketLines.push("\nDự đoán tốt nhất (Brier thấp):");
    for (const p of result.top_predictions.slice(0, 3)) {
      marketLines.push(`  ${p.stock} ${p.direction} (${p.agent_id}): ${p.brier_score.toFixed(4)}`);
    }
  }

  if (result.worst_predictions.length > 0) {
    marketLines.push("\nDự đoán kém nhất (Brier cao):");
    for (const p of result.worst_predictions.slice(0, 3)) {
      marketLines.push(`  ${p.stock} ${p.direction} (${p.agent_id}): ${p.brier_score.toFixed(4)}`);
    }
  }

  return marketLines.join("\n");
}

/**
 * Format and dispatch the calibration digest.
 *
 * WORK channel: always sent (even when total_resolved = 0).
 * MARKET channel: sent only when total_resolved >= 1.
 *
 * Both sends are wrapped in try-catch — Telegram failures are non-fatal (warn only).
 * Dynamic import of sendTelegramWork / sendTelegramMarket (production) or injected
 * overrides (tests).
 */
async function sendCalibrationDigest(
  result: CalibrationJobResult,
  telegramOverrides?: TelegramOverrides,
): Promise<void> {
  const date = new Date().toISOString().slice(0, 10);

  // ── Build WORK message ────────────────────────────────────────────────────
  const workLines: string[] = [
    `CALIBRATION REPORT ${date}`,
    `Total resolved (90 ngay): ${result.total_resolved}`,
  ];

  if (result.avg_brier_score !== null) {
    workLines.push(`Avg Brier Score: ${result.avg_brier_score.toFixed(4)}`);
  } else {
    workLines.push("Avg Brier Score: N/A");
  }

  if (result.trend_delta !== null) {
    const sign = result.trend_delta < 0 ? "" : "+";
    const trend = result.trend_delta < 0 ? "improving" : result.trend_delta === 0 ? "stable" : "degrading";
    workLines.push(`Trend: ${trend} (delta ${sign}${result.trend_delta.toFixed(4)})`);
  } else {
    workLines.push("Trend: N/A (first run)");
  }

  const agentKeys = Object.keys(result.avg_brier_by_agent);
  if (agentKeys.length > 0) {
    workLines.push("\nPer-agent Brier:");
    for (const agentId of agentKeys.slice(0, 5)) {
      const score = result.avg_brier_by_agent[agentId];
      workLines.push(`  ${agentId}: ${score !== undefined ? score.toFixed(4) : "N/A"}`);
    }
  }

  workLines.push("\nLabel Accuracy (90 ngay, human labels):");
  if (result.label_accuracy.length === 0) {
    workLines.push("  (no label data yet)");
  } else {
    for (const row of result.label_accuracy) {
      const pct = row.signal_rate !== null
        ? (row.signal_rate * 100).toFixed(1)
        : "0.0";
      workLines.push(`  ${row.from_agent}: ${row.signal_count}/${row.total_reviewed} signal (${pct}%)`);
    }
  }

  const workMsg = workLines.join("\n");

  // ── Build MARKET message ──────────────────────────────────────────────────
  const marketMsg = buildCalibrationMarketMessage(result, date);

  // ── Resolve send functions ────────────────────────────────────────────────
  const sendWork =
    telegramOverrides?.sendWork ??
    (async (msg: string) => {
      const { sendTelegramWork } = await import(
        "../../infrastructure/notifiers/telegram.js"
      );
      return sendTelegramWork(msg);
    });

  const sendMarket =
    telegramOverrides?.sendMarket ??
    (async (msg: string) => {
      const { sendTelegramMarket } = await import(
        "../../infrastructure/notifiers/telegram.js"
      );
      return sendTelegramMarket(msg, {
        persist: { from_agent: "calibration-report", message_type: "calibration_report" },
      });
    });

  // ── WORK channel (always) ─────────────────────────────────────────────────
  try {
    await sendWork(workMsg);
    logger.info("[calibrationReportJob] Telegram WORK sent");
  } catch (err) {
    logger.warn("[calibrationReportJob] Telegram WORK send failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ── MARKET channel (only when data exists) ────────────────────────────────
  if (result.total_resolved >= 1) {
    try {
      await sendMarket(marketMsg);
      logger.info("[calibrationReportJob] Telegram MARKET sent");
    } catch (err) {
      logger.warn("[calibrationReportJob] Telegram MARKET send failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } else {
    logger.info("[calibrationReportJob] total_resolved=0 — skipping MARKET send");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main computation function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the weekly calibration report computation.
 *
 * Accepts an optional `db` parameter for tests (avoids importing the real DB).
 * Accepts optional `telegramOverrides` for tests (avoids real HTTP calls).
 *
 * @param db                - Optional injected database (uses production DB if omitted)
 * @param telegramOverrides - Optional injected send functions (uses real Telegram if omitted)
 * @returns CalibrationJobResult with all computed statistics
 */
export async function runCalibrationReport(
  db?: Database,
  telegramOverrides?: TelegramOverrides,
): Promise<CalibrationJobResult> {
  const database = db ?? (await defaultGetDb());

  // ── Step 1: Query resolved prediction_claims within 90-day window ─────────
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 90);
  const cutoff = cutoffDate.toISOString();

  const claims = database
    .prepare(
      `SELECT id, stock, agent_id, claim_text, direction, confidence,
              resolution_outcome, brier_score, resolved_at
       FROM prediction_claims
       WHERE resolution_outcome IS NOT NULL
         AND resolved_at >= ?
       ORDER BY resolved_at DESC`,
    )
    .all(cutoff) as ResolvedClaimRow[];

  const totalResolved = claims.length;

  // ── Step 2: Overall avg_brier_score ────────────────────────────────────────
  const scorableScores = claims
    .filter((c) => c.brier_score !== null)
    .map((c) => c.brier_score as number);
  const avgBrierScore = mean(scorableScores);

  // ── Step 3: Per-agent averages ────────────────────────────────────────────
  const avgBrierByAgent = computeAvgByAgent(claims);

  // ── Step 3.5: Per-agent label accuracy (human verdicts) ───────────────────
  let labelAccuracy: LabelAccuracyRow[] = [];
  try {
    labelAccuracy = getLabelAccuracyReport(database, 90);
  } catch (err) {
    logger.warn("[calibrationReportJob] getLabelAccuracyReport failed — using empty", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ── Step 4: Per-stock averages (min 3 claims) ─────────────────────────────
  const avgBrierByStock = computeAvgByStock(claims);

  // ── Step 5: Per-direction averages ────────────────────────────────────────
  const avgBrierByDirection = computeAvgByDirection(claims);

  // ── Step 6: Calibration curve ────────────────────────────────────────────
  const calibrationCurve = computeCalibrationCurve(claims);

  // ── Step 7: Trend delta vs previous snapshot ──────────────────────────────
  const todayStr = new Date().toISOString().slice(0, 10);
  const prevSnapshot = getPreviousCalibrationSnapshot(database, todayStr);

  let trendDelta: number | null = null;
  if (avgBrierScore !== null && prevSnapshot?.avg_brier_score !== null && prevSnapshot?.avg_brier_score !== undefined) {
    trendDelta = avgBrierScore - prevSnapshot.avg_brier_score;
  }

  // ── Step 8: Top 5 and worst 5 predictions ─────────────────────────────────
  const topPredictions = buildTopPredictions(claims);
  const worstPredictions = buildWorstPredictions(claims);

  // ── Step 9: Insert snapshot ───────────────────────────────────────────────
  const computedAt = new Date().toISOString();
  const snapshotId = insertCalibrationSnapshot(database, {
    snapshot_date: todayStr,
    total_resolved: totalResolved,
    avg_brier_score: avgBrierScore,
    avg_brier_by_agent: avgBrierByAgent,
    avg_brier_by_stock: avgBrierByStock,
    avg_brier_by_direction: avgBrierByDirection,
    calibration_curve: calibrationCurve,
    trend_delta: trendDelta,
    top_predictions: topPredictions,
    worst_predictions: worstPredictions,
    computed_at: computedAt,
  });

  logger.info(
    `[calibrationReportJob] snapshot inserted — id=${snapshotId} total=${totalResolved} avg_brier=${avgBrierScore}`,
  );

  const jobResult: CalibrationJobResult = {
    total_resolved: totalResolved,
    avg_brier_score: avgBrierScore,
    avg_brier_by_agent: avgBrierByAgent,
    avg_brier_by_stock: avgBrierByStock,
    avg_brier_by_direction: avgBrierByDirection,
    calibration_curve: calibrationCurve,
    trend_delta: trendDelta,
    top_predictions: topPredictions,
    worst_predictions: worstPredictions,
    snapshot_id: snapshotId,
    label_accuracy: labelAccuracy,
  };

  // ── Step 10: Send Telegram digest ─────────────────────────────────────────
  await sendCalibrationDigest(jobResult, telegramOverrides);

  // ── Step 11: Return result ────────────────────────────────────────────────
  return jobResult;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cron-callable wrapper with recordJobRun observability
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cron-callable wrapper for the calibration report job.
 *
 * Wraps `runCalibrationReport` in `recordJobRun` for observability:
 * success/failure tracked in `cron_job_runs`, duration logged.
 *
 * Used by `jobs.ts` cron registration (Sunday 13:00 UTC = 20:00 VN).
 *
 * @idempotency T4 — cron_job_runs recency guard; replay skipped if last success < 90% of weekly cadence (604.8s window = 6 days 1h12m)
 */
export async function runCalibrationReportJob(): Promise<void> {
  const database = await defaultGetDb();

  const WEEKLY_CADENCE_MS = 604_800_000;
  if (shouldSkipRecoveryReplay(database, "calibrationReportJob", WEEKLY_CADENCE_MS)) return;

  await recordJobRun(database, "calibrationReportJob", async () => {
    const result = await runCalibrationReport(database);
    return { rowsWritten: result.total_resolved };
  });
}
