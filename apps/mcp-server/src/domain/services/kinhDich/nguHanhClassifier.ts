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
    interpretation = "Cùng hành — tăng cường xu hướng hiện tại";
  } else if (GENERATION[lowerElement] === upperElement) {
    dynamic = "TUONG_SINH";
    score = 0.3;
    interpretation = "Nội lực sinh ngoại lực — xu hướng bền vững";
  } else if (GENERATION[upperElement] === lowerElement) {
    dynamic = "TUONG_SINH";
    score = 0.2;
    interpretation = "Ngoại lực hỗ trợ nội lực — môi trường thuận lợi";
  } else if (DESTRUCTION[lowerElement] === upperElement) {
    dynamic = "TUONG_KHAC";
    score = -0.3;
    interpretation = "Nội lực khắc ngoại lực — mâu thuẫn nội tại";
  } else if (DESTRUCTION[upperElement] === lowerElement) {
    dynamic = "TUONG_KHAC";
    score = -0.3;
    interpretation = "Ngoại lực triệt tiêu nội lực — áp lực bên ngoài";
  } else {
    dynamic = "NEUTRAL";
    score = 0.0;
    interpretation = "Trung tính — không tương tác đặc biệt";
  }

  return { lower: lowerElement, upper: upperElement, dynamic, score, interpretation };
}
