/**
 * FIX-B-2 — get_market_cap MCP Tool
 *
 * Returns structured market cap JSON for a single stock ticker.
 * Reads market_cap_bn from vnstock_trading_stats (persisted by FIX-B-1).
 * Computes shares_outstanding_approx via safe-divide(market_cap_bn * 1e9 / close_price).
 *
 * Output contract:
 *   { code, market_cap_billion, shares_outstanding_approx, fetched_at }
 *   - market_cap_billion:    number | null  (null if not yet fetched)
 *   - shares_outstanding_approx: number | null (null if close price unavailable)
 *   - fetched_at: ISO string from vnstock_trading_stats.fetched_at
 *
 * Layer: interface/mcp/tools — may import infrastructure and domain.
 *
 * @module interface/mcp/tools/market-data/marketCapTools
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Database } from "bun:sqlite";
import { z } from "zod";
import { getDb } from "../../../../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// DB row types
// ─────────────────────────────────────────────────────────────────────────────

interface TradingStatsRow {
  market_cap_bn: number | null;
  fetched_at: string;
}

interface LatestCloseRow {
  close: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Output type (exported for test consumers)
// ─────────────────────────────────────────────────────────────────────────────

export interface MarketCapResult {
  code: string;
  market_cap_billion: number | null;
  shares_outstanding_approx: number | null;
  fetched_at: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core query logic — injectable DB for unit tests
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Query market cap data for a single ticker.
 *
 * Returns null market_cap_billion when the ticker is unknown or not yet fetched.
 * Returns null shares_outstanding_approx when close price is zero or unavailable
 * (safe-divide guard — no divide-by-zero).
 */
export function queryMarketCap(db: Database, code: string): MarketCapResult {
  const upperCode = code.toUpperCase().trim();

  // 1. Fetch latest trading stats row for this code
  const statsRow = db
    .prepare<TradingStatsRow, [string]>(
      `SELECT market_cap_bn, fetched_at
       FROM vnstock_trading_stats
       WHERE code = ?
       ORDER BY fetched_at DESC
       LIMIT 1`,
    )
    .get(upperCode);

  if (!statsRow) {
    return {
      code: upperCode,
      market_cap_billion: null,
      shares_outstanding_approx: null,
      fetched_at: null,
    };
  }

  const marketCapBillion = statsRow.market_cap_bn ?? null;

  // 2. Fetch latest close price from daily_ohlcv for shares computation
  let sharesApprox: number | null = null;

  if (marketCapBillion !== null && marketCapBillion > 0) {
    try {
      const priceRow = db
        .prepare<LatestCloseRow, [string]>(
          `SELECT close
           FROM daily_ohlcv
           WHERE code = ?
           ORDER BY date DESC
           LIMIT 1`,
        )
        .get(upperCode);

      if (priceRow && priceRow.close > 0) {
        // market_cap_billion is in billion VND; close is in VND
        // shares_outstanding_approx = (market_cap_billion * 1_000_000_000) / close_price
        const marketCapVND = marketCapBillion * 1_000_000_000;
        sharesApprox = Math.round(marketCapVND / priceRow.close);
      }
      // If close === 0 or row missing → sharesApprox stays null (honest sparse-data)
    } catch {
      // daily_ohlcv may not exist in test DBs — safe-degrade to null
      sharesApprox = null;
    }
  }

  return {
    code: upperCode,
    market_cap_billion: marketCapBillion,
    shares_outstanding_approx: sharesApprox,
    fetched_at: statsRow.fetched_at,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the get_market_cap MCP tool.
 *
 * @param server    - The McpServer instance to register tools on.
 * @param resolveDb - Optional DB resolver (defaults to getDb for production;
 *                    inject an in-memory DB in tests).
 */
export function registerMarketCapTools(
  server: McpServer,
  resolveDb: () => Database = getDb,
): void {
  server.tool(
    "get_market_cap",
    "Return structured market capitalisation data for a single Vietnamese stock ticker. " +
      "Returns { code, market_cap_billion, shares_outstanding_approx, fetched_at }. " +
      "market_cap_billion is in billion VND (null if not yet fetched by vnstock sync). " +
      "shares_outstanding_approx is derived from market_cap / latest close price (null when price unavailable — honest sparse-data). " +
      "Data is populated by syncVnstockData via the trading_stats fetch (FIX-B-1). " +
      "Source tier: 2 (vnstock VCI aggregator — same as trading_stats).",
    {
      code: z
        .string()
        .min(1)
        .max(10)
        .describe("Stock ticker, e.g. 'VNM' or 'FPT'."),
    },
    async ({ code }) => {
      try {
        const db = resolveDb();
        const result = queryMarketCap(db, code);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                code: code.toUpperCase().trim(),
                market_cap_billion: null,
                shares_outstanding_approx: null,
                fetched_at: null,
                error: err instanceof Error ? err.message : String(err),
              }),
            },
          ],
        };
      }
    },
  );
}
