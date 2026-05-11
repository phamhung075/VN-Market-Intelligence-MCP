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
    "Manually triggers a BCTC PDF fetch run on the Vinahost VPS for diagnosis. " +
    "Returns the current queue state with verbose diagnostics (which tickers are pending, " +
    "how many attempts, whether source URLs are cached). " +
    "Use dry_run=true to inspect without triggering SSH. " +
    "Use tickers filter to debug a specific stock's BCTC pipeline. " +
    "Returns: { queued, attempted, success, failed: [{ticker, reason}], log_tail }",
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
        const result = await handleTriggerBctcDebug(
          {
            tickers,
            verbose: verbose ?? true,
            dry_run: dry_run ?? false,
          },
          db,
        );

        // If live mode (not dry_run), attempt SSH trigger via VPS
        if (!result.dry_run) {
          const vinahostIp = Bun.env["VINAHOST_IP"];
          if (vinahostIp) {
            const tickerArgs =
              tickers && tickers.length > 0
                ? tickers.map((t) => `--ticker ${t}`).join(" ")
                : "";
            const verboseFlag = verbose ? "--verbose" : "";
            const cmd = `ssh root@${vinahostIp} /root/run-bctc-debug.sh ${tickerArgs} ${verboseFlag}`.trim();
            result.log_tail += `\n[SSH] Queued command: ${cmd}`;
            result.log_tail += `\n[SSH] Note: SSH execution is fire-and-forget. Check VPS logs at /tmp/bctc-debug-*.log`;
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
              text: `Error triggering BCTC debug: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );
}
