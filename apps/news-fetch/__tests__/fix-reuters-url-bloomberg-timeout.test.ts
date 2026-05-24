/**
 * Regression tests — Bug 1: Reuters dead URL + Bug 2: Bloomberg 502 idle timeout
 *
 * Bug 1 root cause: feeds.reuters.com was decommissioned in 2020 — DNS no longer
 *   resolves. reuters-rss.ts was still pointing at the dead URL, causing every
 *   RSS fetch to fail silently with "Unable to connect", triggering the stealth
 *   fallback (which is then blocked by DataDome), resulting in 0 headlines.
 *   Fix: replaced dead URL with Google News RSS for Reuters content.
 *
 * Bug 2 root cause: Bun's default idleTimeout is 10 seconds. Playwright takes
 *   25–30 s to navigate bloomberg.com. The server closed the TCP connection
 *   before Playwright returned — producing an empty reply that the api-gateway
 *   surfaced as 502 Bad Gateway.
 *   Fix: idleTimeout: 0 in the Bun server config (index.ts).
 *
 * These tests enforce the fix contracts at the code level so they cannot regress.
 */

import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Bug 1 — Reuters URL must point to Google News, NOT feeds.reuters.com
// ---------------------------------------------------------------------------

describe('Bug 1 — Reuters RSS URL is not the decommissioned feeds.reuters.com', () => {
  it('reuters-rss.ts does not assign feeds.reuters.com as the RSS URL constant', () => {
    const src = readFileSync(
      resolve(import.meta.dir, '../src/infrastructure/scrapers/reuters-rss.ts'),
      'utf-8',
    );
    // The dead domain may appear in comments explaining the migration but must
    // NOT be the assigned value of REUTERS_RSS_URL.
    const match = src.match(/REUTERS_RSS_URL\s*=\s*\n?\s*['"`]([^'"`]+)['"`]/);
    expect(match).not.toBeNull();
    const assignedUrl = match![1]!;
    expect(assignedUrl).not.toContain('feeds.reuters.com');
  });

  it('reuters-rss.ts RSS URL points to news.google.com', () => {
    const src = readFileSync(
      resolve(import.meta.dir, '../src/infrastructure/scrapers/reuters-rss.ts'),
      'utf-8',
    );
    // Must use Google News RSS as replacement for the decommissioned Reuters feed
    expect(src).toContain('news.google.com/rss/search');
  });

  it('Google News RSS URL includes reuters in the query term', () => {
    const src = readFileSync(
      resolve(import.meta.dir, '../src/infrastructure/scrapers/reuters-rss.ts'),
      'utf-8',
    );
    // Confirm the query targets Reuters content (not a generic news query)
    const match = src.match(/REUTERS_RSS_URL\s*=\s*\n?\s*['"`]([^'"`]+)['"`]/);
    expect(match).not.toBeNull();
    const url = match![1]!.toLowerCase();
    expect(url).toContain('reuters');
  });
});

// ---------------------------------------------------------------------------
// Bug 1 — Reuters handler logs when 0 headlines result from both paths
// ---------------------------------------------------------------------------

describe('Bug 1 — Reuters handler emits warning log when RSS primary fails', () => {
  it('news_ingest module warns when RSS primary returns error', () => {
    // Fallback-chain logic moved from handlers.ts to src/module/news_ingest/index.ts (P1-C)
    const src = readFileSync(
      resolve(import.meta.dir, '../src/module/news_ingest/index.ts'),
      'utf-8',
    );
    // Must log when rssResult.error != null before invoking fallback
    expect(src).toContain('[reuters/headlines] RSS primary failed');
  });

  it('news_ingest module warns when RSS primary returns 0 articles', () => {
    const src = readFileSync(
      resolve(import.meta.dir, '../src/module/news_ingest/index.ts'),
      'utf-8',
    );
    // Must log when RSS returns empty feed before invoking fallback
    expect(src).toContain('[reuters/headlines] RSS primary returned 0 articles');
  });

  it('news_ingest module warns when stealth fallback also returns 0 articles', () => {
    const src = readFileSync(
      resolve(import.meta.dir, '../src/module/news_ingest/index.ts'),
      'utf-8',
    );
    // Must log when both primary and fallback yield no headlines
    expect(src).toContain('[reuters/headlines] stealth fallback also returned 0 articles');
  });
});

// ---------------------------------------------------------------------------
// Bug 2 — Bun server idleTimeout must be disabled (0) to prevent 502
// ---------------------------------------------------------------------------

describe('Bug 2 — Bun server idleTimeout is 0 (disabled) to prevent 502', () => {
  it('index.ts exports idleTimeout: 0 in the default server config', () => {
    const src = readFileSync(
      resolve(import.meta.dir, '../src/index.ts'),
      'utf-8',
    );
    // idleTimeout: 0 must be present in the default export object
    expect(src).toContain('idleTimeout: 0');
  });

  it('index.ts does not use a positive idleTimeout value', () => {
    const src = readFileSync(
      resolve(import.meta.dir, '../src/index.ts'),
      'utf-8',
    );
    // Ensure a positive integer is not set as idleTimeout (regression guard)
    const positiveTimeout = src.match(/idleTimeout:\s*([1-9]\d*)/);
    expect(positiveTimeout).toBeNull();
  });
});
