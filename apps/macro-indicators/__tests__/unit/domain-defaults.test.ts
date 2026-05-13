/**
 * Unit tests — domain/defaults
 *
 * RED gate: verifies that DEFAULT_SYMBOLS and DEFAULT_CNBC_SYMBOLS are
 * exported from the domain layer, not only from infrastructure.
 * DDD rule: application layer must not import from infrastructure.
 */

import { describe, it, expect } from 'bun:test';

describe('domain defaults (DDD layer compliance)', () => {
  it('exports DEFAULT_SYMBOLS from domain layer', async () => {
    // This import must resolve — if domain/defaults.ts does not exist, test FAILS (RED)
    const { DEFAULT_SYMBOLS } = await import('../../src/domain/defaults.js');
    expect(Array.isArray(DEFAULT_SYMBOLS)).toBe(true);
    expect(DEFAULT_SYMBOLS.length).toBeGreaterThan(0);
  });

  it('exports DEFAULT_CNBC_SYMBOLS from domain layer', async () => {
    const { DEFAULT_CNBC_SYMBOLS } = await import('../../src/domain/defaults.js');
    expect(Array.isArray(DEFAULT_CNBC_SYMBOLS)).toBe(true);
    expect(DEFAULT_CNBC_SYMBOLS.length).toBeGreaterThan(0);
  });

  it('DEFAULT_SYMBOLS includes key FX and index symbols', async () => {
    const { DEFAULT_SYMBOLS } = await import('../../src/domain/defaults.js');
    expect(DEFAULT_SYMBOLS).toContain('EURUSD=X');
    expect(DEFAULT_SYMBOLS).toContain('USDVND=X');
    expect(DEFAULT_SYMBOLS).toContain('^GSPC');
    expect(DEFAULT_SYMBOLS).toContain('^N225');
    expect(DEFAULT_SYMBOLS).toContain('^HSI');
  });

  it('DEFAULT_CNBC_SYMBOLS includes major global indices (dotted symbols)', async () => {
    const { DEFAULT_CNBC_SYMBOLS } = await import('../../src/domain/defaults.js');
    // 2026-05-13: symbol fix — CNBC quote API returns price only for dot-prefixed symbols.
    // Legacy SP500/DJ30/NASDAQ return code=1 with no data and are excluded.
    expect(DEFAULT_CNBC_SYMBOLS).toContain('.SPX');
    expect(DEFAULT_CNBC_SYMBOLS).toContain('.DJI');
    expect(DEFAULT_CNBC_SYMBOLS).toContain('.IXIC');
    expect(DEFAULT_CNBC_SYMBOLS).toContain('.N225');
  });
});
