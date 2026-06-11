/**
 * marketSummaryHandler.ts — GET /api/market-summaries
 *
 * TASK17-SUMMARIES endpoint wave:
 * Serve the CHEF market intelligence archive (daily/weekly/monthly/quarterly/yearly
 * synthesised market summaries) for the "Tổng hợp thị trường" frontend page.
 *
 * Source table: market_summaries.
 * Read path: getMarketSummaryList / getMarketSummaryById / getPeriodCounts
 *   from marketSummaryStore (infrastructure).
 * This handler ONLY maps + parses — no SQL here.
 *
 * Live contract (probed 2026-06-11 against named-volume DB):
 *   97 rows. period_type: daily=76, weekly=13, monthly=5, quarterly=2, yearly=1.
 *   Span period_start 2026-01-01 → period_end 2026-12-31.
 *   Latest by created_at = id "daily-2026-06-10".
 *   summary_text ≈ 12.7KB per row (NOT included in list mode).
 *   key_events_json  — NULLABLE; JSON array: [{date,title,impact,direction}]
 *   stock_performance_json — NULLABLE; JSON OBJECT keyed by ticker
 *   recommendation_json    — NULLABLE; JSON OBJECT keyed by ticker
 *
 * CRITICAL: *_json columns are NULLABLE and may be malformed.
 *   parseJsonField<T> → fails closed to fallback, NEVER throws.
 *   stock_performance_json and recommendation_json are OBJECTS keyed by ticker
 *   → mapKeyedToArray() converts them to arrays with `symbol` field.
 *   key_events_json is already an array.
 *
 * Query params:
 *   ?id=<id>        — detail mode: return single row with full summary_text
 *   ?period=        — list mode: filter by daily|weekly|monthly|quarterly|yearly (invalid ignored)
 *   ?limit=N        — list mode: clamp [1,200], default 60
 *
 * Response shape (200 OK):
 *   LIST mode:
 *     {
 *       generatedAt: string,
 *       periods: { daily:76, weekly:13, ... },
 *       items: [ { id, periodType, periodStart, periodEnd, createdAt,
 *                  newsCount, alertCount, reportCount,
 *                  summaryPreview, keyEventCount, stockCount } ],
 *       count: number
 *     }
 *   DETAIL mode (?id=<id>):
 *     {
 *       generatedAt: string,
 *       item: { id, periodType, periodStart, periodEnd, createdAt, updatedAt,
 *               summaryText, keyEvents, stockPerformance, recommendations,
 *               newsCount, alertCount, reportCount } | null
 *     }
 *
 * 200-on-empty, 500-on-error (mirrors predictionClaims / convictionHistory catch block).
 *
 * DDD Layer: interface — db injected by server.ts (no getDb() here).
 * Imports ONLY from marketSummaryStore (infrastructure/db) — no domain imports.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import {
  getMarketSummaryList,
  getMarketSummaryById,
  getPeriodCounts,
  type MarketSummaryRow,
} from "../../../infrastructure/db/marketSummaryStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 200;

const VALID_PERIOD_TYPES = new Set([
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** One item in the list response (light — no full summary_text). */
export interface MarketSummaryListItem {
  id: string;
  periodType: string;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
  newsCount: number;
  alertCount: number;
  reportCount: number;
  /** First 300 chars of summary_text, trimmed. Empty string "" when unavailable. */
  summaryPreview: string;
  /** Count of parsed key_events array (0 when null/malformed). */
  keyEventCount: number;
  /** Count of ticker keys in stock_performance_json object (0 when null/malformed). */
  stockCount: number;
}

/** One key event entry from key_events_json. */
export interface KeyEvent {
  date: string;
  title: string;
  impact: string;
  direction: string;
}

/** One stock performance entry (converted from keyed object). */
export interface StockPerformanceItem {
  symbol: string;
  firstPrice: number;
  lastPrice: number;
  changePct: number;
  alertCount: number;
}

/** One recommendation entry (converted from keyed object). */
export interface RecommendationItem {
  symbol: string;
  outlook: string;
  confidence: number;
  reasoning: string;
}

/** Full detail item (returned when ?id= is present). */
export interface MarketSummaryDetail {
  id: string;
  periodType: string;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
  updatedAt: string;
  summaryText: string;
  keyEvents: KeyEvent[];
  stockPerformance: StockPerformanceItem[];
  recommendations: RecommendationItem[];
  newsCount: number;
  alertCount: number;
  reportCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers — exported for unit testing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Safely parse a JSON string field.
 * Returns fallback when the input is null, undefined, or malformed JSON.
 * NEVER throws — fails closed.
 * Exported for unit testing.
 */
export function parseJsonField<T>(raw: string | null | undefined, fallback: T): T {
  if (raw === null || raw === undefined || raw === "") {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Convert a {TICKER: {...fields}} object to an array of {symbol, ...fields}.
 * Tolerates non-object input (null, array, primitive) → returns [].
 * Exported for unit testing.
 *
 * @param obj   - The parsed JSON value (may be anything after parseJsonField)
 * @param extra - Any extra static fields to merge onto each item (unused currently)
 */
export function mapKeyedToArray(
  obj: unknown,
  extra?: Record<string, unknown>,
): Array<Record<string, unknown>> {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    return [];
  }
  const result: Array<Record<string, unknown>> = [];
  for (const [ticker, value] of Object.entries(obj as Record<string, unknown>)) {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      result.push({
        symbol: ticker,
        ...(value as Record<string, unknown>),
        ...(extra ?? {}),
      });
    }
  }
  return result;
}

/**
 * Build a list item (light card) from a MarketSummaryRow.
 * Counts key_events_json entries and stock_performance_json ticker keys
 * without including the raw JSON in the response.
 * Exported for unit testing.
 */
export function buildListItem(row: MarketSummaryRow): MarketSummaryListItem {
  const keyEvents = parseJsonField<unknown[]>(row.key_events_json, []);
  const keyEventCount = Array.isArray(keyEvents) ? keyEvents.length : 0;

  const stockPerf = parseJsonField<unknown>(row.stock_performance_json, null);
  const stockCount =
    stockPerf !== null &&
    typeof stockPerf === "object" &&
    !Array.isArray(stockPerf)
      ? Object.keys(stockPerf as object).length
      : 0;

  const summaryPreview =
    typeof row.summary_preview === "string"
      ? row.summary_preview.trim()
      : "";

  return {
    id: row.id,
    periodType: row.period_type,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    createdAt: row.created_at,
    newsCount: row.news_count ?? 0,
    alertCount: row.alert_count ?? 0,
    reportCount: row.report_count ?? 0,
    summaryPreview,
    keyEventCount,
    stockCount,
  };
}

/**
 * Build a detail item from a MarketSummaryRow (full summary_text + parsed json arrays).
 * key_events_json   → [{date,title,impact,direction}] (already an array)
 * stock_performance_json → [{symbol,firstPrice,lastPrice,changePct,alertCount}]
 * recommendation_json    → [{symbol,outlook,confidence,reasoning}]
 * All NULL/malformed json → [] (never throws).
 * Exported for unit testing.
 */
export function buildDetail(row: MarketSummaryRow): MarketSummaryDetail {
  // key_events_json is already an array in the DB
  const rawKeyEvents = parseJsonField<unknown[]>(row.key_events_json, []);
  const keyEvents: KeyEvent[] = (Array.isArray(rawKeyEvents) ? rawKeyEvents : []).map(
    (e) => {
      const ev = e as Record<string, unknown>;
      return {
        date: typeof ev["date"] === "string" ? ev["date"] : "",
        title: typeof ev["title"] === "string" ? ev["title"] : "",
        impact: typeof ev["impact"] === "string" ? ev["impact"] : "",
        direction: typeof ev["direction"] === "string" ? ev["direction"] : "",
      };
    },
  );

  // stock_performance_json is an OBJECT keyed by ticker → convert to array
  const rawStockPerf = parseJsonField<unknown>(row.stock_performance_json, null);
  const stockPerfArray = mapKeyedToArray(rawStockPerf);
  const stockPerformance: StockPerformanceItem[] = stockPerfArray.map((item) => ({
    symbol: typeof item["symbol"] === "string" ? item["symbol"] : "",
    firstPrice: typeof item["firstPrice"] === "number" ? item["firstPrice"] : 0,
    lastPrice: typeof item["lastPrice"] === "number" ? item["lastPrice"] : 0,
    changePct: typeof item["changePct"] === "number" ? item["changePct"] : 0,
    alertCount: typeof item["alertCount"] === "number" ? item["alertCount"] : 0,
  }));

  // recommendation_json is an OBJECT keyed by ticker → convert to array
  const rawRec = parseJsonField<unknown>(row.recommendation_json, null);
  const recArray = mapKeyedToArray(rawRec);
  const recommendations: RecommendationItem[] = recArray.map((item) => ({
    symbol: typeof item["symbol"] === "string" ? item["symbol"] : "",
    outlook: typeof item["outlook"] === "string" ? item["outlook"] : "",
    confidence: typeof item["confidence"] === "number" ? item["confidence"] : 0,
    reasoning: typeof item["reasoning"] === "string" ? item["reasoning"] : "",
  }));

  return {
    id: row.id,
    periodType: row.period_type,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    summaryText: row.summary_text,
    keyEvents,
    stockPerformance,
    recommendations,
    newsCount: row.news_count ?? 0,
    alertCount: row.alert_count ?? 0,
    reportCount: row.report_count ?? 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle GET /api/market-summaries.
 *
 * DETAIL mode (?id=<id>):
 *   Returns { generatedAt, item: MarketSummaryDetail | null }
 *   200 in both cases (item=null when not found — no 404).
 *
 * LIST mode (no ?id=):
 *   Returns { generatedAt, periods: {daily:N,...}, items: MarketSummaryListItem[], count }
 *   200 even when empty.
 *
 * @param req  - Incoming HTTP request
 * @param res  - HTTP response
 * @param db   - SQLite database instance (injected by server.ts)
 * @param now  - Optional clock override for testability (defaults to new Date())
 */
export function handleGetMarketSummaries(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  now: Date = new Date(),
): void {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");

    // ── DETAIL mode: ?id= present ──────────────────────────────────────────
    const idParam = url.searchParams.get("id");
    if (idParam) {
      const row = getMarketSummaryById(db, idParam);
      const item = row ? buildDetail(row) : null;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          generatedAt: now.toISOString(),
          item,
        }),
      );
      return;
    }

    // ── LIST mode ─────────────────────────────────────────────────────────

    // Parse ?period= — ignore if invalid
    const periodParam = url.searchParams.get("period");
    const periodFilter =
      periodParam && VALID_PERIOD_TYPES.has(periodParam)
        ? periodParam
        : undefined;

    // Parse ?limit= — clamp [1, 200], default 60
    const limitParam = url.searchParams.get("limit");
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(limitParam ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
    );

    const rows = getMarketSummaryList(db, periodFilter, limit);
    const items = rows.map(buildListItem);

    // Build periods dict: { daily: 76, weekly: 13, ... }
    const periodCountsRaw = getPeriodCounts(db);
    const periods: Record<string, number> = {};
    for (const pc of periodCountsRaw) {
      periods[pc.periodType] = pc.count;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        generatedAt: now.toISOString(),
        periods,
        items,
        count: items.length,
      }),
    );
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "db_error",
        detail: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
