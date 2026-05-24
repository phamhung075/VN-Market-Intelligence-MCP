/**
 * Unit tests — article-relevance-filter primitive
 *
 * RED phase: written before implementation.
 */

import { describe, it, expect } from 'bun:test';
import { isRelevantArticle } from './index.js';

describe('isRelevantArticle', () => {
  it('returns true when headline contains a keyword', () => {
    const result = isRelevantArticle(
      'Vietnam central bank holds interest rate steady',
      ['Vietnam', 'VN', 'HOSE'],
    );
    expect(result).toBe(true);
  });

  it('returns true for case-insensitive match (uppercase headline vs lowercase keyword)', () => {
    const result = isRelevantArticle(
      'VIETNAM GDP SURGES IN Q1 2026',
      ['vietnam', 'vn'],
    );
    expect(result).toBe(true);
  });

  it('returns false when no keyword matches', () => {
    const result = isRelevantArticle(
      'US treasury yields climb on strong jobs data',
      ['Vietnam', 'VN', 'HOSE', 'HNX'],
    );
    expect(result).toBe(false);
  });

  it('returns false when keywords array is empty', () => {
    const result = isRelevantArticle('Vietnam GDP grows', []);
    expect(result).toBe(false);
  });

  it('returns true for partial keyword match within word (VN in VNINDEX)', () => {
    const result = isRelevantArticle('VNINDEX surges 3%', ['VN']);
    expect(result).toBe(true);
  });
});
