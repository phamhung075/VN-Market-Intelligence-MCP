/**
 * Interface Layer — Data Freshness Monitoring Tools
 *
 * MCP tools for detecting SLA breaches on data freshness and formatting alerts.
 * This module wraps the domain service (freshnessSlaChecker.ts) and provides
 * tool implementations for the MCP interface.
 *
 * Task 1282b: GREEN phase implementation
 *
 * @module interface/mcp/tools/system/dataFreshnessTools
 */

import { Database } from "bun:sqlite";
import {
  checkDataFreshnessSla,
  type SignalSlaConfig,
  type FreshnessSlaCheckOutput,
  type SignalType,
  type SlaCheckResult,
} from "../../../../domain/services/freshnessSlaChecker.js";

/**
 * Query definitions for each signal source's timestamp.
 * Maps signalType → SQL query returning a single `ts` column (ISO-8601 or null).
 *
 * Sprint 1920 additions (Task 1920i): 7 new signal types appended.
 * NULL result (empty table) → signalAges entry stays 0 (no-op for freshness tool display).
 */
const SIGNAL_QUERIES: Record<SignalType, { query: string; fallbackQuery?: string }> = {
  price: {
    query:
      "SELECT MAX(pushed_at) AS ts FROM vps_push_log WHERE service = 'prices' AND status = 'ok'",
    fallbackQuery: "SELECT MAX(updated_at) AS ts FROM market_prices",
  },
  bctc: {
    query: "SELECT MAX(parsed_at) AS ts FROM financial_reports",
  },
  news: {
    query: "SELECT MAX(created_at) AS ts FROM rag_analyses",
  },
  sbv_fx: {
    query: "SELECT MAX(fetched_at) AS ts FROM sbv_rates",
  },
  foreign_flow: {
    query: "SELECT MAX(fetched_at) AS ts FROM foreign_flow_daily",
  },
  // ── Sprint 1920 additions ──────────────────────────────────────────────────
  vnstock_fundamentals: {
    query: "SELECT MAX(fetched_at) AS ts FROM vnstock_financials",
  },
  bond_maturity: {
    query: "SELECT MAX(updated_at) AS ts FROM bond_maturity",
  },
  commodity_prices: {
    query: "SELECT MAX(fetched_at) AS ts FROM commodity_prices",
  },
  broker_sanctions: {
    query: "SELECT MAX(created_at) AS ts FROM broker_sanctions",
  },
  backtest_runs: {
    query: "SELECT MAX(run_at) AS ts FROM backtest_runs",
  },
  signal_quality_audit: {
    query: "SELECT MAX(created_at) AS ts FROM signal_quality_audit",
  },
  prediction_claims: {
    query: "SELECT MAX(created_at) AS ts FROM prediction_claims",
  },
};

/**
 * Detects data freshness SLA breaches by querying signal source timestamps
 * from the database and comparing against configured thresholds.
 *
 * @param db Database connection
 * @param config Optional SLA configuration override
 * @returns Object with hasBreach flag, breaches array, and recoveries array
 */
export async function detectDataFreshnessBreach(
  db: Database,
  config?: SignalSlaConfig[],
  now?: Date,
): Promise<{
  hasBreach: boolean;
  breaches: SlaCheckResult[];
  recoveries: SlaCheckResult[];
}> {
  const now_: Date = now ?? new Date();
  const signalAges: Record<SignalType, number> = {
    price: 0,
    bctc: 0,
    news: 0,
    sbv_fx: 0,
    foreign_flow: 0,
    // Sprint 1920 additions — default 0 (no-breach) until first query result
    vnstock_fundamentals: 0,
    bond_maturity: 0,
    commodity_prices: 0,
    broker_sanctions: 0,
    backtest_runs: 0,
    signal_quality_audit: 0,
    prediction_claims: 0,
  };

  // Query each signal source for current age
  for (const signalType of Object.keys(SIGNAL_QUERIES) as SignalType[]) {
    const { query, fallbackQuery } = SIGNAL_QUERIES[signalType];

    let ts: string | null = null;

    try {
      const row = db.query<{ ts: string | null }, []>(query).get();
      ts = row?.ts ?? null;
    } catch {
      // Table may not exist; try fallback if available
      ts = null;
    }

    if (ts === null && fallbackQuery) {
      try {
        const row = db.query<{ ts: string | null }, []>(fallbackQuery).get();
        ts = row?.ts ?? null;
      } catch {
        ts = null;
      }
    }

    if (ts !== null) {
      const tsMs = new Date(ts).getTime();
      if (!isNaN(tsMs)) {
        signalAges[signalType] = (now_.getTime() - tsMs) / 60000; // Convert to minutes
      }
    }
  }

  // Check SLA breaches using domain service
  const output = checkDataFreshnessSla(signalAges, config, [], now_);

  return {
    hasBreach: output.breaches.length > 0,
    breaches: output.breaches,
    recoveries: output.recoveries,
  };
}

/**
 * Formats a FreshnessSlaCheckOutput into a user-facing alert message (Vietnamese).
 *
 * Returns empty string if no breaches or recoveries.
 * Includes timestamp, signal type, age, severity, and recovery status.
 *
 * @param output FreshnessSlaCheckOutput from detectDataFreshnessBreach()
 * @returns Formatted alert string (Vietnamese), or empty string if no issues
 */
export function formatFreshnessAlert(output: FreshnessSlaCheckOutput): string {
  if (!output.breaches.length && !output.recoveries.length) {
    return "";
  }

  const lines: string[] = [
    `⚠️ Data Freshness Alert — ${output.checkedAt}`,
    `Breaches: ${output.breaches.length}`,
  ];

  for (const breach of output.breaches) {
    lines.push(
      `  ${breach.signalType}: ${breach.ageMinutes}m old (threshold: ${breach.thresholdMinutes}m) [${breach.severity}]`,
    );
  }

  if (output.recoveries.length) {
    lines.push(
      `✓ Recovered: ${output.recoveries.map((r) => r.signalType).join(", ")}`,
    );
  }

  return lines.join("\n");
}
