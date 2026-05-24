/**
 * reading-scorer — Pure Primitive
 *
 * Maps line outcome strings and trend text to numeric scores, and maps
 * action text or aggregated actions to a trading action string.
 *
 * Functions extracted from apps/kinh-dich-service/src/domain/services.ts
 *   L225-L234 (constant tables)
 *   L301-L307  extractOutcomeScore
 *   L309-L315  extractTrendScore
 *   L317-L325  extractAction
 *   L327-L332  majorityVote
 *
 * Zero imports from application, interface, infrastructure, or module layers.
 * Only stdlib is used (no bun-specific APIs in this file).
 *
 * R-FENCE: Fence-A — this primitive must never import from higher layers.
 *
 * Input Validation Strategy (Decision 2 — Option A):
 *   Unknown/unrecognised strings → return default value (0.0 for scores, 'GIU' for actions).
 *   This mirrors the original domain implementation exactly.
 */

// ── Embedded constant tables (copied from domain/services.ts L225-L234) ────────

/** Maps I-Ching outcome keywords (in Vietnamese) to numeric scores. */
const OUTCOME_SCORES: Record<string, number> = {
  'CÁT': 0.3, 'HUNG': -0.3, 'VÔ CỬU': 0.0, 'HỐI': -0.15, 'LẬN': -0.2, 'LỆ': -0.1,
  'CAT': 0.3, 'VO CUU': 0.0, 'HOI': -0.15, 'LAN': -0.2, 'LE': -0.1,
};

/**
 * Maps trend keywords to numeric scores.
 * Ordered array so the first match wins (longest-match-first safety).
 */
const TREND_SCORE_MAP: Array<[string, number]> = [
  ['THUẬN LỢI', 0.5], ['THUAN LOI', 0.5],
  ['BẤT LỢI', -0.5], ['BAT LOI', -0.5],
  ['TRUNG TÍNH', 0.0], ['TRUNG TINH', 0.0],
];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Extract a numeric score from an I-Ching line outcome text.
 *
 * Scans the uppercase form of `outcomeText` for known keyword entries.
 * The first keyword match determines the score.
 *
 * @param outcomeText - Raw Vietnamese outcome text from the hexagram line (e.g. "Đại CÁT — Hanh").
 * @returns Score in range [-0.3, 0.3]; defaults to 0.0 for unknown text.
 */
export function extractOutcomeScore(outcomeText: string): number {
  const upper = outcomeText.toUpperCase();
  for (const [kw, score] of Object.entries(OUTCOME_SCORES)) {
    if (upper.includes(kw)) return score;
  }
  return 0.0;
}

/**
 * Extract a numeric score from a trend/market-direction text.
 *
 * Scans the uppercase form of `trendText` for known trend keywords.
 *
 * @param trendText - Vietnamese trend description (e.g. "Thuận Lợi — Thị trường tăng").
 * @returns Score in {-0.5, 0.0, 0.5}; defaults to 0.0 for unknown text.
 */
export function extractTrendScore(trendText: string): number {
  const upper = trendText.toUpperCase();
  for (const [kw, score] of TREND_SCORE_MAP) {
    if (upper.includes(kw)) return score;
  }
  return 0.0;
}

/**
 * Classify action text into a canonical trading action string.
 *
 * Matches Vietnamese action keywords to one of: 'MUA', 'BAN', 'GIU', 'CHO', 'THAN TRONG'.
 * The handoff spec lists the signature as `extractAction(score: number)` but the domain
 * implementation (and its caller at L443) passes action *text* — this primitive faithfully
 * preserves the domain's string-based contract.
 *
 * @param actionText - Vietnamese action description from hexagram line data.
 * @returns One of 'MUA' | 'BAN' | 'GIU' | 'CHO' | 'THAN TRONG'; defaults to 'GIU'.
 */
export function extractAction(actionText: string): string {
  const upper = actionText.toUpperCase();
  if (['TIẾN', 'TIEN'].some((k) => upper.includes(k))) return 'MUA';
  if (['LUI'].some((k) => upper.includes(k))) return 'BAN';
  if (['GIỮ', 'GIU'].some((k) => upper.includes(k))) return 'GIU';
  if (['CHỜ', 'CHO'].some((k) => upper.includes(k))) return 'CHO';
  if (['THẬN', 'THAN'].some((k) => upper.includes(k))) return 'THAN TRONG';
  return 'GIU';
}

/**
 * Compute the majority action from a list of action strings.
 *
 * Counts occurrences of each action and returns the most frequent.
 * Ties are broken by the first action that appears when sorted by descending count
 * (Object.entries iteration order — stable in V8/JavaScriptCore).
 *
 * @param actions - Array of action strings (e.g. ['MUA', 'GIU', 'MUA']).
 * @returns Most frequent action, or 'GIU' when the array is empty.
 */
export function majorityVote(actions: string[]): string {
  if (actions.length === 0) return 'GIU';
  const counts: Record<string, number> = {};
  for (const a of actions) counts[a] = (counts[a] ?? 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'GIU';
}
