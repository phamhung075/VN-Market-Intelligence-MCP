/**
 * MCP Tool: trigger_foreign_flow_vps_fetch
 *
 * Manually triggers a foreign flow fetch run on the VPS for diagnosis.
 * Calls POST /api/trigger-foreign-flow-debug on the local server which
 * in turn queues an SSH command to the VPS.
 *
 * Parameters:
 *   tickers  — optional string array, e.g. ["FPT","VIC"]. Omit for all watchlist.
 *   verbose  — boolean (default true). Adds per-step diagnostic lines to output.
 *   dry_run  — boolean (default false). Returns pipeline state without triggering SSH.
 *
 * Returns:
 *   { service, attempted, success, failed: [{ticker, reason}], log_tail }
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { handleTriggerForeignFlowDebug } from "../../foreignFlowDebugTriggerHandler.js";

export function registerForeignFlowDebugTriggerTool(server: McpServer): void {
  server.tool(
    "trigger_foreign_flow_vps_fetch",
    "Manually triggers a foreign investor flow fetch run on the Vinahost VPS for diagnosis — " +
    "invokes /root/run-foreign-flow-debug.sh via SSH in live mode (FIX-VPS-SSH-TRIGGER-FAIL-LOUD). " +
    "Returns pipeline state: which tickers are being monitored, field names (fBuyVol/fSellVol/fRoom), " +
    "payload size, and push endpoint status. " +
    "Use dry_run=true to inspect without triggering SSH. " +
    "Use tickers filter to debug a specific stock's foreign flow pipeline. " +
    "Service: vn-foreign-flow.service (every 60s). " +
    "Returns: { service, attempted, success, failed: [{ticker, reason}], log_tail }",
    {
      tickers: z
        .array(z.string().min(1).max(10))
        .optional()
        .describe("Optional ticker filter, e.g. ['FPT','VIC']. Omit to process all watchlist tickers."),
      verbose: z
        .boolean()
        .optional()
        .default(true)
        .describe("If true (default), includes per-step diagnostic lines showing field names, payload size, jq transform details."),
      dry_run: z
        .boolean()
        .optional()
        .default(false)
        .describe("If true, returns pipeline state without triggering SSH. Use to inspect without side effects."),
    },
    async ({ tickers, verbose, dry_run }) => {
      try {
        // handleTriggerForeignFlowDebug now performs the REAL SSH trigger itself
        // in live mode (FIX-VPS-SSH-TRIGGER-FAIL-LOUD, 2026-07-22) — no duplicate
        // log-building here.
        const result = await handleTriggerForeignFlowDebug({
          tickers,
          verbose: verbose ?? true,
          dry_run: dry_run ?? false,
        });

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
              text: `Error triggering foreign flow debug: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );
}
