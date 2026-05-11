// src/domain/services/kinhDich/nuclearComputer.ts
// Compute Hỗ quẻ (nuclear / hidden hexagram) from 6 original hào lines.
// Pure domain — no I/O imports.

import { resolveHexagram } from "./hexagramResolver.js";

/**
 * Compute Hỗ quẻ (nuclear hexagram) — reveals the hidden dynamics inside
 * the original hexagram.
 *
 * Construction rule (traditional):
 *   - Lower trigram of Hỗ quẻ = hào 2, 3, 4 of the original (signals[1..3])
 *   - Upper trigram of Hỗ quẻ = hào 3, 4, 5 of the original (signals[2..4])
 *
 * Combined into a 6-signal array: [hao2, hao3, hao4, hao3, hao4, hao5]
 * i.e. signals[1], signals[2], signals[3], signals[2], signals[3], signals[4]
 *
 * Index convention (0-based):
 *   hào 1 = hexLines[0], hào 2 = hexLines[1], …, hào 6 = hexLines[5]
 *
 * @param hexLines - 6 binary values (0 or 1) of the original hexagram, hào 1→6
 * @returns Hexagram ID (1-64) of the nuclear hexagram
 * @throws if hexLines.length !== 6
 */
export function computeHoQue(hexLines: number[]): number {
  if (hexLines.length !== 6) {
    throw new Error(`computeHoQue: expected 6 lines, got ${hexLines.length}`);
  }

  // Lower trigram of Hỗ quẻ: positions hào 2, 3, 4 → indexes 1, 2, 3
  const hoLower = [hexLines[1]!, hexLines[2]!, hexLines[3]!];

  // Upper trigram of Hỗ quẻ: positions hào 3, 4, 5 → indexes 2, 3, 4
  const hoUpper = [hexLines[2]!, hexLines[3]!, hexLines[4]!];

  const hoSignals = [...hoLower, ...hoUpper];

  return resolveHexagram(hoSignals);
}
