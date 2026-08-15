/**
 * Fetcher resolution — Poll News (FACTORY-APP-split-pollNews, stage 1: fetch/health)
 *
 * Resolves the active per-cycle fetcher set: local-source defaults +
 * caller-injected overrides (tests) + VPS-push-only keys + any future
 * unknown VPS key + the Task 1345a Reuters-stale newsapi fallback + the
 * Task 1821a teChromiumNews 0-item cold-start retry wrapper.
 *
 * Split out of pollNews.ts's pollNews() body (previously inline, lines
 * 168-253 of the pre-split orchestrator). Pure — no DB/network I/O beyond
 * the returned fetcher closures themselves (unexecuted until called).
 *
 * Layer: application/usecases — may import from domain/ and infrastructure/.
 */

import type { RssItem } from "../../../infrastructure/fetchers/rss.js";
import { logger } from "../../../infrastructure/logger.js";
import type { SourceFetchers } from "./types.js";
import {
  defaultCafefFetcher,
  defaultVnExpressFetcher,
  defaultVnEconomyFetcher,
  defaultTeChromiumNewsFetcher,
  defaultNewsApiFetcher,
} from "./defaultFetchers.js";
import { wrapTeChromiumRetry } from "./teChromiumRetry.js";

/**
 * Reuters VPS push runs hourly. 90 min allows one missed cycle before
 * the newsapi fallback activates. Mirrors REUTERS_STALE_MS in vpsProxyWatchdogJob.ts.
 */
const REUTERS_STALE_MS = 90 * 60 * 1000;

export interface ResolveFetchersInput {
  fetchers?: SourceFetchers;
  reutersLastPushTs?: Date | null;
  /** Sleep function injectable for tests (default: 2000 ms real sleep). Task 1821a. */
  sleepMs?: (ms: number) => Promise<void>;
}

export interface ResolveFetchersResult {
  resolvedFetchers: Record<string, () => Promise<RssItem[]>>;
  reutersIsStale: boolean;
}

export function resolveFetchers(input: ResolveFetchersInput): ResolveFetchersResult {
  // Known keys — local sources with defaults + named VPS-only sources
  const knownKeys: Record<string, true> = {
    cafef: true, vnexpress: true, reuters: true, vneconomy: true,
    tradingeconomics: true, teChromiumNews: true, vietstock: true, vietnambiz: true,
    vnbusiness: true, tuoitre: true, nhandan: true, nld: true,
    newsapi: true,
  };

  // ── Task 1345a: Reuters fallback chain ───────────────────────────────────
  const reutersTs = input.reutersLastPushTs ?? null;
  const reutersAgeMs = reutersTs ? Date.now() - reutersTs.getTime() : Infinity;
  const reutersIsStale = reutersAgeMs >= REUTERS_STALE_MS;

  // Resolve fetchers — local sources get defaults; VPS-only sources are
  // injected when provided and skipped during scheduled runs.
  // Use a Record<string, ...> accumulator to avoid exactOptionalPropertyTypes issues.
  const resolvedFetchers: Record<string, () => Promise<RssItem[]>> = {
    cafef:          input.fetchers?.cafef          ?? defaultCafefFetcher,
    vnexpress:      input.fetchers?.vnexpress      ?? defaultVnExpressFetcher,
    vneconomy:      input.fetchers?.vneconomy      ?? defaultVnEconomyFetcher,
    // Task 1799: TE Vietnam news feed via Chromium scraper (separate source slot)
    // CI-NETWORK-SKIP-GUARDS: skip real Chromium fetcher in CI (2s cold-start retry
    // would blow past the >5000ms CI timeout). CI env var is set by GH Actions.
    teChromiumNews: input.fetchers?.teChromiumNews ??
      (Bun.env.CI === "true" ? async () => [] : defaultTeChromiumNewsFetcher),
    // Sprint 1833g: reuters (RSS) and tradingeconomics (legacy stream) stay
    // permanently disabled from the default resolved set — only present when
    // a caller explicitly injects them (tests / one-off overrides).
    ...(input.fetchers?.reuters !== undefined && { reuters: input.fetchers.reuters }),
    ...(input.fetchers?.tradingeconomics !== undefined && { tradingeconomics: input.fetchers.tradingeconomics }),
  };
  // Task 1345a: add newsapi fetcher when Reuters is stale OR caller explicitly injects it
  // CI-NETWORK-SKIP-GUARDS: in CI env, skip real newsapi HTTP call to avoid ETIMEDOUT.
  if (reutersIsStale || input.fetchers?.newsapi !== undefined) {
    resolvedFetchers["newsapi"] = input.fetchers?.newsapi ??
      (Bun.env.CI === "true" ? async () => [] : defaultNewsApiFetcher);
    if (reutersIsStale) {
      logger.info("[pollNews] Reuters VPS push stale — activating newsapi fallback fetcher", {
        reutersAgeMinutes: Math.round(reutersAgeMs / 60_000),
      });
    }
  }
  // VPS-push-only keys: only add if the caller provided them
  const vpsOnlyKeys = ["vietstock", "vietnambiz", "vnbusiness", "tuoitre", "nhandan", "nld"] as const;
  for (const key of vpsOnlyKeys) {
    const fn = input.fetchers?.[key];
    if (fn !== undefined) resolvedFetchers[key] = fn;
  }
  // Propagate any additional unknown future VPS keys injected by the caller
  for (const [k, fn] of Object.entries(input.fetchers ?? {})) {
    if (!(k in knownKeys) && fn !== undefined) {
      resolvedFetchers[k] = fn;
    }
  }

  // Task 1821a: teChromiumNews 0-item cold-start retry (mutates resolvedFetchers in place)
  wrapTeChromiumRetry({
    resolvedFetchers,
    teIsInjectedByTest: input.fetchers?.teChromiumNews !== undefined,
    ...(input.sleepMs !== undefined && { sleepMs: input.sleepMs }),
  });

  return { resolvedFetchers, reutersIsStale };
}
