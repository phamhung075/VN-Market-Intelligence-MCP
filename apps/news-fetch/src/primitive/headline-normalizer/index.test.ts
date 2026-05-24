/**
 * Unit tests — headline-normalizer primitive
 *
 * RED phase: written before implementation.
 */

import { describe, it, expect } from 'bun:test';
import { normalizeHeadline } from './index.js';

describe('normalizeHeadline', () => {
  it('strips trailing source attribution suffix (- Bloomberg)', () => {
    const result = normalizeHeadline('Fed raises interest rates for third time this year - Bloomberg');
    expect(result).toBe('Fed raises interest rates for third time this year');
  });

  it('strips trailing source attribution suffix (- Reuters)', () => {
    const result = normalizeHeadline('Vietnam GDP expands at record pace - Reuters');
    expect(result).toBe('Vietnam GDP expands at record pace');
  });

  it('collapses multiple internal whitespace', () => {
    const result = normalizeHeadline('  Vietnam  GDP  grows  6.8%  in  Q1  ');
    expect(result).toBe('Vietnam GDP grows 6.8% in Q1');
  });

  it('returns empty string unchanged (no-op on empty)', () => {
    const result = normalizeHeadline('');
    expect(result).toBe('');
  });

  it('trims leading and trailing whitespace', () => {
    const result = normalizeHeadline('  Clean headline  ');
    expect(result).toBe('Clean headline');
  });
});
