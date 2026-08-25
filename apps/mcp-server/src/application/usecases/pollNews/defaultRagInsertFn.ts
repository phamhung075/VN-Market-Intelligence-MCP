/**
 * Default RAG insert function — Poll News (FACTORY-APP-split-pollNews,
 * stage 3: orchestrator-shell trim)
 *
 * Task 1840a / G5b (P2-F): default `InsertAnalysisFn` implementation —
 * routes a newly-inserted AnalysisEntry through ragHttpClient's `ragIndex`.
 * DFR-P1-MCP FR-5: passes the new metadata fields (doc_type, depth_tier,
 * source_domain, etc.) through only when present on the entry.
 *
 * Split out of pollNews.ts's pollNews() body (previously the inline
 * `options.ragInsert ?? (async (entry) => {...})` default, pre-stage-3
 * orchestrator).
 *
 * Layer: application/usecases — may import from domain/ and infrastructure/.
 */

import type { InsertAnalysisFn } from "./types.js";

export const defaultRagInsertFn: InsertAnalysisFn = async (entry) => {
  const { ragIndex } = await import("../../../infrastructure/rag/ragHttpClient.js");
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
};
