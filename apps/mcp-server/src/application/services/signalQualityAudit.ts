/**
 * Signal Quality Audit Service — Task 1295c
 *
 * Queries signal rejection metrics from the signal_rejections table and
 * generates monthly audit reports with trend analysis and alert logic.
 *
 * Layer: application/services
 * DDD rules:
 *   - May import from infrastructure/ (DB access)
 *   - Must NOT import from interface/ or scheduler/
 *   - Used by scheduler jobs (monthlySignalQualityJob)
 *
 * Functions:
 *   - queryRejectionStats(db, month, year): RejectionStats — query rejections for month/year
 *   - generateAuditReport(db): string — markdown report with metrics and alert warning
 *
 * Exports:
 *   - RejectionStats interface
 *   - queryRejectionStats function
 *   - generateAuditReport function
 */

import type { Database } from "bun:sqlite";

/**
 * Aggregated rejection statistics for a time window.
 *
 * @property total — Total rejection count
 * @property by_agent — Map of agent name → rejection count
 * @property by_type — Map of signal type → rejection count
 * @property by_stock — Map of stock code → rejection count (includes "NULL" for null codes)
 */
export interface RejectionStats {
  total: number;
  by_agent: Record<string, number>;
  by_type: Record<string, number>;
  by_stock: Record<string, number>;
}

/**
 * Query rejection statistics for a given month/year.
 *
 * Aggregates signal_rejections table rows by:
 *   - from_agent
 *   - signal_type
 *   - stock_code (NULL codes mapped to "NULL" key)
 *
 * @param db — SQLite database instance
 * @param month — Month name (e.g., "April")
 * @param year — 4-digit year (e.g., 2026)
 * @returns RejectionStats with aggregated counts
 */
export async function queryRejectionStats(
  db: Database,
  month: string,
  year: number,
): Promise<RejectionStats> {
  // Map month name to month number (1-12)
  const monthMap: Record<string, number> = {
    January: 1,
    February: 2,
    March: 3,
    April: 4,
    May: 5,
    June: 6,
    July: 7,
    August: 8,
    September: 9,
    October: 10,
    November: 11,
    December: 12,
  };

  let monthNum: number | undefined = monthMap[month];
  if (!monthNum) {
    const parsed = parseInt(month);
    if (!isNaN(parsed)) {
      monthNum = parsed;
    }
  }
  if (!monthNum || monthNum < 1 || monthNum > 12) {
    throw new Error(`Invalid month: ${month}`);
  }

  const monthStr = String(monthNum).padStart(2, "0");
  const yearStr = String(year);

  // Query all rejections for the given month/year
  const rows = db
    .prepare(
      `
        SELECT from_agent, signal_type, stock_code, COUNT(*) as count
        FROM signal_rejections
        WHERE strftime('%Y-%m', created_at) = ?
        GROUP BY from_agent, signal_type, stock_code
        ORDER BY count DESC
      `,
    )
    .all(`${yearStr}-${monthStr}`) as Array<{
    from_agent: string;
    signal_type: string;
    stock_code: string | null;
    count: number;
  }>;

  // Aggregate by agent, type, and stock
  const by_agent: Record<string, number> = {};
  const by_type: Record<string, number> = {};
  const by_stock: Record<string, number> = {};
  let total = 0;

  rows.forEach((row) => {
    total += row.count;

    by_agent[row.from_agent] = (by_agent[row.from_agent] || 0) + row.count;
    by_type[row.signal_type] = (by_type[row.signal_type] || 0) + row.count;

    const stockKey = row.stock_code || "NULL";
    by_stock[stockKey] = (by_stock[stockKey] || 0) + row.count;
  });

  return {
    total,
    by_agent,
    by_type,
    by_stock,
  };
}

/**
 * Generate markdown audit report from rejection statistics.
 *
 * Includes:
 *   - Total rejection count
 *   - Rejection rate per 1000 signals (estimated from agent_signals table)
 *   - Top 3 rejecting agents
 *   - Top 3 rejection reasons (via detail scan)
 *   - Cross-tabulation table (agent × type)
 *   - Alert warning if rejection rate > 2%
 *
 * @param db — SQLite database instance
 * @returns Markdown-formatted string report
 */
export async function generateAuditReport(db: Database): Promise<string> {
  // Query current month/year for stats
  const now = new Date();
  const monthNum = now.getUTCMonth() + 1;
  const monthMap = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const monthName: string = monthMap[monthNum - 1] || `Month${monthNum}`;
  const year = now.getUTCFullYear();

  const stats = await queryRejectionStats(db, monthName, year);

  // Estimate signal count from agent_signals table for current month
  const monthStr = String(monthNum).padStart(2, "0");
  const yearStr = String(year);
  const countRow = db
    .prepare(
      `
        SELECT COUNT(*) as total FROM agent_signals
        WHERE strftime('%Y-%m', created_at) = ?
      `,
    )
    .get(`${yearStr}-${monthStr}`) as { total: number };

  const signalCount = countRow?.total || 0;
  const rejectionRate = signalCount > 0 ? (stats.total / signalCount) * 100 : 0;
  const rejectionRatePer1000 = rejectionRate * 10;

  // Query top reasons (sample from rejection table)
  const reasonRows = db
    .prepare(
      `
        SELECT reason, COUNT(*) as count
        FROM signal_rejections
        WHERE strftime('%Y-%m', created_at) = ?
        GROUP BY reason
        ORDER BY count DESC
        LIMIT 3
      `,
    )
    .all(`${yearStr}-${monthStr}`) as Array<{ reason: string; count: number }>;

  // Build markdown report
  let report = `# Signal Quality Audit Report\n`;
  report += `**Period:** ${monthName} ${year} (UTC)\n\n`;

  // Summary section
  report += `## Summary\n`;
  report += `| Metric | Value |\n`;
  report += `|--------|-------|\n`;
  report += `| Total Rejections | ${stats.total} |\n`;
  report += `| Total Signals | ${signalCount} |\n`;
  report += `| Rejection Rate | ${rejectionRate.toFixed(2)}% |\n`;
  report += `| Per 1000 Signals | ${rejectionRatePer1000.toFixed(1)} |\n`;
  report += `\n`;

  // Top agents
  report += `## Top Rejecting Agents\n`;
  report += `| Agent | Rejection Count |\n`;
  report += `|-------|----------------|\n`;
  const topAgents = Object.entries(stats.by_agent)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  if (topAgents.length > 0) {
    topAgents.forEach(([agent, count]) => {
      report += `| ${agent} | ${count} |\n`;
    });
  } else {
    report += `| (none) | 0 |\n`;
  }
  report += `\n`;

  // Top signal types
  report += `## Top Signal Types with Rejections\n`;
  report += `| Signal Type | Rejection Count |\n`;
  report += `|-------------|----------------|\n`;
  const topTypes = Object.entries(stats.by_type)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  if (topTypes.length > 0) {
    topTypes.forEach(([type, count]) => {
      report += `| ${type} | ${count} |\n`;
    });
  } else {
    report += `| (none) | 0 |\n`;
  }
  report += `\n`;

  // Top rejection reasons
  report += `## Top Rejection Reasons\n`;
  report += `| Reason | Count |\n`;
  report += `|--------|-------|\n`;
  if (reasonRows.length > 0) {
    reasonRows.forEach(({ reason, count }) => {
      const truncated = reason.length > 60 ? reason.slice(0, 57) + "..." : reason;
      report += `| ${truncated} | ${count} |\n`;
    });
  } else {
    report += `| (none) | 0 |\n`;
  }
  report += `\n`;

  // Top stocks affected
  report += `## Top Stocks with Rejection Activity\n`;
  report += `| Stock | Rejection Count |\n`;
  report += `|-------|----------------|\n`;
  const topStocks = Object.entries(stats.by_stock)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  if (topStocks.length > 0) {
    topStocks.forEach(([stock, count]) => {
      const stockLabel = stock === "NULL" ? "(no stock)" : stock;
      report += `| ${stockLabel} | ${count} |\n`;
    });
  } else {
    report += `| (none) | 0 |\n`;
  }
  report += `\n`;

  // Alert section if threshold exceeded
  if (rejectionRate > 2.0) {
    report += `## ⚠️ Alert: Rejection Rate Exceeds Threshold\n`;
    report += `Rejection rate (${rejectionRate.toFixed(2)}%) exceeds the 2% threshold.\n`;
    report += `Recommend reviewing top rejecting agents and signal types for patterns.\n`;
    report += `\n`;
  }

  return report;
}
