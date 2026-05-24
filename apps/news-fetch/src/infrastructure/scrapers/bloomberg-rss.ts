/**
 * BloombergRssScraper — PRIMARY path for Bloomberg news headlines
 *
 * Bloomberg has no public RSS feed. bloomberg.com returns HTTP 403 on direct
 * scrape. `[data-component="headline"]` selector was the previous DOM approach
 * but Bloomberg's PerimeterX blocks Playwright on the first navigation —
 * resulting in articles: [] consistently.
 *
 * Solution (same pattern as Reuters):
 *   Google News RSS search for "bloomberg markets news" reliably returns
 *   Bloomberg-sourced articles from news.google.com without anti-bot blocking.
 *   Verified live 2026-05-17: ~100 items returned including Bloomberg.com URLs.
 *
 * Fallback (when error != null OR articles empty): bloomberg-stealth.ts
 *   — that decision belongs to handlers.ts, not here.
 *
 * Implements BloombergNewsPort via plain HTTP fetch + XML parse.
 * No browser, no Playwright. RAM: ~30–50 MB per scrape.
 *
 * Failure handling:
 *   - HTTP 4xx/5xx  → FetchResult { error: 'http-{status}', articles: [] }
 *   - Parse failure → FetchResult { error: 'parse-error: ...', articles: [] }
 *   - Empty feed    → FetchResult { error: null, articles: [] }  (not an error)
 *   - Network error → FetchResult { error: message, articles: [] }
 *
 * DDD: infrastructure layer — imports only from domain.
 */

import type { BloombergNewsPort } from '../../domain/repositories.js';
import { NewsSource, type Article, type FetchResult } from '../../domain/models.js';
import { parsePublishedAt } from '../../primitive/published-at-parser/index.js';

/**
 * Google News RSS for Bloomberg markets and finance news.
 *
 * The query "bloomberg markets finance" consistently returns articles sourced
 * from bloomberg.com (verified 2026-05-17, ~100 items per fetch).
 * Mirrors the reuters-rss.ts approach which replaced the dead feeds.reuters.com
 * endpoint with the same Google News RSS pattern.
 */
const BLOOMBERG_RSS_URL =
  'https://news.google.com/rss/search?q=bloomberg+markets+finance&ceid=US:en&hl=en-US&gl=US';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const FETCH_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Public class
// ---------------------------------------------------------------------------

export class BloombergRssScraper implements BloombergNewsPort {
  async fetchHeadlines(maxItems: number = 10): Promise<FetchResult> {
    const fetchedAt = new Date().toISOString();

    let text: string;

    try {
      const resp = await fetch(BLOOMBERG_RSS_URL, {
        headers: { 'User-Agent': BROWSER_UA },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (!resp.ok) {
        console.warn(`[bloomberg-rss] HTTP error ${resp.status}`);
        return {
          source: NewsSource.BLOOMBERG,
          articles: [],
          fetchedAt,
          method: 'rss',
          error: `http-${resp.status}`,
        };
      }

      text = await resp.text();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[bloomberg-rss] fetch failed: ${msg}`);
      return {
        source: NewsSource.BLOOMBERG,
        articles: [],
        fetchedAt,
        method: 'rss',
        error: msg,
      };
    }

    // Parse XML ------------------------------------------------------------------
    let articles: Article[];

    try {
      articles = parseRssXml(text, fetchedAt, maxItems);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[bloomberg-rss] parse failed: ${msg}`);
      return {
        source: NewsSource.BLOOMBERG,
        articles: [],
        fetchedAt,
        method: 'rss',
        error: `parse-error: ${msg}`,
      };
    }

    if (articles.length === 0) {
      console.info('[bloomberg-rss] feed returned 0 items');
    }

    return {
      source: NewsSource.BLOOMBERG,
      articles,
      fetchedAt,
      method: 'rss',
      error: null,
    };
  }
}

// ---------------------------------------------------------------------------
// XML parsing helpers (no external deps — Bun ships with DOMParser via WinterCG)
// ---------------------------------------------------------------------------

/**
 * Parse an RSS 2.0 XML string into Article[].
 *
 * Uses Bun's built-in DOMParser (WinterCG API). Falls back to a lightweight
 * regex-based extraction if DOMParser is unavailable (test environment).
 */
function parseRssXml(xml: string, fetchedAt: string, maxItems: number): Article[] {
  if (typeof DOMParser !== 'undefined') {
    return parseDom(xml, fetchedAt, maxItems);
  }
  return parseRegex(xml, fetchedAt, maxItems);
}

function parseDom(xml: string, fetchedAt: string, maxItems: number): Article[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');

  const parseErr = doc.querySelector('parsererror');
  if (parseErr) {
    throw new Error(`XML parse error: ${parseErr.textContent?.slice(0, 120) ?? 'unknown'}`);
  }

  const items = Array.from(doc.querySelectorAll('item')).slice(0, maxItems);
  return items.map((item) => buildArticle(item, fetchedAt));
}

function buildArticle(item: Element, fetchedAt: string): Article {
  const headline = item.querySelector('title')?.textContent?.trim() ?? '';
  const rawUrl = item.querySelector('link')?.textContent?.trim() ?? null;
  const pubDate = item.querySelector('pubDate')?.textContent?.trim() ?? null;

  return {
    source: NewsSource.BLOOMBERG,
    headline,
    url: rawUrl !== '' ? rawUrl : null,
    publishedAt: pubDate ? parsePublishedAt(pubDate) : null,
    fetchedAt,
    confidence: 'HIGH',
  };
}

/**
 * Minimal regex-based RSS item extractor.
 *
 * Used only when DOMParser is unavailable (e.g., pure Node test runners).
 * Handles CDATA-wrapped values (RSS common pattern).
 */
function parseRegex(xml: string, fetchedAt: string, maxItems: number): Article[] {
  const items: Article[] = [];
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null && items.length < maxItems) {
    const block = match[1] ?? '';

    const headline = extractTag(block, 'title') ?? '';
    const rawUrl = extractTag(block, 'link');
    const pubDate = extractTag(block, 'pubDate');

    items.push({
      source: NewsSource.BLOOMBERG,
      headline,
      url: rawUrl && rawUrl !== '' ? rawUrl : null,
      publishedAt: pubDate ? parsePublishedAt(pubDate) : null,
      fetchedAt,
      confidence: 'HIGH',
    });
  }

  return items;
}

/** Extract the text content (or CDATA) of the first matching XML tag. */
function extractTag(xml: string, tag: string): string | null {
  const re = new RegExp(
    `<${tag}[^>]*>(?:\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))<\\/${tag}>`,
    'i',
  );
  const m = re.exec(xml);
  if (!m) return null;
  return (m[1] ?? m[2] ?? '').trim();
}

// normalizeRfcDate extracted to src/primitive/published-at-parser/index.ts.
// Re-exported here for backward compatibility with existing tests.
export { parsePublishedAt as normalizeRfcDate } from '../../primitive/published-at-parser/index.js';
