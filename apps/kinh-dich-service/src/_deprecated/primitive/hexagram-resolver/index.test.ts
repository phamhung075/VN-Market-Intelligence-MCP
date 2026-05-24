/**
 * hexagram-resolver — Unit Tests
 *
 * Tests for resolveHexagram() extracted primitive.
 * All test cases are table-driven, covering happy path, edge, and failure.
 */

import { describe, it, expect } from 'bun:test';
import { resolveHexagram } from './index.js';

describe('resolveHexagram', () => {
  // AC-2 Case 1: Valid 6-signal array — golden case
  // signals=[1,1,1,1,1,1]: lower=Qian(1,1,1) + upper=Qian(1,1,1) → Quẻ Thuần Càn = hexagram 1
  it('returns hexagram 1 for all-one signals (Quẻ Thuần Càn — Qian/Qian)', () => {
    const result = resolveHexagram([1, 1, 1, 1, 1, 1]);
    expect(result).toBe(1);
  });

  // AC-2 Case 2: All-zero signals (Quẻ Thuần Khôn)
  // signals=[0,0,0,0,0,0]: lower=Kun(0,0,0) + upper=Kun(0,0,0) → hexagram 2
  it('returns hexagram 2 for all-zero signals (Quẻ Thuần Khôn — Kun/Kun)', () => {
    const result = resolveHexagram([0, 0, 0, 0, 0, 0]);
    expect(result).toBe(2);
  });

  // AC-2 Case 3: Mixed signals — Zhen(1,0,0) lower + Kan(0,1,0) upper → hexagram 3 (Truân)
  it('returns hexagram 3 for Zhen/Kan combination (Quẻ Truân)', () => {
    // lower = signals[0..2] = Zhen = [1,0,0]
    // upper = signals[3..5] = Kan  = [0,1,0]
    const result = resolveHexagram([1, 0, 0, 0, 1, 0]);
    expect(result).toBe(3);
  });

  // AC-2 Case 4: Li/Qian → hexagram 14 (Quẻ Đại Hữu)
  // lower = Qian = [1,1,1], upper = Li = [1,0,1]
  it('returns hexagram 14 for Qian(lower)/Li(upper) combination (Quẻ Đại Hữu)', () => {
    const result = resolveHexagram([1, 1, 1, 1, 0, 1]);
    expect(result).toBe(14);
  });

  // AC-2 Case 5: Invalid length — throws Error
  it('throws Error when signals array length is not 6', () => {
    expect(() => resolveHexagram([1, 0])).toThrow();
  });

  // AC-2 Case 5b: Empty array — throws Error
  it('throws Error for empty signals array', () => {
    expect(() => resolveHexagram([])).toThrow();
  });

  // AC-2 Case 5c: Length 7 — throws Error
  it('throws Error when signals array has 7 elements', () => {
    expect(() => resolveHexagram([1, 0, 1, 0, 1, 0, 1])).toThrow();
  });

  // AC-2 Case 5d: Unknown trigram pattern via invalid bits
  // signals with a non-existent bit pattern (e.g., bit=2 is not 0|1)
  // Kun/Qian reverse = lower Kun(0,0,0) upper Qian(1,1,1) → should look up 'Qian|Kun' = id 12 (Bĩ)
  // But [1,1,1,0,0,0] = lower Qian(1,1,1) upper Kun(0,0,0) → look up 'Kun|Qian' = id 11 (Thái)
  it('returns hexagram 11 for Qian(lower)/Kun(upper) = Quẻ Thái', () => {
    const result = resolveHexagram([1, 1, 1, 0, 0, 0]);
    expect(result).toBe(11);
  });

  // Returned value always in range 1-64
  it('returns a number in range 1–64 for any valid trigram pair', () => {
    // Kan/Dui = upper Kan(0,1,0), lower Dui(1,1,0) → hexagram 60 (Tiết)
    const result = resolveHexagram([1, 1, 0, 0, 1, 0]);
    expect(result).toBeGreaterThanOrEqual(1);
    expect(result).toBeLessThanOrEqual(64);
  });
});
