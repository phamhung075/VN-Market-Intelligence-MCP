/**
 * Crisis Pattern Detector — Task 263
 *
 * Pure domain service. Detects corporate crisis events from Vietnamese text
 * using keyword patterns across 7 crisis types. Applies velocity-based
 * severity classification.
 *
 * Crisis types:
 *   product_recall     — sản phẩm bị thu hồi, lỗi sản phẩm
 *   environmental      — ô nhiễm môi trường, xả thải trái phép
 *   workplace_accident — tai nạn lao động, cháy nổ nhà máy
 *   cyber_breach       — rò rỉ dữ liệu, tấn công mạng, hack
 *   fraud_scandal      — gian lận tài chính, làm giả báo cáo
 *   executive_scandal  — lãnh đạo bị bắt, CEO từ chức đột ngột
 *   regulatory_action  — bị phạt hành chính, đình chỉ hoạt động, thu hồi giấy phép
 *
 * Severity thresholds (velocity = mentionCount / baselineMentionCount):
 *   CRITICAL : velocity > 5× AND sentiment < -0.6 AND sources >= 2
 *   HIGH     : velocity > 3×
 *   MEDIUM   : velocity > 2×
 *   LOW      : pattern matched but velocity <= 2×
 *
 * No I/O — pure function, safe to import from any layer.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type CrisisType =
  | "product_recall"
  | "environmental"
  | "workplace_accident"
  | "cyber_breach"
  | "fraud_scandal"
  | "executive_scandal"
  | "regulatory_action";

export type CrisisSeverity = "low" | "medium" | "high" | "critical";

/**
 * Input data for crisis detection.
 *
 * @property stockCode            - Stock ticker (e.g. "VNM")
 * @property text                 - News article text to analyse
 * @property mentionCount         - Number of mentions in current window
 * @property baselineMentionCount - Rolling baseline (avg mentions per window)
 * @property negativeCount        - Number of negative mentions in window
 * @property sourceCount          - Number of distinct news sources
 * @property sentiment            - Composite sentiment score (-1 to +1)
 */
export interface CrisisInput {
  stockCode: string;
  text: string;
  mentionCount: number;
  baselineMentionCount: number;
  negativeCount: number;
  sourceCount: number;
  sentiment: number;
}

/**
 * Result of crisis pattern detection.
 *
 * @property detected        - Whether any crisis pattern was matched
 * @property crisisType      - The primary crisis type (undefined if not detected)
 * @property severity        - Velocity-based severity level
 * @property matchedPatterns - List of matched keyword patterns
 * @property velocityRatio   - mentionCount / baselineMentionCount (1.0 = baseline)
 */
export interface CrisisResult {
  detected: boolean;
  crisisType: CrisisType | undefined;
  severity: CrisisSeverity;
  matchedPatterns: string[];
  velocityRatio: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern definitions (18 patterns across 7 crisis types)
// ─────────────────────────────────────────────────────────────────────────────

interface PatternDef {
  type: CrisisType;
  patterns: string[];
}

const CRISIS_PATTERNS: PatternDef[] = [
  {
    type: "product_recall",
    patterns: [
      "thu hồi sản phẩm",
      "lỗi sản phẩm",
      "sản phẩm lỗi",
      "thu hồi hàng",
    ],
  },
  {
    type: "environmental",
    patterns: [
      "ô nhiễm môi trường",
      "xả thải",
      "ô nhiễm nguồn nước",
    ],
  },
  {
    type: "workplace_accident",
    patterns: [
      "tai nạn lao động",
      "cháy nổ nhà máy",
      "tai nạn nhà máy",
    ],
  },
  {
    type: "cyber_breach",
    patterns: [
      "rò rỉ dữ liệu",
      "tấn công mạng",
      "hack hệ thống",
      "đánh cắp dữ liệu",
    ],
  },
  {
    type: "fraud_scandal",
    patterns: [
      "gian lận tài chính",
      "làm giả báo cáo",
      "gian lận kế toán",
    ],
  },
  {
    type: "executive_scandal",
    patterns: [
      "lãnh đạo bị bắt",
      "CEO từ chức đột ngột",
      "tổng giám đốc bị bắt",
      "giám đốc bị bắt",
      "chủ tịch bị khởi tố",
      "bị bắt vì tội",
    ],
  },
  {
    type: "regulatory_action",
    patterns: [
      "bị phạt hành chính",
      "đình chỉ hoạt động",
      "thu hồi giấy phép",
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Severity calculation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute velocity-based severity.
 *
 * | Condition                                          | Severity |
 * |----------------------------------------------------|----------|
 * | velocity > 5× AND sentiment < -0.6 AND sources ≥ 2 | critical |
 * | velocity > 3×                                       | high     |
 * | velocity > 2×                                       | medium   |
 * | otherwise                                           | low      |
 */
function computeSeverity(
  velocityRatio: number,
  sentiment: number,
  sourceCount: number,
): CrisisSeverity {
  if (velocityRatio > 5 && sentiment < -0.6 && sourceCount >= 2) {
    return "critical";
  }
  if (velocityRatio > 3) return "high";
  if (velocityRatio > 2) return "medium";
  return "low";
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect crisis patterns in a Vietnamese news text.
 *
 * Pure function — no I/O, no side effects.
 *
 * @param input - CrisisInput with text, mention counts, sentiment, sources
 * @returns     CrisisResult with detection flag, type, severity, patterns
 */
export function detectCrisisPatterns(input: CrisisInput): CrisisResult {
  const lowerText = input.text.toLowerCase();

  const matchedPatterns: string[] = [];
  let matchedType: CrisisType | undefined;

  // Search patterns in declaration order — first match wins for primary type
  for (const def of CRISIS_PATTERNS) {
    for (const pattern of def.patterns) {
      if (lowerText.includes(pattern.toLowerCase())) {
        matchedPatterns.push(pattern);
        if (matchedType === undefined) {
          matchedType = def.type;
        }
      }
    }
  }

  const detected = matchedType !== undefined;

  // Velocity ratio: guard against division by zero
  const baseline = input.baselineMentionCount > 0 ? input.baselineMentionCount : 1;
  const velocityRatio = input.mentionCount / baseline;

  const severity: CrisisSeverity = detected
    ? computeSeverity(velocityRatio, input.sentiment, input.sourceCount)
    : "low";

  return {
    detected,
    crisisType: matchedType,
    severity,
    matchedPatterns,
    velocityRatio,
  };
}
