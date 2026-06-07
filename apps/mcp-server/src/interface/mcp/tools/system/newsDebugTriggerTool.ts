/**
 * MCP Tool: trigger_news_vps_fetch
 *
 * Manually triggers a news fetch run on the VPS for diagnosis.
 * Calls POST /api/trigger-news-debug on the local server which
 * in turn queues an SSH command to the VPS.
 *
 * Parameters:
 *   verbose  — boolean (default true). Adds per-source diagnostic lines to output.
 *   dry_run  — boolean (default false). Returns source list without triggering SSH.
 *
 * Returns:
 *   { service, attempted, success, failed: [{source, reason}], log_tail }
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { handleTriggerNewsDebug } from "../../newsDebugTriggerHandler.js";

export function registerNewsDebugTriggerTool(server: McpServer): void {
  server.tool(
    "trigger_news_vps_fetch",
    "Trigger VPS news RSS fetch job — invokes vps-scripts/fetch-news.sh on Vinahost VPS via SSH. " +
    "NO tickers param — news fetch is source-based (10 RSS sources + Playwright), not per-ticker. " +
    "Parameters: verbose, dry_run only. " +
    "Returns: { service, attempted, success, failed: [{source, reason}], log_tail }. " +
    "Distinct from trigger_price_vps_fetch (ticker-based price data, fetch-prices.sh) and " +
    "trigger_bctc_vps_fetch (ticker-based BCTC PDFs, fetch-bctc.sh, returns {queued,...}). " +
    "Service: vn-news-fetch.service (every 15min). " +
    "Use dry_run=true to inspect sources without triggering SSH.",
    {
      verbose: z
        .boolean()
        .optional()
        .default(true)
        .describe("If true (default), includes per-source diagnostic lines showing RSS URLs and fetch steps."),
      dry_run: z
        .boolean()
        .optional()
        .default(false)
        .describe("If true, returns source list without triggering SSH. Use to inspect without side effects."),
    },
    async ({ verbose, dry_run }) => {
      try {
        const result = await handleTriggerNewsDebug({
          verbose: verbose ?? true,
          dry_run: dry_run ?? false,
        });

        // If live mode (not dry_run), attempt SSH trigger via VPS
        if (!result.dry_run) {
          const vinahostIp = Bun.env["VINAHOST_IP"];
          if (vinahostIp) {
            const verboseFlag = verbose ? "--verbose" : "";
            const cmd = `ssh root@${vinahostIp} /root/run-news-debug.sh ${verboseFlag}`.trim();
            result.log_tail += `\n[SSH] Queued command: ${cmd}`;
            result.log_tail += `\n[SSH] Note: SSH execution is fire-and-forget. Check VPS logs at /tmp/news-debug-*.log`;
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
              text: `Error triggering news debug: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );
}
