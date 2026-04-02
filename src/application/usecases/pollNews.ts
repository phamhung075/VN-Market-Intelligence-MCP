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
import { buildCausalChain } from "../../domain/services/cascadeEngine.js";
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
// Default real fetchers (loaded lazily so tests never trigger network calls)
// ─────────────────────────────────────────────────────────────────────────────

async function defaultCafefFetcher(): Promise<RssItem[]> {
  const { fetchCafeF } = await import("../../infrastructure/fetchers/cafef.js");
  return fetchCafeF();
}

async function defaultVnExpressFetcher(): Promise<RssItem[]> {
  const { fetchVnExpress } = await import("../../infrastructure/fetchers/vnexpress.js");
  return fetchVnExpress();
}

async function defaultReutersFetcher(): Promise<RssItem[]> {
  const { fetchReuters } = await import("../../infrastructure/fetchers/reuters.js");
  return fetchReuters();
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
 * Attempt to insert one AnalysisEntry into rag_analyses.
 * Uses INSERT OR IGNORE — returns true if inserted, false if duplicate.
 */
function tryInsertEntry(
  db: Database,
  entry: ReturnType<typeof normalizeNews>,
): boolean {
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
  };

  // ── Step 1: Fetch all 3 sources in parallel ──────────────────────────────
  type SourceResult = { name: string; result: PromiseSettledResult<RssItem[]> };

  const sourceEntries: Array<{ name: string; promise: Promise<RssItem[]> }> = [
    { name: "CafeF RSS", promise: fetchers.cafef() },
    { name: "VnExpress RSS", promise: fetchers.vnexpress() },
    { name: "Reuters RSS", promise: fetchers.reuters() },
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
      logger.error("[pollNews] source fetch failed", {
        source: name,
        error: errorMsg,
      });
    }
  }

  const fetched = allItems.length;

  // ── Step 2–3: Normalize and dedup ────────────────────────────────────────
  let inserted = 0;
  let duplicates = 0;
  const newEntries: ReturnType<typeof normalizeNews>[] = [];

  for (const item of allItems) {
    const entry = normalizeNews(item);
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

    for (const entry of newEntries) {
      try {
        // Fetch RAG context (best-effort)
        let ragResults: SearchResult[] = [];
        try {
          ragResults = await retriever(entry.summary, { k: 3 });
        } catch (ragErr) {
          logger.warn("[pollNews] RAG retrieval failed — proceeding without context", {
            error: ragErr instanceof Error ? ragErr.message : String(ragErr),
          });
        }

        // Build causal chain (pure domain)
        const chain = buildCausalChain(entry, watchlist, ragResults);

        // Convert watchlist impacts into news_mention signals
        for (const impact of chain.watchlistImpacts) {
          if (impact.confidence > 0) {
            allSignals.push({
              type: "news_mention",
              severity: impact.confidence >= 0.8 ? "high" : impact.confidence >= 0.6 ? "medium" : "low",
              actionCode: impact.actionCode,
              message: `${entry.sourceTitle} — ${impact.reasoning}`,
              confidence: impact.confidence,
              detectedAt: entry.createdAt,
            });
          }
        }
      } catch (err) {
        logger.error("[pollNews] cascade failed for entry", {
          entryId: entry.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Generate alerts from collected signals
    if (allSignals.length > 0) {
      const alerts = generateAlerts(allSignals, watchlist);
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
