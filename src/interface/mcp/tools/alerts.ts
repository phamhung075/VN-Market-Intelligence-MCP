/**
 * Task 086 — Alert MCP Tools
 *
 * Interface layer: registers four MCP tools on a McpServer instance.
 *
 * Tools registered:
 *   1. get_alerts            — query alert records from SQLite with optional filters
 *   2. mark_alert_read       — mark one or all unread alerts as read
 *   3. run_daily_briefing    — generate a structured daily briefing report
 *   4. get_analysis_history  — retrieve past RAG analysis entries
 *
 * All tools call `initDatabase()` lazily on first use so the module can be
 * imported without side effects.
 *
 * @module interface/mcp/tools/alerts
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getDb, initDatabase } from "../../../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// SQLite row types (subsets used in each tool)
// ─────────────────────────────────────────────────────────────────────────────

interface AlertRow {
  id: string;
  triggered_at: string;
  severity: string;
  signals_json: string | null;
  affected_actions_json: string | null;
  analysis_ids_json: string | null;
  message: string | null;
  read: number;
  user_note: string | null;
}

interface WatchlistRow {
  code: string;
  exchange: string;
  domain: string;
  alert_drop_pct: number;
  alert_rise_pct: number;
  alert_impact_min: number;
}

interface RagAnalysisRow {
  id: string;
  level: string;
  created_at: string;
  source_title: string | null;
  sentiment: string | null;
  impact_score: number | null;
  impact_direction: string | null;
  summary: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse the affected_actions_json field and extract stock codes.
 * Handles both `[{ code: "VCB" }]` (from storeAlerts) and plain string arrays.
 */
function parseAffectedCodes(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item: unknown) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "code" in item) {
          return String((item as { code: unknown }).code);
        }
        return null;
      })
      .filter((v): v is string => v !== null);
  } catch {
    return [];
  }
}

/**
 * Parse the signals_json field and extract signal type strings.
 */
function parseSignalTypes(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item: unknown) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "type" in item) {
          return String((item as { type: unknown }).type);
        }
        return null;
      })
      .filter((v): v is string => v !== null);
  } catch {
    return [];
  }
}

/** Format a single AlertRow for display. */
function formatAlertRow(row: AlertRow): string {
  const severityIcon: Record<string, string> = {
    low: "[LOW]",
    medium: "[MEDIUM]",
    high: "[HIGH]",
    critical: "[CRITICAL]",
  };

  const readMark = row.read ? "[read]" : "[unread]";
  const icon = severityIcon[row.severity] ?? `[${row.severity.toUpperCase()}]`;
  const codes = parseAffectedCodes(row.affected_actions_json).join(", ") || "—";
  const signalTypes = parseSignalTypes(row.signals_json).join(", ") || "—";
  const ts = row.triggered_at.slice(0, 16);

  const lines = [
    `${readMark} ${icon} ${ts}`,
    `  Stocks  : ${codes}`,
    `  Signals : ${signalTypes}`,
    `  Message : ${row.message ?? "—"}`,
  ];

  if (row.user_note) {
    lines.push(`  Note    : ${row.user_note}`);
  }

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the four alert management tools on an McpServer instance.
 *
 * @param server - The McpServer instance to register tools on.
 */
export function registerAlertTools(server: McpServer): void {

  // ── 1. get_alerts ────────────────────────────────────────────────────────
  server.tool(
    "get_alerts",
    "List investment alerts from the database. " +
      "Filter by severity level, unread-only flag, specific stock code, " +
      "or date range. Sorted by most recent first.",
    {
      severity: z
        .enum(["low", "medium", "high", "critical", "all"])
        .default("all")
        .describe("Filter by severity level (default: all)"),
      unreadOnly: z
        .boolean()
        .default(false)
        .describe("When true, returns only unread alerts"),
      actionCode: z
        .string()
        .optional()
        .describe("Filter alerts affecting a specific stock code, e.g. VCB"),
      limitDays: z
        .number()
        .int()
        .min(1)
        .max(90)
        .default(7)
        .describe("Return alerts from the last N days (default: 7, max: 90)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe("Maximum number of alerts to return (default: 20)"),
    },
    async ({ severity: severityRaw, unreadOnly: unreadOnlyRaw, actionCode, limitDays: limitDaysRaw, limit: limitRaw }) => {
      // Apply defaults manually — Zod defaults only apply through MCP SDK's Zod parsing,
      // not when tools are called directly in tests.
      const severity = severityRaw ?? "all";
      const unreadOnly = unreadOnlyRaw ?? false;
      const limitDays = limitDaysRaw ?? 7;
      const limit = limitRaw ?? 20;

      try {
        await initDatabase();
        const db = getDb();

        const since = new Date(Date.now() - limitDays * 86_400_000).toISOString();

        const conditions: string[] = ["triggered_at >= $since"];
        const params: Record<string, string | number> = { $since: since };

        if (severity !== "all") {
          conditions.push("severity = $severity");
          params["$severity"] = severity;
        }
        if (unreadOnly) {
          conditions.push("read = 0");
        }
        if (actionCode) {
          conditions.push("affected_actions_json LIKE $actionCode");
          params["$actionCode"] = `%${actionCode}%`;
        }

        params["$limit"] = limit;

        const whereClause = conditions.join(" AND ");
        const rows = db
          .prepare(
            `SELECT * FROM alerts WHERE ${whereClause} ORDER BY triggered_at DESC LIMIT $limit`,
          )
          .all(params) as AlertRow[];

        if (rows.length === 0) {
          const filterDesc: string[] = [`last ${limitDays} day${limitDays !== 1 ? "s" : ""}`];
          if (severity !== "all") filterDesc.push(`severity: ${severity}`);
          if (unreadOnly) filterDesc.push("unread only");
          if (actionCode) filterDesc.push(`stock: ${actionCode}`);

          return {
            content: [
              {
                type: "text" as const,
                text: `No alerts found (${filterDesc.join(", ")}).`,
              },
            ],
          };
        }

        const header = `Alerts — ${rows.length} found (last ${limitDays} days)`;
        const lines = [header, "", ...rows.map(formatAlertRow)];

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        console.error("[get_alerts] Error:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error retrieving alerts: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );

  // ── 2. mark_alert_read ───────────────────────────────────────────────────
  server.tool(
    "mark_alert_read",
    "Mark one specific alert (by ID) or all unread alerts as read. " +
      "Optionally attach a personal note to a specific alert.",
    {
      alertId: z
        .string()
        .optional()
        .describe(
          "ID of the specific alert to mark as read. " +
            "If omitted, ALL unread alerts are marked as read.",
        ),
      note: z
        .string()
        .max(500)
        .optional()
        .describe("Optional personal note / reaction to attach to this alert"),
    },
    async ({ alertId, note }) => {
      try {
        await initDatabase();
        const db = getDb();

        let changes: number;

        if (alertId) {
          changes = db
            .prepare(`UPDATE alerts SET read = 1, user_note = ? WHERE id = ?`)
            .run(note ?? null, alertId).changes;
        } else {
          changes = db
            .prepare(`UPDATE alerts SET read = 1 WHERE read = 0`)
            .run().changes;
        }

        const suffix = note ? " Note saved." : ".";
        return {
          content: [
            {
              type: "text" as const,
              text: `Marked ${changes} alert${changes !== 1 ? "s" : ""} as read${suffix}`,
            },
          ],
        };
      } catch (err) {
        console.error("[mark_alert_read] Error:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error marking alert as read: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );

  // ── 3. run_daily_briefing ────────────────────────────────────────────────
  server.tool(
    "run_daily_briefing",
    "Generate a structured daily market briefing. " +
      "Includes: date header, active unread alerts, watchlist stock list, " +
      "and a summary of recent analysis activity.",
    {},
    async () => {
      try {
        await initDatabase();
        const db = getDb();

        // Date header
        const now = new Date();
        const dateStr = now.toLocaleDateString("vi-VN", {
          timeZone: "Asia/Ho_Chi_Minh",
          weekday: "long",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });

        // Active unread alerts (last 24 hours)
        const since24h = new Date(Date.now() - 86_400_000).toISOString();
        const unreadAlerts = db
          .prepare(
            `SELECT * FROM alerts WHERE read = 0 AND triggered_at >= ? ORDER BY triggered_at DESC LIMIT 10`,
          )
          .all(since24h) as AlertRow[];

        // Watchlist
        const watchlistRows = db
          .prepare(`SELECT code, exchange, domain, alert_drop_pct, alert_rise_pct, alert_impact_min FROM watchlist ORDER BY domain, code`)
          .all() as WatchlistRow[];

        // Recent analyses (last 24 hours)
        const recentAnalyses = db
          .prepare(
            `SELECT COUNT(*) as cnt FROM rag_analyses WHERE created_at >= ?`,
          )
          .get(since24h) as { cnt: number };

        // ── Build briefing text ────────────────────────────────────────────
        const lines: string[] = [
          `=== VN Market Daily Briefing — ${dateStr} ===`,
          "",
        ];

        // Section 1: Active alerts
        lines.push("--- Active Alerts (last 24h) ---");
        if (unreadAlerts.length === 0) {
          lines.push("  No active alerts in the last 24 hours.");
        } else {
          lines.push(`  ${unreadAlerts.length} unread alert${unreadAlerts.length !== 1 ? "s" : ""}:`);
          for (const alert of unreadAlerts) {
            const codes = parseAffectedCodes(alert.affected_actions_json).join(", ") || "—";
            const severityTag = alert.severity.toUpperCase();
            lines.push(`  [${severityTag}] ${alert.triggered_at.slice(0, 16)} — ${codes}: ${alert.message ?? "—"}`);
          }
        }

        lines.push("");

        // Section 2: Watchlist
        lines.push("--- Watchlist ---");
        if (watchlistRows.length === 0) {
          lines.push("  Watchlist is empty. Use add_to_watchlist to track stocks.");
        } else {
          lines.push(`  ${watchlistRows.length} stock${watchlistRows.length !== 1 ? "s" : ""} tracked:`);
          for (const stock of watchlistRows) {
            lines.push(
              `  ${stock.code.padEnd(6)} [${stock.exchange}] ${stock.domain.padEnd(12)} ` +
              `Alerts: drop ${stock.alert_drop_pct}% | rise +${stock.alert_rise_pct}%`,
            );
          }
        }

        lines.push("");

        // Section 3: Analysis activity
        lines.push("--- Analysis Activity (last 24h) ---");
        lines.push(`  ${recentAnalyses.cnt} new analysis entr${recentAnalyses.cnt !== 1 ? "ies" : "y"} stored in RAG memory.`);

        lines.push("");
        lines.push("Run get_alerts for full alert details.");
        lines.push("Run get_analysis_history for recent analysis entries.");

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        console.error("[run_daily_briefing] Error:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error generating daily briefing: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );

  // ── 4. get_analysis_history ──────────────────────────────────────────────
  server.tool(
    "get_analysis_history",
    "Retrieve the history of AI analyses stored in the RAG database. " +
      "Filter by stock code, analysis level (global/country/domain/action), " +
      "or date range.",
    {
      actionCode: z
        .string()
        .optional()
        .describe("Filter analyses that mention this stock code, e.g. VCB"),
      domain: z
        .string()
        .optional()
        .describe("Filter by affected sector/domain, e.g. oil_gas, banking"),
      level: z
        .enum(["global", "country", "domain", "action"])
        .optional()
        .describe("Filter by analysis level in the causal hierarchy"),
      fromDate: z
        .string()
        .optional()
        .describe("Start of date range (ISO 8601), e.g. 2026-01-01"),
      toDate: z
        .string()
        .optional()
        .describe("End of date range (ISO 8601), e.g. 2026-12-31"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(10)
        .describe("Maximum number of entries to return (default: 10)"),
    },
    async ({ actionCode, domain, level, fromDate, toDate, limit }) => {
      try {
        await initDatabase();
        const db = getDb();

        const conditions: string[] = ["1 = 1"];
        const params: Record<string, string | number> = {};

        if (level) {
          conditions.push("level = $level");
          params["$level"] = level;
        }
        if (fromDate) {
          conditions.push("created_at >= $fromDate");
          params["$fromDate"] = fromDate;
        }
        if (toDate) {
          conditions.push("created_at <= $toDate");
          params["$toDate"] = toDate;
        }
        if (actionCode) {
          conditions.push("affected_actions LIKE $actionCode");
          params["$actionCode"] = `%${actionCode}%`;
        }
        if (domain) {
          conditions.push("affected_domains LIKE $domain");
          params["$domain"] = `%${domain}%`;
        }

        params["$limit"] = limit;

        const whereClause = conditions.join(" AND ");
        const rows = db
          .prepare(
            `SELECT id, level, created_at, source_title, sentiment,
                    impact_score, impact_direction, summary
             FROM rag_analyses
             WHERE ${whereClause}
             ORDER BY created_at DESC
             LIMIT $limit`,
          )
          .all(params) as RagAnalysisRow[];

        if (rows.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No analyses found matching the given filters.",
              },
            ],
          };
        }

        const header = `Analysis History — ${rows.length} entr${rows.length !== 1 ? "ies" : "y"}`;
        const lines: string[] = [header, ""];

        for (const row of rows) {
          const sentiment = row.sentiment ?? "unknown";
          const score = row.impact_score != null ? row.impact_score.toFixed(1) : "N/A";
          const direction = row.impact_direction ?? "neutral";
          const ts = row.created_at.slice(0, 16);
          const title = row.source_title ?? "(no title)";
          const summary = row.summary
            ? row.summary.length > 120
              ? row.summary.slice(0, 120) + "…"
              : row.summary
            : "";

          lines.push(
            `[${row.level.toUpperCase()}] ${ts} | ${sentiment} | impact ${score}/10 ${direction}`,
          );
          lines.push(`  ${title}`);
          if (summary) lines.push(`  ${summary}`);
          lines.push("");
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        console.error("[get_analysis_history] Error:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error retrieving analysis history: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );
}
