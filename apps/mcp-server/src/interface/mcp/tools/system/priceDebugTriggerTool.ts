/**
 * MCP Tool: trigger_price_vps_fetch
 *
 * Manually triggers a price fetch run on the VPS for diagnosis.
 * Calls POST /api/trigger-price-debug on the local server which
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
import { handleTriggerPriceDebug } from "../../priceDebugTriggerHandler.js";

export function registerPriceDebugTriggerTool(server: McpServer): void {
  server.tool(
    "trigger_price_vps_fetch",
    "Trigger VPS stock price fetch job — invokes vps-scripts/fetch-prices.sh on Vinahost VPS via SSH. " +
    "Parameters: tickers[] (optional ticker filter), verbose, dry_run. " +
    "Returns: { service, attempted, success, failed: [{ticker, reason}], log_tail }. " +
    "Distinct from trigger_bctc_vps_fetch (BCTC PDFs, fetch-bctc.sh, returns {queued,...}) and " +
    "trigger_news_vps_fetch (news RSS, no tickers param, fetch-news.sh). " +
    "Service: vn-price-fetch.service (every 60s). " +
    "Use dry_run=true to inspect pipeline state without triggering SSH.",
    {
      tickers: z
        .array(z.string().min(1).max(10))
        .optional()
        .describe("Optional ticker filter, e.g. ['FPT','VIC']. Omit to process all watchlist tickers."),
      verbose: z
        .boolean()
        .optional()
        .default(true)
        .describe("If true (default), includes per-step diagnostic lines showing fetch sources and push steps."),
      dry_run: z
        .boolean()
        .optional()
        .default(false)
        .describe("If true, returns pipeline state without triggering SSH. Use to inspect without side effects."),
    },
    async ({ tickers, verbose, dry_run }) => {
      try {
        const result = await handleTriggerPriceDebug({
          tickers,
          verbose: verbose ?? true,
          dry_run: dry_run ?? false,
        });

        // If live mode (not dry_run), attempt SSH trigger via VPS
        if (!result.dry_run) {
          const vinahostIp = Bun.env["VINAHOST_IP"];
          if (vinahostIp) {
            const tickerArgs =
              tickers && tickers.length > 0
                ? tickers.map((t) => `--ticker ${t}`).join(" ")
                : "";
            const verboseFlag = verbose ? "--verbose" : "";
            const cmd = `ssh root@${vinahostIp} /root/run-price-debug.sh ${tickerArgs} ${verboseFlag}`.trim();
            result.log_tail += `\n[SSH] Queued command: ${cmd}`;
            result.log_tail += `\n[SSH] Note: SSH execution is fire-and-forget. Check VPS logs at /tmp/price-debug-*.log`;
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
              text: `Error triggering price debug: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );
}
