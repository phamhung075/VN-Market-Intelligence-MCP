/**
 * Task 1129 — get_calibration_report MCP tool
 *
 * Provides the `get_calibration_report` tool for reading weekly calibration
 * snapshots from the prediction engine.
 *
 * DDD layer invariant: imports only from infrastructure/db — never from domain/.
 * All computation lives in calibrationReportJob (scheduler layer).
 * This file reads pre-computed snapshots and formats them for output.
 *
 * @module interface/mcp/tools/calibrationTools
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Database } from "bun:sqlite";
import { z } from "zod";
import {
  getLatestCalibrationSnapshot,
  getCalibrationSnapshotByDate,
  type CalibrationSnapshotRow,
  type CalibrationCurveBucket,
  type PredictionSummary,
} from "../../../../infrastructure/db/calibrationSnapshotStore.js";
import {
  getLabelAccuracyReport,
  type LabelAccuracyRow,
} from "../../../../infrastructure/db/marketMessageStore.js";
import { getDb } from "../../../../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returned when the calibration_snapshots table is empty or the requested
 * date has no snapshot. Matches the spec in TECH-060 FR-3 (AC-5).
 */
const NO_DATA_MESSAGE =
  "No calibration data available yet. Prediction claims are being accumulated and will appear after\n" +
  "the first resolution cycle completes (resolution_date + predictionResolutionJob run).\n" +
  "Check back next Sunday.";

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive trend label + delta string from trend_delta.
 * Returns empty string when trend_delta is null (first-run case).
 */
function trendLabel(delta: number | null): string {
  if (delta === null) return "";
  if (delta < -0.01) return `improving (${delta.toFixed(3)} vs last week)`;
  if (delta > 0.01) return `degrading (+${delta.toFixed(3)} vs last week)`;
  return `stable (${delta.toFixed(3)} vs last week)`;
}

/**
 * Format the full calibration report text block.
 * Called when total_resolved >= 1 and avg_brier_score is available.
 */
function formatFullReport(snapshot: CalibrationSnapshotRow): string {
  const lines: string[] = [];

  // Header
  lines.push(`Calibration Report — ${snapshot.snapshot_date}`);
  lines.push(`Computed at: ${snapshot.computed_at}`);
  lines.push("");

  // Overall Brier Score
  lines.push("Overall Brier Score");
  lines.push(
    `  Score: ${snapshot.avg_brier_score !== null ? snapshot.avg_brier_score.toFixed(4) : "n/a"} / 1.0 (lower = better)`,
  );
  lines.push(`  Resolved predictions (90-day window): ${snapshot.total_resolved}`);

  // Trend (only when trend_delta is not null)
  const trend = trendLabel(snapshot.trend_delta);
  if (trend) {
    lines.push(`  Trend: ${trend}`);
  }
  lines.push("");

  // Direction Breakdown
  lines.push("Direction Breakdown");
  const dir = snapshot.avg_brier_by_direction;
  const bullish = dir["bullish"] !== undefined && dir["bullish"] !== null
    ? dir["bullish"].toFixed(4)
    : "n/a";
  const bearish = dir["bearish"] !== undefined && dir["bearish"] !== null
    ? dir["bearish"].toFixed(4)
    : "n/a";
  const neutral = dir["neutral"] !== undefined && dir["neutral"] !== null
    ? dir["neutral"].toFixed(4)
    : "n/a";
  lines.push(`  bullish:  ${bullish}`);
  lines.push(`  bearish:  ${bearish}`);
  lines.push(`  neutral:  ${neutral}`);
  lines.push("");

  // Per-stock breakdown (already min-3 filtered at compute time)
  const stockEntries = Object.entries(snapshot.avg_brier_by_stock);
  if (stockEntries.length > 0) {
    lines.push("Per-Stock Brier Score (min 3 resolved)");
    for (const [stock, score] of stockEntries) {
      lines.push(`  ${stock}: ${score.toFixed(4)}`);
    }
    lines.push("");
  }

  // Per-agent breakdown
  const agentEntries = Object.entries(snapshot.avg_brier_by_agent);
  if (agentEntries.length > 0) {
    lines.push("Per-Agent Brier Score");
    for (const [agent, score] of agentEntries) {
      lines.push(`  ${agent}: ${score.toFixed(4)}`);
    }
    lines.push("");
  }

  // Calibration Curve
  const curve: CalibrationCurveBucket[] = snapshot.calibration_curve;
  if (curve.length > 0) {
    lines.push("Calibration Curve (predicted probability vs actual hit rate)");
    for (const bucket of curve) {
      const pp = Math.round(bucket.predicted_prob * 100);
      const ar = (bucket.actual_hit_rate * 100).toFixed(1);
      lines.push(
        `  ${pp}% confidence → ${ar}% actual hit rate (n=${bucket.sample_size})`,
      );
    }

    // Calibration notes: flag buckets with |actual_hit_rate - predicted_prob| > 0.15
    for (const bucket of curve) {
      const deviation = Math.abs(bucket.actual_hit_rate - bucket.predicted_prob);
      if (deviation > 0.15) {
        const overUnder = bucket.actual_hit_rate > bucket.predicted_prob ? "under" : "over";
        const pp = Math.round(bucket.bucket_midpoint * 100);
        const predicted = Math.round(bucket.predicted_prob * 100);
        const actual = (bucket.actual_hit_rate * 100).toFixed(1);
        lines.push(
          `  Note: ${pp}% bucket shows ${overUnder}-confidence — ` +
            `predicted ${predicted}% but actual hit rate was ${actual}%.`,
        );
      }
    }
    lines.push("");
  }

  // Top Predictions (best = lowest brier_score)
  const top: PredictionSummary[] = snapshot.top_predictions;
  if (top.length > 0) {
    lines.push("Top Predictions (best accuracy, lowest Brier score)");
    for (const p of top) {
      lines.push(
        `  [id=${p.id}] ${p.stock} ${p.direction}: ` +
          `confidence=${(p.confidence * 100).toFixed(0)}% → ` +
          `score=${p.brier_score.toFixed(4)} (resolved ${p.resolved_at})`,
      );
    }
    lines.push("");
  }

  // Worst Predictions (highest brier_score)
  const worst: PredictionSummary[] = snapshot.worst_predictions;
  if (worst.length > 0) {
    lines.push("Worst Predictions (worst accuracy, highest Brier score)");
    for (const p of worst) {
      lines.push(
        `  [id=${p.id}] ${p.stock} ${p.direction}: ` +
          `confidence=${(p.confidence * 100).toFixed(0)}% → ` +
          `score=${p.brier_score.toFixed(4)} (resolved ${p.resolved_at})`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Label accuracy report handler (exported for testability)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format label accuracy report for a non-empty result set.
 * Column alignment: Agent padEnd(22), Reviewed padStart(8), Signal padStart(6),
 * Noise padStart(5), Signal% padStart(7), Last reviewed ISO timestamp.
 *
 * @param rows       - Per-agent rows from getLabelAccuracyReport
 * @param since_days - Lookback window used, echoed in header
 */
function formatLabelAccuracyReport(rows: LabelAccuracyRow[], since_days: number): string {
  const lines: string[] = [];

  lines.push(`Label Accuracy Report — ${since_days} ngày gần nhất`);
  lines.push("=========================================");
  lines.push("");
  lines.push(
    "Agent                  Reviewed  Signal  Noise   Signal%   Last reviewed",
  );
  lines.push(
    "--------------------   --------  ------  -----   -------   -------------------------",
  );

  for (const row of rows) {
    const pct =
      row.signal_rate !== null
        ? (row.signal_rate * 100).toFixed(1) + "%"
        : "0.0%";
    const lastReviewed = row.last_reviewed_at ?? "—";
    lines.push(
      `${row.from_agent.padEnd(22)}  ${String(row.total_reviewed).padStart(8)}  ${String(row.signal_count).padStart(6)}  ${String(row.noise_count).padStart(5)}  ${pct.padStart(7)}  ${lastReviewed}`,
    );
  }

  lines.push("");
  lines.push("-----------------------------------------");
  const totalReviewed = rows.reduce((s, r) => s + r.total_reviewed, 0);
  lines.push(`Tổng: ${rows.length} agents, ${totalReviewed} tin đã review.`);
  lines.push(
    "Sử dụng get_calibration_report để xem Brier score từ prediction_claims.",
  );

  return lines.join("\n");
}

/**
 * Handle the get_label_accuracy_report MCP tool call.
 * Exported separately for testability.
 *
 * @param db         - SQLite database instance (injected or resolved via getDb)
 * @param since_days - Lookback window in calendar days (1-365, default 90)
 */
export async function handleGetLabelAccuracyReport(
  db: Database,
  since_days?: number,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const days = since_days ?? 90;
  try {
    const rows = getLabelAccuracyReport(db, days);

    if (rows.length === 0) {
      const text =
        `Không có tin nhắn đã review trong ${days} ngày qua.\n` +
        "Hãy sử dụng batch_review_market_messages để đánh giá tin nhắn.";
      return { content: [{ type: "text" as const, text }] };
    }

    const text = formatLabelAccuracyReport(rows, days);
    return { content: [{ type: "text" as const, text }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[get_label_accuracy_report] Error:", msg);
    return {
      content: [
        {
          type: "text" as const,
          text: `Error retrieving label accuracy report: ${msg}`,
        },
      ],
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the get_calibration_report tool on an McpServer instance.
 *
 * @param server - The McpServer instance to register tools on.
 * @param db     - Optional database injection (defaults to getDb() for production).
 */
export function registerCalibrationTools(
  server: McpServer,
  db?: Database,
): void {
  const resolveDb = () => db ?? getDb();

  server.tool(
    "get_calibration_report",
    "Reads from calibration_snapshots table (SQLite). Machine-computed Brier score — " +
      "measures how well probability estimates match actual outcomes. Weekly snapshot. " +
      "Distinct from get_label_accuracy_report (human-labelled signal quality) and " +
      "get_prediction_accuracy (Polymarket signal precision). " +
      "Returns the latest weekly calibration report for the prediction engine. " +
      "Shows overall Brier score, breakdown by agent/stock/direction, calibration curve " +
      "(predicted probability vs actual hit rate), trend vs last week, and top/worst predictions. " +
      "Data is at most 7 days stale (written weekly Sunday 20:00 VN). " +
      "If no snapshots exist yet (first 1-2 weeks after Phase C deploy), returns a clear message. " +
      "Pass date= to retrieve a specific Sunday's historical report.",
    {
      date: z
        .string()
        .optional()
        .describe(
          "Optional ISO date YYYY-MM-DD of a specific Sunday's report. Omit for latest.",
        ),
    },
    async ({ date }) => {
      try {
        const database = resolveDb();

        // Step 1: fetch snapshot
        const snapshot = date
          ? getCalibrationSnapshotByDate(database, date)
          : getLatestCalibrationSnapshot(database);

        // Step 2: null → no-data message (AC-5)
        if (snapshot === null) {
          return {
            content: [{ type: "text" as const, text: NO_DATA_MESSAGE }],
          };
        }

        // Step 3: total_resolved=0 → no-resolved message
        if (snapshot.total_resolved === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text:
                  `No resolved predictions yet as of ${snapshot.snapshot_date}. ` +
                  "Predictions are being accumulated and will appear after the first resolution cycle completes.",
              },
            ],
          };
        }

        // Step 4: full formatted report (AC-6)
        const report = formatFullReport(snapshot);
        return {
          content: [{ type: "text" as const, text: report }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[get_calibration_report] Error:", msg);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error retrieving calibration report: ${msg}`,
            },
          ],
        };
      }
    },
  );

  server.tool(
    "get_label_accuracy_report",
    "Reads from market_messages table (SQLite). Human-labelled signal quality — " +
      "counts operator 'signal' vs 'noise' verdicts per agent. Distinct from " +
      "get_calibration_report (Brier/machine accuracy) and get_prediction_accuracy " +
      "(Polymarket signal precision). " +
      "Returns per-agent signal accuracy computed from human verdict labels on MARKET channel messages. " +
      "Each row shows how often an agent's messages were labelled 'signal' vs 'noise' by the user. " +
      "Use this alongside get_calibration_report to understand which agents generate genuine signals. " +
      "since_days controls the lookback window (default 90 days, matching the calibration engine window).",
    {
      since_days: z.coerce
        .number()
        .int()
        .min(1)
        .max(365)
        .default(90)
        .optional()
        .describe("Lookback window in calendar days (1-365, default 90)"),
    },
    async ({ since_days }) => {
      return handleGetLabelAccuracyReport(resolveDb(), since_days);
    },
  );
}
