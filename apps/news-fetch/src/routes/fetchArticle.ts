/**
 * fetchArticle route — POST /fetch-article
 *
 * size-justification: 229L — single-route file (SSRF guard + injectable Playwright
 * launcher DI + Contract B request/response handling); the DI section grew this file
 * past the baseline (183L) fixing FACTORY-GUARD-CI-TSBOUNDARIES-IMPL's Fence-C hit
 * (infrastructure/ import moved to the composition root, src/index.ts) — splitting the
 * launcher DI into its own file would separate it from the one handler that uses it.
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
 * Browser lifecycle: one Playwright launch per request via an injected launcher
 *   (see `setPlaywrightLauncher` below — wired once at startup from src/index.ts,
 *   the composition root).
 *   page.close() after extraction (context + browser closed in finally) → no leaks.
 *   RAM cost: ~400–500 MB per concurrent headless Chromium instance (same as
 *   reuters-stealth / bloomberg-stealth). Callers must cap concurrency via
 *   deepFetch.maxPlaywrightPerCycle (default: 5).
 *
 * DDD: interface/http layer (src/routes/** now mapped to "interface" in
 *   eslint.config.mjs — FACTORY-GUARD-CI-TSBOUNDARIES-IMPL, 2026-07-29). This file
 *   must NOT import infrastructure/ directly (Fence-C) — it previously imported
 *   PlaywrightBrowserFactory statically, which was invisible to the boundaries
 *   plugin only because src/routes/** was unclassified; fixing that classification
 *   surfaced the real violation. Fix: the browser launcher is injected via
 *   `setPlaywrightLauncher`, called once at startup by src/index.ts (the
 *   composition root, the only place allowed to import infrastructure/). This
 *   file only imports 'hono' + 'playwright' (npm packages, not local infra) and
 *   the sibling config loader. Zero behavior change — same
 *   `PlaywrightBrowserFactory.launch()` call, just wired one level up.
 */

import type { Context } from 'hono';
import type playwright from 'playwright';
import { loadAllowedDomains } from './fetchArticleConfig.js';

/** Maximum extracted body length returned to caller (chars). */
const MAX_BODY_LENGTH = 8_000;

/** Playwright page navigation timeout (ms). Contract B requires 30s. */
const PAGE_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Injectable browser launcher (DI — wired at startup by src/index.ts)
// ---------------------------------------------------------------------------

export type PlaywrightLauncher = () => Promise<{
  browser: playwright.Browser;
  page: playwright.Page;
}>;

let launchFn: PlaywrightLauncher | null = null;

/**
 * Wire the Playwright browser launcher. Called exactly once at process startup
 * from src/index.ts (composition root) — the only file allowed to import
 * infrastructure/scrapers/playwright-browser-factory.ts directly (Fence-C).
 */
export function setPlaywrightLauncher(fn: PlaywrightLauncher): void {
  launchFn = fn;
}

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
  if (!launchFn) {
    // Fail-loud (logged) but keeps Contract B's HTTP-status contract intact:
    // this branch should be unreachable in production — src/index.ts wires
    // setPlaywrightLauncher() at startup, before the server accepts requests.
    console.error('[fetch-article] Playwright launcher not configured — setPlaywrightLauncher() was never called');
    return c.json<FetchArticleResponse>(
      { status: 'error', url, body_text: '', published_at: '', reason: 'server misconfigured: playwright launcher not wired' },
    );
  }
  console.info(`[fetch-article] fetching ${url}`);
  const { browser, page } = await launchFn();

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
