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

/** Default symbol set for CNBC quote API: global market coverage. */
export const DEFAULT_CNBC_SYMBOLS: string[] = [
  'SP500',     // S&P 500
  'DJ30',      // Dow Jones Industrial Average
  'NASDAQ',    // NASDAQ Composite
  'NIKKEI225', // Nikkei 225
  'FTSE100',   // FTSE 100
  'HK.HSI',    // Hang Seng Index
];
