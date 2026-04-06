// src/domain/services/kinhDich/nguHanhClassifier.ts
// Ngũ Hành (Five Elements) interaction classifier for lower/upper trigrams.
// Pure domain — no I/O imports.

// ── Types ──────────────────────────────────────────────────────────────────────

/** The five elemental phases of Ngũ Hành (Wu Xing). */
export type NguHanh = "Kim" | "Moc" | "Thuy" | "Hoa" | "Tho";

/** Dynamic relationship between lower and upper trigram elements. */
export type NguHanhDynamic =
  | "TUONG_SINH"  // Mutual generation (lower generates upper, or upper generates lower)
  | "TUONG_KHAC"  // Mutual destruction (one controls/overcomes the other)
  | "SAME"        // Same element — reinforcement
  | "NEUTRAL";    // No special interaction

export interface NguHanhResult {
  lower: NguHanh;
  upper: NguHanh;
  dynamic: NguHanhDynamic;
  /** Score contribution: +0.3 (tuong sinh lower→upper), +0.2 (tuong sinh upper→lower),
   *  -0.3 (tuong khac), +0.1 (same), 0.0 (neutral) */
  score: number;
  /** Vietnamese plain-text interpretation for this interaction. */
  interpretation: string;
}

// ── Elemental cycles ──────────────────────────────────────────────────────────

/**
 * Generation (Tương Sinh / 相生) cycle — "A gives birth to B":
 *   Mộc → Hỏa → Thổ → Kim → Thủy → Mộc
 */
const GENERATION: Record<NguHanh, NguHanh> = {
  Moc: "Hoa",
  Hoa: "Tho",
  Tho: "Kim",
  Kim: "Thuy",
  Thuy: "Moc",
};

/**
 * Destruction (Tương Khắc / 相克) cycle — "A controls B":
 *   Mộc → Thổ → Thủy → Hỏa → Kim → Mộc
 */
const DESTRUCTION: Record<NguHanh, NguHanh> = {
  Moc: "Tho",
  Tho: "Thuy",
  Thuy: "Hoa",
  Hoa: "Kim",
  Kim: "Moc",
};

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Classify the Ngũ Hành interaction between lower and upper trigram elements.
 *
 * Priority order (checked in sequence):
 * 1. Same element       → SAME,       +0.1
 * 2. Lower generates upper (GENERATION[lower] === upper) → TUONG_SINH, +0.3
 * 3. Upper generates lower (GENERATION[upper] === lower) → TUONG_SINH, +0.2
 * 4. Lower destroys upper  (DESTRUCTION[lower] === upper) → TUONG_KHAC, -0.3
 * 5. Upper destroys lower  (DESTRUCTION[upper] === lower) → TUONG_KHAC, -0.3
 * 6. Otherwise             → NEUTRAL,  0.0
 *
 * @param lowerElement - Ngũ Hành element of the lower trigram
 * @param upperElement - Ngũ Hành element of the upper trigram
 */
export function classifyNguHanh(
  lowerElement: NguHanh,
  upperElement: NguHanh,
): NguHanhResult {
  let dynamic: NguHanhDynamic;
  let score: number;
  let interpretation: string;

  if (lowerElement === upperElement) {
    dynamic = "SAME";
    score = 0.1;
    interpretation = "Cung hanh — tang cuong xu huong hien tai";
  } else if (GENERATION[lowerElement] === upperElement) {
    dynamic = "TUONG_SINH";
    score = 0.3;
    interpretation = "Noi luc sinh ngoai luc — xu huong ben vung";
  } else if (GENERATION[upperElement] === lowerElement) {
    dynamic = "TUONG_SINH";
    score = 0.2;
    interpretation = "Ngoai luc ho tro noi luc — moi truong thuan loi";
  } else if (DESTRUCTION[lowerElement] === upperElement) {
    dynamic = "TUONG_KHAC";
    score = -0.3;
    interpretation = "Noi luc khac ngoai luc — mau thuan noi tai";
  } else if (DESTRUCTION[upperElement] === lowerElement) {
    dynamic = "TUONG_KHAC";
    score = -0.3;
    interpretation = "Ngoai luc triet tieu noi luc — ap luc ben ngoai";
  } else {
    dynamic = "NEUTRAL";
    score = 0.0;
    interpretation = "Trung tinh — khong tuong tac dac biet";
  }

  return { lower: lowerElement, upper: upperElement, dynamic, score, interpretation };
}
