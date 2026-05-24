/**
 * RAG — Multi-Level Retriever
 *
 * Composes the embedding pipeline (embed) with the LanceDB vector store
 * (searchSimilar, insertVector) to provide a clean domain-facing API
 * for storing and querying analysis entries.
 *
 * Exports:
 *   searchContext(query, options?)  — semantic search with optional level/actionCode/k/maxDistance filters
 *                                    Results are temporally re-ranked so recent entries rank higher.
 *   insertAnalysis(entry)          — embed + store a new analysis entry
 *   applyTemporalDecay(results, config?) — re-rank by adjusting distance with a decay factor
 *   filterByMaxDistance(results, maxDistance?) — remove results that exceed the distance threshold
 */

import { embed } from "./embeddings.js";
import { insertVector, searchSimilar } from "./vectorstore.js";
import { buildEmbeddingText } from "../../domain/services/embeddingTextBuilder.js";
import type { SearchResult } from "./vectorstore.js";

// Re-export SearchResult from domain (DDD fix — Task 1320)
export type { SearchResult } from "../../domain/models/shared-types.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface SearchOptions {
  /** Filter to a single level: "global" | "country" | "domain" | "action" */
  level?: string;
  /** Filter to entries for a specific stock code, e.g. "VCB" */
  actionCode?: string;
  /** Maximum number of results to return (default: 5) */
  k?: number;
  /**
   * Maximum L2 distance allowed — results beyond this threshold are discarded.
   * Default: 0.8 (configurable via mcp.config.json rag.maxDistance)
   */
  maxDistance?: number;
}

/**
 * Configuration for the temporal decay scoring function.
 *
 * Formula:
 *   ageHours        = (now - createdAt) / 3_600_000
 *   halfLifeHours   = halfLifeDays * 24
 *   decayFactor     = 0.5 ^ (ageHours / halfLifeHours)
 *   adjustedDist    = distance / (decayFactor * maxBoost + (1 - maxBoost))
 *
 * Effect:
 *   - brand-new entry  → denominator ≈ 1 → adjusted ≈ distance (full reduction)
 *   - 1-week-old entry → decayFactor=0.5, denominator=0.85 → +18% distance
 *   - very old entry   → decayFactor≈0,   denominator=0.70 → +43% distance penalty
 */
export interface TemporalDecayConfig {
  /**
   * Time in days for the decay factor to halve.
   * Smaller = more aggressive decay (old entries penalised faster).
   * Default: 7
   */
  halfLifeDays?: number;
  /**
   * Maximum proportional distance reduction for the freshest result.
   * 0.3 = up to 30% distance reduction for brand-new entries.
   * 0   = temporal boosting disabled (distance unchanged).
   * Default: 0.3
   */
  maxBoost?: number;
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

// ── Temporal Decay ─────────────────────────────────────────────────────────

const DEFAULT_HALF_LIFE_DAYS = 7;
const DEFAULT_MAX_BOOST = 0.3;
const DEFAULT_MAX_DISTANCE = 0.8;

/**
 * Re-rank search results so recent entries are preferred over old ones.
 *
 * Each result's `distance` is replaced with an adjusted distance computed via:
 *
 *   ageHours      = (now - createdAt) / 3_600_000
 *   decayFactor   = 0.5 ^ (ageHours / (halfLifeDays * 24))
 *   adjustedDist  = distance / (decayFactor * maxBoost + (1 - maxBoost))
 *
 * Results are then re-sorted ascending by adjustedDistance.
 *
 * @param results Raw SearchResult array from LanceDB
 * @param config  Optional decay parameters (halfLifeDays, maxBoost)
 * @returns       New array sorted by ascending adjusted distance
 */
export function applyTemporalDecay(
  results: SearchResult[],
  config?: TemporalDecayConfig,
): SearchResult[] {
  if (results.length === 0) return [];

  const halfLifeHours = (config?.halfLifeDays ?? DEFAULT_HALF_LIFE_DAYS) * 24;
  const maxBoost = config?.maxBoost ?? DEFAULT_MAX_BOOST;
  const now = Date.now();

  const adjusted = results.map((r) => {
    const ts = Date.parse(r.createdAt);
    // If createdAt is invalid, treat the entry as infinitely old (decay → 0)
    const ageHours = Number.isNaN(ts) ? Infinity : (now - ts) / 3_600_000;
    const decayFactor = Number.isFinite(ageHours)
      ? Math.pow(0.5, ageHours / halfLifeHours)
      : 0;

    const denominator = decayFactor * maxBoost + (1 - maxBoost);
    const adjustedDistance = r.distance / denominator;

    return { ...r, distance: adjustedDistance };
  });

  return adjusted.sort((a, b) => a.distance - b.distance);
}

/**
 * Remove search results whose distance exceeds `maxDistance`.
 *
 * Call this BEFORE `applyTemporalDecay` (or after — order does not matter for
 * filtering, but applying before means decay is only computed for survivors).
 *
 * @param results     SearchResult array
 * @param maxDistance Upper bound (exclusive).  Default: 0.8
 * @returns           Filtered array (original order preserved)
 */
export function filterByMaxDistance(
  results: SearchResult[],
  maxDistance: number = DEFAULT_MAX_DISTANCE,
): SearchResult[] {
  return results.filter((r) => r.distance <= maxDistance);
}

// ── Core API ───────────────────────────────────────────────────────────────

/**
 * Semantically search stored analysis entries.
 *
 * Embeds `query`, calls `searchSimilar`, then:
 *   1. Filters out results with distance > maxDistance (default 0.8)
 *   2. Applies temporal decay so recent entries rank higher
 *
 * @param query   Free-text search query (Vietnamese or English)
 * @param options level, actionCode, k (default k=5), maxDistance (default 0.8)
 * @returns       Array of matching SearchResult sorted by ascending adjusted distance
 */
export async function searchContext(
  query: string,
  options: SearchOptions = {},
): Promise<SearchResult[]> {
  const k = options.k ?? 5;
  const maxDistance = options.maxDistance ?? DEFAULT_MAX_DISTANCE;
  const queryVector = await embed(query);

  const filters: import("./vectorstore.js").SearchFilters | undefined =
    options.level || options.actionCode
      ? {
          ...(options.level !== undefined ? { level: options.level } : {}),
          ...(options.actionCode !== undefined ? { actionCode: options.actionCode } : {}),
        }
      : undefined;

  const raw = await searchSimilar(queryVector, k, filters);
  const withinRange = filterByMaxDistance(raw, maxDistance);
  return applyTemporalDecay(withinRange);
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
