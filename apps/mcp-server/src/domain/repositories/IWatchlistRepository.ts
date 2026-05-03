// apps/mcp-server/src/domain/repositories/IWatchlistRepository.ts
// Task 1838b — Domain port for watchlist data access.
// ZERO imports from infrastructure/.

export interface WatchlistEntry {
  code: string;
  domain: string;
}

export interface IWatchlistRepository {
  /** Return all watchlist entries (code + domain). Empty array if table missing. */
  getAll(): WatchlistEntry[];

  /** Return all watchlist codes plus reference/context stock codes for VPS dispatch. */
  getAllCodesForVps(): { watchlist: string[]; reference: string[] };
}
