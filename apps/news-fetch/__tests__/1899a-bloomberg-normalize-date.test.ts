/**
 * Unit tests — BloombergStealth: normalizeDate pure function (1899a-bloomberg)
 *
 * No Playwright mock needed — normalizeDate is a pure utility function.
 *
 * Coverage:
 *   - ISO 8601 string → UTC ISO output
 *   - null input → null
 *   - undefined input → null
 *   - empty string → null
 *   - non-date string → null
 *   - result ends in Z (UTC normalised)
 *   - +07:00 offset correctly converted to UTC
 */

import { describe, it, expect } from 'bun:test';

const { normalizeDate } = await import(
  '../src/infrastructure/scrapers/bloomberg-stealth.js'
);

describe('normalizeDate', () => {
  it('converts ISO 8601 string to UTC ISO', () => {
    expect(normalizeDate('2026-05-13T14:30:00Z')).toBe('2026-05-13T14:30:00.000Z');
  });

  it('returns null for null input', () => {
    expect(normalizeDate(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(normalizeDate(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(normalizeDate('')).toBeNull();
  });

  it('returns null for non-date string', () => {
    expect(normalizeDate('not-a-date')).toBeNull();
  });

  it('result always ends in Z (UTC normalised)', () => {
    const result = normalizeDate('2026-05-13T09:00:00+07:00');
    expect(result).toMatch(/Z$/);
  });

  it('correctly converts +07:00 offset to UTC', () => {
    expect(normalizeDate('2026-05-13T09:00:00+07:00')).toBe('2026-05-13T02:00:00.000Z');
  });
});
