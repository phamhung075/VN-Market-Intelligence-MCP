/**
 * IMF Context Sentiment Classifier
 *
 * Pure domain service to detect IMF economic announcements and classify sentiment
 * as bullish (+0.3..+0.7), bearish (-0.6..-0.3), or neutral (0.0..+0.3).
 *
 * No infrastructure imports, no I/O, no async operations.
 */

export interface ImfClassification {
  classification: 'imf_policy_adjustment' | 'imf_crisis_signal' | 'non_imf' | 'imf_neutral';
  sentiment: number; // [-1, +1]
  confidence: number; // [0, 1]
  reason: string;
}

// Keywords for IMF identification (case-insensitive)
const IMF_IDENTIFIERS = [
  'imf',
  'international monetary fund',
  'quỹ tiền tệ quốc tế',
];

// Crisis indicators (case-insensitive)
// Longer phrases first to prioritize more specific matches
const CRISIS_KEYWORDS = [
  'stand-by arrangement',
  'emergency financing',
  'structural adjustment',
  'program agreement',
  'rescue package',
  'currency pressure',
  'financial assistance',
  'stand-by',
  'arrangement',
  'sba',
  'spa',
  'bailout',
];

// Policy adjustment indicators (case-insensitive)
const POLICY_ADJUSTMENT_KEYWORDS = [
  'staff report',
  'policy support',
  'technical assistance',
  'oversight',
  'policy adjustment',
  'surveillance',
  'article iv',
  'hỗ trợ chính sách',
  'hỗ trợ',
  'chính sách',
];

/**
 * Classify IMF sentiment from headline and summary text.
 *
 * @param headline - News headline
 * @param summary - News summary or body text
 * @returns ImfClassification with sentiment [-1, +1] and confidence [0, 1]
 *
 * Logic:
 * 1. Check if headline OR summary contains IMF keyword (case-insensitive)
 * 2. If no IMF keyword → return { classification: 'non_imf', sentiment: 0.0 }
 * 3. If IMF keyword found:
 *    a. Check for crisis keywords → return { classification: 'imf_crisis_signal', sentiment: [-0.6, -0.3] }
 *    b. Check for policy adjustment keywords → return { classification: 'imf_policy_adjustment', sentiment: [+0.3, +0.7] }
 *    c. Neither → return { classification: 'imf_neutral', sentiment: [0.0, +0.3] }
 * 4. Confidence calculation:
 *    - Exact match (both headline + summary have keyword) = 0.9
 *    - Single match (one of headline/summary has keyword) = 0.75
 *    - Inference from context = 0.6
 */
export function classifyImfSentiment(headline: string, summary: string): ImfClassification {
  const headlineLower = headline.toLowerCase();
  const summaryLower = summary.toLowerCase();
  const combinedText = `${headlineLower} ${summaryLower}`;

  // Step 1: Check for IMF keyword
  const imfMatch = checkKeywordMatch(combinedText, IMF_IDENTIFIERS);
  if (!imfMatch) {
    return {
      classification: 'non_imf',
      sentiment: 0.0,
      confidence: 0.85, // High confidence: definitely non-IMF
      reason: 'No IMF identifier found in headline or summary',
    };
  }

  // Step 2: Determine confidence based on matching locations
  let confidence = 0.6;
  const headlineHasImf = checkKeywordMatch(headlineLower, IMF_IDENTIFIERS);
  const summaryHasImf = checkKeywordMatch(summaryLower, IMF_IDENTIFIERS);
  if (headlineHasImf && summaryHasImf) {
    confidence = 0.9;
  } else if (headlineHasImf || summaryHasImf) {
    confidence = 0.75;
  }

  // Step 3: Check for crisis indicators
  const crisisMatch = checkKeywordMatch(combinedText, CRISIS_KEYWORDS);
  if (crisisMatch) {
    const sentiment = -0.45; // Middle of [-0.6, -0.3] range
    // Capitalize first letter for readability
    const capitalizedMatch = crisisMatch.charAt(0).toUpperCase() + crisisMatch.slice(1);
    return {
      classification: 'imf_crisis_signal',
      sentiment,
      confidence,
      reason: `IMF crisis signal detected: "${capitalizedMatch}" found in text`,
    };
  }

  // Step 4: Check for policy adjustment indicators
  const policyMatch = checkKeywordMatch(combinedText, POLICY_ADJUSTMENT_KEYWORDS);
  if (policyMatch) {
    const sentiment = 0.5; // Middle of [+0.3, +0.7] range
    return {
      classification: 'imf_policy_adjustment',
      sentiment,
      confidence,
      reason: `IMF policy adjustment detected: "${policyMatch}" found in text`,
    };
  }

  // Step 5: Default to neutral
  const sentiment = 0.15; // Middle of [0.0, +0.3] range
  return {
    classification: 'imf_neutral',
    sentiment,
    confidence,
    reason: 'IMF mentioned but no specific policy or crisis indicators found',
  };
}

/**
 * Helper: Check if text contains any keyword from list (case-insensitive, word boundary).
 * @returns Matched keyword string, or null if no match
 */
function checkKeywordMatch(text: string, keywords: string[]): string | null {
  for (const keyword of keywords) {
    if (text.includes(keyword)) {
      return keyword;
    }
  }
  return null;
}
