/**
 * MCP Tool: trigger_bctc_vps_fetch
 *
 * Manually triggers a BCTC fetch run on the VPS for diagnosis.
 * Calls POST /api/trigger-bctc-debug on the local server which
 * in turn queues an SSH command to the VPS.
 *
 * Parameters:
 *   tickers  — optional string array, e.g. ["FPT","VIC"]. Omit for all pending.
 *   verbose  — boolean (default true). Adds per-item diagnostic lines to output.
 *   dry_run  — boolean (default false). Returns queue state without triggering SSH.
 *
 * Returns:
 *   { queued, attempted, success, failed: [{ticker, reason}], log_tail }
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb } from "../../../../infrastructure/db/schema.js";
import { handleTriggerBctcDebug } from "../../bctcDebugTriggerHandler.js";
import type { Database } from "bun:sqlite";

export function registerBctcDebugTriggerTool(
  server: McpServer,
  _testDb?: Database,
): void {
  server.tool(
    "trigger_bctc_vps_fetch",
    "Trigger VPS batch BCTC PDF fetch job — invokes vps-scripts/fetch-bctc.sh on Vinahost VPS via SSH. " +
    "Parameters: tickers[] (optional ticker filter), verbose, dry_run. " +
    "Returns: { queued, attempted, success, failed: [{ticker, reason}], log_tail }. " +
    "Distinct from trigger_price_vps_fetch (price data, fetch-prices.sh) and trigger_news_vps_fetch " +
    "(news RSS, no tickers param, fetch-news.sh). " +
    "Use dry_run=true to inspect queue without triggering SSH. " +
    "Use tickers filter to debug a specific stock's BCTC PDF pipeline.",
    {
      tickers: z
        .array(z.string().min(1).max(10))
        .optional()
        .describe("Optional ticker filter, e.g. ['FPT','VIC']. Omit to process all pending queue items."),
      verbose: z
        .boolean()
        .optional()
        .default(true)
        .describe("If true (default), includes per-item diagnostic lines showing attempts, source URLs, queue status."),
      dry_run: z
        .boolean()
        .optional()
        .default(false)
        .describe("If true, returns queue state without triggering SSH. Use to inspect without side effects."),
    },
    async ({ tickers, verbose, dry_run }) => {
      const db = _testDb ?? getDb();

      try {
        // handleTriggerBctcDebug now performs the REAL SSH trigger itself in
        // live mode (FIX-VPS-SSH-TRIGGER-FAIL-LOUD, 2026-07-22) — no duplicate
        // log-building here.
        const result = await handleTriggerBctcDebug(
          {
            tickers,
            verbose: verbose ?? true,
            dry_run: dry_run ?? false,
          },
          db,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error triggering BCTC debug: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );
}
