// apps/mcp-server/src/domain/repositories/IWatchlistRepository.ts
// Task 1838b — Domain port for watchlist data access.
// ZERO imports from infrastructure/.

export interface WatchlistEntry {
  code: string;
  domain: string;
}

/**
 * Per-stock alert thresholds stored in the watchlist table.
 * Negative dropPct (e.g. -7) means drop of 7% or more triggers alert.
 * Positive risePct (e.g. 5) means rise of 5% or more triggers alert.
 */
export interface WatchlistThresholds {
  dropPct: number;
  risePct: number;
}

export interface IWatchlistRepository {
  /** Return all watchlist entries (code + domain). Empty array if table missing. */
  getAll(): WatchlistEntry[];

  /** Return all watchlist codes plus reference/context stock codes for VPS dispatch. */
  getAllCodesForVps(): { watchlist: string[]; reference: string[] };

  /**
   * Return per-stock thresholds for all watchlist codes.
   * Only codes with explicit (non-null) alert_drop_pct / alert_rise_pct rows are included.
   * Returns empty map if table missing or has no threshold data.
   */
  getThresholds(): Map<string, WatchlistThresholds>;
}
