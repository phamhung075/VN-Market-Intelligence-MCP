/**
 * reading_composer — Module Stub
 *
 * Orchestrates the 3 extracted primitives into a KinhDichReading via a
 * 10-step pipeline with MarkovPort dependency injection.
 *
 * Fence-B: imports ONLY from src/primitive/**, src/domain/**, and stdlib.
 * Zero imports from src/application/**, src/interface/**, src/infrastructure/**.
 *
 * Steps 8–10 strategy (Decision 2: Inline delegation):
 *   The reading-scorer and nuclear-hexagram-computer primitives are NOT yet
 *   extracted (Phase 2). Rather than stub hardcoded values, this module calls
 *   domain/services.ts computeReading() for steps 5–10 (ho-que, bien-que,
 *   scoring, majority vote) and then post-processes the confidence using the
 *   MarkovPort data. This avoids duplicating scoring logic while still
 *   demonstrating the port injection pattern. Phase 2 will extract the
 *   scoring helpers into standalone primitives and replace the computeReading()
 *   call here.
 */

import type { KinhDichReading } from '../../domain/models.js';
import { computeReading } from '../../domain/services.js';
import { encodeHaos } from '../../primitive/hao-encoder/index.js';
import { resolveHexagram } from '../../primitive/hexagram-resolver/index.js';
import type { MarkovPort } from './ports.js';

export type { MarkovPort } from './ports.js';
export type { MarkovData } from './ports.js';

/**
 * Dependencies injected into composeReading().
 * The concrete Markov adapter is wired at the composition root (src/index.ts)
 * and must NOT be imported here.
 */
export interface ReadingComposerDependencies {
  markov: MarkovPort;
}

/**
 * Compose a full KinhDich reading for a stock from 6 normalised scores.
 *
 * Pipeline:
 *   Step 1 — Encode haos (hao-encoder primitive)
 *   Step 2 — Extract binary signals from haos
 *   Step 3 — Resolve quẻ chính hexagram number (hexagram-resolver primitive)
 *   Step 4 — Fetch Markov blending data (MarkovPort, injected)
 *   Steps 5–10 — Delegate to domain computeReading() for ho-que, bien-que,
 *                 ngu-hanh, scoring, majority vote, base confidence
 *                 (ngu-hanh-classifier primitive called internally by domain)
 *   Step 11 — Blend confidence with Markov weights (post-processing)
 *
 * @param stockCode - Stock ticker (e.g., "VCB")
 * @param scores    - Exactly 6 normalised floats in [-1, +1]
 * @param deps      - Injected dependencies (MarkovPort)
 * @returns KinhDichReading with all fields populated
 * @throws Error if scores.length !== 6 or hexagram cannot be resolved
 */
export async function composeReading(
  stockCode: string,
  scores: number[],
  deps: ReadingComposerDependencies,
): Promise<KinhDichReading> {
  if (scores.length !== 6) {
    throw new Error(`composeReading: expected exactly 6 scores, got ${scores.length}`);
  }

  // Step 1: Encode haos using extracted primitive
  const haos = encodeHaos(scores);

  // Step 2: Extract binary signals from encoded haos
  const signals = haos.map((h) => h.binary);

  // Step 3: Resolve quẻ chính hexagram number using extracted primitive
  const queChinhNumber = resolveHexagram(signals);

  // Step 4: Fetch Markov blending data via injected port
  const markovBlend = deps.markov.getMarkovData(queChinhNumber);

  // Steps 5–10: Delegate to domain computeReading() which handles:
  //   - ho-que computation (nuclear hexagram)
  //   - bien-que computation (transformed hexagram)
  //   - ngu-hanh-classifier (via internal classifyNguHanh)
  //   - trend scoring + outcome scoring (reading-scorer — not yet extracted)
  //   - majority vote → tradingSignal
  //   - base confidence calculation
  // Fence-B compliant: domain import is permitted at module tier.
  const reading = computeReading(stockCode, scores);

  // Step 11: Blend confidence with Markov weights if available.
  // Formula: blended = base * 0.7 + avg(transitionProb, historicalConfidence) * 0.3
  // This is separate from domain's Markov blend (which uses nextMostLikely/probability)
  // because the module-tier MarkovData carries transition + historical weights.
  if (markovBlend !== null) {
    const markovWeight = (markovBlend.transitionProb + markovBlend.historicalConfidence) / 2;
    const baseConfidence = reading.queChiNh.confidence;
    const blended = Math.round((baseConfidence * 0.7 + markovWeight * 0.3) * 1000) / 1000;

    // Return a new reading with blended confidence (immutable update)
    return {
      ...reading,
      queChiNh: {
        ...reading.queChiNh,
        confidence: blended,
      },
    };
  }

  return reading;
}
