/**
 * Run Impact Chain — Task 062 (Application Layer)
 *
 * Orchestrates the causal cascade pipeline:
 *   1. Normalize raw news text → AnalysisEntry (or use pre-built seedEntry)
 *   2. Fetch RAG context (best-effort, wrapped in try/catch)
 *   3. Call pure domain function buildCausalChain with all inputs
 *
 * This is the async application wrapper around the synchronous domain core.
 * I/O is isolated here — the domain layer (cascadeEngine.ts) stays pure.
 *
 * Layer: application/usecases
 */

import { normalizeNews } from "../../domain/services/newsNormalizer.js";
import { buildCausalChain } from "../../domain/services/cascadeEngine.js";
import type { WatchlistEntry, CausalChain, SearchResult } from "../../domain/services/cascadeEngine.js";
import type { AnalysisEntry } from "../../domain/services/newsNormalizer.js";
import { logger } from "../../infrastructure/logger.js";

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A RAG retriever function that returns historical context entries.
 * Injected by the caller — defaults to the real `searchContext` if omitted.
 *
 * Using a function parameter instead of importing `searchContext` directly
 * allows the application use case to be tested without I/O (mock injection).
 */
export type RagRetriever = (
  query: string,
  options?: { k?: number },
) => Promise<SearchResult[]>;

export interface RunCascadeInput {
  /** Raw news text to normalize (used when seedEntry is not provided) */
  newsText: string;
  /** Pre-normalized seed entry (skips normalizeNews if provided) */
  seedEntry?: AnalysisEntry;
  /** User's watchlist stocks */
  watchlist: WatchlistEntry[];
  /**
   * Optional RAG retriever override.
   * Defaults to the real `searchContext` from infrastructure/rag/retriever.ts.
   * Pass a mock to avoid I/O in tests.
   */
  ragRetriever?: RagRetriever;
}

// ═══════════════════════════════════════════════════════════════════════════
// Main exported function
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Orchestrate the full causal cascade pipeline.
 *
 * Normalizes news, retrieves RAG context (best-effort), then builds a
 * CausalChain tracing global macro events down to watchlist stock impacts.
 *
 * @param input - RunCascadeInput with newsText, optional seedEntry, watchlist, optional RAG retriever
 * @returns     - CausalChain with all levels: seed → domain → action
 */
export async function runImpactChain(input: RunCascadeInput): Promise<CausalChain> {
  // ── Step 1: Resolve seed entry ───────────────────────────────────────────
  let seedEntry: AnalysisEntry;

  if (input.seedEntry) {
    seedEntry = input.seedEntry;
  } else {
    // Normalize raw text as a manual-source RssItem
    seedEntry = normalizeNews({
      title: input.newsText || "Unknown event",
      url: "",
      publishedAt: new Date().toISOString(),
      content: "",
      source: "manual",
    });
  }

  // ── Step 2: Fetch RAG context (best-effort) ──────────────────────────────
  let ragResults: SearchResult[] = [];

  const retriever: RagRetriever = input.ragRetriever ?? defaultRagRetriever;

  try {
    ragResults = await retriever(input.newsText || seedEntry.summary, { k: 3 });
  } catch (err) {
    logger.warn("[runImpactChain] RAG retrieval failed — proceeding without context", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ── Step 3: Build causal chain (pure domain call) ────────────────────────
  return buildCausalChain(seedEntry, input.watchlist, ragResults);
}

// ── Default RAG retriever (real implementation, loaded lazily) ───────────────

/**
 * Lazy-loaded default retriever that uses the real searchContext from infrastructure.
 * Loaded lazily to avoid circular import issues and allow test overrides.
 */
async function defaultRagRetriever(
  query: string,
  options?: { k?: number },
): Promise<SearchResult[]> {
  try {
    // Dynamic import avoids top-level infrastructure import in application layer
    // while still allowing the default path to work in production.
    const { searchContext } = await import("../../infrastructure/rag/retriever.js");
    return searchContext(query, options) as Promise<SearchResult[]>;
  } catch (err) {
    logger.warn("[runImpactChain] defaultRagRetriever failed to load searchContext", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
