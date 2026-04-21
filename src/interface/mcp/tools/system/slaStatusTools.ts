/**
 * Data Freshness SLA Status MCP Tool — Task 234
 *
 * Provides real-time query access to signal source data freshness.
 * Returns formatted ASCII table with age, thresholds, breach status, and severity.
 *
 * @module interface/mcp/tools/system/slaStatusTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb } from "../../../../infrastructure/db/schema.js";
import type { Database } from "bun:sqlite";

interface SlaStatusRow {
  signal_type: string;
  age_minutes: number;
  threshold_minutes: number;
  status: string;
  severity: string | null;
}

/**
 * Query signal ages from source tables
 */
function querySignalAges(db: Database): Record<string, number> {
  const now = Math.floor(Date.now() / 1000);

  interface AgeRow {
    signal_type: string;
    age_minutes: number;
  }

  const rows = db
    .query<AgeRow, [number, number, number, number, number]>(
      `SELECT
        'price' as signal_type,
        CAST((? - CAST((SELECT MAX(created_at) FROM market_prices) as INTEGER)) / 60 AS INTEGER) as age_minutes
      UNION ALL
      SELECT
        'bctc' as signal_type,
        CAST((? - CAST((SELECT MAX(created_at) FROM financial_reports) as INTEGER)) / 60 AS INTEGER) as age_minutes
      UNION ALL
      SELECT
        'news' as signal_type,
        CAST((? - CAST((SELECT MAX(created_at) FROM news) as INTEGER)) / 60 AS INTEGER) as age_minutes
      UNION ALL
      SELECT
        'sbv_fx' as signal_type,
        CAST((? - CAST((SELECT MAX(created_at) FROM macro_sbv_rates) as INTEGER)) / 60 AS INTEGER) as age_minutes
      UNION ALL
      SELECT
        'foreign_flow' as signal_type,
        CAST((? - CAST((SELECT MAX(created_at) FROM foreign_flow) as INTEGER)) / 60 AS INTEGER) as age_minutes`
    )
    .all(now, now, now, now, now) as AgeRow[];

  const result: Record<string, number> = {
    price: 0,
    bctc: 0,
    news: 0,
    sbv_fx: 0,
    foreign_flow: 0,
  };

  for (const row of rows) {
    result[row.signal_type] = Math.max(0, row.age_minutes);
  }

  return result;
}

/**
 * Get SLA thresholds for each signal type
 */
function getSlaThresholds(signalType: string, isMarketHours: boolean): number {
  const thresholds: Record<string, { market: number; offHours: number }> = {
    price: { market: 10, offHours: 10 },
    bctc: { market: 120, offHours: 360 },
    news: { market: 30, offHours: 30 },
    sbv_fx: { market: 30, offHours: 30 },
    foreign_flow: { market: 10, offHours: 10 },
  };

  const t = thresholds[signalType] ?? { market: 60, offHours: 60 };
  return isMarketHours ? t.market : t.offHours;
}

/**
 * Check if current time is VN market hours (09:00-15:00 VN time = 02:00-08:00 UTC)
 */
function isVnMarketHours(): boolean {
  const utcHour = new Date().getUTCHours();
  const utcDay = new Date().getUTCDay();

  // Market hours: 02:00-08:59 UTC (09:00-15:59 VN), Mon-Fri
  const isWeekday = utcDay >= 1 && utcDay <= 5;
  const isDuringMarket = utcHour >= 2 && utcHour < 9;

  return isWeekday && isDuringMarket;
}

/**
 * Determine severity based on age vs threshold
 */
function getSeverity(ageMinutes: number, thresholdMinutes: number): string {
  if (ageMinutes <= thresholdMinutes) {
    return "-";
  }

  const ratio = ageMinutes / thresholdMinutes;
  if (ratio > 1.5) {
    return "CRITICAL";
  }

  return "HIGH";
}

/**
 * Format SLA status records as ASCII table
 */
function formatSlaTable(records: SlaStatusRow[]): string {
  const lines: string[] = [
    "=== DATA FRESHNESS SLA STATUS ===",
    "",
    "Signal Type  | Age (min) | SLA (min) | Status    | Severity",
    "-------------|-----------|-----------|-----------|----------",
  ];

  for (const r of records) {
    const signalType = r.signal_type.padEnd(12);
    const age = String(r.age_minutes).padEnd(10);
    const threshold = String(r.threshold_minutes).padEnd(10);
    const status = r.status.padEnd(10);
    const severity = r.severity ?? "-";

    lines.push(
      `${signalType}| ${age}| ${threshold}| ${status}| ${severity}`
    );
  }

  // Summary
  lines.push("");
  const breachedCount = records.filter((r) => r.status === "breached").length;
  const okCount = records.filter((r) => r.status === "ok").length;

  lines.push(`Summary: ${okCount} ok, ${breachedCount} breached`);

  if (breachedCount > 0) {
    const breached = records
      .filter((r) => r.status === "breached")
      .map((r) => `${r.signal_type} (${r.age_minutes}/${r.threshold_minutes}min)`)
      .join(", ");
    lines.push(`ALERT: SLA breached on: ${breached}`);
  }

  return lines.join("\n");
}

export function registerSlaStatusTools(
  server: McpServer,
  _testDb?: Database,
): void {
  server.tool(
    "get_sla_status",
    "Returns formatted table showing data freshness SLA status for all 5 signal sources " +
    "(price, bctc, news, sbv_fx, foreign_flow). " +
    "Shows current data age in minutes, SLA threshold, breach status (ok/breached), " +
    "and severity (-, HIGH, CRITICAL). " +
    "Useful for monitoring data pipeline health and detecting stale sources.",
    {
      signal_type: z
        .enum(["all", "price", "bctc", "news", "sbv_fx", "foreign_flow"])
        .optional()
        .default("all")
        .describe("Filter to a specific signal type, or 'all' to show all 5 types"),
    },
    async ({ signal_type }) => {
      const db = _testDb ?? getDb();

      try {
        // Query current signal ages
        const ages = querySignalAges(db);
        const isMarketHours = isVnMarketHours();

        // Build status records
        const records: SlaStatusRow[] = [];
        const signalTypes = ["price", "bctc", "news", "sbv_fx", "foreign_flow"];

        for (const sig of signalTypes) {
          if (signal_type !== "all" && sig !== signal_type) {
            continue;
          }

          const age = ages[sig] ?? 0;
          const threshold = getSlaThresholds(sig, isMarketHours);
          const status = age <= threshold ? "ok" : "breached";
          const severity = status === "ok" ? null : getSeverity(age, threshold);

          records.push({
            signal_type: sig,
            age_minutes: age,
            threshold_minutes: threshold,
            status,
            severity,
          });
        }

        if (records.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No SLA status data available.",
              },
            ],
          };
        }

        const formatted = formatSlaTable(records);

        return {
          content: [{ type: "text" as const, text: formatted }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error retrieving SLA status: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );
}
