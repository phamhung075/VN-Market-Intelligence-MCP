/**
 * VPS Service Health MCP Tool — Task 234
 *
 * Provides real-time query access to VPS health polling results.
 * Returns formatted ASCII table with service status, response times, and uptime.
 *
 * @module interface/mcp/tools/system/vpsHealthTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb } from "../../../../infrastructure/db/schema.js";
import type { Database } from "bun:sqlite";

interface HealthRecord {
  service_name: string;
  polled_at: string;
  health_status: string;
  response_time_ms: number | null;
  last_successful_run: string | null;
  uptime_seconds: number | null;
  error_message: string | null;
}

/**
 * Format seconds into human-readable "Xd Yh Zm" format
 */
function formatUptime(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "-";

  const days = Math.floor(seconds / (24 * 60 * 60));
  const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((seconds % (60 * 60)) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);

  return parts.length > 0 ? parts.join(" ") : "0m";
}

/**
 * Parse ISO timestamp and return relative time string (e.g., "2 min ago")
 */
function formatTimeAgo(isoTimestamp: string): string {
  try {
    const pollTime = new Date(isoTimestamp).getTime();
    const now = Date.now();
    const diffMs = now - pollTime;

    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return `${seconds}s ago`;
  } catch {
    return isoTimestamp;
  }
}

/**
 * Format health records as ASCII table
 */
function formatHealthTable(records: HealthRecord[]): string {
  const lines: string[] = [
    "=== VPS SERVICE HEALTH ===",
    "",
    "Service         | Status      | Last Poll  | Response(ms) | VPS Uptime",
    "----------------|-------------|------------|--------------|---------------",
  ];

  for (const r of records) {
    const service = r.service_name.padEnd(16);
    const status = r.health_status.padEnd(12);
    const lastPoll = formatTimeAgo(r.polled_at).padEnd(11);
    const response = (r.response_time_ms?.toString() ?? "-").padEnd(13);
    const uptime = formatUptime(r.uptime_seconds ?? null);

    lines.push(
      `${service}| ${status}| ${lastPoll}| ${response}| ${uptime}`
    );
  }

  // Summary
  lines.push("");
  const healthyCount = records.filter((r) => r.health_status === "healthy").length;
  const unhealthyCount = records.filter((r) => r.health_status === "unhealthy").length;
  const unreachableCount = records.filter((r) => r.health_status === "unreachable").length;
  const idleCount = records.filter((r) => r.health_status === "idle").length;

  const summaryParts = [`${healthyCount} healthy`];
  if (idleCount > 0) summaryParts.push(`${idleCount} idle (market closed)`);
  if (unhealthyCount > 0) summaryParts.push(`${unhealthyCount} unhealthy`);
  if (unreachableCount > 0) summaryParts.push(`${unreachableCount} unreachable`);

  lines.push(`Summary: ${summaryParts.join(", ")}`);

  // idle is NOT an alert condition — only unhealthy/unreachable trigger the alert line
  if (unreachableCount > 0 || unhealthyCount > 0) {
    const problems = [];
    if (unreachableCount > 0) problems.push(`${unreachableCount} unreachable`);
    if (unhealthyCount > 0) problems.push(`${unhealthyCount} unhealthy`);
    lines.push(`ALERT: ${problems.join(", ")} — VPS services may be down or network latency high`);
  }

  return lines.join("\n");
}

export function registerVpsHealthTools(
  server: McpServer,
  _testDb?: Database,
): void {
  server.tool(
    "get_vps_service_health",
    "Returns formatted table showing health status of all 5 VPS services " +
    "(vn-price-fetch, vn-bctc-fetch, vn-news-fetch, vn-sbv-fetch, vn-foreign-flow). " +
    "Shows last poll time, health status (healthy/unhealthy/unreachable), " +
    "response time in milliseconds, and uptime. " +
    "Useful for diagnosing VPS connectivity issues and service availability.",
    {
      service_name: z
        .enum(["all", "vn-price-fetch", "vn-bctc-fetch", "vn-news-fetch", "vn-sbv-fetch", "vn-foreign-flow"])
        .optional()
        .default("all")
        .describe("Filter to a specific service, or 'all' to show all 5 services"),
    },
    async ({ service_name }) => {
      const db = _testDb ?? getDb();

      try {
        // Get the most recent poll for each service
        let query = `
          SELECT
            service_name,
            polled_at,
            health_status,
            response_time_ms,
            last_successful_run,
            uptime_seconds,
            error_message
          FROM vps_service_health
          WHERE (service_name, polled_at) IN (
            SELECT service_name, MAX(polled_at)
            FROM vps_service_health
            GROUP BY service_name
          )
        `;

        const params: any[] = [];

        if (service_name !== "all") {
          query += ` AND service_name = ?`;
          params.push(service_name);
        }

        query += ` ORDER BY service_name`;

        const records = db.prepare(query).all(...params) as HealthRecord[];

        if (records.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No VPS health records found. Health polling may not have run yet.",
              },
            ],
          };
        }

        const formatted = formatHealthTable(records);

        return {
          content: [{ type: "text" as const, text: formatted }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error retrieving VPS health data: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );
}
