// src/domain/services/kinhDich/haoEncoder.ts
// Pure domain service — no I/O, no infrastructure imports.
// Encodes 6 market signal scores (−1 to +1) into Hào states (Lão/Thiếu Dương/Âm).

// ── Types ──────────────────────────────────────────────────────────────────────

export type HaoState = "LAO_DUONG" | "THIEU_DUONG" | "THIEU_AM" | "LAO_AM";

export interface HaoReading {
  /** Hào position 1 (bottom) to 6 (top). */
  position: 1 | 2 | 3 | 4 | 5 | 6;
  /** Vietnamese label describing the domain this hào represents. */
  label: string;
  /** Clamped score in range [−1, +1]. */
  rawScore: number;
  /** Lão/Thiếu classification of this hào. */
  state: HaoState;
  /** Binary value for hexagram lookup: Dương = 1, Âm = 0. */
  binary: 0 | 1;
  /** True when this is a Lão line (reversal imminent — changing line). */
  isChanging: boolean;
}

// ── Thresholds (Phase 1: fixed; Phase 2: adaptive after 90 days) ──────────────

/** Scores strictly above this are Lão Dương (very bullish, changing Yang). */
const LAO_DUONG_THRESHOLD = 0.75;

/** Scores at or above this (and ≤ LAO_DUONG) are Thiếu Dương (mild bullish). */
const THIEU_DUONG_THRESHOLD = 0.10;

/** Scores strictly below this are Lão Âm (very bearish, changing Yin). */
const LAO_AM_THRESHOLD = -0.75;

// Scores in [LAO_AM_THRESHOLD, THIEU_DUONG_THRESHOLD) are Thiếu Âm (mild bearish).

// ── Hào labels (Vietnamese, one per position) ─────────────────────────────────

const HAO_LABELS: Record<number, string> = {
  1: "So hao — Tam ly / Tin tuc",
  2: "Nhi hao — Co ban / BCTC",
  3: "Tam hao — Gia / Ky thuat",
  4: "Tu hao — Dong tien ngoai",
  5: "Ngu hao — Nganh / Sector",
  6: "Thuong hao — Vi mo / Macro",
};

// ── Binary + isChanging lookup ─────────────────────────────────────────────────

const STATE_TO_BINARY: Record<HaoState, 0 | 1> = {
  LAO_DUONG: 1,
  THIEU_DUONG: 1,
  THIEU_AM: 0,
  LAO_AM: 0,
};

const STATE_TO_CHANGING: Record<HaoState, boolean> = {
  LAO_DUONG: true,
  THIEU_DUONG: false,
  THIEU_AM: false,
  LAO_AM: true,
};

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Classify a single normalised score (−1 to +1) into a Hào state.
 *
 * Thresholds (fixed, Phase 1):
 *   score > 0.75              → LAO_DUONG   (Yang, changing)
 *   0.10 ≤ score ≤ 0.75      → THIEU_DUONG (Yang, stable)
 *   −0.75 ≤ score < 0.10     → THIEU_AM    (Yin, stable)
 *   score < −0.75             → LAO_AM      (Yin, changing)
 *
 * Note: input is expected in [−1, +1]; call `encodeHaos` for automatic clamping.
 */
export function classifyHao(score: number): HaoState {
  if (score > LAO_DUONG_THRESHOLD) return "LAO_DUONG";
  if (score >= THIEU_DUONG_THRESHOLD) return "THIEU_DUONG";
  if (score < LAO_AM_THRESHOLD) return "LAO_AM";
  return "THIEU_AM";
}

/**
 * Encode an array of exactly 6 raw scores into 6 `HaoReading` objects.
 *
 * Scores are clamped to [−1, +1] before classification.
 * Position 1 corresponds to `scores[0]` (bottom hào), position 6 to `scores[5]` (top hào).
 *
 * @param scores - Array of exactly 6 numbers; each represents one signal dimension.
 * @throws {Error} if `scores.length !== 6`.
 */
export function encodeHaos(scores: number[]): HaoReading[] {
  if (scores.length !== 6) {
    throw new Error(
      `encodeHaos: expected exactly 6 scores, got ${scores.length}`,
    );
  }

  return scores.map((raw, i): HaoReading => {
    const clamped = Math.max(-1, Math.min(1, raw));
    const state = classifyHao(clamped);
    const position = (i + 1) as 1 | 2 | 3 | 4 | 5 | 6;

    return {
      position,
      label: HAO_LABELS[position] ?? `Hao ${position}`,
      rawScore: clamped,
      state,
      binary: STATE_TO_BINARY[state],
      isChanging: STATE_TO_CHANGING[state],
    };
  });
}

/**
 * Extract the binary line values from a HaoReading array for hexagram lookup.
 *
 * Returns an array of 6 values, each 0 (Âm) or 1 (Dương), in hào order (1→6).
 * The result is directly usable as input to `resolveHexagram`.
 *
 * @param haos - Array of HaoReading (typically produced by `encodeHaos`).
 */
export function haosToSignals(haos: HaoReading[]): number[] {
  return haos.map((h) => h.binary);
}
