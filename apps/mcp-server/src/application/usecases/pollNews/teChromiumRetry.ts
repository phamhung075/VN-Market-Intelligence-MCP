/**
 * teChromiumNews cold-start retry wrapper — Poll News
 * (FACTORY-APP-split-pollNews, stage 1: fetch/health)
 *
 * Task 1821a: Playwright cold-launch occasionally returns 0 items on the
 * first call (browser not yet warmed up). Wraps the teChromiumNews fetcher
 * so a fulfilled-but-empty result triggers a single 2-second sleep + retry.
 * Split out of resolveFetchers.ts to keep both files comfortably <=120L.
 *
 * Layer: application/usecases — may import from domain/ and infrastructure/.
 */

import type { RssItem } from "../../../infrastructure/fetchers/rss.js";

export interface WrapTeChromiumRetryInput {
  resolvedFetchers: Record<string, () => Promise<RssItem[]>>;
  /** True when the caller injected an explicit teChromiumNews override (tests). */
  teIsInjectedByTest: boolean;
  /** Sleep function injectable for tests (default: 2000 ms real sleep). */
  sleepMs?: (ms: number) => Promise<void>;
}

const TE_CHROMIUM_KEY = "teChromiumNews";

const _realSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Mutates `resolvedFetchers[TE_CHROMIUM_KEY]` in place (no-op if that key is
 * absent) — matches the pre-split orchestrator's mutation-in-place shape so
 * the caller's own accumulator object stays the single source of truth.
 *
 * CI-NETWORK-SKIP-GUARDS: skip the retry wrapper in CI ONLY when using the
 * real Chromium fetcher (no caller-injected override) — the no-op CI fetcher
 * returns [] immediately; retrying with a 2s sleep would blow the >5000ms CI
 * timeout. When the caller injects `fetchers.teChromiumNews` (e.g. test
 * stubs), the retry wrapper MUST always run so AC-1/AC-2/AC-4 contract tests
 * stay hermetic in CI.
 */
export function wrapTeChromiumRetry(input: WrapTeChromiumRetryInput): void {
  const { resolvedFetchers, teIsInjectedByTest } = input;
  const sleep = input.sleepMs ?? _realSleep;

  if (resolvedFetchers[TE_CHROMIUM_KEY] === undefined ||
      !(teIsInjectedByTest || Bun.env.CI !== "true")) {
    return;
  }
  const originalFetcher = resolvedFetchers[TE_CHROMIUM_KEY]!;
  resolvedFetchers[TE_CHROMIUM_KEY] = async (): Promise<RssItem[]> => {
    const firstResult = await originalFetcher();
    if (firstResult.length > 0) return firstResult;
    // Cold-start empty result — wait and retry once
    await sleep(2000);
    return originalFetcher();
  };
}
