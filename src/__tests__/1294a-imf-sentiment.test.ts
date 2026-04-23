/**
 * Task 1294a: IMF Context Sentiment Detection
 *
 * RED tests only — GREEN implementation in imfSentimentClassifier.ts
 * Run: bun test 1294a-imf-sentiment.test.ts
 */

import { describe, test, expect } from 'bun:test';
import { classifyImfSentiment } from '../domain/services/imfSentimentClassifier';

describe('1294a: IMF Sentiment Classifier', () => {

  test('RED 1: IMF staff report → policy_adjustment (+0.3..+0.7, confidence >0.7)', () => {
    const headline = 'IMF Staff Report on Vietnam Macro Stability 2026';
    const summary = 'Fund staff assess ongoing policy support measures for economic growth and inflation control.';
    const result = classifyImfSentiment(headline, summary);

    expect(result).toBeDefined();
    expect(result.classification).toBe('imf_policy_adjustment');
    expect(result.sentiment).toBeGreaterThanOrEqual(0.3);
    expect(result.sentiment).toBeLessThanOrEqual(0.7);
    expect(result.confidence).toBeGreaterThan(0.7);
    expect(result.reason).toContain('staff report');
  });

  test('RED 2: IMF Stand-by Arrangement → crisis_signal (-0.6..-0.3, confidence >0.7)', () => {
    const headline = 'Vietnam Requests IMF Stand-by Arrangement amid Currency Pressure';
    const summary = 'Emergency financing approved. Structural adjustment program required. International Monetary Fund announces $2B facility.';
    const result = classifyImfSentiment(headline, summary);

    expect(result.classification).toBe('imf_crisis_signal');
    expect(result.sentiment).toBeLessThanOrEqual(-0.3);
    expect(result.sentiment).toBeGreaterThanOrEqual(-0.6);
    expect(result.confidence).toBeGreaterThan(0.7);
    expect(result.reason).toContain('Arrangement');
  });

  test('RED 3: IMF economist note (no program) → imf_neutral (0.0..+0.3)', () => {
    const headline = 'IMF Economist: Vietnam Growth Outlook Stable';
    const summary = 'Latest analysis shows balanced risks. No new policy recommendations at this time.';
    const result = classifyImfSentiment(headline, summary);

    expect(result.classification).toBe('imf_neutral');
    expect(result.sentiment).toBeGreaterThanOrEqual(0.0);
    expect(result.sentiment).toBeLessThanOrEqual(0.3);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  test('RED 4: Non-IMF macro news → non_imf (sentiment = 0.0)', () => {
    const headline = 'World Bank Report: Vietnam Resilient to Global Slowdown';
    const summary = 'Development outlook remains positive. ADB also confirms growth trajectory.';
    const result = classifyImfSentiment(headline, summary);

    expect(result.classification).toBe('non_imf');
    expect(result.sentiment).toBe(0.0);
    expect(result.confidence).toBeGreaterThan(0.5); // High confidence: definitely non-IMF
  });

  test('RED 5: Vietnamese IMF name → case-insensitive match', () => {
    const headline = 'Quỹ Tiền Tệ Quốc Tế hỗ trợ Việt Nam phục hồi';
    const summary = 'Quỹ Tiền Tệ Quốc Tế công bố chương trình hỗ trợ chính sách mới nhằm ổn định tỷ giá.';
    const result = classifyImfSentiment(headline, summary);

    expect(result.classification).toBe('imf_policy_adjustment');
    expect(result.sentiment).toBeGreaterThanOrEqual(0.3);
    expect(result.sentiment).toBeLessThanOrEqual(0.7);
  });
});
