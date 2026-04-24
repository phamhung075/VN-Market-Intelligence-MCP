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

import { getDb, initDatabase } from "../../../../infrastructure/db/schema.js";
import { logger } from "../../../../infrastructure/logger.js";

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
// Formatter (exported for testability — task 1411)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format the "price alert created" confirmation message.
 *
 * @param code      - Stock ticker code
 * @param threshold - Alert threshold in VND
 * @param dirLabel  - Direction label (e.g. "<=" or ">=")
 */
export function formatPriceAlertCreated(
  code: string,
  threshold: number,
  dirLabel: string,
): string {
  return (
    `Đã tạo cảnh báo giá thành công!\n\n` +
    `Mã cổ phiếu : ${code}\n` +
    `Ngưỡng kích hoạt: ${dirLabel} ${fmtVnd(threshold)} VND\n` +
    `\nCảnh báo sẽ tự động kích hoạt khi giá đạt ngưỡng này.`
  );
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
                  `Lỗi: Mã cổ phiếu "${upperCode}" không có trong danh sách theo dõi.\n` +
                  `Vui lòng thêm vào watchlist trước khi đặt cảnh báo giá.\n` +
                  `Dùng công cụ add_to_watchlist để thêm mã cổ phiếu.`,
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
                formatPriceAlertCreated(upperCode, threshold, dirLabel) +
                (notes ? `\nGhi chú     : ${notes}` : ""),
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
              text: `Lỗi khi tạo cảnh báo: ${(err as Error).message}`,
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
                text: `Không tìm thấy cảnh báo có ID = ${alertId}.\nDùng get_alerts với type='price' để xem danh sách cảnh báo hiện có.`,
              },
            ],
          };
        }

        if (existing.status === "cancelled") {
          return {
            content: [
              {
                type: "text" as const,
                text: `Cảnh báo ID ${alertId} (${existing.code} ${existing.alert_type}) đã được huỷ trước đó.`,
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
                `Đã huỷ cảnh báo giá thành công.\n\n` +
                `ID          : ${alertId}\n` +
                `Mã cổ phiếu : ${existing.code}\n` +
                `Loại        : ${alertTypeLabel}\n` +
                `Ngưỡng      : ${fmtVnd(existing.threshold)} VND\n` +
                `Trạng thái  : Đã huỷ`,
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
              text: `Lỗi khi huỷ cảnh báo: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );
}
