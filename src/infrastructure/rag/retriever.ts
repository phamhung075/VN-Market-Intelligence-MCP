/**
 * RAG — Multi-Level Retriever
 *
 * Composes the embedding pipeline (embed) with the LanceDB vector store
 * (searchSimilar, insertVector) to provide a clean domain-facing API
 * for storing and querying analysis entries.
 *
 * Exports:
 *   searchContext(query, options?) — semantic search with optional level/actionCode/k filters
 *   insertAnalysis(entry)         — embed + store a new analysis entry
 */

import { embed } from "./embeddings.js";
import { insertVector, searchSimilar } from "./vectorstore.js";
import { buildEmbeddingText } from "../../domain/services/embeddingTextBuilder.js";
import type { SearchResult } from "./vectorstore.js";

// Re-export SearchResult so callers can type results without importing vectorstore directly
export type { SearchResult } from "./vectorstore.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface SearchOptions {
  /** Filter to a single level: "global" | "country" | "domain" | "action" */
  level?: string;
  /** Filter to entries for a specific stock code, e.g. "VCB" */
  actionCode?: string;
  /** Maximum number of results to return (default: 5) */
  k?: number;
}

export interface AnalysisInput {
  /** Unique identifier for this entry */
  id: string;
  /** Hierarchy level: "global" | "country" | "domain" | "action" */
  level: string;
  /** Short headline / title */
  title: string;
  /** Paragraph-length summary of the analysis */
  summary: string;
  /** Semantic tags for improved retrieval (e.g. ["banking", "credit"]) */
  tags: string[];
  /** Stock ticker if this is an action-level entry (e.g. "VCB") */
  actionCode?: string;
}

// ── Core API ───────────────────────────────────────────────────────────────

/**
 * Semantically search stored analysis entries.
 *
 * Embeds `query` then calls `searchSimilar` with optional level / actionCode filters.
 *
 * @param query   Free-text search query (Vietnamese or English)
 * @param options level, actionCode, k (default k=5)
 * @returns       Array of matching SearchResult sorted by ascending L2 distance
 */
export async function searchContext(
  query: string,
  options: SearchOptions = {},
): Promise<SearchResult[]> {
  const k = options.k ?? 5;
  const queryVector = await embed(query);

  const filters: import("./vectorstore.js").SearchFilters | undefined =
    options.level || options.actionCode
      ? {
          ...(options.level !== undefined ? { level: options.level } : {}),
          ...(options.actionCode !== undefined ? { actionCode: options.actionCode } : {}),
        }
      : undefined;

  return searchSimilar(queryVector, k, filters);
}

/**
 * Embed and persist a new analysis entry.
 *
 * Uses `buildEmbeddingText` to construct a rich text representation of the
 * entry before embedding, maximising semantic retrieval quality.
 *
 * @param entry AnalysisInput (id, level, title, summary, tags, actionCode?)
 */
export async function insertAnalysis(entry: AnalysisInput): Promise<void> {
  const text = buildEmbeddingText({
    title: entry.title,
    summary: entry.summary,
    tags: entry.tags,
    level: entry.level,
    ...(entry.actionCode !== undefined ? { actionCode: entry.actionCode } : {}),
  });

  const vector = await embed(text);

  await insertVector({
    id: entry.id,
    level: entry.level,
    title: entry.title,
    summary: entry.summary,
    vector,
    tags: entry.tags,
    ...(entry.actionCode !== undefined ? { actionCode: entry.actionCode } : {}),
    createdAt: new Date().toISOString(),
  });
}
