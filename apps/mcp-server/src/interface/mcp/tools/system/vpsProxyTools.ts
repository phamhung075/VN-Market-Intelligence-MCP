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
import { getVpsProxyHealth, getDemandQueueDepth } from "../../../../infrastructure/db/vpsPushLogStore.js";
import { getDb } from "../../../../infrastructure/db/schema.js";
import { formatHealth } from "./vpsProxyHealthFormat.js";
import type { Database } from "bun:sqlite";

// isStale()/formatHealth() and the market-hours/quiet-hours service-name
// constants moved to ./vpsProxyStaleness.ts + ./vpsProxyHealthFormat.ts
// (task FIX-CI-SIZELINT-MCPSERVER-SIX-UNCOVERED-OFFENDERS AC-4 — kept this
// file, the MCP tool registration entry point, under its size-lint baseline
// tolerance).

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

      // FIX-VPSHEALTH-DEMANDROUTE-EMPTYQUEUE-MISREPORTS-PROXY-UNREACHABLE:
      // resolve each service's demand-driven queue depth (null when the
      // route is cadence-driven or the probe fails — fail-open, no gate).
      const demandQueueDepths: Partial<Record<string, number | null>> = {};
      for (const s of services) {
        demandQueueDepths[s.service] = getDemandQueueDepth(db, s.service);
      }

      let output = formatHealth(services, undefined, demandQueueDepths);

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
