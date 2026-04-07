/**
 * Task 206 — Stop-loss / Take-profit Price Alert MCP Tools
 * Task 241 — get_price_alerts removed (merged into get_alerts type="price"|"all")
 *
 * Interface layer: registers two MCP tools for price threshold management.
 *
 * Tools registered:
 *   1. set_price_alert    — Create a stop-loss or take-profit price threshold
 *   2. delete_price_alert — Cancel an alert by ID
 *
 * NOTE: get_price_alerts was removed. Use get_alerts with type="price" instead.
 *
 * All prices are in VND (Vietnamese Dong).
 *
 * @module interface/mcp/tools/priceAlertTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getDb, initDatabase } from "../../../infrastructure/db/schema.js";
import { logger } from "../../../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Internal DB row shapes
// ─────────────────────────────────────────────────────────────────────────────

interface PriceAlertRow {
  id: number;
  code: string;
  alert_type: string;
  threshold: number;
  status: string;
  created_at: string;
  triggered_at: string | null;
  notes: string | null;
}

interface WatchlistCodeRow {
  code: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a VND price with thousand-separators.
 * e.g. 85000 → "85,000"
 */
function fmtVnd(amount: number): string {
  return amount.toLocaleString("vi-VN");
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register price alert MCP tools on the given server instance.
 * Registers: set_price_alert, delete_price_alert.
 * NOTE: get_price_alerts was removed (task 241). Use get_alerts type="price" instead.
 *
 * @param server - The McpServer instance to register tools on.
 */
export function registerPriceAlertTools(server: McpServer): void {
  // ── 1. set_price_alert ────────────────────────────────────────────────────

  server.tool(
    "set_price_alert",
    "Create a stop-loss or take-profit price threshold alert for a stock in " +
      "your watchlist. The alert will fire automatically when the market price " +
      "reaches the configured level. " +
      "stop_loss triggers when price <= threshold. " +
      "take_profit triggers when price >= threshold.",
    {
      code: z
        .string()
        .min(1)
        .max(10)
        .describe("Stock ticker code, e.g. 'VCB'. Must exist in the watchlist."),
      alertType: z
        .enum(["stop_loss", "take_profit"])
        .describe("'stop_loss' fires when price drops to/below threshold. " +
          "'take_profit' fires when price rises to/above threshold."),
      threshold: z.coerce
        .number()
        .positive()
        .describe("Price level in VND that triggers the alert, e.g. 80000 for 80,000 VND."),
      notes: z
        .string()
        .optional()
        .describe("Optional notes, e.g. 'TP muc tieu Q2 2026'."),
    },
    async ({ code, alertType, threshold, notes }) => {
      try {
        await initDatabase();
        const db = getDb();
        const upperCode = code.toUpperCase();

        // Validate: code must exist in watchlist
        const wlRow = db
          .query<WatchlistCodeRow, [string]>(
            "SELECT code FROM watchlist WHERE code = ?",
          )
          .get(upperCode);

        if (!wlRow) {
          return {
            content: [
              {
                type: "text" as const,
                text:
                  `Loi: Ma co phieu "${upperCode}" khong co trong danh sach theo doi.\n` +
                  `Vui long them vao watchlist truoc khi dat canh bao gia.\n` +
                  `Dung cong cu add_to_watchlist de them ma co phieu.`,
              },
            ],
          };
        }

        // Insert new active alert
        db.query<void, [string, string, number, string | null]>(
          `INSERT INTO price_alerts (code, alert_type, threshold, notes)
           VALUES (?, ?, ?, ?)`,
        ).run(upperCode, alertType, threshold, notes ?? null);

        const alertTypeLabel =
          alertType === "stop_loss" ? "Stop-loss" : "Take-profit";
        const dirLabel =
          alertType === "stop_loss" ? "<=" : ">=";

        return {
          content: [
            {
              type: "text" as const,
              text:
                `Da tao canh bao gia thanh cong!\n\n` +
                `Ma co phieu : ${upperCode}\n` +
                `Loai        : ${alertTypeLabel}\n` +
                `Nguong kich hoat: ${dirLabel} ${fmtVnd(threshold)} VND\n` +
                (notes ? `Ghi chu     : ${notes}\n` : "") +
                `\nCanh bao se tu dong kich hoat khi gia dat nguong nay.`,
            },
          ],
        };
      } catch (err) {
        logger.error("[set_price_alert] Error", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Loi khi tao canh bao: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );

  // ── get_price_alerts REMOVED (task 241) ──────────────────────────────────
  // Use get_alerts with type="price" or type="all" instead.

  // ── 2. delete_price_alert ─────────────────────────────────────────────────

  server.tool(
    "delete_price_alert",
    "Cancel a price threshold alert by its ID. " +
      "The alert is marked as 'cancelled' (soft delete) so audit history is preserved. " +
      "Use get_alerts with type='price' to find the ID of the alert you want to remove.",
    {
      alertId: z.coerce
        .number()
        .int()
        .positive()
        .describe("The numeric ID of the price alert to cancel."),
    },
    async ({ alertId }) => {
      try {
        await initDatabase();
        const db = getDb();

        // Verify the alert exists
        const existing = db
          .query<PriceAlertRow, [number]>(
            "SELECT * FROM price_alerts WHERE id = ?",
          )
          .get(alertId);

        if (!existing) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Khong tim thay canh bao co ID = ${alertId}.\nDung get_alerts voi type='price' de xem danh sach canh bao hien co.`,
              },
            ],
          };
        }

        if (existing.status === "cancelled") {
          return {
            content: [
              {
                type: "text" as const,
                text: `Canh bao ID ${alertId} (${existing.code} ${existing.alert_type}) da duoc huy truoc do.`,
              },
            ],
          };
        }

        // Soft-delete: set status to cancelled
        db.query<void, [number]>(
          "UPDATE price_alerts SET status = 'cancelled' WHERE id = ?",
        ).run(alertId);

        const alertTypeLabel =
          existing.alert_type === "stop_loss" ? "Stop-loss" : "Take-profit";

        return {
          content: [
            {
              type: "text" as const,
              text:
                `Da huy canh bao gia thanh cong.\n\n` +
                `ID          : ${alertId}\n` +
                `Ma co phieu : ${existing.code}\n` +
                `Loai        : ${alertTypeLabel}\n` +
                `Nguong      : ${fmtVnd(existing.threshold)} VND\n` +
                `Trang thai  : Da huy`,
            },
          ],
        };
      } catch (err) {
        logger.error("[delete_price_alert] Error", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Loi khi huy canh bao: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );
}
