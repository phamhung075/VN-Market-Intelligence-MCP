/**
 * Task 188 — Alert Digest MCP Tool
 *
 * Interface layer: registers the `send_alert_digest` MCP tool on a McpServer.
 *
 * Tool registered:
 *   send_alert_digest — assemble the 24h alert digest and optionally send
 *                       it via Telegram. Returns the formatted digest text.
 *
 * @module interface/mcp/tools/alertDigestTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  assembleAlertDigest,
} from "../../../application/usecases/assembleAlertDigest.js";
import { initDatabase } from "../../../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the alert digest tool on an McpServer instance.
 *
 * @param server - The McpServer instance to register the tool on.
 */
export function registerAlertDigestTools(server: McpServer): void {
  server.tool(
    "send_alert_digest",
    "Assemble the daily 24-hour alert digest grouped by stock and return " +
      "the formatted Vietnamese-language text. Optionally sends the digest " +
      "via Telegram if configured. Returns '(Telegram chua duoc cau hinh)' " +
      "if Telegram is not set up.",
    {
      sendTelegram: z
        .boolean()
        .default(false)
        .describe(
          "When true, attempt to send the digest via Telegram in addition " +
            "to returning the text. Default: false.",
        ),
    },
    async ({ sendTelegram: shouldSend }) => {
      try {
        await initDatabase();
        const digest = await assembleAlertDigest();

        let telegramStatus = "";

        if (shouldSend) {
          try {
            const { sendTelegram: tg } = await import(
              "../../../infrastructure/notifiers/telegram.js"
            );
            const sent = await tg(digest.text);
            telegramStatus = sent
              ? "\n[Telegram: da gui thanh cong]"
              : "\n(Telegram chua duoc cau hinh)";
          } catch {
            telegramStatus = "\n(Telegram chua duoc cau hinh)";
          }
        }

        return {
          content: [
            {
              type: "text" as const,
              text: digest.text + telegramStatus,
            },
          ],
        };
      } catch (err) {
        console.error("[send_alert_digest] Error:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error assembling alert digest: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );
}
