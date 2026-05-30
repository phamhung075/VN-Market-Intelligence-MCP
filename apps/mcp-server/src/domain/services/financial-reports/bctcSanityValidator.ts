/**
 * bctcSanityValidator — DT-1 Digit-Run Detector
 *
 * Sprint BCTC-TRUST-RED (TR0-DEV-1 + TR1-DEV-1)
 * DDD layer: domain — pure function, zero I/O, zero infrastructure/interface imports.
 *
 * Validates a single refined unit's markdown for semantic sanity.
 * DT-1: Detects monotonic/cyclic digit-run values (fabricated data signals).
 *
 * Valid window_status values: DONE | FAILED | REJECTED_SANITY (new — terminal state)
 *
 * @module domain/services/financial-reports/bctcSanityValidator
 */

// ── Type contracts (binding — consumed by interface layer) ────────────────────

export interface SanityViolation {
  code: string;        // "DIGIT_RUN" | "DIGIT_RUN_SINGLE"
  description: string; // human-readable, English
  severity: "BLOCK" | "WARN";
}

export interface SanityResult {
  valid: boolean;
  violations: SanityViolation[];
  adjusted_confidence: number;
}

// ── DT-1: Digit-run detection helpers ────────────────────────────────────────

/**
 * Ascending and descending cyclic digit sequences — doubled for substring search.
 * Covers all contiguous runs: "12345678901234", "23456789012345", "09876543210987", etc.
 */
const ASCENDING_CYCLE = "12345678901234567890";
const DESCENDING_CYCLE = "09876543210987654321";
const ASC_DOUBLED = ASCENDING_CYCLE + ASCENDING_CYCLE;
const DESC_DOUBLED = DESCENDING_CYCLE + DESCENDING_CYCLE;

/**
 * isDigitRun — returns true if numStr is a fabricated digit sequence.
 *
 * Rules:
 * 1. Length < 4 → false (too short to be a run; could be a legit code)
 * 2. All-same digit (≥4 chars) → true  (e.g. "1111", "9999")
 * 3. Contiguous substring of ascending cycle (12345678901234567890) → true
 * 4. Contiguous substring of descending cycle (09876543210987654321) → true
 * 5. Otherwise → false
 */
export function isDigitRun(numStr: string): boolean {
  if (numStr.length < 4) return false;
  // All-same digit
  if (/^(\d)\1{3,}$/.test(numStr)) return true;
  // Ascending cycle
  if (ASC_DOUBLED.includes(numStr)) return true;
  // Descending cycle
  if (DESC_DOUBLED.includes(numStr)) return true;
  return false;
}

/**
 * extractNumericValuesFromMarkdown — extract digit-only strings from markdown table cells.
 *
 * Strips Vietnamese thousand separators (commas and dots used as grouping),
 * then keeps only pure numeric strings with ≥4 digits.
 *
 * Pattern: scan all pipe-table cells between | delimiters.
 * Separator rows (---- cells) and header rows are automatically excluded because
 * their cells don't match the digit filter.
 */
function extractNumericValuesFromMarkdown(markdown: string): string[] {
  const values: string[] = [];
  const cellRegex = /\|\s*([^|\r\n]+?)\s*(?=\|)/g;
  let match: RegExpExecArray | null;

  while ((match = cellRegex.exec(markdown)) !== null) {
    const cell = (match[1] ?? "").trim();
    // Strip Vietnamese/English thousand separators (comma and dot grouping)
    // Keep digits only after stripping
    const numStr = cell.replace(/[,\.]/g, "");
    if (/^\d+$/.test(numStr)) {
      values.push(numStr);
    }
  }

  return values;
}

// ── Main exported validator ───────────────────────────────────────────────────

/**
 * validateBctcUnit — DT-1 sanity check for a single refined unit.
 *
 * Scans all numeric values in the markdown for digit-run patterns.
 * Threshold:
 *   - 0 digit-run values  → valid, no violations
 *   - 1 digit-run value   → valid, WARN (could be a legitimate BCTC code appearing once)
 *   - ≥2 distinct digit-run values → invalid, BLOCK (fabrication suspected)
 *
 * @param markdown        The refined markdown from one Haiku window
 * @param confidence      Caller-supplied confidence [0,1]
 * @param flags           Existing flags array (not mutated here)
 * @param reportId        Report UUID (for future cross-unit checks, not used in DT-1)
 * @param allUnitMarkdowns Reserved for future DT-3 cross-unit checks (not used in DT-1)
 * @returns SanityResult with valid flag, violations list, and adjusted_confidence
 */
export function validateBctcUnit(
  markdown: string,
  confidence: number,
  flags: string[],
  reportId: string,
  allUnitMarkdowns?: string[],
): SanityResult {
  // Suppress unused param warnings (reserved for future detectors)
  void flags;
  void reportId;
  void allUnitMarkdowns;

  const numericValues = extractNumericValuesFromMarkdown(markdown);
  const digitRunValues = new Set<string>();

  for (const val of numericValues) {
    if (isDigitRun(val)) {
      digitRunValues.add(val);
    }
  }

  const runCount = digitRunValues.size;

  if (runCount === 0) {
    return {
      valid: true,
      violations: [],
      adjusted_confidence: confidence,
    };
  }

  if (runCount === 1) {
    return {
      valid: true,
      violations: [
        {
          code: "DIGIT_RUN_SINGLE",
          description:
            "Single digit-run value detected (may be a BCTC line-item code); confidence reduced",
          severity: "WARN",
        },
      ],
      adjusted_confidence: Math.min(confidence, 0.4),
    };
  }

  // runCount >= 2 → BLOCK
  return {
    valid: false,
    violations: [
      {
        code: "DIGIT_RUN",
        description: `${runCount} distinct digit-run values detected; fabrication suspected`,
        severity: "BLOCK",
      },
    ],
    adjusted_confidence: Math.min(confidence, 0.1),
  };
}
