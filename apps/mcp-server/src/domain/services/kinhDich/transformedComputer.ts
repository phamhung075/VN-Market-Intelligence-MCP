// src/domain/services/kinhDich/transformedComputer.ts
// Compute Biến quẻ (transformed hexagram) by flipping Lão lines.
// Pure domain — no I/O imports.

import { resolveHexagram } from "./hexagramResolver.js";
import type { HaoReading } from "./haoEncoder.js";

/**
 * Compute Biến quẻ (transformed hexagram) from a set of Hào readings.
 *
 * Transformation rule (traditional I Ching):
 *   - LAO_DUONG (extreme Yang, changing) → flips to Yin (binary 0)
 *   - LAO_AM    (extreme Yin, changing)  → flips to Yang (binary 1)
 *   - THIEU_DUONG (stable Yang)          → stays Yang (binary 1)
 *   - THIEU_AM  (stable Yin)             → stays Yin  (binary 0)
 *
 * If there are NO changing (Lão) lines, the Biến quẻ is identical to the
 * original hexagram.
 *
 * @param haos - Array of 6 HaoReading values (from encodeHaos)
 * @returns Hexagram ID (1-64) of the transformed hexagram
 * @throws if haos.length !== 6
 */
export function computeBienQue(haos: HaoReading[]): number {
  if (haos.length !== 6) {
    throw new Error(`computeBienQue: expected 6 haos, got ${haos.length}`);
  }

  const transformed = haos.map((h): 0 | 1 => {
    if (h.state === "LAO_DUONG") return 0; // Yang exhausted → becomes Yin
    if (h.state === "LAO_AM") return 1;    // Yin exhausted → becomes Yang
    return h.binary;                        // Stable lines unchanged
  });

  return resolveHexagram(transformed);
}

/**
 * Get the 1-based positions of all changing (Lão) lines.
 *
 * LAO_DUONG and LAO_AM are both considered changing lines.
 *
 * @param haos - Array of 6 HaoReading values
 * @returns Array of positions (1-6) that are changing; empty if none
 */
export function getChangingLines(haos: HaoReading[]): number[] {
  return haos.filter((h) => h.isChanging).map((h) => h.position);
}
