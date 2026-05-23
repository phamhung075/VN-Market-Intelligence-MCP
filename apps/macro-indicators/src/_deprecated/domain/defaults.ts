/**
 * Macro Indicators Domain — Defaults
 *
 * Default symbol/ticker sets for external macro data sources.
 * Defined here (domain layer) so that application and infrastructure
 * layers can both import from a single DDD-compliant location.
 *
 * DDD rule: application layer imports these constants from domain/defaults.ts.
 *           Infrastructure adapters re-export them for backward-compat; they
 *           must not be the source-of-truth for the values.
 */

/** Default symbol set for Yahoo Finance v8 chart API:
 *  FX rates relevant to VN market + global indices. */
export const DEFAULT_SYMBOLS: string[] = [
  // FX rates
  'EURUSD=X', 'USDVND=X', 'USDJPY=X', 'GBPUSD=X', 'DTWEXBGS',
  // Global indices
  '^GSPC',     // S&P 500
  '^DJI',      // Dow Jones
  '^IXIC',     // NASDAQ
  '^N225',     // Nikkei 225
  '^HSI',      // Hang Seng
  '000001.SS', // Shanghai Composite
  '^FTSE',     // FTSE 100
];

/**
 * Default symbol set for CNBC quote API: global market coverage.
 *
 * 2026-05-13 fix: CNBC quote API returns price data only for dot-prefixed
 * symbols. Legacy names (SP500, DJ30, NASDAQ, NIKKEI225, FTSE100, HK.HSI)
 * return code=1 with no price — they are excluded.
 */
export const DEFAULT_CNBC_SYMBOLS: string[] = [
  '.SPX',   // S&P 500
  '.DJI',   // Dow Jones Industrial Average
  '.IXIC',  // NASDAQ Composite
  '.N225',  // Nikkei 225
  '.HSI',   // Hang Seng Index
  '.FTSE',  // FTSE 100
];
