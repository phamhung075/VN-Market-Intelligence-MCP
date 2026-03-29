/**
 * System Tools — MCP diagnostic + log tools for AI self-debugging
 *
 * Tools registered:
 *   1. get_system_health  — circuit breaker status, recent errors, DB size, uptime
 *   2. get_global_log     — quick scan: last N lines from global.log (one-liners)
 *   3. get_tool_log       — deep debug: last N lines from a specific tool log
 *   4. get_error_summary  — only WARN/ERROR lines from global log
 *
 * @module interface/mcp/tools/systemTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { statSync } from "node:fs";
import { resolve } from "node:path";

import { getAllBreakerStats } from "../../../infrastructure/circuitBreakerRegistry.js";
import { getDb, initDatabase } from "../../../infrastructure/db/schema.js";
import { logger, readGlobalLog, readToolLog, listToolLogs, getErrorSummary } from "../../../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// SQLite row type
// ─────────────────────────────────────────────────────────────────────────────

interface SystemLogRow {
  id: number;
  timestamp: string;
  level: string;
  source: string;
  message: string;
  resolved: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Format bytes into a human-readable string. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Format uptime seconds into d h m s. */
function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

/** Get DB file size, returns null if not accessible (e.g. :memory:). */
function getDbFileSize(dbPath: string): string {
  try {
    const abs = resolve(process.cwd(), dbPath);
    const stat = statSync(abs);
    return formatBytes(stat.size);
  } catch {
    return "N/A";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register system health MCP tools: get_system_health.
 *
 * @param server The McpServer instance to register tools on.
 */
export function registerSystemTools(server: McpServer): void {

  server.tool(
    "get_system_health",
    "Diagnostic tool that shows the health of all VN Market Intelligence MCP components. " +
      "Returns circuit breaker status for every data source, recent system errors, " +
      "database file size, process uptime, and last successful fetch timestamps per source.",
    {},
    async () => {
      try {
        await initDatabase();
        const db = getDb();

        const lines: string[] = [
          "=== VN Market Intelligence MCP — System Health ===",
          `Generated: ${new Date().toISOString()}`,
          `uptime: ${formatUptime(Math.floor(process.uptime()))}`,
          "",
        ];

        // ── Circuit Breaker Status ────────────────────────────────────────────
        lines.push("--- Circuit Breaker Status ---");
        const stats = getAllBreakerStats();
        const stateIcon = (s: string) => s === "closed" ? "[OK]" : s === "open" ? "[OPEN]" : "[HALF]";
        for (const [source, info] of Object.entries(stats)) {
          lines.push(
            `  ${source.padEnd(20)} ${stateIcon(info.state).padEnd(8)} failures: ${info.failures}`,
          );
        }
        lines.push("");

        // ── Database Info ─────────────────────────────────────────────────────
        lines.push("--- Database ---");
        const dbPath = Bun.env["DB_PATH"] ?? "./data/market.db";
        lines.push(`  path:  ${dbPath}`);
        lines.push(`  size:  ${getDbFileSize(dbPath)}`);
        lines.push("");

        // ── Recent System Errors (last 10 unresolved) ─────────────────────────
        lines.push("--- Recent System Errors (last 10 unresolved) ---");
        let errorRows: SystemLogRow[] = [];
        try {
          errorRows = db
            .query<SystemLogRow, []>(
              `SELECT id, timestamp, level, source, message, resolved
               FROM system_logs
               WHERE level IN ('error', 'warn') AND resolved = 0
               ORDER BY timestamp DESC
               LIMIT 10`,
            )
            .all();
        } catch {
          // system_logs table may not exist yet
        }

        if (errorRows.length === 0) {
          lines.push("  (none)");
        } else {
          for (const row of errorRows) {
            const ts = row.timestamp.slice(0, 19);
            lines.push(`  [${row.level.toUpperCase()}] ${ts}  ${row.source}: ${row.message.slice(0, 120)}`);
          }
        }
        lines.push("");

        // ── Summary counts ────────────────────────────────────────────────────
        const openBreakers = Object.values(stats).filter(s => s.state === "open").length;
        const halfOpenBreakers = Object.values(stats).filter(s => s.state === "half-open").length;

        lines.push("--- Summary ---");
        lines.push(`  Open circuits:      ${openBreakers}`);
        lines.push(`  Half-open circuits: ${halfOpenBreakers}`);
        lines.push(`  Unresolved errors:  ${errorRows.length}`);

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        logger.error("[get_system_health] Error", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Error retrieving system health: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );

  // ── get_global_log — quick AI scan of recent activity ──────────────────
  server.tool(
    "get_global_log",
    "Read the last N lines from the global log file (data/logs/global.log). " +
      "Each line is a one-liner summary: [timestamp] [LEVEL] [source] message. " +
      "Use this for a quick scan of system activity and to spot problems fast.",
    {
      lines: z.number().int().min(1).max(500).default(50)
        .describe("Number of recent log lines to return (default: 50)"),
    },
    async ({ lines: n }) => {
      const content = readGlobalLog(n ?? 50);
      return { content: [{ type: "text" as const, text: content }] };
    },
  );

  // ── get_tool_log — deep debug for specific tool/module ─────────────────
  server.tool(
    "get_tool_log",
    "Read detailed log entries for a specific tool or module (data/logs/tool-{name}.log). " +
      "Each line is a full JSON object with timestamp, level, message, and all context fields. " +
      "Use this to find the root cause of a problem after identifying it in the global log. " +
      "Call with tool='list' to see all available tool logs.",
    {
      tool: z.string().min(1).max(50)
        .describe("Tool/module name (e.g. 'ssc', 'cafef', 'hose', 'telegram'). Use 'list' to see available logs."),
      lines: z.number().int().min(1).max(500).default(100)
        .describe("Number of recent log lines to return (default: 100)"),
    },
    async ({ tool: toolName, lines: n }) => {
      if (toolName === "list") {
        const tools = listToolLogs();
        if (tools.length === 0) {
          return { content: [{ type: "text" as const, text: "No tool logs found yet. Logs are created when tools run." }] };
        }
        return { content: [{ type: "text" as const, text: `Available tool logs:\n${tools.map(t => `  - ${t}`).join("\n")}` }] };
      }
      const content = readToolLog(toolName, n ?? 100);
      return { content: [{ type: "text" as const, text: content }] };
    },
  );

  // ── get_error_summary — WARN + ERROR lines only ────────────────────────
  server.tool(
    "get_error_summary",
    "Extract only WARN and ERROR lines from the global log. " +
      "Use this as the first step when investigating a problem — it filters out " +
      "all INFO/DEBUG noise and shows only issues that need attention.",
    {
      lines: z.number().int().min(1).max(200).default(30)
        .describe("Number of recent error/warning lines to return (default: 30)"),
    },
    async ({ lines: n }) => {
      const content = getErrorSummary(n ?? 30);
      return { content: [{ type: "text" as const, text: content }] };
    },
  );
}
