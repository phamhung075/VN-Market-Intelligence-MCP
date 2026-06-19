/**
 * Legal Risk Detector — Task 240
 *
 * Pure domain service that scans text for Vietnamese legal risk patterns
 * and returns structured LegalRiskSignal objects.
 *
 * Design rules:
 * - Zero imports from infrastructure/ or application/ (DDD: domain-only)
 * - No I/O, no side effects, no async
 * - Stock resolution uses detectStocksInText() from stockAliases.ts
 *
 * Patterns: 16 patterns covering 7 risk types
 * Severity mapping:
 *   prosecution + asset_freeze → CRITICAL
 *   tax_penalty + license_revocation + anti_dumping → HIGH
 *   litigation + investigation → MEDIUM
 */

import type { Severity } from "./signalDetector.js";
import { detectStocksInText } from "./stockAliases.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type LegalRiskType =
  | "prosecution"
  | "tax_penalty"
  | "license_revocation"
  | "anti_dumping"
  | "litigation"
  | "asset_freeze"
  | "investigation";

export interface LegalRiskSignal {
  /** Category of legal risk */
  riskType: LegalRiskType;
  /** Severity based on risk type */
  severity: Severity;
  /** List of regex pattern strings that matched */
  matchedPatterns: string[];
  /** Stock codes from watchlist mentioned in or near the text */
  stockCodes: string[];
  /** 0..1 confidence estimate */
  confidence: number;
  /** The original input text */
  originalText: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern definitions
// ─────────────────────────────────────────────────────────────────────────────

interface PatternEntry {
  pattern: RegExp;
  riskType: LegalRiskType;
  severity: Severity;
}

const LEGAL_PATTERNS: PatternEntry[] = [
  // prosecution (CRITICAL)
  { pattern: /khởi tố/i, riskType: "prosecution", severity: "critical" },
  { pattern: /bắt (tạm )?giam/i, riskType: "prosecution", severity: "critical" },
  { pattern: /vướng lao lý/i, riskType: "prosecution", severity: "critical" },
  { pattern: /lãnh đạo bị bắt/i, riskType: "prosecution", severity: "critical" },
  { pattern: /bị truy tố/i, riskType: "prosecution", severity: "critical" },
  // Task 1205: "truy tố" standalone (without "bị") — e.g. "Truy tố Vũ Đức Tĩnh"
  { pattern: /(?:^|(?<=\s))truy tố(?=\s|$)/iu, riskType: "prosecution", severity: "critical" },

  // asset_freeze (CRITICAL)
  { pattern: /phong tỏa tài sản/i, riskType: "asset_freeze", severity: "critical" },
  { pattern: /kê biên/i, riskType: "asset_freeze", severity: "critical" },

  // tax_penalty (HIGH)
  { pattern: /truy thu thuế/i, riskType: "tax_penalty", severity: "high" },
  { pattern: /phạt vi phạm thuế/i, riskType: "tax_penalty", severity: "high" },

  // license_revocation (HIGH)
  { pattern: /thu hồi giấy phép/i, riskType: "license_revocation", severity: "high" },
  { pattern: /đình chỉ hoạt động/i, riskType: "license_revocation", severity: "high" },

  // anti_dumping (HIGH)
  { pattern: /chống bán phá giá/i, riskType: "anti_dumping", severity: "high" },
  { pattern: /anti.?dumping/i, riskType: "anti_dumping", severity: "high" },

  // litigation (MEDIUM)
  { pattern: /thua kiện/i, riskType: "litigation", severity: "medium" },
  { pattern: /bồi thường thiệt hại/i, riskType: "litigation", severity: "medium" },
  { pattern: /cưỡng chế thi hành/i, riskType: "litigation", severity: "medium" },

  // investigation (MEDIUM)
  { pattern: /điều tra/i, riskType: "investigation", severity: "medium" },
  { pattern: /vi phạm pháp luật/i, riskType: "investigation", severity: "medium" },
  { pattern: /xử phạt hành chính/i, riskType: "investigation", severity: "medium" },
  { pattern: /thanh tra/i, riskType: "investigation", severity: "medium" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Confidence mapping
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_CONFIDENCE: Record<Severity, number> = {
  critical: 0.95,
  high: 0.85,
  warning: 0.70,  // TA scan alerts use "warning"
  medium: 0.70,
  low: 0.50,
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect legal risk signals in `text` for stocks in `watchlistCodes`.
 *
 * Returns one LegalRiskSignal per matched risk type.
 * Multiple risk types can fire simultaneously from one text.
 *
 * Stock resolution strategy (two-tier):
 *   1. detectStocksInText() — alias-based detection (company names, brands)
 *   2. Direct ticker match — checks if ticker code appears as a word in the text
 *
 * If no watchlist codes are mentioned in the text, returns empty array.
 *
 * @param text           - Full article text or headline to scan
 * @param watchlistCodes - Stock codes to check for mentions, e.g. ["VCB", "FPT"]
 * @returns              - Detected legal risk signals (empty array if none)
 */
export function detectLegalRisk(
  text: string,
  watchlistCodes: string[],
): LegalRiskSignal[] {
  if (!text || watchlistCodes.length === 0) return [];

  // Tier 1: alias-based stock detection (company names, brands)
  const aliasMatches = detectStocksInText(text, watchlistCodes);

  // Tier 2: direct ticker code detection (e.g. "VCB" in text)
  const directMatches: string[] = [];
  for (const code of watchlistCodes) {
    const upper = code.toUpperCase();
    if (new RegExp(`(?<![A-Za-z])${upper}(?![A-Za-z])`, "u").test(text)) {
      directMatches.push(upper);
    }
  }

  // Merge and deduplicate
  const stockCodesSet = new Set<string>([...aliasMatches, ...directMatches]);
  const stockCodes = Array.from(stockCodesSet);

  if (stockCodes.length === 0) return [];

  // Group matched patterns by riskType to avoid duplicate signals per type
  const riskTypeMatches = new Map<
    LegalRiskType,
    { patterns: string[]; severity: Severity }
  >();

  for (const entry of LEGAL_PATTERNS) {
    if (entry.pattern.test(text)) {
      const existing = riskTypeMatches.get(entry.riskType);
      if (existing) {
        existing.patterns.push(entry.pattern.source);
      } else {
        riskTypeMatches.set(entry.riskType, {
          patterns: [entry.pattern.source],
          severity: entry.severity,
        });
      }
    }
  }

  if (riskTypeMatches.size === 0) return [];

  // Build one signal per risk type that fired
  const signals: LegalRiskSignal[] = [];
  for (const [riskType, { patterns, severity }] of riskTypeMatches) {
    signals.push({
      riskType,
      severity,
      matchedPatterns: patterns,
      stockCodes,
      confidence: SEVERITY_CONFIDENCE[severity],
      originalText: text,
    });
  }

  return signals;
}
