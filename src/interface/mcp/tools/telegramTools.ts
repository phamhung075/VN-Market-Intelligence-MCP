/**
 * Sprint 051 — Three-channel send_telegram tool
 *
 * Interface layer: registers the unified send_telegram MCP tool with a
 * mandatory `channel` discriminator: "market" | "work" | "bug".
 *
 * Channels:
 *   - market: TELEGRAM_INFO_MARKET_GROUP_ID — user-facing market alerts/briefings
 *   - work:   TELEGRAM_INFO_WORK_CHANNEL_ID — dev/analysis status, refresh asks
 *   - bug:    TELEGRAM_REPORT_BUG_CHANNEL_ID — analysis → dev bug reports
 *
 * Bug messages are also persisted in the telegram_reports table for the Dev
 * Team autonomous loop.
 *
 * @module interface/mcp/tools/telegramTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  sendTelegramMarket,
  sendTelegramWork,
  sendTelegramBug,
} from "../../../infrastructure/notifiers/telegram.js";

export function registerTelegramTools(server: McpServer): void {
  server.tool(
    "send_telegram",
    "Send a message to one of the three Telegram channels. " +
      "channel='market' → user-facing market alerts/briefings (TELEGRAM_INFO_MARKET_GROUP_ID). " +
      "channel='work' → dev/analysis status, fix-shipped, agent refresh asks (TELEGRAM_INFO_WORK_CHANNEL_ID). " +
      "channel='bug' → analysis → dev bug reports (TELEGRAM_REPORT_BUG_CHANNEL_ID); " +
      "bug messages are persisted in telegram_reports for the Dev Team to process.",
    {
      channel: z
        .enum(["market", "work", "bug"])
        .describe(
          "Target channel: 'market' (TELEGRAM_INFO_MARKET_GROUP_ID), " +
            "'work' (TELEGRAM_INFO_WORK_CHANNEL_ID), " +
            "'bug' (TELEGRAM_REPORT_BUG_CHANNEL_ID).",
        ),
      message: z
        .string()
        .min(1)
        .max(4000)
        .describe("The message text to send. Plain text recommended (no Markdown) to avoid parse errors."),
    },
    async ({ channel, message }) => {
      try {
        if (channel === "market") {
          const success = await sendTelegramMarket(message, {
            parseMode: "",
            persist: { from_agent: "mcp-user", message_type: "user_ask_reply" },
          });
          return {
            content: [
              {
                type: "text" as const,
                text: success
                  ? "Message sent to MARKET channel."
                  : "Failed — check TELEGRAM_BOT_TOKEN / TELEGRAM_INFO_MARKET_GROUP_ID env vars",
              },
            ],
          };
        } else if (channel === "work") {
          const success = await sendTelegramWork(message, { parseMode: "" });
          return {
            content: [
              {
                type: "text" as const,
                text: success
                  ? "Message sent to WORK channel."
                  : "Failed — check TELEGRAM_BOT_TOKEN / TELEGRAM_INFO_WORK_CHANNEL_ID env vars",
              },
            ],
          };
        } else {
          // channel === "bug"
          const msgId = await sendTelegramBug(message, { parseMode: "" });
          return {
            content: [
              {
                type: "text" as const,
                text: msgId > 0
                  ? `Message sent to BUG channel. message_id: ${msgId}`
                  : "Failed — check TELEGRAM_BOT_TOKEN / TELEGRAM_REPORT_BUG_CHANNEL_ID env vars",
              },
            ],
          };
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${errorMsg}`,
            },
          ],
        };
      }
    },
  );
}
