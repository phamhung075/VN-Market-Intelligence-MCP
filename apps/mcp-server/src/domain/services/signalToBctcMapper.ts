/**
 * Task 1294b — Domain service to extract BCTC financial field hints from news chain signals.
 *
 * Pure domain logic: no infrastructure imports, no database access, no I/O.
 * Maps agent signals with keywords (revenue, margin, debt) into structured financial field hints.
 *
 * Confidence scoring:
 *   - Exact numeric match (e.g., "debt 45%") = 0.9
 *   - Direction-only match (e.g., "margin compression") = 0.7
 *   - Inference from context = 0.5
 */

/**
 * Extracted BCTC financial field hints from a signal.
 * All nullable to handle partial information.
 */
export interface BctcFieldHints {
  /** Revenue direction: -1 (down), 0 (neutral), +1 (up) */
  revenue_growth_hint: number;
  /** Margin trend: -1 (compression), 0 (neutral), +1 (expansion) */
  margin_trend: number;
  /** Extracted debt ratio as percentage (e.g., 45 for 45%) */
  debt_ratio_pct: number | null;
  /** Keywords found that contributed to extraction */
  keywords_found: string[];
  /** Confidence score [0, 1] */
  confidence: number;
}

/**
 * Extract BCTC-relevant financial hints from a signal's headline and finding data.
 * Returns aggregated hints with confidence scoring.
 *
 * @param signal - Agent signal with findingData (parsed JSON) and optional headline
 * @returns BctcFieldHints with extracted fields and confidence
 */
export function extractBctcHints(signal: {
  findingData?: Record<string, unknown>;
  headline?: string;
}): BctcFieldHints {
  const text = buildSearchText(signal);
  const hints: BctcFieldHints = {
    revenue_growth_hint: 0,
    margin_trend: 0,
    debt_ratio_pct: null,
    keywords_found: [],
    confidence: 0.5, // default baseline
  };

  // ── Revenue extraction ─────────────────────────────────────────────────────
  const revenueMatch = extractRevenueHint(text);
  if (revenueMatch.found) {
    hints.revenue_growth_hint = revenueMatch.direction;
    hints.keywords_found.push('revenue');
    hints.confidence = Math.max(hints.confidence, revenueMatch.confidence);
  }

  // ── Margin extraction ──────────────────────────────────────────────────────
  const marginMatch = extractMarginHint(text);
  if (marginMatch.found) {
    hints.margin_trend = marginMatch.direction;
    hints.keywords_found.push('margin');
    hints.confidence = Math.max(hints.confidence, marginMatch.confidence);
  }

  // ── Debt extraction ────────────────────────────────────────────────────────
  const debtMatch = extractDebtHint(text);
  if (debtMatch.found) {
    hints.debt_ratio_pct = debtMatch.ratio_pct;
    hints.keywords_found.push('debt');
    hints.confidence = Math.max(hints.confidence, debtMatch.confidence);
  }

  return hints;
}

/**
 * Extract direction hint from signal text: +1 (growth), -1 (decline), 0 (unknown).
 * Confidence levels:
 *   - Exact percentage: 0.9
 *   - Direction keywords (up/growth/increase): 0.7
 *   - Context inference: 0.5
 */
function extractRevenueHint(text: string): {
  found: boolean;
  direction: number;
  confidence: number;
} {
  const lower = text.toLowerCase();

  // Exact percentage match: "revenue up/increased by 15%" or "doanh thu tăng 15%"
  const percentMatch = lower.match(/revenue.*?(?:up|increased|growth|tăng).*?(\d+(?:\.\d+)?)\s*%/i) ||
                       lower.match(/doanh thu.*?(?:tăng|tăng trưởng).*?(\d+(?:\.\d+)?)\s*%/i);
  if (percentMatch) {
    return { found: true, direction: 1, confidence: 0.9 };
  }

  // Direction only: "revenue up", "revenue growth", "revenue increased"
  if (/revenue\s+(?:up|growth|increase|tăng|growth)\b/i.test(lower) ||
      /doanh thu\s+(?:tăng|tăng trưởng)\b/i.test(lower)) {
    return { found: true, direction: 1, confidence: 0.7 };
  }

  // Decline: "revenue down", "revenue decline", "revenue fell"
  if (/revenue\s+(?:down|decline|fell|drop|decrease)\b/i.test(lower) ||
      /doanh thu\s+(?:giảm|suy giảm)\b/i.test(lower)) {
    return { found: true, direction: -1, confidence: 0.7 };
  }

  // Context inference: if direction is mentioned, infer from context
  if (/bullish|outperform|recovery|strength/i.test(lower)) {
    return { found: true, direction: 1, confidence: 0.5 };
  }
  if (/bearish|underperform|weakness|decline/i.test(lower)) {
    return { found: true, direction: -1, confidence: 0.5 };
  }

  return { found: false, direction: 0, confidence: 0 };
}

/**
 * Extract margin trend: +1 (expansion), -1 (compression), 0 (unknown).
 * Confidence levels:
 *   - Exact percentage change: 0.9
 *   - Direction keywords (expansion/compression): 0.7
 *   - Context: 0.5
 */
function extractMarginHint(text: string): {
  found: boolean;
  direction: number;
  confidence: number;
} {
  const lower = text.toLowerCase();

  // Exact percentage match: "margin expanded 2%"
  const percentMatch = lower.match(/margin.*?(?:expand|improvement|increase).*?(\d+(?:\.\d+)?)\s*%/i) ||
                       lower.match(/biên\s+lợi nhuận.*?(?:tăng|cải thiện).*?(\d+(?:\.\d+)?)\s*%/i);
  if (percentMatch) {
    return { found: true, direction: 1, confidence: 0.9 };
  }

  // Expansion: "margin expansion", "margin improvement", "margin widening"
  if (/margin\s+(?:expansion|improvement|widening|expand|expected)\b/i.test(lower) ||
      /biên\s+(?:tăng|cải thiện|mở rộng)\b/i.test(lower)) {
    return { found: true, direction: 1, confidence: 0.7 };
  }

  // Compression: "margin compression", "margin pressure", "margin squeeze"
  if (/margin\s+(?:compression|pressure|squeeze|thin|narrow|hẹp)\b/i.test(lower) ||
      /biên\s+(?:hẹp|bị nén|suy giảm)\b/i.test(lower)) {
    return { found: true, direction: -1, confidence: 0.7 };
  }

  return { found: false, direction: 0, confidence: 0 };
}

/**
 * Extract debt ratio percentage from signal text.
 * Looks for patterns like "debt ratio at 45%" or "d/e 2.5x".
 * Confidence: 0.9 for exact match, 0.5 for context.
 */
function extractDebtHint(text: string): {
  found: boolean;
  ratio_pct: number | null;
  confidence: number;
} {
  const lower = text.toLowerCase();

  // Exact percentage match: "debt ratio at 45%"
  const debtPctMatch = lower.match(/debt\s+(?:ratio|level).*?(?:at|=|:)?\s*(\d+(?:\.\d+)?)\s*%/i) ||
                       lower.match(/(?:d\/e|debt-to-equity).*?(\d+(?:\.\d+)?)/i) ||
                       lower.match(/nợ\s+(?:ratio|tỷ lệ).*?(\d+(?:\.\d+)?)\s*%/i);
  if (debtPctMatch) {
    const ratio = parseFloat(debtPctMatch[1]!);
    if (!Number.isNaN(ratio)) {
      return { found: true, ratio_pct: ratio, confidence: 0.9 };
    }
  }

  // Direction only: "debt reduction", "debt management improving"
  if (/debt\s+(?:reduction|declining|reduced|improving)/i.test(lower) ||
      /nợ\s+(?:giảm|cải thiện)/i.test(lower)) {
    return { found: true, ratio_pct: null, confidence: 0.5 };
  }

  return { found: false, ratio_pct: null, confidence: 0 };
}

/**
 * Combine headline + finding_data into a single searchable text string.
 * Handles JSON parsing gracefully (skip parse errors).
 */
function buildSearchText(signal: {
  findingData?: Record<string, unknown>;
  headline?: string;
}): string {
  const parts: string[] = [];

  if (signal.headline) {
    parts.push(signal.headline);
  }

  if (signal.findingData) {
    // Add all string/number values from findingData for context
    for (const [key, value] of Object.entries(signal.findingData)) {
      if (typeof value === 'string') {
        parts.push(value);
      } else if (typeof value === 'number') {
        parts.push(String(value));
      }
      // Skip objects/arrays/nulls
    }
  }

  return parts.join(' ');
}
