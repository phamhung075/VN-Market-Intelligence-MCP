/**
 * Unit tests for ngu-hanh-classifier primitive
 *
 * Covers: generation relationship, destruction relationship, same element,
 * unknown input, score range, and all four NguHanhDynamic values.
 */

import { describe, it, expect } from 'bun:test';
import { classifyNguHanh } from './index.js';

describe('ngu-hanh-classifier', () => {
  // AC-2 test 1: Generation relationship (lower generates upper)
  it('returns TUONG_SINH (score 0.3) when lower generates upper: Thuy → Moc', () => {
    // GENERATION: Thuy → Moc
    const result = classifyNguHanh('Thuy', 'Moc');
    expect(result.dynamic).toBe('TUONG_SINH');
    expect(result.score).toBe(0.3);
    expect(result.lower).toBe('Thuy');
    expect(result.upper).toBe('Moc');
    expect(typeof result.interpretation).toBe('string');
  });

  // AC-2 test 2: Generation relationship reversed (upper generates lower)
  it('returns TUONG_SINH (score 0.2) when upper generates lower: Moc lower, Thuy upper', () => {
    // GENERATION: Thuy → Moc, so upper=Thuy generates lower=Moc
    const result = classifyNguHanh('Moc', 'Thuy');
    expect(result.dynamic).toBe('TUONG_SINH');
    expect(result.score).toBe(0.2);
  });

  // AC-2 test 3: Destruction relationship — lower destroys upper
  it('returns TUONG_KHAC (score -0.3) when lower destroys upper: Moc → Tho', () => {
    // DESTRUCTION: Moc → Tho
    const result = classifyNguHanh('Moc', 'Tho');
    expect(result.dynamic).toBe('TUONG_KHAC');
    expect(result.score).toBe(-0.3);
    expect(result.lower).toBe('Moc');
    expect(result.upper).toBe('Tho');
  });

  // AC-2 test 4: Destruction relationship — upper destroys lower
  it('returns TUONG_KHAC (score -0.3) when upper destroys lower: Tho lower, Moc upper', () => {
    // DESTRUCTION: Moc → Tho, so upper=Moc destroys lower=Tho
    const result = classifyNguHanh('Tho', 'Moc');
    expect(result.dynamic).toBe('TUONG_KHAC');
    expect(result.score).toBe(-0.3);
  });

  // AC-2 test 5: Same element → SAME
  it('returns SAME (score 0.1) when both elements are identical: Kim + Kim', () => {
    const result = classifyNguHanh('Kim', 'Kim');
    expect(result.dynamic).toBe('SAME');
    expect(result.score).toBe(0.1);
    expect(result.lower).toBe('Kim');
    expect(result.upper).toBe('Kim');
  });

  // AC-2 test 6: Unknown element → NEUTRAL (documented choice: no throw)
  it('returns NEUTRAL (score 0.0) for unknown lower element — no throw', () => {
    const result = classifyNguHanh('UnknownElement', 'Moc');
    expect(result.dynamic).toBe('NEUTRAL');
    expect(result.score).toBe(0.0);
    // Must not throw
  });

  // AC-2 test 7: Unknown upper element → NEUTRAL
  it('returns NEUTRAL (score 0.0) for unknown upper element — no throw', () => {
    const result = classifyNguHanh('Kim', 'SomeGarbage');
    expect(result.dynamic).toBe('NEUTRAL');
    expect(result.score).toBe(0.0);
  });

  // AC-2 test 8: Score range — score is always a finite number (no NaN, no undefined)
  it('score is always a finite number for all valid element pairs', () => {
    const elements = ['Kim', 'Moc', 'Thuy', 'Hoa', 'Tho'] as const;
    for (const lower of elements) {
      for (const upper of elements) {
        const result = classifyNguHanh(lower, upper);
        expect(typeof result.score).toBe('number');
        expect(Number.isFinite(result.score)).toBe(true);
        expect(Number.isNaN(result.score)).toBe(false);
      }
    }
  });

  // AC-2 test 9: NEUTRAL for elements that neither generate nor destroy each other
  it('returns NEUTRAL (score 0.0) for non-generating, non-destroying pair: Kim + Hoa', () => {
    // Kim does not generate Hoa (Kim→Thuy), Kim does not destroy Hoa (Kim→Moc)
    // Hoa does not generate Kim (Hoa→Tho), Hoa does not destroy Kim (Hoa→Kim actually does!)
    // Actually: DESTRUCTION Hoa→Kim, so Hoa destroys Kim.
    // So Hoa upper destroys Kim lower → TUONG_KHAC
    // Let's use Kim lower + Hoa upper: DESTRUCTION[Hoa] = Kim, so Hoa destroys Kim → TUONG_KHAC
    // That's already covered by test 4. Let's use Moc + Kim instead.
    // GENERATION: Moc→Hoa (not Kim), DESTRUCTION: Moc→Tho (not Kim)
    // GENERATION[Kim] = Thuy (not Moc), DESTRUCTION[Kim] = Moc → so Kim destroys Moc
    // So classifyNguHanh('Moc', 'Kim'): DESTRUCTION[Kim]=Moc, upper=Kim destroys lower=Moc → TUONG_KHAC
    // Use Hoa + Moc: GENERATION[Hoa]=Tho (not Moc), GENERATION[Moc]=Hoa (not Hoa... wait Moc→Hoa)
    // classifyNguHanh('Hoa', 'Moc'): GENERATION[Hoa]=Tho≠Moc, GENERATION[Moc]=Hoa=lower → TUONG_SINH score 0.2
    // Use Thuy + Kim: GENERATION[Thuy]=Moc≠Kim, GENERATION[Kim]=Thuy=lower → TUONG_SINH score 0.2
    // Use Hoa + Thuy: GENERATION[Hoa]=Tho≠Thuy, GENERATION[Thuy]=Moc≠Hoa
    //                 DESTRUCTION[Hoa]=Kim≠Thuy, DESTRUCTION[Thuy]=Hoa=lower → TUONG_KHAC score -0.3
    // Use Kim + Hoa: GENERATION[Kim]=Thuy≠Hoa, GENERATION[Hoa]=Tho≠Kim
    //               DESTRUCTION[Kim]=Moc≠Hoa, DESTRUCTION[Hoa]=Kim=lower → TUONG_KHAC score -0.3
    // Truly neutral: none in the standard 5-element system — all pairs relate.
    // We'll test NEUTRAL via empty string or invalid input instead.
    const result = classifyNguHanh('', '');
    expect(result.dynamic).toBe('NEUTRAL');
    expect(result.score).toBe(0.0);
  });

  // AC-2 test 10: interpretation is always a non-empty string
  it('interpretation is always a non-empty string for valid inputs', () => {
    const result = classifyNguHanh('Kim', 'Thuy');
    expect(typeof result.interpretation).toBe('string');
    expect(result.interpretation.length).toBeGreaterThan(0);
  });

  // Full generation cycle verification
  it('covers full GENERATION cycle: Moc→Hoa, Hoa→Tho, Tho→Kim, Kim→Thuy, Thuy→Moc', () => {
    const cycle: Array<[string, string]> = [
      ['Moc', 'Hoa'], ['Hoa', 'Tho'], ['Tho', 'Kim'], ['Kim', 'Thuy'], ['Thuy', 'Moc'],
    ];
    for (const [lower, upper] of cycle) {
      const result = classifyNguHanh(lower, upper);
      expect(result.dynamic).toBe('TUONG_SINH');
      expect(result.score).toBe(0.3);
    }
  });

  // Full destruction cycle verification
  it('covers full DESTRUCTION cycle: Moc→Tho, Tho→Thuy, Thuy→Hoa, Hoa→Kim, Kim→Moc', () => {
    const cycle: Array<[string, string]> = [
      ['Moc', 'Tho'], ['Tho', 'Thuy'], ['Thuy', 'Hoa'], ['Hoa', 'Kim'], ['Kim', 'Moc'],
    ];
    for (const [lower, upper] of cycle) {
      const result = classifyNguHanh(lower, upper);
      expect(result.dynamic).toBe('TUONG_KHAC');
      expect(result.score).toBe(-0.3);
    }
  });
});
