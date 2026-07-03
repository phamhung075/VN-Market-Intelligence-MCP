/**
 * Task 245 — Legal Risk Signals MCP Tool
 * Task 1940a — Extended to also query agent_signals table (news-scout bus)
 * FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK — added `hours_back` (opt-in, additive)
 *
 * Registers the `get_legal_risk_signals` tool on a McpServer.
 *
 * Data sources merged:
 *   1. `alerts` table — written by alert-commander on confirmed alert events
 *   2. `agent_signals` table — written by news-scout via post_agent_signal
 *      (signal_type = 'legal_risk'). This is where PC1-style chairman arrest
 *      signals land and was previously invisible to this tool.
 *
 * FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK: the `days` default (30, unbounded from
 * alert-commander's perspective) is the root cause of a legal_risk CRITICAL
 * re-fire flood — alert-commander calls this tool bare every cycle (15min
 * market / 4h off-hours) and stage-signals.md routes ANY hit to CRITICAL
 * unconditionally, so a single event re-fires for up to 30 days. The shared
 * `days` DEFAULT is intentionally left untouched here — bctc-analyst,
 * digest-predict, unified-agent (x2) and fb-market-poster (x2) all call this
 * tool bare and rely on the 30-day breadth for evidence/summary purposes
 * unrelated to alert-firing; narrowing the shared default would silently
 * starve their visibility. Instead, `hours_back` is an additive, opt-in,
 * hour-granularity override (only alert-commander is expected to pass it)
 * that lets the ONE consumer with a re-fire problem bound its own call
 * tightly, matching the codebase's existing 360-min/6h legal_risk dedup
 * convention (see agentSignalTools.ts get_agent_signals hours_back doc +
 * __tests__/1948e-b-legal-risk-dispatch.test.ts windowMinutes=360).
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
// Shared cutoff helper (FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes the ISO cutoff timestamp for the look-back window.
 *
 * When `hoursBack` is provided it takes precedence over `days` — this is the
 * finer-grained, opt-in override alert-commander uses to bound its own call
 * (see module header). When omitted, falls back to day-granularity `days`
 * (unchanged default behaviour for all other callers).
 */
function computeCutoffIso(days: number, hoursBack?: number): string {
  if (hoursBack !== undefined) {
    return new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
  }
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff.toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Source 1: alerts table
// ─────────────────────────────────────────────────────────────────────────────

function queryAlertsTable(
  db: Database,
  stockCode: string | undefined,
  days: number,
  hoursBack?: number,
): LegalRiskRow[] {
  const cutoffStr = computeCutoffIso(days, hoursBack);

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
  hoursBack?: number,
): LegalRiskRow[] {
  const cutoffStr = computeCutoffIso(days, hoursBack);

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
    "Get recent legal risk signals (khởi tố, phong tỏa tài sản, truy thu thuế, etc.) for watchlist stocks. Merges data from alert-commander (alerts table) and news-scout (agent_signals table). Returns Vietnamese plain-text summary. " +
      "`hours_back` (FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK) is an additive, opt-in, hour-granularity override of `days` — pass hours_back=6 (matches the system's 360-min legal_risk dedup convention) to avoid re-surfacing a stale event across many alert-commander cycles. Omit for unchanged 30-day-default behaviour.",
    {
      stock: z.string().optional().describe("Stock ticker code to filter by (e.g. 'PC1'). Omit for all stocks."),
      days: z.coerce.number().int().min(1).max(90).optional().default(30).describe("Look-back window in days (default: 30, max: 90)"),
      hours_back: z.coerce.number().positive().max(720).optional().describe("Look-back window in HOURS — overrides `days` when provided. Finer-grained bound for callers (e.g. alert-commander) that need to avoid re-firing on the same stale signal across cycles. E.g. hours_back=6 covers the 360-min legal_risk dedup window."),
    },
    async ({ stock, days = 30, hours_back }) => {
      const db = _testDb ?? getDb();

      try {
        // Query both sources and merge
        const alertsRows = queryAlertsTable(db, stock, days, hours_back);
        const agentSignalRows = queryAgentSignalsTable(db, stock, days, hours_back);

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
