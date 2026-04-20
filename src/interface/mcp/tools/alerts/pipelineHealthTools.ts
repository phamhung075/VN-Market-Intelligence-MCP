/**
 * Pipeline Health MCP Tool — Task 1367
 *
 * Interface layer: registers the `get_pipeline_health` MCP tool.
 *
 * Tool registered:
 *   1. get_pipeline_health — queries daily_ohlcv row counts per ticker,
 *      checks TA readiness (rows >= 8), runs RSI signals, returns
 *      backfill queue status and total non-neutral signal count.
 *
 * @module interface/mcp/tools/pipelineHealthTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Database } from "bun:sqlite";
import { logger } from "../../../../infrastructure/logger.js";
import { getOhlcvPipelineHealth } from "../../../../application/usecases/getOhlcvPipelineHealth.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — formatting
// ─────────────────────────────────────────────────────────────────────────────

function formatPipelineHealth(
  result: Awaited<ReturnType<typeof getOhlcvPipelineHealth>>,
): string {
  const lines: string[] = [];

  lines.push(`[Pipeline Health] Generated: ${result.generatedAt}`);
  if (result.aggregatorLastRun) {
    lines.push(`Aggregator last run: ${result.aggregatorLastRun}`);
  }
  lines.push(`Backfill queue pending: ${result.backfillQueue.pending}`);
  if (result.backfillQueue.lastRequestedAt) {
    lines.push(`  Last requested at: ${result.backfillQueue.lastRequestedAt}`);
  }
  if (result.backfillQueue.lastCompletedAt) {
    lines.push(`  Last completed at: ${result.backfillQueue.lastCompletedAt}`);
  }
  lines.push(`Non-neutral TA signals: ${result.taSummaryCount}`);
  lines.push("");
  lines.push("Ticker Health:");

  for (const t of result.tickerStatus) {
    const taStr = t.taReady ? "TA ready" : "TA not ready";
    const signalStr = t.taSignal ? ` | signal=${t.taSignal}` : "";
    const rsiStr = t.rsi14 !== undefined ? ` | RSI14=${t.rsi14.toFixed(1)}` : "";
    lines.push(`  ${t.code}: rows=${t.ohlcvRows} | ${taStr}${signalStr}${rsiStr}`);
  }

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the `get_pipeline_health` MCP tool.
 *
 * @param server - The McpServer instance to register tools on.
 * @param _db    - Optional Database override for testing (uses production
 *                 singleton when omitted).
 */
export function registerPipelineHealthTools(
  server: McpServer,
  _db?: Database,
): void {
  server.tool(
    "get_pipeline_health",
    "Returns per-ticker OHLCV row counts, TA readiness (rows >= 8), RSI signal, backfill queue status, and total non-neutral signal count. Use this for instant pipeline verification without waiting for the next evening report.",
    {},
    async () => {
      try {
        let db: Database;
        if (_db) {
          db = _db;
        } else {
          const { getDb } = await import("../../../../infrastructure/db/index.js");
          db = getDb();
        }

        const result = await getOhlcvPipelineHealth({ db });
        const text = formatPipelineHealth(result);

        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (err) {
        logger.error("[get_pipeline_health] Failed", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Pipeline health check failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );
}
