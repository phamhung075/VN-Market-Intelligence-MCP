/**
 * Interface — GET /mcp/api/prices/batch
 *
 * Returns the latest price snapshot for a set of tickers (watchlist tiles).
 *
 * Query params:
 *   tickers — comma-separated list of uppercase ticker codes, max 50
 *
 * Response shape matches Shape 1 of fetchWatchlistPrices client parser:
 *   { quotes: { [ticker]: { ticker, close, changePct, direction, signalCount } } }
 *
 * Price source priority:
 *   1. market_prices.price (intraday, may be empty outside trading hours)
 *   2. daily_ohlcv.close (latest date fallback)
 *
 * changePct from market_prices.change_pct; falls back to 0 when missing.
 * direction: changePct > 0.01 → "up"; < -0.01 → "down"; else "flat".
 * signalCount: COUNT from agent_signals for the last 24 hours per stock.
 *
 * Error cases:
 *   400 — missing or empty tickers param
 *   500 — DB error
 *
 * DI contract: db injected by caller (server.ts). No getDb() here.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";

const MAX_TICKERS = 50;

interface PriceRow {
  code: string;
  price: number | null;
  change_pct: number | null;
}

interface OhlcvLatest {
  code: string;
  close: number;
}

interface SignalCountRow {
  stock_code: string;
  cnt: number;
}

function directionFromChangePct(pct: number): "up" | "down" | "flat" {
  if (pct > 0.01) return "up";
  if (pct < -0.01) return "down";
  return "flat";
}

export function handlePriceBatch(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
): void {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const rawTickers = url.searchParams.get("tickers") ?? "";

    if (!rawTickers.trim()) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing required param: tickers" }));
      return;
    }

    // Parse, uppercase, deduplicate, cap at MAX_TICKERS
    const tickers = [
      ...new Set(
        rawTickers
          .split(",")
          .map((t) => t.trim().toUpperCase())
          .filter(Boolean),
      ),
    ].slice(0, MAX_TICKERS);

    if (tickers.length === 0) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "No valid tickers provided" }));
      return;
    }

    // Build parameterized placeholders (safe — never string-interpolated values)
    const placeholders = tickers.map(() => "?").join(",");

    // Query market_prices for all tickers in one shot
    const priceRows = db
      .prepare<PriceRow, string[]>(
        `SELECT code, price, change_pct
         FROM market_prices
         WHERE code IN (${placeholders})`,
      )
      .all(...tickers) as PriceRow[];

    const priceMap = new Map<string, PriceRow>();
    for (const row of priceRows) {
      priceMap.set(row.code, row);
    }

    // Determine which tickers need OHLCV fallback (no intraday price or price=0)
    const missingPriceTickers = tickers.filter((t) => {
      const p = priceMap.get(t);
      return !p || !p.price || p.price <= 0;
    });

    const ohlcvMap = new Map<string, number>();
    if (missingPriceTickers.length > 0) {
      const fallbackPlaceholders = missingPriceTickers.map(() => "?").join(",");
      // Get latest close per code using a GROUP BY + MAX(date) correlated query
      const ohlcvRows = db
        .prepare<OhlcvLatest, string[]>(
          `SELECT d.code, d.close
           FROM daily_ohlcv d
           INNER JOIN (
             SELECT code, MAX(date) AS max_date
             FROM daily_ohlcv
             WHERE code IN (${fallbackPlaceholders})
             GROUP BY code
           ) latest ON latest.code = d.code AND latest.max_date = d.date`,
        )
        .all(...missingPriceTickers) as OhlcvLatest[];

      for (const row of ohlcvRows) {
        ohlcvMap.set(row.code, row.close);
      }
    }

    // Query agent_signals count per ticker for last 24h
    const signalRows = db
      .prepare<SignalCountRow, string[]>(
        `SELECT stock_code, COUNT(*) AS cnt
         FROM agent_signals
         WHERE stock_code IN (${placeholders})
           AND created_at >= datetime('now', '-24 hours')
         GROUP BY stock_code`,
      )
      .all(...tickers) as SignalCountRow[];

    const signalMap = new Map<string, number>();
    for (const row of signalRows) {
      signalMap.set(row.stock_code, row.cnt);
    }

    // Assemble response
    const quotes: Record<string, {
      ticker: string;
      close: number;
      changePct: number;
      direction: "up" | "down" | "flat";
      signalCount: number;
    }> = {};

    for (const ticker of tickers) {
      const mp = priceMap.get(ticker);
      const close =
        (mp?.price && mp.price > 0)
          ? mp.price
          : (ohlcvMap.get(ticker) ?? 0);
      const changePct = mp?.change_pct ?? 0;
      const direction = directionFromChangePct(changePct);
      const signalCount = signalMap.get(ticker) ?? 0;

      quotes[ticker] = { ticker, close, changePct, direction, signalCount };
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ quotes }));
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
