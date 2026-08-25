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
 * stage-1 review) lands this pass:
 *   ingestEntries.ts       — per-item commodity-indicator extraction +
 *                             normalize + sentiment classify + dedup-insert
 *                             loop orchestration
 *   ragEmbed.ts            — LanceDB embed of one newly-inserted entry
 *   deepFetchEnqueue.ts    — deep-fetch relevance gate + queue enqueue
 * This file is now the orchestrator: fetch/health + dedup/insert stages
 * delegated above, plus the still-inline cascade/alert-generation stage and
 * the all-sources-dark cooldown state box. All previously-exported names
 * (types, detectInsiderFamilyBuying, detectInsiderSelling,
 * _resetAllDarkAlert, pollNews) are re-exported here unchanged so every
 * existing `from ".../pollNews.js"` import keeps working with zero call-site
 * changes. Remaining stage (cascade/alert-generation/mention-velocity) is
 * tracked as follow-up, not done in this pass (see
 * docs/agent-memory/notebooks/dev-mcp-server.md).
 *
 * Layer: application/usecases — may import from domain/ and infrastructure/.
 */

import type { WatchlistEntry } from "../../domain/services/cascadeEngine.js";
import type { SearchResult } from "../../domain/services/cascadeEngine.js";
import { isVnRelevant } from "../../domain/services/vnRelevanceFilter.js";
import { buildCausalChain, DEFAULT_BROADCAST_MIN_IMPACT } from "../../domain/services/cascadeEngine.js";
import { detectStocksInText, tickerWholeWordMatch, stripSourceAttributionSuffix } from "../../domain/services/stockAliases.js";
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
  // Task 1840a / G5b (P2-F): resolve RAG insert function — default routes via ragHttpClient
  // DFR-P1-MCP FR-5: pass new metadata fields (doc_type, depth_tier, source_domain, etc.)
  const ragInsertFn: InsertAnalysisFn = options.ragInsert ?? (async (entry) => {
    const { ragIndex } = await import("../../infrastructure/rag/ragHttpClient.js");
    await ragIndex({
      id: entry.id,
      content: entry.summary,
      tags: entry.tags,
      level: entry.level,
      title: entry.title,
      summary: entry.summary,
      ...(entry.actionCode !== undefined ? { action_code: entry.actionCode } : {}),
      // DFR-P1-MCP FR-5: new metadata passthrough
      ...(entry.doc_type       !== undefined ? { doc_type:       entry.doc_type }       : {}),
      ...(entry.depth_tier     !== undefined ? { depth_tier:     entry.depth_tier }     : {}),
      ...(entry.source_domain  !== undefined ? { source_domain:  entry.source_domain }  : {}),
      ...(entry.published_at   !== undefined ? { published_at:   entry.published_at }   : {}),
      ...(entry.confidence     !== undefined ? { confidence:     entry.confidence }     : {}),
      ...(entry.impact_score   !== undefined ? { impact_score:   entry.impact_score }   : {}),
      ...(entry.ticker         !== undefined ? { ticker:         entry.ticker }         : {}),
      ...(entry.sector         !== undefined ? { sector:         entry.sector }         : {}),
    });
  });

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

  // ── Step 4–5: Run cascade + generate alerts for new entries ──────────────
  let totalAlerts = 0;

  if (newEntries.length > 0 && watchlist.length > 0) {
    // Collect all signals from all cascade chains
    const allSignals: import("../../domain/services/signalDetector.js").Signal[] = [];

    // Per-stock signal counter — cap news_mention signals per stock per cycle
    // to prevent a flood of cascade signals for a single stock (especially
    // problematic when the watchlist has only 1-2 stocks).
    const stockSignalCount = new Map<string, number>();
    const MAX_SIGNALS_PER_STOCK_PER_CYCLE = 3;

    // Pre-fetch macro data ONCE for the whole batch (avoid 95× HTTP calls)
    let macroStats: import("../../domain/services/macroThresholds.js").MacroStats[] = [];
    let macroContext: import("../../domain/services/cascadeEngine.js").MacroContext | null = null;
    try {
      const { getAllMacroStats } = await import("../../infrastructure/db/macroStatsStore.js");
      macroStats = getAllMacroStats();
    } catch { /* no σ data yet */ }
    // CI-NETWORK-SKIP-GUARDS: skip live macro HTTP fetches in CI to avoid ETIMEDOUT.
    if (Bun.env.CI !== "true") try {
      const { fetchYahooFinancePrices } = await import("../../infrastructure/fetchers/yahooFinance.js");
      const { fetchSbvRates } = await import("../../infrastructure/fetchers/sbv.js");
      const [commodity, sbv] = await Promise.allSettled([fetchYahooFinancePrices(), fetchSbvRates()]);
      macroContext = {
        brentCrudeUSD: commodity.status === "fulfilled" ? commodity.value?.brentCrudeUSD ?? null : null,
        goldUSDPerOz: commodity.status === "fulfilled" ? commodity.value?.goldUSDPerOz ?? null : null,
        usdVndMarket: commodity.status === "fulfilled" ? commodity.value?.usdVndRate ?? null : null,
        refinancingRatePct: sbv.status === "fulfilled" ? sbv.value?.refinancingRatePct ?? null : null,
        overnightRatePct: sbv.status === "fulfilled" ? sbv.value?.overnightRatePct ?? null : null,
        usdVndOfficial: sbv.status === "fulfilled" ? sbv.value?.usdVndOfficial ?? null : null,
        // new risk-off fields (sprint 188, FR-7)
        vix:      commodity.status === "fulfilled" ? commodity.value?.vix      ?? null : null,
        sp500:    commodity.status === "fulfilled" ? commodity.value?.sp500    ?? null : null,
        dxy:      commodity.status === "fulfilled" ? commodity.value?.dxy      ?? null : null,
        hangSeng: commodity.status === "fulfilled" ? commodity.value?.hangSeng ?? null : null,
      };
    } catch { /* no macro context */ }

    // Load broadcastMinImpact ("broadcast floor") from config once for the
    // whole batch (falls back to the domain SSOT default on failure or
    // missing config key).
    let broadcastMinImpact = DEFAULT_BROADCAST_MIN_IMPACT;
    try {
      const { loadMcpConfig } = await import("../../infrastructure/config.js");
      const cfg = loadMcpConfig();
      broadcastMinImpact = cfg.alerts?.marketWideCascadeMinImpact ?? DEFAULT_BROADCAST_MIN_IMPACT;
    } catch { /* use default */ }

    for (const entry of newEntries) {
      try {
        let chain: import("../../domain/services/cascadeEngine.js").CausalChain;

        // Use buildCausalChain directly with pre-fetched macro data (fast, no HTTP per entry)
        let ragResults: SearchResult[] = [];
        try {
          ragResults = await retriever(entry.summary, { k: 3 });
        } catch { /* silent */ }
        chain = buildCausalChain(entry, watchlist, ragResults, macroContext, macroStats, broadcastMinImpact);

        // Convert watchlist impacts into news_mention signals
        // Relevance gate (task 152): filter noise before creating signals
        // Read gate config from mcp.config.json (with sensible defaults)
        const DEFAULT_NEWS_MENTION_CONFIG = {
          maxAgeMinutes: 240,
          requireNonNeutralSentiment: true,
          minSentimentConfidence: 0.5,
          minCascadeConfidence: 0.85,
          highTrustSources: ["cafef", "vnexpress", "vneconomy"],
        };
        let nmCfg = DEFAULT_NEWS_MENTION_CONFIG;
        try {
          const { loadMcpConfig } = await import("../../infrastructure/config.js");
          const cfg = loadMcpConfig();
          nmCfg = cfg.alerts.newsMention;
        } catch { /* use defaults */ }
        const highTrustSources = nmCfg.highTrustSources;
        const maxAgeMs = nmCfg.maxAgeMinutes * 60 * 1000;

        // Pre-compute sentiment once per entry (not per impact — perf fix)
        const { classifySentiment: classify } = await import("../../domain/services/sentimentClassifier.js");
        const entrySentiment = classify(`${entry.sourceTitle} ${entry.summary}`);

        for (const impact of chain.watchlistImpacts) {
          if (impact.confidence <= 0) continue;

          // Gate 1: Article age — skip stale news
          const articleAge = Date.now() - new Date(entry.createdAt).getTime();
          if (articleAge > maxAgeMs) continue;

          // Gate 2: Sentiment — skip neutral articles (no investment signal)
          const sentiment = entrySentiment;
          if (nmCfg.requireNonNeutralSentiment && sentiment.direction === "neutral" && sentiment.confidence < 0.3) continue;

          // Gate 3: Direct stock mention OR (trusted source + strong signal)
          // A direct mention in the article always passes.
          // For cascade-only impacts (no direct mention), require BOTH:
          //   a) trusted source, AND
          //   b) strong non-neutral sentiment (confidence >= 0.5) + high cascade confidence (>= 0.7)
          // This prevents generic macro news from triggering alerts for every stock in every sector.
          const sourceUrl = entry.sourceUrl.toLowerCase();
          const sourceTrusted = highTrustSources.some((s) => sourceUrl.includes(s));
          // FIX-1333: strip " - SOURCE" attribution suffix before ticker matching
          const strippedTitle = stripSourceAttributionSuffix(entry.sourceTitle);
          const titleAndSummary = `${strippedTitle} ${entry.summary}`.toLowerCase();
          // FIX-1304: use whole-word boundary match to prevent prefix collisions
          // e.g. "BID" must NOT fire on "Bidiphar" (BID is a leading substring)
          const tickerMatch = tickerWholeWordMatch(titleAndSummary, impact.actionCode);
          const aliasMatch = tickerMatch
            ? false // short-circuit: ticker already matched, skip alias scan
            : detectStocksInText(titleAndSummary, [impact.actionCode]).length > 0;
          const directMention = tickerMatch || aliasMatch;
          // Gate 3b: Market-wide cascade noise filter — cascade-only impacts
          // from "ảnh hưởng toàn thị trường" are low-signal for individual stocks.
          // Require direct mention for market-wide cascade impacts.
          const isMarketWideCascade = impact.reasoning.includes("market-wide cascade");
          if (directMention) {
            // Always pass — article explicitly mentions this stock
          } else if (isMarketWideCascade) {
            continue; // Market-wide cascade without direct mention — skip (noise)
          } else if (sourceTrusted && sentiment.direction !== "neutral" && sentiment.confidence >= nmCfg.minSentimentConfidence && impact.confidence >= nmCfg.minCascadeConfidence) {
            // Trusted source + strong directional sentiment + high cascade confidence — pass
          } else {
            continue; // Not relevant enough for this stock
          }

          // Per-stock signal cap — prevent flood for single-stock watchlists
          const currentCount = stockSignalCount.get(impact.actionCode) ?? 0;
          if (!directMention && currentCount >= MAX_SIGNALS_PER_STOCK_PER_CYCLE) continue;
          stockSignalCount.set(impact.actionCode, currentCount + 1);

          // Task 1260: Elevate insider/family buying events from news_mention LOW
          // to insider_trading MEDIUM. Vietnamese patterns: "con trai gom cổ phiếu",
          // "người nhà mua vào", etc. These are related-party buying signals — higher
          // investment significance than generic news mentions.
          const isInsiderFamily = detectInsiderFamilyBuying(entry.sourceTitle);
          allSignals.push({
            type: isInsiderFamily ? "insider_trading" : "news_mention",
            severity: isInsiderFamily
              ? "medium"
              : impact.confidence >= 0.8 ? "high" : impact.confidence >= 0.6 ? "medium" : "low",
            actionCode: impact.actionCode,
            message: isInsiderFamily
              ? `[Insider/family buying] ${entry.sourceTitle} — ${impact.reasoning}`
              : `${entry.sourceTitle} — ${impact.reasoning}`,
            confidence: isInsiderFamily ? Math.max(impact.confidence, 0.75) : impact.confidence,
            detectedAt: entry.createdAt,
          });
        }
        // ── Trade relationship analysis — country-to-stock impact ──────────
        // Goes beyond sector rules: "Middle East peace" → VNM (8% export Iraq)
        try {
          const { analyzeTradeImpact } = await import("../../domain/services/tradeRelationships.js");
          const { detectAndLearnTradeRelationship } = await import("../../infrastructure/db/tradeStore.js");

          // Auto-learn new trade relationships from news
          const wlCodes = new Set(watchlist.map((w) => w.actionCode));
          detectAndLearnTradeRelationship(`${entry.sourceTitle} ${entry.summary}`, wlCodes);

          // Analyze trade impact
          const tradeImpacts = analyzeTradeImpact(
            `${entry.sourceTitle} ${entry.summary}`,
            watchlist.map((w) => w.actionCode),
          );

          for (const ti of tradeImpacts) {
            // Skip if already covered by cascade (same stock already has a signal)
            const alreadyCovered = allSignals.some(
              (s) => s.actionCode === ti.code && s.type === "news_mention",
            );
            if (alreadyCovered) continue;

            // Gate: trade impacts also require non-neutral sentiment + article freshness
            const tradeArticleAge = Date.now() - new Date(entry.createdAt).getTime();
            if (tradeArticleAge > maxAgeMs) continue;
            if (nmCfg.requireNonNeutralSentiment && entrySentiment.direction === "neutral" && entrySentiment.confidence < 0.3) continue;

            allSignals.push({
              type: "news_mention",
              severity: ti.revenuePct >= 15 ? "high" : ti.revenuePct >= 5 ? "medium" : "low",
              actionCode: ti.code,
              message: `${entry.sourceTitle} — ${ti.reasoning}`,
              confidence: Math.min(0.9, ti.revenuePct / 100 + 0.3),
              detectedAt: entry.createdAt,
            });
          }
        } catch { /* trade analysis best-effort */ }

      } catch (err) {
        logger.error("[pollNews] cascade failed for entry", {
          entryId: entry.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Task 1922e — Wire mention_velocity writer.
    // After building all signals, aggregate raw news_mention signals by
    // (code, floorHour) and call recordMention() once per ticker per hour.
    // This feeds getCrisisEarlyWarning's spike detection with live data.
    //
    // Aggregation covers ALL signals (including insider_trading) for completeness,
    // since every signal represents an article that mentioned the ticker.
    // negativeCount: count signals where the entry sentiment was bearish.
    // sourceCount: number of distinct source hostnames in this hour window.
    try {
      // Build hourly buckets: key = "CODE::2026-05-16T10:00:00.000Z"
      const hourlyBuckets = new Map<string, {
        code: string;
        hour: string;
        mentionCount: number;
        negativeCount: number;
        sources: Set<string>;
      }>();

      // Snap a timestamp to the start of the UTC hour (ISO format)
      function floorToHour(isoTs: string): string {
        const d = new Date(isoTs);
        d.setUTCMinutes(0, 0, 0);
        return d.toISOString();
      }

      for (const sig of allSignals) {
        const hour = floorToHour(sig.detectedAt ?? new Date().toISOString());
        const bucketKey = `${sig.actionCode}::${hour}`;
        const existing = hourlyBuckets.get(bucketKey);
        // Determine if signal is negative (bearish sentiment)
        const isNegative = sig.severity === "high" || sig.severity === "critical";
        // Derive source domain from the original entry (best-effort via message)
        const sourceHost = sig.message?.split(" — ")[0]?.slice(0, 40) ?? "unknown";
        if (existing) {
          existing.mentionCount += 1;
          if (isNegative) existing.negativeCount += 1;
          existing.sources.add(sourceHost);
        } else {
          hourlyBuckets.set(bucketKey, {
            code: sig.actionCode,
            hour,
            mentionCount: 1,
            negativeCount: isNegative ? 1 : 0,
            sources: new Set([sourceHost]),
          });
        }
      }

      if (hourlyBuckets.size > 0) {
        const { recordMention } = await import("../../infrastructure/db/mentionVelocityStore.js");
        for (const bucket of hourlyBuckets.values()) {
          recordMention(db, {
            code: bucket.code,
            hour: bucket.hour,
            mentionCount: bucket.mentionCount,
            negativeCount: bucket.negativeCount,
            sourceCount: bucket.sources.size,
          });
        }
        logger.debug("[pollNews] mention_velocity updated", {
          buckets: hourlyBuckets.size,
          codes: [...new Set([...hourlyBuckets.values()].map((b) => b.code))],
        });
      }
    } catch (velErr) {
      // Non-fatal — velocity tracking must never abort the poll cycle
      logger.warn("[pollNews] mention_velocity write failed (non-fatal)", {
        error: velErr instanceof Error ? velErr.message : String(velErr),
      });
    }

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
