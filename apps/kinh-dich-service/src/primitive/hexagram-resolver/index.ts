/**
 * hexagram-resolver — Pure Primitive
 *
 * Maps 6 binary line signals → hexagram number (quẻ chính) via two table lookups:
 *   TRIGRAM_LINES : trigram name → [b0, b1, b2]
 *   TRIGRAMS_TO_QUE : "upper|lower" → hexagram id (1–64)
 *
 * Zero imports from application, interface, infrastructure, or module layers.
 * Extracted from apps/kinh-dich-service/src/domain/services.ts L272-L281.
 *
 * R-FENCE: this file is the Phase 2 G4 deliberate-violation target.
 * Phase 2 G4 will inject:
 *   import type { ReadingRequest } from '../../application/dtos.js'
 * and verify bunx eslint catches the Fence-A violation (non-zero exit).
 */

// ── Embedded lookup tables ────────────────────────────────────────────────────

/** Trigram binary line patterns: name → [b0, b1, b2] */
const TRIGRAM_LINES: Record<string, [number, number, number]> = {
  Qian: [1, 1, 1],
  Dui:  [1, 1, 0],
  Li:   [1, 0, 1],
  Zhen: [1, 0, 0],
  Xun:  [0, 1, 1],
  Kan:  [0, 1, 0],
  Gen:  [0, 0, 1],
  Kun:  [0, 0, 0],
};

/** Hexagram metadata used to build the trigram-pair → hexagram-id map */
interface QueMeta { id: number; upper: string; lower: string }

const QUE_META: QueMeta[] = [
  { id:  1, upper: 'Qian', lower: 'Qian' },
  { id:  2, upper: 'Kun',  lower: 'Kun'  },
  { id:  3, upper: 'Kan',  lower: 'Zhen' },
  { id:  4, upper: 'Gen',  lower: 'Kan'  },
  { id:  5, upper: 'Kan',  lower: 'Qian' },
  { id:  6, upper: 'Qian', lower: 'Kan'  },
  { id:  7, upper: 'Kun',  lower: 'Kan'  },
  { id:  8, upper: 'Kan',  lower: 'Kun'  },
  { id:  9, upper: 'Xun',  lower: 'Qian' },
  { id: 10, upper: 'Qian', lower: 'Dui'  },
  { id: 11, upper: 'Kun',  lower: 'Qian' },
  { id: 12, upper: 'Qian', lower: 'Kun'  },
  { id: 13, upper: 'Qian', lower: 'Li'   },
  { id: 14, upper: 'Li',   lower: 'Qian' },
  { id: 15, upper: 'Kun',  lower: 'Gen'  },
  { id: 16, upper: 'Zhen', lower: 'Kun'  },
  { id: 17, upper: 'Dui',  lower: 'Zhen' },
  { id: 18, upper: 'Gen',  lower: 'Xun'  },
  { id: 19, upper: 'Kun',  lower: 'Dui'  },
  { id: 20, upper: 'Xun',  lower: 'Kun'  },
  { id: 21, upper: 'Li',   lower: 'Zhen' },
  { id: 22, upper: 'Gen',  lower: 'Li'   },
  { id: 23, upper: 'Gen',  lower: 'Kun'  },
  { id: 24, upper: 'Kun',  lower: 'Zhen' },
  { id: 25, upper: 'Qian', lower: 'Zhen' },
  { id: 26, upper: 'Gen',  lower: 'Qian' },
  { id: 27, upper: 'Gen',  lower: 'Zhen' },
  { id: 28, upper: 'Dui',  lower: 'Xun'  },
  { id: 29, upper: 'Kan',  lower: 'Kan'  },
  { id: 30, upper: 'Li',   lower: 'Li'   },
  { id: 31, upper: 'Dui',  lower: 'Gen'  },
  { id: 32, upper: 'Zhen', lower: 'Xun'  },
  { id: 33, upper: 'Qian', lower: 'Gen'  },
  { id: 34, upper: 'Zhen', lower: 'Qian' },
  { id: 35, upper: 'Li',   lower: 'Kun'  },
  { id: 36, upper: 'Kun',  lower: 'Li'   },
  { id: 37, upper: 'Xun',  lower: 'Li'   },
  { id: 38, upper: 'Li',   lower: 'Dui'  },
  { id: 39, upper: 'Kan',  lower: 'Gen'  },
  { id: 40, upper: 'Zhen', lower: 'Kan'  },
  { id: 41, upper: 'Gen',  lower: 'Dui'  },
  { id: 42, upper: 'Xun',  lower: 'Zhen' },
  { id: 43, upper: 'Dui',  lower: 'Qian' },
  { id: 44, upper: 'Qian', lower: 'Xun'  },
  { id: 45, upper: 'Dui',  lower: 'Kun'  },
  { id: 46, upper: 'Kun',  lower: 'Xun'  },
  { id: 47, upper: 'Dui',  lower: 'Kan'  },
  { id: 48, upper: 'Kan',  lower: 'Xun'  },
  { id: 49, upper: 'Dui',  lower: 'Li'   },
  { id: 50, upper: 'Li',   lower: 'Xun'  },
  { id: 51, upper: 'Zhen', lower: 'Zhen' },
  { id: 52, upper: 'Gen',  lower: 'Gen'  },
  { id: 53, upper: 'Xun',  lower: 'Gen'  },
  { id: 54, upper: 'Zhen', lower: 'Dui'  },
  { id: 55, upper: 'Zhen', lower: 'Li'   },
  { id: 56, upper: 'Li',   lower: 'Gen'  },
  { id: 57, upper: 'Xun',  lower: 'Xun'  },
  { id: 58, upper: 'Dui',  lower: 'Dui'  },
  { id: 59, upper: 'Xun',  lower: 'Kan'  },
  { id: 60, upper: 'Kan',  lower: 'Dui'  },
  { id: 61, upper: 'Xun',  lower: 'Dui'  },
  { id: 62, upper: 'Zhen', lower: 'Gen'  },
  { id: 63, upper: 'Kan',  lower: 'Li'   },
  { id: 64, upper: 'Li',   lower: 'Kan'  },
];

// ── Build runtime lookup maps (once at module load) ───────────────────────────

const LINES_TO_TRIGRAM = new Map<string, string>();
for (const [name, bits] of Object.entries(TRIGRAM_LINES)) {
  LINES_TO_TRIGRAM.set(bits.join(','), name);
}

const TRIGRAMS_TO_QUE = new Map<string, number>();
for (const meta of QUE_META) {
  TRIGRAMS_TO_QUE.set(`${meta.upper}|${meta.lower}`, meta.id);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Resolve a hexagram number from 6 binary line signals.
 *
 * @param signals - 6-element array of binary values (0 | 1).
 *                  signals[0..2] = lower trigram (bottom 3 lines)
 *                  signals[3..5] = upper trigram (top 3 lines)
 * @returns hexagram number in range 1–64
 * @throws Error if input length !== 6 or trigram pattern is unknown
 */
export function resolveHexagram(signals: number[]): number {
  if (signals.length !== 6) {
    throw new Error(`resolveHexagram requires exactly 6 signals, got ${signals.length}`);
  }
  const lowerKey = signals.slice(0, 3).join(',');
  const upperKey = signals.slice(3, 6).join(',');
  const lowerName = LINES_TO_TRIGRAM.get(lowerKey);
  const upperName = LINES_TO_TRIGRAM.get(upperKey);
  if (!lowerName || !upperName) {
    throw new Error(`Unknown trigram pattern lower=${lowerKey} upper=${upperKey}`);
  }
  const queId = TRIGRAMS_TO_QUE.get(`${upperName}|${lowerName}`);
  if (queId === undefined) {
    throw new Error(`Unknown trigram pattern upper=${upperName} lower=${lowerName}`);
  }
  return queId;
}
