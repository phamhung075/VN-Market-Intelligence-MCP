/**
 * Stock Price Infrastructure — 3-Tier Price Fetchers
 *
 * Tier 1: VnDirect api-finfo (HOSE/HNX/UPCOM — most reliable)
 * Tier 2: finfo-api.vndirect (legacy endpoint fallback)
 * Tier 3: Cached last known price from SQLite
 */

import type { PriceFetcherPort, PriceHistoryPort } from '../domain/repositories.js';
import type { PriceQuote, DailyOHLCV } from '../domain/models.js';

// ─── Tier 1: VnDirect api-finfo ─────────────────────────────────────────────

export class Tier1VnDirectFetcher implements PriceFetcherPort {
  async fetchPrice(code: string): Promise<PriceQuote | null> {
    const start = Date.now();
    try {
      const url = `https://api-finfo.vndirect.com.vn/v4/stocks?q=code:${code}&size=1`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (!resp.ok) return null;
      const data = await resp.json() as {
        data?: Array<{ code: string; close: number; volume: number; change: number; pctChange: number }>;
      };
      const item = data?.data?.[0];
      if (!item) return null;
      return {
        code: item.code,
        price: item.close,
        volume: item.volume,
        change: item.change,
        changePercent: item.pctChange,
        source: 'hose',
        latencyMs: Date.now() - start,
        fetchedAt: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }
}

// ─── Tier 2: VnDirect finfo-api (legacy) ────────────────────────────────────

export class Tier2VnDirectLegacyFetcher implements PriceFetcherPort {
  async fetchPrice(code: string): Promise<PriceQuote | null> {
    const start = Date.now();
    try {
      const url = `https://finfo-api.vndirect.com.vn/v4/stocks?q=code:${code}&size=1`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (!resp.ok) return null;
      const data = await resp.json() as {
        data?: Array<{ code: string; matchPrice: number; totalVolume: number; priceChange: number; pctPriceChange: number }>;
      };
      const item = data?.data?.[0];
      if (!item) return null;
      return {
        code: item.code,
        price: item.matchPrice,
        volume: item.totalVolume,
        change: item.priceChange,
        changePercent: item.pctPriceChange,
        source: 'hnx',
        latencyMs: Date.now() - start,
        fetchedAt: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }
}

// ─── Tier 3: SQLite cache ────────────────────────────────────────────────────

export class Tier3CacheFetcher implements PriceFetcherPort {
  constructor(
    private readonly dbPath: string,
    private readonly ownDbPath: string = dbPath,
  ) {}

  async fetchPrice(code: string): Promise<PriceQuote | null> {
    const start = Date.now();
    try {
      const { Database } = await import('bun:sqlite');
      const db = new Database(this.dbPath, { readonly: true });
      const row = db.query<{ price: number; volume: number }, [string]>(
        `SELECT price, volume FROM market_prices WHERE code = ? ORDER BY fetched_at DESC LIMIT 1`,
      ).get(code);
      db.close();
      if (!row) return null;
      return {
        code,
        price: row.price,
        volume: row.volume,
        change: 0,
        changePercent: 0,
        source: 'cache',
        latencyMs: Date.now() - start,
        fetchedAt: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }
}

// ─── SQLite Price History Repository ────────────────────────────────────────

export class SQLitePriceHistoryRepository implements PriceHistoryPort {
  constructor(
    private readonly dbPath: string,
    private readonly ownDbPath: string = dbPath,
  ) {}

  async getHistory(code: string, days: number): Promise<DailyOHLCV[]> {
    try {
      const { Database } = await import('bun:sqlite');
      const db = new Database(this.dbPath, { readonly: true });
      const rows = db.query<{
        day: string; open: number; high: number; low: number; close: number; volume: number;
      }, [string, number]>(
        `SELECT
           date(fetched_at)  AS day,
           MIN(price)        AS low,
           MAX(price)        AS high,
           AVG(price)        AS close,
           AVG(price)        AS open,
           SUM(volume)       AS volume
         FROM market_prices
         WHERE code = ?
           AND fetched_at >= date('now', ? || ' days')
         GROUP BY date(fetched_at)
         ORDER BY day ASC`,
      ).all(code, -days);
      db.close();
      return rows.map((r) => ({
        date: r.day,
        open: r.open,
        high: r.high,
        low: r.low,
        close: r.close,
        volume: r.volume,
      }));
    } catch {
      return [];
    }
  }

  async saveQuote(quote: PriceQuote): Promise<void> {
    try {
      const { Database } = await import('bun:sqlite');
      // Write to own isolated DB, NOT market.db
      const db = new Database(this.ownDbPath, { create: true });
      db.run(
        `CREATE TABLE IF NOT EXISTS market_prices_cache
         (code TEXT, price REAL, volume REAL, fetched_at TEXT)`,
      );
      db.run(
        `INSERT INTO market_prices_cache (code, price, volume, fetched_at)
         VALUES (?, ?, ?, ?)`,
        [quote.code, quote.price, quote.volume, quote.fetchedAt],
      );
      db.close();
    } catch {
      // Ignore write failures — price cache is best-effort
    }
  }
}
