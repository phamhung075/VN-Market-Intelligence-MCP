/**
 * nuclear-hexagram-computer — Pure Primitive
 *
 * Computes nuclear (hộ quẻ) and transformed (biến quẻ) hexagram numbers.
 *
 *   computeHoQue(signals)   — nuclear hexagram from 6 binary line signals.
 *     Extracts the 4 inner lines (indices 1–4) and constructs a new 6-line
 *     hexagram: [signals[1], signals[2], signals[3], signals[2], signals[3], signals[4]].
 *     Extracted from apps/kinh-dich-service/src/_deprecated/services_v1.ts L283-L285.
 *
 *   computeBienQue(haos)    — transformed hexagram from changing line states.
 *     Flips: LAO_DUONG (old yang) → 0 (yin), LAO_AM (old yin) → 1 (yang).
 *     Stable lines (THIEU_DUONG, THIEU_AM) keep their binary value.
 *     Extracted from apps/kinh-dich-service/src/_deprecated/services_v1.ts L288-L295.
 *
 * Cross-primitive imports (Fence-A exempt — not application/module/infra/interface):
 *   - resolveHexagram from hexagram-resolver (sister primitive)
 *   - HaoReading type from hao-encoder (sister primitive)
 *
 * Zero imports from module, application, interface, or infrastructure layers.
 */

import { resolveHexagram } from '../hexagram-resolver/index.js';
import type { HaoReading } from '../hao-encoder/index.js';

// Re-export the type so callers can import from a single path if needed.
export type { HaoReading };

/**
 * Compute the nuclear hexagram (hộ quẻ) from 6 binary line signals.
 *
 * The nuclear hexagram is formed by extracting the 4 inner lines (positions 2–5,
 * i.e. indices 1–4) of the original hexagram and constructing a new 6-line figure:
 *   lower trigram = signals[1], signals[2], signals[3]
 *   upper trigram = signals[2], signals[3], signals[4]
 *
 * @param signals - Exactly 6 binary values (0 | 1), bottom-to-top order.
 * @returns Hexagram number in range 1–64.
 * @throws Error if signals.length !== 6 or resulting trigram is unknown.
 */
export function computeHoQue(signals: number[]): number {
  if (signals.length !== 6) {
    throw new Error(
      `computeHoQue requires exactly 6 signals, got ${signals.length}`
    );
  }
  // Nuclear hexagram: inner 4 lines → new 6-line figure.
  const hoSignals: number[] = [
    signals[1]!, // lower-1
    signals[2]!, // lower-2
    signals[3]!, // lower-3
    signals[2]!, // upper-1 (overlap with inner lines)
    signals[3]!, // upper-2
    signals[4]!, // upper-3
  ];
  return resolveHexagram(hoSignals);
}

/**
 * Compute the transformed hexagram (biến quẻ) from 6 HaoReading objects.
 *
 * Changing lines are flipped:
 *   LAO_DUONG (old yang, binary=1, isChanging=true) → becomes yin (0)
 *   LAO_AM    (old yin,  binary=0, isChanging=true) → becomes yang (1)
 * Stable lines retain their current binary value.
 *
 * When no lines are changing, the transformed hexagram equals the original (quẻ chính).
 *
 * @param haos - Exactly 6 HaoReading objects (output of encodeHaos).
 * @returns Hexagram number in range 1–64.
 * @throws Error if haos.length !== 6 or resulting trigram is unknown.
 */
export function computeBienQue(haos: HaoReading[]): number {
  if (haos.length !== 6) {
    throw new Error(
      `computeBienQue requires exactly 6 HaoReading objects, got ${haos.length}`
    );
  }
  const transformed: (0 | 1)[] = haos.map((h): 0 | 1 => {
    if (h.state === 'LAO_DUONG') return 0; // old yang flips to yin
    if (h.state === 'LAO_AM')    return 1; // old yin  flips to yang
    return h.binary;                        // stable line: unchanged
  });
  return resolveHexagram(transformed);
}
