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

import { sendTelegramMessage, sendTelegramReport, deleteTelegramReport } from "../../../infrastructure/notifiers/telegram.js";

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

  // ── 2. send_telegram_report — inter-agent communication channel ────────
  server.tool(
    "send_telegram_report",
    "Send a message to the Vn-market-report Telegram channel for inter-agent communication. " +
      "Use this channel to: send analysis reports, request dev team action, " +
      "share improvement ideas between cowork agents and dev team. " +
      "Tag recipient: @team, @po, @dev, @qa, @ba, @architect, @market-analyst.",
    {
      message: z.string().min(5).max(4000)
        .describe("The report message to send to the team channel"),
      to: z.string().max(30).default("@team")
        .describe("Recipient tag: @team (all), @po (Product Owner), @dev, @qa, etc."),
      from: z.string().max(30).default("unified-agent")
        .describe("Your agent name (sender)"),
    },
    async ({ message, to, from }) => {
      try {
        const recipient = to.startsWith("@") ? to : `@${to}`;
        const fullMsg = `${recipient}\nFrom: ${from}\n\n${message}`;
        const msgId = await sendTelegramReport(fullMsg);

        return {
          content: [{
            type: "text" as const,
            text: msgId > 0
              ? `Report sent to Vn-market-report channel. To: ${recipient}\nmessage_id: ${msgId} (save this to delete later when resolved)`
              : "Failed — check TELEGRAM_BOT_TOKEN / TELEGRAM_REPORT_ID env vars",
          }],
        };
      } catch (err) {
        return {
          content: [{
            type: "text" as const,
            text: `Error: ${(err as Error).message}`,
          }],
        };
      }
    },
  );

  // ── 3. delete_telegram_report — clean up resolved reports ──────────────
  server.tool(
    "delete_telegram_report",
    "Delete a resolved report from the Vn-market-report Telegram channel. " +
      "Use this after fixing an issue to keep the channel clean — only open issues remain. " +
      "Requires the message_id returned by send_telegram_report or submit_feedback.",
    {
      message_id: z.number().int().min(1)
        .describe("The Telegram message_id to delete (returned by send_telegram_report)"),
    },
    async ({ message_id }) => {
      try {
        const deleted = await deleteTelegramReport(message_id);
        return {
          content: [{
            type: "text" as const,
            text: deleted
              ? `Report message ${message_id} deleted from Vn-market-report channel.`
              : `Failed to delete message ${message_id} — may already be deleted or invalid ID.`,
          }],
        };
      } catch (err) {
        return {
          content: [{
            type: "text" as const,
            text: `Error: ${(err as Error).message}`,
          }],
        };
      }
    },
  );
}
