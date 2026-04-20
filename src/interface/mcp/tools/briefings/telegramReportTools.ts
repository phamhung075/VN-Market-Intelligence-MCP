/**
 * Tasks 228 + 229 — Telegram Report MCP Tools
 *
 * Interface layer: registers two MCP tools on a McpServer instance.
 *
 * Tools registered:
 *   1. read_telegram_reports   — Read report rows by status (new/processed/all)
 *   2. process_telegram_report — Mark a report processed + optionally delete Telegram message
 *
 * These tools are the core of the Dev Team autonomous loop:
 *   - Dev Team cron calls read_telegram_reports → sees unprocessed rows
 *   - Dev Team fixes the issue, calls process_telegram_report(id)
 *     → row marked processed + Telegram message deleted from Report Channel
 *
 * @module interface/mcp/tools/telegramReportTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb, initDatabase } from "../../../../infrastructure/db/schema.js";
import {
  listNewReports,
  listAllReports,
  listNewReportsUnclaimed,
  getReport,
  markProcessed,
  claimReport,
  type TelegramReport,
} from "../../../../infrastructure/db/telegramReportStore.js";
import { deleteTelegramBug } from "../../../../infrastructure/notifiers/telegram.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a Unix timestamp (seconds) to an ISO 8601 date string.
 */
function toIsoString(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString();
}

/**
 * Serialize a TelegramReport row with created_at as ISO string.
 */
function serializeReport(row: TelegramReport): Record<string, unknown> {
  return {
    id: row.id,
    message_id: row.message_id,
    text: row.text,
    from_agent: row.from_agent,
    priority: row.priority,
    status: row.status,
    created_at: toIsoString(row.created_at),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Error formatter (exported for testability — task 1411)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a Vietnamese error message for report operations.
 *
 * @param context - Operation context (e.g. "đọc", "xử lý")
 * @param id      - Report ID (use 0 when no specific ID)
 * @param msg     - Error message
 */
export function formatReportError(context: string, id: number, msg: string): string {
  if (id > 0) {
    return `Lỗi khi ${context} báo cáo ${id}: ${msg}`;
  }
  return `Lỗi khi ${context} báo cáo: ${msg}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the read_telegram_reports and process_telegram_report MCP tools.
 *
 * @param server - McpServer instance to register tools on
 */
export function registerTelegramReportTools(server: McpServer): void {
  // ── read_telegram_reports ─────────────────────────────────────────────────
  server.tool(
    "read_telegram_reports",
    "Đọc các báo cáo từ kênh Report Channel. Mặc định trả về các báo cáo chưa xử lý (status=new). " +
      "Khi không có báo cáo mới, trả về thông báo thoát vòng lặp Dev Team.",
    {
      status: z
        .enum(["new", "processed", "all"])
        .optional()
        .default("new")
        .describe("Trạng thái báo cáo cần lấy: 'new' (mặc định), 'processed', hoặc 'all'"),
      limit: z.coerce
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(20)
        .describe("Số bản ghi tối đa trả về (1-50, mặc định 20)"),
      unclaimed_only: z
        .boolean()
        .optional()
        .default(true)
        .describe(
          "Chỉ trả về báo cáo chưa được claim (mặc định: true). " +
            "Đặt false để xem tất cả báo cáo bao gồm cả đã claimed.",
        ),
    },
    async ({ status, limit, unclaimed_only }) => {
      try {
        await initDatabase();
        const db = getDb();

        const resolvedStatus = status ?? "new";
        const resolvedLimit = limit ?? 20;
        const filterUnclaimed = unclaimed_only ?? true;

        let rows: TelegramReport[];

        if (resolvedStatus === "new") {
          if (filterUnclaimed) {
            const all = listNewReportsUnclaimed(db);
            rows = all.slice(0, resolvedLimit);
          } else {
            const all = listNewReports(db);
            rows = all.slice(0, resolvedLimit);
          }
        } else if (resolvedStatus === "processed") {
          // Filter processed rows from listAllReports
          const all = listAllReports(db, resolvedLimit * 2);
          rows = all.filter((r) => r.status === "processed").slice(0, resolvedLimit);
        } else {
          // "all"
          rows = listAllReports(db, resolvedLimit);
        }

        // Special case: new + empty → Dev Team exit signal
        if (resolvedStatus === "new" && rows.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Không có báo cáo mới. Vòng lặp kết thúc.",
              },
            ],
          };
        }

        const serialized = rows.map(serializeReport);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(serialized, null, 2),
            },
          ],
        };
      } catch (err) {
        console.error("[read_telegram_reports] Failed:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: formatReportError("đọc", 0, err instanceof Error ? err.message : String(err)),
            },
          ],
        };
      }
    },
  );

  // ── process_telegram_report ───────────────────────────────────────────────
  server.tool(
    "process_telegram_report",
    "Đánh dấu một báo cáo là đã xử lý và tùy chọn xóa tin nhắn Telegram tương ứng " +
      "khỏi kênh Report Channel để giữ kênh sạch sẽ.",
    {
      id: z.coerce
        .number()
        .int()
        .min(1)
        .describe("Primary key cua ban ghi telegram_reports can xu ly"),
      delete_telegram_message: z
        .boolean()
        .optional()
        .default(true)
        .describe(
          "Xóa tin nhắn Telegram trong kênh Report Channel sau khi xử lý (mặc định: true)",
        ),
    },
    async ({ id, delete_telegram_message }) => {
      try {
        await initDatabase();
        const db = getDb();

        const shouldDelete = delete_telegram_message ?? true;

        // Step 1: look up the row
        const row = getReport(db, id);
        if (!row) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Report ${id} not found.`,
              },
            ],
          };
        }

        // Step 2: optionally delete from Telegram
        let telegramDeleted = false;
        if (row.message_id > 0 && shouldDelete) {
          try {
            telegramDeleted = await deleteTelegramBug(row.message_id);
          } catch {
            // Swallow — Telegram may have already deleted the message
            telegramDeleted = false;
          }
        }

        // Step 3: mark as processed in SQLite
        markProcessed(db, id);

        // Step 4: return confirmation
        let text: string;
        if (row.message_id > 0 && shouldDelete) {
          text = `Report ${id} marked as processed. Telegram message ${row.message_id} deleted.`;
          if (!telegramDeleted) {
            text += " (Telegram deletion may have failed — row is still marked processed.)";
          }
        } else {
          text = `Report ${id} marked as processed. Telegram deletion skipped.`;
        }

        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (err) {
        console.error("[process_telegram_report] Failed:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: formatReportError("xử lý", id, err instanceof Error ? err.message : String(err)),
            },
          ],
        };
      }
    },
  );

  // ── claim_telegram_report ─────────────────────────────────────────────────
  server.tool(
    "claim_telegram_report",
    "Đặt quyền sở hữu (ownership lock) cho một báo cáo để tránh hai agent xử lý cùng lúc. " +
      "Dùng trước khi gọi process_telegram_report. " +
      "Nếu đã có agent khác claim rồi, trả về thông báo 'Already claimed by {claimant}'.",
    {
      id: z.coerce
        .number()
        .int()
        .min(1)
        .describe("Primary key của bản ghi telegram_reports cần claim"),
      claimant: z
        .string()
        .min(1)
        .describe(
          "Tên định danh của agent đang claim bản ghi này (ví dụ: 'dev-team', 'unified-agent')",
        ),
    },
    async ({ id, claimant }) => {
      try {
        await initDatabase();
        const db = getDb();

        const result = claimReport(db, id, claimant);

        if (result.success) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Report ${id} successfully claimed by '${claimant}'.`,
              },
            ],
          };
        }

        if (result.claimedBy) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Already claimed by ${result.claimedBy}`,
              },
            ],
          };
        }

        // Row not found
        return {
          content: [
            {
              type: "text" as const,
              text: `Report ${id} not found.`,
            },
          ],
        };
      } catch (err) {
        console.error("[claim_telegram_report] Failed:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: formatReportError("claim", id, err instanceof Error ? err.message : String(err)),
            },
          ],
        };
      }
    },
  );
}
