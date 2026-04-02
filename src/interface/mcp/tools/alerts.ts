/**
 * Task 086 — Alert MCP Tools
 * Task 241 — Merge get_alerts + get_price_alerts into one tool
 *
 * Interface layer: registers alert management MCP tools on a McpServer instance.
 *
 * Tools registered:
 *   1. get_alerts            — query system alerts (alerts table) and/or price alerts
 *                              (price_alerts table). type="system"|"price"|"all"
 *   2. mark_alert_read       — mark one or all unread alerts as read
 *   3. get_analysis_history  — retrieve past RAG analysis entries
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

interface PriceRow {
  code: string;
  price: number | null;
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
function padCol(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

/**
 * Render the Vietnamese-language price alerts table for use inside get_alerts type="price"|"all".
 */
function formatPriceAlertsSection(
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
    `${padCol("Ma", 6)}| ${padCol("Loai", 12)}| ${padCol("Nguong", 12)}| ${padCol("Gia hien tai", 14)}| Trang thai`,
    "-".repeat(65),
  ];

  for (const row of rows) {
    const loai = row.alert_type === "stop_loss" ? "Stop-loss" : "Take-profit";
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
      `${padCol(row.code, 6)}| ${padCol(loai, 12)}| ${padCol(nguong, 12)}| ${padCol(giaHienTai, 14)}| ${trangThai}`,
    );
  }

  lines.push("");
  lines.push(`Tong: ${rows.length} canh bao (${active.length} hoat dong)`);
  return lines.join("\n");
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
      "Use type='system' for signal alerts (price drop, news, BCTC reports), " +
      "type='price' for stop-loss/take-profit threshold alerts, " +
      "or type='all' (default) for both sections combined. " +
      "Filter by severity level, unread-only flag, specific stock code, or date range.",
    {
      type: z
        .enum(["system", "price", "all"])
        .default("all")
        .describe(
          "Which alert table to query: 'system' (signal alerts), " +
          "'price' (stop-loss/take-profit), or 'all' (both). Default: 'all'",
        ),
      severity: z
        .enum(["low", "medium", "high", "critical", "all"])
        .default("all")
        .describe("Filter by severity level (default: all). Applies to system alerts only."),
      unreadOnly: z
        .boolean()
        .default(false)
        .describe("When true, returns only unread system alerts"),
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
        .describe("Return system alerts from the last N days (default: 7, max: 90)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe("Maximum number of system alerts to return (default: 20)"),
      priceStatusFilter: z
        .enum(["all", "active", "triggered", "cancelled"])
        .default("active")
        .describe(
          "Filter price alerts by status. Default: 'active' (only live threshold alerts). " +
          "Applies to price alerts only.",
        ),
    },
    async ({
      type: typeRaw,
      severity: severityRaw,
      unreadOnly: unreadOnlyRaw,
      actionCode,
      limitDays: limitDaysRaw,
      limit: limitRaw,
      priceStatusFilter: priceStatusFilterRaw,
    }) => {
      // Apply defaults manually — Zod defaults only apply through MCP SDK's Zod parsing,
      // not when tools are called directly in tests.
      const type = typeRaw ?? "all";
      const severity = severityRaw ?? "all";
      const unreadOnly = unreadOnlyRaw ?? false;
      const limitDays = limitDaysRaw ?? 7;
      const limit = limitRaw ?? 20;
      const priceStatusFilter = priceStatusFilterRaw ?? "active";

      try {
        await initDatabase();
        const db = getDb();

        const outputSections: string[] = [];

        // ── System alerts section ──────────────────────────────────────────
        if (type === "system" || type === "all") {
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
            outputSections.push(`System Alerts — No alerts found (${filterDesc.join(", ")}).`);
          } else {
            const header = `System Alerts — ${rows.length} found (last ${limitDays} days)`;
            outputSections.push([header, "", ...rows.map(formatAlertRow)].join("\n"));
          }
        }

        // ── Price alerts section ───────────────────────────────────────────
        if (type === "price" || type === "all") {
          let priceAlertRows: PriceAlertRow[];
          try {
            if (priceStatusFilter === "all") {
              priceAlertRows = db
                .query<PriceAlertRow, []>(
                  "SELECT * FROM price_alerts ORDER BY created_at DESC",
                )
                .all();
            } else {
              priceAlertRows = db
                .query<PriceAlertRow, [string]>(
                  "SELECT * FROM price_alerts WHERE status = ? ORDER BY created_at DESC",
                )
                .all(priceStatusFilter);
            }

            // Filter by actionCode if provided
            if (actionCode) {
              const upper = actionCode.toUpperCase();
              priceAlertRows = priceAlertRows.filter((r) => r.code === upper);
            }
          } catch {
            // price_alerts table may not exist yet
            priceAlertRows = [];
          }

          // Fetch current prices for display
          const codes = [...new Set(priceAlertRows.map((r) => r.code))];
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

          outputSections.push(formatPriceAlertsSection(priceAlertRows, priceMap));
        }

        return {
          content: [{ type: "text" as const, text: outputSections.join("\n\n---\n\n") }],
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

  // ── 3. run_daily_briefing — REMOVED (sprint-036 task 230)
  // Replaced by the scheduler-driven morningBriefingJob + Telegram delivery.
  // Implementation kept above for reference; not registered as MCP tool.

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
