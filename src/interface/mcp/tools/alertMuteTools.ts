/**
 * Task 222 — Alert Snooze/Mute MCP Tools
 *
 * Interface layer: registers two MCP tools on a McpServer instance.
 *
 * Tools registered:
 *   1. mute_stock_alerts   — Mute alerts for a stock for N hours
 *   2. unmute_stock_alerts — Remove a mute for a stock
 *
 * Output format (Vietnamese):
 *   VCB da duoc tat tieng trong 24 gio (den 02/04 15:30)
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
 * Register the mute_stock_alerts and unmute_stock_alerts MCP tools.
 *
 * @param server - McpServer instance to register tools on
 */
export function registerAlertMuteTools(server: McpServer): void {
  // ── mute_stock_alerts ────────────────────────────────────────────────────
  server.tool(
    "mute_stock_alerts",
    "Tat tieng canh bao cho mot ma co phieu trong N gio (mac dinh 24 gio). " +
      "Dung khi nhieu nhieu trong mua bao cao ket qua kinh doanh.",
    {
      actionCode: z
        .string()
        .min(1)
        .max(10)
        .describe("Ma co phieu (vi du: VCB, FPT, VNM)"),
      hours: z
        .number()
        .int()
        .min(1)
        .max(720)
        .optional()
        .default(24)
        .describe("So gio tat tieng (mac dinh 24, toi da 720 = 30 ngay)"),
      reason: z
        .string()
        .max(200)
        .optional()
        .describe("Ly do tat tieng (tuy chon)"),
    },
    async ({ actionCode, hours, reason }) => {
      try {
        await initDatabase();
        const db = getDb();
        ensureAlertMutesTable(db);

        const resolvedHours = hours ?? 24;
        muteStock(db, actionCode, resolvedHours, reason);

        const until = new Date(Date.now() + resolvedHours * 3_600_000);
        const untilStr = formatViDate(until);

        const lines: string[] = [
          `${actionCode} da duoc tat tieng trong ${resolvedHours} gio (den ${untilStr})`,
        ];
        if (reason) {
          lines.push(`Ly do: ${reason}`);
        }
        lines.push("");
        lines.push(
          "De bat lai canh bao, dung lenh unmute_stock_alerts.",
        );

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        console.error("[mute_stock_alerts] Failed:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Loi khi tat tieng canh bao cho ${actionCode}: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );

  // ── unmute_stock_alerts ──────────────────────────────────────────────────
  server.tool(
    "unmute_stock_alerts",
    "Bat lai canh bao cho mot ma co phieu da bi tat tieng truoc do.",
    {
      actionCode: z
        .string()
        .min(1)
        .max(10)
        .describe("Ma co phieu can bat lai canh bao"),
    },
    async ({ actionCode }) => {
      try {
        await initDatabase();
        const db = getDb();
        ensureAlertMutesTable(db);

        // Check if it was actually muted before removing
        const mutes = listMutes(db);
        const existing = mutes.find((m) => m.code === actionCode);

        unmuteStock(db, actionCode);

        if (!existing) {
          return {
            content: [
              {
                type: "text" as const,
                text: `${actionCode} hien khong bi tat tieng canh bao.`,
              },
            ],
          };
        }

        const wasUntil = new Date(existing.muted_until);
        const isExpired = wasUntil.getTime() <= Date.now();

        const lines: string[] = [];
        if (isExpired) {
          lines.push(
            `${actionCode}: lenh tat tieng da het han (${formatViDate(wasUntil)}). Canh bao da duoc bat lai.`,
          );
        } else {
          lines.push(
            `${actionCode} da duoc bat lai canh bao (truoc khi het han ${formatViDate(wasUntil)}).`,
          );
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        console.error("[unmute_stock_alerts] Failed:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Loi khi bat lai canh bao cho ${actionCode}: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );
}
