/**
 * Unit tests — source-dedup-key primitive
 *
 * RED phase: written before implementation.
 */

import { describe, it, expect } from 'bun:test';
import { computeArticleKey } from './index.js';

describe('computeArticleKey', () => {
  it('uses URL-based key when URL is present', () => {
    const result = computeArticleKey({
      url: 'https://bloomberg.com/news/articles/2026-05-24/fed-rates',
      headline: 'Fed raises rates',
      source: 'bloomberg',
    });
    expect(result).toBe('url:bloomberg.com/news/articles/2026-05-24/fed-rates');
  });

  it('uses headline-based key when URL is null', () => {
    const result = computeArticleKey({
      url: null,
      headline: 'Vietnam GDP grows 6.8%',
      source: 'reuters',
    });
    expect(result).toBe('headline:reuters:vietnam gdp grows 6.8%');
  });

  it('returns fallback key for null URL and empty headline', () => {
    const result = computeArticleKey({
      url: null,
      headline: '',
      source: 'reuters',
    });
    expect(result).toBe('fallback:reuters:empty');
  });

  it('uses headline-based key when URL is empty string', () => {
    const result = computeArticleKey({
      url: '',
      headline: 'Some headline',
      source: 'bloomberg',
    });
    expect(result).toBe('headline:bloomberg:some headline');
  });
});
