// apps/mcp-server/src/infrastructure/db/repositories/SqliteKinhDichScoreRepository.ts
// Task 1838b — SQLite adapter for IKinhDichScoreRepository.
// Wraps queries currently inline in kinhDichTools.ts. No schema changes.

import type { Database } from "bun:sqlite";
import type {
  IKinhDichScoreRepository,
  SentimentRow,
  FundamentalsRow,
  PriceRow,
  TradingStatsRow,
  MacroRow,
} from "../../../domain/repositories/IKinhDichScoreRepository.js";

export class SqliteKinhDichScoreRepository implements IKinhDichScoreRepository {
  constructor(private readonly db: Database) {}

  getRecentSentiments(code: string, days: number, limit: number): SentimentRow[] {
    try {
      const rows = this.db
        .query<{ metadata: string }, [string, string]>(
          `SELECT metadata FROM rag_analyses
           WHERE stock_code = ? AND timestamp >= datetime('now', ? || ' days')
           ORDER BY timestamp DESC LIMIT ${limit}`,
        )
        .all(code, String(-days));
      return rows.map((r) => ({ sentiment: r.metadata }));
    } catch {
      return [];
    }
  }

  getLatestPe(code: string): FundamentalsRow | null {
    try {
      const tableCheck = this.db
        .query<{ name: string }, [string]>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        )
        .get("vnstock_financials");
      if (!tableCheck) return null;

      const row = this.db
        .query<{ pe: number | null }, [string]>(
          `SELECT pe FROM vnstock_financials WHERE code = ?
           ORDER BY year_report DESC, quarter DESC LIMIT 1`,
        )
        .get(code);
      if (!row) return null;
      return { pe: row.pe };
    } catch {
      return null;
    }
  }

  getSectorPeList(domain: string, limit: number): FundamentalsRow[] {
    try {
      const tableCheck = this.db
        .query<{ name: string }, [string]>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        )
        .get("vnstock_financials");
      if (!tableCheck) return [];

      const rows = this.db
        .query<{ pe: number }, [string]>(
          `SELECT f.pe FROM vnstock_financials f
           INNER JOIN watchlist w ON w.code = f.code
           WHERE w.domain = ? AND f.pe > 0
           ORDER BY f.year_report DESC, f.quarter DESC
           LIMIT ${limit}`,
        )
        .all(domain);
      return rows.map((r) => ({ pe: r.pe }));
    } catch {
      return [];
    }
  }

  getLatestChangePct(code: string): PriceRow | null {
    try {
      const row = this.db
        .query<{ change_pct: number | null }, [string]>(
          "SELECT change_pct FROM market_prices WHERE code = ? ORDER BY rowid DESC LIMIT 1",
        )
        .get(code);
      if (!row) return null;
      return { changePct: row.change_pct };
    } catch {
      return null;
    }
  }

  getLatestTradingStats(code: string): TradingStatsRow | null {
    try {
      const tableCheck = this.db
        .query<{ name: string }, [string]>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        )
        .get("vnstock_trading_stats");
      if (!tableCheck) return null;

      const row = this.db
        .query<
          { foreign_volume: number | null; avg_volume_2w: number | null },
          [string]
        >(
          `SELECT foreign_volume, avg_volume_2w FROM vnstock_trading_stats
           WHERE code = ? ORDER BY fetched_at DESC LIMIT 1`,
        )
        .get(code);
      if (!row) return null;
      return {
        foreignVolume: row.foreign_volume,
        avgVolume2w: row.avg_volume_2w,
      };
    } catch {
      return null;
    }
  }

  getLatestMacroIndicator(indicator: string): MacroRow | null {
    try {
      const row = this.db
        .query<{ value: number | null }, [string]>(
          `SELECT value FROM tracked_indicators
           WHERE indicator = ? ORDER BY extracted_at DESC LIMIT 1`,
        )
        .get(indicator);
      if (!row) return null;
      return { value: row.value, indicator };
    } catch {
      return null;
    }
  }

  getWatchlistDomain(code: string): string | null {
    try {
      const row = this.db
        .query<{ domain: string }, [string]>(
          "SELECT domain FROM watchlist WHERE code = ?",
        )
        .get(code);
      return row?.domain ?? null;
    } catch {
      return null;
    }
  }

  getMarketPricesForCodes(codes: string[]): Array<{ code: string; changePct: number }> {
    if (codes.length === 0) return [];
    try {
      const placeholders = codes.map(() => "?").join(",");
      const rows = this.db
        .query<{ code: string; change_pct: number | null }, string[]>(
          `SELECT code, change_pct FROM market_prices WHERE code IN (${placeholders})`,
        )
        .all(...codes);
      return rows.map((r) => ({ code: r.code, changePct: r.change_pct ?? 0 }));
    } catch {
      return [];
    }
  }
}
