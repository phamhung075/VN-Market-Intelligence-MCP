/**
 * Task 1107 — RAG Recency Weighter (domain service)
 *
 * Applies a linear recency decay to RAG search results so that older entries
 * are penalised relative to newer ones.
 *
 * Formula (REQ_056 Fix C):
 *   recency_weight = max(0.1, 1.0 - (age_days / recency_days) * 0.9)
 *   final_score    = cosine_similarity * recency_weight
 *
 * Where:
 *   age_days     = (now - createdAt) in calendar days
 *   recency_days = caller-supplied window (default: 90)
 *
 * This is a pure domain service — no imports from infrastructure/.
 *
 * @module domain/services/recencyWeighter
 */

import type { SearchResult } from "../../infrastructure/rag/retriever.js";
import { MS_PER_DAY } from "./timeConstants.js";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A SearchResult enriched with recency scoring fields.
 *
 * `similarity`    = 1 - distance (cosine-similarity proxy)
 * `recencyWeight` = linear decay factor in [0.1, 1.0]
 * `finalScore`    = similarity * recencyWeight (ranking key, DESC)
 */
export interface ScoredResult extends SearchResult {
  /** Cosine-similarity proxy (1 - L2 distance). Populated by applyRecencyWeighting. */
  similarity: number;
  /** Linear recency decay factor in [0.1, 1.0]. */
  recencyWeight: number;
  /** Final ranking score = similarity * recencyWeight. */
  finalScore: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_RECENCY_DAYS = 90;

// ─── Core functions ───────────────────────────────────────────────────────────

/**
 * Compute the linear recency decay weight for a single result.
 *
 * @param ageDays      Age of the result in calendar days (≥ 0)
 * @param recencyDays  Recency window in days (default: 90)
 * @returns            Decay weight in [0.1, 1.0]
 */
export function computeRecencyWeight(
  ageDays: number,
  recencyDays: number = DEFAULT_RECENCY_DAYS,
): number {
  const raw = 1.0 - (ageDays / recencyDays) * 0.9;
  return Math.max(0.1, raw);
}

/**
 * Apply recency weighting to a list of SearchResults, re-sorting by
 * `finalScore` DESC (highest first).
 *
 * Each result receives three new fields:
 *   - `similarity`    = 1 - distance  (cosine-similarity proxy)
 *   - `recencyWeight` = linear decay factor from computeRecencyWeight
 *   - `finalScore`    = similarity * recencyWeight
 *
 * @param results      Raw SearchResult array from LanceDB / searchContext
 * @param recencyDays  Recency window in days (default: 90)
 * @param now          Reference timestamp in ms (default: Date.now(); override for tests)
 * @returns            New array of ScoredResult sorted by finalScore DESC
 */
export function applyRecencyWeighting(
  results: SearchResult[],
  recencyDays: number = DEFAULT_RECENCY_DAYS,
  now: number = Date.now(),
): ScoredResult[] {
  if (results.length === 0) return [];

  const scored: ScoredResult[] = results.map((r) => {
    const ts = Date.parse(r.createdAt);
    // If createdAt is unparseable, treat as infinitely old → weight = 0.1
    const ageDays = Number.isNaN(ts)
      ? Infinity
      : Math.max(0, (now - ts) / MS_PER_DAY);

    const recencyWeight = computeRecencyWeight(ageDays, recencyDays);
    const similarity = 1 - r.distance;
    const finalScore = similarity * recencyWeight;

    return { ...r, similarity, recencyWeight, finalScore };
  });

  return scored.sort((a, b) => b.finalScore - a.finalScore);
}
