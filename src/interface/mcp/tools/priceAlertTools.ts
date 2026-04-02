/**
 * Task 206 — Stop-loss / Take-profit Price Alert MCP Tools
 *
 * Interface layer: registers three MCP tools for price threshold management.
 *
 * Tools registered:
 *   1. set_price_alert    — Create a stop-loss or take-profit price threshold
 *   2. get_price_alerts   — List all active alerts in Vietnamese table format
 *   3. delete_price_alert — Cancel an alert by ID
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

interface PriceRow {
  code: string;
  price: number | null;
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

/**
 * Pad a string to a minimum width (left-align).
 */
function pad(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

/**
 * Render the Vietnamese-language alerts table.
 *
 * Canh bao gia (N dang hoat dong)
 *
 * Ma    | Loai        | Nguong    | Gia hien tai | Trang thai
 * VCB   | Stop-loss   | 80,000    | 85,000       | Hoat dong
 */
function formatAlertsTable(
  rows: PriceAlertRow[],
  priceMap: Map<string, number>,
): string {
  if (rows.length === 0) {
    return "Canh bao gia\n\nKhong co canh bao nao dang hoat dong.";
  }

  const active = rows.filter((r) => r.status === "active");
  const lines: string[] = [
    `Canh bao gia (${active.length} dang hoat dong)`,
    "",
    `${pad("Ma", 6)}| ${pad("Loai", 12)}| ${pad("Nguong", 12)}| ${pad("Gia hien tai", 14)}| Trang thai`,
    "-".repeat(65),
  ];

  for (const row of rows) {
    const loai =
      row.alert_type === "stop_loss" ? "Stop-loss" : "Take-profit";
    const nguong = fmtVnd(row.threshold);
    const currentPrice = priceMap.get(row.code);
    const giaHienTai = currentPrice !== undefined ? fmtVnd(currentPrice) : "N/A";
    const trangThai =
      row.status === "active"
        ? "Hoat dong"
        : row.status === "triggered"
          ? "Da kich hoat"
          : "Da huy";

    lines.push(
      `${pad(row.code, 6)}| ${pad(loai, 12)}| ${pad(nguong, 12)}| ${pad(giaHienTai, 14)}| ${trangThai}`,
    );
  }

  lines.push("");
  lines.push(`Tong: ${rows.length} canh bao (${active.length} hoat dong)`);
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the three price alert MCP tools on the given server instance.
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
      threshold: z
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

  // ── 2. get_price_alerts ───────────────────────────────────────────────────

  server.tool(
    "get_price_alerts",
    "List price threshold alerts with current market prices. " +
      "Shows all active, triggered and cancelled alerts by default. " +
      "Displays a Vietnamese-format table with each stock's current price " +
      "and whether the threshold has been reached.",
    {
      statusFilter: z
        .enum(["all", "active", "triggered", "cancelled"])
        .default("active")
        .describe("Filter by status. Default: 'active' (only live alerts)."),
    },
    async ({ statusFilter }) => {
      try {
        await initDatabase();
        const db = getDb();

        // Load alerts
        let alertRows: PriceAlertRow[];
        if (statusFilter === "all") {
          alertRows = db
            .query<PriceAlertRow, []>(
              "SELECT * FROM price_alerts ORDER BY created_at DESC",
            )
            .all();
        } else {
          alertRows = db
            .query<PriceAlertRow, [string]>(
              "SELECT * FROM price_alerts WHERE status = ? ORDER BY created_at DESC",
            )
            .all(statusFilter);
        }

        if (alertRows.length === 0) {
          const label =
            statusFilter === "all"
              ? "nao"
              : statusFilter === "active"
                ? "nao dang hoat dong"
                : statusFilter === "triggered"
                  ? "nao da kich hoat"
                  : "nao da huy";
          return {
            content: [
              {
                type: "text" as const,
                text: `Canh bao gia\n\nKhong tim thay canh bao ${label}.`,
              },
            ],
          };
        }

        // Fetch current prices for all codes
        const codes = [...new Set(alertRows.map((r) => r.code))];
        const priceMap = new Map<string, number>();
        if (codes.length > 0) {
          try {
            const placeholders = codes.map(() => "?").join(", ");
            const priceRows = db
              .query<PriceRow, string[]>(
                `SELECT code, price FROM market_prices WHERE code IN (${placeholders})`,
              )
              .all(...codes);
            for (const row of priceRows) {
              if (row.price !== null && row.price > 0) {
                priceMap.set(row.code, row.price);
              }
            }
          } catch {
            // market_prices may not have data — use N/A
          }
        }

        const table = formatAlertsTable(alertRows, priceMap);
        return {
          content: [{ type: "text" as const, text: table }],
        };
      } catch (err) {
        logger.error("[get_price_alerts] Error", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Loi khi lay danh sach canh bao: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );

  // ── 3. delete_price_alert ─────────────────────────────────────────────────

  server.tool(
    "delete_price_alert",
    "Cancel a price threshold alert by its ID. " +
      "The alert is marked as 'cancelled' (soft delete) so audit history is preserved. " +
      "Use get_price_alerts to find the ID of the alert you want to remove.",
    {
      alertId: z
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
                text: `Khong tim thay canh bao co ID = ${alertId}.\nDung get_price_alerts de xem danh sach canh bao hien co.`,
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
