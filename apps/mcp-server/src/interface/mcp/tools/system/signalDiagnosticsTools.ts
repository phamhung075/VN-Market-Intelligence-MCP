/**
 * Signal Diagnostics MCP Tools — Task 1293c
 *
 * Tools for analyzing signal rejection patterns and agent validation failures.
 * Helps identify agent prompt bugs and validation schema mismatches.
 *
 * @module interface/mcp/tools/system/signalDiagnosticsTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getDb, initDatabase } from "../../../../infrastructure/db/schema.js";
import {
  getSignalRejectionSummary,
  getSignalRejectionDetails,
} from "../../../../infrastructure/db/signalRejectionStore.js";

/**
 * Register signal diagnostics tools on the given McpServer.
 *
 * @param server - McpServer instance
 */
export function registerSignalDiagnosticsTools(server: McpServer): void {
  // ── get_signal_rejection_summary ───────────────────────────────────────────
  server.tool(
    "get_signal_rejection_summary",
    "Query signal rejection audit log to detect agent validation failures. " +
      "Shows rejection counts by agent, or detailed rejection records for a specific agent. " +
      "Use this to identify prompt bugs (e.g., 'News Scout always omits event_type').",
    {
      hours: z.coerce
        .number()
        .int()
        .positive()
        .default(24)
        .describe("Look back N hours (default 24)"),
      from_agent: z
        .string()
        .optional()
        .describe("Filter by agent name (optional; if omitted, returns summary for all agents)"),
    },
    async (args) => {
      try {
        await initDatabase();
        const db = getDb();

        const hours = args.hours ?? 24;

        if (args.from_agent) {
          // Return detailed rejection records for this agent
          const details = getSignalRejectionDetails(db, args.from_agent, hours);

          if (details.length === 0) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `No signal rejections found for agent '${args.from_agent}' in the past ${hours} hours.`,
                },
              ],
            };
          }

          const lines: string[] = [
            `Signal rejection details for '${args.from_agent}' (last ${hours}h, ${details.length} rejections):`,
            "",
          ];

          for (const detail of details) {
            lines.push(`[${detail.id}] ${detail.created_at}`);
            lines.push(`  Type: ${detail.signal_type}`);
            if (detail.stock_code) {
              lines.push(`  Stock: ${detail.stock_code}`);
            }
            lines.push(`  Reason: ${detail.reason}`);
            if (detail.payload_preview) {
              lines.push(`  Payload: ${detail.payload_preview}`);
            }
            lines.push("");
          }

          return {
            content: [
              {
                type: "text" as const,
                text: lines.join("\n").trimEnd(),
              },
            ],
          };
        } else {
          // Return summary of rejection counts by agent
          const summary = getSignalRejectionSummary(db, hours);

          if (Object.keys(summary).length === 0) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `No signal rejections in the past ${hours} hours.`,
                },
              ],
            };
          }

          const lines: string[] = [
            `Signal rejection summary (last ${hours}h):`,
            "",
          ];

          const sorted = Object.entries(summary).sort((a, b) => b[1] - a[1]);
          for (const [agent, count] of sorted) {
            lines.push(`  ${agent}: ${count} rejections`);
          }

          lines.push("");
          lines.push("Use: get_signal_rejection_summary(from_agent='<agent>') for detailed records.");

          return {
            content: [
              {
                type: "text" as const,
                text: lines.join("\n").trimEnd(),
              },
            ],
          };
        }
      } catch (err) {
        console.error("[signalDiagnosticsTools] Failed:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );
}
