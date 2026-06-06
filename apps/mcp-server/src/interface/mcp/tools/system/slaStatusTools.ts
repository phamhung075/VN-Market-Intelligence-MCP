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
import {
  DEFAULT_SLA_CONFIG,
  isVnMarketHours as domainIsVnMarketHours,
  getSlaThreshold,
  MARKET_HOURS_ONLY_SOURCES,
  type SignalType,
} from "../../../../domain/services/freshnessSlaChecker.js";
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

  // COMPLETE TABLE/COLUMN FIX (all 5 signals):
  //   price        — market_prices.updated_at (ISO string → strftime epoch)
  //   bctc         — financial_reports.parsed_at (ISO string → strftime epoch)
  //   news         — rag_analyses.created_at (ISO string → strftime epoch)
  //   sbv_fx       — sbv_rates.fetched_at (ISO string → strftime epoch)
  //   foreign_flow — daily_ohlcv.updated_at WHERE foreign_buy_vol IS NOT NULL
  const rows = db
    .query<AgeRow, [number, number, number, number, number]>(
      `SELECT
        'price' as signal_type,
        CAST((? - CAST(strftime('%s', (SELECT MAX(updated_at) FROM market_prices)) AS INTEGER)) / 60 AS INTEGER) as age_minutes
      UNION ALL
      SELECT
        'bctc' as signal_type,
        CAST((? - CAST(strftime('%s', (SELECT MAX(parsed_at) FROM financial_reports)) AS INTEGER)) / 60 AS INTEGER) as age_minutes
      UNION ALL
      SELECT
        'news' as signal_type,
        CAST((? - CAST(strftime('%s', (SELECT MAX(created_at) FROM rag_analyses)) AS INTEGER)) / 60 AS INTEGER) as age_minutes
      UNION ALL
      SELECT
        'sbv_fx' as signal_type,
        CAST((? - CAST(strftime('%s', (SELECT MAX(fetched_at) FROM sbv_rates)) AS INTEGER)) / 60 AS INTEGER) as age_minutes
      UNION ALL
      SELECT
        'foreign_flow' as signal_type,
        CAST((? - CAST(strftime('%s', (SELECT MAX(updated_at) FROM daily_ohlcv WHERE foreign_buy_vol IS NOT NULL)) AS INTEGER)) / 60 AS INTEGER) as age_minutes`
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
 * Get SLA threshold for a signal type — delegates to domain getSlaThreshold.
 * Domain function is calendar-aware: market-hours-only sources (price, foreign_flow)
 * use a dynamic off-hours threshold so they never breach on weekends by design.
 */
function getSlaThresholds(signalType: string, _isMarketHours: boolean, now: Date = new Date()): number {
  return getSlaThreshold(signalType as SignalType, DEFAULT_SLA_CONFIG, now);
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
  const offHoursCount = records.filter((r) => r.status === "off-hours").length;

  lines.push(`Summary: ${okCount} ok, ${breachedCount} breached, ${offHoursCount} off-hours (by design)`);

  if (breachedCount > 0) {
    const breached = records
      .filter((r) => r.status === "breached")
      .map((r) => `${r.signal_type} (${r.age_minutes}/${r.threshold_minutes}min)`)
      .join(", ");
    lines.push(`ALERT: SLA breached on: ${breached}`);
  }
  if (offHoursCount > 0) {
    const offHours = records
      .filter((r) => r.status === "off-hours")
      .map((r) => r.signal_type)
      .join(", ");
    lines.push(`OFF-HOURS (not an alert): ${offHours} — VPS fetch loop sleeps outside Mon-Fri 02:00-08:59 UTC`);
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
        const now = new Date();
        const marketHoursActive = domainIsVnMarketHours(now);

        // Build status records
        const records: SlaStatusRow[] = [];
        const signalTypes = ["price", "bctc", "news", "sbv_fx", "foreign_flow"];

        for (const sig of signalTypes) {
          if (signal_type !== "all" && sig !== signal_type) {
            continue;
          }

          const age = ages[sig] ?? 0;
          // Domain getSlaThreshold is calendar-aware: market-hours-only sources get
          // dynamic off-hours thresholds, preventing false breaches on weekends.
          const threshold = getSlaThresholds(sig, marketHoursActive, now);
          const offHours = MARKET_HOURS_ONLY_SOURCES.has(sig as SignalType) && !marketHoursActive;
          const status = age <= threshold ? "ok" : (offHours ? "off-hours" : "breached");
          const severity = status === "breached" ? getSeverity(age, threshold) : null;

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
