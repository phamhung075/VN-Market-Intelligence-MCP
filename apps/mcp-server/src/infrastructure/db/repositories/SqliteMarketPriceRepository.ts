// apps/mcp-server/src/infrastructure/db/repositories/SqliteMarketPriceRepository.ts
// Task 1838b — SQLite adapter for IMarketPriceRepository.
// Wraps existing queries from scanMarket.ts verbatim. No schema changes.

import type { Database } from "bun:sqlite";
import type {
  IMarketPriceRepository,
  ConvictionRecord,
  RecentNewsTitle,
} from "../../../domain/repositories/IMarketPriceRepository.js";

export class SqliteMarketPriceRepository implements IMarketPriceRepository {
  constructor(private readonly db: Database) {}

  getAvgVolume(
    code: string,
    todayUtc: string,
    historyLimit: number,
    minHistoryRows: number,
  ): number {
    try {
      const row = this.db
        .query<{ avg_vol: number | null }, [string, string, number]>(
          `SELECT AVG(day_vol) as avg_vol FROM (
             SELECT MAX(volume) as day_vol
             FROM market_prices_history
             WHERE code = ? AND substr(fetched_at, 1, 10) < ?
             GROUP BY substr(fetched_at, 1, 10)
             ORDER BY substr(fetched_at, 1, 10) DESC
             LIMIT ?
           )`,
        )
        .get(code, todayUtc, historyLimit);

      const countRow = this.db
        .query<{ cnt: number }, [string, string]>(
          `SELECT COUNT(DISTINCT substr(fetched_at, 1, 10)) as cnt
           FROM market_prices_history
           WHERE code = ? AND substr(fetched_at, 1, 10) < ?`,
        )
        .get(code, todayUtc);

      if (!countRow || countRow.cnt < minHistoryRows) {
        return 0;
      }

      return row?.avg_vol ?? 0;
    } catch {
      return 0;
    }
  }

  upsertConvictionHistory(record: ConvictionRecord): boolean {
    try {
      this.db
        .prepare(
          `INSERT OR REPLACE INTO conviction_history (symbol, date, peak_score, dominant_signal, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          record.symbol,
          record.date,
          record.peakScore,
          record.dominantSignal,
          record.createdAt,
        );
      return true;
    } catch {
      // conviction_history table may not exist — best-effort
      return false;
    }
  }

  getRecentNewsTitles(
    code: string,
    withinHours: number,
    limit: number,
  ): RecentNewsTitle[] {
    try {
      const rows = this.db
        .query<{ source_title: string }, [string, string]>(
          `SELECT source_title FROM rag_analyses
           WHERE affected_actions LIKE '%' || ? || '%'
             AND created_at > datetime('now', ? || ' hours')
           ORDER BY created_at DESC LIMIT ${limit}`,
        )
        .all(code, String(-withinHours));
      return rows.map((r) => ({ sourceTitle: r.source_title }));
    } catch {
      return [];
    }
  }
}
