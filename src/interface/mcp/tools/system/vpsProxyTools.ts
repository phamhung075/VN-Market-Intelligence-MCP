/**
 * VPS Proxy Health MCP Tool
 *
 * Provides observability into the 4 VPS proxy services:
 * prices, news, sbv, bctc — showing last push time, item counts,
 * error rates, and staleness warnings.
 *
 * @module interface/mcp/tools/vpsProxyTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getVpsProxyHealth, type VpsServiceHealth } from "../../../../infrastructure/db/vpsPushLogStore.js";
import { getDb } from "../../../../infrastructure/db/schema.js";
import type { Database } from "bun:sqlite";

// Expected push intervals per service (minutes)
const EXPECTED_INTERVALS: Record<string, number> = {
  prices: 5,    // every 60s during market hours, allow 5min slack
  news: 10,     // every 5min, allow 10min slack
  sbv: 60,      // every 30min, allow 60min slack
  bctc: 720,    // every 6h, allow 12h slack
};

function formatHealth(services: VpsServiceHealth[]): string {
  const lines: string[] = [
    "=== VPS PROXY HEALTH ===",
    "",
    "Service     | Last Push           | Items | Status  | 24h Pushes | 24h Errors | Stale?",
    "------------|---------------------|-------|---------|------------|------------|-------",
  ];

  for (const s of services) {
    const lastPush = s.lastPushAt ?? "never";
    const stale = isStale(s);
    const staleFlag = stale ? "YES" : "no";

    lines.push(
      `${s.service.padEnd(12)}| ${lastPush.padEnd(20)}| ${String(s.lastItemsCount).padEnd(6)}| ${s.lastStatus.padEnd(8)}| ${String(s.pushes24h).padEnd(11)}| ${String(s.errors24h).padEnd(11)}| ${staleFlag}`,
    );
  }

  // Summary
  const staleServices = services.filter(isStale);
  const errorServices = services.filter((s) => s.errors24h > 0);

  lines.push("");
  if (staleServices.length > 0) {
    lines.push(`STALE: ${staleServices.map((s) => s.service).join(", ")} — VPS may be down or unreachable`);
  }
  if (errorServices.length > 0) {
    lines.push(`ERRORS: ${errorServices.map((s) => `${s.service}(${s.errors24h})`).join(", ")}`);
  }
  if (staleServices.length === 0 && errorServices.length === 0) {
    lines.push("All VPS proxy services healthy.");
  }

  // Recent push log (last 10 across all services)
  lines.push("");
  lines.push("--- Recent Push Log (last 10) ---");

  return lines.join("\n");
}

function isStale(s: VpsServiceHealth): boolean {
  if (!s.lastPushAt) return true;
  const expectedMin = EXPECTED_INTERVALS[s.service] ?? 60;
  const ageMs = Date.now() - new Date(s.lastPushAt + "Z").getTime();
  return ageMs > expectedMin * 60 * 1000;
}

export function registerVpsProxyTools(
  server: McpServer,
  _testDb?: Database,
): void {
  server.tool(
    "get_vps_proxy_health",
    "Shows health status of all 4 VPS proxy services (prices, news, sbv, bctc). " +
    "Displays last push timestamp, item counts, error rates, and staleness warnings. " +
    "Use to debug VPS connectivity, geo-block bypass, and data freshness issues.",
    {
      service: z
        .enum(["all", "prices", "news", "sbv", "bctc"])
        .optional()
        .default("all")
        .describe("Filter to a specific service, or 'all' (default)"),
    },
    async ({ service }) => {
      const db = _testDb ?? getDb();
      let services = getVpsProxyHealth(db);

      if (service !== "all") {
        services = services.filter((s) => s.service === service);
      }

      let output = formatHealth(services);

      // Append recent log entries
      const logRows = db.prepare(
        `SELECT service, items_count, status, error_msg, duration_ms, pushed_at
         FROM vps_push_log
         ORDER BY pushed_at DESC LIMIT 10`,
      ).all() as Array<{
        service: string;
        items_count: number;
        status: string;
        error_msg: string | null;
        duration_ms: number | null;
        pushed_at: string;
      }>;

      if (logRows.length > 0) {
        for (const row of logRows) {
          const dur = row.duration_ms ? `${row.duration_ms}ms` : "-";
          const err = row.error_msg ? ` [${row.error_msg.slice(0, 60)}]` : "";
          output += `\n  ${row.pushed_at} | ${row.service.padEnd(8)} | ${row.status.padEnd(5)} | ${String(row.items_count).padEnd(5)} items | ${dur}${err}`;
        }
      } else {
        output += "\n  (no push logs yet — VPS services may not have run)";
      }

      return {
        content: [{ type: "text" as const, text: output }],
      };
    },
  );
}
