/**
 * Source health classification — Poll News (FACTORY-APP-split-pollNews, stage 1: fetch/health)
 *
 * Small shared config/classification pieces used by fetchAndRecordHealth.ts
 * to translate raw fetcher keys into health-tracker display names and to
 * distinguish "genuinely down" sources from "intentionally unconfigured"
 * ones (newsapi with no API key) so the source-health table never reports a
 * false consecutive-failure streak for a stub-capable source.
 *
 * Split out of pollNews.ts's pollNews() body (previously inline, lines
 * 269-314 of the pre-split orchestrator).
 *
 * Layer: application/usecases — may import from domain/ and infrastructure/.
 */

// Task 1333: translate raw fetcher keys to display names before recording health.
// These values must exactly match the bucket keys pre-seeded by
// globalSourceTracker.seedKnownSources() in sourceHealthTools.ts.
// "tradingeconomics" → "Trading Economics" (no "RSS" suffix) to match seedKnownSources line 54.
export const SOURCE_DISPLAY_NAMES: Record<string, string> = {
  reuters: "Reuters RSS",
  cafef: "CafeF RSS",
  vnexpress: "VnExpress RSS",
  vneconomy: "VnEconomy RSS",
  tradingeconomics: "Trading Economics",
  // Task 1799: Chromium-scraped news feed (distinct slot from RSS tradingeconomics)
  teChromiumNews: "Trading Economics News",
};

// Sources that return [] immediately when unconfigured (no API key / enabled:false).
// When these return empty, check config before recording a failure — if they are
// disabled/unconfigured, record "disabled" status instead of incrementing the
// failure counter (which produced false "8 consecutive failures" WARNs).
export const STUB_CAPABLE_KEYS = new Set(["newsapi"]);

// Lazily resolve newsapi config once per process — only needed when newsapi
// is in the active result set. Reads synchronously from the already-loaded
// mcpConfig singleton to avoid dynamic imports in the hot path.
let _newsapiConfiguredCache: boolean | null = null;

export function isNewsapiConfigured(): boolean {
  if (_newsapiConfiguredCache !== null) return _newsapiConfiguredCache;
  try {
    // mcpConfig is a module-level singleton (already loaded at startup) — safe to import
    // synchronously by accessing the already-resolved module cache via a direct path.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const configModule = require("../../../infrastructure/config.js") as
      { mcpConfig?: Record<string, unknown> };
    const cfg = configModule.mcpConfig;
    const newsapiCfg = (cfg as Record<string, unknown> | undefined)?.newsSources as
      | { newsapi?: { apiKey?: string; enabled?: boolean } }
      | undefined;
    _newsapiConfiguredCache =
      Boolean(newsapiCfg?.newsapi?.enabled) && Boolean(newsapiCfg?.newsapi?.apiKey);
  } catch {
    _newsapiConfiguredCache = false;
  }
  return _newsapiConfiguredCache;
}
