// src/domain/services/kinhDich/hexagramResolver.ts
// Pre-built lookup tables + resolver functions (ported from kinhdich_engine.py)
// Pure domain — no I/O imports.

import { TRIGRAM_LINES, QUE_META } from "./hexagramLibrary.js";

// ── Lookup tables built once at module load ──────────────────────────────────

/** "b0,b1,b2" → trigram ASCII name */
const LINES_TO_TRIGRAM = new Map<string, string>();
for (const [name, bits] of Object.entries(TRIGRAM_LINES)) {
  LINES_TO_TRIGRAM.set(bits.join(","), name);
}

/** "upper|lower" → que id */
const TRIGRAMS_TO_QUE = new Map<string, number>();
for (const meta of QUE_META) {
  TRIGRAMS_TO_QUE.set(`${meta.upper}|${meta.lower}`, meta.id);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Convert 6 binary signals to a hexagram ID (1-64).
 *
 * signals[0..2] = lower trigram (hào 1-3, short-term / bottom)
 * signals[3..5] = upper trigram (hào 4-6, long-term / top)
 *
 * @throws if signals.length !== 6 or any value is not 0|1
 */
export function resolveHexagram(signals: number[]): number {
  if (signals.length !== 6) {
    throw new Error(`resolveHexagram: expected 6 signals, got ${signals.length}`);
  }
  for (const s of signals) {
    if (s !== 0 && s !== 1) {
      throw new Error(`resolveHexagram: signals must be 0 or 1, got ${s}`);
    }
  }

  const lowerKey = signals.slice(0, 3).join(",");
  const upperKey = signals.slice(3, 6).join(",");

  const lowerName = LINES_TO_TRIGRAM.get(lowerKey);
  const upperName = LINES_TO_TRIGRAM.get(upperKey);

  if (!lowerName || !upperName) {
    throw new Error(
      `resolveHexagram: invalid trigram pattern lower=${lowerKey} upper=${upperKey}`,
    );
  }

  const queId = TRIGRAMS_TO_QUE.get(`${upperName}|${lowerName}`);
  if (queId === undefined) {
    throw new Error(`resolveHexagram: no que for upper=${upperName} lower=${lowerName}`);
  }

  return queId;
}

/**
 * Get the 6-bit line array for a hexagram given its upper/lower trigram ASCII names.
 * Returns [lower0, lower1, lower2, upper0, upper1, upper2].
 *
 * Matches Python: list(TRIGRAM_LINES[lower]) + list(TRIGRAM_LINES[upper])
 */
export function getHexLines(upper: string, lower: string): number[] {
  const lo = TRIGRAM_LINES[lower];
  const up = TRIGRAM_LINES[upper];
  if (!lo) throw new Error(`getHexLines: unknown lower trigram "${lower}"`);
  if (!up) throw new Error(`getHexLines: unknown upper trigram "${upper}"`);
  return [...lo, ...up];
}

/**
 * Compute the biến quẻ (transformed hexagram) when line at linePos (0-indexed) flips.
 *
 * @param hexLines - 6 binary values (from getHexLines or resolveHexagram input)
 * @param linePos  - 0-indexed position (0 = hào 1, 5 = hào 6)
 * @returns hexagram ID (1-64) or null if result is invalid (should not happen with valid input)
 */
export function getBienQue(hexLines: number[], linePos: number): number | null {
  const newLines = [...hexLines];
  newLines[linePos] = 1 - (newLines[linePos] ?? 0);

  const loKey = newLines.slice(0, 3).join(",");
  const upKey = newLines.slice(3, 6).join(",");

  const loName = LINES_TO_TRIGRAM.get(loKey);
  const upName = LINES_TO_TRIGRAM.get(upKey);

  if (!loName || !upName) return null;

  return TRIGRAMS_TO_QUE.get(`${upName}|${loName}`) ?? null;
}

/**
 * Get all 6 biến quẻ for a given hexagram line array.
 * Keys are 1-6 (hào positions).
 */
export function getAllBienQue(hexLines: number[]): Record<number, number | null> {
  const result: Record<number, number | null> = {};
  for (let i = 0; i < 6; i++) {
    result[i + 1] = getBienQue(hexLines, i);
  }
  return result;
}
