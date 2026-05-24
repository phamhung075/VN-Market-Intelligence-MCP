/**
 * ReutersRssScraper — PRIMARY path for Reuters news headlines
 *
 * Implements ReutersNewsPort via plain HTTP fetch + XML parse.
 * No browser, no Playwright. RAM: ~30–50 MB per scrape.
 *
 * Failure handling:
 *   - HTTP 4xx/5xx  → FetchResult { error: 'http-{status}', articles: [] }
 *   - Parse failure → FetchResult { error: 'parse-error: ...', articles: [] }
 *   - Empty feed    → FetchResult { error: null, articles: [] }  (not an error)
 *   - Network error → FetchResult { error: message, articles: [] }
 *
 * Fallback (when error != null OR articles empty): reuters-stealth.ts
 * — that decision belongs to the use-case / cron dispatcher, not here.
 *
 * DDD: infrastructure layer — imports only from domain.
 */

import type { ReutersNewsPort } from '../../domain/repositories.js';
import { NewsSource, type Article, type FetchResult } from '../../domain/models.js';
import { parsePublishedAt } from '../../primitive/published-at-parser/index.js';

/**
 * feeds.reuters.com was decommissioned in 2020 — DNS no longer resolves.
 * Replacement: Google News RSS search for "reuters business news", sourced from
 * reuters.com results. Returns ~100 items; no time restriction needed because
 * Google News naturally surfaces recent articles first.
 *
 * The `when:24h+allinurl:reuters.com` variant was tested and returned 0 items
 * (Google News query syntax changed). The keyword search reliably returns ≥ 50
 * Reuters-sourced articles and matches the same pattern used in the mcp-server
 * infrastructure/fetchers/reuters.ts fallback.
 */
const REUTERS_RSS_URL =
  'https://news.google.com/rss/search?q=reuters+business+news&ceid=US:en&hl=en-US&gl=US';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const FETCH_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Public class
// ---------------------------------------------------------------------------

export class ReutersRssScraper implements ReutersNewsPort {
  async fetchHeadlines(maxItems: number = 15): Promise<FetchResult> {
    const fetchedAt = new Date().toISOString();

    let text: string;

    try {
      const resp = await fetch(REUTERS_RSS_URL, {
        headers: { 'User-Agent': BROWSER_UA },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (!resp.ok) {
        console.warn(`[reuters-rss] HTTP error ${resp.status}`);
        return {
          source: NewsSource.REUTERS,
          articles: [],
          fetchedAt,
          method: 'rss',
          error: `http-${resp.status}`,
        };
      }

      text = await resp.text();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[reuters-rss] fetch failed: ${msg}`);
      return {
        source: NewsSource.REUTERS,
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
      console.warn(`[reuters-rss] parse failed: ${msg}`);
      return {
        source: NewsSource.REUTERS,
        articles: [],
        fetchedAt,
        method: 'rss',
        error: `parse-error: ${msg}`,
      };
    }

    if (articles.length === 0) {
      console.info('[reuters-rss] feed returned 0 items');
    }

    return {
      source: NewsSource.REUTERS,
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
  // Bun 1.x ships DOMParser as a global per the WinterCG spec.
  if (typeof DOMParser !== 'undefined') {
    return parseDom(xml, fetchedAt, maxItems);
  }
  // Fallback for environments where DOMParser is not available (Node, some test runners).
  return parseRegex(xml, fetchedAt, maxItems);
}

function parseDom(xml: string, fetchedAt: string, maxItems: number): Article[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');

  // Check for parse error (DOMParser signals errors via a <parsererror> element)
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
    source: NewsSource.REUTERS,
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
  // Match each <item>...</item> block (non-greedy, dotall via [\s\S])
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null && items.length < maxItems) {
    const block = match[1] ?? '';

    const headline = extractTag(block, 'title') ?? '';
    const rawUrl = extractTag(block, 'link');
    const pubDate = extractTag(block, 'pubDate');

    items.push({
      source: NewsSource.REUTERS,
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
  // Match <tag>value</tag> or <tag><![CDATA[value]]></tag>
  const re = new RegExp(
    `<${tag}[^>]*>(?:\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))<\\/${tag}>`,
    'i',
  );
  const m = re.exec(xml);
  if (!m) return null;
  // Group 1 = CDATA content; group 2 = plain text
  return (m[1] ?? m[2] ?? '').trim();
}

// normalizeRfcDate extracted to src/primitive/published-at-parser/index.ts.
// Re-exported here for backward compatibility with existing tests.
export { parsePublishedAt as normalizeRfcDate } from '../../primitive/published-at-parser/index.js';
