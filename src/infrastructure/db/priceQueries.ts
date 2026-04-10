/**
 * Reusable SQL fragments for price lookups with daily_ohlcv fallback.
 *
 * market_prices may be empty outside VN trading hours (09:00-15:30 VN).
 * These helpers COALESCE with the latest daily_ohlcv close so that
 * briefings, positions, and Telegram commands never show N/A.
 */

/**
 * Returns a SQL scalar sub-expression that resolves the current price
 * for a given code column reference.
 *
 * Priority: market_prices.price > daily_ohlcv.close (latest date)
 *
 * Usage:
 *   `SELECT w.code, ${currentPriceQuery("w.code")} AS price FROM watchlist w`
 */
export function currentPriceQuery(codeRef: string): string {
  return `COALESCE(
    (SELECT mp.price FROM market_prices mp WHERE mp.code = ${codeRef} AND mp.price IS NOT NULL AND mp.price > 0),
    (SELECT d.close FROM daily_ohlcv d WHERE d.code = ${codeRef} ORDER BY d.date DESC LIMIT 1)
  )`;
}

/**
 * Returns a SQL scalar sub-expression for change_pct, market_prices only
 * (daily_ohlcv doesn't store intraday change).
 */
export function currentChangePctQuery(codeRef: string): string {
  return `(SELECT mp.change_pct FROM market_prices mp WHERE mp.code = ${codeRef} AND mp.price IS NOT NULL AND mp.price > 0)`;
}
