/**
 * Task 034 — Telegram MCP Tool
 *
 * Interface layer: registers the send_test_telegram MCP tool.
 *
 * Tool registered:
 *   1. send_test_telegram — sends a test message to verify Telegram connectivity
 *
 * @module interface/mcp/tools/telegramTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { sendTelegramMessage } from "../../../infrastructure/notifiers/telegram.js";

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registers the send_test_telegram MCP tool on the given McpServer instance.
 *
 * Tool: send_test_telegram
 *   Input:  { message?: string }
 *   Output: { content: [{ type: "text", text: "..." }] }
 *
 * @param server - The McpServer instance to register tools on.
 */
export function registerTelegramTools(server: McpServer): void {
  server.tool(
    "send_test_telegram",
    "Sends a test message to the configured Telegram chat to verify connectivity.",
    {
      message: z
        .string()
        .optional()
        .default("Test from VN Market Intelligence MCP"),
    },
    async ({ message }) => {
      try {
        const success = await sendTelegramMessage(message, {
          parseMode: "Markdown",
        });

        if (success) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    message: "Telegram message sent",
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: false,
                    message:
                      "Failed — check TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID env vars",
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Unknown error";
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  message: `Error: ${errorMsg}`,
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
