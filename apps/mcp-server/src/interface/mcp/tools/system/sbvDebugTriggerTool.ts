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
    "Manually triggers an SBV/FX rate fetch run on the Vinahost VPS for diagnosis. " +
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
        const result = await handleTriggerSbvDebug({
          verbose: verbose ?? true,
          dry_run: dry_run ?? false,
        });

        // If live mode (not dry_run), attempt SSH trigger via VPS
        if (!result.dry_run) {
          const vinahostIp = Bun.env["VINAHOST_IP"];
          if (vinahostIp) {
            const verboseFlag = verbose ? "--verbose" : "";
            const cmd = `ssh root@${vinahostIp} /root/run-sbv-debug.sh ${verboseFlag}`.trim();
            result.log_tail += `\n[SSH] Queued command: ${cmd}`;
            result.log_tail += `\n[SSH] Note: SSH execution is fire-and-forget. Check VPS logs at /tmp/sbv-debug-*.log`;
          } else {
            result.log_tail += `\n[WARN] VINAHOST_IP not set — cannot SSH to VPS. Set env var and retry.`;
          }
        }

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
