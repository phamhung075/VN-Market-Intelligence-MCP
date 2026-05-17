/**
 * Task 245 — Legal Risk Signals MCP Tool
 * Task 1940a — Extended to also query agent_signals table (news-scout bus)
 *
 * Registers the `get_legal_risk_signals` tool on a McpServer.
 *
 * Data sources merged:
 *   1. `alerts` table — written by alert-commander on confirmed alert events
 *   2. `agent_signals` table — written by news-scout via post_agent_signal
 *      (signal_type = 'legal_risk'). This is where PC1-style chairman arrest
 *      signals land and was previously invisible to this tool.
 *
 * @module interface/mcp/tools/legalRiskTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Database } from "bun:sqlite";
import { getDb } from "../../../../infrastructure/db/schema.js";
import { logger } from "../../../../infrastructure/logger.js";
import { detectLegalRisk } from "../../../../domain/services/legalRiskDetector.js";
import { SEVERITY_VI } from "./severityLabels.js";

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

/** Normalised row from either alerts or agent_signals. */
interface LegalRiskRow {
  id: string;
  triggeredAt: string;
  severity: string;
  message: string | null;
  source: "alerts" | "agent_signals";
}

// ─────────────────────────────────────────────────────────────────────────────
// Source 1: alerts table
// ─────────────────────────────────────────────────────────────────────────────

function queryAlertsTable(
  db: Database,
  stockCode: string | undefined,
  days: number,
): LegalRiskRow[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString();

  try {
    let rows: AlertRow[];
    if (stockCode) {
      rows = db.prepare(`
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
    } else {
      rows = db.prepare(`
        SELECT id, triggered_at, severity, signals_json, affected_actions_json, message
        FROM alerts
        WHERE triggered_at >= ?
          AND (signals_json LIKE '%legal_risk%' OR message LIKE '%PHÁP LÝ%' OR message LIKE '%legal%')
        ORDER BY triggered_at DESC
        LIMIT 50
      `).all(cutoffStr) as AlertRow[];
    }

    return rows.map((r) => ({
      id: String(r.id),
      triggeredAt: r.triggered_at,
      severity: r.severity,
      message: r.message,
      source: "alerts" as const,
    }));
  } catch (err) {
    logger.error("[legalRiskTools] alerts query error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Source 2: agent_signals table (news-scout bus)
// ─────────────────────────────────────────────────────────────────────────────

interface AgentSignalRow {
  id: number;
  created_at: string;
  stock_code: string | null;
  payload: string;
}

/**
 * Query agent_signals for signal_type = 'legal_risk'.
 *
 * When stockCode is provided: returns rows where stock_code = stockCode OR
 * stock_code IS NULL (broad/market-wide legal risk signals).
 * When stockCode is omitted: returns all legal_risk signals.
 *
 * Task 1940a: This was the missing query — news-scout chairman arrest signals
 * (PC1 #3318/#3343) were written here but never read by this tool.
 */
function queryAgentSignalsTable(
  db: Database,
  stockCode: string | undefined,
  days: number,
): LegalRiskRow[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString();

  // Check that agent_signals table exists in this DB (test DBs may not have it)
  try {
    db.prepare("SELECT id FROM agent_signals LIMIT 0").all();
  } catch {
    // Table absent — graceful degradation (e.g. old test DB)
    return [];
  }

  try {
    let rows: AgentSignalRow[];

    if (stockCode) {
      // Include signals matching the stock OR broad signals (null stock_code)
      rows = db.prepare(`
        SELECT id, created_at, stock_code, payload
        FROM agent_signals
        WHERE signal_type = 'legal_risk'
          AND created_at >= ?
          AND (stock_code = ? OR stock_code IS NULL)
        ORDER BY created_at DESC
        LIMIT 50
      `).all(cutoffStr, stockCode) as AgentSignalRow[];
    } else {
      rows = db.prepare(`
        SELECT id, created_at, stock_code, payload
        FROM agent_signals
        WHERE signal_type = 'legal_risk'
          AND created_at >= ?
        ORDER BY created_at DESC
        LIMIT 50
      `).all(cutoffStr) as AgentSignalRow[];
    }

    return rows.map((r) => {
      let title = "";
      let detail = "";
      try {
        const p = JSON.parse(r.payload) as Record<string, unknown>;
        title = typeof p["title"] === "string" ? p["title"] : "";
        detail = typeof p["detail"] === "string" ? p["detail"] : "";
      } catch {
        // malformed payload — ignore
      }
      const stockPart = r.stock_code ? ` [${r.stock_code}]` : "";
      const msg = [title, detail].filter(Boolean).join(" — ") || null;

      return {
        id: `as-${String(r.id)}`,
        triggeredAt: r.created_at,
        severity: "high", // legal_risk signals from news-scout are always high
        message: msg ? `${stockPart.trim() ? stockPart : ""}${msg}` : null,
        source: "agent_signals" as const,
      };
    });
  } catch (err) {
    logger.error("[legalRiskTools] agent_signals query error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatter
// ─────────────────────────────────────────────────────────────────────────────

function formatLegalRiskRows(rows: LegalRiskRow[]): string {
  if (rows.length === 0) {
    return "Không có tín hiệu rủi ro pháp lý nào trong khoảng thời gian này.";
  }

  const lines: string[] = [`Tìm thấy ${rows.length} tín hiệu rủi ro pháp lý:\n`];
  for (const row of rows) {
    const severityLabel = SEVERITY_VI[row.severity] ?? row.severity.toUpperCase();
    const sourceTag = row.source === "agent_signals" ? " [tin tức]" : "";

    lines.push(`[${severityLabel}${sourceTag}] ${row.triggeredAt.slice(0, 16)}`);
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
 * Merges data from two sources:
 *   - `alerts` table (alert-commander confirmed alerts)
 *   - `agent_signals` table (news-scout signal_type=legal_risk)
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
    "Get recent legal risk signals (khởi tố, phong tỏa tài sản, truy thu thuế, etc.) for watchlist stocks. Merges data from alert-commander (alerts table) and news-scout (agent_signals table). Returns Vietnamese plain-text summary.",
    {
      stock: z.string().optional().describe("Stock ticker code to filter by (e.g. 'PC1'). Omit for all stocks."),
      days: z.coerce.number().int().min(1).max(90).optional().default(30).describe("Look-back window in days (default: 30, max: 90)"),
    },
    async ({ stock, days = 30 }) => {
      const db = _testDb ?? getDb();

      try {
        // Query both sources and merge
        const alertsRows = queryAlertsTable(db, stock, days);
        const agentSignalRows = queryAgentSignalsTable(db, stock, days);

        // Merge, sort by triggeredAt descending, cap at 100
        const merged = [...alertsRows, ...agentSignalRows]
          .sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt))
          .slice(0, 100);

        const text = formatLegalRiskRows(merged);

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
