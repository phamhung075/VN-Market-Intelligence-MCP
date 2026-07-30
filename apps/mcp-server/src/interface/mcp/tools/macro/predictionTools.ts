/**
 * Task 168 — Prediction Markets MCP Tool
 *
 * Interface layer: registers MCP tool(s) on a McpServer instance.
 *
 * Tools registered:
 *   1. get_prediction_accuracy — retrospective accuracy metrics for
 *      previously-detected Polymarket prediction signals.
 *
 * get_prediction_markets (live-fetch query tool) was deregistered here by
 * FIX-POLYMARKET-FETCH-DEAD-GEOBLOCK-ACTUATOR (2026-07-31, architect RULING:
 * RETIRE). gamma-api.polymarket.com is blocked at the ISP level by France's
 * ANJ gambling regulator (rigged markets + zero KYC finding) — a
 * sovereign-regulator block, not a generic anti-scraper geoblock — so the
 * acquisition plane was deliberately killed (predictionMarkets.enabled now
 * defaults to false), not proxied. get_prediction_accuracy is UNAFFECTED —
 * it reads historical prediction_signals rows already on disk, not a live
 * fetch, and stays useful even while acquisition is off.
 *
 * @module interface/mcp/tools/predictionTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getDb, initDatabase } from "../../../../infrastructure/db/schema.js";
import {
  computePredictionAccuracy,
  type PredictionAccuracyRow,
} from "../../../../scheduler/macro/predictionOutcomeJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Accuracy formatter (exported for testability — task 1411)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format prediction accuracy rows as plain Vietnamese text.
 *
 * @param rows - Empty → no-data message; non-empty → table
 * @param days - Lookback window echoed in header
 */
export function formatPredictionAccuracy(
  rows: PredictionAccuracyRow[],
  days: number,
): string {
  if (rows.length === 0) {
    return (
      `Không có dữ liệu kết quả tín hiệu dự báo trong ${days} ngày qua.\n` +
      `(Việc xác thực kết quả được chạy tự động hàng tuần vào Chủ nhật 08:00 UTC.)`
    );
  }

  const header =
    `Độ chính xác tín hiệu Polymarket (${days} ngày qua)\n` +
    `${"─".repeat(60)}\n`;

  const lines = rows.map((r) => {
    const pctStr = (r.precision * 100).toFixed(1);
    return (
      `Loại: ${r.signalType}\n` +
      `  Tổng số: ${r.total}  |  Xác nhận: ${r.confirmed}  |  Sai: ${r.falsePositive}  |  Trung tính: ${r.neutral}\n` +
      `  Độ chính xác: ${pctStr}%`
    );
  });

  const overall = rows.reduce(
    (acc, r) => { acc.total += r.total; acc.confirmed += r.confirmed; acc.falsePositive += r.falsePositive; return acc; },
    { total: 0, confirmed: 0, falsePositive: 0 },
  );
  const overallDecided = overall.confirmed + overall.falsePositive;
  const overallPrecision =
    overallDecided > 0 ? ((overall.confirmed / overallDecided) * 100).toFixed(1) : "N/A";

  const footer =
    `${"─".repeat(60)}\n` +
    `Tổng hợp: ${overall.total} kết quả | ` +
    `Xác nhận: ${overall.confirmed} | ` +
    `Sai: ${overall.falsePositive} | ` +
    `Độ chính xác tổng: ${overallPrecision}%`;

  return header + lines.join("\n\n") + "\n\n" + footer;
}

/**
 * Register the prediction markets tool on an McpServer instance.
 *
 * @param server - The McpServer instance to register tools on.
 */
export function registerPredictionTools(server: McpServer): void {

  // ── get_prediction_accuracy ──────────────────────────────────────────────
  server.tool(
    "get_prediction_accuracy",
    "Computed from Polymarket prediction signals only (predictionOutcomeJob). " +
      "Measures precision = confirmed/(confirmed+false_positive) for volume_spike/ " +
      "probability_shift signals vs ±2% price moves. Distinct from get_calibration_report " +
      "(Brier/machine accuracy) and get_label_accuracy_report (human-labelled quality). " +
      "Returns retrospective accuracy metrics for Polymarket prediction signals — " +
      "how often volume_spike or probability_shift signals actually predicted VN stock moves. " +
      "Outcomes are validated weekly by comparing signal direction against ±2% price moves in the 48h window.",
    {
      days: z.coerce
        .number()
        .int()
        .min(1)
        .max(365)
        .optional()
        .default(30)
        .describe("Rolling lookback window in days (default: 30, max: 365)"),
    },
    async ({ days: daysRaw }) => {
      const days = daysRaw ?? 30;

      try {
        await initDatabase();
        const db = getDb();

        const rows = computePredictionAccuracy(db, days);

        const text = formatPredictionAccuracy(rows, days);
        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (err) {
        console.error("[get_prediction_accuracy] Error:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Lỗi khi tính độ chính xác: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );
}
