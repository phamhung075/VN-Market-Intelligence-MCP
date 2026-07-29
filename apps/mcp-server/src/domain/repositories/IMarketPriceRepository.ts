// apps/mcp-server/src/domain/repositories/IMarketPriceRepository.ts
// Task 1838b — Domain port for market price data access.
// ZERO imports from infrastructure/.

export interface VolumeHistory {
  avgVolume: number;
}

export interface ConvictionRecord {
  symbol: string;
  date: string;
  peakScore: number;
  dominantSignal: string;
  createdAt: string;
}

export interface RecentNewsTitle {
  sourceTitle: string;
}

export interface IMarketPriceRepository {
  /**
   * Compute rolling average volume for a stock, excluding today's open session.
   * Returns 0 when fewer than minHistoryRows closed days exist.
   */
  getAvgVolume(code: string, todayUtc: string, historyLimit: number, minHistoryRows: number): number;

  /**
   * Upsert a conviction history row (INSERT OR REPLACE).
   *
   * @returns true if the row was written; false if the write failed (e.g. the
   *   conviction_history table does not exist yet) — best-effort, never throws.
   *   FIX-CONVICTION-HISTORY-EOD-BACKFILL: callers use this to detect a
   *   same-cycle zero-row write failure for observability.
   */
  upsertConvictionHistory(record: ConvictionRecord): boolean;

  /**
   * Fetch recent news titles from rag_analyses for a stock within the last N hours.
   */
  getRecentNewsTitles(code: string, withinHours: number, limit: number): RecentNewsTitle[];
}
