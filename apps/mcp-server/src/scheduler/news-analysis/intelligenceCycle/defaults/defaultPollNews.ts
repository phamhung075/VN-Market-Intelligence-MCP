/**
 * Intelligence Cycle — Step A default production impl: pollNews
 *
 * FACTORY-SCHEDULER-split-intelligenceCycleJob: extracted verbatim from
 * intelligenceCycleJob.ts. Injected via `deps.pollNewsFn ?? defaultPollNews`
 * in the orchestrator's `_runCycle`.
 */

import type { PollNewsResult } from "../../../../application/usecases/pollNews.js";

export async function defaultPollNews(): Promise<PollNewsResult> {
  const { pollNews } = await import("../../../../application/usecases/pollNews.js");
  // Task 1228: ALL news sources are now delivered exclusively via POST /api/push-news
  // from the Vinahost VPS (vn-news-fetch.service, 10 sources, 226 items/15min).
  //
  // Previous behavior: CafeF/VnExpress/VnEconomy were stubbed (task 1187), but
  // Reuters and Trading Economics were still fetched directly. In practice Reuters
  // is also unreliable from France (geo-block or rate-limit), producing repeated
  // "step A failed — pollNews error" entries in system_logs and rows_written=0
  // on every scheduled tick (task 1228).
  //
  // Fix: stub ALL news sources. The scheduled intelligenceCycleJob pollNews
  // call is now a no-op fetcher; all real ingestion happens via the VPS push path
  // in server.ts. This eliminates startup errors and noise in cron_job_runs.
  //
  // Task 1843: teChromiumNews (added in Task 1799) was missing from this stub
  // list. Every 15-minute intelligence cycle tick was launching a real
  // Playwright/Chromium browser process, causing:
  //   - Repeated ~2-second retries (cold-start retry in pollNews)
  //   - Runaway alert entries (1,227 across 255 minute-windows in 2 days)
  //   - CPU/memory waste from orphaned Playwright processes
  // VPS vn-news-fetch.service handles all news sources including Trading
  // Economics; no local fetcher should run from the scheduled cycle.
  //
  // FIX-NEWS-CB-FALSE-CLOSED (2026-07-08): reuters/tradingeconomics stubs
  // REMOVED from this fetcher map. Sprint 1833g permanently disabled both
  // sources — sourceHealthTools.ts seeds them with recordDisabled() once at
  // module load. But this function kept re-injecting `async () => []` stubs
  // for those two keys on every 15-min tick; pollNews.ts's health loop treats
  // a fulfilled-but-empty result from a source NOT in STUB_CAPABLE_KEYS as a
  // real failure, so every tick silently called recordFailure(), overwriting
  // the "disabled" status with an ever-incrementing "down" count (79+ and
  // climbing, zero successes ever). pollNews.ts's own resolvedFetchers
  // contract (Sprint 1833g) already excludes reuters/tradingeconomics from
  // the default set unless the caller explicitly injects a fetcher for them —
  // simply not passing these two keys here restores that contract and leaves
  // the one-time recordDisabled() seed untouched forever, as intended.

  // Task 1855a: read VPS news push health to suppress false all-sources-dark
  // alerts. Since all local fetchers are stubbed, a 0-item scheduled cycle is
  // expected when the VPS push pipeline is healthy (last push within 2h).
  // If the DB query fails for any reason, pass null → alert fires (safe default).
  let vpsNewsLastPushTs: Date | null = null;
  try {
    const { getDb } = await import("../../../../infrastructure/db/schema.js");
    const db = getDb();
    const row = db.prepare(
      `SELECT MAX(pushed_at) AS ts FROM vps_push_log WHERE service = 'news' AND status = 'ok'`,
    ).get() as { ts: string | null } | undefined;
    if (row?.ts) vpsNewsLastPushTs = new Date(row.ts);
  } catch {
    // DB unavailable or table missing — fall through with null (conservative: alert fires)
  }

  return pollNews({
    fetchers: {
      cafef:            async () => [],
      vnexpress:        async () => [],
      vneconomy:        async () => [],
      // reuters and tradingeconomics are intentionally NOT stubbed here (nor
      // otherwise injected) — see FIX-NEWS-CB-FALSE-CLOSED note above.
      // Omitting them entirely keeps pollNews.ts's resolvedFetchers from
      // ever adding these keys, so the scheduled cycle never touches their
      // health record again after the startup recordDisabled() seed.
      teChromiumNews:   async () => [],  // Task 1843: VPS handles TE Chromium news too
    },
    vpsNewsLastPushTs,  // Task 1855a: suppress false alert when VPS push is healthy
  });
}
