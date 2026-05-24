/**
 * Unit tests — published-at-parser primitive
 *
 * RED phase: written before implementation.
 */

import { describe, it, expect } from 'bun:test';
import { parsePublishedAt } from './index.js';

describe('parsePublishedAt', () => {
  it('converts valid RFC 2822 (GMT) to ISO 8601', () => {
    const result = parsePublishedAt('Mon, 13 May 2026 14:30:00 GMT');
    expect(result).toBe('2026-05-13T14:30:00.000Z');
  });

  it('converts RFC 2822 with +0700 timezone offset to UTC ISO 8601', () => {
    const result = parsePublishedAt('Thu, 22 May 2026 07:00:00 +0700');
    expect(result).toBe('2026-05-22T00:00:00.000Z');
  });

  it('returns null for malformed date string', () => {
    const result = parsePublishedAt('not-a-date-string');
    expect(result).toBeNull();
  });

  it('returns null for empty string', () => {
    const result = parsePublishedAt('');
    expect(result).toBeNull();
  });
});
