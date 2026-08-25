/**
 * Ingest entries — Poll News (FACTORY-APP-split-pollNews, stage 2: dedup/insert)
 *
 * Per VN-relevant RSS item: best-effort extract commodity/indicator prices,
 * normalize into an AnalysisEntry, classify sentiment BEFORE insertion (so
 * rag_analyses.sentiment carries a real value, not the normalizer default),
 * apply Trading-Economics tiered impact scoring, then attempt the SQLite
 * INSERT OR IGNORE (URL + title dedup). Newly-inserted entries are embedded
 * into LanceDB (./ragEmbed.js) and evaluated for the deep-fetch queue
 * (./deepFetchEnqueue.js) — both non-fatal side effects.
 *
 * Split out of pollNews.ts's pollNews() body (previously inline, lines
 * 200-367 of the pre-stage-2 orchestrator).
 *
 * Layer: application/usecases — may import from domain/ and infrastructure/.
 */

import type { Database } from "bun:sqlite";
import type { RssItem } from "../../../infrastructure/fetchers/rss.js";
import type { WatchlistEntry } from "../../../domain/services/cascadeEngine.js";
import type { AnalysisEntry } from "../../../domain/services/newsNormalizer.js";
import { normalizeNews } from "../../../domain/services/newsNormalizer.js";
import { scoreMacroIndicator } from "../../../domain/services/macroIndicatorScorer.js";
import { tryInsertEntry } from "./dbHelpers.js";
import { embedEntryToRag } from "./ragEmbed.js";
import { runDeepFetchGate } from "./deepFetchEnqueue.js";
import type { InsertAnalysisFn } from "./types.js";

export interface IngestEntriesResult {
  inserted: number;
  duplicates: number;
  newEntries: AnalysisEntry[];
}

/**
 * Process one poll cycle's VN-relevant items end to end: commodity-indicator
 * extraction, normalize, sentiment classify, dedup-insert, and (for
 * genuinely new rows only) the RAG embed + deep-fetch-gate side effects.
 *
 * @param items       - VN-relevant RssItems for this cycle (post relevance filter)
 * @param db          - bun:sqlite Database
 * @param watchlist   - Current watchlist (drives deep-fetch gate inputs)
 * @param ragInsertFn - Injectable RAG insert function
 */
export async function ingestEntries(
  items: RssItem[],
  db: Database,
  watchlist: WatchlistEntry[],
  ragInsertFn: InsertAnalysisFn,
): Promise<IngestEntriesResult> {
  // ── Step 1b: Auto-extract commodity/indicator prices from news text ─────
  // Stores discovered prices in tracked_indicators for σ-based analysis.
  try {
    const { extractAndStoreIndicators } = await import("../../../infrastructure/db/commodityTracker.js");
    for (const item of items) {
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
  const newEntries: AnalysisEntry[] = [];

  const { classifySentiment: classifySentimentForInsert } = await import(
    "../../../domain/services/sentimentClassifier.js"
  );

  for (const item of items) {
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
      await embedEntryToRag(entry, item.source, ragInsertFn);

      // DFR-P2-MCP: deep-fetch gate (runs only on newly inserted articles — no re-fetch of duplicates)
      await runDeepFetchGate(db, entry, watchlist);
    } else {
      // Only count as duplicate if the item had a non-empty URL
      // (empty-URL items are always inserted, so they never reach this branch
      //  unless a logic error occurs — count them as duplicates if they do)
      duplicates++;
    }
  }

  return { inserted, duplicates, newEntries };
}
