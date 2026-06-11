/**
 * foreignFlowHandler.ts — GET /api/foreign-flow
 *
 * TASK17-FOREIGN-FLOW endpoint wave:
 * Serve the latest trading day's foreign net buy/sell from `vnstock_trading_stats`.
 *
 * Source: `vnstock_trading_stats` SQLite table.
 * Latest trading day = MAX(date) with foreign_volume IS NOT NULL.
 * Rows ordered by foreign_volume DESC (net buys first, net sells last).
 *
 * Live contract (probed 2026-06-11):
 *   columns: id, code, foreign_volume (INTEGER, sign = direction),
 *            foreign_room (REAL), current_holding_ratio (REAL|NULL),
 *            max_holding_ratio (REAL|NULL), market_cap_bn (REAL|NULL),
 *            date (TEXT), fetched_at (TEXT)
 *   NOTE: current_holding_ratio, max_holding_ratio, market_cap_bn are NULL
 *         on today's rows — handler tolerates nulls and passes them as-is.
 *
 * DO NOT confuse with /api/foreign-flow-status (auth-gated diagnostic, broken schema).
 *
 * Response shape (200 OK):
 *   {
 *     tradingDate:  string,           // "YYYY-MM-DD" latest trading date
 *     items: [
 *       {
 *         code:                string,
 *         foreignVolume:       number,          // signed integer; non-null (WHERE guard)
 *         direction:           "BUY"|"SELL"|"FLAT",
 *         foreignRoom:         number | null,
 *         currentHoldingRatio: number | null,
 *         maxHoldingRatio:     number | null,
 *         marketCapBn:         number | null,
 *         fetchedAt:           string,
 *       },
 *       ...
 *     ],
 *     summary: {
 *       netBuyCount:  number,
 *       netSellCount: number,
 *       topBuys:  items[0..4]  (up to 5)
 *       topSells: items[last5] (up to 5, ascending by foreignVolume)
 *     },
 *     count:     number,   // items.length
 *     fetchedAt: string    // ISO 8601 server clock
 *   }
 *
 * Query params:
 *   ?limit=N    — default 200, clamped [1, 500]
 *
 * 200 + empty items[] when no rows exist (no error).
 * 500 on DB error.
 *
 * DDD Layer: interface — imports only from bun:sqlite (DB type), never from
 * domain/.  db is injected by server.ts (no getDb() call here).
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Raw SQLite row from vnstock_trading_stats. */
interface TradingStatsRow {
  code: string;
  foreign_volume: number;
  foreign_room: number | null;
  current_holding_ratio: number | null;
  max_holding_ratio: number | null;
  market_cap_bn: number | null;
  date: string;
  fetched_at: string;
}

/** Direction derived from sign of foreign_volume. */
export type ForeignFlowDirection = "BUY" | "SELL" | "FLAT";

/** One item in the response array. */
export interface ForeignFlowItem {
  code: string;
  foreignVolume: number;
  direction: ForeignFlowDirection;
  foreignRoom: number | null;
  currentHoldingRatio: number | null;
  maxHoldingRatio: number | null;
  marketCapBn: number | null;
  fetchedAt: string;
}

/** Summary block in response. */
export interface ForeignFlowSummary {
  netBuyCount: number;
  netSellCount: number;
  topBuys: ForeignFlowItem[];
  topSells: ForeignFlowItem[];
}

/** Full response body for GET /api/foreign-flow. */
export interface ForeignFlowResponse {
  tradingDate: string;
  items: ForeignFlowItem[];
  summary: ForeignFlowSummary;
  count: number;
  fetchedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive direction from the sign of foreignVolume.
 * >0 → BUY, <0 → SELL, 0 → FLAT.
 * Exported for testability.
 */
export function deriveDirection(foreignVolume: number): ForeignFlowDirection {
  if (foreignVolume > 0) return "BUY";
  if (foreignVolume < 0) return "SELL";
  return "FLAT";
}

/**
 * Shape a raw DB row into a ForeignFlowItem.
 * Null numeric fields are passed through as null (not 0 — preserves unknown).
 * Exported for testability.
 */
export function shapeRow(row: TradingStatsRow): ForeignFlowItem {
  return {
    code: row.code,
    foreignVolume: row.foreign_volume,
    direction: deriveDirection(row.foreign_volume),
    foreignRoom: row.foreign_room ?? null,
    currentHoldingRatio: row.current_holding_ratio ?? null,
    maxHoldingRatio: row.max_holding_ratio ?? null,
    marketCapBn: row.market_cap_bn ?? null,
    fetchedAt: row.fetched_at,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Core query — exported for testability
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Query foreign flow stats for the latest trading day.
 *
 * Returns ALL rows for the latest trading day (capped at MAX_LIMIT=500, which
 * safely exceeds the ~103 real rows) plus a display-limited slice.
 *
 * @param db    - SQLite database instance (injected)
 * @param limit - Max rows for the DISPLAY items slice (default 200, clamped [1, 500])
 * @returns Object with tradingDate, allItems (full day, for summary), and items (display slice)
 */
export function queryForeignFlow(
  db: Database,
  limit: number = DEFAULT_LIMIT,
): { tradingDate: string; allItems: ForeignFlowItem[]; items: ForeignFlowItem[] } {
  const clampedLimit = Math.min(MAX_LIMIT, Math.max(1, isNaN(limit) ? DEFAULT_LIMIT : limit));

  // Fetch the full latest-day set (capped at MAX_LIMIT — well above real row count ~103).
  // Summary is computed over allItems; display items are sliced after.
  const sql = `
    SELECT code, foreign_volume, foreign_room,
           current_holding_ratio, max_holding_ratio, market_cap_bn,
           date, fetched_at
    FROM vnstock_trading_stats
    WHERE date = (SELECT MAX(date) FROM vnstock_trading_stats)
      AND foreign_volume IS NOT NULL
    ORDER BY foreign_volume DESC
    LIMIT ?
  `;

  const rows = db.prepare<TradingStatsRow, [number]>(sql).all(MAX_LIMIT) as TradingStatsRow[];

  const tradingDate = rows.length > 0 ? (rows[0]!.date) : "";
  const allItems = rows.map(shapeRow);
  const items = allItems.slice(0, clampedLimit);

  return { tradingDate, allItems, items };
}

/**
 * Build summary block from the FULL latest-day shaped items.
 * topBuys:  first 5 (already DESC, highest positive first).
 * topSells: 5 most-negative foreignVolume (most negative first = biggest sellers first).
 * Exported for testability.
 */
export function buildSummary(items: ForeignFlowItem[]): ForeignFlowSummary {
  const netBuys = items.filter((i) => i.direction === "BUY");
  const netSells = items.filter((i) => i.direction === "SELL");

  // topSells: sort sell rows by foreignVolume ASC so most-negative comes first,
  // then take the first 5. This is independent of the order items arrive in.
  const topSells = netSells
    .slice()
    .sort((a, b) => a.foreignVolume - b.foreignVolume)
    .slice(0, 5);

  return {
    netBuyCount: netBuys.length,
    netSellCount: netSells.length,
    topBuys: netBuys.slice(0, 5),
    topSells,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle GET /api/foreign-flow.
 *
 * @param req  - Incoming HTTP request (reads ?limit= query param)
 * @param res  - HTTP response
 * @param db   - SQLite database instance (injected by server.ts)
 * @param now  - Optional clock override for testability (defaults to new Date())
 */
export function handleGetForeignFlow(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  now: Date = new Date(),
): void {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const limitParam = url.searchParams.get("limit");
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(limitParam ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
    );

    // allItems = full latest-day set (for authoritative summary)
    // items    = display-limited slice (for client)
    const { tradingDate, allItems, items } = queryForeignFlow(db, limit);
    const summary = buildSummary(allItems);

    const body: ForeignFlowResponse = {
      tradingDate,
      items,
      summary,
      count: items.length,
      fetchedAt: now.toISOString(),
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
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
