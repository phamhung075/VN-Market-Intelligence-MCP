/**
 * ngu-hanh-classifier — Pure Primitive
 *
 * Classifies the Ngu Hanh (Five Elements) interaction between lower and upper
 * trigram elements, returning a dynamic relationship, score, and interpretation.
 *
 * Zero imports from application, interface, infrastructure, or module layers.
 * Extracted from apps/kinh-dich-service/src/domain/services.ts L340-L369.
 *
 * Fence-A: pure compute only — lookup tables embedded inline, no I/O.
 */

// ── Types (inlined — no cross-layer import required) ─────────────────────────

export type NguHanh = 'Kim' | 'Moc' | 'Thuy' | 'Hoa' | 'Tho';

export type NguHanhDynamic = 'TUONG_SINH' | 'TUONG_KHAC' | 'SAME' | 'NEUTRAL';

export interface NguHanhResult {
  lower: NguHanh;
  upper: NguHanh;
  dynamic: NguHanhDynamic;
  score: number;
  interpretation: string;
}

// ── Embedded lookup tables ────────────────────────────────────────────────────

/** Five-element generation cycle: each element generates the next */
const GENERATION: Record<NguHanh, NguHanh> = {
  Moc: 'Hoa', Hoa: 'Tho', Tho: 'Kim', Kim: 'Thuy', Thuy: 'Moc',
};

/** Five-element destruction cycle: each element destroys the next */
const DESTRUCTION: Record<NguHanh, NguHanh> = {
  Moc: 'Tho', Tho: 'Thuy', Thuy: 'Hoa', Hoa: 'Kim', Kim: 'Moc',
};

/** Valid NguHanh values for input validation */
const VALID_NGU_HANH = new Set<string>(['Kim', 'Moc', 'Thuy', 'Hoa', 'Tho']);

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Classify the Ngu Hanh interaction between lower and upper trigram elements.
 * Pure function, no I/O.
 *
 * @param lower - Lower trigram element string (e.g., "Thuy", "Moc")
 * @param upper - Upper trigram element string (e.g., "Moc", "Tho")
 * @returns NguHanhResult with dynamic relationship, score, and interpretation
 *
 * Unknown/invalid element strings → NEUTRAL (score 0.0) — documented choice:
 * returning a neutral classification is safer than throwing for downstream
 * pipeline callers that may receive raw, unvalidated market data strings.
 */
export function classifyNguHanh(lower: string, upper: string): NguHanhResult {
  // Coerce to NguHanh if valid, otherwise default to a sentinel value.
  const lowerEl = VALID_NGU_HANH.has(lower) ? (lower as NguHanh) : null;
  const upperEl = VALID_NGU_HANH.has(upper) ? (upper as NguHanh) : null;

  // Unknown input → NEUTRAL (documented choice: no throw)
  if (lowerEl === null || upperEl === null) {
    return {
      lower: (lowerEl ?? 'Tho') as NguHanh,
      upper: (upperEl ?? 'Tho') as NguHanh,
      dynamic: 'NEUTRAL',
      score: 0.0,
      interpretation: 'Phần tử không xác định — trung tính mặc định',
    };
  }

  let dynamic: NguHanhDynamic;
  let score: number;
  let interpretation: string;

  if (lowerEl === upperEl) {
    dynamic = 'SAME'; score = 0.1;
    interpretation = 'Cùng hành — tăng cường xu hướng hiện tại';
  } else if (GENERATION[lowerEl] === upperEl) {
    dynamic = 'TUONG_SINH'; score = 0.3;
    interpretation = 'Nội lực sinh ngoại lực — xu hướng bền vững';
  } else if (GENERATION[upperEl] === lowerEl) {
    dynamic = 'TUONG_SINH'; score = 0.2;
    interpretation = 'Ngoại lực hỗ trợ nội lực — môi trường thuận lợi';
  } else if (DESTRUCTION[lowerEl] === upperEl) {
    dynamic = 'TUONG_KHAC'; score = -0.3;
    interpretation = 'Nội lực khắc ngoại lực — mâu thuẫn nội tại';
  } else if (DESTRUCTION[upperEl] === lowerEl) {
    dynamic = 'TUONG_KHAC'; score = -0.3;
    interpretation = 'Ngoại lực triệt tiêu nội lực — áp lực bên ngoài';
  } else {
    dynamic = 'NEUTRAL'; score = 0.0;
    interpretation = 'Trung tính — không tương tác đặc biệt';
  }

  return { lower: lowerEl, upper: upperEl, dynamic, score, interpretation };
}
