/**
 * Infrastructure Adapter — cnbc-world-markets
 *
 * Source: CNBC quote.cnbc.com REST quote API
 * Technique: header-rotation (~5MB RAM — plain fetch, Akamai passive only)
 * Recon: docs/mainserver-sources/cnbc-world-markets/recon.md
 *
 * Fetches global index quotes (S&P 500, Dow, NASDAQ, FTSE, Nikkei, Hang Seng).
 * Quote API is open JSON, no auth. Akamai GRN is passive — no bot challenge.
 */

import type { CnbcWorldMarketsPort, CnbcQuote } from '../../domain/repositories.js';

const QUOTE_BASE =
  'https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol';

/** Default CNBC symbols for global market coverage. */
export const DEFAULT_CNBC_SYMBOLS: string[] = [
  'SP500',    // S&P 500
  'DJ30',     // Dow Jones Industrial Average
  'NASDAQ',   // NASDAQ Composite
  'NIKKEI225', // Nikkei 225
  'FTSE100',  // FTSE 100
  'HK.HSI',   // Hang Seng Index
];

const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
];

function randomUa(): string {
  return UA_POOL[Math.floor(Math.random() * UA_POOL.length)]!;
}

function quoteHeaders(): HeadersInit {
  return {
    'User-Agent': randomUa(),
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.cnbc.com/',
  };
}

interface CnbcFormattedQuote {
  symbol?: string;
  code?: number;
  last?: string;
  change?: string;
  change_pct?: string;
  open?: string;
  volume?: string;
}

interface CnbcApiResponse {
  FormattedQuoteResult?: {
    FormattedQuote?: CnbcFormattedQuote[];
  };
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function buildUrl(symbol: string): string {
  const params = new URLSearchParams({
    symbols: symbol,
    requestMethod: 'itv',
    noform: '1',
    partnerId: '2',
    fund: '1',
    exthrs: '1',
    output: 'json',
    events: '1',
  });
  return `${QUOTE_BASE}?${params.toString()}`;
}

export class CnbcWorldMarketsAdapter implements CnbcWorldMarketsPort {
  private readonly timeoutMs = 8_000;

  async fetchQuote(symbol: string): Promise<CnbcQuote | null> {
    const url = buildUrl(symbol);
    const fetchedAt = new Date().toISOString();

    try {
      const resp = await fetch(url, {
        headers: quoteHeaders(),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!resp.ok) {
        console.error(`[cnbc-world-markets] HTTP ${resp.status} for ${symbol}`);
        return null;
      }

      const raw = (await resp.json()) as CnbcApiResponse;
      const quote = raw?.FormattedQuoteResult?.FormattedQuote?.[0];

      // code=1 means symbol found; no price means data unavailable
      if (!quote || quote.code !== 1 || !quote.last) return null;

      return {
        symbol: quote.symbol ?? symbol,
        last: quote.last,
        change: quote.change ?? '',
        changePct: quote.change_pct ?? '',
        open: quote.open ?? '',
        fetchedAt,
      };
    } catch (err) {
      console.error(`[cnbc-world-markets] fetch error for ${symbol}:`, err);
      return null;
    }
  }

  async fetchBatch(symbols: string[]): Promise<Record<string, CnbcQuote | null>> {
    const result: Record<string, CnbcQuote | null> = {};
    for (const sym of symbols) {
      result[sym] = await this.fetchQuote(sym);
      await sleepMs(1_000 + Math.random() * 1_500); // 1-2.5s jitter
    }
    return result;
  }
}
