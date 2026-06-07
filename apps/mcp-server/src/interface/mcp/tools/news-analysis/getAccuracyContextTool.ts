/**
 * getAccuracyContextTool.ts — get_accuracy_context MCP tool (2026-05-17)
 *
 * Returns a calibration text blob for cowork agents to adjust confidence
 * scores based on historical accuracy of prior signals for a stock/signal_type.
 *
 * Input:  { stock_code: string, signal_types?: string[] }
 * Output: { accuracy_rate: number|null, sample_count: number, message: string }
 *
 * @module interface/mcp/tools/news-analysis/getAccuracyContextTool
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb } from "../../../../infrastructure/db/schema.js";
import { getAccuracyStats } from "../../../../infrastructure/db/signalOutcomeStore.js";

// ── Input schema ────────────────────────────────────────────────────────────

const GetAccuracyContextSchema = z.object({
  stock_code: z.string().min(1).describe("Stock code to query accuracy for (e.g. VNM, VCB)"),
  signal_types: z
    .array(z.string())
    .optional()
    .describe("Filter by specific signal types. Omit to aggregate all types."),
});

// ── Calibration message builder ─────────────────────────────────────────────

function buildCalibrationNudge(
  stockCode: string,
  rows: ReturnType<typeof getAccuracyStats>,
  requestedTypes?: string[],
): string {
  if (rows.length === 0) {
    const typeHint = requestedTypes?.length
      ? ` for [${requestedTypes.join(", ")}]`
      : "";
    return `No accuracy history available for ${stockCode}${typeHint} (minimum 3 resolved signals required).`;
  }

  const lines: string[] = [`Accuracy history for ${stockCode}:`];

  for (const row of rows) {
    const rate = row.accuracy_rate;
    if (rate === null) {
      lines.push(`  - ${row.signal_type}: insufficient data (${row.sample_count} samples, need 3)`);
      continue;
    }

    const pct = Math.round(rate * 100);
    const correct = Math.round(rate * row.sample_count);
    let nudge: string;

    if (rate < 0.40) {
      nudge = "→ LOWER confidence by 20% (below threshold)";
    } else if (rate > 0.70) {
      nudge = "→ MAY increase confidence by 10%";
    } else {
      nudge = "→ no adjustment (within normal range)";
    }

    lines.push(
      `  - ${row.signal_type}: ${correct}/${row.sample_count} (${pct}%) in last 30 days ${nudge}`,
    );
  }

  lines.push("(minimum 3 samples required for accuracy rate; 0 samples = no adjustment)");
  return lines.join("\n");
}

// ── Tool registration ───────────────────────────────────────────────────────

/**
 * Registers get_accuracy_context MCP tool.
 *
 * DEREGISTER: get_accuracy_context removed (U3 TOOL-SURFACE-UPGRADE).
 * Reads RAG analysis context only (no live stream). Zero claims across 4 layers.
 * get_calibration_report covers the use case with Brier-score precision.
 * Handler logic retained for potential future re-registration.
 */
export function registerGetAccuracyContextTool(_server: McpServer): void {
  // Tool deregistered: get_accuracy_context — TOOL-SURFACE-UPGRADE U3
  // Superseded by get_calibration_report for accuracy/calibration queries.
  void _server; // explicit unused-param acknowledgement
}
