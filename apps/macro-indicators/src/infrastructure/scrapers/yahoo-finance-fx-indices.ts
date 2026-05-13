/**
 * Infrastructure Adapter — yahoo-finance-fx-indices
 *
 * Source: Yahoo Finance v8 chart API (query1/query2.finance.yahoo.com)
 * Technique: header-rotation (~5MB RAM — plain fetch, no bot protection on v8 API)
 * Recon: docs/mainserver-sources/yahoo-finance-fx-indices/recon.md
 *
 * Fetches FX rates (EURUSD, USDVND, USDJPY, GBPUSD) and global indices
 * (S&P 500, Nikkei, Hang Seng, Shanghai). v8 chart API is fully open.
 * v7 quote API requires auth — do NOT use.
 */

import type { YahooFxIndicesPort, YahooQuote } from '../../domain/repositories.js';

const BASE_URL = 'https://query2.finance.yahoo.com/v8/finance/chart';

/** Default symbol set: FX rates relevant to VN market + global indices. */
export const DEFAULT_SYMBOLS: string[] = [
  // FX rates
  'EURUSD=X', 'USDVND=X', 'USDJPY=X', 'GBPUSD=X', 'DTWEXBGS',
  // Global indices
  '^GSPC',     // S&P 500
  '^DJI',      // Dow Jones
  '^IXIC',     // NASDAQ
  '^N225',     // Nikkei 225
  '^HSI',      // Hang Seng
  '000001.SS', // Shanghai Composite
  '^FTSE',     // FTSE 100
];

const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
];

function randomUa(): string {
  return UA_POOL[Math.floor(Math.random() * UA_POOL.length)]!;
}

function browserHeaders(): HeadersInit {
  return {
    'User-Agent': randomUa(),
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://finance.yahoo.com/',
  };
}

/** Shape of the v8 chart API meta object. */
interface YahooMeta {
  symbol: string;
  currency: string;
  exchangeName: string;
  regularMarketPrice?: number;
  regularMarketTime?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{ meta?: YahooMeta }>;
    error?: unknown;
  };
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function toIso(unixSec?: number): string {
  if (!unixSec) return new Date().toISOString();
  return new Date(unixSec * 1000).toISOString();
}

export class YahooFxIndicesAdapter implements YahooFxIndicesPort {
  private readonly timeoutMs = 8_000;

  async fetchSymbol(symbol: string): Promise<YahooQuote | null> {
    const url = `${BASE_URL}/${encodeURIComponent(symbol)}?interval=1d&range=1d`;

    try {
      const resp = await fetch(url, {
        headers: browserHeaders(),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!resp.ok) {
        console.error(`[yahoo-fx-indices] HTTP ${resp.status} for ${symbol}`);
        return null;
      }

      const raw = (await resp.json()) as YahooChartResponse;
      const meta = raw?.chart?.result?.[0]?.meta;
      if (!meta || meta.regularMarketPrice === undefined) return null;

      return {
        symbol: meta.symbol,
        price: meta.regularMarketPrice,
        currency: meta.currency ?? 'USD',
        exchangeName: meta.exchangeName ?? '',
        dayHigh: meta.regularMarketDayHigh ?? null,
        dayLow: meta.regularMarketDayLow ?? null,
        fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
        fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
        lastUpdated: toIso(meta.regularMarketTime),
      };
    } catch (err) {
      console.error(`[yahoo-fx-indices] fetch error for ${symbol}:`, err);
      return null;
    }
  }

  async fetchBatch(symbols: string[]): Promise<Record<string, YahooQuote | null>> {
    const result: Record<string, YahooQuote | null> = {};
    for (const sym of symbols) {
      result[sym] = await this.fetchSymbol(sym);
      await sleepMs(1_000 + Math.random() * 1_000); // 1-2s jitter
    }
    return result;
  }
}
