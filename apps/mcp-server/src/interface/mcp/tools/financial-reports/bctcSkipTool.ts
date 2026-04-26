/**
 * Task 1343d — bctc_skip_queue_item MCP Tool
 *
 * Provides a feedback channel from the VPS fetch-bctc.sh script back to MCP.
 * When a PDF fetch fails (404 or invalid URL), the VPS calls this tool to:
 *   1. Set status = 'skipped' on the queue item
 *   2. Increment attempts counter
 *   3. Record last_attempt timestamp
 *
 * This prevents infinite retry loops: once status='skipped', the VPS
 * cron loop no longer matches the item (filtered by status='pending').
 *
 * @module interface/mcp/tools/financial-reports/bctcSkipTool
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Database } from "bun:sqlite";

import { getDb } from "../../../../infrastructure/db/schema.js";
import { logger } from "../../../../infrastructure/logger.js";

/**
 * Registers the `bctc_skip_queue_item` MCP tool on `server`.
 *
 * @param server  - The McpServer instance.
 * @param _testDb - Optional injected Database for unit tests.
 */
export function registerBctcSkipTool(
  server: McpServer,
  _testDb?: Database,
): void {
  server.tool(
    "bctc_skip_queue_item",
    "Mark a BCTC queue item as SKIPPED (PDF not found on VPS fetch). " +
    "Increments the attempts counter and records last_attempt timestamp. " +
    "Called by the VPS fetch-bctc.sh script when a PDF fetch returns 404 or fails. " +
    "Prevents infinite retry loops by transitioning status from pending to skipped.",
    {
      action_code: z
        .string()
        .min(1)
        .max(10)
        .describe("Stock ticker code, e.g. 'FPT'"),
      period_year: z
        .number()
        .int()
        .min(2000)
        .max(2099)
        .describe("Financial report year, e.g. 2025"),
      period_quarter: z
        .enum(["Q1", "Q2", "Q3", "Q4"])
        .describe("Quarter: 'Q1', 'Q2', 'Q3', or 'Q4'"),
      skip_reason: z
        .string()
        .optional()
        .describe("Reason for skip, e.g. '404 not found', 'malformed URL'"),
    },
    async ({ action_code, period_year, period_quarter, skip_reason }) => {
      const db = _testDb ?? getDb();

      try {
        const result = db
          .prepare(
            `UPDATE bctc_vps_queue
             SET status = 'skipped',
                 attempts = attempts + 1,
                 last_attempt = datetime('now')
             WHERE action_code = ? AND period_year = ? AND period_quarter = ?`,
          )
          .run(action_code, period_year, period_quarter);

        if (result.changes === 0) {
          logger.warn("[bctcSkipTool] Queue item not found", {
            action_code,
            period_year,
            period_quarter,
          });

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: false,
                    message: `Queue item not found: ${action_code} ${period_year} ${period_quarter}`,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        const reason = skip_reason ?? "unknown";
        logger.info("[bctcSkipTool] Marked as skipped", {
          action_code,
          period_year,
          period_quarter,
          skip_reason: reason,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  message: `Marked as skipped: ${action_code} ${period_year} ${period_quarter} (reason: ${reason})`,
                  updates: {
                    status: "skipped",
                    attempts_incremented: true,
                  },
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        logger.error("[bctcSkipTool] DB error", {
          error: err instanceof Error ? err.message : String(err),
          action_code,
          period_year,
          period_quarter,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  message: `DB error: ${err instanceof Error ? err.message : String(err)}`,
                },
                null,
                2,
              ),
            },
          ],
        };
      }
    },
  );
}
