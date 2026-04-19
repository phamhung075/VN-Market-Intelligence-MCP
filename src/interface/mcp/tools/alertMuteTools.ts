/**
 * Task 222 — Alert Snooze/Mute MCP Tools
 * Task 236 — Merge 2→1: manage_alert_mute
 *
 * Interface layer: registers one unified MCP tool on a McpServer instance.
 *
 * Tool registered:
 *   manage_alert_mute — Mute or unmute alerts for a stock (action: "mute" | "unmute")
 *
 * Replaces the two previous tools:
 *   - mute_stock_alerts   (removed in task 236)
 *   - unmute_stock_alerts (removed in task 236)
 *
 * Output format (Vietnamese):
 *   VCB đã được tắt tiếng trong 24 giờ (đến 02/04 15:30)
 *   VCB đã được bật lại cảnh báo.
 *
 * @module interface/mcp/tools/alertMuteTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb, initDatabase } from "../../../infrastructure/db/schema.js";
import {
  muteStock,
  unmuteStock,
  listMutes,
} from "../../../infrastructure/db/alertMuteStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a Date as Vietnamese dd/MM HH:mm.
 * Example: "02/04 15:30"
 */
function formatViDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${dd}/${mm} ${hh}:${min}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the unified manage_alert_mute MCP tool.
 *
 * Replaces the previous mute_stock_alerts and unmute_stock_alerts tools
 * (merged in task 236 as part of Sprint 036 tool surface reduction).
 *
 * @param server - McpServer instance to register the tool on
 */
export function registerAlertMuteTools(server: McpServer): void {
  server.tool(
    "manage_alert_mute",
    "Tắt tiếng (mute) hoặc bật lại (unmute) cảnh báo cho một mã cổ phiếu. " +
      "Dùng action='mute' để tắt tiếng trong N giờ (mặc định 24). " +
      "Dùng action='unmute' để bật lại cảnh báo ngay lập tức.",
    {
      code: z
        .string()
        .min(1)
        .max(10)
        .describe("Mã cổ phiếu (ví dụ: VCB, FPT, VNM)"),
      action: z
        .enum(["mute", "unmute"])
        .describe("'mute' de tat tieng, 'unmute' de bat lai"),
      hours: z.coerce
        .number()
        .int()
        .min(1)
        .max(720)
        .optional()
        .default(24)
        .describe(
          "So gio tat tieng — chi dung khi action='mute' (mac dinh 24, toi da 720 = 30 ngay)",
        ),
      reason: z
        .string()
        .max(200)
        .optional()
        .describe("Ly do tat tieng — chi dung khi action='mute' (tuy chon)"),
    },
    async ({ code, action, hours, reason }) => {
      try {
        await initDatabase();
        const db = getDb();

        // ── action = "mute" ────────────────────────────────────────────────
        if (action === "mute") {
          const resolvedHours = hours ?? 24;
          muteStock(db, code, resolvedHours, reason);

          const until = new Date(Date.now() + resolvedHours * 3_600_000);
          const untilStr = formatViDate(until);

          const lines: string[] = [
            `${code} đã được tắt tiếng trong ${resolvedHours} giờ (đến ${untilStr})`,
          ];
          if (reason) {
            lines.push(`Lý do: ${reason}`);
          }
          lines.push("");
          lines.push(
            "Để bật lại cảnh báo, gọi manage_alert_mute với action='unmute'.",
          );

          return {
            content: [{ type: "text" as const, text: lines.join("\n") }],
          };
        }

        // ── action = "unmute" ──────────────────────────────────────────────
        // Check if the stock was actually muted before removing
        const mutes = listMutes(db);
        const existing = mutes.find((m) => m.code === code);

        unmuteStock(db, code);

        if (!existing) {
          return {
            content: [
              {
                type: "text" as const,
                text: `${code} hiện không bị tắt tiếng cảnh báo.`,
              },
            ],
          };
        }

        const wasUntil = new Date(existing.muted_until);
        const isExpired = wasUntil.getTime() <= Date.now();

        const lines: string[] = [];
        if (isExpired) {
          lines.push(
            `${code}: lệnh tắt tiếng đã hết hạn (${formatViDate(wasUntil)}). Cảnh báo đã được bật lại.`,
          );
        } else {
          lines.push(
            `${code} đã được bật lại cảnh báo (trước khi hết hạn ${formatViDate(wasUntil)}).`,
          );
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        console.error("[manage_alert_mute] Failed:", err);
        const errAction = action === "mute" ? "Lỗi khi tắt tiếng" : "Lỗi khi bật lại";
        return {
          content: [
            {
              type: "text" as const,
              text: `${errAction} cảnh báo cho ${code}: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );
}
