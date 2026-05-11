/**
 * Generate Periodic Summary — Task 130 (Application Layer)
 *
 * Aggregates intelligence data over a time period (daily / weekly / monthly /
 * quarterly / yearly) and produces a plain-language PeriodicSummary that is
 * stored in the `market_summaries` SQLite table.
 *
 * Implementation is fully rule-based — no LLM calls.
 *
 * Vietnam timezone: UTC+7. All date boundaries use UTC offset arithmetic
 * (no external timezone library).
 *
 * Layer: application/usecases — may import from domain/ and infrastructure/.
 */

import type { Database } from "bun:sqlite";
import { getDb } from "../../infrastructure/db/schema.js";
import { logger } from "../../infrastructure/logger.js";
import { mcpConfig } from "../../infrastructure/config.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/** Supported summary period granularities. */
export type PeriodType = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

/** Per-stock performance snapshot for a period. */
export interface StockPeriodPerformance {
  /** First recorded price in the period (VND), or null if unavailable */
  firstPrice: number | null;
  /** Last recorded price in the period (VND), or null if unavailable */
  lastPrice: number | null;
  /** Percentage change from firstPrice to lastPrice, or null if unavailable */
  changePct: number | null;
  /** Number of alerts triggered for this stock in the period */
  alertCount: number;
}

/** Resolved UTC date boundaries for a period. */
export interface PeriodDateRange {
  /** Vietnam local date string (YYYY-MM-DD) for the period start */
  start: string;
  /** Vietnam local date string (YYYY-MM-DD) for the period end */
  end: string;
  /** UTC ISO string for the start of the Vietnam day */
  startUtc: string;
  /** UTC ISO string for the start of the day AFTER the Vietnam period end */
  endUtc: string;
}

/** Full periodic intelligence summary. */
export interface PeriodicSummary {
  id: string;
  periodType: PeriodType;
  periodStart: string;
  periodEnd: string;
  summaryText: string;
  keyEvents: Array<{
    date: string;
    title: string;
    impact: number;
    direction: string;
  }>;
  stockPerformance: Record<string, StockPeriodPerformance>;
  alertsSummary: {
    total: number;
    bySeverity: Record<string, number>;
    topAlerts: string[];
  };
  macroContext: Record<string, number | null>;
  recommendation: Record<string, {
    outlook: string;
    confidence: number;
    reasoning: string;
  }>;
  newsCount: number;
  alertCount: number;
  reportCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Date range helpers — Vietnam UTC+7 arithmetic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pad a number to 2 digits.
 */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Shift a UTC Date to Vietnam local time (UTC+7) and return
 * { year, month (1-based), day, dayOfWeek }.
 */
function toVnDate(utcDate: Date): {
  year: number;
  month: number;
  day: number;
  dayOfWeek: number; // 0=Sun, 1=Mon, ...6=Sat
} {
  const utcOffset = mcpConfig.market.utcOffset; // default 7
  const vn = new Date(utcDate.getTime() + utcOffset * 60 * 60 * 1000);
  return {
    year: vn.getUTCFullYear(),
    month: vn.getUTCMonth() + 1,
    day: vn.getUTCDate(),
    dayOfWeek: vn.getUTCDay(),
  };
}

/**
 * Return the UTC timestamp for midnight Vietnam time on the given Vietnam date.
 * Vietnam midnight = UTC midnight - 7 hours = 17:00 UTC the previous day.
 */
function vnMidnightUtc(year: number, month: number, day: number): Date {
  const utcOffset = mcpConfig.market.utcOffset;
  // Construct midnight Vietnam time as a UTC timestamp
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - utcOffset * 60 * 60 * 1000);
}

/**
 * Return the number of days in a month (handles leap years).
 */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Compute the [start, end] Vietnam local dates and their UTC equivalents for
 * a given period type.
 *
 * @param periodType - Granularity of the period
 * @param reference  - Any date/time within the period (defaults to now)
 */
export function getPeriodDateRange(
  periodType: PeriodType,
  reference?: Date,
): PeriodDateRange {
  const ref = reference ?? new Date();
  const vn = toVnDate(ref);

  let startYear = vn.year;
  let startMonth = vn.month;
  let startDay = 1;
  let endYear = vn.year;
  let endMonth = vn.month;
  let endDay = 1;

  switch (periodType) {
    case "daily": {
      startYear = vn.year;
      startMonth = vn.month;
      startDay = vn.day;
      endYear = vn.year;
      endMonth = vn.month;
      endDay = vn.day;
      break;
    }

    case "weekly": {
      // Monday = 1, Sunday = 0 in JS (getUTCDay)
      // Find Monday of the current week
      const dow = vn.dayOfWeek; // 0=Sun, 1=Mon, ..., 6=Sat
      const daysFromMonday = dow === 0 ? 6 : dow - 1; // Mon=0 offset

      const mondayUtc = new Date(
        vnMidnightUtc(vn.year, vn.month, vn.day).getTime() -
          daysFromMonday * 24 * 60 * 60 * 1000,
      );
      const sundayUtc = new Date(
        mondayUtc.getTime() + 6 * 24 * 60 * 60 * 1000,
      );

      const mondayVn = toVnDate(new Date(mondayUtc.getTime() + mcpConfig.market.utcOffset * 60 * 60 * 1000));
      const sundayVn = toVnDate(new Date(sundayUtc.getTime() + mcpConfig.market.utcOffset * 60 * 60 * 1000));

      startYear = mondayVn.year;
      startMonth = mondayVn.month;
      startDay = mondayVn.day;
      endYear = sundayVn.year;
      endMonth = sundayVn.month;
      endDay = sundayVn.day;
      break;
    }

    case "monthly": {
      startDay = 1;
      endDay = daysInMonth(vn.year, vn.month);
      endYear = vn.year;
      endMonth = vn.month;
      break;
    }

    case "quarterly": {
      const quarter = Math.ceil(vn.month / 3); // 1-4
      startMonth = (quarter - 1) * 3 + 1; // Jan, Apr, Jul, Oct
      endMonth = quarter * 3;              // Mar, Jun, Sep, Dec
      endDay = daysInMonth(vn.year, endMonth);
      endYear = vn.year;
      break;
    }

    case "yearly": {
      startMonth = 1;
      startDay = 1;
      endMonth = 12;
      endDay = 31;
      break;
    }
  }

  const startStr = `${startYear}-${pad2(startMonth)}-${pad2(startDay)}`;
  const endStr = `${endYear}-${pad2(endMonth)}-${pad2(endDay)}`;

  // UTC boundaries: start of startDay in Vietnam = startDay at 17:00 UTC previous day
  const startUtc = vnMidnightUtc(startYear, startMonth, startDay);
  // End boundary: start of day AFTER endDay in Vietnam
  const endUtcMs = vnMidnightUtc(endYear, endMonth, endDay).getTime() + 24 * 60 * 60 * 1000;
  const endUtc = new Date(endUtcMs);

  return {
    start: startStr,
    end: endStr,
    startUtc: startUtc.toISOString(),
    endUtc: endUtc.toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Plain-language summary text builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a plain-language summary text from a PeriodicSummary.
 * Rule-based — no LLM.
 */
export function buildSummaryText(summary: PeriodicSummary): string {
  const lines: string[] = [];

  // Header
  const periodLabel = summary.periodType.charAt(0).toUpperCase() + summary.periodType.slice(1);
  lines.push(`=== ${periodLabel} Market Intelligence Summary ===`);
  lines.push(`Period: ${summary.periodStart} → ${summary.periodEnd}`);
  lines.push("");

  // Activity overview
  lines.push("ACTIVITY OVERVIEW");
  lines.push(`  News articles analyzed : ${summary.newsCount}`);
  lines.push(`  Alerts triggered       : ${summary.alertCount}`);
  lines.push(`  Financial reports      : ${summary.reportCount}`);
  lines.push("");

  // Alerts breakdown
  if (summary.alertCount > 0) {
    lines.push("ALERTS BREAKDOWN");
    for (const [sev, count] of Object.entries(summary.alertsSummary.bySeverity)) {
      lines.push(`  ${sev.padEnd(10)}: ${count}`);
    }
    if (summary.alertsSummary.topAlerts.length > 0) {
      lines.push("  Top alerts:");
      for (const alert of summary.alertsSummary.topAlerts.slice(0, 3)) {
        lines.push(`    - ${alert}`);
      }
    }
    lines.push("");
  }

  // Stock performance
  const perfEntries = Object.entries(summary.stockPerformance);
  if (perfEntries.length > 0) {
    lines.push("STOCK PERFORMANCE");
    for (const [code, perf] of perfEntries) {
      if (perf.changePct !== null) {
        const sign = perf.changePct >= 0 ? "+" : "";
        lines.push(`  ${code.padEnd(6)}: ${sign}${perf.changePct.toFixed(2)}%  (alerts: ${perf.alertCount})`);
      } else {
        lines.push(`  ${code.padEnd(6)}: no price data  (alerts: ${perf.alertCount})`);
      }
    }
    lines.push("");
  }

  // Key events
  if (summary.keyEvents.length > 0) {
    lines.push("KEY EVENTS");
    for (const evt of summary.keyEvents.slice(0, 5)) {
      const dateStr = evt.date.slice(0, 10);
      const dirSymbol = evt.direction === "up" ? "[UP]" : evt.direction === "down" ? "[DN]" : "[--]";
      lines.push(`  ${dateStr}  ${dirSymbol}  [${evt.impact.toFixed(1)}]  ${evt.title.slice(0, 80)}`);
    }
    lines.push("");
  }

  // Recommendations
  const recEntries = Object.entries(summary.recommendation);
  if (recEntries.length > 0) {
    lines.push("RECOMMENDATIONS");
    for (const [code, rec] of recEntries) {
      const conf = (rec.confidence * 100).toFixed(0);
      lines.push(`  ${code.padEnd(6)}: ${rec.outlook.toUpperCase()} (confidence: ${conf}%)`);
      if (rec.reasoning) {
        lines.push(`         ${rec.reasoning.slice(0, 120)}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Data aggregation helpers
// ─────────────────────────────────────────────────────────────────────────────

interface AlertRow {
  id: string;
  triggered_at: string;
  severity: string;
  message: string | null;
}

interface RagRow {
  id: string;
  created_at: string;
  source_title: string | null;
  impact_score: number | null;
  impact_direction: string | null;
  summary: string | null;
}

interface MacroRow {
  country: string;
  cpi: number | null;
  gdp_growth: number | null;
  interest_rate: number | null;
}

interface MarketPriceRow {
  code: string;
  price: number | null;
  change_pct: number | null;
  updated_at: string | null;
}

interface ReportCountRow {
  cnt: number;
}

/**
 * Aggregate alert data for a period.
 */
function aggregateAlerts(
  db: Database,
  startUtc: string,
  endUtc: string,
): { total: number; bySeverity: Record<string, number>; topAlerts: string[]; rows: AlertRow[] } {
  let rows: AlertRow[] = [];
  try {
    rows = db
      .query<AlertRow, [string, string]>(
        `SELECT id, triggered_at, severity, message FROM alerts
         WHERE triggered_at >= ? AND triggered_at < ?
         ORDER BY triggered_at DESC`,
      )
      .all(startUtc, endUtc);
  } catch {
    rows = [];
  }

  const bySeverity: Record<string, number> = {};
  for (const row of rows) {
    bySeverity[row.severity] = (bySeverity[row.severity] ?? 0) + 1;
  }

  // Top alerts: prioritize critical > warning > info, then most recent
  const priorityOrder: Record<string, number> = { critical: 0, warning: 1, high: 1, info: 2 };
  const sorted = [...rows].sort((a, b) => {
    const pa = priorityOrder[a.severity] ?? 99;
    const pb = priorityOrder[b.severity] ?? 99;
    return pa - pb;
  });

  const topAlerts = sorted
    .slice(0, 5)
    .map((r) => r.message ?? `Alert ${r.id} (${r.severity})`);

  return { total: rows.length, bySeverity, topAlerts, rows };
}

/**
 * Aggregate news data for a period.
 */
function aggregateNews(
  db: Database,
  startUtc: string,
  endUtc: string,
): { count: number; keyEvents: PeriodicSummary["keyEvents"] } {
  let rows: RagRow[] = [];
  try {
    rows = db
      .query<RagRow, [string, string]>(
        `SELECT id, created_at, source_title, impact_score, impact_direction, summary
         FROM rag_analyses
         WHERE created_at >= ? AND created_at < ?
         ORDER BY impact_score DESC`,
      )
      .all(startUtc, endUtc);
  } catch {
    rows = [];
  }

  const keyEvents: PeriodicSummary["keyEvents"] = rows
    .filter((r) => (r.impact_score ?? 0) >= 6)
    .map((r) => ({
      date: r.created_at,
      title: r.source_title ?? r.summary ?? "Unknown event",
      impact: r.impact_score ?? 0,
      direction: r.impact_direction ?? "neutral",
    }));

  return { count: rows.length, keyEvents };
}

/**
 * Aggregate macro context from latest indicators.
 */
function aggregateMacro(db: Database): Record<string, number | null> {
  let rows: MacroRow[] = [];
  try {
    rows = db
      .query<MacroRow, []>(
        `SELECT country, cpi, gdp_growth, interest_rate FROM macro_indicators`,
      )
      .all();
  } catch {
    rows = [];
  }

  const macro: Record<string, number | null> = {};
  for (const row of rows) {
    macro[`${row.country}_cpi`] = row.cpi;
    macro[`${row.country}_gdp_growth`] = row.gdp_growth;
    macro[`${row.country}_interest_rate`] = row.interest_rate;
  }

  return macro;
}

/**
 * Get current market prices for watchlist stocks.
 * Since we don't have a history table, we use the current snapshot from market_prices.
 */
function aggregateStockPerformance(
  db: Database,
  alertRows: AlertRow[],
): Record<string, StockPeriodPerformance> {
  const watchlistCodes = mcpConfig.market.watchlist;

  // Current prices
  let priceRows: MarketPriceRow[] = [];
  try {
    priceRows = db
      .query<MarketPriceRow, []>(
        `SELECT code, price, change_pct, updated_at FROM market_prices`,
      )
      .all();
  } catch {
    priceRows = [];
  }

  const priceMap = new Map<string, MarketPriceRow>();
  for (const row of priceRows) {
    priceMap.set(row.code.toUpperCase(), row);
  }

  // Count alerts per stock (look for code mentions in message or affected_actions_json)
  const alertCountByCode: Record<string, number> = {};
  for (const alert of alertRows) {
    if (alert.message) {
      for (const code of watchlistCodes) {
        if (alert.message.includes(code)) {
          alertCountByCode[code] = (alertCountByCode[code] ?? 0) + 1;
        }
      }
    }
  }

  const performance: Record<string, StockPeriodPerformance> = {};

  for (const code of watchlistCodes) {
    const priceRow = priceMap.get(code.toUpperCase());
    performance[code] = {
      firstPrice: priceRow?.price ?? null,
      lastPrice: priceRow?.price ?? null,
      changePct: priceRow?.change_pct ?? null,
      alertCount: alertCountByCode[code] ?? 0,
    };
  }

  // Also include any stocks in priceRows not in watchlist (for completeness)
  for (const row of priceRows) {
    const upperCode = row.code.toUpperCase();
    if (!performance[upperCode]) {
      performance[upperCode] = {
        firstPrice: row.price,
        lastPrice: row.price,
        changePct: row.change_pct,
        alertCount: alertCountByCode[upperCode] ?? 0,
      };
    }
  }

  return performance;
}

/**
 * Build a rule-based per-stock recommendation.
 * Inputs: changePct and alertCount from the period.
 */
function buildRecommendation(
  stockPerformance: Record<string, StockPeriodPerformance>,
): Record<string, { outlook: string; confidence: number; reasoning: string }> {
  const rec: Record<string, { outlook: string; confidence: number; reasoning: string }> = {};

  for (const [code, perf] of Object.entries(stockPerformance)) {
    let outlook = "neutral";
    let confidence = 0.5;
    const reasons: string[] = [];

    const changePct = perf.changePct;
    if (changePct !== null) {
      if (changePct >= 5) {
        outlook = "bullish";
        confidence = 0.7;
        reasons.push(`strong price gain +${changePct.toFixed(1)}%`);
      } else if (changePct >= 2) {
        outlook = "bullish";
        confidence = 0.6;
        reasons.push(`moderate price gain +${changePct.toFixed(1)}%`);
      } else if (changePct <= -5) {
        outlook = "bearish";
        confidence = 0.7;
        reasons.push(`strong price drop ${changePct.toFixed(1)}%`);
      } else if (changePct <= -2) {
        outlook = "bearish";
        confidence = 0.6;
        reasons.push(`moderate price drop ${changePct.toFixed(1)}%`);
      } else {
        reasons.push(`price stable (${changePct >= 0 ? "+" : ""}${changePct.toFixed(1)}%)`);
      }
    }

    if (perf.alertCount >= 3) {
      if (outlook === "bullish") confidence = Math.min(0.9, confidence + 0.1);
      else if (outlook === "bearish") confidence = Math.min(0.9, confidence + 0.1);
      reasons.push(`${perf.alertCount} alerts triggered`);
    }

    rec[code] = {
      outlook,
      confidence,
      reasoning: reasons.join("; ") || "Insufficient data for recommendation",
    };
  }

  return rec;
}

/**
 * Count financial reports in the period.
 */
function countReports(db: Database, startUtc: string, endUtc: string): number {
  try {
    const rows = db
      .query<ReportCountRow, [string, string]>(
        `SELECT COUNT(*) as cnt FROM financial_reports
         WHERE parsed_at >= ? AND parsed_at < ?`,
      )
      .all(startUtc, endUtc);
    return rows[0]?.cnt ?? 0;
  } catch {
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate (and store) a periodic intelligence summary.
 *
 * Steps:
 *   1. Compute UTC date boundaries for the period
 *   2. Query rag_analyses → news count, key events
 *   3. Query alerts → count by severity, top alerts
 *   4. Query market_prices → stock performance snapshot
 *   5. Query financial_reports → report count
 *   6. Query macro_indicators → latest macro values
 *   7. Build plain-language summary text
 *   8. Build per-stock recommendations
 *   9. Upsert into market_summaries
 *
 * @param periodType  - Granularity of the summary
 * @param periodEnd   - Any date within the desired period (defaults to now)
 * @param db          - Optional Database for testing; falls back to getDb()
 */
export async function generatePeriodicSummary(
  periodType: PeriodType,
  periodEnd?: Date,
  db?: Database,
): Promise<PeriodicSummary> {
  const database = db ?? getDb();
  const reference = periodEnd ?? new Date();
  const range = getPeriodDateRange(periodType, reference);

  // Deterministic ID: period_type + period_start
  const id = `${periodType}-${range.start}`;

  logger.debug("[generatePeriodicSummary] starting", {
    periodType,
    start: range.start,
    end: range.end,
    startUtc: range.startUtc,
    endUtc: range.endUtc,
  });

  // Aggregate data
  const { count: newsCount, keyEvents } = aggregateNews(database, range.startUtc, range.endUtc);
  const { total: alertCount, bySeverity, topAlerts, rows: alertRows } =
    aggregateAlerts(database, range.startUtc, range.endUtc);
  const reportCount = countReports(database, range.startUtc, range.endUtc);
  const macroContext = aggregateMacro(database);
  const stockPerformance = aggregateStockPerformance(database, alertRows);
  const recommendation = buildRecommendation(stockPerformance);

  const alertsSummary: PeriodicSummary["alertsSummary"] = {
    total: alertCount,
    bySeverity,
    topAlerts,
  };

  const summary: PeriodicSummary = {
    id,
    periodType,
    periodStart: range.start,
    periodEnd: range.end,
    summaryText: "", // filled below
    keyEvents,
    stockPerformance,
    alertsSummary,
    macroContext,
    recommendation,
    newsCount,
    alertCount,
    reportCount,
  };

  // Build the plain-language summary text
  summary.summaryText = buildSummaryText(summary);

  // Upsert into market_summaries
  try {
    const now = new Date().toISOString();
    database.run(
      `INSERT INTO market_summaries (
         id, period_type, period_start, period_end, created_at, updated_at,
         summary_text, key_events_json, stock_performance_json,
         alerts_summary_json, macro_context_json, recommendation_json,
         news_count, alert_count, report_count
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(period_type, period_start) DO UPDATE SET
         updated_at = excluded.updated_at,
         summary_text = excluded.summary_text,
         key_events_json = excluded.key_events_json,
         stock_performance_json = excluded.stock_performance_json,
         alerts_summary_json = excluded.alerts_summary_json,
         macro_context_json = excluded.macro_context_json,
         recommendation_json = excluded.recommendation_json,
         news_count = excluded.news_count,
         alert_count = excluded.alert_count,
         report_count = excluded.report_count`,
      [
        id,
        periodType,
        range.start,
        range.end,
        now,
        now,
        summary.summaryText,
        JSON.stringify(summary.keyEvents),
        JSON.stringify(summary.stockPerformance),
        JSON.stringify(summary.alertsSummary),
        JSON.stringify(summary.macroContext),
        JSON.stringify(summary.recommendation),
        summary.newsCount,
        summary.alertCount,
        summary.reportCount,
      ],
    );
    logger.info("[generatePeriodicSummary] stored", { id, periodType });
  } catch (err) {
    logger.error("[generatePeriodicSummary] failed to upsert", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return summary;
}
