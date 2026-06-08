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
import { detectStocksInText, tickerWholeWordMatch, stripSourceAttributionSuffix } from "../../domain/services/stockAliases.js";
import { generateAlerts } from "../../domain/services/alertGenerator.js";
import { storeAlerts } from "../../infrastructure/db/alertStore.js";
import { getDb } from "../../infrastructure/db/schema.js";
import { logger } from "../../infrastructure/logger.js";
import { currentDataEnv } from "../../infrastructure/envCheck.js";
// eslint-disable-next-line boundaries/dependencies -- FENCE-LEGACY: pre-existing before G4 fence — reviewed: globalSourceTracker is shared state tied to interface layer; refactor to domain/application deferred
import { globalSourceTracker, _resetGlobalSourceTracker } from "../../interface/mcp/tools/news-analysis/sourceHealthTools.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants — Reuters/TE fallback chain (Task 1345a)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reuters VPS push runs hourly. 90 min allows one missed cycle before
 * the newsapi fallback activates. Mirrors REUTERS_STALE_MS in vpsProxyWatchdogJob.ts.
 */
const REUTERS_STALE_MS = 90 * 60 * 1000;

/**
 * VPS news push freshness window. The VPS push pipeline delivers news every ~15 min.
 * If the last push is within 2 hours, the scheduled job returning [] is expected
 * behaviour (fetchers intentionally stubbed — Tasks 1228 + 1843), not an outage.
 * Task 1855a.
 */
const VPS_NEWS_STALE_MS = 2 * 60 * 60 * 1000;

/**
 * Minimum interval between "all sources dark" Telegram bug alerts.
 * One alert per 24-hour window — prevents alert spam during sustained VPS push gaps.
 */
const ALL_DARK_ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** Module-level dedup timer for all-sources-dark alert. */
let _lastAllDarkAlertAt = 0;

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
  _lastAllDarkAlertAt = 0;
  _resetGlobalSourceTracker();
}

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
  // Pre-existing sources (local fetchers + RSS)
  cafef?: () => Promise<RssItem[]>;
  vnexpress?: () => Promise<RssItem[]>;
  reuters?: () => Promise<RssItem[]>;
  vneconomy?: () => Promise<RssItem[]>;
  tradingeconomics?: () => Promise<RssItem[]>;
  /** Task 1799: Trading Economics Vietnam news feed via Chromium scraper. */
  teChromiumNews?: () => Promise<RssItem[]>;
  // VPS-push-only sources (no local fetcher — data arrives via POST /api/push-news)
  vietstock?: () => Promise<RssItem[]>;
  vietnambiz?: () => Promise<RssItem[]>;
  vnbusiness?: () => Promise<RssItem[]>;
  tuoitre?: () => Promise<RssItem[]>;
  nhandan?: () => Promise<RssItem[]>;
  nld?: () => Promise<RssItem[]>;
  // Allow arbitrary future VPS source keys without requiring interface changes
  [key: string]: (() => Promise<RssItem[]>) | undefined;
}

/**
 * RAG retriever injection point — same pattern as runImpactChain.ts.
 */
export type RagRetriever = (
  query: string,
  options?: { k?: number },
) => Promise<SearchResult[]>;

/**
 * Injectable function signature for inserting a news article into LanceDB.
 * Defaults to the real `insertAnalysis` from retriever.ts when not provided.
 * Task 1840a.
 */
// G5b (P2-F): AnalysisInput moved to ragHttpClient.ts (canonical HTTP boundary)
export type InsertAnalysisFn = (entry: import("../../infrastructure/rag/ragHttpClient.js").AnalysisInput) => Promise<void>;

/**
 * Options for pollNews.
 *
 * @param limit              - Max items per source to process (default 20)
 * @param fetchers           - Injectable fetcher overrides for testing
 * @param db                 - Injectable bun:sqlite Database (defaults to getDb())
 * @param ragRetriever       - Injectable RAG retriever (defaults to no-op in production)
 * @param watchlist          - Watchlist entries used for cascade + alert generation
 * @param reutersLastPushTs  - Optional: last known Reuters VPS push timestamp.
 *                             When provided and older than REUTERS_STALE_MS (90 min),
 *                             the newsapi fallback fetcher is activated. Task 1345a.
 * @param onAllSourcesDark   - Optional: callback fired when all sources return 0 items.
 *                             Deduped per 4h window (module-level `_lastAllDarkAlertAt`).
 *                             Defaults to a Telegram bug channel alert. Task 1345a.
 */
export interface PollNewsOptions {
  limit?: number;
  fetchers?: SourceFetchers;
  db?: Database;
  ragRetriever?: RagRetriever;
  watchlist?: WatchlistEntry[];
  /** Last Reuters VPS push timestamp — activates newsapi fallback if stale >90 min. Task 1345a. */
  reutersLastPushTs?: Date | null;
  /**
   * Last timestamp when the VPS push pipeline delivered news items (service = "news").
   * When provided and within VPS_NEWS_STALE_MS (2h), the all-sources-dark alert is
   * suppressed: scheduled fetchers returning [] is expected behaviour because the VPS
   * push pipeline is the primary ingestion path (Tasks 1228 + 1843 intentionally stub
   * all local fetchers). Task 1855a.
   */
  vpsNewsLastPushTs?: Date | null;
  /** All-sources-dark alert callback (injectable for tests). Task 1345a. */
  onAllSourcesDark?: (message: string) => Promise<void>;
  /** Clock override for testing the 4h cooldown boundary. Task 1398. */
  nowMs?: () => number;
  /**
   * Sleep function injectable for tests (default: 2000 ms real sleep).
   * Used by the teChromiumNews 0-item cold-start retry. Task 1821a.
   */
  sleepMs?: (ms: number) => Promise<void>;
  /**
   * Injectable RAG insert function (defaults to real insertAnalysis from retriever.ts).
   * Wrap call is non-fatal — errors are logged but do not abort the poll cycle.
   * Task 1840a.
   */
  ragInsert?: InsertAnalysisFn;
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
// Insider selling detector (Task 1308a)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detects insider / large-shareholder SELLING signals in an article title.
 *
 * Mirrors detectInsiderFamilyBuying() but for sell-side actions. Returns true
 * when the title contains any selling-action keyword associated with insider or
 * large-shareholder disposals.
 *
 * Patterns cover:
 *   Vietnamese: xả hàng, bán ra, thoái vốn, dump (transliterated), bán sạch,
 *               thoái sạch, lãnh đạo bán, nội bộ bán, đăng ký bán
 *   English:    dump, selling, divest, divestiture, offload, sell off
 *
 * Exported for unit testing.
 */
export function detectInsiderSelling(title: string): boolean {
  const lower = title.toLowerCase();

  const SELLING_ACTION_PATTERNS = [
    // Vietnamese
    "xả hàng",
    "bán ra",
    "thoái vốn",
    "bán sạch",
    "thoái sạch",
    "lãnh đạo bán",
    "nội bộ bán",
    "đăng ký bán",
    "bán toàn bộ",
    "bán hết",
    // English
    "dump shares",
    "dumping shares",
    "insider selling",
    "executive selling",
    "ceo selling",
    "director selling",
    "divest",
    "divestiture",
    "offload shares",
    "sell off",
  ];

  return SELLING_ACTION_PATTERNS.some((p) => lower.includes(p));
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

// defaultReutersFetcher removed — reuters.ts deprecated (G5, Phase 1).
// Reuters coverage now via news-fetch microservice (port 5008).
// Sprint 1833g had already disabled this from resolvedFetchers.

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
async function defaultTeChromiumNewsFetcher(): Promise<RssItem[]> {
  const { breakers } = await import("../../infrastructure/circuitBreakerRegistry.js");
  const { fetchTradingEconomicsNews, parseRelativeDate } = await import(
    "../../infrastructure/fetchers/tradingEconomicsChromium.js"
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
async function defaultNewsApiFetcher(): Promise<RssItem[]> {
  try {
    const { breakers } = await import("../../infrastructure/circuitBreakerRegistry.js");
    const { fetchNewsApi } = await import("../../infrastructure/fetchers/newsapi.js");
    const { loadMcpConfig } = await import("../../infrastructure/config.js");
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

async function defaultRagRetriever(
  query: string,
  options?: { k?: number },
): Promise<SearchResult[]> {
  // G5b (P2-F): route through ragHttpClient → rag-service HTTP (port 5002)
  // DFR-P1-MCP FR-4: pass decay_half_life_days for "news" doc_type from config
  try {
    const { ragSearch } = await import("../../infrastructure/rag/ragHttpClient.js");
    const { loadMcpConfig } = await import("../../infrastructure/config.js");
    const cfg = loadMcpConfig();
    const decayHalfLifeDays = cfg.rag?.decayHalfLifeDays?.news ?? 2;
    const response = await ragSearch({
      query,
      decay_half_life_days: decayHalfLifeDays,
      ...(options?.k !== undefined ? { limit: options.k } : {}),
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
  // Guard: createdAt must be a non-empty ISO 8601 string.
  // normalizeNews() always sets this via new Date().toISOString(), but a defensive
  // check prevents silent row drops if a code path ever passes undefined.
  if (!entry.createdAt) {
    logger.warn("[tryInsertEntry] entry.createdAt is missing — substituting current UTC time", {
      entryId: entry.id,
      sourceUrl: entry.sourceUrl,
    });
    entry.createdAt = new Date().toISOString();
  }

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
       affected_actions, parent_ids, tags, embedding_text, data_env)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
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
    currentDataEnv(),
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

  // Known keys — local sources with defaults + named VPS-only sources
  const knownKeys: Record<string, true> = {
    cafef: true, vnexpress: true, reuters: true, vneconomy: true,
    tradingeconomics: true, teChromiumNews: true, vietstock: true, vietnambiz: true,
    vnbusiness: true, tuoitre: true, nhandan: true, nld: true,
    newsapi: true,
  };

  // ── Task 1345a: Reuters fallback chain ───────────────────────────────────
  // If reutersLastPushTs is provided and is stale >90 min, activate the newsapi
  // fallback fetcher so we have international news coverage during VPS downtime.
  const reutersTs = options.reutersLastPushTs ?? null;
  const reutersAgeMs = reutersTs ? Date.now() - reutersTs.getTime() : Infinity;
  const reutersIsStale = reutersAgeMs >= REUTERS_STALE_MS;

  // Resolve fetchers — local sources get defaults; VPS-only sources are
  // injected when provided and skipped during scheduled runs.
  // Unknown future VPS keys are passed through as-is from the caller.
  // Use a Record<string, ...> accumulator to avoid exactOptionalPropertyTypes issues.
  const resolvedFetchers: Record<string, () => Promise<RssItem[]>> = {
    cafef:          options.fetchers?.cafef          ?? defaultCafefFetcher,
    vnexpress:      options.fetchers?.vnexpress      ?? defaultVnExpressFetcher,
    vneconomy:      options.fetchers?.vneconomy      ?? defaultVnEconomyFetcher,
    // Task 1799: TE Vietnam news feed via Chromium scraper (separate source slot)
    teChromiumNews: options.fetchers?.teChromiumNews ?? defaultTeChromiumNewsFetcher,
    // Sprint 1833g: reuters (RSS) and tradingeconomics (legacy stream) are
    // permanently disabled from the default resolved set.
    // They remain in SourceFetchers so callers can inject them for tests or
    // one-off overrides, but they will never fire in scheduled production runs.
    ...(options.fetchers?.reuters !== undefined && { reuters: options.fetchers.reuters }),
    ...(options.fetchers?.tradingeconomics !== undefined && { tradingeconomics: options.fetchers.tradingeconomics }),
  };
  // Task 1345a: add newsapi fetcher when Reuters is stale OR caller explicitly injects it
  if (reutersIsStale || options.fetchers?.newsapi !== undefined) {
    resolvedFetchers["newsapi"] = options.fetchers?.newsapi ?? defaultNewsApiFetcher;
    if (reutersIsStale) {
      logger.info("[pollNews] Reuters VPS push stale — activating newsapi fallback fetcher", {
        reutersAgeMinutes: Math.round(reutersAgeMs / 60_000),
      });
    }
  }
  // VPS-push-only keys: only add if the caller provided them
  const vpsOnlyKeys = ["vietstock", "vietnambiz", "vnbusiness", "tuoitre", "nhandan", "nld"] as const;
  for (const key of vpsOnlyKeys) {
    const fn = options.fetchers?.[key];
    if (fn !== undefined) resolvedFetchers[key] = fn;
  }
  // Propagate any additional unknown future VPS keys injected by the caller
  for (const [k, fn] of Object.entries(options.fetchers ?? {})) {
    if (!(k in knownKeys) && fn !== undefined) {
      resolvedFetchers[k] = fn;
    }
  }

  // ── Task 1821a: teChromiumNews 0-item cold-start retry ──────────────────
  // Playwright cold-launch occasionally returns 0 items on the first call
  // (browser not yet warmed up). Wrap the teChromiumNews fetcher so that
  // a fulfilled-but-empty result triggers a single 2-second sleep + retry.
  // Only teChromiumNews gets this treatment — other sources are unaffected.
  const _realSleep = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));
  const sleep = options.sleepMs ?? _realSleep;

  const TE_CHROMIUM_KEY = "teChromiumNews";
  if (resolvedFetchers[TE_CHROMIUM_KEY] !== undefined) {
    const originalFetcher = resolvedFetchers[TE_CHROMIUM_KEY]!;
    resolvedFetchers[TE_CHROMIUM_KEY] = async (): Promise<RssItem[]> => {
      const firstResult = await originalFetcher();
      if (firstResult.length > 0) return firstResult;
      // Cold-start empty result — wait and retry once
      await sleep(2000);
      return originalFetcher();
    };
  }

  // ── Step 1: Fetch all active sources in parallel with health tracking ───
  type SourceResult = { name: string; result: PromiseSettledResult<RssItem[]> };

  // Build source entries dynamically from all resolved fetchers
  const sourceEntries: Array<{ name: string; promise: Promise<RssItem[]> }> =
    Object.entries(resolvedFetchers).map(([key, fn]) => ({ name: key, promise: fn() }));

  const settled = await Promise.allSettled(sourceEntries.map((s) => s.promise));

  const sourceResults: SourceResult[] = sourceEntries.map((s, idx) => ({
    name: s.name,
    result: settled[idx] as PromiseSettledResult<RssItem[]>,
  }));

  const allItems: RssItem[] = [];
  let errors = 0;

  // Task 1333: translate raw fetcher keys to display names before recording health.
  // These values must exactly match the bucket keys pre-seeded by
  // globalSourceTracker.seedKnownSources() in sourceHealthTools.ts.
  // "tradingeconomics" → "Trading Economics" (no "RSS" suffix) to match seedKnownSources line 54.
  const SOURCE_DISPLAY_NAMES: Record<string, string> = {
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
  const STUB_CAPABLE_KEYS = new Set(["newsapi"]);

  // Lazily resolve newsapi config once per pollNews call — only needed when newsapi
  // is in the active result set. Reads synchronously from the already-loaded mcpConfig
  // singleton to avoid dynamic imports in the hot path.
  let _newsapiConfiguredCache: boolean | null = null;
  function isNewsapiConfigured(): boolean {
    if (_newsapiConfiguredCache !== null) return _newsapiConfiguredCache;
    try {
      // mcpConfig is a module-level singleton (already loaded at startup) — safe to import
      // synchronously by accessing the already-resolved module cache via a direct path.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const configModule = require("../../infrastructure/config.js") as
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

  // ── Task 1832b: Active-source count snapshot (pre-fetch-loop state) ─────
  // Snapshot which sources are expected to be functional BEFORE the health-update
  // loop below calls recordFailure/recordSuccess for this cycle's results.
  // Using pre-loop state ensures a single failed cycle does not immediately
  // remove a source from the active count — it takes DOWN_THRESHOLD (5)
  // consecutive failures before a source is classified as CB-open.
  // This also avoids cross-test state pollution in the full test suite where
  // multiple pollNews calls accumulate recordFailure counts within the same
  // Bun process (the tracker is a globalThis singleton).
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
        // A fulfilled-but-empty result means the fetcher silently swallowed
        // a geo-block or timeout (Reuters/Google News pattern) — recording
        // success in that case produces false-OK in the source health table.
        globalSourceTracker.recordSuccess(displayName);
      } else if (STUB_CAPABLE_KEYS.has(name) && !isNewsapiConfigured()) {
        // Source is explicitly disabled or has no API key — not a failure.
        // Record "disabled" so the health table shows the true reason rather
        // than accumulating consecutive-failure counts (Task fix/fetch-source-issues).
        globalSourceTracker.recordDisabled(displayName);
        logger.debug(`[pollNews] ${name} skipped — disabled or no API key configured`, { source: name });
      } else {
        // Fulfilled with 0 items — record as transient failure in the health
        // tracker (so source health shows "degraded" instead of "OK") but do
        // NOT increment `errors`. The `errors` counter in PollNewsResult
        // represents sources that threw an exception, not empty-result sources.
        // Empty results are normal off-hours behaviour and should not affect
        // the error count returned to callers or logged as failures.
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

  const fetched = allItems.length;

  // ── Task 1345a / 1398: All-sources-dark detection ───────────────────────
  // When every fetcher returned 0 items, send a single Telegram bug alert.
  // Deduped to one alert per 4-hour window. Task 1398 adds a DB-backed guard
  // (via cron_job_runs) that persists the last-sent timestamp across restarts,
  // preventing re-alert floods when the server restarts during a sustained outage.
  // Task 1832b: only fire when at least one source is expected to be functional
  // (activeSourceCount > 0). If all sources are CB-open or disabled, the zero
  // result is expected behaviour — not an outage.
  // Task 1855a: suppress alert when VPS push pipeline recently delivered news.
  // The scheduled job fetchers are intentionally stubbed (Tasks 1228 + 1843) so
  // they always return []. If the VPS push delivered items within VPS_NEWS_STALE_MS
  // (2h), a 0-item scheduled cycle is expected — not a real outage.
  const vpsNewsPushTs = options.vpsNewsLastPushTs ?? null;
  const vpsNewsAgeMs = vpsNewsPushTs
    ? (options.nowMs?.() ?? Date.now()) - vpsNewsPushTs.getTime()
    : Infinity;
  const vpsPushIsHealthy = vpsNewsAgeMs < VPS_NEWS_STALE_MS;

  if (allItems.length === 0 && activeSourceCount > 0 && !vpsPushIsHealthy) {
    const now = options.nowMs?.() ?? Date.now();
    // DB-backed last-sent: read MAX(started_at) for the cooldown key
    const dbRow = (() => {
      try {
        return db.prepare(
          `SELECT MAX(started_at) AS ts FROM cron_job_runs WHERE job_name = 'pollNews_all_sources_dark'`,
        ).get() as { ts: string | null } | undefined;
      } catch (e) {
        logger.warn("[pollNews] cooldown SELECT failed — DB schema drift?", { error: String(e) });
        return undefined;
      }
    })();
    const dbLastMs = dbRow?.ts ? new Date(dbRow.ts).getTime() : 0;
    const lastSentMs = Math.max(_lastAllDarkAlertAt, dbLastMs);
    if (now - lastSentMs >= ALL_DARK_ALERT_COOLDOWN_MS) {
      _lastAllDarkAlertAt = now;
      // Persist send timestamp to DB so cross-restart cooldown is enforced (Task 1398).
      // FIX Task 1793: store `now` (from nowMs injection) not SQLite strftime('now').
      // Using strftime('now') stored the real wall clock, which diverged from the
      // `now` used in the comparison whenever nowMs was injected (tests or future
      // clock overrides). A fake-future nowMs + real-clock DB row meant the stored
      // timestamp looked ancient from the fake clock's perspective → cooldown bypassed.
      const nowIso = new Date(now).toISOString();
      try {
        db.prepare(
          `INSERT INTO cron_job_runs (job_name, started_at, status) VALUES ('pollNews_all_sources_dark', ?, 'success')`,
        ).run(nowIso);
      } catch (e) {
        logger.warn("[pollNews] cooldown INSERT failed — cooldown will not persist across restart", { error: String(e) });
      }
      const darkMsg =
        "[pollNews] All news sources returned 0 items — possible VPS/network outage. " +
        `Sources checked: ${Object.keys(resolvedFetchers).join(", ")} ` +
        `(active: ${activeSourceCount}/${sourceResults.length})`;
      logger.warn(darkMsg);
      try {
        if (options.onAllSourcesDark) {
          await options.onAllSourcesDark(darkMsg);
        } else {
          // Production default: send to Telegram bug channel
          const { sendTelegramBug } = await import("../../infrastructure/notifiers/telegram.js");
          await sendTelegramBug(darkMsg, { parseMode: "" });
        }
      } catch {
        // Best-effort — alert failure must not abort the cycle
      }
    }
  }

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

      // Task 1840a: embed newly inserted article into LanceDB (non-fatal).
      // Awaited so the embed completes within the same async call as the SQLite
      // insert — mirrors the pattern in fetchParseAndStoreBctc.ts (step 4).
      // DFR-P1-MCP FR-5: pass new metadata fields (doc_type, depth_tier, source_domain, etc.)
      try {
        const { randomUUID } = await import("node:crypto");
        const level = entry.affectedActions.length > 0 ? "action" : "domain";
        // First affected action is the primary ticker (uppercase); use for actionCode
        const primaryTickerUpper = entry.affectedActions[0]?.toUpperCase();
        const actionCode = primaryTickerUpper?.toLowerCase();
        const tags = [
          "news",
          (item.source ?? "unknown").toLowerCase(),
          ...entry.affectedActions.map((c) => c.toLowerCase()),
        ];
        // Derive source_domain from article URL — E1: guard parse failure
        let source_domain = "";
        try {
          if (entry.sourceUrl) {
            source_domain = new URL(entry.sourceUrl).hostname;
          }
        } catch { /* malformed URL — use empty string */ }
        // Derive sector from ticker via mcp.config.json market.referenceStocks
        // DFR-P1-MCP FR-5: lookupSectorForTicker — inline pure lookup
        let sector = "";
        if (primaryTickerUpper) {
          try {
            const { loadMcpConfig } = await import("../../infrastructure/config.js");
            const cfg = loadMcpConfig();
            const refStocks = (cfg.market as unknown as Record<string, unknown>)?.referenceStocks as
              Record<string, string[]> | undefined;
            if (refStocks) {
              for (const [sectorName, tickers] of Object.entries(refStocks)) {
                if (Array.isArray(tickers) && tickers.includes(primaryTickerUpper)) {
                  sector = sectorName;
                  break;
                }
              }
            }
          } catch { /* sector lookup best-effort */ }
        }
        await ragInsertFn({
          id: randomUUID(),
          level,
          title: entry.sourceTitle,
          summary: entry.summary,
          tags,
          ...(actionCode !== undefined && { actionCode }),
          // DFR-P1-MCP FR-5: new metadata fields
          doc_type: "news",
          depth_tier: "shallow",
          source_domain,
          published_at: entry.publishedAt ?? "",
          confidence: entry.confidence ?? 0,
          impact_score: entry.impactScore ?? 0,
          ticker: primaryTickerUpper ?? "",
          sector,
        });
      } catch (err) {
        logger.warn("[pollNews] ragInsert failed (non-fatal)", {
          error: err instanceof Error ? err.message : String(err),
          title: entry.sourceTitle?.slice(0, 80),
        });
      }

      // DFR-P2-MCP: deep-fetch gate (runs only on newly inserted articles — no re-fetch of duplicates)
      // Non-fatal: gate failure MUST NOT abort the poll cycle.
      try {
        const { shouldDeepFetch, buildSectorKeywordMap } = await import("../../domain/services/deepFetchGate.js");
        const { enqueueIfNotPresent } = await import("../../infrastructure/db/deepFetchQueueStore.js");

        // Load watchlist tickers for gate (active only)
        const watchlistTickers = watchlist
          .filter((w) => !("active" in w) || (w as { active?: boolean }).active !== false)
          .map((w) => w.actionCode?.toUpperCase() ?? "")
          .filter(Boolean);

        // Build sector keyword map from watchlist entries (pure — no I/O)
        // watchlist entries from DB carry sector via WatchlistEntry shape
        const sectorEntries = watchlist.map((w) => ({
          ticker: w.actionCode?.toUpperCase() ?? "",
          sector: (w as { sector?: string }).sector ?? "",
          active: !("active" in w) || (w as { active?: boolean }).active !== false,
        }));
        const sectorKeywords = buildSectorKeywordMap(sectorEntries);

        const hit = shouldDeepFetch({
          title: entry.sourceTitle ?? "",
          snippet: entry.summary ?? "",
          impactScore: entry.impactScore ?? 0,
          sentiment: entry.sentiment ?? "neutral",
          sourceUrl: entry.sourceUrl ?? "",
          affectedActions: entry.affectedActions,
          watchlistTickers,
          sectorKeywords,
        });

        if (hit && entry.sourceUrl) {
          // Derive source_domain independently (can't access ragInsertFn inner scope)
          let gateSourceDomain = "";
          try {
            gateSourceDomain = new URL(entry.sourceUrl).hostname;
          } catch { /* malformed URL */ }
          const gatePrimaryTicker =
            entry.affectedActions[0]?.toUpperCase() ?? null;
          enqueueIfNotPresent(db, {
            source_url: entry.sourceUrl,
            source_domain: gateSourceDomain,
            rag_id: entry.id ?? "",
            ticker: gatePrimaryTicker,
          });
        }
      } catch (gateErr) {
        logger.warn("[pollNews] deep-fetch gate error (non-fatal)", {
          error: gateErr instanceof Error ? gateErr.message : String(gateErr),
        });
      }
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
        // new risk-off fields (sprint 188, FR-7)
        vix:      commodity.status === "fulfilled" ? commodity.value?.vix      ?? null : null,
        sp500:    commodity.status === "fulfilled" ? commodity.value?.sp500    ?? null : null,
        dxy:      commodity.status === "fulfilled" ? commodity.value?.dxy      ?? null : null,
        hangSeng: commodity.status === "fulfilled" ? commodity.value?.hangSeng ?? null : null,
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
