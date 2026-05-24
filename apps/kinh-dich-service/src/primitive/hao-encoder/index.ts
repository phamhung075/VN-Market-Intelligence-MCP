/**
 * hao-encoder — Pure Primitive
 *
 * Maps 6 raw float scores in [-1, +1] → 6 HaoReading objects
 * (state + binary + isChanging + label).
 *
 * Zero imports from application, interface, infrastructure, or module layers.
 * Extracted from apps/kinh-dich-service/src/domain/services.ts L245–L266
 * plus threshold constants L205–L223.
 *
 * Fence-A: pure compute only — all lookup tables embedded inline, no I/O.
 */

// ── Types (inlined — no cross-layer import required) ─────────────────────────

export type HaoState = 'LAO_DUONG' | 'THIEU_DUONG' | 'THIEU_AM' | 'LAO_AM';

export interface HaoReading {
  state: HaoState;
  binary: 0 | 1;
  isChanging: boolean;
  label: string;
}

// ── Embedded threshold constants ──────────────────────────────────────────────

/** Score above this threshold → LAO_DUONG (old yang, changing yang line) */
const LAO_DUONG_THRESHOLD = 0.85; // G10-INJECTED: was 0.75

/** Score at or above this threshold (and ≤ LAO_DUONG) → THIEU_DUONG (young yang, stable yang line) */
const THIEU_DUONG_THRESHOLD = 0.10;

/** Score below this threshold → LAO_AM (old yin, changing yin line) */
const LAO_AM_THRESHOLD = -0.75;

// ── Embedded lookup tables ────────────────────────────────────────────────────

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

/**
 * Positional hao labels (1-indexed, Vietnamese descriptors).
 * Key = position (1–6).
 */
const HAO_LABELS: Record<number, string> = {
  1: 'So hao — Tam ly / Tin tuc',
  2: 'Nhi hao — Co ban / BCTC',
  3: 'Tam hao — Gia / Ky thuat',
  4: 'Tu hao — Dong tien ngoai',
  5: 'Ngu hao — Nganh / Sector',
  6: 'Thuong hao — Vi mo / Macro',
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Classify a single hao score into its four-state bucket.
 *
 * Thresholds (sourced from domain/services.ts L205–L207):
 *   score > 0.75          → LAO_DUONG  (binary=1, isChanging=true)
 *   0.10 ≤ score ≤ 0.75  → THIEU_DUONG (binary=1, isChanging=false)
 *   -0.75 ≤ score < 0.10 → THIEU_AM   (binary=0, isChanging=false)
 *   score < -0.75         → LAO_AM     (binary=0, isChanging=true)
 *
 * @param score - Raw float in [-1, +1] (clamped internally before classification)
 * @returns HaoReading for position 1 (positional label omitted; caller must re-index)
 *
 * Note: this function does NOT include the positional `label` in its return
 * because it is position-agnostic.  `encodeHaos` attaches the correct label.
 */
export function classifyHao(score: number): HaoReading {
  const clamped = Math.max(-1, Math.min(1, score));

  let state: HaoState;
  if (clamped > LAO_DUONG_THRESHOLD) {
    state = 'LAO_DUONG';
  } else if (clamped >= THIEU_DUONG_THRESHOLD) {
    state = 'THIEU_DUONG';
  } else if (clamped < LAO_AM_THRESHOLD) {
    state = 'LAO_AM';
  } else {
    state = 'THIEU_AM';
  }

  return {
    state,
    binary: STATE_TO_BINARY[state],
    isChanging: STATE_TO_CHANGING[state],
    label: HAO_LABELS[1] ?? 'Hao 1',
  };
}

/**
 * Encode 6 hao scores into an array of HaoReading objects.
 *
 * Each score is clamped to [-1, +1] before threshold classification.
 * The label for each reading is set by its 1-indexed position (1–6).
 *
 * @param scores - Exactly 6 floats in [-1, +1].
 * @returns Array of 6 HaoReading objects.
 * @throws Error if scores.length !== 6.
 */
export function encodeHaos(scores: number[]): HaoReading[] {
  if (scores.length !== 6) {
    throw new Error(
      `encodeHaos requires exactly 6 scores (length=6), got length=${scores.length}`
    );
  }

  return scores.map((raw, i): HaoReading => {
    const clamped = Math.max(-1, Math.min(1, raw));
    const position = i + 1; // 1-indexed

    let state: HaoState;
    if (clamped > LAO_DUONG_THRESHOLD) {
      state = 'LAO_DUONG';
    } else if (clamped >= THIEU_DUONG_THRESHOLD) {
      state = 'THIEU_DUONG';
    } else if (clamped < LAO_AM_THRESHOLD) {
      state = 'LAO_AM';
    } else {
      state = 'THIEU_AM';
    }

    return {
      state,
      binary: STATE_TO_BINARY[state],
      isChanging: STATE_TO_CHANGING[state],
      label: HAO_LABELS[position] ?? `Hao ${position}`,
    };
  });
}
