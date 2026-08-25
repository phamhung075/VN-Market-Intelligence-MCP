/**
 * Poll News — Task 102 (Application Layer)
 *
 * Orchestrates one complete news poll cycle:
 *   1. Fetch from CafeF, VnExpress, Reuters in parallel
 *   2. Normalize each RssItem into an AnalysisEntry via normalizeNews
 *   3. Deduplicate by source_url: INSERT OR IGNORE (relies on UNIQUE index)
 *   4. For each newly inserted entry, run impact chain analysis
 *   5. Generate alerts via generateAlerts + persist via storeAlerts
 *   6. Return summary: { fetched, inserted, duplicates, alerts, errors }
 *
 * Error isolation: each source failure increments `errors` but does not
 * abort the remaining sources.
 *
 * FACTORY-APP-split-pollNews (staged god-file split, this file was 1444L):
 * single-responsibility pieces now live in ./pollNews/ —
 *   types.ts               — PollNewsResult / SourceFetchers / RagRetriever /
 *                             InsertAnalysisFn / PollNewsOptions
 *   insiderDetectors.ts    — detectInsiderFamilyBuying / detectInsiderSelling
 *   signalDedup.ts         — deduplicateSignalsByStockAndType
 *   defaultFetchers.ts     — lazily-loaded real network fetchers + RAG retriever
 *   dbHelpers.ts           — titleFingerprint / isTitleDuplicate /
 *                             tryInsertEntry / loadWatchlist
 * Stage 1 of the pipeline-body decomposition (fetch/health — same "one
 * extraction per commit" ladder the task's own DoD approach names) landed
 * 2026-08-15:
 *   resolveFetchers.ts     — per-cycle fetcher-set resolution (local
 *                             defaults + injected overrides + newsapi
 *                             fallback + VPS-only keys)
 *   teChromiumRetry.ts     — Task 1821a 0-item cold-start retry wrapper
 *   sourceHealth.ts        — SOURCE_DISPLAY_NAMES / STUB_CAPABLE_KEYS /
 *                             isNewsapiConfigured
 *   fetchAndRecordHealth.ts — Promise.allSettled fetch execution +
 *                             globalSourceTracker health recording
 *   allSourcesDarkAlert.ts — DB-backed cooldown + Telegram bug alert
 * Stage 2 (dedup/insert — normalize/sentiment/dedup/insert/RAG-embed/
 * deep-fetch-gate, per QA's explicit continue-the-ladder instruction on the
 * stage-1 review) landed 2026-08-25:
 *   ingestEntries.ts       — per-item commodity-indicator extraction +
 *                             normalize + sentiment classify + dedup-insert
 *                             loop orchestration
 *   ragEmbed.ts            — LanceDB embed of one newly-inserted entry
 *   deepFetchEnqueue.ts    — deep-fetch relevance gate + queue enqueue
 * Stage 3 (cascade/alert-generation/mention-velocity, same-day continuation
 * of the ladder) lands this pass:
 *   prefetchCascadeContext.ts   — batch-level macro σ-stats + live commodity/
 *                                 SBV context + broadcast-floor config
 *   buildSignalsForEntry.ts     — per-entry causal-chain build + nmCfg load +
 *                                 sentiment precompute, coordinates the two
 *                                 signal pushers below
 *   cascadeImpactSignals.ts     — cascade watchlist-impact → signal gates +
 *                                 per-stock cap
 *   tradeRelationshipSignals.ts — country-to-stock trade-exposure signals
 *   mentionVelocityAggregator.ts — hourly mention_velocity bucket + write
 *   defaultRagInsertFn.ts       — default InsertAnalysisFn (ragHttpClient wiring)
 * This file is now the thin orchestrator: fetch/health, dedup/insert, and
 * cascade/alert-generation stages all delegated above, plus the
 * all-sources-dark cooldown state box. All previously-exported names
 * (types, detectInsiderFamilyBuying, detectInsiderSelling,
 * _resetAllDarkAlert, pollNews) are re-exported here unchanged so every
 * existing `from ".../pollNews.js"` import keeps working with zero call-site
 * changes.
 *
 * Layer: application/usecases — may import from domain/ and infrastructure/.
 */

import type { WatchlistEntry } from "../../domain/services/cascadeEngine.js";
import type { Signal } from "../../domain/services/signalDetector.js";
import { isVnRelevant } from "../../domain/services/vnRelevanceFilter.js";
import { generateAlerts } from "../../domain/services/alertGenerator.js";
import { storeAlerts } from "../../infrastructure/db/alertStore.js";
import { getDb } from "../../infrastructure/db/schema.js";
import { logger } from "../../infrastructure/logger.js";
// FACTORY-APP-pollNews-layering-fix (2026-07-24): globalSourceTracker relocated
// from interface/ to infrastructure/observability/sourceHealthRegistry.ts —
// resolves the former Fence-B violation (application must not import interface).
import { _resetGlobalSourceTracker } from "../../infrastructure/observability/sourceHealthRegistry.js";
import { detectInsiderFamilyBuying, detectInsiderSelling } from "./pollNews/insiderDetectors.js";
import { deduplicateSignalsByStockAndType } from "./pollNews/signalDedup.js";
import { defaultRagRetriever } from "./pollNews/defaultFetchers.js";
import { loadWatchlist } from "./pollNews/dbHelpers.js";
import { resolveFetchers } from "./pollNews/resolveFetchers.js";
import { fetchAndRecordHealth } from "./pollNews/fetchAndRecordHealth.js";
import { maybeAlertAllSourcesDark, type DarkAlertState } from "./pollNews/allSourcesDarkAlert.js";
import { ingestEntries } from "./pollNews/ingestEntries.js";
import { defaultRagInsertFn } from "./pollNews/defaultRagInsertFn.js";
import { prefetchCascadeContext } from "./pollNews/prefetchCascadeContext.js";
import { buildSignalsForEntry } from "./pollNews/buildSignalsForEntry.js";
import { recordMentionVelocity } from "./pollNews/mentionVelocityAggregator.js";
import type {
  PollNewsResult,
  SourceFetchers,
  RagRetriever,
  InsertAnalysisFn,
  PollNewsOptions,
} from "./pollNews/types.js";

// Re-exported unchanged for backward compatibility — external callers/tests
// import all of these directly from "application/usecases/pollNews.js".
export type { PollNewsResult, SourceFetchers, RagRetriever, InsertAnalysisFn, PollNewsOptions };
export { detectInsiderFamilyBuying, detectInsiderSelling };

// ─────────────────────────────────────────────────────────────────────────────
// All-sources-dark cooldown state (Task 1345a / 1398 / 1793)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Module-level dedup timer box for the all-sources-dark alert (see
 * ./pollNews/allSourcesDarkAlert.ts). A plain mutable object (not a bare
 * `let`) so both `maybeAlertAllSourcesDark()` and `_resetAllDarkAlert()`
 * below observe/mutate the SAME cooldown state across the module boundary.
 */
const darkAlertState: DarkAlertState = { lastAt: 0 };

/**
 * Test-only reset for the all-sources-dark dedup timer and source health tracker.
 *
 * Clears both the module-level cooldown timestamp and the globalSourceTracker
 * accumulated failure state, so tests that call this in beforeEach start with
 * a clean slate for both the dark-alert dedup and the active-source CB check
 * (Task 1832b).
 *
 * @internal
 */
export function _resetAllDarkAlert(): void {
  darkAlertState.lastAt = 0;
  _resetGlobalSourceTracker();
}

// ─────────────────────────────────────────────────────────────────────────────
// Main exported function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run one complete news poll cycle.
 *
 * Orchestrates: fetch all RSS sources in parallel → normalize →
 * dedup by source_url → persist new entries → run impact chain →
 * generate + store alerts for impacted watchlist stocks.
 *
 * Error isolation: each source is wrapped in try/catch. A failing source
 * increments `errors` but does not abort remaining sources.
 *
 * @param options - Optional overrides for limit, fetchers, db, ragRetriever, watchlist
 * @returns       - PollNewsResult summary
 */
export async function pollNews(options: PollNewsOptions = {}): Promise<PollNewsResult> {
  const limit = options.limit ?? 20;
  const db = options.db ?? getDb();
  const retriever: RagRetriever = options.ragRetriever ?? defaultRagRetriever;
  // Task 1840a / G5b (P2-F): resolve RAG insert function — default routes via
  // ragHttpClient (FACTORY-APP-split-pollNews stage 3, extracted to
  // ./pollNews/defaultRagInsertFn.js)
  const ragInsertFn: InsertAnalysisFn = options.ragInsert ?? defaultRagInsertFn;

  // Resolve watchlist (injected or loaded from DB)
  const watchlist: WatchlistEntry[] =
    options.watchlist !== undefined ? options.watchlist : loadWatchlist(db);

  // ── Stage 1: fetch/health (FACTORY-APP-split-pollNews, extracted to ./pollNews/) ──
  // Task 1345a: resolve the per-cycle fetcher set (local defaults + injected
  // overrides + Reuters-stale newsapi fallback + Task 1821a cold-start retry).
  const { resolvedFetchers } = resolveFetchers({
    reutersLastPushTs: options.reutersLastPushTs ?? null,
    ...(options.fetchers !== undefined && { fetchers: options.fetchers }),
    ...(options.sleepMs !== undefined && { sleepMs: options.sleepMs }),
  });

  // Step 1: fetch all active sources in parallel + record health per source.
  const { allItems, errors, activeSourceCount, sourceCount } =
    await fetchAndRecordHealth(resolvedFetchers, limit);

  const fetched = allItems.length;

  // Task 1345a / 1398 / 1832b / 1855a: all-sources-dark Telegram alert
  // (DB-backed cooldown, VPS-push-healthy suppression).
  await maybeAlertAllSourcesDark({
    db,
    fetchedCount: fetched,
    activeSourceCount,
    sourceKeys: Object.keys(resolvedFetchers),
    sourceCount,
    vpsNewsLastPushTs: options.vpsNewsLastPushTs ?? null,
    ...(options.nowMs !== undefined && { nowMs: options.nowMs }),
    ...(options.onAllSourcesDark !== undefined && { onAllSourcesDark: options.onAllSourcesDark }),
    state: darkAlertState,
  });

  // ── Step 1c: VN relevance pre-filter (Task 1247) ─────────────────────────
  // Discard non-VN articles (sports, US personal finance, entertainment) that
  // have no VN market signal before committing cascade CPU.
  const relevantItems = allItems.filter((item) =>
    isVnRelevant({ title: item.title, content: item.content, source: item.source }),
  );
  const irrelevantCount = allItems.length - relevantItems.length;
  if (irrelevantCount > 0) {
    logger.debug(`[pollNews] VN relevance filter discarded ${irrelevantCount} non-VN articles`);
  }

  // ── Step 1b–3: commodity-indicator extraction, normalize/sentiment/dedup/
  // insert/RAG-embed/deep-fetch-gate (FACTORY-APP-split-pollNews stage 2,
  // extracted to ./pollNews/ingestEntries.js) ──────────────────────────────
  const { inserted, duplicates, newEntries } = await ingestEntries(
    relevantItems,
    db,
    watchlist,
    ragInsertFn,
  );

  // ── Step 4–5: Run cascade + generate alerts for new entries (FACTORY-APP-
  // split-pollNews stage 3, extracted to ./pollNews/) ──────────────────────
  let totalAlerts = 0;

  if (newEntries.length > 0 && watchlist.length > 0) {
    // Collect all signals from all cascade chains (mutated by reference in
    // buildSignalsForEntry/pushCascadeImpactSignals/pushTradeRelationshipSignals)
    const allSignals: Signal[] = [];
    const stockSignalCount = new Map<string, number>();

    const { macroStats, macroContext, broadcastMinImpact } = await prefetchCascadeContext();

    for (const entry of newEntries) {
      await buildSignalsForEntry({
        entry,
        watchlist,
        macroContext,
        macroStats,
        broadcastMinImpact,
        retriever,
        allSignals,
        stockSignalCount,
      });
    }

    await recordMentionVelocity(db, allSignals);

    // Deduplicate signals: merge multiple news_mention for the same stock
    // into a single signal with the highest-confidence entry's message.
    // This prevents 30× "news_mention" spam when many articles mention the same stock.
    const dedupedSignals = deduplicateSignalsByStockAndType(allSignals);

    // Generate alerts from deduplicated signals
    if (dedupedSignals.length > 0) {
      const alerts = generateAlerts(dedupedSignals, watchlist);
      if (alerts.length > 0) {
        storeAlerts(alerts, db);
        totalAlerts = alerts.length;
      }
    }
  }

  logger.info("[pollNews] cycle complete", {
    fetched,
    inserted,
    duplicates,
    irrelevant: irrelevantCount,
    alerts: totalAlerts,
    errors,
  });

  return {
    fetched,
    inserted,
    irrelevant: irrelevantCount,
    duplicates,
    alerts: totalAlerts,
    errors,
  };
}
