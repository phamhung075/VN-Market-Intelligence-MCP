/**
 * MCP Tool: trigger_sbv_vps_fetch
 *
 * Manually triggers an SBV/FX rate fetch run on the VPS for diagnosis.
 * Calls POST /api/trigger-sbv-debug on the local server which
 * in turn queues an SSH command to the VPS.
 *
 * Parameters:
 *   verbose  — boolean (default true). Adds diagnostic lines about VCB XML parse to output.
 *   dry_run  — boolean (default false). Returns pipeline state without triggering SSH.
 *
 * Note: No tickers param — SBV/FX fetch is global (USD/VND rate from Vietcombank XML).
 *
 * Returns:
 *   { service, attempted, success, failed: [{source, reason}], log_tail }
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { handleTriggerSbvDebug } from "../../sbvDebugTriggerHandler.js";

export function registerSbvDebugTriggerTool(server: McpServer): void {
  server.tool(
    "trigger_sbv_vps_fetch",
    "Manually triggers an SBV/FX rate fetch run on the Vinahost VPS for diagnosis — " +
    "invokes /root/run-sbv-debug.sh via SSH in live mode (FIX-VPS-SSH-TRIGGER-FAIL-LOUD). " +
    "Fetches USD/VND exchange rate from Vietcombank XML API. " +
    "Returns pipeline state: VCB XML endpoint URL, parse steps, push endpoint status. " +
    "Use dry_run=true to inspect without triggering SSH. " +
    "Service: vn-sbv-fetch.service (every 30min). " +
    "Returns: { service, attempted, success, failed: [{source, reason}], log_tail }",
    {
      verbose: z
        .boolean()
        .optional()
        .default(true)
        .describe("If true (default), includes VCB XML URL and parse step details in diagnostic output."),
      dry_run: z
        .boolean()
        .optional()
        .default(false)
        .describe("If true, returns pipeline state without triggering SSH. Use to inspect without side effects."),
    },
    async ({ verbose, dry_run }) => {
      try {
        // handleTriggerSbvDebug now performs the REAL SSH trigger itself in
        // live mode (FIX-VPS-SSH-TRIGGER-FAIL-LOUD, 2026-07-22) — no duplicate
        // log-building here.
        const result = await handleTriggerSbvDebug({
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
              text: `Error triggering SBV debug: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );
}
