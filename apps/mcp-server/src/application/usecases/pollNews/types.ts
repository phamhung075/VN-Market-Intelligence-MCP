/**
 * Poll News — Types (Task 102 / FACTORY-APP-split-pollNews)
 * size-justification: 140L — 5 interlocking public interfaces/types
 * (PollNewsResult, SourceFetchers, RagRetriever, InsertAnalysisFn,
 * PollNewsOptions) carrying substantial per-field JSDoc kept verbatim from
 * the pre-split god-file for zero doc-fidelity loss; splitting further would
 * fragment one cohesive public contract across files.
 *
 * Public types for the pollNews use case: the result summary shape,
 * injectable fetcher/retriever/insert function signatures, and the
 * top-level options bag accepted by pollNews().
 *
 * Split out of pollNews.ts (FACTORY-APP-split-pollNews, staged god-file
 * split) so callers/tests can import types without pulling in the full
 * orchestrator implementation. Re-exported from pollNews.ts unchanged —
 * every existing `from ".../pollNews.js"` import keeps working.
 *
 * Layer: application/usecases — may import from domain/ and infrastructure/.
 */

import type { Database } from "bun:sqlite";
import type { RssItem } from "../../../infrastructure/fetchers/rss.js";
import type { WatchlistEntry } from "../../../domain/services/cascadeEngine.js";
import type { SearchResult } from "../../../domain/services/cascadeEngine.js";

export interface PollNewsResult {
  /** Total RSS items fetched across all sources */
  fetched: number;
  /** New AnalysisEntry rows stored in rag_analyses */
  inserted: number;
  /** Items skipped because source_url already exists */
  duplicates: number;
  /**
   * Items discarded by the VN-relevance pre-filter (Task 1247, isVnRelevant)
   * BEFORE they ever reached the dedup/insert loop. Counter-conservation
   * identity: `fetched === inserted + duplicates + irrelevant` always holds
   * (FIX-POLLNEWS-COUNTER-CONSERVATION, 2026-07-28) — surfaced as a
   * first-class field so "fetched - duplicates - inserted" never looks like
   * an unaccounted silent drop from the logged/returned counters alone.
   * Optional in the type (not optional at runtime — the real `pollNews()`
   * always sets it) so pre-existing test doubles that construct a literal
   * PollNewsResult without this field stay source-compatible.
   */
  irrelevant?: number;
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
export type InsertAnalysisFn = (entry: import("../../../infrastructure/rag/ragHttpClient.js").AnalysisInput) => Promise<void>;

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
