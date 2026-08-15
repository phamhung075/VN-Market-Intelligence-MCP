/**
 * Fetch execution + health tracking — Poll News (FACTORY-APP-split-pollNews, stage 1: fetch/health)
 *
 * Runs every resolved fetcher in parallel (Promise.allSettled — one slow/
 * failing source never blocks the others), then records success/failure/
 * disabled status into the globalSourceTracker circuit-breaker and collects
 * the fetched items (capped at `limit` per source).
 *
 * Split out of pollNews.ts's pollNews() body (previously inline, lines
 * 255-372 of the pre-split orchestrator).
 *
 * Layer: application/usecases — may import from domain/ and infrastructure/.
 */

import type { RssItem } from "../../../infrastructure/fetchers/rss.js";
import { logger } from "../../../infrastructure/logger.js";
import { globalSourceTracker } from "../../../infrastructure/observability/sourceHealthRegistry.js";
import { SOURCE_DISPLAY_NAMES, STUB_CAPABLE_KEYS, isNewsapiConfigured } from "./sourceHealth.js";

export interface SourceHealthResult {
  allItems: RssItem[];
  errors: number;
  /** Task 1832b: sources expected functional BEFORE this cycle's health update. */
  activeSourceCount: number;
  /** Total sources attempted this cycle (denominator for the all-dark alert message). */
  sourceCount: number;
}

export async function fetchAndRecordHealth(
  resolvedFetchers: Record<string, () => Promise<RssItem[]>>,
  limit: number,
): Promise<SourceHealthResult> {
  type SourceResult = { name: string; result: PromiseSettledResult<RssItem[]> };

  const sourceEntries: Array<{ name: string; promise: Promise<RssItem[]> }> =
    Object.entries(resolvedFetchers).map(([key, fn]) => ({ name: key, promise: fn() }));

  const settled = await Promise.allSettled(sourceEntries.map((s) => s.promise));

  const sourceResults: SourceResult[] = sourceEntries.map((s, idx) => ({
    name: s.name,
    result: settled[idx] as PromiseSettledResult<RssItem[]>,
  }));

  const allItems: RssItem[] = [];
  let errors = 0;

  // ── Task 1832b: Active-source count snapshot (pre-fetch-loop state) ─────
  // Snapshot BEFORE the health-update loop below calls recordFailure/recordSuccess
  // for this cycle's results — a single failed cycle must not immediately remove a
  // source from the active count (takes DOWN_THRESHOLD (5) consecutive failures).
  const activeSourceCount = sourceResults.filter(({ name }) => {
    const displayName = SOURCE_DISPLAY_NAMES[name] ?? name;
    if (STUB_CAPABLE_KEYS.has(name) && !isNewsapiConfigured()) return false; // disabled
    if (globalSourceTracker.isDown(displayName)) return false; // CB-open (5+ prior failures)
    return true;
  }).length;

  for (const { name, result } of sourceResults) {
    const displayName = SOURCE_DISPLAY_NAMES[name] ?? name;
    if (result.status === "fulfilled") {
      allItems.push(...result.value.slice(0, limit));
      if (result.value.length > 0) {
        // Task 1227: only record success when items are actually returned.
        globalSourceTracker.recordSuccess(displayName);
      } else if (STUB_CAPABLE_KEYS.has(name) && !isNewsapiConfigured()) {
        // Explicitly disabled or no API key — not a failure.
        globalSourceTracker.recordDisabled(displayName);
        logger.debug(`[pollNews] ${name} skipped — disabled or no API key configured`, { source: name });
      } else {
        // Fulfilled with 0 items — transient failure in the health tracker only
        // (does NOT increment `errors`, which is reserved for thrown exceptions).
        // Task 1288: separated health-tracking concern from error-counting.
        globalSourceTracker.recordFailure(displayName, "empty result — no items returned");
        logger.debug(`[pollNews] ${name} returned 0 items — recorded as transient failure`, { source: name });
      }
    } else {
      errors++;
      const errorMsg = result.reason instanceof Error
        ? result.reason.message
        : String(result.reason);
      globalSourceTracker.recordFailure(displayName, errorMsg);
      logger.error(`[pollNews] ${name} fetch failed: ${errorMsg.slice(0, 120)}`, {
        source: name,
        error: errorMsg,
      });
    }
  }

  return { allItems, errors, activeSourceCount, sourceCount: sourceResults.length };
}
