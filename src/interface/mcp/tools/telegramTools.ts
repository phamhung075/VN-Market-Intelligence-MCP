/**
 * Task 235 — Unified Telegram send tool
 *
 * Interface layer: registers the send_telegram MCP tool.
 *
 * Tool registered:
 *   1. send_telegram — sends a message to either the Chat Channel or the Report Channel
 *                      via a single `channel` parameter ("chat" | "report").
 *
 * Replaces (removed):
 *   - send_test_telegram (previously sent to Chat Channel)
 *   - send_telegram_report (previously sent to Report Channel)
 *   - delete_telegram_report (functionality absorbed into process_telegram_report)
 *
 * Note: send_alert_digest is registered separately in alertDigestTools.ts
 * because it has distinct orchestration logic (assembles a digest, not just relays a message).
 *
 * @module interface/mcp/tools/telegramTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { sendTelegramMessage, sendTelegramReport } from "../../../infrastructure/notifiers/telegram.js";

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registers the send_telegram MCP tool on the given McpServer instance.
 *
 * Tool: send_telegram
 *   Input:  { channel: "chat" | "report", message: string }
 *   Output: { content: [{ type: "text", text: "..." }] }
 *
 * @param server - The McpServer instance to register tools on.
 */
export function registerTelegramTools(server: McpServer): void {
  server.tool(
    "send_telegram",
    "Send a message to a Telegram channel. " +
      "Use channel='chat' to send to the user-facing Chat Channel (alerts, briefings, analysis). " +
      "Use channel='report' to send to the Report Channel for inter-agent communication " +
      "(report problems, request dev team action). " +
      "channel='report' messages are stored in the telegram_reports table for the Dev Team to process.",
    {
      channel: z
        .enum(["chat", "report"])
        .describe("Target channel: 'chat' = user Chat Channel (TELEGRAM_CHAT_ID), 'report' = Report Channel (TELEGRAM_REPORT_ID)"),
      message: z
        .string()
        .min(1)
        .max(4000)
        .describe("The message text to send. Plain text recommended (no Markdown) to avoid parse errors."),
    },
    async ({ channel, message }) => {
      try {
        if (channel === "chat") {
          const success = await sendTelegramMessage(message, { parseMode: "" });
          return {
            content: [
              {
                type: "text" as const,
                text: success
                  ? "Message sent to Chat Channel."
                  : "Failed — check TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID env vars",
              },
            ],
          };
        } else {
          // channel === "report"
          const msgId = await sendTelegramReport(message, { parseMode: "" });
          return {
            content: [
              {
                type: "text" as const,
                text: msgId > 0
                  ? `Message sent to Report Channel. message_id: ${msgId}`
                  : "Failed — check TELEGRAM_BOT_TOKEN / TELEGRAM_REPORT_ID env vars",
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
