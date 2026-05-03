// apps/mcp-server/src/domain/repositories/IKinhDichScoreRepository.ts
// Task 1838b — Domain port for Kinh Dich score data access.
// ZERO imports from infrastructure/.

export interface SentimentRow {
  sentiment: string;
}

export interface FundamentalsRow {
  pe: number | null;
}

export interface PriceRow {
  changePct: number | null;
}

export interface TradingStatsRow {
  foreignVolume: number | null;
  avgVolume2w: number | null;
}

export interface MacroRow {
  value: number | null;
  indicator: string;
}

export interface IKinhDichScoreRepository {
  /** Recent sentiment metadata for stock from rag_analyses (last 7 days). */
  getRecentSentiments(code: string, days: number, limit: number): SentimentRow[];

  /** Latest PE ratio for a stock from vnstock_financials. */
  getLatestPe(code: string): FundamentalsRow | null;

  /** Average PE for all stocks in a domain (sector proxy). */
  getSectorPeList(domain: string, limit: number): FundamentalsRow[];

  /** Latest change_pct from market_prices. */
  getLatestChangePct(code: string): PriceRow | null;

  /** Latest foreign flow vs avg volume from vnstock_trading_stats. */
  getLatestTradingStats(code: string): TradingStatsRow | null;

  /** Latest macro indicator value (e.g. GDP growth, inflation). */
  getLatestMacroIndicator(indicator: string): MacroRow | null;

  /** Domain for a watchlist stock. */
  getWatchlistDomain(code: string): string | null;

  /** Lookup market prices for a set of codes for sector-wide Kinh Dich context. */
  getMarketPricesForCodes(codes: string[]): Array<{ code: string; changePct: number }>;
}
