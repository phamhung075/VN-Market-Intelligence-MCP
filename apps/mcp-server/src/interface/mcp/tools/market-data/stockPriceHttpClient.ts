/**
 * Task TASK-17 P2-1a — Shared HTTP client configuration for stock-price microservice.
 *
 * Single source of truth for the stock-price base URL.
 * Reads STOCK_PRICE_URL env var at call-time with localhost:5000 as default fallback.
 *
 * Mirrors macroHttpClient.ts pattern exactly:
 *   - Read env at call-time (not module load time) so tests can override.
 *   - Default matches apps/mcp-server/src/infrastructure/microservices/clients.ts BASE_URLS.stockPrice.
 *
 * @module interface/mcp/tools/market-data/stockPriceHttpClient
 */

/**
 * Returns the base URL for the stock-price HTTP service.
 * Reads STOCK_PRICE_URL at call-time to allow test overrides.
 */
export function getStockPriceBaseUrl(): string {
  return Bun.env.STOCK_PRICE_URL ?? "http://localhost:5000";
}
