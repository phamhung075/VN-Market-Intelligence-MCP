/**
 * marketSummaryStore.ts
 *
 * Read-only infrastructure store for the `market_summaries` table.
 * Part of the TASK17-SUMMARIES endpoint wave.
 *
 * Table: market_summaries (live — 97 rows as of 2026-06-11)
 *   id TEXT PRIMARY KEY                  -- e.g. "daily-2026-06-10"
 *   period_type TEXT NOT NULL            -- daily|weekly|monthly|quarterly|yearly
 *   period_start TEXT NOT NULL           -- "YYYY-MM-DD"
 *   period_end TEXT NOT NULL             -- "YYYY-MM-DD"
 *   created_at TEXT NOT NULL             -- ISO8601 e.g. "2026-06-10T09:10:45.925Z"
 *   updated_at TEXT NOT NULL             -- ISO8601
 *   summary_text TEXT NOT NULL           -- LARGE (~12.7KB) human-readable VN narrative
 *   key_events_json TEXT                 -- NULLABLE; JSON array: [{date,title,impact,direction}]
 *   stock_performance_json TEXT          -- NULLABLE; JSON OBJECT keyed by ticker
 *   alerts_summary_json TEXT             -- NULLABLE
 *   macro_context_json TEXT              -- NULLABLE
 *   recommendation_json TEXT             -- NULLABLE; JSON OBJECT keyed by ticker
 *   news_count INTEGER DEFAULT 0
 *   alert_count INTEGER DEFAULT 0
 *   report_count INTEGER DEFAULT 0
 *   data_sources_json TEXT               -- NULLABLE
 *   UNIQUE(period_type, period_start)
 *
 * Live stats (probed 2026-06-11 against named-volume DB):
 *   97 rows. period_type: daily=76, weekly=13, monthly=5, quarterly=2, yearly=1.
 *   Span period_start 2026-01-01 → period_end 2026-12-31.
 *   Latest by created_at = id "daily-2026-06-10".
 *
 * Layer: infrastructure/db — no domain imports.
 * All queries use parameterized bindings — never string-interpolate user input.
 *
 * @module infrastructure/db/marketSummaryStore
 */

import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One row from the market_summaries table.
 * summary_text is the full narrative for detail queries; the list query
 * replaces it with summary_preview (first 300 chars via SQL substr alias).
 * All *_json columns are NULLABLE — parse defensively in the handler.
 */
export type MarketSummaryRow = {
  id: string;
  period_type: string;
  period_start: string;
  period_end: string;
  created_at: string;
  updated_at: string;
  /** Full text in detail mode; empty string "" in list mode (use summary_preview). */
  summary_text: string;
  /**
   * First 300 chars of summary_text, provided via SQL substr alias in list mode.
   * NULL in detail mode (use summary_text instead).
   */
  summary_preview: string | null;
  key_events_json: string | null;
  stock_performance_json: string | null;
  alerts_summary_json: string | null;
  macro_context_json: string | null;
  recommendation_json: string | null;
  news_count: number;
  alert_count: number;
  report_count: number;
  data_sources_json: string | null;
};

/** Minimal shape returned by getPeriodCounts. */
export type PeriodCount = {
  periodType: string;
  count: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Read helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return market_summaries rows for list view.
 * Selects LIGHT columns: no full summary_text; instead selects
 * substr(summary_text,1,300) AS summary_preview for card display.
 * Also selects all *_json columns so the handler can count their entries.
 *
 * @param db         - SQLite database instance (injected)
 * @param periodType - Optional filter: daily|weekly|monthly|quarterly|yearly
 * @param limit      - Max rows to return (default 60, clamped [1,200] by handler)
 * @returns Rows ordered by created_at DESC; summary_text="" (not selected)
 */
export function getMarketSummaryList(
  db: Database,
  periodType?: string,
  limit = 60,
): MarketSummaryRow[] {
  const SELECT = `
    SELECT
      id, period_type, period_start, period_end,
      created_at, updated_at,
      '' AS summary_text,
      substr(summary_text, 1, 300) AS summary_preview,
      key_events_json, stock_performance_json,
      alerts_summary_json, macro_context_json, recommendation_json,
      news_count, alert_count, report_count, data_sources_json
    FROM market_summaries
  `;

  if (periodType) {
    return db
      .prepare(`${SELECT} WHERE period_type = ? ORDER BY created_at DESC LIMIT ?`)
      .all(periodType, limit) as MarketSummaryRow[];
  }

  return db
    .prepare(`${SELECT} ORDER BY created_at DESC LIMIT ?`)
    .all(limit) as MarketSummaryRow[];
}

/**
 * Return a single market_summaries row by primary key.
 * Returns full summary_text + all json columns (detail view).
 *
 * @param db - SQLite database instance (injected)
 * @param id - Primary key, e.g. "daily-2026-06-10"
 * @returns Full row or null if not found
 */
export function getMarketSummaryById(
  db: Database,
  id: string,
): MarketSummaryRow | null {
  const row = db
    .prepare(
      `SELECT
         id, period_type, period_start, period_end,
         created_at, updated_at,
         summary_text,
         NULL AS summary_preview,
         key_events_json, stock_performance_json,
         alerts_summary_json, macro_context_json, recommendation_json,
         news_count, alert_count, report_count, data_sources_json
       FROM market_summaries
       WHERE id = ?`,
    )
    .get(id) as MarketSummaryRow | null;

  return row ?? null;
}

/**
 * Return period_type distribution counts.
 * Ordered by count DESC (most frequent period type first).
 *
 * @param db - SQLite database instance (injected)
 * @returns Array of {periodType, count} for each distinct period_type present
 */
export function getPeriodCounts(db: Database): PeriodCount[] {
  type RawRow = { period_type: string; count: number };
  const rows = db
    .prepare(
      `SELECT period_type, COUNT(*) AS count
       FROM market_summaries
       GROUP BY period_type
       ORDER BY count DESC`,
    )
    .all() as RawRow[];

  return rows.map((r) => ({ periodType: r.period_type, count: r.count }));
}
