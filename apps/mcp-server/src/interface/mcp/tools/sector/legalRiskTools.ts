/**
 * Task 245 — Legal Risk Signals MCP Tool
 *
 * Registers the `get_legal_risk_signals` tool on a McpServer.
 * Queries the alerts table for legal_risk signal type, optionally filtered
 * by stock code and recency window.
 *
 * @module interface/mcp/tools/legalRiskTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Database } from "bun:sqlite";
import { getDb } from "../../../../infrastructure/db/schema.js";
import { logger } from "../../../../infrastructure/logger.js";
import { detectLegalRisk } from "../../../../domain/services/legalRiskDetector.js";

// ─────────────────────────────────────────────────────────────────────────────
// Internal types
// ─────────────────────────────────────────────────────────────────────────────

interface AlertRow {
  id: string;
  triggered_at: string;
  severity: string;
  signals_json: string | null;
  affected_actions_json: string | null;
  message: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Query recent legal_risk alerts from the alerts table.
 * Scans alerts that mention legal risk keywords in the message field.
 */
function queryLegalRiskAlerts(
  db: Database,
  stockCode: string | undefined,
  days: number,
): AlertRow[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString();

  try {
    if (stockCode) {
      return db.prepare(`
        SELECT id, triggered_at, severity, signals_json, affected_actions_json, message
        FROM alerts
        WHERE triggered_at >= ?
          AND (
            affected_actions_json LIKE ?
            OR message LIKE ?
          )
        ORDER BY triggered_at DESC
        LIMIT 50
      `).all(cutoffStr, `%${stockCode}%`, `%legal%`) as AlertRow[];
    }

    return db.prepare(`
      SELECT id, triggered_at, severity, signals_json, affected_actions_json, message
      FROM alerts
      WHERE triggered_at >= ?
        AND (signals_json LIKE '%legal_risk%' OR message LIKE '%PHÁP LÝ%' OR message LIKE '%legal%')
      ORDER BY triggered_at DESC
      LIMIT 50
    `).all(cutoffStr) as AlertRow[];
  } catch (err) {
    logger.error("[legalRiskTools] query error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

function formatAlerts(rows: AlertRow[]): string {
  if (rows.length === 0) {
    return "Không có tín hiệu rủi ro pháp lý nào trong khoảng thời gian này.";
  }

  const lines: string[] = [`Tìm thấy ${rows.length} tín hiệu rủi ro pháp lý:\n`];
  for (const row of rows) {
    const severityLabel =
      row.severity === "critical" ? "NGHIÊM TRỌNG" :
      row.severity === "high" ? "QUAN TRỌNG" :
      row.severity === "medium" ? "LƯU Ý" : "THẤP";

    lines.push(`[${severityLabel}] ${row.triggered_at.slice(0, 16)}`);
    if (row.message) lines.push(`  ${row.message}`);
    lines.push("");
  }

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the `get_legal_risk_signals` MCP tool.
 *
 * @param server   - McpServer instance to register the tool on
 * @param _testDb  - Optional in-memory SQLite DB for testing
 */
export function registerLegalRiskTools(
  server: McpServer,
  _testDb?: Database,
): void {
  server.tool(
    "get_legal_risk_signals",
    "Get recent legal risk signals (khởi tố, phong tỏa tài sản, truy thu thuế, etc.) for watchlist stocks. Returns Vietnamese plain-text summary.",
    {
      stock: z.string().optional().describe("Stock ticker code to filter by (e.g. 'VCB'). Omit for all stocks."),
      days: z.coerce.number().int().min(1).max(90).optional().default(30).describe("Look-back window in days (default: 30, max: 90)"),
    },
    async ({ stock, days = 30 }) => {
      const db = _testDb ?? getDb();

      try {
        const rows = queryLegalRiskAlerts(db, stock, days);
        const text = formatAlerts(rows);

        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (err) {
        logger.error("[get_legal_risk_signals] error", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [{ type: "text" as const, text: "Lỗi khi truy vấn tín hiệu rủi ro pháp lý." }],
        };
      }
    },
  );
}
