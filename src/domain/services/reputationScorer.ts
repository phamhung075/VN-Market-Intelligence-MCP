/**
 * Reputation Scorer — Task 264
 *
 * Pure domain service. Maintains a 30-day EWMA (Exponentially Weighted Moving
 * Average) reputation score in the range [0, 100] for each stock.
 *
 * Scoring model:
 *   - Initial score: 75 (neutral)
 *   - Crisis penalty applied immediately on detection:
 *       CRITICAL → -20
 *       HIGH     → -10
 *       MEDIUM   → -5
 *       LOW      → 0
 *   - Recovery: +2 per day with no crisis event
 *   - EWMA smoothing with alpha = 2 / (30 + 1) ≈ 0.0645
 *
 * Risk level classification:
 *   ≥ 70  → safe
 *   50-69 → watch
 *   30-49 → warning
 *   < 30  → danger
 *
 * No I/O — pure functions, safe to import from any layer.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type RiskLevel = "safe" | "watch" | "warning" | "danger";

export type CrisisSeverityInput = "low" | "medium" | "high" | "critical";

/**
 * A snapshot of a stock's reputation score at a point in time.
 *
 * @property stockCode  - Stock ticker
 * @property score      - Current EWMA score (0-100)
 * @property riskLevel  - Derived risk classification
 * @property trend      - Score direction: 'improving' | 'stable' | 'deteriorating'
 * @property computedAt - ISO 8601 timestamp
 */
export interface ReputationScore {
  stockCode: string;
  score: number;
  riskLevel: RiskLevel;
  trend: "improving" | "stable" | "deteriorating";
  computedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** EWMA smoothing factor for 30-day window: alpha = 2 / (N + 1) */
const EWMA_ALPHA = 2 / (30 + 1);

/** Crisis penalty amounts by severity */
const CRISIS_PENALTIES: Record<CrisisSeverityInput, number> = {
  critical: 20,
  high: 10,
  medium: 5,
  low: 0,
};

/** Recovery points added per crisis-free day */
const RECOVERY_PER_DAY = 2;

/** Default starting score for new stocks */
export const INITIAL_SCORE = 75;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Clamp a number to [0, 100]. */
function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply a crisis penalty to a reputation score.
 *
 * Result is clamped to [0, 100].
 *
 * @param currentScore - Current reputation score (0-100)
 * @param severity     - Crisis severity level
 * @returns            - New score after penalty
 */
export function applycrisispenalty(
  currentScore: number,
  severity: CrisisSeverityInput,
): number {
  const penalty = CRISIS_PENALTIES[severity];
  return clamp(currentScore - penalty);
}

/**
 * Apply daily recovery to a reputation score.
 *
 * Adds RECOVERY_PER_DAY × days, clamped to 100.
 *
 * @param currentScore - Current reputation score (0-100)
 * @param days         - Number of crisis-free days to apply
 * @returns            - New score after recovery
 */
export function applyRecovery(currentScore: number, days: number): number {
  return clamp(currentScore + RECOVERY_PER_DAY * days);
}

/**
 * Compute an EWMA-smoothed reputation score.
 *
 * If history is empty, returns currentScore unchanged.
 * Otherwise applies EWMA from oldest to newest history entry,
 * then applies one final EWMA step with currentScore.
 *
 * Formula: ewma_new = alpha × current + (1 - alpha) × ewma_old
 *
 * @param currentScore - Today's raw score before smoothing
 * @param history      - Previous EWMA scores, oldest first
 * @returns            - Smoothed score (0-100)
 */
export function computeEwmaScore(
  currentScore: number,
  history: number[],
): number {
  if (history.length === 0) return clamp(currentScore);

  // Bootstrap from first historical value, then apply EWMA forward
  let ewma = history[0]!;
  for (let i = 1; i < history.length; i++) {
    ewma = EWMA_ALPHA * history[i]! + (1 - EWMA_ALPHA) * ewma;
  }

  // Apply current score as the final EWMA step
  ewma = EWMA_ALPHA * currentScore + (1 - EWMA_ALPHA) * ewma;

  return clamp(ewma);
}

/**
 * Classify a reputation score into a risk level.
 *
 * | Score  | Risk Level |
 * |--------|------------|
 * | ≥ 70   | safe       |
 * | 50-69  | watch      |
 * | 30-49  | warning    |
 * | < 30   | danger     |
 *
 * @param score - Reputation score (0-100)
 * @returns     - Risk level classification
 */
export function classifyRiskLevel(score: number): RiskLevel {
  if (score >= 70) return "safe";
  if (score >= 50) return "watch";
  if (score >= 30) return "warning";
  return "danger";
}

/**
 * Build a complete ReputationScore snapshot.
 *
 * Applies EWMA smoothing and classifies risk level.
 *
 * @param stockCode    - Stock ticker
 * @param currentScore - Current raw score (0-100)
 * @param history      - Previous EWMA scores, oldest first
 * @param previousScore - Previous snapshot score for trend detection
 * @returns              Full ReputationScore snapshot
 */
export function buildReputationScore(
  stockCode: string,
  currentScore: number,
  history: number[],
  previousScore?: number,
): ReputationScore {
  const smoothedScore = computeEwmaScore(currentScore, history);
  const riskLevel = classifyRiskLevel(smoothedScore);

  let trend: "improving" | "stable" | "deteriorating" = "stable";
  if (previousScore !== undefined) {
    const delta = smoothedScore - previousScore;
    if (delta > 1) trend = "improving";
    else if (delta < -1) trend = "deteriorating";
  }

  return {
    stockCode,
    score: Math.round(smoothedScore * 100) / 100,
    riskLevel,
    trend,
    computedAt: new Date().toISOString(),
  };
}
