/**
 * fetchArticle route — POST /fetch-article
 *
 * Playwright fallback executor for DFR-P2-MAIN.
 * Called by deepFetchMainJob.ts (mcp-server) for queue rows with status='vps-failed'
 * (sources the VPS plain-HTTP path failed to render — JS-heavy / international).
 *
 * Contract B (blueprint §Contract B):
 *   Request:  POST /fetch-article { url: string }
 *   Response: { status: "ok"|"error", url: string, body_text: string, published_at: string }
 *   Timeout:  30s (Playwright is slow)
 *
 * SSRF guard: ALLOWED_DOMAINS loaded from mcp.config.json
 *   deepFetch.playwrightAllowedDomains — never hardcoded.
 *   Domains NOT in allowlist → HTTP 400.
 *
 * Browser lifecycle: one Playwright launch per request via PlaywrightBrowserFactory.
 *   page.close() after extraction (context + browser closed in finally) → no leaks.
 *   RAM cost: ~400–500 MB per concurrent headless Chromium instance (same as
 *   reuters-stealth / bloomberg-stealth). Callers must cap concurrency via
 *   deepFetch.maxPlaywrightPerCycle (default: 5).
 *
 * DDD: interface/http layer — imports infrastructure (PlaywrightBrowserFactory)
 *   and config loader only. No domain or application imports.
 */

import type { Context } from 'hono';
import { PlaywrightBrowserFactory } from '../infrastructure/scrapers/playwright-browser-factory.js';
import { loadAllowedDomains } from './fetchArticleConfig.js';

/** Maximum extracted body length returned to caller (chars). */
const MAX_BODY_LENGTH = 8_000;

/** Playwright page navigation timeout (ms). Contract B requires 30s. */
const PAGE_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Contract B response shape
// ---------------------------------------------------------------------------

interface FetchArticleResponse {
  status: 'ok' | 'error';
  url: string;
  body_text: string;
  published_at: string;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * POST /fetch-article
 *
 * Body: { url: string }
 *
 * Returns Contract B response. HTTP 400 for SSRF-blocked domains.
 * Always HTTP 200 for ok/error outcomes (non-SSRF errors).
 * Timeout path returns HTTP 200 { status: "error", reason: "timeout" }.
 */
export async function handleFetchArticle(c: Context): Promise<Response> {
  let body: { url?: unknown };
  try {
    body = await c.req.json<{ url?: unknown }>();
  } catch {
    return c.json<FetchArticleResponse>(
      { status: 'error', url: '', body_text: '', published_at: '', reason: 'invalid JSON body' },
      400,
    );
  }

  const rawUrl = body?.url;
  if (typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    return c.json<FetchArticleResponse>(
      { status: 'error', url: '', body_text: '', published_at: '', reason: 'missing or invalid url field' },
      400,
    );
  }

  const url = rawUrl.trim();

  // ── SSRF guard ─────────────────────────────────────────────────────────────
  let hostname: string;
  try {
    hostname = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return c.json<FetchArticleResponse>(
      { status: 'error', url, body_text: '', published_at: '', reason: 'url parse failed — not a valid URL' },
      400,
    );
  }

  const allowedDomains = loadAllowedDomains();
  if (!allowedDomains.has(hostname)) {
    console.warn(`[fetch-article] SSRF guard: domain not allowlisted — ${hostname}`);
    return c.json<FetchArticleResponse>(
      { status: 'error', url, body_text: '', published_at: '', reason: `domain not allowed: ${hostname}` },
      400,
    );
  }

  // ── Playwright fetch ───────────────────────────────────────────────────────
  console.info(`[fetch-article] fetching ${url}`);
  const { browser, page } = await PlaywrightBrowserFactory.launch();

  try {
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: PAGE_TIMEOUT_MS,
    });

    // Extract article body — prefer <article> semantic tag, fall back to body innerText
    const bodyText = await page.evaluate((): string => {
      // Try semantic article container first
      const articleEl =
        document.querySelector('article') ??
        document.querySelector('[class*="article-body"]') ??
        document.querySelector('[class*="article_body"]') ??
        document.querySelector('[class*="article-content"]') ??
        document.querySelector('[class*="story-body"]');

      const source = articleEl ?? document.body;

      // Remove noise elements before extracting text
      const clone = source.cloneNode(true) as HTMLElement;
      for (const tag of Array.from(clone.querySelectorAll('script,style,nav,header,footer,aside,figure,figcaption,ins,iframe,noscript'))) {
        tag.remove();
      }

      return (clone.innerText ?? clone.textContent ?? '').replace(/\s+/g, ' ').trim();
    });

    // Extract published_at from meta tags (og:article:published_time or similar)
    const publishedAt = await page.evaluate((): string => {
      const meta =
        document.querySelector<HTMLMetaElement>('meta[property="article:published_time"]') ??
        document.querySelector<HTMLMetaElement>('meta[name="publishdate"]') ??
        document.querySelector<HTMLMetaElement>('meta[name="date"]') ??
        document.querySelector<HTMLMetaElement>('meta[itemprop="datePublished"]') ??
        document.querySelector<HTMLMetaElement>('time[itemprop="datePublished"]');
      return meta?.getAttribute('content') ?? meta?.getAttribute('datetime') ?? '';
    });

    const trimmedBody = bodyText.slice(0, MAX_BODY_LENGTH);

    if (!trimmedBody) {
      console.warn(`[fetch-article] empty body_text for ${url}`);
      return c.json<FetchArticleResponse>({
        status: 'error',
        url,
        body_text: '',
        published_at: publishedAt,
        reason: 'empty body extracted',
      });
    }

    console.info(`[fetch-article] ok — ${trimmedBody.length} chars, published_at="${publishedAt}"`);
    return c.json<FetchArticleResponse>({
      status: 'ok',
      url,
      body_text: trimmedBody,
      published_at: publishedAt,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = message.includes('Timeout') || message.includes('timeout');

    console.warn(`[fetch-article] error for ${url}: ${message}`);

    return c.json<FetchArticleResponse>({
      status: 'error',
      url,
      body_text: '',
      published_at: '',
      reason: isTimeout ? 'timeout' : message,
    });
  } finally {
    // Always close page then browser to free RAM — mandatory per blueprint
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}
