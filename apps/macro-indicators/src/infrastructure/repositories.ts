/**
 * Macro Indicators Infrastructure — Concrete Repositories
 *
 * CommodityFetcherPort: wraps Yahoo Finance scrape (same approach as macroIndicatorFetcher.ts)
 * SBVRatePort: reads from macro_indicators SQLite table (shared DB)
 */

import type { CommodityFetcherPort, SBVRatePort } from '../domain/repositories.js';

/** HTTP fetch + simple parse for commodity prices. */
export class HTTPCommodityFetcher implements CommodityFetcherPort {
  async fetchOilUsd(): Promise<number | null> {
    try {
      // Yahoo Finance: crude oil futures (/CL=F)
      const url = 'https://query1.finance.yahoo.com/v8/finance/chart/CL=F?interval=1d&range=1d';
      const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!resp.ok) return null;
      const data = await resp.json() as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> } };
      return data?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
    } catch {
      return null;
    }
  }

  async fetchGoldUsd(): Promise<number | null> {
    try {
      // Yahoo Finance: gold futures (/GC=F)
      const url = 'https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1d&range=1d';
      const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!resp.ok) return null;
      const data = await resp.json() as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> } };
      return data?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
    } catch {
      return null;
    }
  }

  async fetchUsdVnd(): Promise<number | null> {
    try {
      // Yahoo Finance: USD/VND pair
      const url = 'https://query1.finance.yahoo.com/v8/finance/chart/USDVND=X?interval=1d&range=1d';
      const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!resp.ok) return null;
      const data = await resp.json() as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> } };
      return data?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
    } catch {
      return null;
    }
  }
}

/** Reads VN-Index and SBV rates from SQLite macro_indicators table. */
export class SQLiteMacroRepository implements SBVRatePort {
  constructor(private readonly dbPath: string) {}

  async fetchVnIndex(): Promise<number | null> {
    try {
      const { Database } = await import('bun:sqlite');
      const db = new Database(this.dbPath, { readonly: true });
      const row = db.query<{ value: number }, []>(
        `SELECT value FROM macro_indicators
         WHERE indicator_name LIKE '%VN-Index%' OR indicator_name LIKE '%VNINDEX%'
         ORDER BY fetched_at DESC LIMIT 1`,
      ).get();
      db.close();
      return row?.value ?? null;
    } catch {
      return null;
    }
  }

  async fetchSBVRates(): Promise<Record<string, number>> {
    try {
      const { Database } = await import('bun:sqlite');
      const db = new Database(this.dbPath, { readonly: true });
      const rows = db.query<{ indicator_name: string; value: number }, []>(
        `SELECT indicator_name, value FROM macro_indicators
         WHERE indicator_name LIKE '%SBV%' OR indicator_name LIKE '%exchange%'
         ORDER BY fetched_at DESC LIMIT 10`,
      ).all();
      db.close();
      return Object.fromEntries(rows.map((r) => [r.indicator_name, r.value]));
    } catch {
      return {};
    }
  }
}
