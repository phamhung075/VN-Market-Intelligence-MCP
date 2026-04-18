// src/domain/services/kinhDich/kinhDichReading.ts
// Orchestrator: combines all Kinh Dịch domain services into one complete reading.
// Pure domain — NO I/O imports.

import { encodeHaos, haosToSignals, type HaoReading } from "./haoEncoder.js";
import { resolveHexagram } from "./hexagramResolver.js";
import { computeHoQue } from "./nuclearComputer.js";
import { computeBienQue, getChangingLines } from "./transformedComputer.js";
import {
  classifyNguHanh,
  type NguHanhResult,
  type NguHanh,
} from "./nguHanhClassifier.js";
import { QUE_META, QUE_DATA, TRIGRAMS } from "./hexagramLibrary.js";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface KinhDichReading {
  stockCode: string;
  /** ISO-8601 timestamp of when the reading was computed. */
  timestamp: string;
  haos: HaoReading[];
  lowerTrigram: { name: string; element: NguHanh; symbol: string };
  upperTrigram: { name: string; element: NguHanh; symbol: string };
  queChiNh: {
    number: number;
    name: string;
    chinese: string;
    coreMeaning: string;
    trend: string;
    tradingSignal: string;
    confidence: number;
  };
  hoQue: { number: number; name: string; chinese: string; coreMeaning: string };
  bienQue: { number: number; name: string; chinese: string; coreMeaning: string };
  nguHanh: NguHanhResult;
  changingLines: number[];
  markov: {
    nextMostLikely: number;
    nextName: string;
    probability: number;
  } | null;
  /** Vietnamese trading recommendation: MUA / BAN / GIU / CHO / THAN TRONG */
  actionNote: string;
  /** Full Vietnamese prose summary of the reading. */
  overallReading: string;
}

export interface MarkovData {
  nextMostLikely: number;
  nextName: string;
  probability: number;
}

// ── Scoring constants (ported from Python interpreter.py) ─────────────────────

const OUTCOME_SCORES: Record<string, number> = {
  "CÁT": 0.3,
  "HUNG": -0.3,
  "VÔ CỬU": 0.0,
  "HỐI": -0.15,
  "LẬN": -0.2,
  "LỆ": -0.1,
};

// ASCII variants (without diacritics) for robust matching
const OUTCOME_SCORES_ASCII: Record<string, number> = {
  "CAT": 0.3,
  "HUNG": -0.3,
  "VO CUU": 0.0,
  "HOI": -0.15,
  "LAN": -0.2,
  "LE": -0.1,
};

const TREND_SCORE_MAP: Array<[string, number]> = [
  ["THUẬN LỢI", 0.5],
  ["THUAN LOI", 0.5],
  ["BẤT LỢI", -0.5],
  ["BAT LOI", -0.5],
  ["TRUNG TÍNH", 0.0],
  ["TRUNG TINH", 0.0],
];

// Action keywords (Vietnamese, both diacritic + ASCII)
const TIEN_KEYWORDS = ["TIẾN", "TIEN"];
const LUI_KEYWORDS = ["LUI"];
const GIU_KEYWORDS = ["GIỮ", "GIU"];
const CHO_KEYWORDS = ["CHỜ", "CHO"];
const THAN_KEYWORDS = ["THẬN", "THAN"];

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Extract a score from a text by searching for known keywords.
 * Uses uppercase comparison for robustness.
 */
function extractOutcomeScore(text: string): number {
  const upper = text.toUpperCase();
  for (const [kw, score] of Object.entries(OUTCOME_SCORES)) {
    if (upper.includes(kw)) return score;
  }
  for (const [kw, score] of Object.entries(OUTCOME_SCORES_ASCII)) {
    if (upper.includes(kw)) return score;
  }
  return 0.0;
}

/** Extract base score from a trend string. */
function extractTrendScore(trend: string): number {
  const upper = trend.toUpperCase();
  for (const [kw, score] of TREND_SCORE_MAP) {
    if (upper.includes(kw)) return score;
  }
  return 0.0;
}

/**
 * Classify the action keyword from a hào action string.
 * Returns a canonical ASCII action.
 */
function extractAction(actionText: string): string {
  const upper = actionText.toUpperCase();
  if (TIEN_KEYWORDS.some((k) => upper.includes(k))) return "MUA";
  if (LUI_KEYWORDS.some((k) => upper.includes(k))) return "BAN";
  if (GIU_KEYWORDS.some((k) => upper.includes(k))) return "GIU";
  if (CHO_KEYWORDS.some((k) => upper.includes(k))) return "CHO";
  if (THAN_KEYWORDS.some((k) => upper.includes(k))) return "THAN TRONG";
  return "GIU"; // default
}

/** Majority vote from an array of action strings. */
function majorityVote(actions: string[]): string {
  if (actions.length === 0) return "GIU";
  const counts: Record<string, number> = {};
  for (const a of actions) {
    counts[a] = (counts[a] ?? 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "GIU";
}

// ── Main orchestrator ──────────────────────────────────────────────────────────

/**
 * Compute a full Kinh Dịch reading from 6 raw scores and optional Markov data.
 *
 * @param stockCode  - Stock ticker (e.g. "VCB")
 * @param scores     - Array of exactly 6 numbers in [−1, +1] (one per hào dimension)
 * @param markovData - Optional Markov transition data from hexagramStore
 * @returns Complete KinhDichReading with all derived fields
 */
export function computeReading(
  stockCode: string,
  scores: number[],
  markovData?: MarkovData | null,
): KinhDichReading {
  if (scores.length !== 6) {
    throw new Error(`computeReading: expected exactly 6 scores, got ${scores.length}`);
  }

  // 1. Encode scores → HaoReadings
  const haos = encodeHaos(scores);
  const signals = haosToSignals(haos);

  // 2. Resolve main hexagram
  const queChinhNumber = resolveHexagram(signals);
  const queMeta = QUE_META.find((q) => q.id === queChinhNumber);
  if (!queMeta) {
    throw new Error(`computeReading: no meta for hexagram ${queChinhNumber}`);
  }
  const queData = QUE_DATA[queChinhNumber];
  if (!queData) {
    throw new Error(`computeReading: no data for hexagram ${queChinhNumber}`);
  }

  // 3. Trigrams
  const lowerTrigramName = queMeta.lower;
  const upperTrigramName = queMeta.upper;
  const lowerTrigramMeta = TRIGRAMS[lowerTrigramName];
  const upperTrigramMeta = TRIGRAMS[upperTrigramName];

  const lowerTrigram = {
    name: lowerTrigramName,
    element: (lowerTrigramMeta?.element ?? "Tho") as NguHanh,
    symbol: lowerTrigramMeta?.symbol ?? "",
  };
  const upperTrigram = {
    name: upperTrigramName,
    element: (upperTrigramMeta?.element ?? "Tho") as NguHanh,
    symbol: upperTrigramMeta?.symbol ?? "",
  };

  // 4. Ho que (nuclear hexagram)
  const hoQueNumber = computeHoQue(signals);
  const hoQueMeta = QUE_META.find((q) => q.id === hoQueNumber);
  const hoQueData = QUE_DATA[hoQueNumber];
  const hoQue = {
    number: hoQueNumber,
    name: hoQueMeta?.name ?? `Que ${hoQueNumber}`,
    chinese: hoQueMeta?.chinese ?? "",
    coreMeaning: hoQueData?.coreMeaning ?? "",
  };

  // 5. Bien que (transformed hexagram)
  const bienQueNumber = computeBienQue(haos);
  const bienQueMeta = QUE_META.find((q) => q.id === bienQueNumber);
  const bienQueData = QUE_DATA[bienQueNumber];
  const bienQue = {
    number: bienQueNumber,
    name: bienQueMeta?.name ?? `Que ${bienQueNumber}`,
    chinese: bienQueMeta?.chinese ?? "",
    coreMeaning: bienQueData?.coreMeaning ?? "",
  };

  // 6. Ngu Hanh
  const nguHanh = classifyNguHanh(lowerTrigram.element, upperTrigram.element);

  // 7. Changing lines
  const changingLines = getChangingLines(haos);

  // 8. Trading signal (ported from Python interpreter.py)
  const trendRaw = queData.state.trend;
  const baseScore = extractTrendScore(trendRaw);

  // Determine active haos: changing lines, or hao 5 if none
  const activeIndices: number[] =
    changingLines.length > 0
      ? changingLines.map((pos) => pos - 1) // 1-indexed → 0-indexed
      : [4]; // hao 5 = index 4

  const haoLines = queData.lines;
  const outcomeScores: number[] = [];
  const actions: string[] = [];

  for (const idx of activeIndices) {
    const haoLine = haoLines[idx];
    if (haoLine) {
      outcomeScores.push(extractOutcomeScore(haoLine.outcome));
      actions.push(extractAction(haoLine.action));
    }
  }

  const avgOutcome =
    outcomeScores.length > 0
      ? outcomeScores.reduce((s, v) => s + v, 0) / outcomeScores.length
      : 0.0;
  const combinedScore = baseScore + avgOutcome;

  let confidence = Math.min(Math.abs(combinedScore) / 0.8, 1.0);
  if (markovData && markovData.probability > 0) {
    confidence = confidence * 0.7 + markovData.probability * 0.3;
  }
  confidence = Math.round(confidence * 1000) / 1000;

  const tradingSignal = majorityVote(actions);
  const tradingSignalDisplay =
    combinedScore >= 0 ? `${tradingSignal} (tích cực)` : `${tradingSignal} (tiêu cực)`;

  // 9. queChiNh
  const queChiNh = {
    number: queChinhNumber,
    name: queMeta.name,
    chinese: queMeta.chinese,
    coreMeaning: queData.coreMeaning,
    trend: trendRaw,
    tradingSignal: tradingSignalDisplay,
    confidence,
  };

  // 10. Markov
  const markov = markovData
    ? {
        nextMostLikely: markovData.nextMostLikely,
        nextName: markovData.nextName,
        probability: markovData.probability,
      }
    : null;

  // 11. Action note
  const actionVerb = tradingSignal;
  const scoreSign = combinedScore >= 0 ? "tích cực" : "tiêu cực";
  const actionNote =
    `KHUYẾN NGHỊ: ${actionVerb} — Quẻ ${queChiNh.name} (${queChiNh.number}) ${scoreSign}` +
    `, xu hướng: ${trendRaw.split("—")[0]?.trim() ?? trendRaw}` +
    `. Độ tin cậy: ${Math.round(confidence * 100)}%.`;

  // 12. Overall reading (Vietnamese prose)
  const changingDesc =
    changingLines.length > 0
      ? `Hào động: ${changingLines.join(", ")} — biến chuyển sang ${bienQue.name}.`
      : `Không có hào động — quẻ ổn định.`;

  const overallReading =
    `[${stockCode}] Quẻ ${queMeta.name} (${queChinhNumber}) ${queMeta.chinese}. ` +
    `${queData.coreMeaning} ` +
    `Xu hướng: ${trendRaw}. ` +
    `Hộ quẻ (ẩn sâu): ${hoQue.name} — ${hoQue.coreMeaning.slice(0, 80)}. ` +
    `${changingDesc} ` +
    `Ngũ Hành: ${nguHanh.interpretation}. ` +
    actionNote;

  return {
    stockCode,
    timestamp: new Date().toISOString(),
    haos,
    lowerTrigram,
    upperTrigram,
    queChiNh,
    hoQue,
    bienQue,
    nguHanh,
    changingLines,
    markov,
    actionNote,
    overallReading,
  };
}
