/**
 * newsHeadlinesRefreshJob — Task 1899a-tests (interface/scheduler layer)
 *
 * Fetches latest Bloomberg + Reuters headlines from the news-fetch microservice
 * (http://news-fetch:5008) and pushes them to the local /api/push-news endpoint
 * for storage and analysis.
 *
 * Dispatch order: Bloomberg first, Reuters second (per handoff spec).
 * Each source is fetched independently — error from one does not abort the other.
 *
 * Layer: interface/scheduler — imports infrastructure only (logger).
 * Must not import from domain/.
 */

import { logger } from '../../infrastructure/logger.js';
import { shouldSkipRecoveryReplay } from '../startupHelpers.js';

const NEWS_FETCH_BASE = Bun.env['NEWS_FETCH_URL'] ?? 'http://news-fetch:5008';
const MCP_SERVER_BASE = Bun.env['MCP_SERVER_URL'] ?? 'http://localhost:3000';

interface NewsFetchResult {
  source: string;
  articles: Array<{
    headline: string;
    url: string | null;
    publishedAt: string | null;
    confidence: 'HIGH' | 'LOW';
    fetchedAt?: string;
  }>;
  fetchedAt: string;
  method: string;
  error: string | null;
}

/**
 * Fetch headlines from a news-fetch endpoint.
 * Returns null on HTTP/network error; never throws.
 */
async function fetchFromNewsFetch(endpoint: string): Promise<NewsFetchResult | null> {
  try {
    const res = await fetch(`${NEWS_FETCH_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      logger.warn('[newsHeadlinesRefreshJob] non-ok from news-fetch', {
        endpoint,
        status: res.status,
      });
      return null;
    }
    return (await res.json()) as NewsFetchResult;
  } catch (err) {
    logger.warn('[newsHeadlinesRefreshJob] fetch from news-fetch failed', {
      endpoint,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Push articles to the local /api/push-news endpoint.
 * Returns true on success; never throws.
 */
async function pushToMcpServer(result: NewsFetchResult): Promise<boolean> {
  if (!result.articles.length) return true;

  const items = result.articles.map((a) => ({
    title: a.headline,
    url: a.url ?? '',
    publishedAt: a.publishedAt ?? result.fetchedAt,
    content: '',
    source: result.source,
  }));

  try {
    const res = await fetch(`${MCP_SERVER_BASE}/api/push-news`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Bun.env['VPS_PUSH_API_KEY'] ?? '',
      },
      body: JSON.stringify(items),
    });
    if (!res.ok) {
      logger.warn('[newsHeadlinesRefreshJob] push-news rejected', { status: res.status });
      return false;
    }
    return true;
  } catch (err) {
    logger.warn('[newsHeadlinesRefreshJob] push-news call failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/** Options bag for newsHeadlinesRefreshJob (injectable for tests). */
export interface NewsHeadlinesRefreshJobOptions {
  /** Injectable nowMs for recovery dedup guard (tests only). */
  nowMsFn?: () => number;
}

/**
 * Run one news headlines refresh cycle.
 *
 * Fetches Bloomberg headlines, then Reuters headlines. Pushes each
 * successfully-fetched result to /api/push-news. Errors from either
 * source are logged and skipped — the other source continues.
 *
 * @idempotency T4 — cron_job_runs recency guard; replay skipped if last success < 90% of 30-min cadence (27min window)
 */
export async function newsHeadlinesRefreshJob(
  options?: NewsHeadlinesRefreshJobOptions,
): Promise<void> {
  // T4 dedup guard: skip if already ran within 30-min cadence window
  try {
    const { getDb } = await import('../../infrastructure/db/schema.js');
    const _db = getDb();
    const THIRTY_MIN_CADENCE_MS = 1_800_000;
    if (shouldSkipRecoveryReplay(_db, 'newsHeadlinesRefreshJob', THIRTY_MIN_CADENCE_MS, options?.nowMsFn)) {
      return;
    }
  } catch { /* fail-open: DB unavailable, proceed with job */ }

  logger.debug('[newsHeadlinesRefreshJob] cycle start');

  // Bloomberg first, Reuters second (per handoff spec)
  const bloombergResult = await fetchFromNewsFetch('/bloomberg/headlines');
  if (bloombergResult) {
    if (bloombergResult.error) {
      logger.warn('[newsHeadlinesRefreshJob] bloomberg returned error', {
        error: bloombergResult.error,
      });
    } else {
      await pushToMcpServer(bloombergResult);
    }
  }

  const reutersResult = await fetchFromNewsFetch('/reuters/headlines');
  if (reutersResult) {
    if (reutersResult.error) {
      logger.warn('[newsHeadlinesRefreshJob] reuters returned error', {
        error: reutersResult.error,
      });
    } else {
      await pushToMcpServer(reutersResult);
    }
  }

  logger.debug('[newsHeadlinesRefreshJob] cycle complete', {
    bloomberg: bloombergResult ? (bloombergResult.error ?? 'ok') : 'fetch-failed',
    reuters: reutersResult ? (reutersResult.error ?? 'ok') : 'fetch-failed',
  });
}
