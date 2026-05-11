/**
 * MCP Tool: run_bctc_batch_sweep
 *
 * Triggers a BCTC batch sweep for all 30 watchlist tickers (or a custom list).
 * Designed for use during Vietnamese earnings seasons (Jan, Apr, Jul, Oct).
 *
 * Parameters:
 *   tickers  — optional string array override; defaults to all 30 watchlist tickers
 *   dry_run  — if true, returns plan without calling get_bctc_full or sending Telegram
 *
 * Returns:
 *   { processed, succeeded, failed, failures: [{ticker, reason}], digestSent, durationMs }
 *
 * Task 1841b — U-10
 *
 * @module interface/mcp/tools/financial-reports/bctcBatchSweepTool
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runBctcBatchSweep } from "../../../../scheduler/financial-reports/bctcBatchSweepJob.js";

export function registerBctcBatchSweepTool(server: McpServer): void {
  server.tool(
    "run_bctc_batch_sweep",
    "Trigger a BCTC quarterly report batch sweep for all watchlist tickers (default: 30). " +
      "Fetches BCTC data for each ticker concurrently (max 5 at a time). " +
      "Per-ticker failures are isolated — one failure does not abort the batch. " +
      "Sends a completion digest to the MARKET channel and individual failure alerts to BUG channel. " +
      "Use dry_run=true to preview the ticker list without triggering any fetches. " +
      "Returns: { processed, succeeded, failed, failures: [{ticker, reason}], digestSent, durationMs }",
    {
      tickers: z
        .array(z.string().min(1).max(10))
        .optional()
        .describe(
          "Optional ticker override list. Omit to use all 30 watchlist tickers from stock-classification.json.",
        ),
      dry_run: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "If true, returns ticker list plan without calling get_bctc_full or sending Telegram.",
        ),
    },
    async ({ tickers, dry_run }) => {
      const result = await runBctcBatchSweep({
        ...(tickers !== undefined ? { tickers } : {}),
        dryRun: dry_run,
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
