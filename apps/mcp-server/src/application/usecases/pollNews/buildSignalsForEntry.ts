/**
 * Build signals for entry — Poll News (FACTORY-APP-split-pollNews, stage 3:
 * cascade/alert-generation)
 *
 * Per newly-inserted entry: build the causal chain (with pre-fetched macro
 * context — fast, no HTTP per entry), load the news_mention gate config,
 * pre-compute sentiment once (not per impact — perf fix), then delegate to
 * ./cascadeImpactSignals.js and ./tradeRelationshipSignals.js to push
 * signals into the batch-level `allSignals`/`stockSignalCount` accumulators
 * (mutated by reference, shared across the whole newEntries loop — NOT
 * reset per entry, matching the pre-split behaviour).
 *
 * Errors anywhere in chain-building or the cascade-impact loop are caught
 * here and logged — one failing entry must never abort the rest of the
 * batch. The trade-relationship call already swallows its own errors
 * internally (see tradeRelationshipSignals.ts) and is not re-wrapped.
 *
 * Split out of pollNews.ts's pollNews() body (previously inline, lines
 * 267-411 of the pre-stage-3 orchestrator).
 *
 * Layer: application/usecases — may import from domain/ and infrastructure/.
 */

import type { AnalysisEntry } from "../../../domain/services/newsNormalizer.js";
import type { WatchlistEntry, SearchResult, CausalChain, MacroContext } from "../../../domain/services/cascadeEngine.js";
import { buildCausalChain } from "../../../domain/services/cascadeEngine.js";
import type { MacroStats } from "../../../domain/services/macroThresholds.js";
import type { Signal } from "../../../domain/services/signalDetector.js";
import type { NewsMentionConfig } from "../../../infrastructure/config.js";
import { logger } from "../../../infrastructure/logger.js";
import type { RagRetriever } from "./types.js";
import { pushCascadeImpactSignals } from "./cascadeImpactSignals.js";
import { pushTradeRelationshipSignals } from "./tradeRelationshipSignals.js";

const DEFAULT_NEWS_MENTION_CONFIG: NewsMentionConfig = {
  maxAgeMinutes: 240,
  requireNonNeutralSentiment: true,
  minSentimentConfidence: 0.5,
  minCascadeConfidence: 0.85,
  highTrustSources: ["cafef", "vnexpress", "vneconomy"],
};

export interface BuildSignalsForEntryParams {
  entry: AnalysisEntry;
  watchlist: WatchlistEntry[];
  macroContext: MacroContext | null;
  macroStats: MacroStats[];
  broadcastMinImpact: number;
  retriever: RagRetriever;
  /** Mutated in place — same array accumulated across the whole batch. */
  allSignals: Signal[];
  /** Mutated in place — same map accumulated across the whole batch. */
  stockSignalCount: Map<string, number>;
}

export async function buildSignalsForEntry(params: BuildSignalsForEntryParams): Promise<void> {
  const { entry, watchlist, macroContext, macroStats, broadcastMinImpact, retriever, allSignals, stockSignalCount } = params;
  try {
    let chain: CausalChain;

    // Use buildCausalChain directly with pre-fetched macro data (fast, no HTTP per entry)
    let ragResults: SearchResult[] = [];
    try {
      ragResults = await retriever(entry.summary, { k: 3 });
    } catch { /* silent */ }
    chain = buildCausalChain(entry, watchlist, ragResults, macroContext, macroStats, broadcastMinImpact);

    // Convert watchlist impacts into news_mention signals
    // Relevance gate (task 152): filter noise before creating signals
    // Read gate config from mcp.config.json (with sensible defaults)
    let nmCfg = DEFAULT_NEWS_MENTION_CONFIG;
    try {
      const { loadMcpConfig } = await import("../../../infrastructure/config.js");
      const cfg = loadMcpConfig();
      nmCfg = cfg.alerts.newsMention;
    } catch { /* use defaults */ }

    // Pre-compute sentiment once per entry (not per impact — perf fix)
    const { classifySentiment: classify } = await import("../../../domain/services/sentimentClassifier.js");
    const entrySentiment = classify(`${entry.sourceTitle} ${entry.summary}`);

    pushCascadeImpactSignals({ entry, chain, nmCfg, entrySentiment, allSignals, stockSignalCount });

    // ── Trade relationship analysis — country-to-stock impact ──────────
    // Goes beyond sector rules: "Middle East peace" → VNM (8% export Iraq)
    await pushTradeRelationshipSignals({ entry, watchlist, nmCfg, entrySentiment, allSignals });
  } catch (err) {
    logger.error("[pollNews] cascade failed for entry", {
      entryId: entry.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
