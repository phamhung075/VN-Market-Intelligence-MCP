/**
 * rss-parse — shared RSS 2.0 fetch + XML-parse layer for news-fetch scrapers.
 * Extracted from reuters-rss.ts + bloomberg-rss.ts (task FACTORY-NEWS-extract-rss-parse) —
 * both were byte-identical here; only RSS URL, NewsSource, and default maxItems differed.
 * DDD: infrastructure layer — network I/O (fetch) + XML parsing; imports domain only.
 */

import { type Article, type FetchResult } from '../../domain/models.js';
import type { NewsSource } from '../../domain/models.js';
import { parsePublishedAt } from '../../primitive/published-at-parser/index.js';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 10_000;

/**
 * Fetch an RSS feed over HTTP, parse it, return a FetchResult envelope.
 * HTTP 4xx/5xx → error:'http-{status}'; parse failure → error:'parse-error: ...';
 * empty feed → error:null (not an error); network error → error:message.
 */
export async function fetchRss(url: string, source: NewsSource, maxItems: number): Promise<FetchResult> {
  const logPrefix = `${source}-rss`;
  const fetchedAt = new Date().toISOString();

  let text: string;
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': BROWSER_UA },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!resp.ok) {
      console.warn(`[${logPrefix}] HTTP error ${resp.status}`);
      return { source, articles: [], fetchedAt, method: 'rss', error: `http-${resp.status}` };
    }
    text = await resp.text();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[${logPrefix}] fetch failed: ${msg}`);
    return { source, articles: [], fetchedAt, method: 'rss', error: msg };
  }

  let articles: Article[];
  try {
    articles = parseRssXml(text, fetchedAt, maxItems, source);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[${logPrefix}] parse failed: ${msg}`);
    return { source, articles: [], fetchedAt, method: 'rss', error: `parse-error: ${msg}` };
  }

  if (articles.length === 0) {
    console.info(`[${logPrefix}] feed returned 0 items`);
  }

  return { source, articles, fetchedAt, method: 'rss', error: null };
}

/** Parse RSS 2.0 XML into Article[]. DOMParser (WinterCG) primary; regex fallback when unavailable (tests). */
export function parseRssXml(xml: string, fetchedAt: string, maxItems: number, source: NewsSource): Article[] {
  if (typeof DOMParser !== 'undefined') {
    return parseDom(xml, fetchedAt, maxItems, source);
  }
  return parseRegex(xml, fetchedAt, maxItems, source);
}

function parseDom(xml: string, fetchedAt: string, maxItems: number, source: NewsSource): Article[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');

  const parseErr = doc.querySelector('parsererror');
  if (parseErr) {
    throw new Error(`XML parse error: ${parseErr.textContent?.slice(0, 120) ?? 'unknown'}`);
  }

  const items = Array.from(doc.querySelectorAll('item')).slice(0, maxItems);
  return items.map((item) => buildArticle(item, fetchedAt, source));
}

function buildArticle(item: Element, fetchedAt: string, source: NewsSource): Article {
  const headline = item.querySelector('title')?.textContent?.trim() ?? '';
  const rawUrl = item.querySelector('link')?.textContent?.trim() ?? null;
  const pubDate = item.querySelector('pubDate')?.textContent?.trim() ?? null;
  const url = rawUrl !== '' ? rawUrl : null;
  const publishedAt = pubDate ? parsePublishedAt(pubDate) : null;
  return { source, headline, url, publishedAt, fetchedAt, confidence: 'HIGH' };
}

/** Regex-based RSS item extractor — used only when DOMParser is unavailable. Handles CDATA. */
function parseRegex(xml: string, fetchedAt: string, maxItems: number, source: NewsSource): Article[] {
  const items: Article[] = [];
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null && items.length < maxItems) {
    const block = match[1] ?? '';

    const headline = extractTag(block, 'title') ?? '';
    const rawUrl = extractTag(block, 'link');
    const pubDate = extractTag(block, 'pubDate');
    const url = rawUrl && rawUrl !== '' ? rawUrl : null;
    const publishedAt = pubDate ? parsePublishedAt(pubDate) : null;
    items.push({ source, headline, url, publishedAt, fetchedAt, confidence: 'HIGH' });
  }

  return items;
}

/** Extract the text content (or CDATA) of the first matching XML tag. */
export function extractTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>(?:\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))<\\/${tag}>`, 'i');
  const m = re.exec(xml);
  if (!m) return null;
  return (m[1] ?? m[2] ?? '').trim();
}
