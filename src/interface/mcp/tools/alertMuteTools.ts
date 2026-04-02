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
 *   VCB da duoc tat tieng trong 24 gio (den 02/04 15:30)
 *   VCB da duoc bat lai canh bao.
 *
 * @module interface/mcp/tools/alertMuteTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb, initDatabase } from "../../../infrastructure/db/schema.js";
import {
  ensureAlertMutesTable,
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
    "Tat tieng (mute) hoac bat lai (unmute) canh bao cho mot ma co phieu. " +
      "Dung action='mute' de tat tieng trong N gio (mac dinh 24). " +
      "Dung action='unmute' de bat lai canh bao ngay lap tuc.",
    {
      code: z
        .string()
        .min(1)
        .max(10)
        .describe("Ma co phieu (vi du: VCB, FPT, VNM)"),
      action: z
        .enum(["mute", "unmute"])
        .describe("'mute' de tat tieng, 'unmute' de bat lai"),
      hours: z
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
        ensureAlertMutesTable(db);

        // ── action = "mute" ────────────────────────────────────────────────
        if (action === "mute") {
          const resolvedHours = hours ?? 24;
          muteStock(db, code, resolvedHours, reason);

          const until = new Date(Date.now() + resolvedHours * 3_600_000);
          const untilStr = formatViDate(until);

          const lines: string[] = [
            `${code} da duoc tat tieng trong ${resolvedHours} gio (den ${untilStr})`,
          ];
          if (reason) {
            lines.push(`Ly do: ${reason}`);
          }
          lines.push("");
          lines.push(
            "De bat lai canh bao, goi manage_alert_mute voi action='unmute'.",
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
                text: `${code} hien khong bi tat tieng canh bao.`,
              },
            ],
          };
        }

        const wasUntil = new Date(existing.muted_until);
        const isExpired = wasUntil.getTime() <= Date.now();

        const lines: string[] = [];
        if (isExpired) {
          lines.push(
            `${code}: lenh tat tieng da het han (${formatViDate(wasUntil)}). Canh bao da duoc bat lai.`,
          );
        } else {
          lines.push(
            `${code} da duoc bat lai canh bao (truoc khi het han ${formatViDate(wasUntil)}).`,
          );
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        console.error("[manage_alert_mute] Failed:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Loi khi ${action === "mute" ? "tat tieng" : "bat lai"} canh bao cho ${code}: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );
}
