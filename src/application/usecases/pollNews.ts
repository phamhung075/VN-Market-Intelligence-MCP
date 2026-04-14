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
 * Layer: application/usecases — may import from domain/ and infrastructure/.
 */

import type { Database } from "bun:sqlite";
import type { RssItem } from "../../infrastructure/fetchers/rss.js";
import type { WatchlistEntry } from "../../domain/services/cascadeEngine.js";
import type { SearchResult } from "../../domain/services/cascadeEngine.js";
import { normalizeNews } from "../../domain/services/newsNormalizer.js";
import { isVnRelevant } from "../../domain/services/vnRelevanceFilter.js";
import { scoreMacroIndicator } from "../../domain/services/macroIndicatorScorer.js";
import { buildCausalChain } from "../../domain/services/cascadeEngine.js";
import { detectStocksInText } from "../../domain/services/stockAliases.js";
import { generateAlerts } from "../../domain/services/alertGenerator.js";
import { storeAlerts } from "../../infrastructure/db/alertStore.js";
import { getDb } from "../../infrastructure/db/schema.js";
import { logger } from "../../infrastructure/logger.js";
import { globalSourceTracker } from "../../interface/mcp/tools/sourceHealthTools.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PollNewsResult {
  /** Total RSS items fetched across all sources */
  fetched: number;
  /** New AnalysisEntry rows stored in rag_analyses */
  inserted: number;
  /** Items skipped because source_url already exists */
  duplicates: number;
  /** Alert rows generated and stored */
  alerts: number;
  /** Source-level failures (non-fatal) */
  errors: number;
}

/**
 * Injectable fetcher functions for each RSS source.
 * Allows tests to inject mocks without touching real HTTP.
 */
export interface SourceFetchers {
  cafef?: () => Promise<RssItem[]>;
  vnexpress?: () => Promise<RssItem[]>;
  reuters?: () => Promise<RssItem[]>;
  vneconomy?: () => Promise<RssItem[]>;
  tradingeconomics?: () => Promise<RssItem[]>;
}

/**
 * RAG retriever injection point — same pattern as runImpactChain.ts.
 */
export type RagRetriever = (
  query: string,
  options?: { k?: number },
) => Promise<SearchResult[]>;

/**
 * Options for pollNews.
 *
 * @param limit      - Max items per source to process (default 20)
 * @param fetchers   - Injectable fetcher overrides for testing
 * @param db         - Injectable bun:sqlite Database (defaults to getDb())
 * @param ragRetriever - Injectable RAG retriever (defaults to no-op in production)
 * @param watchlist  - Watchlist entries used for cascade + alert generation
 */
export interface PollNewsOptions {
  limit?: number;
  fetchers?: SourceFetchers;
  db?: Database;
  ragRetriever?: RagRetriever;
  watchlist?: WatchlistEntry[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Insider family buying detector (Task 1260)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Vietnamese keyword patterns for insider / related-party share accumulation.
 *
 * Returns true when an article title contains BOTH:
 *   (a) a family-relation term (con trai, con gái, vợ, chồng, người nhà, thành viên gia đình, etc.)
 *       OR a related-party term (cổ đông lớn, người thân, lãnh đạo)
 *   AND
 *   (b) a buying-action term (gom cổ phiếu, mua gom, tích lũy, mua vào, đăng ký mua)
 *
 * Exported for unit testing.
 */
export function detectInsiderFamilyBuying(title: string): boolean {
  const lower = title.toLowerCase();

  const FAMILY_RELATION_PATTERNS = [
    "con trai",
    "con gái",
    "con gai",
    "vợ ",
    "vo ",
    "chồng ",
    "chong ",
    "người nhà",
    "nguoi nha",
    "thành viên gia đình",
    "thanh vien gia dinh",
    "người thân",
    "nguoi than",
    "anh trai",
    "em trai",
    "anh gái",
    "em gái",
    "bố ",
    "mẹ ",
    "cha ",
    "me ",
  ];

  const BUYING_ACTION_PATTERNS = [
    "gom cổ phiếu",
    "gom co phieu",
    "mua gom",
    "tích lũy cổ phiếu",
    "tich luy co phieu",
    "mua vào",
    "mua vao",
    "đăng ký mua",
    "dang ky mua",
    "mua thêm",
    "mua them",
    "gom thêm",
    "gom them",
  ];

  const hasFamily = FAMILY_RELATION_PATTERNS.some((p) => lower.includes(p));
  const hasBuying = BUYING_ACTION_PATTERNS.some((p) => lower.includes(p));

  return hasFamily && hasBuying;
}

// ─────────────────────────────────────────────────────────────────────────────
// Signal deduplication — prevents N× news_mention spam for the same stock
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Merges duplicate signals that share the same (actionCode, type) pair.
 *
 * For each group:
 *   - Keeps the signal with the highest confidence
 *   - Updates the message to include a count and the top headlines
 *   - Caps severity: a single news_mention cannot exceed "medium" on its own
 *
 * This prevents 30 separate news_mention signals from escalating to CRITICAL
 * in alertGenerator (which treats 3+ signals as CRITICAL).
 */
function deduplicateSignalsByStockAndType(
  signals: import("../../domain/services/signalDetector.js").Signal[],
): import("../../domain/services/signalDetector.js").Signal[] {
  // Group by (actionCode, type)
  const groups = new Map<string, typeof signals>();
  for (const sig of signals) {
    const key = `${sig.actionCode}::${sig.type}`;
    const group = groups.get(key);
    if (group) {
      group.push(sig);
    } else {
      groups.set(key, [sig]);
    }
  }

  // Merge each group into a single signal
  const merged: typeof signals = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      merged.push(group[0]!);
      continue;
    }

    // Sort by confidence descending — keep the best one as base
    group.sort((a, b) => b.confidence - a.confidence);
    const best = group[0]!;

    // Collect unique headlines (from the message field)
    const headlines = group
      .map((s) => s.message)
      .filter((m, i, arr) => arr.indexOf(m) === i)
      .slice(0, 3); // top 3 headlines

    const count = group.length;
    const headlineSummary = headlines.join(" | ");

    merged.push({
      ...best,
      message: `${best.actionCode} mentioned in ${count} articles — ${headlineSummary}`,
      // A batch of news_mention should stay at most "medium" as a single signal.
      // Escalation to high/critical should only happen when combined with
      // price_drop, volume_spike, or report_new signals.
      severity:
        best.type === "news_mention" && best.severity === "high"
          ? "medium"
          : best.severity,
    });
  }

  return merged;
}

// ─────────────────────────────────────────────────────────────────────────────
// Default real fetchers (loaded lazily so tests never trigger network calls)
// ─────────────────────────────────────────────────────────────────────────────

async function defaultCafefFetcher(): Promise<RssItem[]> {
  const { breakers } = await import("../../infrastructure/circuitBreakerRegistry.js");
  const { fetchCafeF } = await import("../../infrastructure/fetchers/cafef.js");
  return breakers.cafef.execute(() => fetchCafeF());
}

async function defaultVnExpressFetcher(): Promise<RssItem[]> {
  const { breakers } = await import("../../infrastructure/circuitBreakerRegistry.js");
  const { fetchVnExpress } = await import("../../infrastructure/fetchers/vnexpress.js");
  return breakers.vnexpress.execute(() => fetchVnExpress());
}

async function defaultReutersFetcher(): Promise<RssItem[]> {
  const { breakers } = await import("../../infrastructure/circuitBreakerRegistry.js");
  const { fetchReuters } = await import("../../infrastructure/fetchers/reuters.js");
  return breakers.reuters.execute(() => fetchReuters());
}

async function defaultVnEconomyFetcher(): Promise<RssItem[]> {
  const { breakers } = await import("../../infrastructure/circuitBreakerRegistry.js");
  const { fetchVnEconomy } = await import("../../infrastructure/fetchers/vneconomy.js");
  return breakers.vneconomy.execute(() => fetchVnEconomy());
}

async function defaultTradingEconomicsFetcher(): Promise<RssItem[]> {
  const { breakers } = await import("../../infrastructure/circuitBreakerRegistry.js");
  const { fetchTradingEconomicsStream } = await import("../../infrastructure/fetchers/tradingEconomicsStream.js");
  return breakers.tradingEconomics.execute(() => fetchTradingEconomicsStream());
}

async function defaultRagRetriever(
  query: string,
  options?: { k?: number },
): Promise<SearchResult[]> {
  try {
    const { searchContext } = await import("../../infrastructure/rag/retriever.js");
    return searchContext(query, options) as Promise<SearchResult[]>;
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DB helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute a short title fingerprint: first 50 characters, lowercase, whitespace-normalised.
 * Used for title-based deduplication to catch identical stories published under
 * slightly different URLs (e.g. pagination parameters, tracking suffixes).
 */
function titleFingerprint(title: string): string {
  return title.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 50);
}

/**
 * Returns true if a similar title (matching the first 50 chars) was already
 * stored in rag_analyses within the past 24 hours.
 * This catches re-published stories that differ only in URL.
 */
function isTitleDuplicate(db: Database, title: string): boolean {
  if (!title || title.trim().length === 0) return false;
  const fp = titleFingerprint(title);
  if (fp.length < 10) return false; // too short to be meaningful

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const row = db
    .prepare(
      `SELECT 1 FROM rag_analyses
       WHERE LOWER(SUBSTR(REPLACE(source_title, '  ', ' '), 1, 50)) = ?
         AND created_at >= ?
       LIMIT 1`,
    )
    .get(fp, cutoff);
  return row != null;
}

/**
 * Attempt to insert one AnalysisEntry into rag_analyses.
 * Uses INSERT OR IGNORE (URL dedup) + title fingerprint dedup (24 h window).
 * Title dedup is only applied when the entry has a non-empty URL — empty-URL
 * items use a different storage path and must remain insertable on every call
 * (they have no URL uniqueness constraint to rely on).
 * Returns true if inserted, false if duplicate.
 */
function tryInsertEntry(
  db: Database,
  entry: ReturnType<typeof normalizeNews>,
): boolean {
  // Title-based dedup: only when entry has a URL (skip for no-URL items to
  // preserve the existing behaviour that empty-URL articles are always inserted)
  if (entry.sourceUrl && isTitleDuplicate(db, entry.sourceTitle)) {
    return false;
  }

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO rag_analyses
      (id, created_at, level, source_url, source_title, source_type,
       published_at, sentiment, impact_score, impact_direction, confidence,
       time_horizon, summary, reasoning, affected_countries, affected_domains,
       affected_actions, parent_ids, tags, embedding_text)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `);

  const result = stmt.run(
    entry.id,
    entry.createdAt,
    entry.level,
    entry.sourceUrl || null,          // NULL for empty URLs (partial index exemption)
    entry.sourceTitle,
    entry.sourceType,
    entry.publishedAt,
    entry.sentiment,
    entry.impactScore,
    entry.impactDirection,
    entry.confidence,
    entry.timeHorizon,
    entry.summary,
    entry.reasoning,
    JSON.stringify(entry.affectedCountries),
    JSON.stringify(entry.affectedDomains),
    JSON.stringify(entry.affectedActions),
    JSON.stringify(entry.parentIds),
    JSON.stringify(entry.tags),
  );

  // bun:sqlite RunResult.changes is 1 when a row was inserted, 0 when ignored
  return result.changes > 0;
}

/**
 * Load the current watchlist from DB as WatchlistEntry[].
 */
function loadWatchlist(db: Database): WatchlistEntry[] {
  const rows = db
    .prepare(`SELECT code as actionCode, domain, exchange FROM watchlist`)
    .all() as WatchlistEntry[];
  return rows;
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

  // Resolve watchlist (injected or loaded from DB)
  const watchlist: WatchlistEntry[] =
    options.watchlist !== undefined ? options.watchlist : loadWatchlist(db);

  // Resolve fetchers
  const fetchers: Required<SourceFetchers> = {
    cafef: options.fetchers?.cafef ?? defaultCafefFetcher,
    vnexpress: options.fetchers?.vnexpress ?? defaultVnExpressFetcher,
    reuters: options.fetchers?.reuters ?? defaultReutersFetcher,
    vneconomy: options.fetchers?.vneconomy ?? defaultVnEconomyFetcher,
    tradingeconomics: options.fetchers?.tradingeconomics ?? defaultTradingEconomicsFetcher,
  };

  // ── Step 1: Fetch all 5 sources in parallel with health tracking ────────
  type SourceResult = { name: string; result: PromiseSettledResult<RssItem[]> };

  const sourceEntries: Array<{ name: string; promise: Promise<RssItem[]> }> = [
    { name: "CafeF RSS", promise: fetchers.cafef() },
    { name: "VnExpress RSS", promise: fetchers.vnexpress() },
    { name: "Reuters RSS", promise: fetchers.reuters() },
    { name: "VnEconomy RSS", promise: fetchers.vneconomy() },
    { name: "Trading Economics", promise: fetchers.tradingeconomics() },
  ];

  const settled = await Promise.allSettled(sourceEntries.map((s) => s.promise));

  const sourceResults: SourceResult[] = sourceEntries.map((s, idx) => ({
    name: s.name,
    result: settled[idx] as PromiseSettledResult<RssItem[]>,
  }));

  const allItems: RssItem[] = [];
  let errors = 0;

  for (const { name, result } of sourceResults) {
    if (result.status === "fulfilled") {
      allItems.push(...result.value.slice(0, limit));
      globalSourceTracker.recordSuccess(name);
    } else {
      errors++;
      const errorMsg = result.reason instanceof Error
        ? result.reason.message
        : String(result.reason);
      globalSourceTracker.recordFailure(name, errorMsg);
      logger.error(`[pollNews] ${name} fetch failed: ${errorMsg.slice(0, 120)}`, {
        source: name,
        error: errorMsg,
      });
    }
  }

  // Surface fulfilled-but-empty sources at DEBUG level. Circuit breaker +
  // sourceHealthTracker already handle real failures; 0 items is common on
  // weekends / off-hours and was drowning real WARNs in the error log.
  for (const { name, result } of sourceResults) {
    if (result.status === "fulfilled" && result.value.length === 0) {
      logger.debug(`[pollNews] ${name} returned 0 items`, { source: name });
    }
  }

  const fetched = allItems.length;

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

  // ── Step 1b: Auto-extract commodity/indicator prices from news text ─────
  // Stores discovered prices in tracked_indicators for σ-based analysis.
  try {
    const { extractAndStoreIndicators } = await import("../../infrastructure/db/commodityTracker.js");
    for (const item of relevantItems) {
      const text = `${item.title} ${item.content}`;
      extractAndStoreIndicators(text, item.source);
    }
  } catch {
    // Best-effort — table may not exist yet
  }

  // ── Step 2–3: Normalize, classify sentiment, and dedup ──────────────────
  // Task 306 slice 1: run sentiment classifier per article BEFORE insertion
  // so the rag_analyses.sentiment column has real bullish/bearish/neutral
  // values (not the normalizer default). This makes get_sentiment_trend
  // queryable per-stock via affected_actions LIKE '%CODE%' + sentiment.
  let inserted = 0;
  let duplicates = 0;
  const newEntries: ReturnType<typeof normalizeNews>[] = [];

  const { classifySentiment: classifySentimentForInsert } = await import(
    "../../domain/services/sentimentClassifier.js"
  );

  for (const item of relevantItems) {
    const entry = normalizeNews(item);
    const cls = classifySentimentForInsert(`${entry.sourceTitle} ${entry.summary}`);
    entry.sentiment = cls.direction; // bullish | bearish | neutral

    // Task 1199: apply tiered impact scoring for Trading Economics articles.
    // The generic normalizer gives all TE articles high scores (8–10) because
    // global macro keywords (inflation, interest rate) saturate the keyword count.
    // Replace with a tier-aware score based on indicator name / VN relevance.
    if ((item.source ?? "").toLowerCase() === "tradingeconomics") {
      entry.impactScore = scoreMacroIndicator(item.title);
    }

    const wasInserted = tryInsertEntry(db, entry);

    if (wasInserted) {
      inserted++;
      newEntries.push(entry);
    } else {
      // Only count as duplicate if the item had a non-empty URL
      // (empty-URL items are always inserted, so they never reach this branch
      //  unless a logic error occurs — count them as duplicates if they do)
      duplicates++;
    }
  }

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
    try {
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
      };
    } catch { /* no macro context */ }

    // Load broadcastMinImpact from config once for the whole batch (default 6)
    let broadcastMinImpact = 6;
    try {
      const { loadMcpConfig } = await import("../../infrastructure/config.js");
      const cfg = loadMcpConfig();
      broadcastMinImpact = cfg.alerts?.marketWideCascadeMinImpact ?? 6;
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
          const titleAndSummary = `${entry.sourceTitle} ${entry.summary}`.toLowerCase();
          const tickerMatch = titleAndSummary.includes(impact.actionCode.toLowerCase());
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
    alerts: totalAlerts,
    errors,
  });

  return {
    fetched,
    inserted,
    duplicates,
    alerts: totalAlerts,
    errors,
  };
}
