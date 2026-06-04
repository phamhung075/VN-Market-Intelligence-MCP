/**
 * Task 245 — Bond Maturity Calendar MCP Tool
 *
 * Registers the `get_bond_maturity_calendar` tool on a McpServer.
 * Returns upcoming TPDN BĐS bond maturities with risk analysis.
 *
 * @module interface/mcp/tools/bondMaturityTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Database } from "bun:sqlite";
import { getDb } from "../../../../infrastructure/db/schema.js";
import { logger } from "../../../../infrastructure/logger.js";
import { getUpcomingMaturities, checkMaturityAlerts, type BondMaturityEvent } from "../../../../domain/services/bondMaturityTracker.js";
import { listUpcomingBonds } from "../../../../infrastructure/db/bondMaturityStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** @internal exported for unit tests (DSI-S3 C3) */
export function formatBondCalendar(events: BondMaturityEvent[], alerts: import("../../../../domain/services/signalDetector.js").Signal[]): string {
  if (events.length === 0) {
    return "Không có trái phiếu doanh nghiệp BĐS nào đáo hạn trong khoảng thời gian này.";
  }

  const alertByCode = new Map<string, string>();
  for (const alert of alerts) {
    const existing = alertByCode.get(alert.actionCode);
    if (!existing || alert.severity === "critical") {
      alertByCode.set(alert.actionCode, alert.severity);
    }
  }

  // DSI-S3 C3: warn at header level when any event is from static seed fallback.
  const hasSeedData = events.some((e) => e.static_seed === true);
  const lines: string[] = [
    `Lịch đáo hạn TPDN BĐS (${events.length} đợt):\n`,
    ...(hasSeedData ? [`[SEED DATA — không xác minh thị trường thực] Dữ liệu minh họa; cơ sở dữ liệu trái phiếu chưa được cập nhật từ nguồn thực.\n`] : []),
  ];

  for (const evt of events) {
    const alertSeverity = alertByCode.get(evt.issuerCode);
    const alertLabel = alertSeverity === "critical" ? " ⚠ KHẨN CẤP" :
                       alertSeverity === "high" ? " ⚠ CẦN CHÚ Ý" :
                       alertSeverity === "medium" ? " ! LƯU Ý" : "";

    const statusLabel =
      evt.status === "defaulted" ? "[VỠ NỢ]" :
      evt.status === "extended" ? "[GIA HẠN]" :
      evt.status === "due" ? "[ĐÁO HẠN]" : "[UPCOMING]";

    lines.push(`${statusLabel}${alertLabel} ${evt.issuer} (${evt.issuerCode})`);
    lines.push(`  Số tiền: ${evt.amount.toLocaleString()} tỷ VND`);
    lines.push(`  Ngày đáo hạn: ${evt.maturityDate}`);
    lines.push(`  Lãi suất: ${evt.couponRate}%/năm`);
    lines.push("");
  }

  if (alerts.length > 0) {
    lines.push(`--- ${alerts.length} cảnh báo đáo hạn ---`);
    for (const alert of alerts) {
      lines.push(`  ${alert.severity.toUpperCase()}: ${alert.message}`);
    }
  }

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the `get_bond_maturity_calendar` MCP tool.
 */
export function registerBondMaturityTools(
  server: McpServer,
  _testDb?: Database,
): void {
  server.tool(
    "get_bond_maturity_calendar",
    "Get upcoming corporate bond (TPDN BĐS) maturity calendar for real estate developers. Includes risk alerts for maturities within 7/14/30 days. Returns Vietnamese plain-text report.",
    {
      months: z.coerce.number().int().min(1).max(24).optional().default(6).describe("Look-ahead window in months (default: 6, max: 24)"),
    },
    async ({ months = 6 }) => {
      const db = _testDb ?? getDb();

      try {
        // Try DB first (has more up-to-date data), fall back to seed data
        let events: BondMaturityEvent[];
        try {
          const dbEvents = listUpcomingBonds(db, months);
          // If DB has data, use it; otherwise use seed data
          events = dbEvents.length > 0 ? dbEvents : getUpcomingMaturities(months);
        } catch {
          events = getUpcomingMaturities(months);
        }

        const alerts = checkMaturityAlerts(events);
        const text = formatBondCalendar(events, alerts);

        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (err) {
        logger.error("[get_bond_maturity_calendar] error", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [{ type: "text" as const, text: "Lỗi khi truy vấn lịch đáo hạn trái phiếu." }],
        };
      }
    },
  );
}
