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
 * Returns a calibration text blob used by cowork agents at cycle start.
 */
export function registerGetAccuracyContextTool(server: McpServer): void {
  server.tool(
    "get_accuracy_context",
    "Get historical signal accuracy stats for a stock to calibrate confidence scores. " +
    "Returns a calibration nudge text: LOWER confidence by 20% when accuracy < 40%, " +
    "MAY increase by 10% when > 70%, no adjustment otherwise. " +
    "Minimum 3 resolved signals required for any rate to appear.",
    GetAccuracyContextSchema.shape,
    async (params) => {
      const { stock_code, signal_types } = params;
      const db = getDb();

      let rows = getAccuracyStats(db, { stockCode: stock_code, days: 30 });

      // Filter to requested signal types if provided
      if (signal_types && signal_types.length > 0) {
        rows = rows.filter((r) => signal_types.includes(r.signal_type));
      }

      const message = buildCalibrationNudge(stock_code, rows, signal_types);

      // Return summary stats + message
      // When multiple types requested, aggregate across all rows for the top-level fields
      const totalSamples = rows.reduce((sum, r) => sum + r.sample_count, 0);
      const qualifiedRows = rows.filter((r) => r.accuracy_rate !== null);
      const overallRate =
        qualifiedRows.length > 0
          ? qualifiedRows.reduce((sum, r) => sum + (r.accuracy_rate ?? 0), 0) /
            qualifiedRows.length
          : null;

      const result = {
        stock_code,
        signal_types: signal_types ?? null,
        accuracy_rate: overallRate !== null ? Math.round(overallRate * 100) / 100 : null,
        sample_count: totalSamples,
        breakdown: rows.map((r) => ({
          signal_type: r.signal_type,
          accuracy_rate: r.accuracy_rate,
          sample_count: r.sample_count,
        })),
        message,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
