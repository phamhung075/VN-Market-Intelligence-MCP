/**
 * Default real fetchers — Poll News (split via FACTORY-APP-split-pollNews)
 * size-justification: 135L — 6 independent lazily-loaded source fetchers
 * (cafef/vnexpress/vneconomy/teChromiumNews/newsapi/ragRetriever), each a
 * self-contained dynamic-import + circuit-breaker wrapper; single-fetcher
 * cohesion (one file = "the set of default network fetchers") outweighs
 * further per-source file fragmentation for functions this small.
 *
 * Lazily-loaded (dynamic `import()`) real-network fetcher implementations for
 * each RSS/API source, plus the default RAG retriever. Loaded lazily so tests
 * that inject mock fetchers via PollNewsOptions.fetchers never trigger real
 * HTTP calls just by importing pollNews.ts.
 *
 * Split out of pollNews.ts (FACTORY-APP-split-pollNews, staged god-file
 * split). Internal helpers — no external callers today, so they are imported
 * (not re-exported) by pollNews.ts.
 *
 * NOTE: `defaultTradingEconomicsFetcher` (the legacy stream fetcher) was
 * dropped during this split — grep-confirmed dead code, zero call sites
 * anywhere in resolvedFetchers or tests. Sprint 1833g had already removed
 * its only use site (see the still-present `tradingeconomics` comment in
 * pollNews.ts's fetcher-resolution block); the unused function definition
 * itself was never cleaned up until now (CLAUDE.md dead-code directive).
 *
 * Layer: application/usecases — may import from domain/ and infrastructure/.
 */

import type { RssItem } from "../../../infrastructure/fetchers/rss.js";
import type { SearchResult } from "../../../domain/services/cascadeEngine.js";

export async function defaultCafefFetcher(): Promise<RssItem[]> {
  const { breakers } = await import("../../../infrastructure/circuitBreakerRegistry.js");
  const { fetchCafeF } = await import("../../../infrastructure/fetchers/cafef.js");
  return breakers.cafef.execute(() => fetchCafeF());
}

export async function defaultVnExpressFetcher(): Promise<RssItem[]> {
  const { breakers } = await import("../../../infrastructure/circuitBreakerRegistry.js");
  const { fetchVnExpress } = await import("../../../infrastructure/fetchers/vnexpress.js");
  return breakers.vnexpress.execute(() => fetchVnExpress());
}

// defaultReutersFetcher removed — reuters.ts deprecated (G5, Phase 1).
// Reuters coverage now via news-fetch microservice (port 5008).
// Sprint 1833g had already disabled this from resolvedFetchers.

export async function defaultVnEconomyFetcher(): Promise<RssItem[]> {
  const { breakers } = await import("../../../infrastructure/circuitBreakerRegistry.js");
  const { fetchVnEconomy } = await import("../../../infrastructure/fetchers/vneconomy.js");
  return breakers.vneconomy.execute(() => fetchVnEconomy());
}

/**
 * Task 1799: Trading Economics Vietnam news feed via Chromium scraper.
 *
 * Maps TENewsItem → RssItem so the item flows through the standard
 * normalizeNews → cascade → alert pipeline unchanged.
 *
 * Field mapping:
 *   title    → title
 *   url      → url
 *   summary  → content
 *   date     → publishedAt (relative-date parsed to ISO)
 *   category → appended to content as "[category]"
 *   source   → "tradingeconomics" (matches SOURCE_DISPLAY_NAMES key)
 */
export async function defaultTeChromiumNewsFetcher(): Promise<RssItem[]> {
  const { breakers } = await import("../../../infrastructure/circuitBreakerRegistry.js");
  const { fetchTradingEconomicsNews, parseRelativeDate } = await import(
    "../../../infrastructure/fetchers/tradingEconomicsChromium.js"
  );
  const items = await breakers.tradingEconomics.execute(() => fetchTradingEconomicsNews(20));
  return items.map((item) => ({
    title:       item.title,
    url:         item.url,
    content:     item.category ? `${item.summary} [${item.category}]` : item.summary,
    publishedAt: parseRelativeDate(item.date),
    source:      "tradingeconomics",
  } satisfies RssItem));
}

/**
 * NewsAPI.org fallback fetcher — activated when Reuters VPS push is stale >90 min.
 * Returns [] immediately when no API key configured (stub path). Task 1345a.
 */
export async function defaultNewsApiFetcher(): Promise<RssItem[]> {
  try {
    const { breakers } = await import("../../../infrastructure/circuitBreakerRegistry.js");
    const { fetchNewsApi } = await import("../../../infrastructure/fetchers/newsapi.js");
    const { loadMcpConfig } = await import("../../../infrastructure/config.js");
    const cfg = loadMcpConfig();
    const newsapiCfg = (cfg as unknown as Record<string, unknown>)?.newsSources as
      | { newsapi?: { apiKey?: string; enabled?: boolean } }
      | undefined;
    const apiKey = newsapiCfg?.newsapi?.apiKey ?? "";
    const enabled = newsapiCfg?.newsapi?.enabled ?? false;
    return breakers.newsapi.execute(() => fetchNewsApi({ apiKey, enabled }));
  } catch {
    return [];
  }
}

export async function defaultRagRetriever(
  query: string,
  options?: { k?: number },
): Promise<SearchResult[]> {
  // G5b (P2-F): route through ragHttpClient → rag-service HTTP (port 5002)
  // DFR-P1-MCP FR-4: pass decay_half_life_days for "news" doc_type from config
  try {
    const { ragSearch } = await import("../../../infrastructure/rag/ragHttpClient.js");
    const { loadMcpConfig } = await import("../../../infrastructure/config.js");
    const cfg = loadMcpConfig();
    const decayHalfLifeDays = cfg.rag?.decayHalfLifeDays?.news ?? 2;
    const response = await ragSearch({
      query,
      decay_half_life_days: decayHalfLifeDays,
      ...(options?.k !== undefined ? { limit: options.k } : {}),
      // hybrid intentionally omitted — contextual enrichment is semantic, not ticker-exact
    });
    return response.results.map((r) => ({
      id: r.id,
      level: r.level,
      title: r.title,
      summary: r.summary,
      tags: r.tags,
      actionCode: r.action_code,
      createdAt: r.created_at,
      distance: r.distance,
    }));
  } catch {
    return [];
  }
}
