/**
 * TNB Critic Scorer
 *
 * Pure deterministic scorer implementing TNB methodology quality checks.
 * No I/O, no DB, no HTTP. Synchronous. Unit-testable in isolation.
 *
 * 5 checks × 0.2 each. Threshold = 0.6 (3 of 5 checks must pass).
 *
 * Check 1 — Pillar coverage:    detail references money supply / cost of capital / profit / policy
 * Check 2 — Source tier:        no social media (Facebook/Zalo/Reddit) as sole primary
 * Check 3 — Specificity:        title+detail >= 80 chars; no vague phrases as sole conclusion
 * Check 4 — BCTC forensics:     for fundamental_validation only → findingData must include
 *                                at least one of: m_score, f_score, accruals_flag, btn_check
 * Check 5 — Confidence anchor:  impact_score >= 3 OR findingData.confidence_score > 0.5
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CriticInput {
  fromAgent: string;
  signalType: string;
  stockCode: string | null;
  payload: {
    title?: string;
    detail?: string;
    impact_score?: number;
    [key: string]: unknown;
  };
  /** Chain finding metrics validated by the agent */
  findingData: Record<string, unknown>;
}

export interface CriticResult {
  /** true = score >= threshold (0.6) */
  pass: boolean;
  /** 0.0–1.0, rounded to 1 decimal place */
  score: number;
  /** One-sentence verdict or critique summary */
  notes: string;
  /** Specific gap description when pass=false (used in retry prompt) */
  critique?: string;
  /** true = gate timed out or errored (signal passed through unscored) */
  timedOut?: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PASS_THRESHOLD = 0.6;
const CHECK_WEIGHT = 0.2;

/** TNB pillar keywords — at least one must appear in detail for pillar check. */
const PILLAR_KEYWORDS = [
  "money supply",
  "cost of capital",
  "profit",
  "policy",
];

/** Social media sources that fail the source tier check when used as primary. */
const SOCIAL_MEDIA_SOURCES = ["facebook", "zalo", "reddit"];

/** Vague hedging phrases that indicate a non-specific conclusion. */
const VAGUE_PHRASES = ["có thể", "possibly", "might"];

/** BCTC forensics keys — at least one must be present for fundamental_validation. */
const BCTC_FORENSICS_KEYS = ["m_score", "f_score", "accruals_flag", "btn_check"];

// ── Check implementations ─────────────────────────────────────────────────────

/**
 * Check 1 — Pillar coverage.
 * detail must reference at least one TNB pillar keyword.
 */
function checkPillarCoverage(input: CriticInput): { pass: boolean; gap: string | null } {
  const detail = (input.payload.detail ?? "").toLowerCase();

  for (const keyword of PILLAR_KEYWORDS) {
    if (detail.includes(keyword)) {
      return { pass: true, gap: null };
    }
  }

  return {
    pass: false,
    gap: "Pillar gap: detail references price action only — add cost-of-capital or profit outlook context.",
  };
}

/**
 * Check 2 — Source tier.
 * Social media (Facebook, Zalo, Reddit) must not be the primary source.
 * If any social media keyword appears in detail without a tier-1 anchor,
 * the check fails.
 */
function checkSourceTier(input: CriticInput): { pass: boolean; gap: string | null } {
  const detail = (input.payload.detail ?? "").toLowerCase();

  for (const source of SOCIAL_MEDIA_SOURCES) {
    if (detail.includes(source)) {
      return {
        pass: false,
        gap: `Source tier violation: detail references ${source} — social media cannot be primary source without a tier-1 anchor (HOSE filing, official statement, Bloomberg/Reuters).`,
      };
    }
  }

  return { pass: true, gap: null };
}

/**
 * Check 3 — Specificity.
 * title + detail combined >= 80 chars AND no vague phrases as sole conclusion.
 */
function checkSpecificity(input: CriticInput): { pass: boolean; gap: string | null } {
  const title = input.payload.title ?? "";
  const detail = input.payload.detail ?? "";
  const combined = title + detail;

  if (combined.length < 80) {
    return {
      pass: false,
      gap: `Specificity low: detail is ${detail.length} chars. Expand to include direction, magnitude, and evidence source.`,
    };
  }

  const detailLower = detail.toLowerCase();
  for (const phrase of VAGUE_PHRASES) {
    if (detailLower.includes(phrase)) {
      return {
        pass: false,
        gap: `Specificity low: detail contains vague phrase "${phrase}" as conclusion. Replace with a confirmed, direction-specific statement.`,
      };
    }
  }

  return { pass: true, gap: null };
}

/**
 * Check 4 — BCTC forensics gate.
 * Only applies when signalType = "fundamental_validation".
 * For all other signal types, this check auto-passes.
 */
function checkBctcForensics(input: CriticInput): { pass: boolean; gap: string | null } {
  if (input.signalType !== "fundamental_validation") {
    // Auto-pass for non-BCTC signal types
    return { pass: true, gap: null };
  }

  for (const key of BCTC_FORENSICS_KEYS) {
    if (key in input.findingData && input.findingData[key] !== undefined) {
      return { pass: true, gap: null };
    }
  }

  return {
    pass: false,
    gap: "BCTC forensics missing: fundamental_validation signal requires m_score or f_score in findingData.",
  };
}

/**
 * Check 5 — Confidence anchor.
 * impact_score >= 3 OR findingData.confidence_score > 0.5.
 */
function checkConfidenceAnchor(input: CriticInput): { pass: boolean; gap: string | null } {
  const impactScore = input.payload.impact_score;
  if (typeof impactScore === "number" && impactScore >= 3) {
    return { pass: true, gap: null };
  }

  const confidenceScore = input.findingData["confidence_score"];
  if (typeof confidenceScore === "number" && confidenceScore > 0.5) {
    return { pass: true, gap: null };
  }

  return {
    pass: false,
    gap: "Confidence anchor missing: provide impact_score >= 3 or findingData.confidence_score > 0.5.",
  };
}

// ── Main scorer ───────────────────────────────────────────────────────────────

/**
 * Score a draft agent signal using TNB methodology criteria.
 *
 * Pure function — no I/O. Safe to call from any context.
 * Returns a CriticResult with pass/fail, score, and critique details.
 *
 * @param input - Signal content to evaluate (fromAgent, signalType, payload, findingData)
 * @returns CriticResult with pass=true when score >= 0.6
 */
export function scoreWithTnbCritic(input: CriticInput): CriticResult {
  const checks = [
    checkPillarCoverage(input),
    checkSourceTier(input),
    checkSpecificity(input),
    checkBctcForensics(input),
    checkConfidenceAnchor(input),
  ];

  const passedCount = checks.filter((c) => c.pass).length;
  const score = Math.round(passedCount * CHECK_WEIGHT * 10) / 10;
  const pass = score >= PASS_THRESHOLD;

  const gaps = checks
    .filter((c) => !c.pass && c.gap !== null)
    .map((c) => c.gap as string);

  const notes =
    pass
      ? `Signal passed TNB critic gate (score=${score.toFixed(1)}, ${passedCount}/5 checks).`
      : `Signal failed TNB critic gate (score=${score.toFixed(1)}, ${passedCount}/5 checks). Gaps: ${gaps.join(" | ")}`;

  const result: CriticResult = { pass, score, notes };

  if (!pass && gaps.length > 0) {
    result.critique = gaps.join(" | ");
  }

  return result;
}
