/**
 * Infrastructure Adapter — trading-economics-vn
 *
 * Source: tradingeconomics.com/vietnam/<indicator-slug>
 * Technique: header-rotation (~5MB RAM — HTML scrape, soft session gate only)
 * Recon: docs/mainserver-sources/trading-economics-vn/recon.md
 *
 * Parses schema.org JSON-LD Dataset blocks embedded in TE's HTML pages.
 * The `tebot: False` response header confirms requests with realistic headers
 * are accepted. Full HTML is returned — no JS challenge needed.
 * Session cookie (ASP.NET_SessionId) persists across indicator fetches.
 */

import type { TradingEconomicsVnPort, TradingEconomicsIndicator } from '../../domain/repositories.js';

const BASE_URL = 'https://tradingeconomics.com/vietnam';

/** VN indicator slugs tracked for market intelligence. */
export const VN_TE_SLUGS: Record<string, string> = {
  gdp:           'gdp',
  inflation_cpi: 'inflation-cpi',
  balance_trade: 'balance-of-trade',
  interest_rate: 'interest-rate',
  unemployment:  'unemployment-rate',
  fdi:           'foreign-direct-investment',
  industrial_production: 'industrial-production',
};

const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
];

function randomUa(): string {
  return UA_POOL[Math.floor(Math.random() * UA_POOL.length)]!;
}

/** Reuse session across calls within one batch to maintain ASP.NET_SessionId. */
const SESSION_HEADERS = (): HeadersInit => ({
  'User-Agent': randomUa(),
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Referer': 'https://www.google.com/',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
});

/** Schema.org Dataset shape embedded in TE pages. */
interface TeJsonLdDataset {
  '@type'?: string;
  name?: string;
  description?: string;
  temporalCoverage?: string;
  dateModified?: string;
  alternateName?: string;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Extract JSON-LD Dataset block from raw HTML. Returns null if not found. */
function extractJsonLd(html: string): TeJsonLdDataset | null {
  // Match <script type="application/ld+json">...</script>
  const pattern = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1]!) as TeJsonLdDataset | TeJsonLdDataset[];
      const item = Array.isArray(parsed) ? parsed[0] : parsed;
      if (item?.['@type'] === 'Dataset') return item;
    } catch {
      // ignore malformed JSON-LD blocks
    }
  }
  return null;
}

/** Extract latest value summary from meta description or og:description tag. */
function extractMetaDescription(html: string): string {
  const ogMatch = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i);
  if (ogMatch?.[1]) return ogMatch[1];
  const metaMatch = html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i);
  return metaMatch?.[1] ?? '';
}

export class TradingEconomicsVnAdapter implements TradingEconomicsVnPort {
  private readonly timeoutMs = 12_000;
  /** Session cookie jar — ASP.NET_SessionId persists across indicator pages. */
  private sessionCookie = '';

  async fetchIndicator(slug: string): Promise<TradingEconomicsIndicator | null> {
    const url = `${BASE_URL}/${slug}`;
    const fetchedAt = new Date().toISOString();

    try {
      const headers: Record<string, string> = {
        ...(SESSION_HEADERS() as Record<string, string>),
      };
      if (this.sessionCookie) headers['Cookie'] = this.sessionCookie;

      const resp = await fetch(url, {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!resp.ok) {
        console.error(`[trading-economics-vn] HTTP ${resp.status} for ${slug}`);
        return null;
      }

      // Capture Set-Cookie for ASP.NET_SessionId persistence
      const setCookie = resp.headers.get('set-cookie');
      if (setCookie) {
        const sessionMatch = setCookie.match(/ASP\.NET_SessionId=([^;]+)/);
        if (sessionMatch) this.sessionCookie = `ASP.NET_SessionId=${sessionMatch[1]}`;
      }

      const html = await resp.text();
      const jsonLd = extractJsonLd(html);
      const metaDesc = extractMetaDescription(html);

      if (!jsonLd) {
        console.warn(`[trading-economics-vn] No JSON-LD Dataset found for ${slug}`);
        return null;
      }

      return {
        name: jsonLd.name ?? slug,
        latestValue: metaDesc,
        temporalCoverage: jsonLd.temporalCoverage ?? '',
        dateModified: jsonLd.dateModified ?? '',
        fetchedAt,
      };
    } catch (err) {
      console.error(`[trading-economics-vn] fetch error for ${slug}:`, err);
      return null;
    }
  }

  async fetchVnMacroBatch(): Promise<Record<string, TradingEconomicsIndicator | null>> {
    const result: Record<string, TradingEconomicsIndicator | null> = {};
    const entries = Object.entries(VN_TE_SLUGS);

    for (const [name, slug] of entries) {
      result[name] = await this.fetchIndicator(slug);
      await sleepMs(2_000 + Math.random() * 1_500); // 2-3.5s jitter — TE rate-limits aggressively
    }

    return result;
  }
}
