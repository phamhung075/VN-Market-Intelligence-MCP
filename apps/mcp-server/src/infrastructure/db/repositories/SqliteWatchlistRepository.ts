// apps/mcp-server/src/infrastructure/db/repositories/SqliteWatchlistRepository.ts
// Task 1838b — SQLite adapter for IWatchlistRepository.
// Wraps existing watchlist queries verbatim. No schema changes.

import type { Database } from "bun:sqlite";
import type {
  IWatchlistRepository,
  WatchlistEntry,
  WatchlistThresholds,
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

  getThresholds(): Map<string, WatchlistThresholds> {
    const result = new Map<string, WatchlistThresholds>();
    try {
      const rows = this.db
        .query<{ code: string; alert_drop_pct: number | null; alert_rise_pct: number | null }, []>(
          "SELECT code, alert_drop_pct, alert_rise_pct FROM watchlist WHERE alert_drop_pct IS NOT NULL AND alert_rise_pct IS NOT NULL",
        )
        .all();
      for (const row of rows) {
        if (row.alert_drop_pct !== null && row.alert_rise_pct !== null) {
          result.set(row.code, {
            dropPct: row.alert_drop_pct,
            risePct: row.alert_rise_pct,
          });
        }
      }
    } catch {
      // table may not exist yet — return empty map
    }
    return result;
  }
}
