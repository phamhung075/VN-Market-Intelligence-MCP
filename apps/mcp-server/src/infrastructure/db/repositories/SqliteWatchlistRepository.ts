// apps/mcp-server/src/infrastructure/db/repositories/SqliteWatchlistRepository.ts
// Task 1838b — SQLite adapter for IWatchlistRepository.
// Wraps existing watchlist queries verbatim. No schema changes.

import type { Database } from "bun:sqlite";
import type {
  IWatchlistRepository,
  WatchlistEntry,
} from "../../../domain/repositories/IWatchlistRepository.js";

export class SqliteWatchlistRepository implements IWatchlistRepository {
  constructor(private readonly db: Database) {}

  getAll(): WatchlistEntry[] {
    try {
      return this.db
        .query<{ code: string; domain: string }, []>(
          "SELECT code, domain FROM watchlist",
        )
        .all()
        .map((r) => ({ code: r.code, domain: r.domain || "other" }));
    } catch {
      return [];
    }
  }

  getAllCodesForVps(): { watchlist: string[]; reference: string[] } {
    try {
      const rows = this.db
        .query<{ code: string }, []>(
          "SELECT code FROM watchlist",
        )
        .all();
      const watchlist = rows.map((r) => r.code);
      return { watchlist, reference: [] };
    } catch {
      return { watchlist: [], reference: [] };
    }
  }
}
